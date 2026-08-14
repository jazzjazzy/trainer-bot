import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 15,
  slug: "cdn-edge-caching",
  title: "CDNs & Edge Cache Invalidation",
  part: "Reverse Proxies & the Edge",
  estMinutes: 13,
  summary:
    "Push the cache all the way to the edge: how Fastly, Cloudflare and Akamai carry Drupal's cache tags in a purge-key header, what the contrib modules wire up for you, why hundreds of tags force hashing, and what must never be stored at a CDN.",

  concept: `
## A CDN is Varnish you rent — with an API instead of a VCL file

Everything you learned about the reverse proxy still applies: an object store
keyed by URL plus \`Vary\`, filled on a miss, emptied on a purge. Two things
change. You no longer own the config file, so behaviour is set through a vendor
dashboard or API; and the purge call now crosses the internet, so it goes
through a queue rather than a synchronous socket write.

The good news is that all three big vendors implement the same idea as Drupal's
cache tags — a set of arbitrary keys attached to each cached object, any one of
which can invalidate it. Only the header name and separator differ:

- **Fastly** — \`Surrogate-Key: key1 key2 key3\` (space separated). The closest
  match to Drupal's model, and it supports *soft purge*, which marks objects
  stale rather than deleting them so \`stale-while-revalidate\` can keep serving.
- **Cloudflare** — \`Cache-Tag: key1,key2\` (comma separated). Since April 2025
  purge-by-tag is available on every plan, not just Enterprise.
- **Akamai** — \`Edge-Cache-Tag: key1,key2\`, purged through the Fast Purge
  (CCU v3) API.

### The contrib modules that wire it up

The \`fastly\` module registers a \`kernel.response\` subscriber
(\`fastly.cache_tags.surrogate_key_generator\`) that reads the response's
cacheable metadata and writes \`Surrogate-Key\`, plus a
\`fastly.cache_tags.invalidator\` service tagged \`cache_tags_invalidator\` so
core's \`Cache::invalidateTags()\` reaches the API. Its \`fastlypurger\`
sub-module instead plugs into **purge**, giving you a queue, a cron or Drush
processor, and diagnostics. \`cloudflare\` ships \`cloudflarepurger\` the same way;
\`akamai\` exposes an \`edge_cache_tag_header\` setting.

Note the completely unrelated \`cdn\` module: it does *not* put your site behind a
CDN. It rewrites file URLs for CSS, JS, images and fonts to a pull-zone domain
and adds far-future \`Cache-Control: immutable\` headers. Both are worth having;
they solve different halves of the problem.

### Hundreds of tags, one header

A view listing 400 incidents bubbles 400 \`node:N\` tags into the response. That
header gets big, and edges cap it — Cloudflare's \`Cache-Tag\` may not exceed
16 KB, roughly a thousand tags. The universal mitigation is to **hash** each tag
to a few characters. The Fastly module does
\`substr(base64_encode(md5($site_id . ':' . $tag, TRUE)), 0, $length)\` with
\`cache_tag_hash_length\` defaulting to 4 (about 16.7 million distinct keys),
overridable per environment via \`FASTLY_CACHE_TAG_HASH_LENGTH\`. Hashing is
lossy: two tags that collide can never be purged independently again, so a
too-short key silently over-purges. Before hashing harder, **exclude** the tags
that are worthless at the edge — \`cloudflarepurger.settings\` has a
\`cache_tag_excludelist\`, Akamai an equivalent blacklist. Dropping \`rendered\`,
\`http_response\` and per-block config tags removes noise without losing precision.

### What must never reach the edge

Authenticated HTML, full stop. Also anything carrying \`Set-Cookie\`, and any
response Drupal marked \`private\`. Forms are subtler: Drupal only issues a CSRF
token to authenticated users, and even then it is a placeholder rendered by a
lazy builder with the \`session\` context and \`max-age: 0\`, so an anonymous form
is genuinely edge-safe. The way sites break this is a CDN rule that ignores
cookies and caches "everything HTML" for speed. Finally, mind the **cache key**:
strip tracking parameters like \`utm_*\` so they do not shard your cache, but
never strip an argument Drupal actually varies on — the \`url.query_args\`
contexts on the page tell you exactly which ones matter.
`,

  comparisons: [
    {
      label: "Wiring tag-based purging to a CDN",
      intro:
        "Same architecture on both sides: credentials for the vendor API, a header name for the tags, and a size ceiling. Symfony gets it from FOSHttpCacheBundle; Drupal gets it from the fastly module plus purge.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/fos_http_cache.yaml
fos_http_cache:
    proxy_client:
        fastly:
            service_identifier: '%env(FASTLY_SERVICE_ID)%'
            authentication_token: '%env(FASTLY_API_TOKEN)%'
            soft_purge: true          # expire, don't delete
    tags:
        enabled: true
        response_header: Surrogate-Key
        max_header_value_length: 4096 # splits into repeated headers past this
        rules:
            - match: { path: ^/incidents }
              tags: [incident-list]

# You still author the tags yourself, per route or per controller:
#   $this->cacheManager->invalidateTags(['incident-42']);`,
      ts: `# Drupal: composer require drupal/fastly drupal/purge
# drush en fastly fastlypurger purge_queuer_coretags purge_processor_cron

# fastly.settings — env vars win over config, so credentials stay out of git.
# Each one shadows a different config key (Api.php, CacheTagsHash.php):
#   FASTLY_API_TOKEN             -> api_key
#   FASTLY_API_SERVICE           -> service_id  (the service, NOT FASTLY_SITE_ID)
#   FASTLY_SITE_ID               -> site_id     (hash namespace only)
#   FASTLY_CACHE_TAG_HASH_LENGTH -> cache_tag_hash_length
service_id: 7Fx4qN0pQ2wV6cRb
purge_method: soft            # 'instant' | 'soft'
cache_tag_hash_length: 4      # 64^4 ~= 16.7M distinct keys
purge_logging: false          # noisy in production
stale_while_revalidate: true
stale_while_revalidate_value: 604800

# No per-route rules needed: every tag Drupal already bubbles
# (node:42, node_list, config:system.site) becomes a purge key.`,
      note: "The big difference is authorship. In Symfony you decide which tags a response carries; in Drupal the render pipeline has already computed them, so the module just serialises what is there.",
    },
    {
      label: "Writing the tag header on kernel.response",
      intro:
        "Both stacks add the header in a response listener. Look at what Drupal's version does that a hand-rolled Symfony listener usually forgets: it hashes and it namespaces.",
      php: `// Symfony: what you write when you are not using FOSHttpCacheBundle.
final class SurrogateKeyListener implements EventSubscriberInterface
{
    public function __construct(private TagCollector $tags) {}

    public function onResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $tags = $this->tags->all();   // your own bookkeeping
        if ($tags === []) {
            return;
        }
        // Fastly: space separated. Cloudflare: commas. Akamai: commas.
        $event->getResponse()->headers->set(
            'Surrogate-Key',
            implode(' ', $tags)
        );
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => 'onResponse'];
    }
}`,
      ts: `// Drupal: \\Drupal\\fastly\\EventSubscriber\\SurrogateKeyGenerator (abridged).
public function onRespond(ResponseEvent $event) {
  if (!$event->isMainRequest()) {
    return;
  }
  $response = $event->getResponse();
  if (method_exists($response, 'getCacheableMetadata')) {
    $cache_tags = $response->getCacheableMetadata()->getCacheTags();

    // Hash every tag so the header cannot blow past the edge's limit.
    $hashes = $this->cacheTagsHash->cacheTagsToHashes($cache_tags);

    // Plus one key for the whole site, so "purge everything" is one call
    // and two Drupal sites on one Fastly service never purge each other.
    $hashes[] = $this->cacheTagsHash->hashInput(
      $this->cacheTagsHash->getSiteId()
    );

    $response->headers->set('Surrogate-Key', implode(' ', $hashes));
  }
}

// CacheTagsHash::hashInput() — the whole trick, four characters wide:
//   substr(base64_encode(md5($site_id . ':' . $tag, TRUE)), 0, $length)`,
      note: "cloudflarepurger does the same thing with `substr(base_convert(md5($tag), 16, 36), 0, 4)` and commas — a smaller keyspace and no site prefix, so shared zones need a longer key or an excludelist.",
    },
    {
      label: "Keeping the private stuff out of the edge",
      intro:
        "The rule is identical in both worlds — never store a personalised response in a shared cache — but Drupal gives you a per-fragment answer rather than a per-response one.",
      php: `// Symfony: the controller decides, response by response.
public function dashboard(): Response
{
    $response = $this->render('account/dashboard.html.twig');
    $response->setPrivate();
    $response->headers->set('Cache-Control', 'private, no-store');

    return $response;
}

// For a mostly-public page with a personalised corner, FOSHttpCache's
// answer is the user context hash: the proxy makes a side request to
// /_fos_user_context_hash, then varies the cached object on the result.
// fos_http_cache:
//     user_context:
//         hash_header: X-User-Context-Hash
//         user_identifier_headers: [Cookie, Authorization]`,
      ts: `// Drupal: page_cache already refuses anything with an open session, and
// page_cache's PageCache middleware downgrades the response to 'private' when
// the request carries a session cookie and the response has Vary: Cookie.
// Your job is to make sure the *personalised fragment* does not poison the
// rest of the page — auto-placeholder it instead.
function newsroom_preprocess_page(&$variables) {
  $variables['welcome'] = [
    '#lazy_builder' => ['newsroom.builder:welcomeBanner', []],
    '#create_placeholder' => TRUE,
  ];
}

// newsroom.builder::welcomeBanner() returns:
//   '#cache' => ['contexts' => ['user'], 'max-age' => 0]
//
// The shell stays public and edge-cacheable; only the placeholder is
// resolved per user (by Dynamic Page Cache, or streamed by BigPipe).

// Then belt-and-braces at the CDN: never cache a response with Set-Cookie,
// never cache when the SESS*/SSESS* cookie is present, and honour 'private'.`,
      note: "Anonymous forms are edge-safe: Drupal issues a CSRF token only to authenticated users, and even that is a lazy-builder placeholder with the `session` context and max-age 0.",
    },
    {
      label: "Serving static assets from a pull zone",
      intro:
        "This is the other, simpler half of 'use a CDN' — rewriting asset URLs — and it is a straight swap for Symfony's asset packages.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/framework.yaml
framework:
    assets:
        base_urls:
            - 'https://cdn-a.example.net'
            - 'https://cdn-b.example.net'
        version_strategy: 'webpack_encore.entrypoint_lookup_collection'

# Templates then emit the CDN host automatically:
#   {{ asset('build/app.css') }}
#   => https://cdn-a.example.net/build/app.css?v=8f2c1a

# Long TTL is safe because Encore fingerprints the filename.`,
      ts: `# Drupal: composer require drupal/cdn — cdn.settings
status: true
scheme: '//'
mapping:
  type: complex
  fallback_domain: cdn-c.example.net
  domains:
    -
      type: simple
      domain: cdn-a.example.net
      conditions:
        extensions: [css, js]
    -
      type: auto-balanced
      domains: [cdn-b.example.net, cdn-d.example.net]
      conditions:
        extensions: [jpg, jpeg, png, webp, woff2]
farfuture:
  status: true          # Cache-Control: max-age=31536000, immutable
stream_wrappers:
  - public

# Config only the UI sub-module renders; keep it in config/sync.`,
      note: "The cdn module handles files, not pages — it never touches HTML, and deliberately stops CDNs serving your HTML or REST responses. It is orthogonal to Fastly/Cloudflare page caching.",
    },
  ],

  playground: {
    intro:
      "The header-size problem, made concrete. This models exactly what the Fastly module does to turn a page's cache tags into a Surrogate-Key header, and shows the price of a short hash: collisions that over-purge.",
    lang: "php",
    code: `<?php
// How an edge purger turns Drupal cache tags into a Surrogate-Key header.
// Mirrors \\Drupal\\fastly\\CacheTagsHash::hashInput():
//   substr(base64_encode(md5($site_id . ':' . $tag, TRUE)), 0, $length)

const SITE_ID = 'newsroom';

function hash_tag(string $tag, int $length): string {
  return substr(base64_encode(md5(SITE_ID . ':' . $tag, TRUE)), 0, $length);
}

function header_bytes(array $tags, ?int $length): int {
  if ($length === NULL) {
    return strlen(implode(' ', $tags));
  }
  return strlen(implode(' ', array_map(fn($t) => hash_tag($t, $length), $tags)));
}

// A single article page: a handful of tags.
$article = [
  'config:system.site',
  'config:user.role.anonymous',
  'config:block.block.olivero_breadcrumbs',
  'node:42',
  'node_view',
  'user:7',
  'taxonomy_term:12',
  'block_view',
  'http_response',
  'rendered',
];

// The incident index: one view listing 400 nodes, each row bubbling its own tag.
$index = $article;
for ($i = 1; $i <= 400; $i++) {
  $index[] = 'node:' . $i;
}
$index = array_values(array_unique($index));

echo "-- Surrogate-Key header size\\n";
foreach (['article page' => $article, 'incident index' => $index] as $label => $tags) {
  printf(
    "%-15s tags=%3d  raw=%6d B  hash4=%5d B  hash8=%5d B\\n",
    $label,
    count($tags),
    header_bytes($tags, NULL),
    header_bytes($tags, 4),
    header_bytes($tags, 8)
  );
}

// Shorter keys are cheaper but collide: 64^2 = 4096 possible two-char keys.
echo "\\n-- Collisions at hash length 2 (64^2 = 4096 keys)\\n";
$buckets = [];
foreach ($index as $tag) {
  $buckets[hash_tag($tag, 2)][] = $tag;
}
$clashing = array_filter($buckets, fn($group) => count($group) > 1);
printf("%d tags mapped onto %d distinct keys; %d keys are shared\\n",
  count($index), count($buckets), count($clashing));

$key = array_key_first($clashing);
echo "key '$key' now stands for: " . implode(', ', array_slice($clashing[$key], 0, 4)) . "\\n";
echo "=> purging '$key' evicts every page tagged with any of them.\\n";

// At length 4 the same 409 tags fit in 64^4 = 16.7M keys.
$buckets4 = [];
foreach ($index as $tag) {
  $buckets4[hash_tag($tag, 4)][] = $tag;
}
printf("\\nhash length 4: %d distinct keys for %d tags -> %d collisions\\n",
  count($buckets4), count($index), count($index) - count($buckets4));
`,
    output: `-- Surrogate-Key header size
article page    tags= 10  raw=   160 B  hash4=   49 B  hash8=   89 B
incident index  tags=409  raw=  3644 B  hash4= 2044 B  hash8= 3680 B

-- Collisions at hash length 2 (64^2 = 4096 keys)
409 tags mapped onto 388 distinct keys; 21 keys are shared
key '3c' now stands for: node:1, node:49
=> purging '3c' evicts every page tagged with any of them.

hash length 4: 409 distinct keys for 409 tags -> 0 collisions
`,
  },

  keyPoints: [
    "All three major CDNs implement Drupal's cache-tag idea under a different header: Fastly `Surrogate-Key` (space separated, supports soft purge), Cloudflare `Cache-Tag` (commas, on every plan since April 2025), Akamai `Edge-Cache-Tag` (commas, Fast Purge/CCU v3).",
    "The contrib modules do two jobs — a kernel.response subscriber that serialises the response's cache tags into the header, and either a `cache_tags_invalidator` service or a purge-module purger that calls the vendor API when tags are invalidated.",
    "Header size is the real constraint: Cloudflare caps `Cache-Tag` at 16 KB (~1,000 tags), so modules hash each tag to about four characters — fastly with `cache_tag_hash_length` (default 4, or `FASTLY_CACHE_TAG_HASH_LENGTH`), cloudflarepurger with a 4-char base-36 md5.",
    "Hashing is lossy: colliding tags can no longer be purged independently, so a too-short key over-purges. Trim churny, useless tags first with `cloudflarepurger.settings:cache_tag_excludelist` or Akamai's blacklist rather than shortening the key.",
    "Never let the edge store authenticated HTML, a response with `Set-Cookie`, or anything marked `private`; anonymous forms are safe because Drupal only issues a CSRF token to authenticated users, and then only via a lazy-builder placeholder with the `session` context.",
    "The `cdn` module is a different tool entirely — it rewrites CSS/JS/image URLs to a pull-zone domain and adds far-future `immutable` headers; it never caches HTML.",
  ],

  interview: [
    {
      q: "How would you connect Drupal's cache tags to a CDN's purge API, and what breaks if you get it wrong?",
      a: "Two halves. On the way out, a `kernel.response` subscriber serialises the response's cacheable metadata into the vendor's key header — `Surrogate-Key` for Fastly, `Cache-Tag` for Cloudflare, `Edge-Cache-Tag` for Akamai — so each edge object remembers what it depends on. On the way back, either a service tagged `cache_tags_invalidator` (the fastly module's approach) or a **purge** purger plugin turns Drupal's `Cache::invalidateTags()` into API calls. The classic failure is doing only the second half: you purge keys the edge never stored, so nothing is evicted and editors see stale articles. The second classic failure is doing it synchronously in the request that saved the node — use purge's queue and a cron or Drush processor so a slow vendor API never blocks an editor's save.",
    },
    {
      q: "A listing page carries 800 cache tags and the CDN starts rejecting or truncating the header. What do you do?",
      a: "First understand the ceiling: Cloudflare's `Cache-Tag` header is limited to 16 KB, roughly a thousand tags, and other vendors have similar caps. The standard mitigation is hashing — the fastly module reduces each tag to `substr(base64_encode(md5($site_id . ':' . $tag, TRUE)), 0, 4)`, which is four bytes per tag instead of eight or more, and `cache_tag_hash_length` lets you trade size for collision risk. But I would attack the tag count before the tag size: exclude tags that are useless at the edge (`rendered`, `http_response`, per-block config tags) with `cloudflarepurger.settings:cache_tag_excludelist`, and question why a view is bubbling 800 individual node tags when a `node_list:incident` list tag would do. Shortening the hash is the last resort, because two colliding tags can never be purged independently again.",
    },
    {
      q: "Which responses must never be edge-cached on a Drupal site, and how does Drupal help you enforce that?",
      a: "Anything personalised: authenticated HTML, responses carrying `Set-Cookie`, and anything Drupal already marked `private`. Core does most of the enforcement itself — the internal page cache refuses any request with an open session, and page_cache's `PageCache` middleware downgrades the response to `private` when the request carries a session cookie and the response has `Vary: Cookie` — so the danger is almost always a CDN rule that ignores cookies and caches all HTML. Forms are the question interviewers like: Drupal only issues a CSRF token to authenticated users, and it renders it through a lazy-builder placeholder with the `session` cache context and `max-age: 0`, so an anonymous form is genuinely safe to store at the edge. The fix for a mostly-public page with a personalised corner is not to disable edge caching but to auto-placeholder that corner, exactly as Symfony's user-context-hash pattern does.",
    },
    {
      q: "How is this different from what FOSHttpCache gives you in Symfony?",
      a: "The mechanics are the same — FOSHttpCacheBundle has proxy clients for Varnish, Nginx, Symfony's own HttpCache, Cloudflare, CloudFront and Fastly, a `tags.response_header` setting, `max_header_value_length` — which splits the tag header across repeated headers instead of emitting one oversized one — and `soft_purge` for Fastly. The difference is where the tags come from. In Symfony you declare them yourself, per route or per controller, and it is on you to remember every dependency. In Drupal the render pipeline has already bubbled a complete, correct tag set up from every field, block and config object on the page, so the CDN integration is pure plumbing. That is the strongest argument for Drupal's cacheability model in a performance interview: correctness of invalidation is a framework property, not a discipline you have to maintain by hand.",
    },
  ],

  quiz: [
    {
      question:
        "Which header does the Drupal fastly module set so that Fastly can purge by cache tag?",
      options: [
        "`X-Drupal-Cache-Tags`, comma separated",
        "`Surrogate-Key`, space separated, with each tag hashed",
        "`Cache-Tag`, comma separated, with each tag hashed",
        "`Edge-Cache-Tag`, space separated",
      ],
      answerIndex: 1,
      explain:
        "`SurrogateKeyGenerator` subscribes to kernel.response, reads the response's cacheable metadata, hashes every tag via `CacheTagsHash` and joins them with spaces into `Surrogate-Key`. `Cache-Tag` is Cloudflare's header and `Edge-Cache-Tag` is Akamai's; `X-Drupal-Cache-Tags` is a local debugging header only.",
    },
    {
      question:
        "You shorten `cache_tag_hash_length` from 4 to 2 to keep the header small. What is the consequence?",
      options: [
        "Nothing — the hash is only a transport encoding, purges still resolve to the original tag",
        "Purges become slower because the CDN has to reverse the hash",
        "Two different cache tags can map to the same key, so purging one evicts pages that depend on the other",
        "Drupal refuses to boot because the value is validated against a minimum of 4",
      ],
      answerIndex: 2,
      explain:
        "Hashing is one-way and lossy. Two characters gives 64^2 = 4,096 possible keys, so on a site with hundreds of tags collisions are certain — and a collision means over-purging: you lose edge hits on unrelated pages. The default of 4 gives about 16.7 million keys, which is why the module's own help text warns about collisions.",
    },
    {
      question:
        "Which of these is genuinely safe for a shared edge cache to store on a Drupal 10/11 site?",
      options: [
        "A page rendered for a logged-in editor, as long as you strip Set-Cookie at the edge",
        "An anonymous page containing a search or contact form",
        "Any response, provided the CDN is configured to ignore cookies",
        "A page whose response carries `Cache-Control: private`",
      ],
      answerIndex: 1,
      explain:
        "`FormBuilder::prepareForm()` only adds a CSRF token when the user is authenticated, and even then it is a lazy-builder placeholder rendered with the `session` cache context and `max-age: 0`. An anonymous form therefore has no per-user token in the cached HTML and is edge-safe. Stripping Set-Cookie from an authenticated response does not make it impersonal, and 'ignore cookies' rules are the usual cause of one user seeing another's page.",
    },
    {
      question:
        "What does the contrib `cdn` module actually do?",
      options: [
        "Purges Drupal cache tags from Cloudflare, Fastly or Akamai",
        "Rewrites CSS, JS, image and font URLs to a pull-zone domain and adds far-future immutable headers",
        "Replaces the internal page cache with a CDN-backed shared bin",
        "Adds `s-maxage` to every HTML response",
      ],
      answerIndex: 1,
      explain:
        "The `cdn` module maps file URLs onto one or more CDN domains (mapping types `simple`, `complex` and `auto-balanced`) and offers far-future expiration via `farfuture.status`. It explicitly does not put HTML or REST responses behind a CDN — page-level edge caching and tag purging are the job of the fastly, cloudflare or akamai modules.",
    },
  ],
};

export default lesson;

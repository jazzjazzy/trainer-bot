import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "varnish-and-purge",
  title: "Varnish & the Purge Ecosystem",
  part: "Reverse Proxies & the Edge",
  estMinutes: 13,
  summary:
    "Put Varnish in front of Drupal so anonymous requests never reach PHP, then close the loop with the purge module family so Drupal's cache tags become BAN requests at the edge.",

  concept: `
## The cheapest request is the one PHP never sees

Internal Page Cache is cheap, but it is not free: PHP-FPM still accepts the
request, the autoloader and the service container still boot, \`settings.php\` is
read and the cache backend (the database, by default) is queried. It
short-circuits early — \`PageCache\` is an \`HttpKernelInterface\` decorator in the
middleware stack, so on a hit routing and the controller never run — but you
still pay for a PHP process and a cache lookup on every single request. On the
incident site that is fine at 50 requests/second and hopeless when a story goes
wide. A reverse proxy sits *in front* of PHP entirely: Varnish keeps the
serialised response in RAM and answers in microseconds, with your PHP-FPM pool
completely idle.

Two things have to be true for that to work:

1. **The response must be marked cacheable.** Drupal's
   \`FinishResponseSubscriber\` emits \`Cache-Control: public, max-age=N\` for
   anonymous, cacheable responses, where N is the *Page cache maximum age*
   setting (\`system.performance\`, key \`cache.page.max_age\`). If that is 0,
   Varnish will not store anything. Authenticated responses carry
   \`Cache-Control: private\` (or \`no-cache, must-revalidate\`) and must pass
   straight through.
2. **Drupal must be told it is behind a proxy**, via
   \`\$settings['reverse_proxy']\`, \`\$settings['reverse_proxy_addresses']\` and
   \`\$settings['reverse_proxy_trusted_headers']\` in \`settings.php\` — otherwise
   every visitor's IP is the proxy's IP and \`X-Forwarded-Proto\` is ignored, so
   Drupal generates \`http://\` URLs behind your TLS terminator.

## The hard part is invalidation

A long TTL is only safe if you can *revoke* it. Drupal already knows exactly
what changed — it invalidates \`node:41\`, \`node_list\`, \`config:system.site\` —
but those invalidations land in Drupal's own cache backend. Varnish has never
heard of them. That gap is what the **purge** ecosystem fills, and it is
deliberately split into four pluggable roles:

- **purge** — the framework: an invalidation queue plus plugin types.
- **A queuer**, e.g. \`purge_queuer_coretags\`, which listens to core's cache-tag
  invalidations and pushes them onto purge's queue.
- **A processor**, e.g. \`purge_processor_cron\` (drain on cron),
  \`purge_processor_lateruntime\` (drain at the end of the request), or the drush
  processor that ships with \`purge\` itself
  (\`drush p:processor-add drush_purge_queue_work\`, then \`drush p:queue-work\`
  from a systemd timer).
- **A purger** — the proxy-specific talker. \`varnish_purge\` provides the
  Varnish purger; \`purge_purger_http\` is the generic HTTP one.

## Tag purging beats URL purging

For Varnish to act on a tag, the tag has to be *stored with the object*. That
is what the tags-header submodules do: \`varnish_purge_tags\` adds a
\`Cache-Tags\` response header, \`purge_purger_http_tagsheader\` adds
\`Purge-Cache-Tags\`. Varnish keeps response headers with the cached object, so a
\`ban(obj.http.Cache-Tags ~ "node:41")\` sweeps every cached page that embedded
node 41 — homepage, section page, related-stories block — without you knowing
which URLs those were.

URL purging is the fallback: you tell the proxy to drop \`/incident/41\` and hope
you remembered the listing pages too. It is coarse, lossy and does not survive
a site with cross-referenced content. Use tags.

Watch the header size: a busy landing page can carry hundreds of tags and blow
past the default header limits in Varnish, Apache or nginx — this is a real
production failure mode, not a theoretical one.

## Symfony's version of the same idea

None of this is Drupal-specific thinking. FOSHttpCacheBundle solves exactly
this problem: you tag responses (default header \`X-Cache-Tags\`, or \`xkey\` in
purgekeys mode) and call \`CacheManager::invalidateTags()\`. Drupal's advantage
is that the tags already exist and core already invalidates them — you are
wiring up transport, not inventing a tagging scheme.
`,

  comparisons: [
    {
      label: "Getting tags onto the response",
      intro:
        "Both stacks need the proxy to see which entities a response depends on. Symfony makes you name the tags; Drupal's render system already produced them.",
      php: `<?php
// Symfony + FOSHttpCacheBundle: you author the tags yourself.
use FOS\\HttpCacheBundle\\Configuration\\Tag;
use Symfony\\Component\\HttpFoundation\\Response;

final class IncidentController
{
    #[Route('/incident/{id}', name: 'incident_show')]
    #[Tag(expression: '"incident-" ~ id')]
    public function show(int $id, IncidentRepository $repo): Response
    {
        $response = $this->render('incident/show.html.twig', [
            'incident' => $repo->find($id),
        ]);
        // Shared cache TTL, separate from the browser TTL.
        $response->setSharedMaxAge(3600);
        $response->setMaxAge(60);

        return $response;
    }
}

// config/packages/fos_http_cache.yaml
//   fos_http_cache:
//     tags:
//       response_header: X-Cache-Tags`,
      ts: `<?php
// Drupal: the tags already exist. A controller/block just declares
// cacheability and core bubbles it to the response.
public function build(): array {
  $incident = $this->entityTypeManager
    ->getStorage('node')
    ->load($this->nid);

  $build = [
    '#theme' => 'incident_summary',
    '#incident' => $incident,
  ];
  // Same as any render array you have written before.
  $this->renderer->addCacheableDependency($build, $incident);
  $build['#cache']['tags'][] = 'node_list:incident';

  return $build;
}

// Nothing else to author. Enabling the tags-header submodule turns the
// merged tag list into a response header Varnish will store:
//   drush en varnish_purger varnish_purge_tags  -> Cache-Tags: node:41 ...
//   (project varnish_purge, module varnish_purger - the names differ)
//   drush en purge_purger_http_tagsheader       -> Purge-Cache-Tags: ...`,
      note: "In Symfony tagging is an authoring task you can forget; in Drupal the tags are a by-product of the render system, so the integration work is transport only.",
    },
    {
      label: "Wiring the invalidation pipeline",
      intro:
        "Symfony: one bundle, one service call. Drupal: four small modules, each replaceable — which looks like ceremony until you swap Varnish for Fastly and change exactly one of them.",
      php: `<?php
// Symfony: invalidate explicitly, wherever the write happens.
use FOS\\HttpCacheBundle\\CacheManager;

final class IncidentUpdatedListener
{
    public function __construct(private CacheManager $cacheManager) {}

    public function onIncidentUpdated(IncidentUpdatedEvent $event): void
    {
        $this->cacheManager->invalidateTags([
            'incident-' . $event->getIncident()->getId(),
            'incident-list',
        ]);
        // Flushed at kernel.terminate, or explicitly:
        // $this->cacheManager->flush();
    }
}`,
      ts: `# Drupal: core already calls Cache::invalidateTags() on entity save.
# You only install the pipeline that carries those tags outward.

# 1. framework + admin UI + tokens
# (the drush commands ship inside purge itself now; the old purge_drush
#  submodule is deprecated and hidden as of purge 8.x-3.6)
drush en purge purge_ui purge_tokens

# 2. queuer: subscribes to core's tag invalidations
drush en purge_queuer_coretags

# 3. processor: drains the queue (pick one or both)
drush en purge_processor_cron
drush en purge_processor_lateruntime

# 4. purger: the proxy-specific talker
# NB: the project is varnish_purge, but the module is varnish_purger.
drush en varnish_purger varnish_purge_tags

# then configure the purger at /admin/config/development/performance/purge
drush p:diagnostics          # pdia  - is the pipeline actually healthy?
drush p:queue-stats          # pqs   - how far behind are we?
drush p:queue-work           # pqw   - drain a chunk now
drush p:invalidate tag node:41   # pinv - bypass the queue, purge directly`,
      note: "purge deliberately separates queuer / processor / purger so a Varnish-to-CDN migration swaps the purger plugin and leaves the rest untouched.",
      rightLang: "bash",
    },
    {
      label: "Telling the app it lives behind a proxy",
      intro:
        "Both frameworks refuse to trust X-Forwarded-* headers until you name the proxies — otherwise anyone can spoof their client IP and scheme.",
      php: `# config/packages/framework.yaml
framework:
  # Symfony: trust the proxy so getClientIp() and isSecure() are honest.
  trusted_proxies: '10.0.0.0/8,REMOTE_ADDR'
  trusted_headers:
    - 'x-forwarded-for'
    - 'x-forwarded-host'
    - 'x-forwarded-proto'
    - 'x-forwarded-port'

# Symfony's own HttpCache (the PHP reverse proxy) is a dev/small-site
# stand-in for Varnish; in production you replace it, you do not tune it.`,
      ts: `<?php
// sites/default/settings.php
$settings['reverse_proxy'] = TRUE;
$settings['reverse_proxy_addresses'] = ['10.0.3.7', '10.0.3.8'];
$settings['reverse_proxy_trusted_headers'] =
  \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_FOR |
  \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_HOST |
  \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_PORT |
  \\Symfony\\Component\\HttpFoundation\\Request::HEADER_X_FORWARDED_PROTO;

// Then give Varnish something worth storing. Admin UI:
//   /admin/config/development/performance -> "Page cache maximum age"
// or, in config:
//   drush config:set system.performance cache.page.max_age 86400
// Drupal emits: Cache-Control: public, max-age=86400
// (core does not emit s-maxage; Varnish falls back to max-age).`,
      note: "Drupal's setting is the same Symfony Request::setTrustedProxies() mechanism underneath — it is literally the HttpFoundation constants.",
      leftLang: "yaml",
    },
    {
      label: "The VCL that makes it work",
      intro:
        "A minimal, honest VCL: pass authenticated traffic through untouched, strip analytics cookies for everyone else, and accept BAN requests carrying a tag.",
      php: `vcl 4.1;

backend default { .host = "app"; .port = "8080"; }

acl purgers { "10.0.3.0"/24; }

sub vcl_recv {
  // Generic PHP/Symfony app: FOSHttpCache's recommended BAN handling.
  if (req.method == "BAN") {
    if (!client.ip ~ purgers) { return (synth(403, "Forbidden")); }
    ban("obj.http.X-Cache-Tags ~ " + req.http.X-Cache-Tags);
    return (synth(200, "Banned"));
  }
  // Any session cookie at all means "do not cache".
  if (req.http.Cookie ~ "PHPSESSID") {
    return (pass);
  }
  unset req.http.Cookie;
}`,
      ts: `vcl 4.1;

backend default { .host = "drupal"; .port = "8080"; }

acl purgers { "10.0.3.7"; "10.0.3.8"; }

sub vcl_recv {
  // 1. Tag-based invalidation from varnish_purge.
  if (req.method == "BAN") {
    if (!client.ip ~ purgers) { return (synth(403, "Forbidden")); }
    if (req.http.Cache-Tags) {
      ban("obj.http.Cache-Tags ~ " + req.http.Cache-Tags);
      return (synth(200, "Ban added"));
    }
    return (synth(400, "No Cache-Tags header"));
  }

  // 2. Never cache authenticated traffic or the admin path.
  if (req.http.Cookie ~ "SESS[a-z0-9]+|SSESS[a-z0-9]+|NO_CACHE") {
    return (pass);
  }
  if (req.url ~ "^/(user|admin|system/files)") {
    return (pass);
  }

  // 3. Anonymous: drop cookies entirely so the hash is just host+URL.
  unset req.http.Cookie;
}

sub vcl_backend_response {
  // Keep objects far longer than the browser does, because we can BAN them.
  if (beresp.http.Cache-Control ~ "public") {
    set beresp.ttl = 24h;
    set beresp.grace = 1h;   // serve stale while the backend recovers
  }
  // Do NOT unset beresp.http.Cache-Tags here: in vcl_backend_response beresp
  // *is* the object about to be stored, so stripping the header here silently
  // makes every BAN above match nothing. This is the classic way people break
  // tag purging.
}

sub vcl_deliver {
  // Strip it on the way out instead. The stored object keeps its Cache-Tags
  // header (so bans still match); the browser never sees the tag list.
  unset resp.http.Cache-Tags;
}`,
      note: "Drupal's session cookies are SESS<hash> / SSESS<hash> for TLS; matching them is what keeps a logged-in editor from ever being served, or storing, a shared object.",
      leftLang: "js",
      rightLang: "js",
    },
  ],

  playground: {
    intro:
      "A miniature Varnish object store. Each cached object remembers the Cache-Tags header Drupal sent; a BAN sweeps every object carrying that tag. Predict which URLs survive the edit before you run it.",
    lang: "php",
    code: `<?php
// A miniature Varnish: cached objects that remember the Cache-Tags header
// Drupal sent with the response. No Drupal, no Varnish - just the model.

function store(array &$cache, string $url, array $tags): void {
  $cache[$url] = ['tags' => $tags, 'banned' => false];
}

function fetch(array &$cache, string $url): string {
  if (!isset($cache[$url])) {
    return 'MISS - no object';
  }
  return $cache[$url]['banned'] ? 'MISS - banned, refetch from Drupal' : 'HIT  - PHP never runs';
}

// A BAN walks the object store and marks every object whose Cache-Tags
// header contains the invalidated tag.
function ban(array &$cache, string $tag): int {
  $banned = 0;
  foreach ($cache as $url => $object) {
    if (!$object['banned'] && in_array($tag, $object['tags'], true)) {
      $cache[$url]['banned'] = true;
      $banned++;
    }
  }
  return $banned;
}

$cache = [];
store($cache, '/',            ['node_list', 'node:41', 'node:42', 'config:system.site']);
store($cache, '/incident/41', ['node:41', 'user:7', 'config:system.site']);
store($cache, '/incident/42', ['node:42', 'user:7', 'config:system.site']);
store($cache, '/about',       ['node:9', 'config:system.site']);

echo "-- anonymous traffic, cache warm --\\n";
foreach (array_keys($cache) as $url) {
  printf("%-14s %s\\n", $url, fetch($cache, $url));
}

// An editor saves incident 41. Drupal invalidates node:41 and node_list;
// purge_queuer_coretags queues them; the purger sends one BAN per tag.
$queue = ['node:41', 'node_list'];
echo "\\n-- purge queue: " . implode(', ', $queue) . " --\\n";
foreach ($queue as $tag) {
  printf("BAN obj.http.Cache-Tags ~ %-10s => %d object(s)\\n", $tag, ban($cache, $tag));
}

echo "\\n-- next request wave --\\n";
foreach (array_keys($cache) as $url) {
  printf("%-14s %s\\n", $url, fetch($cache, $url));
}
echo "\\nOnly 2 of 4 objects had to be rebuilt.\\n";
`,
    output: `-- anonymous traffic, cache warm --
/              HIT  - PHP never runs
/incident/41   HIT  - PHP never runs
/incident/42   HIT  - PHP never runs
/about         HIT  - PHP never runs

-- purge queue: node:41, node_list --
BAN obj.http.Cache-Tags ~ node:41    => 2 object(s)
BAN obj.http.Cache-Tags ~ node_list  => 0 object(s)

-- next request wave --
/              MISS - banned, refetch from Drupal
/incident/41   MISS - banned, refetch from Drupal
/incident/42   HIT  - PHP never runs
/about         HIT  - PHP never runs

Only 2 of 4 objects had to be rebuilt.
`,
  },

  keyPoints: [
    "Varnish answers anonymous requests without booting PHP at all — but only if Drupal sends a cacheable response, which means a non-zero 'Page cache maximum age' (system.performance: cache.page.max_age) producing Cache-Control: public, max-age=N.",
    "purge is a framework, not a purger: install a queuer (purge_queuer_coretags), a processor (purge_processor_cron, purge_processor_lateruntime or drush p:queue-work), and a proxy-specific purger (varnish_purger — the module inside the varnish_purge project — or purge_purger_http).",
    "Tag purging requires the tags to be stored with the object: varnish_purge_tags emits a Cache-Tags response header, purge_purger_http_tagsheader emits Purge-Cache-Tags. Varnish then bans on obj.http.<header> ~ tag.",
    "Tag purging invalidates every page that embedded the changed entity; URL purging only invalidates the URLs you thought to list — always prefer tags.",
    "The VCL has three jobs: accept BANs from a trusted ACL, pass authenticated traffic (SESS/SSESS cookies) through, and unset cookies for anonymous requests so the cache key is just host + URL.",
    "Set $settings['reverse_proxy'], reverse_proxy_addresses and reverse_proxy_trusted_headers in settings.php, or Drupal sees every visitor as the proxy and ignores X-Forwarded-Proto.",
  ],

  interview: [
    {
      q: "Walk me through what happens between an editor pressing Save and Varnish serving the updated page.",
      a: "On entity save, Drupal core calls `Cache::invalidateTags()` with tags like `node:41` and `node_list` — that already happens with no contrib modules. `purge_queuer_coretags` subscribes to those invalidations and writes them into purge's queue. A processor drains the queue: `purge_processor_lateruntime` at the end of the same request, `purge_processor_cron` on the next cron run, or `drush p:queue-work` from a timer. The purger — `varnish_purge` for Varnish — turns each queued tag into a BAN request, and the VCL runs `ban(\"obj.http.Cache-Tags ~ \" + req.http.Cache-Tags)`. Every stored object whose `Cache-Tags` header mentions node:41 is now unreachable, so the next request for the homepage, the section page and the article all go to the backend and repopulate.",
    },
    {
      q: "Why is tag-based purging better than URL-based purging, and when would you still fall back to URLs?",
      a: "A single node appears on many URLs — the article page, the front page teaser list, a section landing page, an RSS feed, a related-stories block on an unrelated article. URL purging means maintaining a list of those URLs by hand, and every new View or block silently makes that list wrong. Tag purging inverts it: Varnish stores the response's tag list with the object and bans by tag, so it invalidates exactly the pages that actually depended on the entity, including ones you never anticipated. URL purging is still useful when the proxy or CDN genuinely has no tag/surrogate-key support, or for one-off operational fixes like flushing a single bad asset path. It is a fallback, not a design.",
    },
    {
      q: "Your Varnish hit rate for anonymous users is near zero. How do you debug it?",
      a: "Check the response Drupal actually sends first: if `Cache-Control` says `must-revalidate` or `private`, the *Page cache maximum age* is 0 or something set the response uncacheable — a form, a session, `#cache: max-age: 0` bubbling up, or a `NO_CACHE` cookie. Next check cookies: any cookie Varnish doesn't strip becomes part of the decision to `pass`, and analytics cookies are the classic culprit, so the VCL must `unset req.http.Cookie` for anonymous requests while still passing `SESS`/`SSESS`. Then confirm Drupal knows it is behind a proxy via `$settings['reverse_proxy']`, otherwise redirects and scheme handling can produce uncacheable responses. Finally, temporarily enable `http.response.debug_cacheability_headers: true` in `services.yml` to see `X-Drupal-Cache-Tags`, `X-Drupal-Cache-Contexts` and `X-Drupal-Cache-Max-Age`, which usually names the exact context (often `user` or `session`) that is fragmenting the cache.",
    },
    {
      q: "You come from Symfony and FOSHttpCacheBundle. What actually differs in the Drupal setup?",
      a: "Conceptually almost nothing: both tag responses, both send tag-carrying headers to the proxy, both issue BAN/PURGE requests on write. The differences are ownership and granularity. In Symfony you author every tag yourself with `#[Tag]` or `TagHandler`, and you call `CacheManager::invalidateTags()` at the write site — forget one and you serve stale content forever. In Drupal the render system produces the tags automatically from the entities and config you touched, and core invalidates them on save, so your job is transport. The cost is more moving parts: purge splits queuer, processor and purger into separate plugins, which feels heavy until you migrate from Varnish to a CDN and only swap the purger.",
    },
  ],

  quiz: [
    {
      question:
        "Which module's job is it to notice that Drupal invalidated `node:41` and put it on purge's queue?",
      options: [
        "varnish_purge",
        "purge_queuer_coretags",
        "purge_processor_cron",
        "purge_purger_http_tagsheader",
      ],
      answerIndex: 1,
      explain:
        "purge splits the pipeline: the *queuer* (purge_queuer_coretags) listens to core's cache-tag invalidations and enqueues them; a *processor* drains the queue; a *purger* (varnish_purge) talks to the proxy; the tagsheader submodules only add the response header.",
    },
    {
      question:
        "For Varnish to ban by cache tag, where do the tags have to live?",
      options: [
        "In Drupal's cachetags database table, which Varnish reads directly",
        "In a response header (e.g. Cache-Tags or Purge-Cache-Tags) that Varnish stores alongside the cached object",
        "In the URL, as a query string appended by the purger",
        "In a shared Redis instance both Drupal and Varnish connect to",
      ],
      answerIndex: 1,
      explain:
        "Varnish keeps response headers with each cached object, so `ban(obj.http.Cache-Tags ~ \"node:41\")` can match them. varnish_purge_tags emits `Cache-Tags`; purge_purger_http_tagsheader emits `Purge-Cache-Tags`.",
    },
    {
      question:
        "Anonymous pages are never cached by Varnish and Drupal's Cache-Control header reads `no-cache, must-revalidate`. What is the most likely cause?",
      options: [
        "purge_processor_cron is not enabled",
        "The VCL is missing an ACL for BAN requests",
        "The response was marked uncacheable — e.g. Page cache maximum age is 0, or a max-age of 0 bubbled up the render tree",
        "Varnish is running version 4.1 instead of 6.x",
      ],
      answerIndex: 2,
      explain:
        "Drupal only emits `Cache-Control: public, max-age=N` for responses it considers cacheable, using `system.performance`'s `cache.page.max_age`. A zero max-age (from the setting or from bubbled render-array cacheability) makes core send `no-cache, must-revalidate` instead, and no correctly-behaving proxy will store that.",
    },
    {
      question:
        "Why does the VCL `unset req.http.Cookie` for anonymous requests?",
      options: [
        "To log users out between requests so sessions cannot leak",
        "Because cookies would otherwise fragment or defeat the cache — analytics cookies alone would make every visitor's request unique or force a pass",
        "Because Drupal rejects requests that contain cookies from a proxy",
        "To reduce the size of the BAN requests sent by the purger",
      ],
      answerIndex: 1,
      explain:
        "Varnish's default behaviour is not to cache requests carrying cookies. Stripping them for anonymous traffic (after explicitly passing SESS/SSESS session cookies through) makes the cache key effectively host + URL, which is what gives a high hit rate.",
    },
  ],
};

export default lesson;

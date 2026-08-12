import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "render-cache",
  title: "Render Caching: #cache keys and Granularity",
  part: "Page & Render Caching Layers",
  estMinutes: 13,
  summary:
    "How '#cache' => ['keys' => [...]] turns a render subtree into its own cache entry, how contexts are appended to build the cache ID, why the first render writes twice because of cache redirects, and how to choose the right granularity.",

  concept: `
## The switch is \`keys\`

Every render array carries cacheability, and contexts, tags and max-age bubble
from child to parent whether you ask for it or not. But **bubbling is not
storage**. \`RenderCache::isElementCacheable()\` is the whole gate, and it checks
exactly two things:

\`\`\`php
if (isset($element['#cache']['max-age']) && $element['#cache']['max-age'] === 0) {
  return FALSE;
}
return isset($element['#cache']['keys']);
\`\`\`

No \`keys\`, no entry. The element still contributes its metadata to whichever
ancestor *does* have keys — usually the whole page, via Dynamic Page Cache — it
just never gets a row of its own in the \`render\` bin (the \`cache.render\`
service, table \`cache_render\` on the default database backend).

## Keys are the address, contexts are the variants

\`render_cache\` does not talk to the cache backend directly. It goes through
\`variation_cache_factory\` (\`Drupal\\Core\\Cache\\VariationCache\`); injecting the
plain \`cache_factory\` into \`RenderCache\` was deprecated in Drupal 10.2 and
removed in Drupal 11.0. (The 10.x branch still emits a stale
\`deprecated in drupal:10.1.0\` string — a wrong version number that was
corrected upstream in issue #3375454 but never backported. VariationCache and
the \`variation_cache_factory\` service both landed in 10.2.0.)
VariationCache builds the cache ID like this:

\`\`\`php
$keys = array_merge($keys, $this->cacheContextsManager->convertTokensToKeys($contexts)->getKeys());
return implode(':', $keys);
\`\`\`

So keys \`['incident_ticker', 'block']\` plus contexts
\`['languages:language_interface', 'user.permissions']\` resolve to
\`incident_ticker:block:en:p.4f1a\` for one visitor and
\`incident_ticker:block:en:p.9c30\` for another. You declare *dimensions*; the
manager resolves them to values per request. That is the difference between
cache contexts and the hand-concatenated cache keys you write in Symfony.

## Cache redirects and the double write

When \`build()\` returns, Drupal only knows the contexts **you** declared. The
real set is known only after the children render and bubble theirs up — so
\`RenderCache::set()\` receives both the final element and the
\`$pre_bubbling_elements\`. If the address moved, VariationCache parks a
**CacheRedirect** at the pre-bubbling ID: a tiny value object carrying nothing
but the full context list, stored with no tags and no expiry because it never
needs clearing. The real data goes at the full ID. That is why the *first*
render of such an element costs **two writes**. The second variant costs one —
the redirect path already exists. On read, \`VariationCache::get()\` computes the
ID it can, then follows redirects until it lands on data or a miss.

Declare every context you already know in \`build()\` and no redirect is needed
at all: the ID is complete before the children run.

## Choosing granularity

Keys are cheap, not free — each entry is a serialize plus a backend round trip.
For the incident site:

- **One entry for the whole block** when the rows always change together; a
  single \`node_list:incident\` tag invalidates them as a unit anyway.
- **One entry per row** when rows carry independent tags and the hot list
  changes one row at a time: give each row \`keys => ['incident_row', $id]\` and
  leave the wrapper keyless so it only bubbles.
- **Never key an element with \`max-age => 0\`** — the gate above bails out, and
  that zero bubbles up and makes the whole page uncacheable instead.

Blocks placed through the UI already have keys: \`BlockViewBuilder\` sets
\`['entity_view', 'block', $id]\` for you unless the plugin implements
\`CacheOptionalInterface\` (BlockViewBuilder support added in Drupal 11.2; not
available in Drupal 10). The marker interface \`\\Drupal\\Core\\Cache\\CacheOptionalInterface\`
was backported to 10.5, but nothing in core acts on it before 11.2, so
implementing it on a block plugin has no effect on render caching there. Where
it does apply, \`BlockViewBuilder\` simply omits the block's \`#cache['keys']\`, so
the block is not stored in the render bin — it is still covered by Dynamic Page
Cache / Internal Page Cache.
`,

  comparisons: [
    {
      label: "Making one expensive build independently cacheable",
      intro:
        "The incident ticker costs ~40ms of SQL and appears on every page. In Symfony you reach for a cache pool and invent a key; in Drupal you attach metadata to the array you already return.",
      php: `// src/Controller/IncidentController.php
use Symfony\\Contracts\\Cache\\CacheInterface;
use Symfony\\Contracts\\Cache\\ItemInterface;

public function ticker(CacheInterface $cache, Request $request): Response
{
    $locale = $request->getLocale();

    // You choose the key, the TTL and the tags, and you call the pool
    // explicitly. Nothing about the template knows it is cached.
    $html = $cache->get("incident_ticker.$locale", function (ItemInterface $item) {
        $item->expiresAfter(300);
        $item->tag(['incident_list']);   // TagAwareAdapter only

        return $this->renderView('incident/ticker.html.twig', [
            'incidents' => $this->repo->findOpen(),
        ]);
    });

    return new Response($html);
}`,
      ts: `// src/Plugin/Block/IncidentTickerBlock.php
use Drupal\\Core\\Cache\\Cache;

public function build(): array {
  return [
    '#theme' => 'incident_ticker',
    '#incidents' => $this->repo->findOpen(),
    '#cache' => [
      // The presence of 'keys' is the switch. Without it this subtree still
      // bubbles its tags and contexts upward, but is never stored on its own.
      'keys' => ['incident_ticker', 'block'],
      'contexts' => ['languages:language_interface'],
      'tags' => ['node_list:incident'],
      'max-age' => 300,
    ],
  ];
}

// Nothing calls a cache service here. Renderer::doRender() checks #cache for
// you, and 'rendered' is added to the stored tags by RenderCache::set().`,
      note: "Symfony caches a string you produced; Drupal caches a render array node in place, so the metadata keeps travelling up to the page response after the hit.",
    },
    {
      label: "Variants: you build the key vs contexts build it",
      intro:
        "The ticker shows moderation links to editors. Both stacks need one entry per audience — the difference is who assembles the variant part of the key.",
      php: `// Every dimension is a string you remember to append. Forget one and
// an editor's markup is served to an anonymous reader.
$parts = ['incident_ticker', $request->getLocale()];
if ($this->security->isGranted('ROLE_EDITOR')) {
    $parts[] = 'editor';
}
$html = $cache->get(implode('.', $parts), fn (ItemInterface $i) => /* ... */);

// The alternative is to stop caching the variant inline and push the whole
// fragment to the edge with its own TTL:
//   {{ render_esi(controller('App\\Controller\\IncidentController::ticker')) }}`,
      ts: `'#cache' => [
  'keys' => ['incident_ticker', 'block'],
  // Names of dimensions, not values. CacheContextsManager::convertTokensToKeys()
  // sorts them and resolves each to a value for THIS request.
  'contexts' => ['languages:language_interface', 'user.permissions'],
],

// editor, English   -> incident_ticker:block:en:p.4f1a
// anonymous, English -> incident_ticker:block:en:p.9c30
//
// Both contexts were declared before the children rendered, so the cache ID is
// already complete: no redirect is written, one entry per variant.`,
      note: "Contexts are also access-safe by construction: user.permissions hashes the permission set, so two users with identical permissions correctly share an entry.",
    },
    {
      label: "Granularity: one entry for the list vs one per row",
      intro:
        "A 50-row incident list where a single row is edited every few seconds. Caching the list as a unit means one edit throws away all 50 rows.",
      php: `// One pool entry per row, each with its own tag. You also own the
// fan-out: without getMultiple() this is 50 backend round trips.
$rows = [];
foreach ($incidents as $incident) {
    $id = $incident->getId();
    $rows[] = $this->cache->get('incident_row.' . $id, function (ItemInterface $item) use ($incident, $id) {
        $item->tag(['incident_' . $id]);
        return $this->twig->render('incident/_row.html.twig', ['incident' => $incident]);
    });
}`,
      ts: `$build = [
  '#theme' => 'item_list',
  // No 'keys' on the wrapper: it is never stored, it only collects its
  // children's tags and contexts and hands them to the page.
  '#cache' => ['tags' => ['node_list:incident']],
];

foreach ($incidents as $incident) {
  $build['#items'][] = [
    '#theme' => 'incident_row',
    '#incident' => $incident,
    '#cache' => [
      'keys' => ['incident_row', $incident->id()],
      'contexts' => ['languages:language_interface', 'user.permissions'],
      'tags' => $incident->getCacheTags(),   // node:42
      'max-age' => Cache::PERMANENT,
    ],
  ];
}`,
      note: "Per-row keys win when rows invalidate independently; if a row costs under a millisecond to build, one entry for the whole list is faster — fewer serializes, fewer round trips, fewer redirect chains.",
    },
    {
      label: "Verifying you actually got a hit",
      intro:
        "Assume nothing. Both stacks give you a way to see the stored entry and a header that reports the verdict for the whole response.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Which pools exist, and is yours one of them?
bin/console cache:pool:list
bin/console cache:pool:clear cache.app

# HttpCache/ESI decisions show up on the response only when the kernel was
# wrapped with HttpCache in debug mode:
curl -sI https://news.example.com/ | grep -i '^x-symfony-cache'
#   X-Symfony-Cache: GET /: stale, valid, store

# "Is it still slow?" is a profiler question, not a cache question:
blackfire curl https://news.example.com/`,
      ts: `# On the default database backend the render bin is just a table.
drush sqlq "SELECT cid, LENGTH(data) AS bytes, expire FROM cache_render \\
  WHERE cid LIKE 'incident_ticker%'"
#   incident_ticker:block:en                 96  -1     <- the CacheRedirect
#   incident_ticker:block:en:p.4f1a        2914  1754899200

# Clear only that bin, warm it once, then confirm no second build.
drush cc bin render
curl -s -o /dev/null https://news.example.com/
drush sqlq "SELECT COUNT(*) FROM cache_render WHERE cid LIKE 'incident_ticker%'"

# Verdict for the whole response (needs the dynamic_page_cache module):
curl -sI https://news.example.com/ | grep -i x-drupal
#   X-Drupal-Dynamic-Cache: HIT`,
      note: "On Redis or Memcache there is no table to query — use the Webprofiler/Devel cache report or drush php:eval against the render_cache service instead.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature VariationCache. The ticker block declares one context in build(); a child bubbles user.permissions up during rendering. Count the writes for each of the four requests before you run it — in particular, why request 1 writes twice and request 3 writes once.",
    code: `<?php
// A miniature VariationCache -- the engine underneath Drupal's render cache
// (Drupal\\Core\\Cache\\VariationCache). Data lives at a cache ID made of
// #cache[keys] plus the RESOLVED VALUES of the element's cache contexts.
// A CacheRedirect parked at the pre-bubbling ID points at the full one.

final class CacheRedirect
{
    public function __construct(public readonly array $contexts)
    {
    }
}

final class VariationCache
{
    public array $backend = [];
    public array $log = [];
    public int $writes = 0;

    public function __construct(public array $contextValues)
    {
    }

    // CacheContextsManager::convertTokensToKeys(): sort the tokens, then resolve
    // each one to a concrete value for THIS request.
    public function cid(array $keys, array $contexts): string
    {
        sort($contexts);
        foreach ($contexts as $token) {
            $keys[] = $this->contextValues[$token];
        }
        return implode(':', $keys);
    }

    private function read(string $cid): mixed
    {
        return $this->backend[$cid] ?? false;
    }

    private function write(string $cid, mixed $value): void
    {
        $this->writes++;
        $kind = $value instanceof CacheRedirect ? 'redirect' : 'data';
        $this->log[] = sprintf('    write %-8s %s', $kind, $cid);
        $this->backend[$cid] = $value;
    }

    // getRedirectChain(): every CID walked, ending in the hit or in FALSE.
    public function chain(array $keys, array $initialContexts): array
    {
        $cid = $this->cid($keys, $initialContexts);
        $chain = [$cid => $last = $this->read($cid)];
        while ($last instanceof CacheRedirect) {
            $cid = $this->cid($keys, $last->contexts);
            $chain[$cid] = $last = $this->read($cid);
        }
        return $chain;
    }

    public function get(array $keys, array $initialContexts): array|false
    {
        $chain = $this->chain($keys, $initialContexts);
        $last = end($chain);
        return $last instanceof CacheRedirect ? false : $last;
    }

    public function set(array $keys, array $data, array $contexts, array $initialContexts): void
    {
        $cid = $this->cid($keys, $contexts);
        $chain = $this->chain($keys, $initialContexts);
        // Nothing points here yet -> park a redirect at the last CID we walked.
        if (!array_key_exists($cid, $chain)) {
            $this->write(array_key_last($chain), new CacheRedirect($contexts));
        }
        $this->write($cid, $data);
    }
}

// --- The block -------------------------------------------------------------
$keys = ['incident_ticker', 'block'];
$declared = ['languages:language_interface'];                      // pre-bubbling
$bubbled = ['languages:language_interface', 'user.permissions'];   // post-bubbling

$cache = new VariationCache([]);
$builds = 0;

$requests = [
    ['editor #1', 'en', 'p.4f1a'],
    ['editor #1', 'en', 'p.4f1a'],
    ['anonymous', 'en', 'p.9c30'],
    ['anonymous', 'en', 'p.9c30'],
];

foreach ($requests as $i => [$who, $lang, $perms]) {
    $cache->contextValues = [
        'languages:language_interface' => $lang,
        'user.permissions' => $perms,
    ];
    $cache->log = [];
    $before = $cache->writes;

    $hit = $cache->get($keys, $declared);
    if ($hit === false) {
        $builds++;
        $cache->set($keys, ['#markup' => '<div class="ticker">3 open incidents</div>'], $bubbled, $declared);
    }

    printf(
        "request %d  %-10s %-4s  %d write(s)\\n",
        $i + 1,
        $who,
        $hit === false ? 'MISS' : 'HIT',
        $cache->writes - $before
    );
    foreach ($cache->log as $line) {
        echo $line, "\\n";
    }
}

echo "\\nbuild() ran ", $builds, " times for ", count($requests), " requests\\n";
echo "cache_render bin:\\n";
foreach ($cache->backend as $cid => $value) {
    printf(
        "  %-38s %s\\n",
        $cid,
        $value instanceof CacheRedirect
            ? 'redirect -> ' . implode(' + ', $value->contexts)
            : 'DATA ' . $value['#markup']
    );
}
`,
    output: `request 1  editor #1  MISS  2 write(s)
    write redirect incident_ticker:block:en
    write data     incident_ticker:block:en:p.4f1a
request 2  editor #1  HIT   0 write(s)
request 3  anonymous  MISS  1 write(s)
    write data     incident_ticker:block:en:p.9c30
request 4  anonymous  HIT   0 write(s)

build() ran 2 times for 4 requests
cache_render bin:
  incident_ticker:block:en               redirect -> languages:language_interface + user.permissions
  incident_ticker:block:en:p.4f1a        DATA <div class="ticker">3 open incidents</div>
  incident_ticker:block:en:p.9c30        DATA <div class="ticker">3 open incidents</div>
`,
  },

  keyPoints: [
    "'#cache' => ['keys' => [...]] is the only thing that makes a render subtree independently cacheable — RenderCache::isElementCacheable() checks for keys and for a non-zero max-age, nothing else. Without keys, contexts/tags/max-age still bubble to the nearest keyed ancestor.",
    "The cache ID is implode(':', keys + resolved context values). You name dimensions ('user.permissions'); CacheContextsManager sorts the tokens and turns them into values ('p.4f1a') per request.",
    "Render caching runs on VariationCache, not the raw cache backend — injecting cache_factory into RenderCache was deprecated in Drupal 10.2 (when VariationCache landed) and removed in Drupal 11.0 in favour of variation_cache_factory.",
    "Contexts that bubble up from children move the cache ID, so the first render writes a CacheRedirect at the pre-bubbling ID plus the data at the full ID: two writes. Declaring the contexts up front in build() avoids the redirect entirely.",
    "Granularity is a trade: one entry per row only pays when rows invalidate independently and cost real time to build; otherwise one entry for the whole block means fewer serializes and fewer redirect chains.",
    "Verify, don't assume: query cache_render for your keys prefix, clear just that bin with 'drush cc bin render', and read X-Drupal-Dynamic-Cache for the page-level verdict.",
  ],

  interview: [
    {
      q: "What is the difference between an element that has #cache contexts and tags, and one that has #cache keys as well?",
      a: "Contexts, tags and max-age are *cacheability metadata*: they bubble up the render tree and end up describing whatever ancestor is actually stored — normally the page, via Dynamic Page Cache. Adding `keys` is what makes the element itself a cacheable unit: `RenderCache::isElementCacheable()` returns TRUE only when `#cache['keys']` is set and max-age is not 0, and only then does Renderer look the subtree up in the render bin before building it. So a keyless element with tags is still *correct* — the page will be invalidated properly — it is just never reused independently. You add keys when the subtree is expensive enough that rebuilding it on every uncached page render is the bottleneck.",
    },
    {
      q: "Why can rendering one element for the first time produce two entries in the render bin?",
      a: "Because Drupal does not know the element's real cache contexts until its children have rendered and bubbled theirs up. `RenderCache::set()` is passed both the finished element and the pre-bubbling one, and hands both to `VariationCache::set()`. If the post-bubbling contexts produce a different cache ID than the pre-bubbling ones, VariationCache stores a `CacheRedirect` at the pre-bubbling ID — a value object holding only the full context list, written with no tags and no expiry — and the data at the full ID. On the next request the lookup starts at the pre-bubbling ID, follows the redirect, and lands on the data. Declaring all the contexts you already know inside `build()` removes the extra hop and the extra write.",
    },
    {
      q: "How would you decide between caching a whole listing block and caching each row?",
      a: "By invalidation shape and build cost. If every row shares one list cache tag, per-row entries buy nothing — a single node save invalidates the lot either way, and you have paid for 50 serializes plus 50 backend round trips instead of one. Per-row caching pays when each row has its own tag (`node:42`) and edits arrive one row at a time, so 49 rows survive an edit. I'd measure the per-row build cost first: below roughly a millisecond the entry overhead dominates. A common middle ground on a busy site is a keyed block with a short max-age plus a lazy builder for the genuinely per-user bits, so the shared part is cached once and only the personalised fragment varies.",
    },
    {
      q: "A colleague sets '#cache' => ['keys' => ['my_block'], 'max-age' => 0] and wonders why nothing is cached. What is happening?",
      a: "Two things, and the second is the dangerous one. First, `isElementCacheable()` short-circuits on `max-age === 0`, so the element is never read from or written to the render bin — the keys are inert. Second, that zero does not stay local: max-age bubbles as the *minimum* across the tree, so it propagates to the page and makes the whole response uncacheable in Dynamic Page Cache and in any reverse proxy. One block written that way can cost you the entire page cache. The fix is almost always a cache *context* (vary correctly) or a cache *tag* (invalidate precisely), not max-age 0; reach for a `#lazy_builder` placeholder if the fragment genuinely cannot be cached.",
    },
  ],

  quiz: [
    {
      question:
        "A render array has '#cache' => ['contexts' => ['user.roles'], 'tags' => ['node:7']] but no 'keys'. What happens?",
      options: [
        "It is stored in the render bin under an auto-generated cache ID derived from #theme",
        "It is not stored separately, but its contexts and tags bubble up to the nearest keyed ancestor and to the page response",
        "Drupal throws a LogicException because contexts require keys",
        "It is stored, but only for anonymous users",
      ],
      answerIndex: 1,
      explain:
        "`RenderCache::isElementCacheable()` returns `isset($element['#cache']['keys'])` — there is no fallback ID. The element is rebuilt on every render of its parent, but its metadata still bubbles, so `node:7` will correctly invalidate whatever ancestor *is* cached, and `user.roles` will make that ancestor vary per role set.",
    },
    {
      question:
        "keys are ['incident_ticker'] and, after rendering, contexts are ['languages:language_interface', 'user.permissions']. Roughly what does the cache ID look like?",
      options: [
        "incident_ticker:languages:language_interface:user.permissions",
        "incident_ticker:en:p.4f1a — the keys followed by each context's resolved value",
        "A hash of the whole render array",
        "incident_ticker — contexts are stored in a separate column, not in the ID",
      ],
      answerIndex: 1,
      explain:
        "VariationCache runs the context tokens through `CacheContextsManager::convertTokensToKeys()`, which sorts them and asks each context object for its value in the current request, then does `implode(':', array_merge($keys, $values))`. The token names never appear in the ID — only what they resolved to.",
    },
    {
      question:
        "Your block declares contexts ['url.path'] in build(), but a child field bubbles up 'user.permissions'. On the very first request for this block, how many entries does VariationCache write?",
      options: [
        "One — the data, at the ID built from url.path only",
        "One — the data, at the ID built from both contexts",
        "Two — a CacheRedirect at the pre-bubbling ID, plus the data at the full ID",
        "Three — a redirect per context plus the data",
      ],
      answerIndex: 2,
      explain:
        "The lookup started at the pre-bubbling ID (keys + url.path value), so something must live there or the entry could never be found again. VariationCache writes a `CacheRedirect` carrying the full context list at that address, then writes the data at keys + url.path value + permissions hash. The next visitor with a different permissions hash reuses the redirect and costs only one write.",
    },
    {
      question:
        "Which statement about render caching in Drupal 10 and 11 is correct?",
      options: [
        "RenderCache writes straight to the cache.render backend; VariationCache is a contrib-only alternative",
        "RenderCache goes through variation_cache_factory; passing cache_factory was deprecated in 10.2 and removed in 11.0",
        "Cache redirects are stored with the element's cache tags so they are invalidated together",
        "Setting '#cache' => ['bin' => 'render'] is required, otherwise the element is not cached",
      ],
      answerIndex: 1,
      explain:
        "`RenderCache::__construct()` takes a `VariationCacheFactoryInterface`; the old `cache_factory` argument was deprecated in drupal:10.2.0 and removed in drupal:11.0.0 (the 10.x branch still prints a stale `drupal:10.1.0` in the message; that version number was fixed upstream in issue #3375454). Redirects are deliberately written *without* tags and without an expiry because they never need clearing, and `bin` defaults to `render` — `$elements['#cache']['bin'] ?? 'render'`.",
    },
  ],
};

export default lesson;

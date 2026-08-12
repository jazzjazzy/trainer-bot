import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "max-age-and-permanent",
  title: "Max-Age: The Blunt Instrument",
  part: "The Cacheability Model",
  estMinutes: 12,
  summary:
    "Max-age is the one piece of cacheability that merges by intersection, so the smallest number anywhere in the render tree wins — which is why a single max-age 0 element quietly turns your whole news page into an uncacheable one.",

  concept: `
Tags and contexts *add*. Max-age *subtracts*. That asymmetry is the whole
lesson.

## Three values, not a range

\`#cache['max-age']\` is an integer with three meaningful shapes:

- **A positive integer** — seconds of validity. "This is correct for 60 seconds,
  then re-render it."
- **\`Cache::PERMANENT\` (\`-1\`)** — "valid forever; the only thing that will ever
  kill this is a cache tag invalidation." This is the default, and it is the
  value you want on almost everything.
- **\`0\`** — "not cacheable, at all, ever." Not "expire immediately". Drupal's
  debug header spells it out as \`0 (Uncacheable)\`.

\`Cache::PERMANENT\` is \`CacheBackendInterface::CACHE_PERMANENT\`, which is \`-1\`.
Never write the literal \`-1\`; write the constant.

## Merging is intersection

\`Cache::mergeMaxAges(...\$max_ages)\` filters out every \`PERMANENT\`, and then
returns \`min()\` of what is left — or \`PERMANENT\` if nothing is left. So the
merge of \`[PERMANENT, 900, 60]\` is \`60\`, and the merge of
\`[PERMANENT, 900, 0]\` is \`0\`.

Now recall that cacheability bubbles up the render tree. A leaf's max-age
merges into its parent, which merges into *its* parent, all the way to the
response. On the incident site that means the reader poll in the sidebar of an
article page sets the max-age for the **entire page**. One \`max-age = 0\` in one
block plugin and the response is unstorable: Dynamic Page Cache reports
\`X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)\`, the render cache
refuses the subtree, and every request that reaches Dynamic Page Cache — all
authenticated traffic, plus any anonymous request with a session — rebuilds
the page from scratch.

This is why \`max-age = 0\` is almost never the right fix. When someone says
"the block shows stale data", they usually mean one of two things:

- *"It's stale after an editor changes something"* — that is a **missing cache
  tag**. Add the tag; the fix is exact and free.
- *"It shows the wrong thing for different users"* — that is a **missing cache
  context**. Add \`user.permissions\`, \`user\`, \`url.query_args:page\`, whatever
  actually varies it.

Reach for max-age only when the content genuinely expires on a clock and no
tag can know about it: a countdown to an evacuation deadline, a rate-limited
third-party feed you poll every 15 minutes, an "N minutes ago" timestamp.

## What the page caches do with it

The layers do **not** agree, and this trips people up:

- The **render cache / Dynamic Page Cache** honour max-age. A positive max-age
  becomes a real expiry on the cache item, and a max-age of \`0\` means the item
  is never stored. Dynamic Page Cache's threshold lives in the
  \`renderer.config\` \`auto_placeholder_conditions\` \`max-age\` parameter, which
  defaults to \`0\`.
- The **Internal Page Cache** (anonymous traffic) does not. Its own source says
  it plainly: page cache entries default to \`Cache::PERMANENT\` because they are
  expired via cache tags, "because of this, page cache ignores max age". A
  \`max-age\` of 300 on a block will not re-render the anonymous page after five
  minutes.
- **Downstream** (browsers, Varnish, a CDN), Drupal emits
  \`Cache-Control: public, max-age=N\` where \`N\` comes from the
  \`system.performance\` config key \`cache.page.max_age\` — the "Browser and proxy
  cache maximum age" field — **not** from your render array. Core does not emit
  \`s-maxage\`; if you want the shared TTL to differ from the browser TTL, that
  split happens in your VCL or CDN config.

So: max-age is a render-layer TTL, not an HTTP TTL. Treat them separately.
`,

  comparisons: [
    {
      label: "Expressing a time-based TTL",
      intro:
        "The incident site polls a Bureau of Meteorology feed that is rate-limited to four calls an hour. Both frameworks want a 15-minute TTL, but they attach it to different things.",
      php: `// Symfony: TTL lives on the Response, or on the cache item.
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Contracts\\Cache\\ItemInterface;

public function weather(CacheInterface $cache): Response
{
    $data = $cache->get('bom.feed.vic', function (ItemInterface $item) {
        $item->expiresAfter(900);          // PSR-6 TTL on the item
        return $this->bom->fetch('VIC');
    });

    $response = $this->render('weather.html.twig', ['data' => $data]);
    $response->setPublic();
    $response->setMaxAge(900);             // browser TTL
    $response->setSharedMaxAge(900);       // proxy TTL (s-maxage)

    return $response;
}`,
      ts: `// Drupal: TTL is metadata on the render array. It bubbles.
use Drupal\\Core\\Cache\\Cache;

public function build(): array {
  return [
    '#theme' => 'bom_weather',
    '#data' => $this->bom->fetch('VIC'),
    '#cache' => [
      // Nothing invalidates this feed, so a clock is the honest answer.
      'max-age' => 900,
      'contexts' => ['url.path'],
      'tags' => ['incident_site:weather'],
    ],
  ];
}`,
      note:
        "Symfony's TTL stops at the Response you are holding. Drupal's max-age travels upward and caps every ancestor — so 900 here caps the whole page at 900.",
    },
    {
      label: "The intersection problem, handled two ways",
      intro:
        "A page assembles three fragments with different lifetimes. Whoever is shortest must win.",
      php: `// Symfony: you do the min() yourself, or you forget to.
$ttls = [
    $incidentFeed->getTtl(),   // null = no opinion
    $countdown->getTtl(),      // 60
    $weather->getTtl(),        // 900
];
$ttls = array_filter($ttls, fn ($t) => $t !== null);
$pageTtl = $ttls ? min($ttls) : 3600;

$response->setSharedMaxAge($pageTtl);

// HttpCache/ESI does this per-fragment automatically, but only if every
// fragment is a real ESI subrequest with its own Response.`,
      ts: `// Drupal: the Renderer does it for you, whether you meant it or not.
use Drupal\\Core\\Cache\\Cache;
use Drupal\\Core\\Cache\\CacheableMetadata;

$page_ttl = Cache::mergeMaxAges(
  Cache::PERMANENT,  // incident feed: tag-invalidated
  60,                // countdown
  900,               // weather
);                   // => 60

// Or, the way you actually write it in a controller:
$meta = CacheableMetadata::createFromRenderArray($build);
$meta->setCacheMaxAge(Cache::mergeMaxAges($meta->getCacheMaxAge(), 60));
$meta->applyTo($build);`,
      note:
        "mergeMaxAges() drops every PERMANENT then returns min(); if nothing is left it returns PERMANENT. Use setCacheMaxAge() to overwrite, mergeCacheMaxAge() to intersect.",
    },
    {
      label: "The two knobs that are NOT your render array",
      intro:
        "Downstream TTL and debug visibility are configured, not coded. These are the first two things to check when max-age 'does not work'.",
      php: `# Symfony: framework.yaml + the HttpCache kernel.
framework:
  http_cache:
    enabled: true
    default_ttl: 0
    private_headers: ['Authorization', 'Cookie']

# Debugging: the reverse proxy stamps X-Symfony-Cache
# with fresh/stale/miss per fragment when debug is on.`,
      ts: `# Drupal: system.performance.yml — the ONLY source of Cache-Control max-age.
cache:
  page:
    max_age: 300      # "Browser and proxy cache maximum age"
css:
  preprocess: true
js:
  preprocess: true

# sites/default/services.yml — turn on cacheability debug headers
# (development only; they leak tag/context names).
parameters:
  http.response.debug_cacheability_headers: true`,
      leftLang: "yaml",
      rightLang: "yaml",
      note:
        "With the debug parameter on you get X-Drupal-Cache-Max-Age (rendered as '-1 (Permanent)' or '0 (Uncacheable)'), plus X-Drupal-Cache-Tags and X-Drupal-Cache-Contexts.",
    },
    {
      label: "Finding the culprit",
      intro:
        "The page is UNCACHEABLE and nobody knows why. You need the one element that set max-age 0.",
      php: `# Symfony: profile the request and read the cache panel.
$ symfony server:start
$ curl -sI https://localhost:8000/incidents | grep -i x-symfony-cache
X-Symfony-Cache: GET /incidents: miss, store

# Or Blackfire for the cost of the miss.
$ blackfire curl https://incidents.example.com/`,
      ts: `# Drupal: read the headers, then grep the codebase.
$ drush cr
$ curl -sI https://incidents.example.com/node/8821 \\
    | grep -Ei 'x-drupal-(dynamic-)?cache'
X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)
X-Drupal-Cache: MISS
X-Drupal-Cache-Max-Age: 0 (Uncacheable)

$ grep -rn "max-age'\\] *= *0\\|'max-age' *=> *0" web/modules/custom
web/modules/custom/incident_poll/src/Plugin/Block/ReaderPollBlock.php:74

$ drush watchdog:tail --severity=Warning`,
      leftLang: "bash",
      rightLang: "bash",
      note:
        "X-Drupal-Cache is the Internal Page Cache, which only ever serves fully anonymous, session-less requests; X-Drupal-Dynamic-Cache is Dynamic Page Cache, which runs for all users (it is the only page-level cache authenticated users get, and it also runs for anonymous requests that Internal Page Cache could not serve). Different layers, different answers, always read both.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of Cache::mergeMaxAges() bubbling up a render tree. Watch what one leaf does to the response.",
    lang: "php",
    code: `<?php

const PERMANENT = -1;

/** Mirrors \\Drupal\\Core\\Cache\\Cache::mergeMaxAges(). */
function mergeMaxAges(int ...$maxAges): int {
    $finite = array_filter($maxAges, fn(int $m): bool => $m !== PERMANENT);
    if ($finite === []) {
        return PERMANENT;
    }
    return min($finite);
}

function describe(int $maxAge): string {
    if ($maxAge === PERMANENT) {
        return '-1 (Permanent)';
    }
    if ($maxAge === 0) {
        return '0 (Uncacheable)';
    }
    return $maxAge . 's';
}

/** Post-order walk: children merge into the parent, exactly like bubbling. */
function bubble(array $element, int $depth = 0): int {
    $merged = $element['max-age'];
    foreach ($element['children'] as $child) {
        $merged = mergeMaxAges($merged, bubble($child, $depth + 1));
    }
    printf(
        "%-26s own %-15s bubbled %s\\n",
        str_repeat('  ', $depth) . $element['label'],
        describe($element['max-age']),
        describe($merged)
    );
    return $merged;
}

$page = [
    'label' => 'page',
    'max-age' => PERMANENT,
    'children' => [
        ['label' => 'incident_feed', 'max-age' => PERMANENT, 'children' => []],
        ['label' => 'evacuation_countdown', 'max-age' => 60, 'children' => []],
        [
            'label' => 'sidebar',
            'max-age' => PERMANENT,
            'children' => [
                ['label' => 'bom_weather_feed', 'max-age' => 900, 'children' => []],
                ['label' => 'reader_poll', 'max-age' => PERMANENT, 'children' => []],
            ],
        ],
    ],
];

echo "=== healthy tree ===\\n";
$responseMaxAge = bubble($page);
echo "response max-age: " . describe($responseMaxAge) . "\\n";

echo "\\n=== someone 'fixes' the poll with max-age 0 ===\\n";
$page['children'][2]['children'][1]['max-age'] = 0;
$responseMaxAge = bubble($page);
echo "response max-age: " . describe($responseMaxAge) . "\\n";
echo "Dynamic Page Cache: UNCACHEABLE (poor cacheability)\\n";
echo "One leaf just made the entire response unstorable.\\n";
`,
    output: `=== healthy tree ===
  incident_feed            own -1 (Permanent)  bubbled -1 (Permanent)
  evacuation_countdown     own 60s             bubbled 60s
    bom_weather_feed       own 900s            bubbled 900s
    reader_poll            own -1 (Permanent)  bubbled -1 (Permanent)
  sidebar                  own -1 (Permanent)  bubbled 900s
page                       own -1 (Permanent)  bubbled 60s
response max-age: 60s

=== someone 'fixes' the poll with max-age 0 ===
  incident_feed            own -1 (Permanent)  bubbled -1 (Permanent)
  evacuation_countdown     own 60s             bubbled 60s
    bom_weather_feed       own 900s            bubbled 900s
    reader_poll            own 0 (Uncacheable) bubbled 0 (Uncacheable)
  sidebar                  own -1 (Permanent)  bubbled 0 (Uncacheable)
page                       own -1 (Permanent)  bubbled 0 (Uncacheable)
response max-age: 0 (Uncacheable)
Dynamic Page Cache: UNCACHEABLE (poor cacheability)
One leaf just made the entire response unstorable.
`,
  },

  keyPoints: [
    "max-age has three shapes: a positive TTL in seconds, Cache::PERMANENT (-1, meaning 'only a tag can kill this', and the default), and 0, meaning 'never cacheable' — not 'expire now'.",
    "Cache::mergeMaxAges() filters out PERMANENT then returns min(), so merging is intersection: the shortest lifetime anywhere in a subtree caps every ancestor up to the response.",
    "One element with max-age 0 makes the whole response uncacheable. If the complaint is 'stale after an edit' the fix is a cache tag; if it is 'wrong for this user' the fix is a cache context.",
    "Legitimate max-age uses are clock-bound: countdowns, rate-limited external feeds, relative timestamps — things no tag can ever know about.",
    "The render cache and Dynamic Page Cache honour max-age; the Internal Page Cache explicitly ignores it and expires anonymous pages by tag only.",
    "Cache-Control: public, max-age=N downstream comes from the system.performance key cache.page.max_age, never from your render array; core emits no s-maxage, so splitting browser and CDN TTLs happens in VCL or CDN config.",
  ],

  interview: [
    {
      q: "A colleague fixes a 'stale block' bug by setting #cache['max-age'] = 0. Why is that a problem, and what would you do instead?",
      a: `Because max-age merges by **intersection**, not union. \`Cache::mergeMaxAges()\` throws away every \`PERMANENT\` and returns \`min()\`, so a \`0\` on one block bubbles up through every parent and caps the whole response at \`0\`. The response is then unstorable: Dynamic Page Cache reports \`UNCACHEABLE (poor cacheability)\` and every authenticated hit rebuilds the entire page. A one-block bug just became a site-wide throughput problem, and it will not show up in local testing where caches are off anyway. The real diagnosis is almost always a missing dependency: if the block goes stale when an editor saves something, it is missing that entity's cache tag; if it shows the wrong thing to different people, it is missing a cache context like \`user.permissions\` or \`user\`. Both of those are precise and cost nothing at steady state.`,
    },
    {
      q: "When IS max-age the correct tool?",
      a: `When the content expires on a clock and nothing in Drupal will ever know to invalidate it. Three honest cases: a countdown or "N minutes ago" timestamp whose rendered output is wrong purely because time passed; data pulled from a rate-limited third-party API where you have decided a 15-minute staleness budget is acceptable; and anything derived from \`time()\` inside your own build logic. The rule of thumb is that a cache tag is an *event* dependency and max-age is a *time* dependency — if you can name the event, use the tag. Also scope it as tightly as you can: put the max-age on the small \`#lazy_builder\` fragment rather than the block, so the placeholder keeps the rest of the page permanently cacheable.`,
    },
    {
      q: "Explain how a render array's max-age relates to the Cache-Control header Drupal sends.",
      a: `They are almost unrelated, which surprises people. The render-array max-age is a **render-layer** TTL: it is honoured by the render cache and by Dynamic Page Cache, and a \`0\` there stops the response being stored. The \`Cache-Control: public, max-age=N\` that goes on the wire is built by \`FinishResponseSubscriber\` from the \`system.performance\` config key \`cache.page.max_age\` — the "Browser and proxy cache maximum age" setting — not from your render array. And the Internal Page Cache, which serves anonymous traffic, says in its own source that it ignores max age and expires entries via cache tags. So a 300-second max-age on a block does *not* mean anonymous visitors get fresh HTML after five minutes. If you want a short shared TTL at the edge you set it in your CDN or Varnish config, because core emits no \`s-maxage\` of its own.`,
    },
    {
      q: "How would you compare Drupal's max-age model to Symfony's HTTP caching?",
      a: `Symfony gives you \`Response::setMaxAge()\` and \`setSharedMaxAge()\` on a single object you are holding, plus \`expiresAfter()\` on PSR-6 cache items. Nothing merges automatically — if a page is assembled from three fragments with different lifetimes, *you* call \`min()\`, or you use ESI so each fragment is a separate subrequest with its own Response and HttpCache does the reconciliation. Drupal inverts this: cacheability is metadata attached to the render tree, and the Renderer merges it upward for you, which is safer by default but means a lifetime you set deep in a block silently constrains the whole page. The Symfony developer's instinct — "this response is mine to configure" — is the exact instinct to unlearn. It also means Drupal separates the browser/proxy TTL (a site config value) from the internal render TTL (your metadata), whereas in Symfony both usually come off the same Response.`,
    },
  ],

  quiz: [
    {
      question:
        "What does Cache::mergeMaxAges(Cache::PERMANENT, 600, Cache::PERMANENT, 45) return?",
      options: ["Cache::PERMANENT (-1)", "45", "600", "645"],
      answerIndex: 1,
      explain:
        "mergeMaxAges() filters out every PERMANENT value first, then returns min() of what remains — here min(600, 45) = 45. It only returns PERMANENT when nothing finite is left after filtering.",
    },
    {
      question:
        "A block on your article template sets '#cache' => ['max-age' => 0]. What is the effect on the article page?",
      options: [
        "Only that block is re-rendered on every request; the rest of the page stays cached.",
        "The block is cached for zero seconds, i.e. re-fetched on the next request after the first.",
        "The 0 bubbles up and the entire response becomes uncacheable, so the whole page is rebuilt every request.",
        "Nothing changes unless the Internal Page Cache module is disabled.",
      ],
      answerIndex: 2,
      explain:
        "max-age merges by intersection all the way up the render tree, so a single 0 caps the response at 0. Dynamic Page Cache then refuses to store it (UNCACHEABLE) and the whole page is rebuilt per request. Isolating the uncacheable part requires a #lazy_builder placeholder, not just a low max-age.",
    },
    {
      question:
        "Anonymous visitors still see a five-minute-old figure even though the block declares max-age 300. Why?",
      options: [
        "The Internal Page Cache ignores max-age; it stores entries permanently and expires them via cache tags.",
        "max-age is capped at 60 seconds for anonymous users.",
        "The block is missing the 'user.roles:anonymous' cache context.",
        "Drupal rounds max-age up to the nearest value of cache.page.max_age.",
      ],
      answerIndex: 0,
      explain:
        "The page_cache module's own source notes that entries default to Cache::PERMANENT because they are expired via cache tags, so page cache ignores max age. For anonymous traffic you need a real cache tag (invalidated by cron or by the code that refreshes the data), or an edge TTL.",
    },
    {
      question:
        "Which config key controls the 'public, max-age=N' Cache-Control header Drupal sends to browsers and proxies?",
      options: [
        "renderer.config auto_placeholder_conditions max-age",
        "system.performance cache.page.max_age",
        "The highest max-age found in the page's render array",
        "system.site page.cache_ttl",
      ],
      answerIndex: 1,
      explain:
        "FinishResponseSubscriber reads cache.page.max_age from system.performance (the 'Browser and proxy cache maximum age' field on /admin/config/development/performance) and writes it straight into the header. The render array's max-age is not consulted for that header at all.",
    },
  ],
};

export default lesson;

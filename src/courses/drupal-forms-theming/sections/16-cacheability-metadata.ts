import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "cacheability-metadata",
  title: "Cacheability in Render Arrays: Bubbling Done Right",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 13,
  summary:
    "Every render array can declare \`#cache\` with keys (cache me separately), contexts (vary me), tags (invalidate me) and max-age (expire me) — and because a child's metadata bubbles into its parents, one forgotten context on a nested element quietly poisons the whole page.",

  concept: `
## Four keys, four different jobs

\`\`\`php
'#cache' => [
  'keys'     => ['incident_tracker', 'dashboard'],
  'contexts' => ['theme', 'languages:language_interface', 'url.query_args:status'],
  'tags'     => ['node_list:incident', 'config:incident_tracker.settings'],
  'max-age'  => 300,
],
\`\`\`

They are not four flavours of the same thing:

- **keys** — "give this subtree its own entry in the \`render\` cache bin". The
  cache ID is the keys joined with \`:\` plus the *resolved value* of every cache
  context (\`CacheContextsManager::convertTokensToKeys()\`). No keys means no
  independent render-cache entry — but the metadata still bubbles and still
  governs Dynamic Page Cache and Page Cache.
- **contexts** — the declarative \`Vary\`. \`user\`, \`user.permissions\`,
  \`user.roles:editor\`, \`session\`, \`theme\`, \`route\`, \`route.name\`,
  \`url\`, \`url.path\`, \`url.query_args:status\`, \`languages:language_interface\`,
  \`timezone\`, \`headers:X-Something\`. They form a hierarchy: \`user\` is an
  *ancestor* of \`user.permissions\` and varies more finely, so when both bubble
  to the same element the optimizer drops \`user.permissions\`. Cardinality is
  the whole game — \`user.permissions\` yields a handful of variants,
  \`user\` yields one per account.
- **tags** — dependency labels, not variation. \`node:5\`, \`node_list\`,
  \`node_list:incident\`, \`user:3\`, \`config:incident_tracker.settings\`.
  Saving an entity or config object invalidates its tags automatically across
  every bin and every layer. Build them with \`$entity->getCacheTags()\` or
  \`Cache::buildTags('node', $ids)\`, never by hand-typing strings.
- **max-age** — seconds. \`0\` means "never cacheable", \`Cache::PERMANENT\`
  (\`-1\`) means "until a tag says otherwise". Reach for it only for genuinely
  time-based data; a TTL is a confession that you could not express the
  dependency as a tag.

## Bubbling, and the cache redirect

After each element renders, the renderer merges its \`#cache\` (plus
\`#attached\`) into its parent's \`BubbleableMetadata\`. Union for tags and
contexts, **minimum** for max-age. So a nested row-action that varies by
\`user\` re-keys the entire dashboard per account, and a single \`max-age => 0\`
anywhere below makes the page uncacheable.

That creates a chicken-and-egg problem for keyed elements: you must compute a
CID *before* rendering, but contexts only arrive *after*. Core solves it with a
**cache redirect** — the pre-bubbling CID stores a \`CacheRedirect\` object
pointing at the post-bubbling CID, so lookups cost two gets instead of one. It
also means the metadata you declare up front should be honest.

## The one call worth memorising

\`\`\`php
$this->renderer->addCacheableDependency($build, $incident);   // entity
$this->renderer->addCacheableDependency($build, $this->config('incident_tracker.settings'));
\`\`\`

Anything implementing \`CacheableDependencyInterface\` — entities, config
objects, \`AccessResult\`, block and other cacheable plugin *instances* — hands
over its tags, contexts and max-age in one line. Pass an object that *doesn't*
implement it and you get \`max-age => 0\`: safe, and loudly slow. Plugin
*definitions* are one such trap: they are plain arrays (or
\`PluginDefinition\` objects), and neither carries cacheability.

For everything else there is \`CacheableMetadata\` (or \`BubbleableMetadata\`,
which also carries \`#attached\`):

\`\`\`php
CacheableMetadata::createFromRenderArray($build)
  ->merge(CacheableMetadata::createFromObject($incident))
  ->addCacheContexts(['url.query_args:status'])
  ->applyTo($build);
\`\`\`

and the array helpers \`Cache::mergeTags()\`, \`Cache::mergeContexts()\`,
\`Cache::mergeMaxAges()\`.

## Seeing it

Set \`http.response.debug_cacheability_headers: true\` in
\`sites/development.services.yml\` to get \`X-Drupal-Cache-Tags\`,
\`X-Drupal-Cache-Contexts\` and \`X-Drupal-Cache-Max-Age\` on every response,
alongside \`X-Drupal-Dynamic-Cache: HIT | MISS | UNCACHEABLE\`. Drupal 9.5+
adds \`renderer.config.debug: true\`, which wraps each rendered element in HTML
comments listing its cache keys, tags, contexts and max-age — the fastest way
to find *which* element poisoned the page.
`,

  comparisons: [
    {
      label: "Declaring how output varies",
      intro:
        "Both frameworks need to say 'this output is not the same for everyone'. Symfony says it on the Response, in HTTP terms. Drupal says it on the render array, in domain terms — and the renderer translates.",
      leftLang: "php",
      rightLang: "php",
      php: `use Symfony\\Component\\HttpKernel\\Attribute\\Cache;

final class IncidentController extends AbstractController
{
    #[Cache(smaxage: 300, mustRevalidate: true)]
    public function dashboard(Request $request): Response
    {
        $status = $request->query->get('status', 'open');

        $response = $this->render('incident/dashboard.html.twig', [
            'incidents' => $this->repo->findByStatus($status),
        ]);

        // Vary is a raw header list. The proxy has no idea what
        // "the current user's permission set" means, so anything
        // per-user has to be private (= uncacheable at the edge),
        // or carved out into an ESI fragment by hand.
        $response->setVary(['Accept-Language', 'Cookie']);

        return $response;
    }
}`,
      ts: `// incident_tracker/src/Controller/DashboardController.php
public function dashboard(): array {
  $status = $this->requestStack->getCurrentRequest()->query->get('status', 'open');

  $build['#theme'] = 'incident_dashboard';
  $build['#incidents'] = $this->storage->loadByStatus($status);
  $build['#cache'] = [
    // Own entry in the 'render' bin. CID = keys + resolved context values.
    'keys' => ['incident_tracker', 'dashboard', $status],
    // Domain-level vary. 'theme' and 'languages:language_interface' are
    // usually added for you; the query arg never is.
    'contexts' => ['url.query_args:status', 'user.permissions'],
    'tags' => ['node_list:incident'],
    'max-age' => Cache::PERMANENT,
  ];

  return $build;
}`,
      note: "Controllers return arrays, not Responses: you never touch Cache-Control. Drupal derives the response headers from the bubbled metadata — 'user.permissions' becomes a private, per-permission-set variant; contexts that map to nothing HTTP-visible simply key the internal caches.",
    },
    {
      label: "Invalidating when the data changes",
      intro:
        "The real difference is not syntax, it is who remembers. In Symfony you maintain the mapping from 'this thing changed' to 'these cache entries are stale'. In Drupal that mapping is the tag, and it travels with the output.",
      leftLang: "php",
      rightLang: "php",
      php: `// With FOSHttpCacheBundle you tag responses and purge by hand.
use FOS\\HttpCacheBundle\\Configuration\\Tag;

#[Tag('incident-{id}')]
#[Tag('incident-list')]
public function show(int $id): Response { /* ... */ }

// ...and every write path must remember to invalidate.
public function save(Incident $incident): void
{
    $this->em->flush();

    $this->cacheManager->invalidateTags([
        'incident-' . $incident->getId(),
        'incident-list',
    ]);

    // Plus the PSR-6 pool you also read from:
    $this->pool->deleteItem('incident_dashboard_' . $incident->getStatus());
}`,
      ts: `use Drupal\\Core\\Cache\\Cache;

// Nothing to remember on the write path: EntityStorageBase invalidates
// node:5 and node_list / node_list:incident on save() and delete().
$incident->save();

// You only invalidate by hand for data Drupal doesn't own — an external
// API you cached under your own tag.
Cache::invalidateTags(['incident_tracker:remote_status']);
// (or the injectable form)
$this->cacheTagsInvalidator->invalidateTags(['incident_tracker:remote_status']);

// Building tags: ask the object, don't type strings.
$build['#cache']['tags'] = Cache::mergeTags(
  $incident->getCacheTags(),                       // ['node:5']
  $this->entityTypeManager->getDefinition('node')->getListCacheTags(),
  ['config:incident_tracker.settings'],
);

// Cache::buildTags() is the bulk form: ['node:5', 'node:9']
$build['#cache']['tags'] = Cache::mergeTags(
  $build['#cache']['tags'],
  Cache::buildTags('node', [5, 9]),
);`,
      note: "Drupal 10/11 also emit bundle-specific list tags (node_list:incident), so a dashboard of incidents is not invalidated every time an unrelated article is saved. Prefer them over the blunt node_list.",
    },
    {
      label: "Merging metadata a service produced",
      intro:
        "A block calls a service that reads config and an entity. The output depends on both — and in Drupal that dependency has to be expressed as data, or the block will happily serve yesterday's numbers.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: the service returns a value. Any cache implications are
// tribal knowledge you have to re-derive at every call site.
final class IncidentSummary
{
    public function __construct(
        private IncidentRepository $repo,
        private ParameterBagInterface $params,
    ) {}

    public function build(): array
    {
        return [
            'open'      => $this->repo->countByStatus('open'),
            'threshold' => $this->params->get('incident.sla_threshold'),
        ];
    }
}

// Caller has to know that this depends on incidents AND on a parameter,
// and reproduce that knowledge in its own cache key / TTL.`,
      ts: `use Drupal\\Core\\Cache\\CacheableMetadata;

// The service returns a value object that CARRIES its cacheability.
public function build(): array {
  $config = $this->configFactory->get('incident_tracker.settings');
  $latest = $this->storage->loadLatest();

  $build = [
    '#theme' => 'incident_summary',
    '#open' => $this->countOpen(),
    '#threshold' => $config->get('sla_threshold'),
  ];

  // One call per dependency. Each object hands over its own
  // tags + contexts + max-age.
  $this->renderer->addCacheableDependency($build, $config);
  $this->renderer->addCacheableDependency($build, $latest);

  // Equivalent, when you need to inspect or adjust before applying:
  CacheableMetadata::createFromRenderArray($build)
    ->addCacheTags(['node_list:incident'])
    ->addCacheContexts(['user.permissions'])
    ->setCacheMaxAge(Cache::mergeMaxAges(3600, $build['#cache']['max-age'] ?? Cache::PERMANENT))
    ->applyTo($build);

  return $build;
}`,
      note: "Careful: addCacheableDependency() with an object that does NOT implement CacheableDependencyInterface sets max-age to 0. That is deliberate — unknown dependency means unsafe to cache — but it is also a silent performance cliff, so check what you are passing.",
    },
    {
      label: "Turning the debug output on",
      intro:
        "You cannot fix bubbling you cannot see. Both stacks hide the diagnostics behind a dev-only config file.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/dev/web_profiler.yaml — Symfony
framework:
  profiler:
    collect: true
  http_cache:
    enabled: false        # usually off in dev, so you profile the app

web_profiler:
  toolbar: true

# Reading cache behaviour means inspecting response headers by hand:
#   Cache-Control: public, s-maxage=300
#   Vary: Accept-Language, Cookie
# ...and trusting that your invalidation code ran.`,
      ts: `# sites/development.services.yml — Drupal 10/11
parameters:
  http.response.debug_cacheability_headers: true
  twig.config:
    debug: true
    auto_reload: true
    cache: false
  renderer.config:
    # Drupal 9.5+: wraps each element in HTML comments showing its
    # cache keys / tags / contexts / max-age and whether it was a hit.
    debug: true
    required_cache_contexts: ['languages:language_interface', 'theme', 'user.permissions']
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: []

# Then read the response:
#   X-Drupal-Cache-Tags: config:incident_tracker.settings node_list:incident
#   X-Drupal-Cache-Contexts: languages:language_interface theme url.query_args:status
#   X-Drupal-Cache-Max-Age: 300
#   X-Drupal-Dynamic-Cache: UNCACHEABLE`,
      note: "required_cache_contexts is why 'theme' and 'languages:language_interface' show up on output you never annotated — core adds them to every page. X-Drupal-Dynamic-Cache: UNCACHEABLE almost always means a max-age of 0 bubbled up from somewhere.",
    },
  ],

  playground: {
    intro:
      "Drupal's bubbling in miniature: a dashboard render array with #cache on four levels. Union the tags, union-then-optimize the contexts, take the minimum max-age, then build the cache ID twice — once from the metadata the element declared, once from what actually bubbled (that pair is the cache redirect). Finally, delete one context from a nested child and watch two different requests collide on the same CID. Predict the output first.",
    lang: "php",
    code: `<?php
// Drupal's cacheability bubbling, in miniature. No Drupal, no bootstrap.

const PERMANENT = -1; // Cache::PERMANENT

/** Cache::mergeMaxAges(): the LOWEST wins; PERMANENT (-1) means "infinite". */
function merge_max_ages(int $a, int $b): int {
  if ($a === PERMANENT) {
    return $b;
  }
  if ($b === PERMANENT) {
    return $a;
  }
  return min($a, $b);
}

/**
 * CacheContextsManager::optimizeTokens(): an ancestor context already varies
 * more finely than its descendants, so 'user' makes 'user.permissions'
 * redundant, and 'url' makes 'url.query_args:status' redundant.
 */
function optimize_contexts(array $contexts, bool $verbose = TRUE): array {
  $contexts = array_values(array_unique($contexts));
  sort($contexts);
  $kept = [];
  foreach ($contexts as $context) {
    $redundant = FALSE;
    foreach ($contexts as $other) {
      if ($other === $context) {
        continue;
      }
      if (str_starts_with($context, $other . '.') || str_starts_with($context, $other . ':')) {
        $redundant = TRUE;
        break;
      }
    }
    if ($redundant) {
      if ($verbose) {
        echo "  optimized away: $context (an ancestor already varies more finely)\\n";
      }
    }
    else {
      $kept[] = $context;
    }
  }
  return $kept;
}

/** Bubble a child's #cache metadata into its parent, depth-first. */
function bubble(array $element): array {
  $meta = [
    'contexts' => $element['#cache']['contexts'] ?? [],
    'tags' => $element['#cache']['tags'] ?? [],
    'max-age' => $element['#cache']['max-age'] ?? PERMANENT,
  ];
  foreach ($element as $key => $child) {
    if (is_array($child) && $key[0] !== '#') {
      $child_meta = bubble($child);
      $meta['contexts'] = array_merge($meta['contexts'], $child_meta['contexts']);
      $meta['tags'] = array_merge($meta['tags'], $child_meta['tags']);
      $meta['max-age'] = merge_max_ages($meta['max-age'], $child_meta['max-age']);
    }
  }
  $meta['tags'] = array_values(array_unique($meta['tags']));
  sort($meta['tags']);
  return $meta;
}

/** CacheContextsManager::convertTokensToKeys(): contexts become CID parts. */
function cid(array $keys, array $contexts, array $request): string {
  sort($contexts);
  $parts = $keys;
  foreach ($contexts as $context) {
    $parts[] = $context . '=' . ($request[$context] ?? 'NULL');
  }
  return implode(':', $parts);
}

$dashboard = [
  '#cache' => [
    'keys' => ['incident_tracker', 'dashboard'],
    'contexts' => ['theme', 'languages:language_interface'],
    'tags' => ['config:incident_tracker.settings'],
  ],
  'summary' => [
    '#cache' => ['tags' => ['node_list:incident'], 'max-age' => 300],
  ],
  'table' => [
    '#cache' => ['contexts' => ['url.query_args:status'], 'tags' => ['node:5', 'node:9']],
    'row_actions' => [
      '#cache' => ['contexts' => ['user.permissions'], 'tags' => ['user:3']],
    ],
  ],
  'footer' => [
    '#cache' => ['contexts' => ['user'], 'tags' => ['config:system.site']],
  ],
];

echo "Bubbling up from the leaves:\\n";
$meta = bubble($dashboard);
$meta['contexts'] = optimize_contexts($meta['contexts']);

echo "\\nContexts on the root after bubbling + optimization:\\n";
print_r($meta['contexts']);
echo "Tags:\\n";
print_r($meta['tags']);
echo 'Max-age: ' . ($meta['max-age'] === PERMANENT ? 'PERMANENT' : $meta['max-age'] . 's') . "\\n";

// The element declared 'keys', so it gets its own render-cache entry.
$request = [
  'theme' => 'incident_theme',
  'languages:language_interface' => 'en',
  'url.query_args:status' => 'open',
  'user' => '17',
];
$declared = $dashboard['#cache']['contexts'];
$keys = $dashboard['#cache']['keys'];

echo "\\nPre-bubbling CID  (lookup #1 -> CacheRedirect):\\n  " . cid($keys, $declared, $request) . "\\n";
echo "Post-bubbling CID (lookup #2 -> the real entry):\\n  " . cid($keys, $meta['contexts'], $request) . "\\n";

// Now the classic bug: someone deletes the context on the nested table.
unset($dashboard['table']['#cache']['contexts']);
$broken = bubble($dashboard);
$broken['contexts'] = optimize_contexts($broken['contexts'], FALSE);

echo "\\nForgot 'url.query_args:status' on a nested child:\\n";
foreach (['open', 'closed'] as $status) {
  $request['url.query_args:status'] = $status;
  echo "  ?status=$status -> " . cid($keys, $broken['contexts'], $request) . "\\n";
}
echo "  Same CID for both -> the second visitor is served the first one's rows.\\n";
`,
    output: `Bubbling up from the leaves:
  optimized away: user.permissions (an ancestor already varies more finely)

Contexts on the root after bubbling + optimization:
Array
(
    [0] => languages:language_interface
    [1] => theme
    [2] => url.query_args:status
    [3] => user
)
Tags:
Array
(
    [0] => config:incident_tracker.settings
    [1] => config:system.site
    [2] => node:5
    [3] => node:9
    [4] => node_list:incident
    [5] => user:3
)
Max-age: 300s

Pre-bubbling CID  (lookup #1 -> CacheRedirect):
  incident_tracker:dashboard:languages:language_interface=en:theme=incident_theme
Post-bubbling CID (lookup #2 -> the real entry):
  incident_tracker:dashboard:languages:language_interface=en:theme=incident_theme:url.query_args:status=open:user=17

Forgot 'url.query_args:status' on a nested child:
  ?status=open -> incident_tracker:dashboard:languages:language_interface=en:theme=incident_theme:user=17
  ?status=closed -> incident_tracker:dashboard:languages:language_interface=en:theme=incident_theme:user=17
  Same CID for both -> the second visitor is served the first one's rows.
`,
  },

  keyPoints: [
    "'keys' is the only one of the four that makes an element independently cacheable — CID = keys plus the resolved value of every cache context. Without keys the metadata still bubbles and still drives Dynamic Page Cache and Page Cache.",
    "Contexts VARY (user.permissions, url.query_args:status, languages:language_interface, theme, route), tags INVALIDATE (node:5, node_list:incident, config:incident_tracker.settings, user:3), max-age EXPIRES (0 = never cacheable, Cache::PERMANENT = -1 = until a tag fires).",
    "Bubbling is union for tags and contexts and MINIMUM for max-age, so one nested element with 'user' re-keys the page per account and one max-age => 0 makes the whole response UNCACHEABLE.",
    "Contexts are hierarchical: 'user' is an ancestor of 'user.permissions' and subsumes it during optimization — so accidentally adding the broad context silently destroys the cache-hit rate of everything beneath it.",
    "$renderer->addCacheableDependency($build, $entityOrConfig) merges an object's tags/contexts/max-age in one line; anything not implementing CacheableDependencyInterface forces max-age 0.",
    "For hand-rolled merges use CacheableMetadata::createFromRenderArray()/createFromObject()->merge()->applyTo(), or the Cache::mergeTags()/mergeContexts()/mergeMaxAges() array helpers — and debug with http.response.debug_cacheability_headers plus renderer.config.debug (9.5+).",
  ],

  interview: [
    {
      q: "A block on the incident dashboard shows stale data after an editor saves an incident. Walk me through how you would diagnose and fix it.",
      a: "First I would establish which layer is serving the stale copy: turn on `http.response.debug_cacheability_headers` in `sites/development.services.yml` and read `X-Drupal-Cache-Tags` and `X-Drupal-Dynamic-Cache`. If the incident's tag (`node:5`, or `node_list:incident` for a listing) is missing from that header, the block never declared the dependency, so nothing invalidated it — the fix is `$this->renderer->addCacheableDependency($build, $incident)` or `$build['#cache']['tags'] = Cache::mergeTags(..., $incident->getCacheTags())`. If the tag *is* present, the bug is on the write path: something loaded the data outside entity storage (a raw database query, an external API) so `save()` never invalidated it, and I need my own tag plus an explicit `Cache::invalidateTags()`. The tell-tale wrong answer is to slap `'max-age' => 0` on the block — that fixes staleness by destroying the cacheability of every ancestor, including the page.",
    },
    {
      q: "What is the difference between a cache context and a cache tag, and when would you reach for max-age instead?",
      a: "A context describes *variation*: the same logical output rendered differently depending on something about the request or the actor — `user.permissions`, `url.query_args:status`, `languages:language_interface`, `theme`. It is Drupal's declarative `Vary`, and it becomes part of the cache ID, so each context multiplies the number of stored variants. A tag describes *dependency*: `node:5` means 'this output is derived from node 5', and saving that node invalidates every entry carrying the tag, everywhere, in every bin. Contexts and tags are orthogonal — a listing typically has both. `max-age` is the fallback for data whose freshness is genuinely time-based and cannot be expressed as a dependency, such as a third-party API response; because it bubbles as a minimum it is the most dangerous of the four, and `max-age => 0` should be a last resort behind `#lazy_builder` placeholdering.",
    },
    {
      q: "Explain bubbling, and why a `#cache['keys']` element needs two cache lookups.",
      a: "Every element's `#cache` metadata is merged into its parent's after the child renders: tags and contexts union, max-age takes the minimum, and `#attached` merges too (that is `BubbleableMetadata` rather than plain `CacheableMetadata`). The consequence is that cacheability is a property of a subtree, not of one element, so a deeply nested row action varying by `user` re-keys the entire page. That creates an ordering problem for a keyed element: the cache ID depends on the contexts, but the full context set is only known after rendering the children. Core resolves it with a **cache redirect** — the CID built from the contexts you declared up front stores a `CacheRedirect` object pointing at the CID built from the post-bubbling contexts, so a hit costs two `get()` calls. It is also a good argument for declaring the contexts you know about honestly rather than leaving them all to bubble.",
    },
    {
      q: "You are porting a Symfony service that caches an expensive API call in a PSR-6 pool. How does that change in Drupal?",
      a: "The direct translation is a cache backend — `\\Drupal::cache('default')->set($cid, $data, $expire, $tags)` — and that is fine for raw *data*. But if the result is going to be rendered, the more idiomatic move is to put the cacheability on the render array instead: `'#cache' => ['keys' => [...], 'tags' => ['incident_tracker:remote_status'], 'max-age' => 300]`, and invalidate the custom tag from whatever knows the remote data changed (a webhook, a cron job). The win is that the metadata bubbles: Dynamic Page Cache, Page Cache, a reverse proxy driven by the purge module and any parent render-cache entry all learn about the dependency for free, whereas a PSR-6 pool is invisible to every layer above it. In Symfony you would have to invalidate the pool item *and* the HTTP cache entries separately, and keep those two lists in sync by hand.",
    },
  ],

  quiz: [
    {
      question:
        "A dashboard element declares '#cache' => ['keys' => ['incident_tracker','dashboard'], 'contexts' => ['theme']]. A grandchild declares 'contexts' => ['user'] and 'max-age' => 0. What happens to the page?",
      options: [
        "Only the grandchild is uncacheable; the dashboard still caches per theme",
        "The dashboard, and every ancestor up to the response, becomes uncacheable and varies by user",
        "The keys on the dashboard win, so the grandchild's metadata is ignored",
        "Drupal throws an exception because max-age 0 conflicts with cache keys",
      ],
      answerIndex: 1,
      explain:
        "Bubbling unions contexts and takes the minimum max-age, and it does not stop at an element that has keys. The zero propagates all the way to the response — X-Drupal-Dynamic-Cache: UNCACHEABLE — and 'user' would have re-keyed the entry per account even without it. The fix is to cut the grandchild out with a #lazy_builder placeholder rather than to accept the poison.",
    },
    {
      question:
        "Which is the correct way to make a block invalidate whenever any incident node is created, edited or deleted?",
      options: [
        "'#cache' => ['max-age' => 0]",
        "'#cache' => ['contexts' => ['node_list']]",
        "'#cache' => ['tags' => ['node_list:incident']]",
        "Call \\Drupal::cache()->deleteAll() in hook_node_update()",
      ],
      answerIndex: 2,
      explain:
        "That is a dependency, so it is a tag. Core's entity storage invalidates node_list and the bundle-specific node_list:incident on every save and delete, so the block updates by itself. 'node_list' is not a valid context (contexts describe request/actor variation), max-age 0 disables caching instead of invalidating it, and deleteAll() is a sledgehammer that also nukes unrelated entries.",
    },
    {
      question:
        "Both 'user' and 'user.permissions' bubble to the same element. What does Drupal's cache-context optimizer store?",
      options: [
        "Both, joined into the cache ID",
        "Only 'user.permissions', because it has lower cardinality",
        "Only 'user', because it is an ancestor and already varies more finely",
        "Neither — conflicting contexts are dropped and max-age is set to 0",
      ],
      answerIndex: 2,
      explain:
        "Cache contexts form a hierarchy where the ancestor is the more granular variation: if output varies per user, it necessarily varies per permission set, so 'user.permissions' is redundant and dropped. This is why an accidental 'user' context is so expensive — it silently swallows the cheaper contexts beneath it and gives you one cache entry per account.",
    },
    {
      question:
        "What does $renderer->addCacheableDependency($build, $someObject) do when $someObject does not implement CacheableDependencyInterface?",
      options: [
        "Nothing — the call is a no-op",
        "Throws an \\InvalidArgumentException",
        "Sets $build['#cache']['max-age'] to 0, making the subtree uncacheable",
        "Adds a cache tag derived from the object's class name",
      ],
      answerIndex: 2,
      explain:
        "CacheableMetadata::createFromObject() treats an unknown object as having no declarable cacheability, which is only safe to represent as max-age 0. Correct but expensive: passing a plain value object or a stdClass from a third-party API is a classic way to silently make a whole route UNCACHEABLE, so check what you hand to that call.",
    },
  ],
};

export default lesson;

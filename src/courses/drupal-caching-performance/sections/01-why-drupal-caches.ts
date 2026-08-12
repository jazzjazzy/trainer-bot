import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-drupal-caches",
  title: "The Cacheability Contract: Why Drupal Caches Like This",
  part: "The Cacheability Model",
  estMinutes: 12,
  summary:
    "In Symfony you decide cacheability at one layer and own invalidation yourself; in Drupal every render array, entity, config object and access result carries tags, contexts and max-age that merge upward automatically — this is the contract everything else in the course builds on.",

  concept: `
You know how to make a Symfony response cacheable: set \`Cache-Control\` in the
controller, or hang a \`#[Cache(maxage: 600, public: true)]\` attribute on it, or
run \`HttpCache\` in front and add \`s-maxage\`. The decision is made **at one
layer**, by the code that owns the response, and *you* remember to purge the
right keys when data changes.

Drupal cannot work that way. A page is assembled from a route controller, a
dozen blocks, a menu, a views listing and whatever three contributed modules
decided to inject via \`hook_preprocess\` — none of which know about each other.
If cacheability were a decision made at the top, the top would have to know
everything below it. So Drupal inverts it.

## Cacheability is metadata that travels with the output

Every piece of renderable output carries a \`#cache\` array:

\`\`\`php
$build['incident_feed'] = [
  '#theme' => 'item_list',
  '#items' => $items,
  '#cache' => [
    'keys' => ['incident_feed', 'sidebar'],
    'tags' => ['node_list:incident'],
    'contexts' => ['url.query_args:region'],
    'max-age' => 300,
  ],
];
\`\`\`

The same three values are exposed by entities, config objects, access results,
blocks, plugins and responses — anything implementing
\`Drupal\\Core\\Cache\\CacheableDependencyInterface\` answers
\`getCacheTags()\`, \`getCacheContexts()\` and \`getCacheMaxAge()\`. The renderer
**bubbles** that metadata up the tree: the parent's cacheability is the union of
its own and every child's. You never compute it; you only declare your own bit
honestly.

## The three questions

- **Tags — when does this become wrong?** Identity-based invalidation.
  \`node:412\`, \`node_list\`, \`config:system.site\`, \`user:7\`. Saving that node
  invalidates every cache entry anywhere that listed \`node:412\`. This is the
  part Symfony makes you do by hand.
- **Contexts — what does this vary by?** \`user.permissions\`, \`theme\`,
  \`url.path\`, \`languages:language_interface\`, \`route\`. A context is resolved to
  a concrete value at request time and folded into the cache ID, so one
  declaration produces N cache variations. Roughly Symfony's \`Vary\`, except it
  works for fragments, not just the whole response.
- **Max-age — how long is it valid?** Seconds, or \`Cache::PERMANENT\` (\`-1\`) for
  "until a tag says otherwise". \`0\` means uncacheable.

Merging is not symmetric. Tags and contexts **union**. Max-age takes the
**minimum of the finite values** — \`Cache::PERMANENT\` (\`-1\`) behaves as
infinity and is skipped, so a single \`0\` anywhere makes the whole page
uncacheable — the most common performance bug on a Drupal site.

## Why this buys aggressive caching

Because a contributed module can declare its own dependencies without touching
your controller, Drupal can cache almost everything by default and still be
correct. Auto-placeholdering is the escape hatch — but you have to opt in.
Give a highly-variable fragment (a user menu, a "you have 3 unread" counter) a
\`#lazy_builder\` callback and, if its cacheability matches \`renderer.config\`'s
\`auto_placeholder_conditions\` (max-age 0, or a \`session\`/\`user\` context),
Drupal replaces it with a placeholder automatically so its nasty contexts never
poison the parent.

The discipline for the rest of this course: **under-declaring gives you stale
pages; over-declaring gives you a cache that never hits.** Both are bugs.
`,

  comparisons: [
    {
      label: "Declaring cacheability",
      intro:
        "The incident feed on the news site should be cacheable for 5 minutes and vary by the region query argument. Compare where that decision lives.",
      php: `// Symfony: the controller owns the whole response's cacheability.
#[Route('/incidents', name: 'incident_feed')]
#[Cache(maxage: 300, public: true, vary: ['Accept-Language'])]
public function feed(Request $request, IncidentRepo $repo): Response
{
    $region = $request->query->get('region');
    $response = $this->render('incidents/feed.html.twig', [
        'incidents' => $repo->latest($region),
    ]);

    // Varying by a query arg is on you: either put it in the URL and let
    // the reverse proxy key on it, or set Vary and hope upstream honours it.
    $response->setVary(['Accept-Language'], false);
    return $response;
}`,
      ts: `// Drupal: the fragment declares its own dependencies. Nothing above it
// needs to know they exist — the renderer bubbles them to the response.
public function feed(): array {
  $region = $this->requestStack->getCurrentRequest()->query->get('region');

  return [
    '#theme' => 'item_list',
    '#items' => $this->repo->latest($region),
    '#cache' => [
      // Reusable identity of THIS fragment, so it can be cached standalone.
      'keys' => ['incident_feed'],
      // Invalidate whenever any incident node is created/updated/deleted.
      'tags' => ['node_list:incident'],
      // One declaration -> one cache variation per region + per language.
      'contexts' => ['url.query_args:region', 'languages:language_interface'],
      'max-age' => 300,
    ],
  ];
}`,
      note: "Symfony's cacheability is a property of the response; Drupal's is a property of every fragment, merged upward. That is the whole difference.",
    },
    {
      label: "Invalidation: manual keys vs automatic tags",
      intro:
        "An editor corrects a headline on incident node 412. Both stacks must drop every cached fragment that embedded it — a teaser on the front page, a sidebar 'related' list, a JSON feed.",
      php: `// Symfony: TagAwareAdapter gives you tags, but YOU must remember to tag
// every entry and to invalidate on every write path.
public function save(Incident $incident): void
{
    $this->em->flush();

    // Miss one call site and that fragment is stale forever.
    $this->cache->invalidateTags([
        'incident-' . $incident->getId(),
        'incident-list',
    ]);

    // The HTTP layer is separate again: purge Varnish yourself.
    $this->purger->purge('/incidents/' . $incident->getSlug());
}`,
      ts: `// Drupal: $node->save() already did it. EntityBase::postSave() invalidates
// the entity's own tags plus the entity-type list tags.
$node = Node::load(412);
$node->set('title', 'Corrected: bridge reopened')->save();
// -> invalidates 'node:412', 'node_list', 'node_list:incident'

// Anything that declared those tags — render caches, dynamic page cache,
// the page cache, a CacheableJsonResponse — is now stale. You only write
// invalidation code for data Drupal does not own:
\\Drupal\\Core\\Cache\\Cache::invalidateTags(['incident_api:feed']);

// Reverse proxies get the same signal via the purge/varnish contrib stack,
// driven by the very same tags rather than a hand-maintained URL list.`,
      note: "Because tags are declared where the data is used, not where it is written, adding a new fragment never means editing an invalidation routine.",
    },
    {
      label: "Varying by the current user",
      intro:
        "A 'Report an update' link must appear only for users with the right permission. Getting this wrong is how one user's page gets served to everyone.",
      php: `// Symfony: any per-user output usually forces the response private.
$canReport = $this->isGranted('ROLE_REPORTER');

$response = $this->render('incident/show.html.twig', [
    'incident' => $incident,
    'canReport' => $canReport,
]);

// Shared caches are now off the table for the whole page, even though
// 99% of the markup is identical for everyone.
$response->setPrivate();
return $response;`,
      ts: `// Drupal: declare the dependency; the cache varies, it does not disable.
$access = $this->entityTypeManager
  ->getAccessControlHandler('node')
  ->access($incident, 'update', $this->currentUser, TRUE);

$build['report_link'] = [
  '#type' => 'link',
  '#title' => $this->t('Report an update'),
  '#url' => $incident->toUrl('edit-form'),
  '#access' => $access->isAllowed(),
];
// AccessResult implements CacheableDependencyInterface, so merge it in:
\\Drupal\\Core\\Render\\BubbleableMetadata::createFromRenderArray($build)
  ->addCacheableDependency($access)
  ->applyTo($build);

// Result: contexts gain 'user.permissions' — one cached variation per
// distinct permission set, not per user. Anonymous traffic still shares one.`,
      note: "'user.permissions' is the workhorse context: it hashes the permission set, so thousands of anonymous visitors collapse into a single cache entry.",
    },
    {
      label: "Seeing the metadata",
      intro:
        "Turn on cacheability debug headers so you can read what actually bubbled to the response instead of guessing.",
      php: `# Symfony: config/packages/framework.yaml
framework:
  http_cache:
    enabled: true
    debug: '%kernel.debug%'

# HttpCache then emits X-Symfony-Cache: GET /incidents: fresh
# You still read Cache-Control / Vary by hand to work out why.`,
      ts: `# Drupal: sites/development.services.yml (NEVER in production)
parameters:
  http.response.debug_cacheability_headers: true

# Then every response carries the merged metadata:
#   X-Drupal-Cache-Tags: config:system.site node:412 node_list rendered
#   X-Drupal-Cache-Contexts: languages:language_interface theme url.path
#   X-Drupal-Cache-Max-Age: 300
#   X-Drupal-Dynamic-Cache: MISS
#   X-Drupal-Cache: HIT     (internal page cache, anonymous only)`,
      note: "Reading X-Drupal-Cache-Contexts is the fastest way to find the one rogue context that split your cache a thousand ways.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the bubbling rules: tags and contexts union, max-age takes the minimum. Pass 2 shows what a placeholder buys you — predict the page's max-age before you run it.",
    lang: "php",
    code: `<?php
// A 60-line model of Drupal's cacheability bubbling. No Drupal, no bootstrap.
// Cache::PERMANENT is -1 in core; 0 means "do not cache at all".
const PERMANENT = -1;

// Merging rules, exactly as Drupal\\Core\\Cache\\Cache does it:
// tags + contexts are a UNION, max-age is the MINIMUM (ignoring PERMANENT).
function merge_max_ages(array $ages): int {
  $finite = array_values(array_filter($ages, fn($a) => $a !== PERMANENT));
  return $finite === [] ? PERMANENT : min($finite);
}

function bubble(array $el, array &$out): array {
  $tags = $el['tags'] ?? [];
  $contexts = $el['contexts'] ?? [];
  $ages = [$el['max-age'] ?? PERMANENT];
  foreach ($el['children'] ?? [] as $child) {
    $m = bubble($child, $out);
    // A placeholder renders later, on its own: its metadata does NOT bubble.
    if (!empty($child['placeholder'])) {
      continue;
    }
    $tags = array_merge($tags, $m['tags']);
    $contexts = array_merge($contexts, $m['contexts']);
    $ages[] = $m['max-age'];
  }
  $tags = array_unique($tags);
  $contexts = array_unique($contexts);
  sort($tags);
  sort($contexts);
  $out[$el['name']] = [
    'tags' => array_values($tags),
    'contexts' => array_values($contexts),
    'max-age' => merge_max_ages($ages),
  ];
  return $out[$el['name']];
}

function report(string $title, array $tree): array {
  $out = [];
  $root = bubble($tree, $out);
  echo "=== $title ===\\n";
  foreach ($out as $name => $m) {
    printf("  %-18s max-age=%-3d tags=[%s] contexts=[%s]\\n",
      $name, $m['max-age'], implode(' ', $m['tags']), implode(' ', $m['contexts']));
  }
  return $root;
}

$user_menu = [
  'name' => 'user_menu',
  'contexts' => ['user'],
  'tags' => ['user:7'],
  'max-age' => 0,
];

$page = [
  'name' => 'page',
  'contexts' => ['theme', 'url.path'],
  'tags' => ['config:system.site'],
  'children' => [
    ['name' => 'breaking_banner', 'tags' => ['node_list'], 'max-age' => 60],
    [
      'name' => 'article',
      'tags' => ['node:412'],
      'contexts' => ['languages:language_interface'],
      'children' => [
        ['name' => 'comment_form_link', 'contexts' => ['user.permissions']],
      ],
    ],
    $user_menu,
  ],
];

$root = report('Pass 1: user menu rendered inline', $page);
echo "  -> page is UNCACHEABLE (max-age 0): one tiny element poisoned the tree\\n\\n";

// Now render the same menu through a placeholder (#lazy_builder).
$page['children'][2]['placeholder'] = TRUE;
$root = report('Pass 2: user menu behind a placeholder', $page);

// Cache contexts are resolved to concrete values to form the cache ID.
$values = [
  'theme' => 'olivero',
  'url.path' => '/incidents/live',
  'languages:language_interface' => 'en',
  'user.permissions' => 'ph.4f2a',
];
$parts = ['page_view'];
foreach ($root['contexts'] as $c) {
  $parts[] = $c . '=' . $values[$c];
}
echo "  -> cache ID: " . implode(':', $parts) . "\\n";
echo "  -> invalidating node:412 marks this entry stale; the placeholder never cached\\n";
`,
    output: `=== Pass 1: user menu rendered inline ===
  breaking_banner    max-age=60  tags=[node_list] contexts=[]
  comment_form_link  max-age=-1  tags=[] contexts=[user.permissions]
  article            max-age=-1  tags=[node:412] contexts=[languages:language_interface user.permissions]
  user_menu          max-age=0   tags=[user:7] contexts=[user]
  page               max-age=0   tags=[config:system.site node:412 node_list user:7] contexts=[languages:language_interface theme url.path user user.permissions]
  -> page is UNCACHEABLE (max-age 0): one tiny element poisoned the tree

=== Pass 2: user menu behind a placeholder ===
  breaking_banner    max-age=60  tags=[node_list] contexts=[]
  comment_form_link  max-age=-1  tags=[] contexts=[user.permissions]
  article            max-age=-1  tags=[node:412] contexts=[languages:language_interface user.permissions]
  user_menu          max-age=0   tags=[user:7] contexts=[user]
  page               max-age=60  tags=[config:system.site node:412 node_list] contexts=[languages:language_interface theme url.path user.permissions]
  -> cache ID: page_view:languages:language_interface=en:theme=olivero:url.path=/incidents/live:user.permissions=ph.4f2a
  -> invalidating node:412 marks this entry stale; the placeholder never cached
`,
  },

  keyPoints: [
    "Cacheability in Drupal is metadata attached to output, not a decision made at one layer — render arrays, entities, config objects, access results and responses all carry tags, contexts and max-age.",
    "Tags answer 'when does this become wrong' (identity-based invalidation), contexts answer 'what does this vary by' (folded into the cache ID), max-age answers 'how long is it valid'.",
    "Merging is asymmetric: tags and contexts union upward, max-age takes the minimum — so a single max-age 0 anywhere makes the entire page uncacheable.",
    "Entity saves invalidate their own tags and the entity-type list tags automatically; you only write invalidation code for data Drupal does not own.",
    "Bubbling is what lets arbitrary contributed code inject content anywhere without breaking correctness — the parent never needs to know what its children depend on.",
    "Set http.response.debug_cacheability_headers: true in sites/development.services.yml to read X-Drupal-Cache-Tags, X-Drupal-Cache-Contexts and X-Drupal-Cache-Max-Age off the response.",
  ],

  interview: [
    {
      q: "You come from Symfony, where you set Cache-Control on the response. Explain how Drupal's model differs and why.",
      a: "In Symfony the response owns its cacheability: I set `max-age`/`s-maxage` in the controller or with a `#[Cache]` attribute, and I own invalidation — usually by calling `invalidateTags()` on a `TagAwareAdapter` and purging the proxy myself. Drupal inverts that because a page is assembled from many independent producers: a controller, blocks, menus, views, and contributed modules injecting content via hooks. So every fragment declares its own **cache tags, cache contexts and max-age**, and the renderer bubbles that metadata upward — the parent's cacheability is the union of its children's. The practical consequence is that I never compute a page's cacheability; I only declare my own fragment's dependencies honestly, and correctness composes. It also means a bug in one small block, like a hardcoded `max-age: 0`, degrades the whole page."
    },
    {
      q: "What is the difference between a cache tag and a cache context, and when would you reach for max-age instead?",
      a: "A **tag** is an invalidation signal keyed on identity — `node:412`, `node_list:incident`, `config:system.site`, `user:7`. It says *this cached thing becomes wrong when that thing changes*, and saving the entity fires it automatically. A **context** is a cache-key dimension — `user.permissions`, `languages:language_interface`, `url.query_args:region`, `theme`. It says *this output differs depending on X*, so Drupal stores one variation per resolved value. Tags control invalidation; contexts control multiplication, so a careless context (`user` or `session` instead of `user.permissions`) can explode your cache into per-visitor entries and destroy your hit rate. **Max-age** is the fallback for data whose changes Drupal cannot observe — a third-party weather or wire-service API with no tag to hang off. Prefer tags; use max-age only when nothing can tell you the data changed."
    },
    {
      q: "A news site's front page shows X-Drupal-Cache-Max-Age: 0 and Dynamic Page Cache always MISSes. How do you debug it?",
      a: "Max-age merges by minimum, so something in the tree declared `0`. I'd enable `http.response.debug_cacheability_headers` in `sites/development.services.yml`, then bisect: disable blocks or regions until the header stops being `0`, or use the `webprofiler`/`renderviz` tooling to inspect per-fragment metadata. Common culprits are a custom block that sets `'#cache' => ['max-age' => 0]` as a lazy workaround, a form embedded directly in the page, or a controller returning a plain `Response` with no cacheability. The fix is usually one of three things: replace `max-age 0` with the correct **tags** so it invalidates precisely; move the genuinely per-user bit behind a `#lazy_builder` placeholder so its metadata stops bubbling; or, if it truly is per-request, accept it but keep it isolated. I'd also check the contexts header for a rogue `user` or `session` context, which is the same class of bug expressed as cache fragmentation instead of no caching at all."
    },
  ],

  quiz: [
    {
      question:
        "A page's render tree contains fragments with max-age values of -1 (PERMANENT), 3600, 600 and 0. What max-age bubbles up to the page?",
      options: ["-1 (PERMANENT)", "3600", "600", "0"],
      answerIndex: 3,
      explain:
        "Max-age merges by taking the minimum, ignoring PERMANENT. A single 0 anywhere in the tree makes the whole page uncacheable — which is why one careless block can flatten a site's hit rate.",
    },
    {
      question:
        "A block shows the current user's unread-notification count. Which is the correct first move?",
      options: [
        "Set '#cache' => ['max-age' => 0] on the block so it is never cached",
        "Add the 'user' cache context and render it inline",
        "Render it through a #lazy_builder placeholder so its metadata does not bubble into the page",
        "Add a 'user:N' cache tag and cache it permanently",
      ],
      answerIndex: 2,
      explain:
        "Both max-age 0 and a bare 'user' context poison the parent — one kills caching outright, the other forces a per-user copy of the entire page. A placeholder isolates the variable fragment so the surrounding page stays broadly cacheable, which is exactly what Drupal's auto-placeholdering does for you.",
    },
    {
      question:
        "Which statement about cache tags in Drupal is correct?",
      options: [
        "You must call Cache::invalidateTags() yourself after every $node->save()",
        "Saving an entity automatically invalidates its own cache tags and its entity-type list tags",
        "Cache tags are resolved to concrete values and folded into the cache ID",
        "Cache tags are only honoured by the internal page cache, not by render caching",
      ],
      answerIndex: 1,
      explain:
        "Entity save invalidates 'node:412' plus list tags like 'node_list' automatically — you only invalidate manually for data Drupal does not own (an external API feed, say). Being resolved into the cache ID is what contexts do, not tags.",
    },
    {
      question:
        "Why does the metadata-that-bubbles design let Drupal cache more aggressively than a 'decide at the controller' design?",
      options: [
        "Because it stores every fragment in Redis rather than the database",
        "Because contributed code can inject content anywhere and still declare its own dependencies, so the top of the tree never needs to know what is below it",
        "Because it lets Drupal ignore Cache-Control headers sent by reverse proxies",
        "Because render arrays are serialised faster than Twig output",
      ],
      answerIndex: 1,
      explain:
        "Composability is the point. A controller cannot know that a contributed module hooked a per-user widget into its page, but that widget can declare its own contexts and tags — so Drupal can cache by default and stay correct.",
    },
  ],
};

export default lesson;

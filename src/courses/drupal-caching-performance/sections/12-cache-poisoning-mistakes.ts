import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "cache-poisoning-mistakes",
  title: "The Classic Caching Bugs",
  part: "Page & Render Caching Layers",
  estMinutes: 13,
  summary:
    "A field guide to the six caching bugs that actually ship — stale listings, cross-user leakage, a max-age 0 block poisoning the whole page, forgotten config dependencies, object-armed lazy builders and cron-driven cache rebuilds — with the header or render-array evidence that identifies each one.",

  concept: `
## Every caching bug is a missing dependency

Drupal's cache is not "sometimes wrong". It returns exactly what you declared.
Every bug in this section is the same mistake wearing a different hat: the
output depends on something you did not write down in \`#cache\`. Learn to read
the evidence and the diagnosis takes a minute instead of an afternoon.

Turn the evidence on first. In \`sites/development.services.yml\`:

\`\`\`yaml
parameters:
  http.response.debug_cacheability_headers: true
\`\`\`

Rebuild, then curl a page and read the four headers that matter:

\`\`\`bash
curl -sI https://incidents.example.com/latest | grep -i '^x-drupal'
# X-Drupal-Cache: MISS   <- internal page cache (anonymous only)
# X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)   <- dynamic page cache
# X-Drupal-Cache-Tags: node:12 node:13 rendered
# X-Drupal-Cache-Contexts: languages:language_interface theme url.path
\`\`\`

The parenthesised reason arrived in Drupal 10.4 / 11.1; older 10.x prints a bare
\`UNCACHEABLE\`.

Debug headers are a development tool — never enable them in production, where
they leak your site's structure and can blow past proxy header limits.

## The catalogue

**(a) Stale listing.** The "Latest incidents" block lists the five newest
nodes and is tagged \`node:12 node:13 …\` — only the nodes it happened to
render. Publish incident 99 and nothing invalidates, so the block is frozen
until something else evicts it. *Evidence:* \`node_list\` absent from
\`X-Drupal-Cache-Tags\`. *Fix:* add the list tag (\`node_list\`, or
\`node_list:incident\` to scope it to one bundle).

**(b) Cross-user leakage.** A block renders "Edit" links guarded by
\`\$account->hasPermission('edit any incident')\` but declares no context. The
first editor to hit it warms the cache; anonymous visitors get the admin links.
*Evidence:* \`user.permissions\` missing from \`X-Drupal-Cache-Contexts\`.
*Fix:* add \`user.permissions\` — never \`user\`, which forks the cache per
account. Access checks return \`AccessResult\` objects that already carry the
right metadata; assign the \`AccessResult\` straight to \`#access\` instead of
hand-rolling. Writing \`'#access' => \$access->isAllowed()\` silently discards the
access result's cacheability when access is denied — \`Renderer::doRender()\`
early-returns on a bare \`FALSE\` before any metadata bubbles, so the object form
is the correct idiom.

**(c) The whole page uncacheable.** One "on call right now" block sets
\`'max-age' => 0\`. Max-age intersects on the way up — the smallest value wins
— so the root becomes 0 and the entire response is uncacheable.
*Evidence:* \`X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)\` and
\`X-Drupal-Cache-Max-Age: 0\`. *Fix:* wrap the volatile fragment in a
\`#lazy_builder\` so it becomes a placeholder and stops poisoning its parents.

**(d) Config read without a dependency.** \`\$config->get('items_to_show')\`
returns a value; it does not register anything. Editors change the setting and
nothing moves. *Fix:* \`\$renderer->addCacheableDependency(\$build, \$config)\`,
which adds the \`config:incident_tracker.settings\` tag.

**(e) Lazy builder handed an entity.** \`'#lazy_builder' => [\$callback, [\$node]]\`
trips an assertion — placeholder arguments must be scalars (or NULL), because
they are serialised into the placeholder key. Pass \`\$node->id()\` and reload
inside the callback. Note it is an \`assert()\`, so it only fires when
\`zend.assertions=1\` (development); with assertions compiled out in production
the object is silently serialised into the placeholder hash instead of being
rejected — an unstable, oversized key or a later serialization failure, and the
classic "worked in dev" bug.

**(f) "Fixing" it with cron.** An hourly \`drush cr\` hides bug (a) by throwing
away every cache on the site, including the ones that were correct. The site
gets slower and the real dependency is still missing. Cache rebuild is a
deployment step, not an invalidation strategy.
`,

  comparisons: [
    {
      label: "(a) Stale listing — tag the query, not just the results",
      intro:
        "A block lists the five newest incidents. Both frameworks cache it; the question is what invalidates it when a sixth incident is published.",
      php: `// Symfony: TagAwareAdapter. The naive version tags each item it rendered.
$html = $cache->get('latest_incidents', function (ItemInterface $item) use ($repo) {
    $incidents = $repo->findLatest(5);
    // Only these five ids -> a NEW incident invalidates nothing.
    $item->tag(array_map(fn($i) => 'incident.' . $i->getId(), $incidents));
    return $this->twig->render('latest.html.twig', ['incidents' => $incidents]);
});

// The fix: a collection-level tag, invalidated on every persist.
$item->tag(['incident.list']);
// ... in a Doctrine postPersist/postUpdate/postRemove listener:
$cache->invalidateTags(['incident.list']);`,
      ts: `// Drupal: list cache tags are built in - you just have to ask for them.
$nids = $this->entityTypeManager->getStorage('node')->getQuery()
  ->accessCheck(TRUE)
  ->condition('type', 'incident')
  ->condition('status', 1)
  ->sort('created', 'DESC')
  ->range(0, 5)
  ->execute();

$build = [
  '#theme' => 'incident_list',
  '#items' => $this->buildRows($nids),
  '#cache' => [
    'tags' => [
      // Without this the block never sees incident number six.
      'node_list:incident',
    ],
    'contexts' => ['languages:language_interface'],
  ],
];`,
      note: "Drupal core already invalidates node_list and node_list:BUNDLE on every node save/delete — Symfony makes you wire the equivalent listener yourself. The bug is forgetting to depend on it, not the plumbing.",
    },
    {
      label: "(b) Cross-user leakage — vary on permissions, not on the user",
      intro:
        "The same block renders an 'Edit' link only for users who may edit incidents. Get the vary wrong and anonymous visitors are served an editor's copy.",
      php: `// Symfony: you own the vary. With HttpCache you would set it explicitly...
$response->setPublic();
$response->setVary(['Cookie']);   // sledgehammer: a cache entry per session

// ...or keep the shell public and pull the private bit in over ESI/AJAX:
// {{ render_esi(url('incident_actions', {id: incident.id})) }}
// The ESI sub-response is private; the outer page stays shared.`,
      ts: `// Drupal: declare WHAT the output depends on and it computes the vary.
$access = $node->access('update', $account, TRUE);   // AccessResultInterface

$build['actions'] = [
  '#type' => 'link',
  '#title' => $this->t('Edit'),
  '#url' => $node->toUrl('edit-form'),
  // Pass the OBJECT, never $access->isAllowed(). Renderer::doRender() calls
  // addCacheableDependency() itself for an AccessResultInterface and bubbles
  // the metadata on allow AND on deny. A bare FALSE hits the early-return
  // above the bubbling code, so 'user.permissions' is thrown away exactly
  // when access was denied - which is this bug.
  '#access' => $access,
];

// Hand-written equivalent, when there is no access object to lean on:
$build['#cache']['contexts'][] = 'user.permissions';`,
      note: "user.permissions creates one variant per distinct permission set (a handful). The 'user' context creates one per account — correct, and a memory leak on a site with 40,000 registered readers.",
    },
    {
      label: "(c) max-age 0 — one block, whole page uncacheable",
      intro:
        "An 'on call right now' widget must never be stale. The lazy way kills caching for every request that renders it; the right way isolates it behind a placeholder.",
      php: `// Symfony: a no-store sub-response poisons the shell if you inline it.
// So you don't inline it - you punch a hole and let the edge assemble.
class OnCallController {
    public function widget(): Response {
        $r = new Response($this->render());
        $r->setPrivate();
        $r->setMaxAge(0);          // contained: only THIS fragment
        return $r;
    }
}
// framework.yaml: esi: true  -> the shell stays public/shared.`,
      ts: `// WRONG - bubbles to the root:
//   X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)
$build['on_call'] = [
  '#markup' => $this->renderOnCall(),
  '#cache' => ['max-age' => 0],
];

// RIGHT - a lazy builder becomes a placeholder. Scalars only!
$build['on_call'] = [
  '#lazy_builder' => [
    'incident_tracker.on_call_builder:build',
    [$rota->id()],                 // an ID, never the loaded object
  ],
  '#create_placeholder' => TRUE,
];
// Inside the callback, return the volatile bit with its own metadata:
//   return ['#markup' => $markup, '#cache' => ['max-age' => 0]];`,
      note: "(e) lives here too: placeholder arguments are serialised into the placeholder hash, so they must be scalars. Passing $node instead of $node->id() trips \"A #lazy_builder callback's context may only contain scalar values or NULL.\" — but that is an assert(), so it only fires when zend.assertions=1 (development); with assertions compiled out in production the object is silently serialised into the placeholder hash instead of being rejected.",
    },
    {
      label: "(d) Config read with no dependency recorded",
      intro:
        "A block reads how many rows to show from module settings. Reading a value is not the same as depending on it — in either framework.",
      php: `// Symfony: parameters are compiled into the container, so a change means
// a container rebuild - the dependency is implicit and deploy-time.
class LatestIncidentsBlock
{
    public function __construct(private int $itemsToShow) {}
}
// services.yaml: arguments: ['%incident.items_to_show%']

// Runtime-editable settings are different: you own the invalidation.
$settings = $this->settingsRepo->load();
$item->tag(['settings.incident_tracker']);   // easy to forget - same bug`,
      ts: `$config = $this->configFactory->get('incident_tracker.settings');
$limit = $config->get('items_to_show');

$build = [
  '#theme' => 'incident_list',
  '#items' => $this->buildRows($limit),
];

// Without this line, editors change the setting and nothing happens.
$this->renderer->addCacheableDependency($build, $config);
// Adds tag: config:incident_tracker.settings

// Same call works for entities, access results, field configs, views -
// anything implementing CacheableDependencyInterface.`,
      note: "addCacheableDependency() is the single most under-used method in Drupal. If you read an object to decide what to render, make the render array depend on it.",
    },
  ],

  playground: {
    intro:
      "A miniature of the bubbling pass. Three blocks declare their own cacheability; watch what reaches the response — and how the same merged metadata diagnoses bugs (a), (b) and (c) at once.",
    lang: "php",
    code: `<?php
// A tiny model of Drupal's bubbling: every child's cacheability is merged
// into its parent, all the way up to the response.

$tree = [
  'page'         => ['children' => ['header', 'main', 'sidebar']],
  'header'       => ['children' => [], 'tags' => ['config:system.site'], 'contexts' => ['url.site'], 'max-age' => -1],
  'main'         => ['children' => ['latest_incidents']],
  'latest_incidents' => ['children' => [], 'tags' => ['node:12', 'node:13'], 'contexts' => [], 'max-age' => -1],
  'sidebar'      => ['children' => ['on_call_widget']],
  'on_call_widget'   => ['children' => [], 'tags' => [], 'contexts' => [], 'max-age' => 0],
];

// Cache::mergeMaxAges(): -1 is PERMANENT, so it loses to any finite age.
function merge_max_age(int $a, int $b): int {
  if ($a === -1) { return $b; }
  if ($b === -1) { return $a; }
  return min($a, $b);
}

function bubble(string $id, array $tree): array {
  $node = $tree[$id];
  $out = [
    'tags'     => $node['tags'] ?? [],
    'contexts' => $node['contexts'] ?? [],
    'max-age'  => $node['max-age'] ?? -1,
  ];
  foreach ($node['children'] as $child) {
    $sub = bubble($child, $tree);
    $out['tags']     = array_values(array_unique(array_merge($out['tags'], $sub['tags'])));
    $out['contexts'] = array_values(array_unique(array_merge($out['contexts'], $sub['contexts'])));
    $out['max-age']  = merge_max_age($out['max-age'], $sub['max-age']);
  }
  sort($out['tags']);
  sort($out['contexts']);
  return $out;
}

$root = bubble('page', $tree);
echo "=== Bubbled to the response ===\\n";
echo "tags:     " . implode(' ', $root['tags']) . "\\n";
echo "contexts: " . (implode(' ', $root['contexts']) ?: '(none)') . "\\n";
echo "max-age:  " . $root['max-age'] . "\\n\\n";

echo "=== Diagnosis ===\\n";
if ($root['max-age'] === 0) {
  echo "BUG C: max-age 0 reached the root - the whole page is uncacheable.\\n";
  echo "       Culprit: on_call_widget. Fix: #lazy_builder placeholder.\\n";
}
if (!in_array('node_list', $root['tags'], TRUE)) {
  echo "BUG A: a listing is tagged with node:12 node:13 but not node_list,\\n";
  echo "       so a NEW incident will never appear. Fix: add node_list.\\n";
}
if (!in_array('user.permissions', $root['contexts'], TRUE)) {
  echo "BUG B: no user.permissions context - any 'Edit' link rendered here\\n";
  echo "       is cached once and served to everybody. Fix: add the context.\\n";
}
`,
    output: `=== Bubbled to the response ===
tags:     config:system.site node:12 node:13
contexts: url.site
max-age:  0

=== Diagnosis ===
BUG C: max-age 0 reached the root - the whole page is uncacheable.
       Culprit: on_call_widget. Fix: #lazy_builder placeholder.
BUG A: a listing is tagged with node:12 node:13 but not node_list,
       so a NEW incident will never appear. Fix: add node_list.
BUG B: no user.permissions context - any 'Edit' link rendered here
       is cached once and served to everybody. Fix: add the context.
`,
  },

  keyPoints: [
    "Every caching bug is an undeclared dependency: the output varies by something that is not in #cache. Ask 'what would make this markup wrong?' and name it as a tag, a context or a max-age.",
    "A listing needs a list tag (node_list or node_list:BUNDLE), not just the tags of the entities it happened to render — otherwise new content is invisible until something else evicts the entry.",
    "Permission-dependent markup needs the user.permissions context; user.roles and user are usually wrong (too coarse or too granular). Better still, assign the AccessResult object itself to '#access' — the renderer copies its metadata and bubbles it whether access is allowed or denied, which '#access' => $access->isAllowed() does not.",
    "max-age intersects upward — the smallest value wins — so one max-age 0 element makes the whole response uncacheable. Isolate volatile fragments behind #lazy_builder placeholders instead.",
    "Lazy builder / placeholder arguments must be scalars: pass an entity ID and load inside the callback, never the loaded object.",
    "Enable http.response.debug_cacheability_headers in development only, then read X-Drupal-Cache, X-Drupal-Dynamic-Cache, X-Drupal-Cache-Tags and X-Drupal-Cache-Contexts. A scheduled drush cr is not invalidation — it is a confession that a tag is missing.",
  ],

  interview: [
    {
      q: "A content editor says 'I published a story and it doesn't show on the homepage for an hour.' Walk me through your diagnosis.",
      a: "First I reproduce as an anonymous user with debug cacheability headers enabled and look at `X-Drupal-Cache-Tags` on the homepage. If the tags list individual `node:NN` entries for the items currently shown but no `node_list` (or `node_list:BUNDLE`), that is the whole bug: saving a *new* node invalidates `node_list`, not `node:12`, so nothing evicts the block. The 'an hour' detail usually means someone patched over it with a max-age or a cron `drush cr`, which is a second smell. The fix is to add the list tag to the block's `#cache['tags']` — or, if it is a View, to check that the view isn't set to a time-based caching plugin instead of tag-based. I'd also verify the invalidation actually reaches the edge: if Varnish or a CDN is fronting the site, the purge module has to translate that tag into a BAN or a surrogate-key purge.",
    },
    {
      q: "Why is `'max-age' => 0` almost always the wrong fix, and what do you use instead?",
      a: "Because max-age is intersected as cacheability bubbles up the render tree — the minimum wins — so a single element with max-age 0 makes its block, its region, the page and therefore the whole response uncacheable. You see it as `X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)` on a page that was previously a HIT, and traffic that used to be served from cache starts executing full page builds. The right move is to decide whether the thing is genuinely time-varying or just *dependency*-varying: most of the time it varies on an entity, a config object or a permission, so a tag or a context expresses it exactly and the page stays cacheable. When it really is volatile — a live 'on call now' widget — wrap it in a `#lazy_builder` so it becomes an auto-placeholder: the surrounding page caches normally and only the fragment is rebuilt, then filled in by Dynamic Page Cache or streamed by BigPipe.",
    },
    {
      q: "What's the difference between the `user`, `user.roles` and `user.permissions` cache contexts, and when would you use each?",
      a: "`user` varies per account — correct but catastrophic for cache hit rate, since a site with 40,000 registered readers gets 40,000 variants; reserve it for output that genuinely contains that person's data, and even then prefer a lazy builder. `user.roles` varies per role combination and is right when the markup differs by role membership as such (a 'Members only' teaser). `user.permissions` varies per distinct permission set and is what you want whenever the output was decided by a `hasPermission()` or an entity access check — it collapses to a handful of variants because most users share a permission profile. In practice I rarely write any of them by hand: entity access returns an `AccessResultInterface`, and `addCacheableDependency()` copies the correct context onto the render array for me.",
    },
    {
      q: "A team has a cron job running `drush cache:rebuild` every 30 minutes to keep content fresh. What do you tell them?",
      a: "That it is a symptom, not a solution. A full rebuild throws away every correct cache entry along with the one stale one — render cache, dynamic page cache, the container, discovery caches — so for several minutes after each run every request pays full price, and on a busy site that can look like a stampede. It also masks the real defect, which is a missing cache tag or dependency somewhere; the moment the interval isn't short enough, the stale-content complaint comes back. I'd find the offending build, add the tag it should have had (usually a list tag or `addCacheableDependency()` on a config object), verify with the debug headers, then delete the cron job. `drush cr` belongs in a deployment script after `drush updb` and `drush cim`, not on a timer.",
    },
  ],

  quiz: [
    {
      question:
        "A block renders the five newest incidents and declares tags ['node:12','node:13','node:14','node:15','node:16']. An editor publishes incident 17. What happens?",
      options: [
        "The block updates immediately — publishing any node invalidates all node tags.",
        "The block stays stale until one of nodes 12-16 is edited or the cache is otherwise cleared.",
        "The block updates on the next cron run because list caches expire hourly by default.",
        "Drupal throws an exception because the render array is missing a list tag.",
      ],
      answerIndex: 1,
      explain:
        "Saving node 17 invalidates node:17 and node_list (plus node_list:BUNDLE) — none of which the block declared. The entry stays valid until one of the five nodes it named changes, or a rebuild wipes it. Adding 'node_list:incident' fixes it precisely.",
    },
    {
      question:
        "You add 'max-age' => 0 to one block in the sidebar. What does the response header show for the page as a whole?",
      options: [
        "X-Drupal-Dynamic-Cache: HIT — max-age only affects the block's own render cache entry.",
        "X-Drupal-Cache-Max-Age: 3600 — the parent's longer max-age wins.",
        "X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability) and X-Drupal-Cache-Max-Age: 0 — the zero bubbles to the root.",
        "Nothing changes; max-age is only consulted by Varnish, not by Drupal's internal caches.",
      ],
      answerIndex: 2,
      explain:
        "Max-age is merged by intersection as cacheability bubbles upward, so the smallest value wins all the way to the response. One max-age 0 element makes the whole page uncacheable — use a #lazy_builder placeholder to contain the volatility instead. (Since Drupal 10.4 / 11.1 the header names its reason: 'UNCACHEABLE (poor cacheability)'; older 10.x prints a bare UNCACHEABLE.)",
    },
    {
      question:
        "Which argument is legal inside a #lazy_builder callback array?",
      options: [
        "The loaded $node entity object, so the callback avoids a second load.",
        "The node ID as a string or integer, e.g. [$node->id()].",
        "A closure that returns the node.",
        "The full render array of the parent element.",
      ],
      answerIndex: 1,
      explain:
        "Lazy builder arguments are serialised into the placeholder key, so they must be scalars (or NULL). Pass the ID and load the entity inside the callback; passing an object trips \"A #lazy_builder callback's context may only contain scalar values or NULL.\" — an assert(), so it only fires when zend.assertions=1 (development). With assertions compiled out in production the object is silently serialised into the placeholder hash instead of being rejected.",
    },
    {
      question:
        "Your block reads $config->get('items_to_show') from incident_tracker.settings, but changing the setting never affects the rendered output. What is missing?",
      options: [
        "A 'user.permissions' cache context on the block.",
        "$this->renderer->addCacheableDependency($build, $config), which adds the config:incident_tracker.settings tag.",
        "'max-age' => 0 on the block so it rebuilds every request.",
        "A cron job running drush cache:rebuild after config changes.",
      ],
      answerIndex: 1,
      explain:
        "Reading a config object records no dependency. addCacheableDependency() merges the object's cacheability — here the config:incident_tracker.settings tag — into the render array, so saving the settings form invalidates exactly the entries that used it.",
    },
  ],
};

export default lesson;

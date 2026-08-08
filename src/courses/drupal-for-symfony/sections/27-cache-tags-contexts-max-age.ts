import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "cache-tags-contexts-max-age",
  title: "Caching: Cache Tags/Contexts/Max-age vs HttpCache",
  part: "Rendering, Config & Shipping",
  estMinutes: 13,
  summary:
    "Symfony leans on HttpCache, ESI and PSR-6 pools you invalidate by hand; Drupal attaches structured cacheability metadata (#cache tags/contexts/max-age) to every render array so that saving an entity auto-purges exactly the dependent fragments.",

  concept: `
In Symfony you cache at a few explicit layers: the HTTP reverse proxy
(\`HttpCache\` / Varnish with \`Cache-Control\` and ESI), PSR-6/PSR-16 cache pools
you \`get()\`/\`save()\` yourself, and \`#[Cache]\` attributes on controllers. The
hard part is always **invalidation** — you decide which pool keys or which
\`Cache-Control\` tags to purge when data changes, and getting it wrong ships
stale pages.

Drupal flips the responsibility. Instead of you tracking dependencies, **every
render array carries its own cacheability metadata** under a \`#cache\` key, and
the render system unions that metadata up the tree. There are three dimensions:

### Cache tags — *what* the fragment depends on

Tags are dependency labels, not keys. \`node:5\` means "this output depends on
node 5". When you \`$node->save()\`, Drupal calls
\`Cache::invalidateTags(['node:5'])\` for you, and **every** cached render, page,
and response tagged \`node:5\` — anywhere on the site — is invalidated at once.
This is the Symfony "tag your \`Cache-Control\` and purge the reverse proxy on
change" pattern, but automatic and dependency-derived. Common tags:
\`node:5\`, \`node_list\`, \`user:2\`, \`config:system.site\`.

### Cache contexts — *what it varies by*

Contexts are Drupal's answer to HTTP \`Vary\`. \`user.permissions\`,
\`url.path\`, \`languages:language_interface\`, \`theme\`, \`route\` — each context
splits the cache into per-variant buckets. Rendering a block that differs by
permission? Add \`contexts => ['user.permissions']\` and Drupal stores one copy
per distinct permission set. This is like \`Vary:\` headers or a Symfony cache key
built from request attributes, but declarative and composable.

### Max-age — *how long* it may live

\`max-age\` is seconds, and the default is \`Cache::PERMANENT\` (cache until a tag
invalidates it). Set \`0\` to forbid caching this fragment, or a positive number
for a TTL. Because metadata bubbles, the **minimum** max-age in a subtree wins —
one uncacheable child makes its parents uncacheable too.

### The layers that consume this metadata

- **Internal Page Cache** — full HTML for *anonymous* users (like a built-in
  reverse proxy).
- **Dynamic Page Cache** — caches pages for *authenticated* users too, with the
  per-user parts left as placeholders.
- **BigPipe** — streams those placeholders in after the shell, so the cached
  outer page ships instantly and personalised bits fill in.

All three obey the same tags/contexts/max-age. Set the metadata correctly once
and every layer — plus any Varnish fronting the site via the \`purge\`/tag
modules — invalidates in lockstep. You almost never call a cache pool directly.
`,

  comparisons: [
    {
      label: "Invalidation: manual purge vs automatic tags",
      intro:
        "You changed a product and must drop stale cached pages. In Symfony you decide which reverse-proxy tags or pool keys to purge. In Drupal you just save the entity; the tag it already carries fans out to every dependent render.",
      php: `<?php
// Symfony: you own invalidation.
use Symfony\\Contracts\\Cache\\TagAwareCacheInterface;

class ProductController
{
  public function show(int $id, TagAwareCacheInterface $cache): Response
  {
    $html = $cache->get("product_$id", function ($item) use ($id) {
      $item->tag(["product-$id", "product-list"]);
      return $this->renderProduct($id);
    });
    return new Response($html);
  }
}

// On update, somewhere else, you must remember to purge:
$cache->invalidateTags(["product-$id"]);
// ...and separately purge Varnish (BAN on the same tag) yourself.`,
      ts: `<?php
// Drupal: the render array declares the dependency; save() purges it.
public function show(int $id): array {
  $node = $this->entityTypeManager()
    ->getStorage('node')->load($id);

  $build = [
    '#markup' => $node->label(),
    '#cache' => [
      'tags' => $node->getCacheTags(),   // ['node:' . $id]
      'contexts' => ['url'],
    ],
  ];
  return $build;
}

// Elsewhere: \$node->save();  -> Drupal calls
// Cache::invalidateTags(['node:' . \$id]) automatically. Every render,
// page and (via purge module) Varnish entry tagged node:5 is dropped.`,
      note:
        "Symfony invalidation is imperative and easy to forget; Drupal derives the tag from the entity, attaches it to the output, and purges on save with no bookkeeping from you.",
    },
    {
      label: "Varying output: Vary/ESI vs cache contexts",
      intro:
        "A block shows different content per user permission and per language. In Symfony you juggle Vary headers or an ESI fragment; in Drupal you list contexts and the render system stores one variant per bucket.",
      php: `<?php
// Symfony: vary the HTTP cache, or carve out an ESI fragment.
$response->setVary(['Cookie', 'Accept-Language']);
$response->setPublic();
$response->setMaxAge(3600);

// Or, for a per-user island inside a cached page, an ESI include:
//   {{ render_esi(controller('App\\\\Controller\\\\Cart::widget')) }}
// The reverse proxy assembles the fragments.`,
      ts: `<?php
// Drupal: declare what it varies by; the render cache buckets it.
$build['user_greeting'] = [
  '#markup' => $this->t('Hello, @name', ['@name' => $account->getDisplayName()]),
  '#cache' => [
    'contexts' => [
      'user',                          // one variant per user
      'languages:language_interface',  // and per interface language
    ],
    'tags' => ['user:' . $account->id()],
    'max-age' => \\Drupal\\Core\\Cache\\Cache::PERMANENT,
  ],
];
// Dynamic Page Cache keeps this as a placeholder; BigPipe streams it in.`,
      note:
        "ESI needs a fragment controller and a proxy that assembles it; Drupal contexts are declarative labels on the same render array, and BigPipe/Dynamic Page Cache handle the per-user assembly.",
    },
    {
      label: "Attaching metadata from a service (CacheableMetadata)",
      intro:
        "When you compute a value from other objects, you must propagate their cacheability so the result invalidates correctly. Symfony has no built-in bubbling; Drupal gives you CacheableMetadata to merge and apply.",
      php: `<?php
// Symfony: no automatic bubbling. You manually decide the key + tags
// for the derived value, and re-derive them wherever it is reused.
$key = 'homepage_promo';
$html = $cache->get($key, function ($item) {
  $item->tag(['promo-list', 'config-theme']);
  $item->expiresAfter(600);
  return $this->buildPromo();
});`,
      ts: `<?php
// Drupal: build metadata, merge dependencies, apply to the render array.
use Drupal\\Core\\Cache\\CacheableMetadata;

$meta = new CacheableMetadata();
$meta->addCacheTags(['node_list']);
$meta->addCacheContexts(['url.query_args:page']);
$meta->setCacheMaxAge(600);

// Merge in the cacheability of every object you read from:
foreach ($nodes as $node) {
  $meta->addCacheableDependency($node);   // pulls in node:ID tags
}

$build = ['#markup' => $output];
$meta->applyTo($build);   // writes the unioned #cache onto $build
return $build;`,
      note:
        "\`addCacheableDependency()\` unions another object's tags/contexts/max-age in for you — the bubbling that Symfony leaves entirely to the developer.",
    },
  ],

  playground: {
    intro:
      "This models Drupal's render-cache bubbling in plain PHP: each fragment declares #cache metadata, the tree unions tags/contexts and takes the MINIMUM max-age, and saving an entity invalidates every fragment carrying its tag. No Drupal bootstrap — just the mechanism.",
    lang: "php",
    code: `<?php
// A render tree: each node has content, children, and #cache metadata.
$tree = [
  'content' => 'PAGE',
  'cache' => ['tags' => ['config:system.site'], 'contexts' => ['url.path'], 'max-age' => -1],
  'children' => [
    [
      'content' => 'article-5',
      'cache' => ['tags' => ['node:5'], 'contexts' => [], 'max-age' => -1],
      'children' => [],
    ],
    [
      'content' => 'user-greeting',
      'cache' => ['tags' => ['user:2'], 'contexts' => ['user'], 'max-age' => 600],
      'children' => [],
    ],
  ],
];

// Bubble up: union tags + contexts, take the MIN max-age (-1 = PERMANENT = max).
function bubble(array $node): array {
  $tags = $node['cache']['tags'];
  $contexts = $node['cache']['contexts'];
  $maxAge = $node['cache']['max-age'];
  foreach ($node['children'] as $child) {
    $c = bubble($child);
    $tags = array_merge($tags, $c['tags']);
    $contexts = array_merge($contexts, $c['contexts']);
    // PERMANENT (-1) counts as "infinite"; any finite child wins.
    $childAge = $c['max-age'];
    if ($maxAge === -1) { $maxAge = $childAge; }
    elseif ($childAge !== -1) { $maxAge = min($maxAge, $childAge); }
  }
  return ['tags' => array_values(array_unique($tags)),
          'contexts' => array_values(array_unique($contexts)),
          'max-age' => $maxAge];
}

$rolled = bubble($tree);
echo "Page cache tags:     " . implode(', ', $rolled['tags']) . "\\n";
echo "Page cache contexts: " . implode(', ', $rolled['contexts']) . "\\n";
echo "Effective max-age:   " . ($rolled['max-age'] === -1 ? 'PERMANENT' : $rolled['max-age'] . 's') . "\\n\\n";

// Now: someone edits node 5 -> Cache::invalidateTags(['node:5']).
$invalidate = 'node:5';
echo "save(node 5) invalidates tag '{$invalidate}':\\n";
echo in_array($invalidate, $rolled['tags'], true)
  ? "  -> this cached page is PURGED (it carries {$invalidate}).\\n"
  : "  -> page untouched.\\n";`,
    output: `Page cache tags:     config:system.site, node:5, user:2
Page cache contexts: url.path, user
Effective max-age:   600s

save(node 5) invalidates tag 'node:5':
  -> this cached page is PURGED (it carries node:5).`,
  },

  keyPoints: [
    "Drupal attaches cacheability to output itself via \`#cache\` — three dimensions: **tags** (what it depends on), **contexts** (what it varies by), **max-age** (how long).",
    "Cache **tags** are dependency labels (\`node:5\`, \`node_list\`, \`user:2\`, \`config:*\`); \`$entity->save()\` auto-calls \`Cache::invalidateTags()\`, purging every dependent fragment — no manual bookkeeping like Symfony pool/Varnish purges.",
    "Cache **contexts** are the declarative equivalent of HTTP \`Vary\`/ESI: \`user.permissions\`, \`url.path\`, \`languages:*\`, \`theme\` each split the cache into per-variant buckets.",
    "Metadata **bubbles**: tags and contexts union up the render tree and the **minimum** max-age wins, so one \`max-age => 0\` child makes its ancestors uncacheable.",
    "Use \`CacheableMetadata\` + \`addCacheableDependency()\` in services to merge in the cacheability of objects you read from, then \`applyTo()\` the render array.",
    "Internal Page Cache (anonymous), Dynamic Page Cache (authenticated, with placeholders) and BigPipe (streams placeholders) all obey the same metadata; you rarely touch a raw cache pool.",
  ],

  interview: [
    {
      q: "In Symfony you invalidate cache pools or purge Varnish by tag manually. How does Drupal handle invalidation, and why is it less error-prone?",
      a: "Drupal makes invalidation *dependency-derived* rather than imperative. Every render array declares cache **tags** describing what it depends on — an entity render carries \`node:5\` via \`$node->getCacheTags()\`. When you call \`$node->save()\`, Drupal automatically runs \`Cache::invalidateTags(['node:5'])\`, and every cached fragment, page and response tagged \`node:5\` anywhere on the site is dropped at once — including Varnish if the \`purge\` module is wired up. You never maintain a list of keys to purge, which is exactly the step Symfony leaves to you and is easy to forget.",
    },
    {
      q: "What are cache contexts, and how do they relate to HTTP Vary or ESI?",
      a: "Contexts declare what a fragment *varies by*, so the render cache stores one copy per distinct value — conceptually the same as an HTTP \`Vary\` header or splitting a Symfony cache key by request attributes, but declarative and composable. Examples are \`user\`, \`user.permissions\`, \`url.path\`, \`languages:language_interface\`, \`theme\` and \`route\`. Where Symfony might carve out an ESI fragment served by its own controller and let the reverse proxy assemble it, Drupal keeps the per-variant part in the same render array with a context, and Dynamic Page Cache/BigPipe handle assembly. The result is that a page can be cached for everyone while a \`contexts => ['user']\` island still shows per-user content.",
    },
    {
      q: "Explain how max-age bubbles and why one wrong fragment can make a whole page uncacheable.",
      a: "Cacheability metadata **bubbles** up the render tree: parents inherit the union of their children's tags and contexts, and the **minimum** max-age. The default is \`Cache::PERMANENT\` (cache until a tag invalidates). If a single deep fragment sets \`max-age => 0\` — say a block that must never be cached — that zero propagates upward and every ancestor, including the page, becomes uncacheable. This is the classic Drupal performance bug: a stray \`max-age => 0\` (often from calling \`\\Drupal::time()\` or the current user without declaring the right context instead) silently kills Dynamic Page Cache for the whole route. The fix is usually to replace the uncacheable dependency with the correct context or tag so the fragment can be cached again.",
    },
    {
      q: "What are Dynamic Page Cache and BigPipe, and where do they sit relative to the anonymous Page Cache?",
      a: "Internal **Page Cache** stores the full HTML response for *anonymous* users, acting like a built-in reverse proxy keyed by URL. **Dynamic Page Cache** extends caching to *authenticated* users by caching the page with its highly-dynamic, per-user parts left as auto-placeholders (fragments with high-cardinality contexts like \`user\` or \`session\`). **BigPipe** then streams those placeholders to the browser after the cached page shell has already been sent, so the perceived load time drops. All three consume the same \`#cache\` tags/contexts/max-age — you configure caching once via metadata, not per-layer, which is the big contrast with wiring HttpCache, pools and ESI separately in Symfony.",
    },
  ],

  quiz: [
    {
      question:
        "After \`$node->save()\` on node 5, what does Drupal do to cached output that depends on that node?",
      options: [
        "Nothing until the max-age TTL expires",
        "Automatically calls Cache::invalidateTags(['node:5']), purging every fragment/page tagged node:5",
        "You must manually purge each affected cache pool key",
        "It clears the entire render cache bin",
      ],
      answerIndex: 1,
      explain:
        "Entity save triggers Cache::invalidateTags with the entity's cache tags (node:5). Only fragments carrying that tag are dropped — targeted, automatic invalidation, not a full flush and not manual bookkeeping.",
    },
    {
      question:
        "A block must render differently for each user permission set. Which #cache dimension expresses that?",
      options: [
        "tags => ['user_list']",
        "max-age => 0",
        "contexts => ['user.permissions']",
        "tags => ['config:user.role']",
      ],
      answerIndex: 2,
      explain:
        "Varying output by something about the request/actor is a cache context. 'user.permissions' stores one cached variant per distinct permission set — the declarative equivalent of an HTTP Vary. max-age => 0 would just disable caching; tags describe dependencies, not variation.",
    },
    {
      question:
        "A subtree has parent max-age PERMANENT, one child 600, and one grandchild 0. What is the page's effective max-age?",
      options: [
        "PERMANENT (parent wins)",
        "600 (the average / middle value)",
        "0 (the minimum bubbles up, making the page uncacheable)",
        "It errors because the values conflict",
      ],
      answerIndex: 2,
      explain:
        "Max-age bubbles as a minimum. A single max-age => 0 fragment propagates up and makes every ancestor uncacheable — the common cause of a whole route losing Dynamic Page Cache.",
    },
    {
      question:
        "Which statement best distinguishes Drupal's approach from Symfony's HttpCache/ESI + cache pools?",
      options: [
        "Drupal only caches for anonymous users; Symfony caches for everyone",
        "Drupal attaches structured cacheability metadata to the render output so invalidation is dependency-derived, whereas Symfony invalidation is largely manual and per-layer",
        "Symfony has no way to vary cached responses",
        "Drupal never uses a reverse proxy, so Varnish cannot front it",
      ],
      answerIndex: 1,
      explain:
        "The core difference is where responsibility lives: Drupal derives tags/contexts/max-age from the data and bubbles them through the render tree, so save-time invalidation is automatic across all cache layers; Symfony gives you the primitives (HttpCache, ESI, PSR-6 pools) but you wire and invalidate them yourself. Drupal can and often does sit behind Varnish via the purge/tag modules.",
    },
  ],
};

export default lesson;

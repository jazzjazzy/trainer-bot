import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "bubbling-and-dependencies",
  title: "Bubbling & CacheableDependencyInterface",
  part: "The Cacheability Model",
  estMinutes: 13,
  summary:
    "How cacheability metadata climbs from a leaf render element to the response, and the handful of APIs — addCacheableDependency(), CacheableMetadata, CacheableResponseInterface, AccessResult — that make a deeply nested dependency impossible to forget.",

  concept: `
Cache tags, contexts and max-age are not properties of the thing you wrote them
on. They are properties of **everything above it**. Drupal calls this bubbling,
and it is the single mechanism that makes whole-page caching safe on a busy
incident site: one nested widget that varies per user makes the page vary per
user, whether or not you noticed.

## The mechanism

\`Renderer::doRender()\` walks the tree depth-first. Each level pushes a
\`BubbleableMetadata\` frame onto a \`RenderContext\` (an \`SplStack\`); when a
child finishes, \`RenderContext::bubble()\` pops its frame and merges it into the
parent's. Contexts and tags are unioned; max-age goes through
\`Cache::mergeMaxAges()\`, which strips \`Cache::PERMANENT\` (-1) and returns the
**minimum** of what remains — an intersection, not a union. So the shortest-lived
child sets the lifetime for the entire page, and a single \`'max-age' => 0\` leaf
makes the whole render tree uncacheable.

Two consequences worth internalising:

- **Poisoning is upward-only.** Putting \`user\` context on a teaser does not
  make its siblings vary; it makes the page vary. Placeholdering (\`#lazy_builder\`
  + auto-placeholder) is how you stop the bubble at a boundary — that is the next
  section.
- **A parent never inherits downward.** Writing tags on the page does nothing for
  a child rendered in isolation.

## The API you will actually type

\`\\Drupal\\Core\\Cache\\CacheableDependencyInterface\` is three getters:
\`getCacheContexts()\`, \`getCacheTags()\`, \`getCacheMaxAge()\`. Content and config
entities implement it (\`EntityInterface\` extends it), \`ConfigBase\` implements
its refinable subclass so \`$this->config('mysite.settings')\` carries
\`config:mysite.settings\`, and \`AccessResult\` implements
\`RefinableCacheableDependencyInterface\` — the refinable half adds
\`addCacheContexts()\`, \`addCacheTags()\`, \`mergeCacheMaxAge()\` and
\`addCacheableDependency()\` so you can *build up* metadata on a value object.

The one call that matters:

\`\`\`php
$this->renderer->addCacheableDependency($build, $node);
\`\`\`

Internally it is \`CacheableMetadata::createFromRenderArray($build)\` merged with
\`CacheableMetadata::createFromObject($dependency)\`, then \`applyTo($build)\`. If
the object does **not** implement the interface, \`createFromObject()\` sets
max-age 0 — safe, but silently uncacheable. Since Drupal 11.3.0 passing such an
object to \`Renderer::addCacheableDependency()\` also emits a deprecation and will
throw in Drupal 13 (change record 3525389); the equivalent call on
\`RefinableCacheableDependencyTrait\` was deprecated in 11.2.0 (record 3232020).

Note the trap: \`Drupal\\Core\\Url\` does **not** implement the interface. Use
\`$url->toString(TRUE)\`, which returns a \`GeneratedUrl\` (a \`BubbleableMetadata\`),
and pass *that*.

## Controllers that return responses

Return a render array and bubbling is automatic. Return a \`Response\` and you opt
out — unless it implements \`CacheableResponseInterface\`
(\`CacheableResponse\`, \`CacheableJsonResponse\`, \`CacheableRedirectResponse\`,
\`CacheableAjaxResponse\`). Then \`$response->addCacheableDependency($thing)\` feeds
the same metadata into Dynamic Page Cache and the \`X-Drupal-Cache-Tags\` header.

## The recurring bug

You read config or load an entity inside a builder, print a value, and never
declare it. The output renders once and never changes again. Every read is a
dependency — declare it at the point of the read.
`,

  comparisons: [
    {
      label: "Declaring what a block read",
      intro:
        "A sidebar block on the incident site prints a threshold from config and the title of the current lead story. Symfony gives you a cache pool with a key and a TTL; Drupal gives you dependency objects that know their own invalidation identity.",
      php: `// Symfony: PSR-6 pool. The cache item has no idea what it depends on —
// you invent a key, pick a TTL, and remember to clear it yourself.
public function __construct(
  private CacheItemPoolInterface $cache,
  private ParameterBagInterface $params,
  private StoryRepository $stories,
) {}

public function build(): string
{
  $item = $this->cache->getItem('sidebar.alert_banner');
  if (!$item->isHit()) {
    $threshold = $this->params->get('app.alert_threshold');
    $lead = $this->stories->findLead();
    $item->set($this->render($threshold, $lead));
    $item->expiresAfter(300); // guesswork
    $this->cache->save($item);
  }
  return $item->get();
}

// When app.alert_threshold changes, or the lead story is edited,
// nothing invalidates this. You add a listener, or you wait 300s.`,
      ts: `// Drupal: declare the dependencies; core works out invalidation.
public function build(): array {
  $config = $this->configFactory->get('mysite.alerts');
  $lead = $this->nodeStorage->load($config->get('lead_nid'));

  $build = [
    '#theme' => 'alert_banner',
    '#threshold' => $config->get('threshold'),
    '#lead' => $lead?->label(),
  ];

  // Each of these adds tags/contexts/max-age from the object itself.
  $this->renderer->addCacheableDependency($build, $config);
  if ($lead) {
    $this->renderer->addCacheableDependency($build, $lead);
  }
  return $build;
}

// $build['#cache']['tags'] now holds config:mysite.alerts and node:NN,
// and those bubble to the page. Editing either invalidates the page.`,
      note: "addCacheableDependency() is createFromRenderArray() + createFromObject() + merge() + applyTo(). If the dependency does not implement CacheableDependencyInterface it sets max-age 0 — and since 11.3.0 also triggers a deprecation.",
    },
    {
      label: "Merging metadata by hand",
      intro:
        "Sometimes you are not adding a single object — you are collecting cacheability across a loop, or moving it from a sub-build onto a parent. CacheableMetadata is the value object for that.",
      php: `// Symfony: there is no shared vocabulary. You end up with an ad-hoc
// accumulator and a hand-written tag list for the HttpCache purger.
$tags = [];
$ttl  = null;

foreach ($this->stories->latest(10) as $story) {
  $tags[] = 'story-' . $story->getId();
  $ttl = $ttl === null
    ? $story->getEmbargoSeconds()
    : min($ttl, $story->getEmbargoSeconds());
}

$response->setPublic();
$response->setMaxAge($ttl ?? 3600);
$response->headers->set('xkey', implode(' ', array_unique($tags)));`,
      ts: `use Drupal\\Core\\Cache\\CacheableMetadata;

// Start from what the build already declares.
$meta = CacheableMetadata::createFromRenderArray($build);

foreach ($stories as $story) {
  // Union of tags/contexts, minimum of max-ages — merge() returns a new object.
  $meta = $meta->merge(CacheableMetadata::createFromObject($story));
}

// The list itself changes when any node of this type is created.
$meta->addCacheTags(['node_list:article']);
$meta->addCacheContexts(['url.query_args:page']);

// Write it back. applyTo() OVERWRITES $build['#cache'] with $meta's values.
$meta->applyTo($build);`,
      note: "merge() is immutable and returns a new object; addCacheTags()/addCacheContexts()/mergeCacheMaxAge() mutate in place and return $this. applyTo() replaces contexts, tags and max-age wholesale — merge first, apply last.",
    },
    {
      label: "Cacheable access decisions",
      intro:
        "Embargoed incident reports are visible only to editors, or after the embargo lifts. In Symfony a voter returns a bool and the framework forgets why. In Drupal the access result carries its own cacheability, so the rendered page can be cached without leaking.",
      php: `// Symfony voter: returns true/false. No cacheability, by design.
final class StoryVoter extends Voter
{
  protected function voteOnAttribute(string $attr, mixed $subject, TokenInterface $token): bool
  {
    $user = $token->getUser();
    if ($this->security->isGranted('ROLE_EDITOR')) {
      return true;
    }
    return $subject->getEmbargoUntil() <= new \\DateTimeImmutable();
  }
}

// Any HTTP caching of the resulting page must be turned off, or keyed
// by role by hand in the reverse proxy (Vary, or a custom cache key).`,
      ts: `use Drupal\\Core\\Access\\AccessResult;
use Drupal\\Core\\Cache\\Cache;

public function access(NodeInterface $node, AccountInterface $account) {
  // Adds the 'user.permissions' cache context automatically.
  $result = AccessResult::allowedIfHasPermission($account, 'view embargoed stories');

  if (!$result->isAllowed()) {
    $remaining = $node->get('embargo_until')->value - \\Drupal::time()->getRequestTime();
    // orIf() merges BOTH operands' cacheability, so 'user.permissions' survives.
    // Reassigning $result here instead would silently drop it, and the page
    // would then be cached without varying by permission.
    $result = $result->orIf(
      AccessResult::allowedIf($remaining <= 0)
        // Re-check no later than the embargo lift; after it, the answer is
        // permanent — max-age 0 here would make every page rendering this
        // node uncacheable forever.
        ->setCacheMaxAge($remaining > 0 ? $remaining : Cache::PERMANENT)
    );
  }

  // The decision depends on the node: invalidate when it is edited.
  return $result->addCacheableDependency($node);
}`,
      note: "AccessResult implements RefinableCacheableDependencyInterface, so the decision's contexts/tags/max-age bubble into whatever rendered it. Combine decisions with orIf()/andIf() rather than reassigning — a replaced $result takes its cache contexts with it. An access check that forgets addCacheableDependency() produces a page cached against a stale decision.",
    },
    {
      label: "Controllers that return a Response",
      intro:
        "The incident site exposes a small JSON feed. Returning a plain JsonResponse opts out of Dynamic Page Cache entirely; the cacheable variants keep the metadata pipeline intact.",
      php: `use Symfony\\Component\\HttpFoundation\\JsonResponse;

public function feed(): JsonResponse
{
  $data = $this->stories->latest(20);
  $response = new JsonResponse($data);

  // HttpCache-style: a TTL, a validator, and manual Vary.
  $response->setPublic();
  $response->setMaxAge(60);
  $response->setEtag(md5(serialize($data)));
  $response->setVary(['Accept-Language']);

  return $response;
}`,
      ts: `use Drupal\\Core\\Cache\\CacheableJsonResponse;
use Drupal\\Core\\Cache\\CacheableMetadata;

public function feed(): CacheableJsonResponse {
  $nodes = $this->nodeStorage->loadMultiple($nids);
  $response = new CacheableJsonResponse(array_map(
    fn (NodeInterface $n) => ['id' => $n->id(), 'title' => $n->label()],
    $nodes,
  ));

  foreach ($nodes as $node) {
    $response->addCacheableDependency($node);
  }
  $response->addCacheableDependency(
    (new CacheableMetadata())
      ->addCacheTags(['node_list:article'])
      ->addCacheContexts(['url.query_args:limit'])
  );

  return $response;
}`,
      note: "If a controller returns a CacheableResponseInterface but rendered something early (a stray Renderer::render() call), core throws a LogicException about 'leaked metadata'. Use renderInIsolation() — renderPlain() was deprecated in Drupal 10.3.0 — or return a render array.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of RenderContext::bubble(). Watch a leaf's context and max-age climb to the root — and watch a block that reads config but declares nothing quietly lose its cache tag.",
    lang: "php",
    code: `<?php
// A tiny model of Drupal's bubbling: every child's cacheability is merged
// into its parent, all the way to the root response.

const PERMANENT = -1; // Cache::PERMANENT

function mergeMaxAges(int $a, int $b): int {
  $ages = array_filter([$a, $b], fn($m) => $m !== PERMANENT);
  return $ages === [] ? PERMANENT : min($ages);
}

function mergeMeta(array $a, array $b): array {
  return [
    'contexts' => array_values(array_unique(array_merge($a['contexts'], $b['contexts']))),
    'tags' => array_values(array_unique(array_merge($a['tags'], $b['tags']))),
    'max-age' => mergeMaxAges($a['max-age'], $b['max-age']),
  ];
}

function meta(array $own = []): array {
  return $own + ['contexts' => [], 'tags' => [], 'max-age' => PERMANENT];
}

// Depth-first render: children bubble up into the parent frame.
function render(string $name, array $node, array &$log): array {
  $frame = meta($node['#cache'] ?? []);
  foreach ($node['children'] ?? [] as $childName => $child) {
    $frame = mergeMeta($frame, render($childName, $child, $log));
  }
  $log[] = sprintf(
    '%-16s contexts=[%s] tags=[%s] max-age=%s',
    $name,
    implode(',', $frame['contexts']),
    implode(',', $frame['tags']),
    $frame['max-age'] === PERMANENT ? 'PERMANENT' : $frame['max-age']
  );
  return $frame;
}

$page = [
  '#cache' => ['contexts' => ['url.path'], 'tags' => ['http_response']],
  'children' => [
    'main' => [
      'children' => [
        'article' => ['#cache' => ['tags' => ['node:12']]],
        'ticker' => ['#cache' => ['contexts' => ['user.roles'], 'max-age' => 60]],
      ],
    ],
    // This block reads mysite.settings but declares nothing. Bug.
    'sidebar' => ['children' => ['promo' => []]],
  ],
];

$log = [];
$root = render('page', $page, $log);
echo "-- bubbled (buggy sidebar) --\\n";
foreach ($log as $line) {
  echo $line . "\\n";
}
echo "\\n";

// Fix: $renderer->addCacheableDependency($build, $config) on the promo block.
$page['children']['sidebar']['children']['promo']['#cache'] =
  ['tags' => ['config:mysite.settings']];
$log = [];
$fixed = render('page', $page, $log);
echo "-- bubbled (dependency declared) --\\n";
echo end($log) . "\\n\\n";

echo 'root tags gained: ' . implode(',', array_values(array_diff($fixed['tags'], $root['tags']))) . "\\n";
echo 'page cacheable? ' . ($fixed['max-age'] === PERMANENT ? 'yes' : 'only ' . $fixed['max-age'] . 's') . "\\n";
`,
    output: `-- bubbled (buggy sidebar) --
article          contexts=[] tags=[node:12] max-age=PERMANENT
ticker           contexts=[user.roles] tags=[] max-age=60
main             contexts=[user.roles] tags=[node:12] max-age=60
promo            contexts=[] tags=[] max-age=PERMANENT
sidebar          contexts=[] tags=[] max-age=PERMANENT
page             contexts=[url.path,user.roles] tags=[http_response,node:12] max-age=60

-- bubbled (dependency declared) --
page             contexts=[url.path,user.roles] tags=[http_response,node:12,config:mysite.settings] max-age=60

root tags gained: config:mysite.settings
page cacheable? only 60s
`,
  },

  keyPoints: [
    "Bubbling is upward-only: Renderer pushes a BubbleableMetadata frame per level onto a RenderContext stack and RenderContext::bubble() merges each child's frame into its parent's, so a leaf's context or max-age becomes the whole page's.",
    "Contexts and tags union on merge; max-age goes through Cache::mergeMaxAges(), which ignores Cache::PERMANENT (-1) and takes the minimum — the shortest-lived element wins, and a single max-age 0 makes the page uncacheable.",
    "$renderer->addCacheableDependency($build, $object) is the workhorse: entities (EntityInterface extends CacheableDependencyInterface), config objects (ConfigBase), and AccessResult all carry their own tags/contexts/max-age. Drupal\\Core\\Url does not — pass the GeneratedUrl from $url->toString(TRUE) instead.",
    "CacheableMetadata::createFromRenderArray() / createFromObject() / merge() / applyTo() is the manual form; merge() is immutable, the add*() methods mutate, and applyTo() overwrites #cache wholesale so merge before you apply.",
    "Controllers returning a Response opt out of the metadata pipeline unless it implements CacheableResponseInterface — use CacheableResponse, CacheableJsonResponse, CacheableRedirectResponse or CacheableAjaxResponse and call addCacheableDependency() on it.",
    "The classic bug is reading config or loading an entity in a builder and never declaring it: the output caches once and never updates. Declare the dependency at the point of the read, and give access checks their cacheability with AccessResult::allowed()->addCacheableDependency().",
  ],

  interview: [
    {
      q: "Explain cache metadata bubbling in Drupal, and why it means a small block can hurt the whole page.",
      a: "During rendering, `Renderer::doRender()` pushes a `BubbleableMetadata` frame per render-array level onto a `RenderContext` stack; when a subtree finishes, `RenderContext::bubble()` pops its frame and merges it into the parent's. Cache contexts and tags are unioned upward, and max-age is combined with `Cache::mergeMaxAges()`, which discards `Cache::PERMANENT` and returns the minimum. So a nested 'who's online' block declaring the `user` context makes the entire page vary per user: Dynamic Page Cache now stores one variation per account for authenticated users. The Internal Page Cache is different — it keys entries on the URL alone and ignores cache contexts entirely, so it keeps serving one variant to every anonymous user no matter what contexts bubbled up. That is a correctness risk, not a bypass; the only way to vary anonymous output is to disable that module. What actually disables both page caches is a leaf with `'max-age' => 0` (or the `page_cache_kill_switch` service), which also makes the whole render tree uncacheable. The remedy is not to strip metadata (that produces wrong output) but to move the volatile piece behind a `#lazy_builder` placeholder so the bubble stops at that boundary.",
    },
    {
      q: "A colleague's custom block prints a value from a config object and it never updates after the site editor changes the setting. Diagnose it.",
      a: "The builder read config but never declared the dependency, so nothing in `$build['#cache']['tags']` mentions `config:whatever.settings`. The rendered output was cached under the render cache and the page cache, and saving the config invalidates the `config:whatever.settings` tag — which no cache entry claims, so nothing is cleared. The fix is one line: `$this->renderer->addCacheableDependency($build, $config);`, which pulls the tags from the config object (`ConfigBase::getCacheTags()` returns `config:NAME`). The same class of bug applies to entities loaded in the builder, to `Url` objects (which do *not* implement `CacheableDependencyInterface` — use `$url->toString(TRUE)` and pass the returned `GeneratedUrl`), and to access checks. The rule to state in an interview: every read is a dependency, and you declare it where you read it.",
    },
    {
      q: "How do you keep a controller that returns a JSON response cacheable, and what goes wrong if you don't?",
      a: "Return a `CacheableJsonResponse` rather than a plain `JsonResponse`. It implements `CacheableResponseInterface` via `CacheableResponseTrait`, so `$response->addCacheableDependency($node)` merges that object's metadata into the response's `CacheableMetadata`, which Dynamic Page Cache and the `X-Drupal-Cache-Tags` header both consume. A plain `JsonResponse` carries no metadata, so Dynamic Page Cache will not store it and a reverse proxy has nothing to purge on. There is a related failure to know about: if the controller renders something early — a stray `Renderer::render()` call — while returning a `CacheableResponseInterface`, core throws a `LogicException` about leaked metadata, because that metadata would silently be lost. Use `renderInIsolation()` (which replaced the deprecated `renderPlain()` in Drupal 10.3) or restructure to return a render array.",
    },
    {
      q: "What is RefinableCacheableDependencyInterface and where does it matter?",
      a: "`CacheableDependencyInterface` is read-only — three getters for contexts, tags and max-age. `RefinableCacheableDependencyInterface` extends it with `addCacheContexts()`, `addCacheTags()`, `mergeCacheMaxAge()` and `addCacheableDependency()`, so a value object can accumulate cacheability as it is built. It matters most on `AccessResult`, which implements it: `AccessResult::allowed()->addCacheableDependency($node)->cachePerPermissions()` makes the decision itself cacheable, and that metadata bubbles into whatever rendered the protected content. `EntityInterface` and `ConfigBase` also implement it, which is why you can add extra tags to an entity before returning it from a builder. Note that passing a non-`CacheableDependencyInterface` object to the refinable `addCacheableDependency()` was deprecated in Drupal 11.2.0 and becomes a requirement in 12.0.0.",
    },
  ],

  quiz: [
    {
      question:
        "A page-level render array declares 'max-age' => 3600. A block nested three levels down declares 'max-age' => 60, and a sibling leaf declares Cache::PERMANENT. What is the page's effective max-age after bubbling?",
      options: ["3600", "60", "Cache::PERMANENT (-1)", "0"],
      answerIndex: 1,
      explain:
        "Cache::mergeMaxAges() filters out Cache::PERMANENT (-1) and returns the minimum of what remains, so 60 wins over 3600. Max-age intersects on the way up — the shortest-lived descendant sets the lifetime for everything above it.",
    },
    {
      question:
        "Your block builder does $url = Url::fromRoute('mysite.incident', ['id' => $id]); and then $this->renderer->addCacheableDependency($build, $url);. What happens?",
      options: [
        "The URL's route cache tags are merged into $build.",
        "Nothing is merged and $build gets max-age 0, because Drupal\\Core\\Url does not implement CacheableDependencyInterface.",
        "A fatal error, because addCacheableDependency() only accepts entities.",
        "The URL's access result is merged, including the user.permissions context.",
      ],
      answerIndex: 1,
      explain:
        "Url does not implement CacheableDependencyInterface, so CacheableMetadata::createFromObject() falls through to the 'assume uncacheable' branch and sets max-age 0 — the build silently stops caching. Since Drupal 11.3.0 this also emits a deprecation. Use $url->toString(TRUE), which returns a GeneratedUrl carrying the real bubbleable metadata.",
    },
    {
      question:
        "Which is the correct way to make an access decision's cacheability bubble into the page that rendered the protected content?",
      options: [
        "Return AccessResult::allowedIf($ok) and set $build['#cache']['max-age'] = 0 in the caller.",
        "Return a plain boolean and let Drupal infer the dependency from the entity type.",
        "Return AccessResult::allowedIf($ok)->addCacheableDependency($node), since AccessResult implements RefinableCacheableDependencyInterface.",
        "Call Cache::invalidateTags() inside the access check.",
      ],
      answerIndex: 2,
      explain:
        "AccessResult implements AccessResultInterface and RefinableCacheableDependencyInterface (via RefinableCacheableDependencyTrait), so addCacheableDependency() pulls the node's tags, contexts and max-age onto the decision, and the entity access system bubbles that into the render array. Setting max-age 0 would work but throws away all caching; a raw boolean carries no metadata at all.",
    },
    {
      question:
        "You collect metadata across a loop into a CacheableMetadata object and then call $meta->applyTo($build). $build already had '#cache' => ['tags' => ['node_list']] set earlier. What is in $build['#cache']['tags'] afterwards?",
      options: [
        "Only the tags held by $meta — applyTo() overwrites contexts, tags and max-age.",
        "The union of $meta's tags and 'node_list'.",
        "Only 'node_list', because applyTo() will not clobber existing keys.",
        "An empty array, because applyTo() resets #cache entirely.",
      ],
      answerIndex: 0,
      explain:
        "applyTo() assigns $build['#cache']['contexts'], ['tags'] and ['max-age'] directly from the object — it does not merge. That is why the idiom is CacheableMetadata::createFromRenderArray($build) first, merge everything into it, then applyTo() last. (It leaves other #cache keys such as 'keys' alone.)",
    },
  ],
};

export default lesson;

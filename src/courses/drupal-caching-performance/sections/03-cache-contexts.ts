import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "cache-contexts",
  title: "Cache Contexts: Varying, Not Duplicating",
  part: "The Cacheability Model",
  estMinutes: 13,
  summary:
    "A cache context declares what output varies by, and Drupal stores one variant per distinct value — so the whole craft is picking the coarsest context that is still correct, because \`user.permissions\` costs you three cache entries where \`user\` costs you one per account.",

  concept: `
## A context is a dimension, not a switch

Tags answer "when does this go stale". Contexts answer a different question:
**"is this output the same for everybody?"** If it isn't, you name the dimension
it differs along, and Drupal stores one entry per distinct value of that
dimension. The context token becomes part of the cache ID —
\`CacheContextsManager::convertTokensToKeys()\` resolves every token to its
current value and appends it to the keys.

The core vocabulary, roughly by cardinality:

\`\`\`text
route.name  theme  languages:language_interface  timezone   ← tiny
url.path  url.query_args:status  url.query_args:page  route  ← per URL
user.roles:editor  user.permissions                          ← per role/perm set
ip  session  user                                            ← per visitor
\`\`\`

\`user\` and \`session\` are the expensive end. On a news site with 40,000
registered accounts, a fragment that varies by \`user\` is 40,000 cache entries
that each get one hit. A fragment that varies by \`user.permissions\` is maybe
five — one per distinct permission set — because the context's value is a
**hash of the account's permission set**, produced by the
\`user_permissions_hash_generator\` service. Two editors with identical
permissions share an entry even though they are different people. Choosing the
coarsest correct context is most of cache tuning.

## The hierarchy, and the optimizer

A dot marks hierarchy, a colon marks a parameter. \`user.permissions\` and
\`user.roles\` are descendants of \`user\`; \`url.path\` and \`url.query_args\`
are descendants of \`url\`. The ancestor varies **more** finely, so it
subsumes its descendants: Drupal's optimizer turns
\`optimize(['user', 'user.permissions'])\` into \`['user']\`.

That is the trap. Contexts bubble up from children, so one careless block
somewhere in the page adding \`user\` doesn't sit alongside your carefully
chosen \`user.permissions\` — it **deletes** it, and every cheap context under
it, and the whole page becomes per-account. The optimizer is doing correct
arithmetic; the bug is upstream.

## Where contexts come from

You rarely type them all. They arrive because:

- **Access results.** \`AccessResult::allowedIfHasPermission($account, 'edit any incident')\`
  attaches \`user.permissions\` for you. \`->cachePerUser()\` attaches \`user\`.
- **Request-dependent code.** Read \`$request->query->get('status')\` and you
  owe \`url.query_args:status\`. Use \`\\Drupal::routeMatch()\` and you owe
  \`route\` (or \`route.name\` if only the name matters).
- **Core defaults.** \`required_cache_contexts\` in \`renderer.config\` adds
  \`languages:language_interface\`, \`theme\` and \`user.permissions\` to every
  page, which is why they appear on output you never annotated.

## The classic bug

Permission-dependent markup with no \`user.permissions\` context. The first
request to warm that entry is usually yours, as admin. Every later visitor —
including anonymous — gets your variant, complete with the Edit links. It is
not a theming glitch; it is cache poisoning, and it ships to production
silently because in dev you are always logged in.

Confirm with \`http.response.debug_cacheability_headers: true\` and read
\`X-Drupal-Cache-Contexts\` on the response.
`,

  comparisons: [
    {
      label: "Saying 'this output is not the same for everyone'",
      intro:
        "Symfony expresses variation in HTTP terms, on the Response, as a list of header names. Drupal expresses it in domain terms, on the render array, and lets the renderer translate. The difference matters because a proxy has no idea what a permission set is.",
      leftLang: "php",
      rightLang: "php",
      php: `final class IncidentController extends AbstractController
{
    public function toolbar(Request $request): Response
    {
        $status = $request->query->get('status', 'open');

        $response = $this->render('incident/toolbar.html.twig', [
            'incidents' => $this->repo->findByStatus($status),
            'canEdit'   => $this->isGranted('ROLE_EDITOR'),
        ]);

        // Vary is a flat list of HTTP header names. There is no header
        // that means "the permission set of the current account", so the
        // closest honest thing is to vary on the session cookie...
        $response->setVary(['Accept-Language', 'Cookie']);

        // ...which is one variant per logged-in visitor, i.e. no shared
        // cache at all. The usual escape hatch is to give up and go
        // private for authenticated traffic.
        $response->setPrivate();

        return $response;
    }
}`,
      ts: `// incident_tracker/src/Controller/ToolbarController.php
public function toolbar(): array {
  $status = $this->requestStack->getCurrentRequest()->query->get('status', 'open');

  return [
    '#theme' => 'incident_toolbar',
    '#incidents' => $this->storage->loadByStatus($status),
    '#can_edit' => $this->currentUser->hasPermission('edit any incident'),
    '#cache' => [
      'keys' => ['incident_tracker', 'toolbar'],
      'contexts' => [
        // Because we read a query argument.
        'url.query_args:status',
        // Because the markup depends on a permission. NOT 'user' —
        // this is ~3 variants instead of one per account.
        'user.permissions',
      ],
      'tags' => ['node_list:incident'],
    ],
  ];
}`,
      note: "The Drupal version stays cacheable for authenticated traffic. 'user.permissions' has a handful of distinct values across the whole site, so authenticated visitors share entries in the render cache and in Dynamic Page Cache instead of each getting their own.",
    },
    {
      label: "The permission-set hash, both ways",
      intro:
        "Symfony can get Drupal's behaviour, but only by bolting it on: FOSHttpCacheBundle's user-context feature makes the proxy fetch a hash of the user's roles and vary on that. Seeing the two side by side is the fastest way to understand what user.permissions actually is.",
      leftLang: "php",
      rightLang: "php",
      php: `// FOSHttpCacheBundle user context: the proxy issues a side request to
// /_fos_user_context_hash, gets back a hash of the user's roles, and
// then varies the real response on that header (default:
// X-User-Context-Hash, configurable via user_context.hash_header).

// The context classes live in the FOSHttpCache LIBRARY, not the bundle.
use FOS\\HttpCache\\UserContext\\ContextProvider;
use FOS\\HttpCache\\UserContext\\UserContext;
use Symfony\\Bundle\\SecurityBundle\\Security;

final class IncidentContextProvider implements ContextProvider
{
    public function __construct(private Security $security) {}

    // Whatever you put in the context becomes part of the hash. Keep the
    // cardinality low by hand: roles, not the user id.
    public function updateUserContext(UserContext $context): void
    {
        $context->addParameter(
            'can_edit',
            $this->security->isGranted('ROLE_EDITOR'),
        );
    }
}

// And the service must be tagged so the hash generator finds it
// (autoconfigure does this for you, at priority 0):
//   tags:
//     - { name: fos_http_cache.user_context_provider, priority: 10 }

// You still own: the hash TTL, the sanity of the parameter set, and
// making sure nothing per-user leaks into it.`,
      ts: `use Drupal\\Core\\Access\\AccessResult;

// Drupal ships the same idea as a first-class cache context. The value
// of 'user.permissions' is a hash of the account's full permission set,
// from the user_permissions_hash_generator service. You never build it.

// 1. Access results carry the context automatically.
public function access(AccountInterface $account) {
  // Attaches the 'user.permissions' cache context for you.
  return AccessResult::allowedIfHasPermission($account, 'edit any incident');
}

// 2. Explicitly, when the markup (not access) depends on a permission.
$build['#cache']['contexts'][] = 'user.permissions';

// 3. Cheaper still when a single role is the real dimension: this is a
//    boolean, so exactly 2 variants -- but only correct if the
//    permission cannot also arrive via another role.
$build['#cache']['contexts'][] = 'user.roles:editor';

// 4. The one to avoid unless genuinely per-account (a "My incidents"
//    list, a personal dashboard).
$build['#cache']['contexts'][] = 'user';`,
      note: "Note what you do NOT do in Drupal: no hash route, no TTL for the hash, no worrying that the proxy and the app disagree. The permission hash is recomputed from the account's roles and invalidated by core when role permissions change.",
    },
    {
      label: "Registering a context Drupal doesn't have",
      intro:
        "The news site paywalls incident detail by subscription tier: free, member, press. That is a genuine new dimension with three values. In Symfony you fold it into a hash provider; in Drupal you register a real context so it composes with everything else.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: there is no registry of variation dimensions. You either
// add a parameter to the user-context hash (above) or, for the
// application-level cache, build the key by hand at every call site.

use Symfony\\Contracts\\Cache\\CacheInterface;

final class IncidentRenderer
{
    public function __construct(
        private CacheInterface $pool,
        private SubscriptionResolver $tiers,
    ) {}

    public function render(Incident $incident): string
    {
        $tier = $this->tiers->currentTier();   // 'free' | 'member' | 'press'

        // The key is a string you assemble. Forget a component here and
        // you have poisoned the pool; there is no optimizer, no
        // hierarchy, and nothing bubbles.
        $key = sprintf('incident.%d.%s.%s', $incident->getId(), $tier, $this->locale);

        return $this->pool->get($key, fn () => $this->doRender($incident, $tier));
    }
}`,
      ts: `// incident_tracker/src/Cache/Context/SubscriptionTierCacheContext.php
namespace Drupal\\incident_tracker\\Cache\\Context;

use Drupal\\Core\\Cache\\CacheableMetadata;
use Drupal\\Core\\Cache\\Context\\CacheContextInterface;
use Drupal\\Core\\Session\\AccountInterface;

class SubscriptionTierCacheContext implements CacheContextInterface {

  public function __construct(protected AccountInterface $currentUser) {}

  public static function getLabel() {
    return t('Subscription tier');
  }

  // The value that gets baked into the cache ID. Keep it low-cardinality.
  public function getContext() {
    return $this->currentUser->isAuthenticated()
      ? ($this->currentUser->getAccount()->tier ?? 'free')
      : 'free';
  }

  // What must invalidate entries keyed by this context.
  public function getCacheableMetadata() {
    $metadata = new CacheableMetadata();
    $metadata->addCacheTags(['incident_tracker:tiers']);
    return $metadata;
  }

}

// Then it is usable as '#cache' => ['contexts' => ['subscription_tier']]
// anywhere in the site, and it optimizes and bubbles like a core context.`,
      note: "The service id determines the token: register it as cache_context.subscription_tier and you write 'subscription_tier'. Use a dot for a child of an existing context (cache_context.user.subscription_tier gives 'user.subscription_tier', which 'user' will then absorb). For parameterised tokens like 'foo:bar', implement CalculatedCacheContextInterface instead.",
    },
    {
      label: "Wiring and inspecting",
      intro:
        "The service definition that makes the context above real, plus the two settings that decide which contexts every page gets and which ones are expensive enough to placeholder away.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: config/packages/fos_http_cache.yaml
fos_http_cache:
  user_context:
    enabled: true
    # Header the hash is written to and varied on.
    hash_header: X-User-Context-Hash
    # Which request headers identify the user for the hash lookup.
    user_identifier_headers: [Cookie, Authorization]
    # How long the proxy may reuse a hash before asking again.
    hash_cache_ttl: 900

# And you must expose the lookup route, reachable anonymously:
# user_context_hash:
#     path: /_fos_user_context_hash

# Inspecting: read Vary and X-User-Context-Hash off the response
# by hand. There is no per-fragment breakdown.`,
      ts: `# incident_tracker/incident_tracker.services.yml
services:
  cache_context.subscription_tier:
    class: Drupal\\incident_tracker\\Cache\\Context\\SubscriptionTierCacheContext
    arguments: ['@current_user']
    tags:
      - { name: cache.context }

# sites/development.services.yml
parameters:
  # Adds X-Drupal-Cache-Contexts / -Tags / -Max-Age to every response.
  http.response.debug_cacheability_headers: true
  renderer.config:
    # Contexts core adds to EVERY page, whether you asked or not.
    required_cache_contexts:
      - 'languages:language_interface'
      - theme
      - 'user.permissions'
    # An element that ALREADY declares a #lazy_builder and matches any
    # of these is auto-placeholdered out of the parent, so its
    # high-cardinality context stops poisoning the whole page.
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: []`,
      note: "auto_placeholder_conditions is the escape hatch for the 'user' problem, but only for elements that already declare a #lazy_builder callback: PlaceholderGenerator::canCreatePlaceholder() is the gate and returns FALSE for anything without one (or with '#create_placeholder' => FALSE), and only then are these conditions consulted. For a lazy-buildable element, a 'session' or 'user' context (or max-age 0) means it is replaced with a placeholder and rendered separately, so its context never bubbles into the page-level entry — the mechanism behind Dynamic Page Cache serving a shared page with per-user holes. A per-user element with no #lazy_builder still poisons the page; you must convert it to a lazy builder first.",
    },
  ],

  playground: {
    intro:
      "Seven accounts hit the same permission-gated toolbar. Four candidate context sets are scored two ways: how many cache entries they produce, and whether any two accounts sharing a cache ID actually want different markup. The winner is the coarsest set that is still correct — then watch one stray 'user' delete it. Predict the four rows before you run it.",
    lang: "php",
    code: `<?php
// Cache contexts as cardinality-vs-correctness arithmetic. No Drupal bootstrap.

$accounts = [
  ['uid' => 0,  'roles' => ['anonymous'],               'perms' => ['access content']],
  ['uid' => 12, 'roles' => ['authenticated'],           'perms' => ['access content']],
  ['uid' => 27, 'roles' => ['authenticated'],           'perms' => ['access content']],
  ['uid' => 31, 'roles' => ['authenticated'],           'perms' => ['access content']],
  ['uid' => 44, 'roles' => ['authenticated', 'editor'], 'perms' => ['access content', 'edit any incident']],
  ['uid' => 58, 'roles' => ['authenticated', 'editor'], 'perms' => ['access content', 'edit any incident']],
  ['uid' => 61, 'roles' => ['authenticated', 'admin'],  'perms' => ['access content', 'edit any incident', 'administer incidents']],
];

/** The toolbar's real output: an Edit link, gated on a permission. */
function render_toolbar(array $account): string {
  return in_array('edit any incident', $account['perms'], TRUE)
    ? '<a href="/incident/9/edit">Edit</a>'
    : '';
}

/** Drupal's user.permissions value: a hash of the whole permission SET. */
function permissions_hash(array $account): string {
  $perms = $account['perms'];
  sort($perms);
  return substr(hash('sha256', implode('|', $perms)), 0, 6);
}

/** Resolve one context token to its value for a given account. */
function resolve(string $context, array $account): string {
  if ($context === 'user') {
    return (string) $account['uid'];
  }
  if ($context === 'user.permissions') {
    return permissions_hash($account);
  }
  if (str_starts_with($context, 'user.roles:')) {
    return in_array(substr($context, 11), $account['roles'], TRUE) ? '1' : '0';
  }
  return 'NULL';
}

/** CacheContextsManager::convertTokensToKeys() -- contexts become CID parts. */
function cid(array $keys, array $contexts, array $account): string {
  sort($contexts);
  $parts = $keys;
  foreach ($contexts as $context) {
    $parts[] = $context . '=' . resolve($context, $account);
  }
  return implode(':', $parts);
}

$keys = ['incident_tracker', 'toolbar'];

echo "Fill the cache with all 7 accounts, then judge each candidate context set.\\n";
echo "A set is CORRECT when no two accounts sharing a CID want different markup.\\n\\n";

foreach ([[], ['user.roles:editor'], ['user.permissions'], ['user']] as $contexts) {
  $bucket = [];
  foreach ($accounts as $account) {
    $bucket[cid($keys, $contexts, $account)][] = render_toolbar($account);
  }
  $correct = TRUE;
  foreach ($bucket as $variants) {
    if (count(array_unique($variants)) > 1) {
      $correct = FALSE;
    }
  }
  printf(
    "  %-18s %d entries  %s\\n",
    $contexts ? implode(' + ', $contexts) : '(none)',
    count($bucket),
    $correct ? 'correct' : 'WRONG'
  );
}

echo "\\n  (none)             collides: anonymous is served the admin's Edit link.\\n";
echo "  user.roles:editor  collides: uid 61 has the permission via the admin role.\\n";
echo "  user.permissions   correct AND coarse, 3 entries. This is the answer.\\n";
echo "  user               correct but one entry per account, forever.\\n";

/**
 * CacheContextsManager::optimizeTokens(): '.' marks hierarchy, ':' marks a
 * parameter. An ancestor varies MORE finely, so it absorbs its descendants:
 * optimize(['user', 'user.permissions']) === ['user'].
 */
function optimize(array $contexts): array {
  $contexts = array_values(array_unique($contexts));
  sort($contexts);
  $kept = [];
  foreach ($contexts as $context) {
    $absorbed = FALSE;
    foreach ($contexts as $other) {
      if ($other === $context) {
        continue;
      }
      if (str_starts_with($context, $other . '.') || str_starts_with($context, $other . ':')) {
        $absorbed = TRUE;
        break;
      }
    }
    if (!$absorbed) {
      $kept[] = $context;
    }
  }
  return $kept;
}

echo "\\nNow one careless block deep in the page adds 'user', and it bubbles up:\\n";
$bubbled = ['user.permissions', 'user.roles:editor', 'theme', 'url.path', 'url', 'user'];
echo '  bubbled:   ' . implode(', ', $bubbled) . "\\n";
echo '  optimized: ' . implode(', ', optimize($bubbled)) . "\\n";
echo "  Three tokens vanished, not because they were wrong, but because 'user' and\\n";
echo "  'url' already vary more finely. The whole page is now per-account.\\n";
`,
    output: `Fill the cache with all 7 accounts, then judge each candidate context set.
A set is CORRECT when no two accounts sharing a CID want different markup.

  (none)             1 entries  WRONG
  user.roles:editor  2 entries  WRONG
  user.permissions   3 entries  correct
  user               7 entries  correct

  (none)             collides: anonymous is served the admin's Edit link.
  user.roles:editor  collides: uid 61 has the permission via the admin role.
  user.permissions   correct AND coarse, 3 entries. This is the answer.
  user               correct but one entry per account, forever.

Now one careless block deep in the page adds 'user', and it bubbles up:
  bubbled:   user.permissions, user.roles:editor, theme, url.path, url, user
  optimized: theme, url, user
  Three tokens vanished, not because they were wrong, but because 'user' and
  'url' already vary more finely. The whole page is now per-account.
`,
  },

  keyPoints: [
    "A cache context names a dimension the output varies along; its resolved value is appended to the cache ID, so every context multiplies the number of stored variants. Cardinality, not correctness, is what you are optimising once the output is right.",
    "user.permissions is a hash of the account's permission set (from the user_permissions_hash_generator service), so it yields a handful of variants site-wide; user yields one per account. Reaching for 'user' when 'user.permissions' would do is the single most common cache-hit-rate killer.",
    "Contexts are hierarchical: a dot marks a child, a colon marks a parameter, and the ancestor varies more finely, so optimize(['user','user.permissions']) === ['user']. Because contexts bubble, one careless block adding 'user' silently deletes every cheaper context on the page.",
    "Contexts arrive from access results (AccessResult::allowedIfHasPermission attaches user.permissions, ->cachePerUser() attaches user), from request-dependent code (query args need url.query_args:status, route matching needs route or route.name), and from renderer.config's required_cache_contexts.",
    "The classic bug is permission-dependent markup with no user.permissions context: the admin warms the entry and anonymous visitors are then served the admin's Edit links. Catch it with http.response.debug_cacheability_headers and the X-Drupal-Cache-Contexts response header.",
    "When a high-cardinality context is genuinely unavoidable, don't accept it on the page — convert that element to a #lazy_builder so it can be placeholdered out. renderer.config's auto_placeholder_conditions (contexts: session, user) then does it for you, but only for elements that already declare a #lazy_builder callback; a plain render array carrying 'user' is never auto-placeholdered and still bubbles that context into the page-level entry.",
  ],

  interview: [
    {
      q: "What is the difference between the `user` and `user.permissions` cache contexts, and how do you decide which one a block needs?",
      a: "Both say the output varies per visitor, but at wildly different cardinalities. `user` resolves to the account id, so you get one cache entry per account — 40,000 accounts means 40,000 entries, each with roughly one hit, which is a cache that costs storage and returns nothing. `user.permissions` resolves to a hash of the account's whole permission set, generated by the `user_permissions_hash_generator` service, so every account with identical permissions shares an entry; a typical site has a handful of distinct values. The decision rule is: use `user` only when the output genuinely differs *per person* — a 'My incidents' list, an unread-messages count — and `user.permissions` when it differs only by *what this person is allowed to do*, which covers almost all admin links, edit tabs and moderation controls. If a single role is really the dimension, `user.roles:editor` is cheaper still at two variants, but only when the permission cannot also be granted through another role.",
    },
    {
      q: "A colleague reports that anonymous visitors on the news site are seeing 'Edit' links they can't use. Walk me through diagnosing it.",
      a: "That is the signature of permission-dependent markup rendered without the `user.permissions` cache context: an editor's request warmed the cache entry, and because the entry's cache ID contains nothing that distinguishes an editor from anonymous, everyone downstream gets that variant. I would enable `http.response.debug_cacheability_headers: true` in `sites/development.services.yml` and read `X-Drupal-Cache-Contexts` on the affected page — if `user.permissions` is absent, that's the bug. The fix is to declare it, ideally not by hand: if the link is gated by an access check, return `AccessResult::allowedIfHasPermission($account, 'edit any incident')` and the context comes along automatically, and `$renderer->addCacheableDependency($build, $accessResult)` merges it in. If the markup itself branches on `$this->currentUser->hasPermission(...)` then add `'user.permissions'` to `#cache['contexts']` explicitly. What I would *not* do is set `max-age => 0`, which trades a correctness bug for a performance bug across the whole page.",
    },
    {
      q: "You add `user.permissions` to a block, but the page's `X-Drupal-Cache-Contexts` header shows `user` instead and hit rates collapse. What happened?",
      a: "Cache contexts form a hierarchy where the dot separates a child from its parent, and the *ancestor* is the more granular variation — if output varies per user it necessarily varies per permission set. So `CacheContextsManager`'s optimizer drops the redundant descendant: `optimize(['user', 'user.permissions'])` is `['user']`. Since contexts bubble up from every child element into the parent, something else on that page — another block, a field formatter, a `->cachePerUser()` access result — declared `user`, and once it reached the same level it absorbed my `user.permissions` along with anything else beneath `user`. The fix is to find the offender rather than to fight the optimizer: `renderer.config.debug: true` annotates each rendered element with its cacheability in HTML comments, which makes the culprit obvious. If that element legitimately varies per user, the right move is to placeholder it out with `#lazy_builder` so its context never bubbles into the page-level entry — which is what `auto_placeholder_conditions` does for `session` and `user` out of the box.",
    },
    {
      q: "How would you explain cache contexts to a Symfony developer in terms they already know?",
      a: "A cache context is a `Vary` header that understands your domain instead of only HTTP. In Symfony you write `$response->setVary(['Accept-Language', 'Cookie'])`, and the proxy keys its store on those raw header values — which works fine for language but falls apart for anything user-shaped, because varying on `Cookie` means one variant per session, i.e. no shared cache for logged-in traffic at all. The Symfony ecosystem's answer is FOSHttpCacheBundle's user-context feature: the proxy makes a side request to `/_fos_user_context_hash`, gets back a hash of the user's roles in an `X-User-Context-Hash` header, and varies on that instead. That is precisely Drupal's `user.permissions`, except Drupal has it built in, applies it per *fragment* rather than per response, composes it with a hierarchy and an optimizer, and bubbles it up automatically. The mental shift is that in Symfony the cache key is a string you assemble at each call site, whereas in Drupal it is metadata the render tree accumulates on your behalf.",
    },
  ],

  quiz: [
    {
      question:
        "A block renders an 'Edit' link only for users with 'edit any incident'. There are 40,000 accounts and 4 distinct permission sets. Which cache context is the right choice?",
      options: [
        "'user' — the output depends on who is looking",
        "'user.permissions' — the output depends only on what they're allowed to do",
        "'session' — so each browser session gets its own variant",
        "None; add 'max-age' => 0 so it is always rebuilt",
      ],
      answerIndex: 1,
      explain:
        "The markup varies by permission, not by identity, so 'user.permissions' is the coarsest correct context: 4 cache entries instead of 40,000. 'user' and 'session' are both correct but produce one entry per account/session, which is a cache that never gets a second hit. 'max-age' => 0 makes the block uncacheable and, because max-age bubbles as a minimum, poisons every ancestor up to the response.",
    },
    {
      question:
        "During rendering, both 'user' and 'user.permissions' bubble to the same element. What does Drupal's cache context optimizer store in the cache ID?",
      options: [
        "Both tokens, concatenated",
        "Only 'user.permissions', because it has the lower cardinality",
        "Only 'user', because it is the ancestor and already varies more finely",
        "Neither — the conflict sets max-age to 0",
      ],
      answerIndex: 2,
      explain:
        "optimize(['user', 'user.permissions']) === ['user']. The dot marks hierarchy and the ancestor is the *more* granular variation: output that varies per user necessarily varies per permission set, so the descendant is redundant. This is why a single stray 'user' anywhere in a render tree is so expensive — it silently absorbs all the cheap contexts beneath it and re-keys the whole page per account.",
    },
    {
      question:
        "Your controller reads $request->query->get('status') to filter an incident list. Which cache context does that create an obligation for?",
      options: [
        "'route.name', because the route determines the controller",
        "'url.query_args:status'",
        "'url', which is required for anything reading the request",
        "None — query arguments are already part of the page cache key",
      ],
      answerIndex: 1,
      explain:
        "Reading a query argument means the output varies by that argument, so you owe 'url.query_args:status' — the parameterised form, which varies only by that one argument. Bare 'url' would also be correct but varies by the entire URL including every other query string, which is far higher cardinality. 'route.name' varies only by route, so ?status=open and ?status=closed would collide. Internal render-cache entries are not keyed by the URL unless a context says so.",
    },
    {
      question:
        "Which statement about registering a custom cache context in a module is true?",
      options: [
        "The token is taken from the class name, so the class must be named FooCacheContext",
        "The service must be tagged { name: cache.context }, and the token is the service id minus the 'cache_context.' prefix",
        "Custom contexts must be declared in a *.cache_contexts.yml file",
        "Custom contexts cannot participate in optimization or bubbling",
      ],
      answerIndex: 1,
      explain:
        "You define a service implementing CacheContextInterface (or CalculatedCacheContextInterface for parameterised 'foo:bar' tokens), tag it with cache.context, and name it cache_context.subscription_tier so the token is 'subscription_tier'. Naming it cache_context.user.subscription_tier makes it a child of 'user', which means a bubbled 'user' will absorb it. Custom contexts behave exactly like core ones: they bubble, they optimize, and their getCacheableMetadata() contributes tags and max-age.",
    },
  ],
};

export default lesson;

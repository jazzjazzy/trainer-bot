import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "dynamic-page-cache",
  title: "Dynamic Page Cache: Caching for Logged-In Users",
  part: "Page & Render Caching Layers",
  estMinutes: 13,
  summary:
    "Dynamic Page Cache stores the whole page with the personalised fragments left as placeholder tokens, keyed on the page's cache contexts — so every editor with the same permissions shares one cached shell, and a missing context becomes a cross-user data leak.",

  concept: `
## The layer that serves your logged-in traffic

Internal Page Cache only ever helps anonymous visitors. The moment a reporter
logs in to the incident site, that layer steps aside and **Dynamic Page Cache**
(core module \`dynamic_page_cache\`) takes over. It works for anonymous *and*
authenticated users, needs no configuration, and has no UI — it simply reads the
cacheability metadata your render arrays already carry.

### What it actually stores

Dynamic Page Cache hooks the kernel \`RESPONSE\` event *before* placeholders are
replaced. So what lands in the cache is the finished page markup with
\`<drupal-render-placeholder>\` tokens still sitting where the personalised bits
go, plus the attachments needed to rebuild them. On a hit, Drupal takes the
cached shell out of \`cache_dynamic_page_cache\` and only runs the placeholder
callbacks — the "Hi, Priya" greeting, the unread-notifications count, the
contextual-links markup. Everything else, the 40 expensive incident teasers, is
free.

### Keyed on cache contexts, not on the user

The subscriber uses a **variation cache** (\`variation_cache.dynamic_page_cache\`).
The first request for a route stores a *redirect* under the initial contexts
(\`route\` and \`request_format\`); that redirect names the full context set that
bubbled up during rendering, and a second lookup fetches the real entry.

That indirection is the whole point. If the page's bubbled contexts are only
\`route\`, \`languages:language_interface\`, \`theme\` and \`user.permissions\` — the
three in \`renderer.config.required_cache_contexts\` plus the route — then **every
user who shares a permissions hash shares one cache entry**. Fifty editors, one
stored page.

### This is where a missing context leaks data

Internal Page Cache is anonymous-only, so a forgotten context there is mostly a
wrong-content bug. Here it is a security bug: if your block prints
\`\\Drupal::currentUser()->getAccountName()\` and you forget
\`#cache['contexts'][] = 'user'\`, uid 12's name is baked into an entry that uid 40
will be served. Declaring \`user\` on the block stops the leak, but it does not
give you a cached page: \`user\` is one of the
\`auto_placeholder_conditions.contexts\`, so once it bubbles to the root the whole
response is refused with \`UNCACHEABLE (poor cacheability)\`. The real fix is to
move the fragment behind a \`#lazy_builder\` — with \`user\` declared *on that
element* — so the context stays inside the placeholder and never reaches the
root at all.

### Uncacheable pages

A response is skipped when its metadata is *poor*, judged against
\`renderer.config.auto_placeholder_conditions\`: \`max-age: 0\`, or a
high-cardinality context (\`session\`, \`user\`). Admin routes are refused by a
\`DenyAdminRoutes\` response policy. \`max-age: 0\` anywhere in the tree bubbles to
the root and takes the page with it — that is why one lazy \`'#cache' =>
['max-age' => 0]\` on a debug block can flatten a whole site's authenticated
performance.

### Read the header

\`X-Drupal-Dynamic-Cache\` is the single most useful debugging header in Drupal.
\`HIT\`, \`MISS\`, or \`UNCACHEABLE\`. Since Drupal 10.4 / 11.1 the uncacheable value
carries its reason: \`UNCACHEABLE (poor cacheability)\`,
\`UNCACHEABLE (no cacheability)\`, \`UNCACHEABLE (request policy)\`,
\`UNCACHEABLE (response policy)\`. Read it alongside \`X-Drupal-Cache\` (the
anonymous layer) and you can tell in one \`curl -I\` which layer is failing you.
`,

  comparisons: [
    {
      label: "Personalising a cached page",
      intro:
        "A news page that is identical for everyone except a greeting. Symfony makes you cut the hole yourself with ESI; Drupal cuts it for you from the fragment's own cache metadata.",
      php: `{# Symfony: you decide where the hole goes, by hand #}
{# config/packages/framework.yaml: framework.esi.enabled: true #}

<h1>Incidents</h1>
{{ render_esi(controller('App\\\\Controller\\\\GreetingController::show')) }}
{% for incident in incidents %}
  {{ include('incident/_teaser.html.twig') }}
{% endfor %}`,
      ts: `<?php
// Drupal: declare the fragment's cacheability, let the renderer decide.
$build['greeting'] = [
  '#lazy_builder' => ['incident.greeting:build', []],
  '#create_placeholder' => TRUE,
];

// Or omit #create_placeholder and let the renderer decide. The metadata you
// *declare on the lazy-builder element* is what it tests against
// renderer.config.auto_placeholder_conditions (max-age 0, or the
// 'session'/'user' contexts) — the callback has not run yet, so nothing has
// "bubbled" and it must be declared up front.
$build['greeting'] = [
  '#lazy_builder' => ['incident.greeting:build', []],
  '#cache' => ['contexts' => ['user']],
];`,
      note: "Symfony ESI is opt-in per template. Drupal auto-placeholders any #lazy_builder fragment whose declared cacheability would otherwise poison the page — the mechanism is driven by metadata, not by markup. No #lazy_builder, no placeholder: canCreatePlaceholder() requires one.",
      leftLang: "twig",
      rightLang: "php",
    },
    {
      label: "Asking which cache layer served the page",
      intro:
        "Both stacks expose a debug header. Drupal gives you two, one per layer, and that pair tells you almost everything.",
      php: `# Symfony HttpCache (framework.http_cache.trace_header / debug)
curl -sI https://news.example/incidents | grep -i x-symfony-cache

# X-Symfony-Cache: GET /incidents: fresh
# values: fresh | stale | miss | store | invalid`,
      ts: `# Drupal: two layers, two headers.
curl -sI https://news.example/incidents \\
  | grep -iE 'x-drupal-cache|x-drupal-dynamic-cache|cache-control'

# Anonymous request:
#   X-Drupal-Cache: HIT                  <- internal_page_cache served it
#   X-Drupal-Dynamic-Cache: MISS         <- never reached (page cache won)
#
# Authenticated request (send the session cookie):
#   X-Drupal-Cache: UNCACHEABLE (request policy)
#   X-Drupal-Dynamic-Cache: HIT          <- this is the layer doing the work
#
# Broken page:
#   X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)`,
      note: "UNCACHEABLE with a parenthesised reason arrived in Drupal 10.4 / 11.1; older 10.x prints a bare UNCACHEABLE. X-Drupal-Cache: UNCACHEABLE (request policy) on a logged-in request is normal, not a bug.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Turning on the diagnostics",
      intro:
        "When the header says UNCACHEABLE you need to know which context or max-age did it. Both frameworks hide that behind a dev-only switch.",
      php: `# Symfony: config/packages/framework.yaml
framework:
  http_cache:
    enabled: true
    debug: '%kernel.debug%'
    trace_header: X-Symfony-Cache
  # Fragment-level detail comes from the profiler / Blackfire,
  # not from the HTTP response itself.`,
      ts: `# Drupal: sites/default/services.yml (or development.services.yml)
parameters:
  # Adds X-Drupal-Cache-Tags, X-Drupal-Cache-Contexts, X-Drupal-Cache-Max-Age
  # to every response — the exact metadata that bubbled to the root.
  http.response.debug_cacheability_headers: true

  # Container parameters are REPLACED wholesale, never deep-merged, so you
  # must copy the entire renderer.config block from default.services.yml.
  # Listing only 'debug' here would delete required_cache_contexts and
  # auto_placeholder_conditions, and Renderer / DynamicPageCacheSubscriber
  # both index straight into those keys.
  renderer.config:
    required_cache_contexts: ['languages:language_interface', 'theme', 'user.permissions']
    auto_placeholder_conditions:
      max-age: 0
      contexts: ['session', 'user']
      tags: []
    # Prints <!-- CACHE-HIT / cache tags ... --> comments around each
    # cached render-array subtree, so you can see which child poisoned it.
    debug: true   # <- the only line you are changing

# Never enable either of these in production: the headers get large and
# the comments expose your cache tag namespace.`,
      note: "X-Drupal-Cache-Contexts is the fastest way to spot the offender — see 'user' or 'session' in that list on a shared page and you have found your leak or your cache-miss storm.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "The leak this layer punishes",
      intro:
        "A block renders the current user's display name. Same bug in both stacks, but Drupal's Dynamic Page Cache will happily serve it to the wrong person.",
      php: `<?php
// Symfony: a fragment cached with PSR-6 and no user in the key.
$item = $this->cache->getItem('sidebar.greeting');   // <- no user in the key
if (!$item->isHit()) {
  $item->set($this->twig->render('greeting.html.twig', [
    'name' => $this->security->getUser()->getUserIdentifier(),
  ]));
  $this->cache->save($item);
}
return new Response($item->get());
// Fix: 'sidebar.greeting.' . $user->getUserIdentifier(), or Vary: Cookie
// plus an ESI fragment so the shell stays shared.`,
      ts: `<?php
// Drupal: WRONG — no 'user' context, so this string is stored in the
// dynamic_page_cache entry shared by everyone with the same permissions.
public function build(): array {
  return ['#markup' => $this->t('Hi, @n', ['@n' => $this->currentUser->getAccountName()])];
}

// RIGHT (option A): declare the variation. Correct for security, but now
// the page's bubbled contexts include 'user', which matches
// auto_placeholder_conditions.contexts — Dynamic Page Cache refuses the
// whole response with UNCACHEABLE (poor cacheability). You traded a leak
// for zero page caching.
public function build(): array {
  return [
    '#markup' => $this->t('Hi, @n', ['@n' => $this->currentUser->getAccountName()]),
    '#cache' => ['contexts' => ['user'], 'tags' => ['user:' . $this->currentUser->id()]],
  ];
}

// RIGHT (option B, preferred): put the same metadata on a #lazy_builder
// element. Auto-placeholdering requires a #lazy_builder callback —
// canCreatePlaceholder() checks for exactly that — so this one IS lifted
// out. The 'user' context stays inside the placeholder, the shell keeps
// only user.permissions, and the page caches and stays shared.
$build['greeting'] = [
  '#lazy_builder' => ['incident.greeting:build', []],
  '#cache' => ['contexts' => ['user']],
];`,
      note: "The rule: auto-placeholdering requires a #lazy_builder callback. Declaring 'user' on a plain #markup element makes the page uncacheable, not placeholdered — option A and option B are different code paths, and only B gives you a cached page.",
      leftLang: "php",
      rightLang: "php",
    },
  ],

  playground: {
    intro:
      "A model of the variation-cache lookup Dynamic Page Cache performs. Two editors share a permissions hash, so they share one cached shell; the admin gets his own; a max-age 0 page is refused outright. Predict the hit/miss counts before running it.",
    lang: "php",
    code: `<?php
// A tiny model of Dynamic Page Cache: a variation cache keyed on the page's
// cache contexts, storing HTML that still contains placeholder tokens.

$store = [];        // cid => html-with-placeholders
$redirects = [];    // route => the full context set discovered on the MISS
$hits = 0; $misses = 0; $uncacheable = 0;

// Context values resolved per request. Note there is NO 'user' context here:
// the page shell varies only by permissions, so every editor shares one entry.
function resolve(array $contexts, array $req): string {
  $parts = [];
  foreach ($contexts as $c) {
    $parts[] = $c . '=' . $req[$c];
  }
  return implode('|', $parts);
}

function request(string $label, array $req, int $maxAge, array $contexts,
                 &$store, &$redirects, &$hits, &$misses, &$uncacheable): void {
  $route = $req['route'];
  if ($maxAge === 0) {
    $uncacheable++;
    printf("%-22s X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)\\n", $label);
    return;
  }
  // Step 1: look up the redirect stored under the initial contexts.
  if (!isset($redirects[$route])) {
    $misses++;
    $redirects[$route] = $contexts;
    $cid = resolve($contexts, $req);
    $store[$cid] = "<h1>Incidents</h1><drupal-render-placeholder token=\\"a1\\"></drupal-render-placeholder>";
    printf("%-22s X-Drupal-Dynamic-Cache: MISS   cid=%s\\n", $label, $cid);
    return;
  }
  // Step 2: follow it to the real cache ID.
  $cid = resolve($redirects[$route], $req);
  if (isset($store[$cid])) {
    $hits++;
    printf("%-22s X-Drupal-Dynamic-Cache: HIT    cid=%s\\n", $label, $cid);
  } else {
    $misses++;
    $store[$cid] = "<h1>Incidents</h1><drupal-render-placeholder token=\\"a1\\"></drupal-render-placeholder>";
    printf("%-22s X-Drupal-Dynamic-Cache: MISS   cid=%s\\n", $label, $cid);
  }
}

$contexts = ['route', 'languages:language_interface', 'theme', 'user.permissions'];

$requests = [
  ['uid 7 (editor)',  ['route' => '/incidents', 'languages:language_interface' => 'en', 'theme' => 'olivero', 'user.permissions' => 'ph:9f2a'], 3600],
  ['uid 12 (editor)', ['route' => '/incidents', 'languages:language_interface' => 'en', 'theme' => 'olivero', 'user.permissions' => 'ph:9f2a'], 3600],
  ['uid 40 (admin)',  ['route' => '/incidents', 'languages:language_interface' => 'en', 'theme' => 'olivero', 'user.permissions' => 'ph:c30b'], 3600],
  ['uid 12 (editor)', ['route' => '/incidents', 'languages:language_interface' => 'en', 'theme' => 'olivero', 'user.permissions' => 'ph:9f2a'], 3600],
  ['uid 12 (/user/12)', ['route' => '/user/12', 'languages:language_interface' => 'en', 'theme' => 'olivero', 'user.permissions' => 'ph:9f2a'], 0],
];

foreach ($requests as [$label, $req, $maxAge]) {
  request($label, $req, $maxAge, $contexts, $store, $redirects, $hits, $misses, $uncacheable);
}

echo "\\n";
echo "entries stored : " . count($store) . "\\n";
echo "hits           : $hits\\n";
echo "misses         : $misses\\n";
echo "uncacheable    : $uncacheable\\n";
echo "\\nPlaceholder still rebuilt per request on every HIT (the personalised bit).\\n";
`,
    output: `uid 7 (editor)         X-Drupal-Dynamic-Cache: MISS   cid=route=/incidents|languages:language_interface=en|theme=olivero|user.permissions=ph:9f2a
uid 12 (editor)        X-Drupal-Dynamic-Cache: HIT    cid=route=/incidents|languages:language_interface=en|theme=olivero|user.permissions=ph:9f2a
uid 40 (admin)         X-Drupal-Dynamic-Cache: MISS   cid=route=/incidents|languages:language_interface=en|theme=olivero|user.permissions=ph:c30b
uid 12 (editor)        X-Drupal-Dynamic-Cache: HIT    cid=route=/incidents|languages:language_interface=en|theme=olivero|user.permissions=ph:9f2a
uid 12 (/user/12)      X-Drupal-Dynamic-Cache: UNCACHEABLE (poor cacheability)

entries stored : 2
hits           : 2
misses         : 2
uncacheable    : 1

Placeholder still rebuilt per request on every HIT (the personalised bit).
`,
  },

  keyPoints: [
    "Dynamic Page Cache serves anonymous AND authenticated users; it caches the page markup with <drupal-render-placeholder> tokens still in it, then only rebuilds the placeholders on a hit.",
    "It keys on the page's bubbled cache contexts via a variation cache, so a page that varies only by user.permissions is shared by every account with the same permissions hash.",
    "A missing cache context here is a data-leak bug, not just a staleness bug — the wrong user's fragment gets stored in a shared entry.",
    "A response is refused when its metadata matches renderer.config.auto_placeholder_conditions (max-age 0, or the 'session'/'user' contexts), and admin routes are refused by the DenyAdminRoutes response policy.",
    "X-Drupal-Dynamic-Cache reports HIT / MISS / UNCACHEABLE; since Drupal 10.4 and 11.1 the UNCACHEABLE value names its reason (poor cacheability, no cacheability, request policy, response policy).",
    "Set http.response.debug_cacheability_headers: true in services.yml to get X-Drupal-Cache-Contexts / -Tags / -Max-Age and find the fragment that poisoned the page.",
  ],

  interview: [
    {
      q: "You have a Drupal site where logged-in page loads take 1.5s while anonymous loads take 40ms. Walk me through how you would diagnose it.",
      a: "First request the page with a session cookie and read `X-Drupal-Dynamic-Cache`. `HIT` means the shell is cached and the cost is in placeholder rebuilds or in the database/PHP layer, so I move on to profiling. `MISS` on every request means the cache key is varying more than it should. `UNCACHEABLE` means the response never enters the layer at all. Then I turn on `http.response.debug_cacheability_headers: true` in `services.yml` and look at `X-Drupal-Cache-Contexts` and `X-Drupal-Cache-Max-Age`: a `user` or `session` context on a page that is 95% identical for everyone, or a `max-age` of 0, is almost always one block or one field formatter bubbling bad metadata. The fix is to give that fragment a `#lazy_builder` so it becomes a placeholder instead of poisoning the root.",
    },
    {
      q: "Symfony has HttpCache and ESI. Why does Drupal need a separate Dynamic Page Cache at all?",
      a: "They solve the same problem from opposite directions. In Symfony you decide, per template, where to cut a hole with `render_esi`, and the reverse proxy stitches the fragments back together over HTTP. Drupal instead derives the holes from cacheability metadata that every render array already carries: if a fragment's contexts or max-age would make the page unshareable, the renderer replaces it with a `<drupal-render-placeholder>` token automatically. Dynamic Page Cache then stores the tokenised page in Drupal's own cache backend and replaces the placeholders in-process on every hit — no proxy involved, which is why it works for authenticated users where a shared HTTP cache cannot. BigPipe is the layer that additionally streams those replacements to the browser.",
    },
    {
      q: "A colleague adds `$build['#cache']['max-age'] = 0;` to a block because 'the data changes often'. What do you tell them?",
      a: "That `max-age: 0` bubbles all the way to the root of the render tree, so it does not just make that block uncacheable — it makes the entire page `UNCACHEABLE (poor cacheability)` for Dynamic Page Cache and unstorable in the render cache. The Internal Page Cache is unaffected — it ignores max-age and expires by tag — and so is the edge, because `Cache-Control` is built from `system.performance:cache.page.max_age`, not from your render array; the cost lands squarely on authenticated traffic, which has no other page-level cache. The correct tool is cache tags: give the block the tags of whatever it depends on and invalidate them when that data changes, so it is cached until it is genuinely wrong. If the data really is per-request — a countdown, a random pick — put it behind a `#lazy_builder` so the `max-age: 0` stays inside the placeholder and never reaches the page.",
    },
    {
      q: "How does Dynamic Page Cache decide whether two logged-in users can share a cache entry?",
      a: "It does not look at the user at all; it looks at the cache contexts that bubbled up while rendering the page. Core always applies `renderer.config.required_cache_contexts` — `languages:language_interface`, `theme`, `user.permissions` — plus `route` and `request_format` from the subscriber itself. The variation cache resolves each context to a value (`user.permissions` becomes a hash of the account's permission set) and those values form the cache ID, so two accounts with identical permissions, language and theme land on the same entry. That is the payoff of the design: fifty editors on a news site share one stored page. It also means the whole scheme is only as safe as the metadata your code declares.",
    },
  ],

  quiz: [
    {
      question:
        "An authenticated request returns `X-Drupal-Cache: UNCACHEABLE (request policy)` and `X-Drupal-Dynamic-Cache: HIT`. What is happening?",
      options: [
        "The page is broken — both layers should report HIT.",
        "Normal behaviour: Internal Page Cache is anonymous-only so its request policy declines, and Dynamic Page Cache served the page.",
        "A reverse proxy stripped the headers.",
        "The response has max-age 0, so nothing was cached.",
      ],
      answerIndex: 1,
      explain:
        "Internal Page Cache has a request policy that only accepts anonymous GET/HEAD requests; on a logged-in request it correctly declines. Dynamic Page Cache is the layer that serves authenticated traffic, and HIT there is exactly what you want to see.",
    },
    {
      question:
        "A custom block prints the current user's name with no `#cache` metadata at all. What is the worst realistic consequence?",
      options: [
        "The block renders empty for everyone.",
        "The page is never cached, so the site is merely slow.",
        "The name is stored in a Dynamic Page Cache entry keyed only by permissions, and other users with the same permissions are served it.",
        "Drupal throws an exception at render time.",
      ],
      answerIndex: 2,
      explain:
        "Without a `user` context nothing tells the variation cache that the output varies per account. The entry is keyed on the page's other contexts (route, language, theme, user.permissions), so everyone sharing that permissions hash gets the first user's name. This is why a missing context at this layer is a security bug.",
    },
    {
      question:
        "Which of these makes Dynamic Page Cache report `UNCACHEABLE (poor cacheability)`?",
      options: [
        "A cache tag with a high invalidation rate, such as `node_list`.",
        "A `max-age` of 0 or a `session` / `user` cache context bubbling to the root of the page.",
        "More than ten cache contexts on the page.",
        "Any page containing a form.",
      ],
      answerIndex: 1,
      explain:
        "'Poor cacheability' is judged against `renderer.config.auto_placeholder_conditions`, which by default lists `max-age: 0` and the `session` and `user` contexts (the `tags` list is empty by default). Those are exactly the conditions that also trigger auto-placeholdering, so a fragment that would poison the page is normally lifted out before it can.",
    },
    {
      question:
        "You want to see which fragment poisoned a page's cacheability. What do you enable?",
      options: [
        "`drush cache:rebuild --debug`",
        "`http.response.debug_cacheability_headers: true` in `services.yml`, for `X-Drupal-Cache-Contexts` / `-Tags` / `-Max-Age`",
        "The Devel module's query log",
        "`framework.http_cache.trace_header`",
      ],
      answerIndex: 1,
      explain:
        "That parameter adds the bubbled contexts, tags and max-age to every response as headers, which is the fastest way to spot a stray `user` context or a zero max-age. Pair it with `renderer.config.debug: true` for per-subtree HTML comments. Both are development-only settings.",
    },
  ],
};

export default lesson;

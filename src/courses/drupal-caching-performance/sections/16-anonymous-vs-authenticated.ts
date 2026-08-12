import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "anonymous-vs-authenticated",
  title: "Strategy: Anonymous vs Authenticated Traffic",
  part: "Reverse Proxies & the Edge",
  estMinutes: 13,
  summary:
    "Anonymous traffic should never reach PHP and authenticated traffic always will, so measure the split first: one is an edge-caching and session-hygiene problem, the other is a Dynamic Page Cache, placeholder and database problem.",

  concept: `
## Two populations, two completely different problems

Every Drupal performance conversation should start with one number: what
percentage of your requests are anonymous? A news site that is 95% anonymous and
a members-only application that is 80% authenticated look identical in the admin
UI and share almost no optimisation work. Symfony developers already know this
split — a \`public\` response goes in the gateway cache, a \`private\` one does not —
Drupal just has more machinery on both sides of the line.

### Anonymous: the goal is that PHP never runs

Internal Page Cache is a safety net, not a strategy; it still boots Drupal.
The plan is Varnish or a CDN serving the HTML with no origin request at all.
That requires two things to hold on every anonymous response:

1. \`system.performance:cache.page.max_age\` is above 0, so
   \`FinishResponseSubscriber\` emits \`Cache-Control: public, max-age=N\`.
2. **No session cookie.** \`Drupal\\Core\\PageCache\\RequestPolicy\\NoSessionOpen\`
   only returns \`ALLOW\` when \`session_configuration->hasSession($request)\` is
   false — that is, when the request carries no \`SESS…\` / \`SSESS…\` cookie. One
   stray cookie and the internal page cache is skipped, the response comes back
   \`must-revalidate, no-cache, private\`, and your edge stores nothing.

So the anonymous workload is really a **cookie-hygiene** problem.

### What starts a session by accident

- \`\\Drupal::messenger()->addMessage()\`. It writes to the session flash bag *and*
  calls \`$this->killSwitch->trigger()\` on the \`page_cache_kill_switch\` service,
  which makes that response uncacheable outright.
- \`tempstore.private\`. \`PrivateTempStore\` needs an owner, so for an anonymous
  visitor it forces a session into existence.
- Anything writing to \`$request->getSession()\` — "recently viewed", visitor
  counters, A/B assignment, a chatty contrib module.

The relief valve: \`SessionManager::save()\` checks \`isSessionObsolete()\`, and if
an anonymous session ends up holding no real data it destroys the session and
expires the cookie. A one-off message costs you one page. A module that writes on
every request costs you your entire edge hit rate.

### Authenticated: PHP always runs, so make it cheap

Nothing shared may store a logged-in response, so the levers move inside Drupal:
Dynamic Page Cache to reuse the page shell, placeholders and BigPipe to defer the
personal fragments, and **coarse contexts** — \`user.permissions\` or
\`user.roles\` rather than \`user\` — so ten thousand readers with the same role
share one cache entry instead of owning ten thousand.

### Personalising without collapsing the split

You rarely need per-visitor HTML. Two escapes keep the anonymous page shareable:

- **Client-side.** Serve the same HTML to everyone and fetch the personal bit
  (name, unread count, saved articles) from a tiny \`private, max-age=0\` JSON
  endpoint after load.
- **Lazy-build it.** A \`#lazy_builder\` placeholder keeps the shell cacheable for
  authenticated users — but remember the internal page cache stores the *finished*
  HTML, so for anonymous traffic a genuinely per-visitor fragment must go
  client-side, not into a placeholder.
`,

  comparisons: [
    {
      label: "Measure the split before you tune anything",
      intro:
        "The same first question in both stacks: what share of requests carries a session cookie, and how much is the shared cache actually absorbing?",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Generic PHP/Symfony: how many requests arrive with a session cookie?
# (log_format must include $http_cookie)
gawk '{ total++ } /PHPSESSID=/ { sess++ }
      END { printf "requests=%d with-session=%d (%.1f%%)\\n",
            total, sess, 100*sess/total }' /var/log/nginx/access.log

# What is the gateway absorbing?
varnishstat -1 -f MAIN.cache_hit -f MAIN.cache_miss

# And is any anonymous route handing out a cookie it should not?
curl -sSI https://news.example.com/ | grep -i set-cookie`,
      ts: `# Drupal: same three questions, Drupal's cookie names.
gawk '{ total++ } /S?SESS[0-9a-f]+=/ { sess++ }
      END { printf "requests=%d with-session=%d (%.1f%%)\\n",
            total, sess, 100*sess/total }' /var/log/nginx/access.log

# How many sessions exist, and how many belong to nobody (uid 0)?
drush sql:query "SELECT uid = 0 AS anonymous, COUNT(*) AS n \\
                 FROM sessions GROUP BY uid = 0"
#  anonymous  n
#  0          412      <- real logged-in users
#  1          38911    <- anonymous sessions: something is writing to $_SESSION

# Prove a cold anonymous hit is shareable and cookie-free:
curl -sSI --cookie '' https://news.example.com/ | \\
  grep -iE 'set-cookie|cache-control|x-drupal-cache'`,
      note: "A large anonymous row count in the sessions table is the single most valuable diagnostic on a mostly-anonymous site — every one of those rows is a visitor your CDN can no longer serve.",
    },
    {
      label: "The accidental session write",
      intro:
        "A friendly confirmation message is the classic way to knock an anonymous visitor out of the edge cache for the rest of their visit.",
      php: `// Symfony: addFlash() starts a session and sets a cookie, so this
// response — and every later one while the session lives — is private.
public function subscribe(Request $request): Response
{
    $this->subscriptions->add($request->request->get('email'));
    $this->addFlash('notice', 'Thanks for subscribing.');

    return $this->redirectToRoute('news_index');
}

// Shareable alternative: no session at all, state lives in the URL.
return $this->redirectToRoute('news_subscribe_thanks');`,
      ts: `// Drupal: the same trap, plus an explicit page-cache kill switch.
// Messenger::addMessage() writes to the session flash bag AND calls
// $this->killSwitch->trigger() on the page_cache_kill_switch service.
public function submitForm(array &$form, FormStateInterface $form_state) {
  $this->subscriptions->add($form_state->getValue('email'));
  $this->messenger()->addMessage($this->t('Thanks for subscribing.'));
  $form_state->setRedirect('news.index');
}

// Anonymous-safe: redirect to a cacheable confirmation route instead.
$form_state->setRedirect('news.subscribe_thanks');

// Same rule for temporary state — this forces a session for an anonymous
// visitor. tempstore.shared is no safer: its ensureAnonymousSession() writes
// core.tempstore.shared.owner into the session on every set(). Neither store
// is edge-safe; prefer a signed URL / query parameter, or the key/value store:
$store = \\Drupal::service('tempstore.private')->get('news_alerts');`,
      note: "SessionManager::save() calls isSessionObsolete() and destroys an anonymous session that holds nothing, expiring the cookie — so a one-off message is survivable; a per-request session write is not.",
    },
    {
      label: "Personalising the shell without poisoning it",
      intro:
        "Punch a hole in an otherwise-shareable page: Symfony uses an ESI fragment, Drupal uses a lazy builder that auto-placeholdering lifts out of the cached response.",
      php: `// Symfony: framework: { esi: true }, then in the layout template
//   {{ render_esi(controller('App\\\\Controller\\\\UserController::greeting')) }}
// The shell stays public; the gateway fetches the fragment separately.
public function greeting(): Response
{
    $response = $this->render('user/_greeting.html.twig', [
        'user' => $this->getUser(),
        'unread' => $this->alerts->unreadCount($this->getUser()),
    ]);
    $response->setPrivate();
    $response->setMaxAge(0);

    return $response;
}`,
      ts: `// Drupal: a #lazy_builder. Its high-cardinality context makes the
// renderer replace it with a placeholder, so the shell stays reusable.
public function build(): array {
  return [
    'greeting' => [
      '#lazy_builder' => ['news_alerts.greeting:render', []],
      '#create_placeholder' => TRUE,
    ],
  ];
}

// news_alerts.greeting service (a TrustedCallbackInterface implementation):
public function render(): array {
  return [
    '#markup' => $this->t('Welcome back, @name', [
      '@name' => $this->currentUser->getAccountName(),
    ]),
    '#cache' => ['contexts' => ['user'], 'max-age' => 0],
  ];
}

public static function trustedCallbacks(): array {
  return ['render'];
}`,
      note: "This rescues authenticated pages (Dynamic Page Cache + BigPipe fill the hole per request). It does nothing for anonymous ones: internal page cache and the edge store the finished HTML, placeholders already replaced.",
    },
    {
      label: "One tiny private endpoint for the person",
      intro:
        "The pattern that keeps a 95%-anonymous site fully edge-cacheable: identical HTML for everybody, and one small JSON call that the CDN never touches.",
      php: `// Symfony: the page is public; only this endpoint is per-user.
#[Route('/api/me', name: 'api_me', methods: ['GET'])]
public function me(): JsonResponse
{
    $user = $this->getUser();
    $response = new JsonResponse([
        'name' => $user?->getUserIdentifier(),
        'unread' => $user ? $this->alerts->unreadCount($user) : 0,
    ]);
    $response->setPrivate();
    $response->setMaxAge(0);
    $response->headers->set('Vary', 'Cookie');

    return $response;
}`,
      ts: `# news_alerts.routing.yml
news_alerts.me:
  path: '/api/me'
  defaults:
    _controller: '\\Drupal\\news_alerts\\Controller\\MeController::me'
  requirements:
    _access: 'TRUE'
  options:
    no_cache: TRUE   # DenyNoCacheRoutes keeps it out of the page caches

# MeController::me()
#   $response = new CacheableJsonResponse([
#     'name' => $this->currentUser->getAccountName(),
#     'unread' => $this->alerts->unreadCount($this->currentUser),
#   ]);
#   $response->addCacheableDependency(
#     (new CacheableMetadata())->setCacheContexts(['user'])->setCacheMaxAge(0)
#   );
#   $response->setPrivate();
#   $response->setMaxAge(0);
#   return $response;
#
# The front-end JS then fills the placeholder after load, and the HTML page
# stays byte-identical for every visitor — so the CDN serves 100% of it.`,
      rightLang: "yaml",
      note: "Keep the endpoint small and boring: no rendered markup, no entity lists, no unbounded queries. It runs once per visitor per page and is the only thing the CDN cannot help you with.",
    },
  ],

  playground: {
    intro:
      "One hour of traffic on the news site, four scenarios. The point is not the exact millisecond costs — it is which lever moves the total, and how completely that changes when the audience is logged in.",
    lang: "php",
    code: `<?php
// Sizing the split before tuning anything: where does the work actually land?

function hour(string $label, int $requests, float $anon_share, float $edge_hit_rate, float $stray_cookie_share, int $cost_auth_ms): void {
  $anon = (int) round($requests * $anon_share);
  $auth = $requests - $anon;

  // An anonymous request carrying a leftover SESS cookie is never served by a
  // shared cache: page_cache refuses it and Cache-Control drops to private.
  $poisoned = (int) round($anon * $stray_cookie_share);
  $shareable = $anon - $poisoned;
  $edge_hits = (int) round($shareable * $edge_hit_rate);

  $php_requests = $requests - $edge_hits;
  $anon_to_php = $php_requests - $auth;

  // Rough per-request PHP cost, in milliseconds.
  $cost_anon_ms = 120;   // full render, then stored by page_cache and the edge
  $php_seconds = ($anon_to_php * $cost_anon_ms + $auth * $cost_auth_ms) / 1000;

  echo $label . "\\n";
  printf("  anonymous %d / authenticated %d\\n", $anon, $auth);
  printf("  anonymous requests carrying a session cookie: %d\\n", $poisoned);
  printf("  served by the edge: %d (%.1f%% of all traffic)\\n", $edge_hits, 100 * $edge_hits / $requests);
  printf("  reaching PHP: %d (%d anon + %d auth)\\n", $php_requests, $anon_to_php, $auth);
  printf("  PHP seconds burned: %.0f -> %.1f busy workers\\n", $php_seconds, $php_seconds / 3600);
  echo "\\n";
}

$hourly = 1000000;

hour('A. news site as found: 95% anon, 90% edge hits, 8% stray cookies', $hourly, 0.95, 0.90, 0.08, 260);
hour('B. A, but the accidental session write is removed', $hourly, 0.95, 0.90, 0.00, 260);
hour('C. A, but a sprint of PHP+DB tuning halves the authenticated cost', $hourly, 0.95, 0.90, 0.08, 130);
hour('D. members-only app: 20% anon, nothing to leak, edge cannot help', $hourly, 0.20, 0.90, 0.00, 260);

echo "One cookie fix (B) beat a whole sprint of PHP tuning (C) on the news site,\\n";
echo "and would have done nothing at all for the members-only app (D).\\n";
`,
    output: `A. news site as found: 95% anon, 90% edge hits, 8% stray cookies
  anonymous 950000 / authenticated 50000
  anonymous requests carrying a session cookie: 76000
  served by the edge: 786600 (78.7% of all traffic)
  reaching PHP: 213400 (163400 anon + 50000 auth)
  PHP seconds burned: 32608 -> 9.1 busy workers

B. A, but the accidental session write is removed
  anonymous 950000 / authenticated 50000
  anonymous requests carrying a session cookie: 0
  served by the edge: 855000 (85.5% of all traffic)
  reaching PHP: 145000 (95000 anon + 50000 auth)
  PHP seconds burned: 24400 -> 6.8 busy workers

C. A, but a sprint of PHP+DB tuning halves the authenticated cost
  anonymous 950000 / authenticated 50000
  anonymous requests carrying a session cookie: 76000
  served by the edge: 786600 (78.7% of all traffic)
  reaching PHP: 213400 (163400 anon + 50000 auth)
  PHP seconds burned: 26108 -> 7.3 busy workers

D. members-only app: 20% anon, nothing to leak, edge cannot help
  anonymous 200000 / authenticated 800000
  anonymous requests carrying a session cookie: 0
  served by the edge: 180000 (18.0% of all traffic)
  reaching PHP: 820000 (20000 anon + 800000 auth)
  PHP seconds burned: 210400 -> 58.4 busy workers

One cookie fix (B) beat a whole sprint of PHP tuning (C) on the news site,
and would have done nothing at all for the members-only app (D).
`,
  },

  keyPoints: [
    "Measure the anonymous/authenticated split first: a 95%-anonymous news site is an edge-caching and cookie-hygiene problem, a members-only app is a PHP and database problem, and the same optimisation helps only one of them.",
    "Anonymous cacheability needs two things at once: system.performance:cache.page.max_age above 0, and no session cookie — NoSessionOpen only returns ALLOW when session_configuration->hasSession($request) is false.",
    "Messenger::addMessage() both writes the session flash bag and triggers page_cache_kill_switch; tempstore.private forces a session for anonymous visitors; any write to $request->getSession() sets a SESS/SSESS cookie.",
    "SessionManager::save() destroys an anonymous session that isSessionObsolete() finds empty and expires its cookie, so a single message is survivable — a per-request session write permanently costs you the edge.",
    "Authenticated traffic always reaches PHP, so the levers are Dynamic Page Cache, #lazy_builder placeholders with BigPipe, and coarse contexts (user.permissions / user.roles instead of user) so a role shares one cache entry.",
    "Per-visitor content on an anonymous page belongs client-side, behind a small private, max-age=0 JSON endpoint — a placeholder does not help there, because page_cache and the CDN store the finished HTML.",
  ],

  interview: [
    {
      q: "A news site reports poor CDN hit rates even though 95% of its traffic is anonymous. Where do you look first?",
      a: "Cookies, before anything else. Drupal's internal page cache and every shared cache in front of it refuse a request that carries a session cookie: `NoSessionOpen` only returns `ALLOW` when `session_configuration->hasSession($request)` is false, so once a session cookie is present it never returns ALLOW, `PageCache::handle()` passes straight through to the kernel, and `FinishResponseSubscriber` emits `Cache-Control: must-revalidate, no-cache, private` with `Vary` stripped — not merely private, but uncacheable even by the browser. So I would `curl -sSI --cookie ''` a cold anonymous URL and check for a `Set-Cookie`, then count anonymous rows in the `sessions` table — a large number with `uid = 0` means something is writing to `$_SESSION` for visitors who never logged in. The usual culprits are `Messenger::addMessage()`, `tempstore.private`, and contrib modules doing visitor tracking or A/B assignment. Only after that would I look at `system.performance:cache.page.max_age`, which ships as 0 and silently disables the whole edge.",
    },
    {
      q: "How do you show a logged-in user's name on a page that anonymous visitors also see, without ruining anonymous caching?",
      a: "Not in the HTML. For anonymous traffic the internal page cache and the CDN store the *finished* markup, so a `#lazy_builder` placeholder does not save you — the placeholder is already replaced by the time the response is stored. The pattern that works is to serve byte-identical HTML to everyone and fetch the personal fragment client-side from a small endpoint that returns `Cache-Control: private, max-age=0`, declaring the route with `options: { no_cache: TRUE }` so it stays out of Drupal's page caches too. The lazy builder is still the right tool for the authenticated half, where Dynamic Page Cache reuses the shell and BigPipe streams the hole in; it just does not buy anything for anonymous visitors.",
    },
    {
      q: "Explain the difference between the internal page cache and Dynamic Page Cache in terms of who each one serves.",
      a: "Internal Page Cache (the `page_cache` module) serves anonymous requests only, and serves them very early in the middleware stack — a full stored response, no routing, no rendering. Dynamic Page Cache serves everyone, including logged-in users, but it stores the page with the personalised fragments left as placeholder tokens and keys the entry on the response's cache contexts. That means Dynamic Page Cache's unit of reuse is a *permission set*, not a person, which is why using `user.permissions` instead of `user` is such a large win: every editor with the same role shares one cached shell. On a mostly-anonymous site, page_cache is a safety net that still boots Drupal, and the real target is Varnish or a CDN serving the HTML with no origin hit at all.",
    },
    {
      q: "How does this split compare with the same problem in Symfony?",
      a: "The reasoning is identical, and the vocabulary is literally the same HTTP: a `public` response can live in the gateway cache, a `private` one cannot, and starting a session sets a cookie that makes everything private. In Symfony you carve out personalisation with ESI or hinclude fragments and mark them `setPrivate()`; in Drupal you use `#lazy_builder` placeholders that auto-placeholdering lifts out, with BigPipe streaming them in. The difference is bookkeeping: Symfony makes you decide cacheability per response, while Drupal accumulates tags, contexts and max-age up the render tree and derives the header for you — which is more forgiving until one badly-declared block poisons the whole page.",
    },
  ],

  quiz: [
    {
      question:
        "An anonymous visitor triggers `\\Drupal::messenger()->addMessage()` on a subscribe form. What are the consequences for caching?",
      options: [
        "None — messages are stored in a request-scoped bag and never touch the session",
        "That response is made uncacheable via page_cache_kill_switch, and the visitor now carries a session cookie, so later requests skip the page cache and the edge",
        "Only the current response is affected; Drupal strips the session cookie immediately after rendering the message",
        "The message is stored against the anonymous user's cache context, so subsequent pages remain fully public",
      ],
      answerIndex: 1,
      explain:
        "Messenger::addMessage() writes to the session flash bag and calls $this->killSwitch->trigger() on the page_cache_kill_switch service. Writing to the session means a SESS/SSESS cookie goes out, and NoSessionOpen then refuses to allow the internal page cache for every subsequent request. Once the flash bag is consumed and the session holds nothing, SessionManager::save() finds it obsolete, destroys it and expires the cookie — but until then that visitor is off the edge.",
    },
    {
      question:
        "Your site is 90% authenticated. Which change is most likely to move the needle?",
      options: [
        "Raising system.performance:cache.page.max_age from 0 to one hour",
        "Adding a CDN in front of the origin",
        "Replacing the `user` cache context with `user.permissions` on the heaviest blocks so Dynamic Page Cache entries are shared per role",
        "Setting `$settings['omit_vary_cookie'] = TRUE;`",
      ],
      answerIndex: 2,
      explain:
        "Nothing shared may store a logged-in response, so page max-age, a CDN and Vary tuning are all aimed at a population you barely have. The wins for authenticated traffic live inside PHP: Dynamic Page Cache reuse (coarse contexts so one entry serves a whole role), placeholders and BigPipe for the personal fragments, and then database and query work.",
    },
    {
      question:
        "Why does a `#lazy_builder` placeholder not rescue anonymous edge caching for a genuinely per-visitor widget?",
      options: [
        "Because auto-placeholdering is disabled for anonymous users",
        "Because BigPipe requires an authenticated session to stream",
        "Because the internal page cache and the CDN store the finished HTML, with placeholders already replaced — so the stored response contains one visitor's version",
        "Because lazy builders are not allowed to declare cache contexts",
      ],
      answerIndex: 2,
      explain:
        "Placeholders are a Dynamic Page Cache and BigPipe mechanism: the *dynamic* cache stores the page with tokens still in it. By the time page_cache or a CDN stores a response, the tokens are gone. Anything that really differs per anonymous visitor therefore has to be fetched client-side from a private endpoint, not deferred inside the page.",
    },
    {
      question:
        "Which check most directly tells you whether Drupal's internal page cache will even be consulted for a given request?",
      options: [
        "Whether the response carries a Vary: Cookie header",
        "Whether the request carries a SESS/SSESS session cookie, which is what SessionConfiguration::hasSession() looks for",
        "Whether the route defines a _format requirement",
        "Whether the render array declares a node cache tag",
      ],
      answerIndex: 1,
      explain:
        "The page_cache request policy chain includes NoSessionOpen, which returns ALLOW only when $this->sessionConfiguration->hasSession($request) is false — and that method is just $request->cookies->has($this->getName($request)), the SESS (HTTP) or SSESS (HTTPS) prefixed cookie. No ALLOW means the chain does not permit the internal page cache, so Drupal boots and renders instead.",
    },
  ],
};

export default lesson;

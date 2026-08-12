import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "urls-links-render",
  title: "URLs, Links & Redirects in Output",
  part: "Render Arrays & the Render Pipeline",
  estMinutes: 12,
  summary:
    "Why Drupal makes you build every URL through Url and Link objects: they carry route validation, access checks and cache metadata that a hand-concatenated href silently throws away.",

  concept: `
You already generate URLs in Symfony with \`UrlGeneratorInterface\` and the
\`path()\` / \`url()\` Twig functions. Drupal has the same two functions with the
same names — but underneath, a Drupal URL is a **first-class object** that
carries three things a Symfony route string does not: the route it came from,
whether the current user may follow it, and the cache metadata generating it
required.

## Url: three constructors, one object

\`\`\`
Url::fromRoute('incident_tracker.list', [], [
  'query'      => ['status' => 'open'],
  'fragment'   => 'results',
  'attributes' => ['class' => ['button', 'button--primary']],
  'absolute'   => TRUE,
]);
Url::fromUri('entity:node/1');          // also internal:/foo, base:robots.txt,
                                        // route:<front>, mailto:, https://…
Url::fromUserInput('/admin/reports');   // leading slash required, already-internal
\`\`\`

\`Url::fromRoute()\` is the one you want 90% of the time — it records the route
name and parameters and resolves them **lazily**. Nothing is checked when you
build the object; when the URL is generated a missing route throws
\`RouteNotFoundException\` and a missing parameter throws
\`MissingMandatoryParametersException\`, instead of silently producing a broken
href. \`fromUri()\` is for values that arrive as strings (a link field, config, a
CSV import). \`fromUserInput()\` is for paths you already know are internal.

For a raw user-supplied string, \`UrlHelper::isValid()\` is *not* the guard — it
only checks URL syntax, and returns TRUE for \`https://evil.example.com\` just as
happily as for your own domain. The real open-redirect guards are
\`UrlHelper::isExternal()\` (plus \`UrlHelper::externalIsLocal(\$url, \$base_url)\`
when you must allow same-site absolute URLs), or \`Url::fromUserInput()\`, which
throws unless the string starts with \`/\`, \`?\` or \`#\`.

For entities, skip all three: \`\$node->toUrl('canonical')\`,
\`\$node->toUrl('edit-form')\`, \`\$node->toUrl('delete-form')\` read the entity's
\`links\` annotation, so they keep working when a module changes the path.

## Link vs '#type' => 'link'

\`Link\` is title + Url. \`Link::fromTextAndUrl(\$title, \$url)\` or
\`Link::createFromRoute(\$title, \$route, \$params, \$options)\`, and
\`->toRenderable()\` gives you the render-array form. Inside a render array,
prefer the element directly:

\`\`\`
'#type'       => 'link',
'#title'      => \$this->t('Open incidents'),
'#url'        => Url::fromRoute('incident_tracker.list'),
'#options'    => ['query' => ['status' => 'open']],
'#attributes' => ['class' => ['button']],
\`\`\`

\`#attributes\` is merged into \`#options['attributes']\` for you. Keeping the link
as an array (not a string) means a preprocess function or a theme can still
change it before it becomes HTML.

## Access and cacheability are the whole point

\`\$url->access(\$account)\` runs the route's access checks. The \`link\` element does
**not** do this for you, so gate it yourself — and gate it with an
\`AccessResultInterface\`, not a bool, so its cache metadata bubbles:

\`\`\`
\$build['edit']['#access'] = \$node->access('update', NULL, TRUE);
\`\`\`

Generating a URL also produces metadata. \`(string) \$url\` throws it away;
\`\$url->toString(TRUE)\` returns a \`GeneratedUrl\` (a \`BubbleableMetadata\`) you
must merge into your build. \`Url::toRenderArray()\` and the \`link\` element do
that merging automatically. Anything that reads the current request's path or
query needs the matching context — \`url.path\`, \`url.query_args\`,
\`url.query_args:status\` — or your "filtered" list gets served from cache to the
next visitor with different filters.

## Redirects

From a controller return a \`RedirectResponse\`; from a form use
\`\$form_state->setRedirect('incident_tracker.list', [], ['query' => [...]])\` or
\`setRedirectUrl(\$url)\`. Both accept a \`Url\`, so the same object works
everywhere. Drupal 10/11 both honour a \`?destination=\` query parameter on form
submits, which silently overrides your redirect — that is a feature, not a bug,
and it is why admin "Edit" links return you to the listing.
`,

  comparisons: [
    {
      label: "Generating a URL in PHP",
      intro:
        "Both frameworks refuse to let you concatenate strings. Drupal's version returns an object rather than a string, and that object is what carries access and cache information.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: the generator hands back a string, and that is all it is.
use Symfony\\Component\\Routing\\Generator\\UrlGeneratorInterface;

final class IncidentController extends AbstractController
{
    public function list(UrlGeneratorInterface $urls): Response
    {
        $relative = $urls->generate('app_incident_list', ['status' => 'open']);
        // /incidents?status=open

        $absolute = $urls->generate(
            'app_incident_show',
            ['id' => 42],
            UrlGeneratorInterface::ABSOLUTE_URL,
        );
        // https://example.com/incidents/42

        return $this->redirectToRoute('app_incident_list', ['status' => 'open']);
    }
}`,
      ts: `use Drupal\\Core\\Url;

// A Url is an object: route name + params + options, resolved lazily.
$list = Url::fromRoute('incident_tracker.list', [], [
  'query'    => ['status' => 'open'],
  'fragment' => 'results',
]);

$permalink = Url::fromRoute('incident_tracker.canonical', ['incident' => 42], [
  'absolute' => TRUE,
]);

// Non-route URLs still get an object.
$node   = Url::fromUri('entity:node/1');
$manual = Url::fromUserInput('/admin/reports/dblog');
$ext    = Url::fromUri('https://drupal.org');

// Entities know their own routes — always prefer this.
$edit = $incident_node->toUrl('edit-form');

// Casting to string DISCARDS the cache metadata generation produced.
$href = $list->toString();          // string, metadata lost
$gen  = $list->toString(TRUE);      // GeneratedUrl: ->getGeneratedUrl() + cacheability
$build = $list->toRenderArray();    // safest: metadata already attached`,
      note: "Rule of thumb: a bare (string) cast on a Url inside a render context is a cache bug waiting to happen. Use toRenderArray(), the link element, or toString(TRUE) and merge.",
    },
    {
      label: "Links in Twig",
      intro:
        "Drupal borrows Symfony's path() and url() function names, then adds a link() function and lets a Link object render itself.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# Symfony: path() is relative, url() is absolute. #}
<a href="{{ path('app_incident_show', {id: incident.id}) }}">
  {{ incident.title }}
</a>

<a href="{{ url('app_incident_show', {id: incident.id}) }}">Permalink</a>

{# Attributes and access are hand-written. #}
{% if is_granted('EDIT', incident) %}
  <a href="{{ path('app_incident_edit', {id: incident.id}) }}"
     class="button">Edit</a>
{% endif %}`,
      ts: `{# incident_theme/templates/node--incident.html.twig #}
{# Same names. Third argument is an OPTIONS array, not a reference type. #}
<a href="{{ path('entity.node.canonical', {node: node.id}) }}">{{ label }}</a>

<a href="{{ url('entity.node.canonical', {node: node.id}) }}">Permalink</a>

{{ path('incident_tracker.list', {}, {'query': {'status': 'open'}}) }}

{# link() is a FUNCTION in Drupal (title, url, attributes) — there is no
   |link filter. It escapes the title and builds the <a> for you. #}
{{ link(label, url, {'class': ['incident-link']}) }}

{# A Link object implements RenderableInterface, so it renders itself. #}
{{ node.toLink }}

{# Preferred: pass the link down as a render array and just print it. #}
{{ content.links }}`,
      note: "Drupal's path()/url() take (route, parameters, options) — options is the same array Url::fromRoute() takes, so 'query', 'fragment' and 'attributes' all work from Twig.",
    },
    {
      label: "An access-aware, cacheable link",
      intro:
        "This is where the two models genuinely diverge: in Symfony access is a template concern, in Drupal it is data attached to the render array.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: build the data, check access wherever you render it.
$links = [];
if ($this->isGranted('EDIT', $incident)) {
    $links['edit'] = [
        'label' => 'Edit',
        'href'  => $this->generateUrl('app_incident_edit', ['id' => $incident->getId()]),
    ];
}

// Caching is a separate concern entirely — HttpCache headers on the Response,
// or a Twig {% cache %} block with keys you invent yourself.
$response = $this->render('incident/show.html.twig', ['links' => $links]);
$response->setPublic()->setMaxAge(600);

return $response;`,
      ts: `use Drupal\\Core\\Url;
use Drupal\\Core\\Link;

$url = Url::fromRoute('incident_tracker.edit', ['incident' => $incident->id()]);

$build['actions']['edit'] = [
  '#type'       => 'link',
  '#title'      => $this->t('Edit incident'),
  '#url'        => $url,
  '#options'    => ['query' => ['destination' => $current_path]],
  '#attributes' => ['class' => ['button', 'button--small']],
  // Pass the AccessResult OBJECT, not ->isAllowed(): the renderer bubbles its
  // cache contexts/tags, so the page correctly varies by permission.
  '#access'     => $incident->access('update', NULL, TRUE),
];

// Same link via the Link value object (handy in services/plugins).
$build['view'] = Link::createFromRoute(
  $this->t('All open incidents'),
  'incident_tracker.list',
  [],
  ['query' => ['status' => 'open']],
)->toRenderable();

// This build reads ?status= from the request, so declare it.
$build['#cache']['contexts'][] = 'url.query_args:status';`,
      note: "'#access' => TRUE/FALSE works but leaks cacheability. '#access' => $entity->access('update', NULL, TRUE) is the version that keeps the page cache correct.",
    },
    {
      label: "Redirecting after a form submit",
      intro:
        "Symfony returns a RedirectResponse from the controller. A Drupal form has no Response to return, so it records the redirect on the form state.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony form handling lives inside the controller action.
public function edit(Request $request, Incident $incident): Response
{
    $form = $this->createForm(IncidentType::class, $incident);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $this->em->flush();
        $this->addFlash('success', 'Incident saved.');

        return $this->redirectToRoute('app_incident_list', ['status' => 'open']);
    }

    return $this->render('incident/edit.html.twig', ['form' => $form]);
}`,
      ts: `// Drupal: submitForm() returns void; you set the redirect on $form_state.
public function submitForm(array &$form, FormStateInterface $form_state): void {
  $this->messenger()->addStatus($this->t('Incident saved.'));

  $form_state->setRedirect('incident_tracker.list', [], [
    'query' => ['status' => 'open'],
  ]);

  // Equivalent, when you already hold a Url object:
  // $form_state->setRedirectUrl(Url::fromRoute('incident_tracker.list'));
  // External targets need the explicit escape hatch:
  // $form_state->setResponse(new TrustedRedirectResponse('https://status.example.com'));
}

// Gotcha: if the request carried ?destination=/admin/content, Drupal's
// RedirectResponseSubscriber OVERRIDES whatever you set above. That is how
// admin "Edit" links return you to the listing you came from.`,
      note: "A plain RedirectResponse to an external host is rejected by Drupal's redirect handling — use TrustedRedirectResponse, which marks that one URL as trusted. It adds no cache context of its own; it is a CacheableResponseInterface, so attach cacheability yourself with ->addCacheableDependency(). Any build that READS the destination (redirect.destination / RedirectDestinationTrait) must declare 'url.query_args:destination' itself.",
    },
  ],

  playground: {
    intro:
      "A miniature Url + Link + '#type' => 'link' pipeline in pure PHP. Watch three things a hand-built href cannot do: fail loudly on a missing route parameter, drop an element the user may not access, and bubble cache contexts up to the page. Predict the output before you run it.",
    lang: "php",
    code: `<?php
// A tiny stand-in for Url + Link + '#type' => 'link', minus Drupal.

$routes = [
  'incident_tracker.list' => ['path' => '/incidents', 'perm' => 'view incidents'],
  'incident_tracker.canonical' => ['path' => '/incidents/{incident}', 'perm' => 'view incidents'],
  'incident_tracker.edit' => ['path' => '/incidents/{incident}/edit', 'perm' => 'edit incidents'],
];

// The "current user": permissions they hold.
$account = ['view incidents'];

/** Url::fromRoute() — resolves the path AND collects bubbleable metadata. */
function url_from_route(array $routes, string $name, array $params = [], array $options = []): array {
  if (!isset($routes[$name])) {
    throw new InvalidArgumentException(sprintf('Route "%s" does not exist.', $name));
  }
  $path = $routes[$name]['path'];
  foreach ($params as $key => $value) {
    $path = str_replace('{' . $key . '}', rawurlencode((string) $value), $path);
  }
  if (preg_match('/\\{(\\w+)\\}/', $path, $m)) {
    throw new InvalidArgumentException(sprintf('Missing route parameter "%s".', $m[1]));
  }
  $contexts = [];
  if (!empty($options['query'])) {
    ksort($options['query']);
    $path .= '?' . http_build_query($options['query']);
    foreach (array_keys($options['query']) as $key) {
      $contexts[] = 'url.query_args:' . $key;
    }
  }
  if (!empty($options['fragment'])) {
    $path .= '#' . $options['fragment'];
  }
  if (!empty($options['absolute'])) {
    $path = 'https://example.com' . $path;
    $contexts[] = 'url.site';
  }
  return [
    'href' => $path,
    'attributes' => $options['attributes'] ?? [],
    'perm' => $routes[$name]['perm'],
    'contexts' => $contexts,
  ];
}

/** Url::access() — routed URLs know who may follow them. */
function url_access(array $url, array $account): bool {
  return in_array($url['perm'], $account, TRUE);
}

/** The '#type' => 'link' element: title + url + attributes -> <a>. */
function render_link(string $title, array $url): string {
  $out = '';
  foreach ($url['attributes'] as $name => $value) {
    $value = is_array($value) ? implode(' ', $value) : $value;
    $out .= sprintf(' %s="%s"', $name, htmlspecialchars($value, ENT_QUOTES));
  }
  return sprintf('<a href="%s"%s>%s</a>', htmlspecialchars($url['href'], ENT_QUOTES), $out, $title);
}

$build = [
  ['Open incidents', 'incident_tracker.list', [], [
    'query' => ['type' => 'outage', 'status' => 'open'],
    'attributes' => ['class' => ['button', 'button--primary']],
  ]],
  ['Incident 42', 'incident_tracker.canonical', ['incident' => 42], ['fragment' => 'timeline']],
  ['Edit incident 42', 'incident_tracker.edit', ['incident' => 42], []],
  ['Permalink', 'incident_tracker.canonical', ['incident' => 42], ['absolute' => TRUE]],
];

$bubbled = [];
foreach ($build as [$title, $name, $params, $options]) {
  $url = url_from_route($routes, $name, $params, $options);
  $bubbled = array_merge($bubbled, $url['contexts']);
  if (!url_access($url, $account)) {
    echo "-- access denied, element dropped: $title\\n";
    continue;
  }
  echo render_link($title, $url) . "\\n";
}

sort($bubbled);
echo "\\n#cache contexts bubbled to the page:\\n";
print_r(array_values(array_unique($bubbled)));

try {
  url_from_route($routes, 'incident_tracker.edit', []);
}
catch (InvalidArgumentException $e) {
  echo "\\nHand-built strings never do this: " . $e->getMessage() . "\\n";
}
`,
    output: `<a href="/incidents?status=open&amp;type=outage" class="button button--primary">Open incidents</a>
<a href="/incidents/42#timeline">Incident 42</a>
-- access denied, element dropped: Edit incident 42
<a href="https://example.com/incidents/42">Permalink</a>

#cache contexts bubbled to the page:
Array
(
    [0] => url.query_args:status
    [1] => url.query_args:type
    [2] => url.site
)

Hand-built strings never do this: Missing route parameter "incident".
`,
  },

  keyPoints: [
    "Url::fromRoute() records the route and its parameters and resolves them lazily — they are validated when the URL is GENERATED (RouteNotFoundException / MissingMandatoryParametersException), not when the object is built; fromUri() ('entity:node/1', 'internal:/foo', 'base:', 'route:<front>') and fromUserInput('/path') cover strings and known-internal paths.",
    "For entities use $entity->toUrl('canonical'|'edit-form'|'delete-form') and $entity->toLink() — they follow the entity's link templates, so path changes don't break you.",
    "Link is a value object (fromTextAndUrl / createFromRoute) with ->toRenderable(); inside a build, '#type' => 'link' with #title/#url/#options/#attributes is the idiomatic form.",
    "The link element does NOT check access. Gate it with '#access' => $entity->access('op', NULL, TRUE) so the AccessResult's cacheability bubbles instead of being flattened to a bool.",
    "(string) $url discards bubbleable metadata; use toString(TRUE) (a GeneratedUrl) or toRenderArray(). Reading the request path/query needs url.path or url.query_args[:key] contexts.",
    "In Twig, path()/url() take (route, parameters, options) and link(title, url, attributes) is a function, not a filter; a Link object prints itself because it implements RenderableInterface.",
  ],

  interview: [
    {
      q: "You review a patch containing `'#markup' => '<a href=\"/incidents/' . $id . '\">View</a>'`. What do you flag, and what do you replace it with?",
      a: "Four separate problems. The path is hard-coded, so it breaks the moment the route or a path alias changes; there is no access check, so a user without `view incidents` sees a link they will get a 403 from; there is no cacheability, so nothing invalidates the fragment; and `#markup` runs through `Xss::filterAdmin()`, so the escaping story is muddy. The replacement is `'#type' => 'link'` with `'#url' => Url::fromRoute('incident_tracker.canonical', ['incident' => \\$id])`, plus `'#access' => \\$incident->access('view', NULL, TRUE)`. That gives you a routed URL that fails loudly at generation time if the route or a parameter goes missing, an access-gated element whose cache metadata bubbles, and a link a preprocess hook or theme can still modify before it becomes HTML.",
    },
    {
      q: "Explain how a Drupal Url differs from the string Symfony's UrlGeneratorInterface returns.",
      a: "Symfony's generator resolves a route to a string and the story ends there — access is checked separately with the security voter system, and caching is HTTP-level. A Drupal `Url` stays an object holding the route name, parameters and options, and it can answer questions about itself: `\\$url->access(\\$account)` runs the route's access checks, `\\$url->isRouted()`, `\\$url->getRouteName()`. Crucially, generation is a *cacheable* operation — outbound path processors (language negotiation, path aliases) add cache contexts and tags. `\\$url->toString(TRUE)` returns a `GeneratedUrl` carrying that metadata; a plain `(string)` cast silently drops it. That is why you pass Url objects into render arrays rather than resolving them early.",
    },
    {
      q: "A listing page at /incidents supports ?status=open. Editors report seeing the wrong filtered results. What's the likely cause and the fix?",
      a: "The render array reads `\\$request->query->get('status')` but never declares that it varies on it, so the internal page cache (or dynamic page cache) serves the first-rendered variant to everyone. The fix is `\\$build['#cache']['contexts'][] = 'url.query_args:status'` — the narrow context, not the blunt `url.query_args`, which would fragment the cache across every unrelated parameter including tracking ones. If you also paginate, core's pager adds `url.query_args.pagers:0` for you. And note the reverse trap: adding the query parameter to a `Url` you *generate* costs nothing; it is only *reading* the incoming request that requires the context.",
    },
    {
      q: "What is `?destination=` and why does it matter when you write a form?",
      a: "It is a query parameter Drupal core honours globally: `RedirectResponseSubscriber` inspects it on the outgoing redirect and rewrites the target to that internal path. So a form that calls `\\$form_state->setRedirect('incident_tracker.list')` will still land the user back on `/admin/content` if they arrived via a link carrying `?destination=/admin/content`. This is how admin operation links feel coherent, and you should generate your own edit links with that query parameter rather than fighting it. The subscriber only accepts internal destinations, so it is not an open-redirect vector — and for deliberate external redirects you must use `TrustedRedirectResponse`, which marks that specific URL as trusted. It adds no cache context of its own, though: anything that *reads* the destination (the `redirect.destination` service, `RedirectDestinationTrait`, or core's own `ConfirmFormHelper`) has to declare `url.query_args:destination` itself.",
    },
  ],

  quiz: [
    {
      question:
        "Which produces a link element whose access check contributes cache metadata to the page?",
      options: [
        "'#type' => 'link', '#access' => $node->access('update')",
        "'#type' => 'link', '#access' => $node->access('update', NULL, TRUE)",
        "'#markup' => $node->toLink('Edit', 'edit-form')->toString()",
        "'#type' => 'link' alone — the element checks $url->access() itself",
      ],
      answerIndex: 1,
      explain:
        "Passing TRUE as the third argument returns an AccessResultInterface instead of a bool. The renderer reads its cache contexts and tags and bubbles them, so the page correctly varies by permission and invalidates when the entity changes. A bare bool is a snapshot with no metadata, and the link element never calls access() on its own.",
    },
    {
      question:
        "In a Drupal 10/11 Twig template, which is correct for a route with a query string?",
      options: [
        "{{ 'incident_tracker.list'|link({'status': 'open'}) }}",
        "{{ path('incident_tracker.list', {}, {'query': {'status': 'open'}}) }}",
        "{{ path('incident_tracker.list', {'query': 'status=open'}) }}",
        "{{ url_for('incident_tracker.list', {'status': 'open'}) }}",
      ],
      answerIndex: 1,
      explain:
        "Drupal's path() signature is (route_name, parameters, options), and 'options' is the same array Url::fromRoute() accepts — so 'query', 'fragment', 'absolute' and 'attributes' all work. link() exists but is a function taking (title, url, attributes), not a filter, and url_for() is a Symfony-only helper.",
    },
    {
      question:
        "You need the string of a Url inside a controller that also builds a render array. Which call keeps the render pipeline correct?",
      options: [
        "(string) $url",
        "$url->toString()",
        "$url->toString(TRUE), then merge the returned GeneratedUrl into your build",
        "$url->getInternalPath()",
      ],
      answerIndex: 2,
      explain:
        "toString(TRUE) returns a GeneratedUrl, which is a BubbleableMetadata carrying the cache contexts and tags that outbound path processors (path aliases, language negotiation) added during generation. The other forms return a bare string and throw that metadata away, which is exactly the kind of leak that produces stale or cross-language links.",
    },
    {
      question:
        "Which Url constructor should be used for a path that arrives from a stored config value such as 'entity:node/12'?",
      options: [
        "Url::fromRoute('entity:node/12')",
        "Url::fromUserInput('entity:node/12')",
        "Url::fromUri('entity:node/12')",
        "new Url('entity:node/12')",
      ],
      answerIndex: 2,
      explain:
        "fromUri() handles URI schemes — entity:, internal:, base:, route:, mailto:, and external http(s). fromUserInput() requires a leading slash and rejects schemes, fromRoute() expects a machine route name, and the Url constructor is not the public API for string input.",
    },
  ],
};

export default lesson;

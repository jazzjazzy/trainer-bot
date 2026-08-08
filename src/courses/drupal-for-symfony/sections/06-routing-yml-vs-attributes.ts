import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "routing-yml-vs-attributes",
  title: "Routing: my_module.routing.yml vs PHP Attributes",
  part: "Routing, Controllers & Services",
  estMinutes: 11,
  summary:
    "How Drupal declares every route in MODULE.routing.yml — path, defaults._controller, requirements._permission/_access — where Symfony 6.4/7 lets you annotate controllers with #[Route] attributes.",

  concept: `
In Symfony you almost always attach the route to the controller: a
\`#[Route('/hello/{name}', name: 'app_hello')]\` attribute (or the older YAML/XML)
sits right above the action method, and \`bin/console debug:router\` collects them.
Drupal does the **opposite** — routes are *always* declared in a per-module YAML
file, and the controller knows nothing about its own URL.

### One file per module: MODULE.routing.yml

Every module that exposes a page ships a \`my_module.routing.yml\` at its root.
Drupal's routing subsystem is literally Symfony's \`Routing\` component underneath,
so the shape is familiar — but the keys are Drupal's:

\`\`\`yaml
my_module.hello:
  path: '/hello/{name}'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\HelloController::view'
    _title: 'Hello'
  requirements:
    _permission: 'access content'
\`\`\`

- **Route name** (\`my_module.hello\`) is dot-separated and conventionally prefixed
  with the module name — it's the Symfony equivalent of the \`name:\` argument.
- **\`_controller\`** is a fully-qualified \`Class::method\` callable string. No
  attribute, no auto-registration: this string *is* the wiring.
- **\`defaults\`** also carries things like \`_title\` (page title) or \`_form\`
  (route rendered by a Form object) instead of a controller.

### Access lives in the route, not a firewall

Symfony gates actions with \`#[IsGranted]\` / voters and a \`security.yaml\`
firewall. Drupal puts access **in the route's \`requirements\`**:

- \`_permission: 'access content'\` — user must hold that named permission.
- \`_access: 'TRUE'\` — always allow (open pages, or you check access yourself).
- \`_role: 'editor'\` — must have a role (rarely used; prefer permissions).
- \`_entity_access: 'node.update'\` — delegate to the entity's access handler.
- \`_custom_access: '\\Drupal\\my_module\\Controller\\HelloController::access'\` —
  a method returning an \`AccessResult\`.

Multiple requirements are **AND**-ed together, just like stacking Symfony
security attributes.

### Why no #[Route] in Drupal?

Drupal 10.2/11 *did* adopt PHP attributes — but only for **plugins** (blocks,
field types, etc.), replacing annotations. **Routes stayed in YAML.** The router
is rebuilt into a cached table (a cache rebuild via \`drush cr\`, or \`drush ev '\\Drupal::service("router.builder")->rebuild();'\`), and a
static YAML file is cheap to discover and alter. Other modules can even rewrite
your routes via a \`RouteSubscriber\` — an openness that per-method attributes make
awkward. So the mental swap is: *Symfony attribute on the method → Drupal entry in
\`my_module.routing.yml\`.*

Generate URLs with \`Url::fromRoute('my_module.hello', ['name' => 'Ada'])\` — the
counterpart to Symfony's \`UrlGeneratorInterface\`/\`$this->generateUrl()\`.
`,

  comparisons: [
    {
      label: "Declaring a route",
      intro:
        "A GET page at /hello/{name} handled by a controller method, requiring the user to hold a permission. In Symfony the route rides on the method as an attribute; in Drupal it is an entry in the module's routing YAML.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony 6.4/7 — attribute on the controller method
namespace App\\Controller;

use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Security\\Http\\Attribute\\IsGranted;

final class HelloController
{
    #[Route('/hello/{name}', name: 'app_hello', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function view(string $name): Response
    {
        return new Response('Hello ' . $name);
    }
}`,
      ts: `# Drupal 10/11 — my_module.routing.yml (route is NOT on the method)
my_module.hello:
  path: '/hello/{name}'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\HelloController::view'
    _title: 'Hello'
  requirements:
    _permission: 'access content'
  methods: [GET]`,
      note:
        "Drupal's route name is dot.separated; the controller is a plain FQCN::method string. The controller class carries no routing metadata.",
    },
    {
      label: "The controller method itself",
      intro:
        "The action that answers the route. Symfony returns a Response (or an array with a template); Drupal returns a render array — a nested array the theme layer turns into HTML.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — return a Response
public function view(string $name): Response
{
    return new Response('<h1>Hello ' . $name . '</h1>');
}`,
      ts: `<?php
// Drupal — return a render array; {name} is injected by name
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

final class HelloController extends ControllerBase {
  public function view(string $name): array {
    return [
      '#markup' => $this->t('Hello @name', ['@name' => $name]),
    ];
  }
}`,
      note:
        "Path placeholders map to method parameters by name in both frameworks. Drupal hands you a render array to return, not a Response object.",
    },
    {
      label: "Access control",
      intro:
        "Restricting who can reach the page. Symfony uses security attributes/voters plus the firewall; Drupal expresses it inline under the route's requirements.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony — attribute + voter, backed by security.yaml
#[Route('/admin/reports', name: 'app_reports')]
#[IsGranted('view_reports')]
public function reports(): Response { /* ... */ }`,
      ts: `# Drupal — requirements are ANDed together
my_module.reports:
  path: '/admin/reports'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\ReportController::list'
  requirements:
    _permission: 'view reports'
    _role: 'administrator'
  options:
    _admin_route: TRUE`,
      note:
        "Use _permission for named permissions, _access: 'TRUE' to open a route, _custom_access for a method returning AccessResult. Options like _admin_route theme the page with the admin skin.",
    },
    {
      label: "Generating a URL to the route",
      intro:
        "Building a link to a named route with parameters, rather than hardcoding the path — the same discipline in both stacks, different service.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — UrlGeneratorInterface / $this->generateUrl()
$url = $this->generateUrl('app_hello', ['name' => 'Ada']);
// => /hello/Ada`,
      ts: `<?php
// Drupal — Url value object from the route name
use Drupal\\Core\\Url;

$url = Url::fromRoute('my_module.hello', ['name' => 'Ada'])
  ->toString();
// => /hello/Ada`,
      note:
        "Both resolve by route name so paths can change without touching call sites. Drupal's Url object also feeds link render arrays and access checks.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Model of Drupal's router: it parses each routing.yml entry, matches an incoming path, then AND-checks the requirements before dispatching to _controller. Predict the output before revealing.",
    code: `<?php
declare(strict_types=1);

// A stand-in for parsed my_module.routing.yml entries.
$routes = [
  'my_module.hello' => [
    'path' => '/hello/{name}',
    'controller' => 'HelloController::view',
    'requirements' => ['_permission' => 'access content'],
  ],
  'my_module.reports' => [
    'path' => '/admin/reports',
    'controller' => 'ReportController::list',
    'requirements' => ['_permission' => 'view reports', '_role' => 'administrator'],
  ],
];

// The current user, as Drupal's access checks would see them.
$user = ['permissions' => ['access content'], 'roles' => ['authenticated']];

function matchPath(string $pattern, string $path): ?array {
  // Turn /hello/{name} into a regex capturing named params.
  $regex = '#^' . preg_replace('/\\{(\\w+)\\}/', '(?<$1>[^/]+)', $pattern) . '$#';
  if (preg_match($regex, $path, $m)) {
    return array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
  }
  return null;
}

function accessGranted(array $req, array $user): bool {
  if (isset($req['_permission']) && !in_array($req['_permission'], $user['permissions'], true)) {
    return false;
  }
  if (isset($req['_role']) && !in_array($req['_role'], $user['roles'], true)) {
    return false;
  }
  return true; // requirements are ANDed
}

function dispatch(string $path, array $routes, array $user): void {
  foreach ($routes as $name => $route) {
    $params = matchPath($route['path'], $path);
    if ($params === null) continue;
    if (!accessGranted($route['requirements'], $user)) {
      echo $path . ' -> 403 (route ' . $name . ")\\n";
      return;
    }
    $args = implode(', ', $params) ?: '(none)';
    echo $path . ' -> ' . $route['controller'] . ' args=[' . $args . "]\\n";
    return;
  }
  echo $path . " -> 404\\n";
}

dispatch('/hello/Ada', $routes, $user);
dispatch('/admin/reports', $routes, $user);
dispatch('/nope', $routes, $user);`,
    output: `/hello/Ada -> HelloController::view args=[Ada]
/admin/reports -> 403 (route my_module.reports)
/nope -> 404`,
  },

  keyPoints: [
    "Drupal declares every route in `MODULE.routing.yml`; Symfony 6.4/7 typically uses `#[Route]` attributes on controller methods.",
    "`_controller` is a `\\Drupal\\module\\Controller\\Class::method` string — the controller class holds no routing metadata.",
    "Route names are dot-separated and module-prefixed, e.g. `my_module.hello`; use them with `Url::fromRoute()`.",
    "Access is part of the route's `requirements` (`_permission`, `_access`, `_role`, `_entity_access`, `_custom_access`), and multiple requirements are ANDed.",
    "Path placeholders like `{name}` map to same-named controller method parameters, exactly as in Symfony.",
    "PHP attributes arrived in Drupal 10.2/11 for **plugins**, not routes — routing stayed YAML so it can be cached and altered by other modules.",
  ],

  interview: [
    {
      q: "In Symfony you put routes on the controller with #[Route]. How does routing differ in Drupal, and why?",
      a: "Drupal keeps routes in a per-module \`MODULE.routing.yml\` file rather than on the method. Each entry has a dot-separated name, a \`path\`, a \`defaults._controller\` FQCN\`::\`method string, and \`requirements\` for access. It still runs Symfony's Routing component underneath, so the concepts (named routes, placeholders, URL generation) carry over — but the declaration is data, not an attribute. Keeping it in YAML lets Drupal build a cached router table and lets other modules alter routes via a \`RouteSubscriber\`, which per-method attributes would make awkward.",
    },
    {
      q: "Where does access control live for a Drupal route, and how does it compare to Symfony's security attributes?",
      a: "It lives in the route's \`requirements\` key. \`_permission: 'access content'\` requires a named permission, \`_access: 'TRUE'\` opens the route, \`_role\` checks a role, \`_entity_access: 'node.update'\` delegates to the entity access handler, and \`_custom_access\` points to a method returning an \`AccessResult\`. Multiple requirements are ANDed, similar to stacking \`#[IsGranted]\` attributes in Symfony. The big difference is that Drupal has no separate firewall/\`security.yaml\`; the check is declared right on the route, and permissions themselves come from a \`MODULE.permissions.yml\` file.",
    },
    {
      q: "Drupal 10.2/11 added PHP attributes. Does that mean I can now write #[Route] on a Drupal controller?",
      a: "No. Drupal adopted PHP attributes to replace **annotations on plugins** — blocks, field types, field formatters, and similar — not for routing. Routes remain in YAML. So a block plugin might now use \`#[Block(id: 'my_block')]\` instead of a docblock annotation, but the URL that renders a page is still an entry in \`MODULE.routing.yml\`. If an interviewer asks, that distinction — attributes for plugin discovery, YAML for routes — shows you understand where Drupal did and did not converge with Symfony.",
    },
  ],

  quiz: [
    {
      question:
        "Where is a page's URL-to-controller mapping declared in a Drupal 11 module?",
      options: [
        "In a #[Route] attribute above the controller method",
        "In the module's MODULE.routing.yml file",
        "In services.yml under a 'routes' key",
        "Automatically, by matching the controller's class name to a path",
      ],
      answerIndex: 1,
      explain:
        "Drupal declares routes as entries in MODULE.routing.yml. Unlike Symfony 6.4/7, the controller method carries no routing attribute — the YAML entry's defaults._controller string is the wiring.",
    },
    {
      question:
        "A route needs the user to hold the 'edit articles' permission. Which routing.yml key expresses that?",
      options: [
        "defaults._permission: 'edit articles'",
        "options._access: 'edit articles'",
        "requirements._permission: 'edit articles'",
        "security._role: 'edit articles'",
      ],
      answerIndex: 2,
      explain:
        "Access checks go under requirements. _permission names a permission; _access: 'TRUE', _role, _entity_access, and _custom_access are the other options, and multiple requirements are ANDed.",
    },
    {
      question:
        "What did PHP attributes replace when they landed in Drupal 10.2/11?",
      options: [
        "Route definitions, so #[Route] now works like Symfony",
        "Annotations on plugins such as blocks and field types",
        "The services.yml dependency-injection format",
        "The render array system",
      ],
      answerIndex: 1,
      explain:
        "Attributes replaced plugin annotations (e.g. #[Block(...)]), not routing. Routes stayed in YAML so they remain cacheable and alterable by other modules via RouteSubscribers.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "controllers-controllerbase",
  title: "Controllers: ControllerBase vs AbstractController",
  part: "Routing, Controllers & Services",
  estMinutes: 12,
  summary:
    "How a Drupal controller mirrors Symfony's AbstractController — but returns a render array, and wires dependencies through a static create() factory instead of constructor autowiring.",

  concept: `
In Symfony you extend \`AbstractController\` to get shortcut helpers
(\`$this->render()\`, \`$this->json()\`, \`$this->redirectToRoute()\`,
\`$this->getUser()\`). Drupal has the exact same idea: extend
\`Drupal\\Core\\Controller\\ControllerBase\` and you inherit convenience helpers
like \`$this->t()\` (translation), \`$this->currentUser()\`, \`$this->config()\`,
\`$this->entityTypeManager()\`, and \`$this->redirect()\`. Both base classes are
optional sugar — a controller is really just "a callable pointed at by a route."

### The big difference: you return a render array, not HTML

A Symfony action typically ends with \`return $this->render('tpl.html.twig', [...])\`,
which produces a fully rendered \`Response\` (a string of HTML). Drupal controllers
almost never render Twig themselves. Instead they return a **render array**: a
nested associative array describing *what* to render, which Drupal's render
pipeline turns into HTML later, applying theming, caching, and access along the
way.

\`\`\`
return [
  '#markup' => $this->t('Hello'),
  '#cache' => ['contexts' => ['user']],
];
\`\`\`

Think of it as returning a **view-model / data structure** rather than a string.
You *can* still return a \`Symfony\\Component\\HttpFoundation\\Response\` directly
(both frameworks share HttpFoundation) — that is exactly what you do for JSON,
file downloads, or redirects. But for pages, the render array is idiomatic and it
is what lets Drupal cache and theme your output.

### The other big difference: no constructor autowiring

Symfony 6.4/7 autowires services straight into your constructor by type hint —
zero config. Drupal's container does **not** autowire controllers. Instead the
class implements a static factory:

\`\`\`
public static function create(ContainerInterface $container): self {
  return new self($container->get('some.service'));
}
\`\`\`

Drupal calls \`create()\`, you pull services out of the container **by service ID**
(\`entity_type.manager\`, \`current_user\`, …), and hand them to your own
constructor. It is the "manual" version of what Symfony's compiler does for you.
Common services already have inherited getters on \`ControllerBase\`, so you only
write \`create()\` when you need something extra.

### Routing wires the method, not attributes on the class

In Symfony you usually put \`#[Route]\` attributes on the action. In Drupal the
route lives in \`my_module.routing.yml\` and its \`_controller\` key points at
\`Class::method\`. (Symfony-style PHP-attribute routing does not exist for normal
Drupal controllers; attributes in Drupal are used for *plugins*, added in
D10.2/D11, not for routes.) Access is declared on the route too, via
\`_permission\` / \`_role\` / \`_access\` — not with \`#[IsGranted]\` in the method.
`,

  comparisons: [
    {
      label: "The base class & its helpers",
      intro:
        "Both frameworks give you a base controller with convenience methods. The names differ but the intent is identical: translation, current user, redirects, and rendering shortcuts.",
      php: `<?php
// Symfony 6.4 / 7
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;

class HelloController extends AbstractController
{
    #[Route('/hello', name: 'app_hello')]
    public function index(): Response
    {
        // Helpers from AbstractController:
        $user = $this->getUser();

        return $this->render('hello/index.html.twig', [
            'name' => $user?->getUserIdentifier() ?? 'guest',
        ]);
    }
}`,
      ts: `<?php
// Drupal 10 / 11
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

class HelloController extends ControllerBase {

  // Route lives in my_module.routing.yml, not here.
  public function index(): array {
    // Helpers from ControllerBase:
    $name = $this->currentUser()->getAccountName() ?: 'guest';

    // Return a RENDER ARRAY, not a rendered string.
    return [
      '#markup' => $this->t('Hello @name', ['@name' => $name]),
    ];
  }
}`,
      note: "AbstractController::getUser()/render() map to ControllerBase::currentUser()/t(); the Drupal method returns a render array, not a Response.",
    },
    {
      label: "Injecting services",
      intro:
        "You need EntityTypeManager inside the controller. Symfony autowires it into the constructor; Drupal makes you pull it from the container in a static create() factory.",
      php: `<?php
// Symfony: constructor autowiring — no factory, no config.
use Doctrine\\ORM\\EntityManagerInterface;

class NodeController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    public function list(): Response
    {
        $rows = $this->em->getRepository(Article::class)->findAll();
        return $this->json($rows);
    }
}`,
      ts: `<?php
// Drupal: static create() pulls services out by ID, then calls __construct.
use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

class NodeController extends ControllerBase {

  public function __construct(
    protected EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public static function create(ContainerInterface $container): self {
    return new self(
      $container->get('entity_type.manager'),
    );
  }

  public function list(): array {
    $storage = $this->entityTypeManager->getStorage('node');
    $ids = $storage->getQuery()
      ->condition('type', 'article')
      ->accessCheck(TRUE)
      ->execute();
    return ['#markup' => (string) count($ids)];
  }
}`,
      note: "No autowiring in Drupal: create() is the seam where you fetch services by string ID and pass them to your own constructor.",
    },
    {
      label: "Declaring the route",
      intro:
        "Symfony puts routing (and often access) on the method via attributes. Drupal declares both in a YAML file, pointing _controller at Class::method and access at _permission.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: attributes on the action (config/routes optional)
# src/Controller/HelloController.php
#
#   #[Route('/hello', name: 'app_hello', methods: ['GET'])]
#   #[IsGranted('ROLE_USER')]
#   public function index(): Response { ... }
#
# Or the equivalent in config/routes.yaml:
app_hello:
    path: /hello
    controller: App\\Controller\\HelloController::index
    methods: [GET]`,
      ts: `# Drupal: my_module.routing.yml
my_module.hello:
  path: '/hello'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\HelloController::index'
    _title: 'Hello'
  methods: [GET]
  requirements:
    _permission: 'access content'`,
      note: "_controller replaces Symfony's controller/#[Route]; _permission replaces #[IsGranted]. No PHP-attribute routing for ordinary Drupal controllers.",
    },
    {
      label: "Returning JSON or a redirect",
      intro:
        "When you don't want a themed page, both frameworks drop down to shared HttpFoundation Response objects. This is one place the two APIs look almost identical.",
      php: `<?php
// Symfony
public function api(): Response
{
    return $this->json(['ok' => true]);        // JsonResponse
}

public function away(): Response
{
    return $this->redirectToRoute('app_hello'); // RedirectResponse
}`,
      ts: `<?php
// Drupal
use Symfony\\Component\\HttpFoundation\\JsonResponse;

public function api(): JsonResponse {
  return new JsonResponse(['ok' => TRUE]);      // same HttpFoundation class
}

public function away() {
  // ControllerBase::redirect() wraps a RedirectResponse by route name.
  return $this->redirect('my_module.hello');
}`,
      note: "Both sit on symfony/http-foundation, so JsonResponse/RedirectResponse are literally the same classes; only the sugar helpers differ.",
    },
  ],

  playground: {
    intro:
      "Drupal never hands the controller's return value to the browser directly — a render pipeline walks the render array (keys starting with '#') and turns it into HTML. This pure-PHP model mimics that: the 'controller' returns a nested array, and a tiny renderer walks it.",
    lang: "php",
    code: `<?php
// A controller method in Drupal returns a RENDER ARRAY like this.
function controller_index(string $name): array {
  return [
    '#markup' => "Hello, {$name}",
    'list' => [
      '#theme' => 'item_list',
      '#items' => ['alpha', 'beta', 'gamma'],
    ],
  ];
}

// A very small stand-in for Drupal's render pipeline: walk the array,
// treat '#'-prefixed keys as directives, recurse into child elements.
function render_element(array $el): string {
  $html = '';
  if (isset($el['#markup'])) {
    $html .= "<p>{$el['#markup']}</p>";
  }
  if (($el['#theme'] ?? null) === 'item_list') {
    $html .= '<ul>';
    foreach ($el['#items'] as $item) {
      $html .= "<li>{$item}</li>";
    }
    $html .= '</ul>';
  }
  // Recurse into non-'#' children (nested render arrays).
  foreach ($el as $key => $child) {
    if (is_string($key) && $key[0] !== '#' && is_array($child)) {
      $html .= render_element($child);
    }
  }
  return $html;
}

$build = controller_index('Ada');
echo render_element($build), "\\n";
echo 'render array keys: ', implode(',', array_keys($build)), "\\n";`,
    output: `<p>Hello, Ada</p><ul><li>alpha</li><li>beta</li><li>gamma</li></ul>
render array keys: #markup,list`,
  },

  keyPoints: [
    "ControllerBase is Drupal's AbstractController: extend it for helpers like ->t(), ->currentUser(), ->config(), ->entityTypeManager(), ->redirect().",
    "A Drupal controller returns a render array (nested '#'-keyed array) that the render pipeline themes and caches — not a rendered Twig string.",
    "You can still return a Symfony Response (JsonResponse, RedirectResponse, file download) directly; both frameworks share symfony/http-foundation.",
    "No constructor autowiring: implement static create(ContainerInterface $container) and fetch services by string ID, then pass them to your constructor.",
    "Routing lives in my_module.routing.yml; _controller points at Class::method and access is declared with _permission/_role/_access, not method attributes.",
    "PHP attributes in Drupal are for plugins (D10.2/D11), not for routing ordinary controllers.",
  ],

  interview: [
    {
      q: "A Drupal controller action returns an array. How is that different from a Symfony action returning $this->render(...), and why does Drupal do it?",
      a: "In Symfony, \`$this->render()\` executes the Twig template immediately and returns a fully-built \`Response\` (a string of HTML). A Drupal controller instead returns a **render array** — a nested \`#\`-keyed data structure that *describes* the output without rendering it. Drupal's render pipeline processes that array later, applying theming, \`#cache\` metadata, and access. Deferring the actual rendering is what lets Drupal do render caching, lazy builders/placeholders, and consistent theme overrides. You can still return a \`Response\` directly when you don't want a themed page (JSON, redirects, downloads).",
    },
    {
      q: "Symfony autowires services into the constructor. Explain how you inject a service into a Drupal controller.",
      a: "Drupal does not autowire controllers. You implement the static factory \`public static function create(ContainerInterface $container): self\`, and inside it you pull services out of the container **by their service ID** (e.g. \`$container->get('entity_type.manager')\`), then pass them to your own \`__construct()\`. Drupal calls \`create()\` to build the controller. It's the manual equivalent of Symfony's compiler-pass autowiring. Because \`ControllerBase\` already exposes common services through inherited getters (\`$this->currentUser()\`, \`$this->config()\`), you only add \`create()\` when you need a service that isn't already available.",
    },
    {
      q: "Where do you declare a controller's route and its access check in Drupal, compared to Symfony?",
      a: "In Symfony 6.4/7 you typically put \`#[Route]\` on the method and guard it with \`#[IsGranted('ROLE_...')]\`. In Drupal the route lives in \`my_module.routing.yml\`: the \`_controller\` key points at \`\\Drupal\\module\\Controller\\Class::method\`, \`_title\` sets the page title, and access is declared under \`requirements\` with \`_permission\`, \`_role\`, or a custom \`_access\` callback. There is no PHP-attribute routing for ordinary controllers — attribute-based discovery in Drupal is reserved for **plugins** (introduced in D10.2/D11), not routes.",
    },
  ],

  quiz: [
    {
      question: "What does a typical Drupal controller method return for a page?",
      options: [
        "A rendered HTML string produced by Twig",
        "A render array (a nested '#'-keyed associative array)",
        "A Symfony Response only — arrays are not allowed",
        "A Twig template name as a string",
      ],
      answerIndex: 1,
      explain:
        "Idiomatic Drupal controllers return a render array that the render pipeline later themes and caches. Returning a Response directly is also allowed (for JSON, redirects, downloads), but the array is the default for pages.",
    },
    {
      question: "How are services provided to a Drupal controller?",
      options: [
        "Autowired into the constructor by type hint, like Symfony",
        "Fetched globally via \\Drupal::service() only",
        "Via a static create(ContainerInterface $container) factory that pulls them by service ID",
        "Injected through #[Autowire] attributes on the constructor",
      ],
      answerIndex: 2,
      explain:
        "Drupal has no controller autowiring. You implement create(ContainerInterface $container), call $container->get('service.id') for each dependency, and pass them into your constructor. ControllerBase also exposes common services through inherited getter methods.",
    },
    {
      question: "In Drupal, where is a controller's route path and access requirement declared?",
      options: [
        "In #[Route] and #[IsGranted] attributes on the method",
        "In my_module.routing.yml via _controller and requirements._permission",
        "In services.yml under the controller definition",
        "Automatically inferred from the controller's namespace",
      ],
      answerIndex: 1,
      explain:
        "Routes live in *.routing.yml. _controller points at Class::method, _title sets the page title, and access is set under requirements with _permission/_role/_access. Attribute routing is not used for ordinary Drupal controllers.",
    },
  ],
};

export default lesson;

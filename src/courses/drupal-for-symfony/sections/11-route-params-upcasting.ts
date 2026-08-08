import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "route-params-upcasting",
  title: "Route Parameters & Entity Upcasting",
  part: "Routing, Controllers & Services",
  estMinutes: 12,
  summary:
    "How Drupal turns a raw {node} id in the URL into a loaded entity object handed to your controller — the equivalent of Symfony's ParamConverter / #[MapEntity].",
  concept: `## The problem both frameworks solve

In Symfony you rarely accept a raw \`{id}\` and call the repository yourself. You
type-hint an entity and the framework loads it: classic \`ParamConverter\`, or the
modern \`#[MapEntity]\` attribute (Symfony 6.2+). The router matches \`/blog/{id}\`,
Doctrine fetches the row, and your action receives \`Article $article\` — a 404 is
thrown automatically if nothing matches.

Drupal calls this **upcasting** (raising a scalar "up" to an object). The moving
part is a \`ParamConverter\` service — for entities, \`EntityConverter\` — invoked
during route enhancement, before your controller runs.

## The key difference: YAML declares it, not the type-hint

This is the trap for a Symfony dev. In Symfony the *PHP type-hint* drives
conversion. In Drupal the **routing YAML** drives it. You mark a parameter's
\`type\` as \`entity:node\` in \`options.parameters\`; only then does \`EntityConverter\`
fire. The controller type-hint (\`NodeInterface $node\`) is just documentation and
IDE help — it does **not** trigger loading on its own.

\`\`\`yaml
my_module.article_view:
  path: '/article/{node}'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\ArticleController::view'
  requirements:
    _entity_access: 'node.view'
    node: \\d+
  options:
    parameters:
      node:
        type: entity:node
\`\`\`

Three things are doing work here:

- **\`options.parameters.node.type: entity:node\`** — the actual upcast switch. The
  URL slug \`{node}\` is loaded via \`Node::load($id)\`.
- **\`requirements: node: \\d+\`** — a regex constraint on the slug, exactly like
  Symfony's \`requirements={"id"="\\d+"}\` / \`{id<\\d+>}\`. Non-numeric URLs 404 at
  routing time, before any DB hit.
- **\`requirements: _entity_access: 'node.view'\`** — access is checked against the
  *upcast* object using the \`view\` operation. This has no direct Symfony analog;
  it is closer to a voter (\`#[IsGranted]\`) wired to the loaded entity.

## Core routes do this for you

You seldom hand-write the above. Entity types declare route providers, so
\`entity.node.canonical\` (\`/node/{node}\`), \`entity.node.edit_form\`
(\`/node/{node}/edit\`) and \`entity.node.delete_form\` already have the
\`entity:node\` parameter and access requirement configured. When you add a custom
route that reuses \`{node}\`, you must re-declare the \`type\` yourself — Drupal does
not infer it from the slug name.

## Where it happens in the stack

Symfony resolves arguments in a \`ValueResolver\` after routing. Drupal resolves
them in \`ParamConverterManager\` during the \`RouteEnhancer\` phase of the kernel,
then \`ControllerResolver\` matches the loaded objects to your method arguments **by
name** — the argument must be named \`$node\` to receive the \`{node}\` slug. Miss on
the name and you get a null/exception, not silent injection.`,
  comparisons: [
    {
      label: "Declaring the converted parameter",
      intro:
        "Symfony infers the entity from the action's type-hint (optionally tuned with #[MapEntity]). Drupal keys off the routing YAML's parameter type, not the PHP signature.",
      leftLang: "php",
      rightLang: "yaml",
      php: `// Symfony 6.4/7 — routing via attribute on the controller
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Bridge\\Doctrine\\Attribute\\MapEntity;

final class ArticleController
{
    #[Route('/article/{id}', requirements: ['id' => '\\d+'])]
    public function view(
        #[MapEntity(id: 'id')] Article $article,
    ): Response {
        // $article is loaded; 404 auto-thrown if missing
        return $this->render('article/view.html.twig', [
            'article' => $article,
        ]);
    }
}`,
      ts: `# Drupal 10/11 — my_module.routing.yml
my_module.article_view:
  path: '/article/{node}'
  defaults:
    _controller: '\\Drupal\\my_module\\Controller\\ArticleController::view'
    _title: 'Article'
  requirements:
    _entity_access: 'node.view'
    node: \\d+
  options:
    parameters:
      node:
        type: entity:node   # <-- the upcast switch`,
      note:
        "Symfony reads the PHP type-hint; Drupal reads options.parameters.*.type. The Drupal controller type-hint is documentation only.",
    },
    {
      label: "The controller method",
      intro:
        "Both receive a fully loaded object. In Drupal the argument name must match the route slug ({node} -> $node); the framework binds by name, not by type.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: bound by type-hint (and #[MapEntity])
public function view(Article $article): Response
{
    $title = $article->getTitle();
    return $this->render('article/view.html.twig', [
        'title' => $title,
    ]);
}`,
      ts: `// Drupal: bound by argument NAME matching {node}
use Drupal\\node\\NodeInterface;

public function view(NodeInterface $node): array {
  $title = $node->label();
  // Return a render array, not a Response
  return [
    '#markup' => $this->t('Viewing @t', ['@t' => $title]),
    '#cache' => ['tags' => $node->getCacheTags()],
  ];
}`,
      note:
        "Rename $node to $article in Drupal and binding breaks — Drupal matches the {node} slug to a same-named argument.",
    },
    {
      label: "Constraining the slug (404 before DB)",
      intro:
        "Both frameworks let a route reject malformed ids at match time so no load is attempted.",
      leftLang: "php",
      rightLang: "yaml",
      php: `// Symfony inline requirement syntax
#[Route('/article/{id<\\d+>}')]
public function view(Article $article): Response { /* ... */ }

// equivalent longhand:
#[Route('/article/{id}', requirements: ['id' => '\\d+'])]`,
      ts: `# Drupal — requirements sit beside access checks
requirements:
  _entity_access: 'node.view'
  node: '\\d+'        # regex on the slug; /article/foo -> 404
  # combine with node type filtering in the controller if needed`,
      note:
        "requirements in Drupal mixes regex constraints AND access/permission checks in one block; Symfony splits requirements from #[IsGranted].",
    },
  ],
  playground: {
    intro:
      "A pure-PHP model of Drupal's EntityConverter: given a route definition whose parameter is typed 'entity:node', walk the raw URL args, upcast numeric ids into loaded 'entities', and hand them to a controller by argument name. No Drupal bootstrap needed.",
    lang: "php",
    code: `<?php

// --- Fake entity storage (stands in for Node::load) ---
$storage = [
  7  => ['id' => 7,  'label' => 'Hello Drupal'],
  42 => ['id' => 42, 'label' => 'Upcasting Rocks'],
];

// --- A route definition, like my_module.routing.yml ---
$route = [
  'path' => '/article/{node}',
  'parameters' => [
    'node' => ['type' => 'entity:node'], // the upcast switch
  ],
  'requirements' => ['node' => '/^\\d+$/'],
];

// --- The EntityConverter: convert raw slugs to objects ---
function upcast(array $route, array $rawArgs, array $storage): array {
  $converted = [];
  foreach ($rawArgs as $name => $value) {
    $def = $route['parameters'][$name] ?? null;
    $isEntity = $def && str_starts_with($def['type'] ?? '', 'entity:');
    if ($isEntity) {
      // enforce the requirement regex first (404 before load)
      $regex = $route['requirements'][$name] ?? '/.*/';
      if (!preg_match($regex, (string) $value)) {
        throw new RuntimeException("404: bad slug '{$value}'");
      }
      $entity = $storage[(int) $value] ?? null;
      if ($entity === null) {
        throw new RuntimeException("404: node {$value} not found");
      }
      $converted[$name] = $entity; // scalar id -> loaded object
    } else {
      $converted[$name] = $value; // left as-is (like {type})
    }
  }
  return $converted;
}

// --- Controller resolver binds by ARGUMENT NAME ---
function viewController(array $node): string {
  return "Viewing #{$node['id']}: {$node['label']}";
}

// Request 1: /article/42  -> upcast to the object
$args = upcast($route, ['node' => '42'], $storage);
echo viewController($args['node']), "\\n";

// Request 2: /article/7
$args = upcast($route, ['node' => '7'], $storage);
echo viewController($args['node']), "\\n";

// Request 3: /article/foo -> fails the requirement regex
try {
  upcast($route, ['node' => 'foo'], $storage);
} catch (RuntimeException $e) {
  echo $e->getMessage(), "\\n";
}
`,
    output: `Viewing #42: Upcasting Rocks
Viewing #7: Hello Drupal
404: bad slug 'foo'`,
  },
  keyPoints: [
    "Drupal 'upcasting' == Symfony ParamConverter/#[MapEntity]: a raw id in the URL becomes a loaded entity before your controller runs.",
    "The trigger is the routing YAML (options.parameters.<name>.type: entity:node), NOT the PHP type-hint as in Symfony.",
    "Controller arguments bind by NAME: the {node} slug fills $node; renaming the argument breaks the injection.",
    "requirements combines regex slug constraints (node: \\d+) AND access checks (_entity_access: 'node.view') in one block.",
    "Core entity routes (entity.node.canonical, entity.node.edit_form) already declare the entity parameter; custom routes reusing {node} must re-declare type: entity:node.",
    "A non-numeric or missing id yields a 404 at routing/convert time, mirroring Symfony's automatic not-found on a failed conversion.",
  ],
  interview: [
    {
      q: "In Symfony an action type-hinted with an entity auto-loads it. Why does that not work by default in Drupal?",
      a: "Drupal's argument resolution is driven by the *routing definition*, not the controller signature. The \`EntityConverter\` ParamConverter only fires when the route declares \`options.parameters.<slug>.type: entity:node\`. The \`NodeInterface $node\` type-hint is used by \`ControllerResolver\` to match the already-converted value **by argument name**, but it never triggers the load itself. So a custom route reusing \`{node}\` without the \`type\` declaration will hand your controller the raw string id, not an object. Symfony's \`#[MapEntity]\`/\`ValueResolver\` chain, by contrast, keys off the PHP type.",
    },
    {
      q: "How do you make /node/{node}/report only match numeric ids and only for published nodes the user may view?",
      a: "Add \`node: '\\d+'\` under \`requirements\` so non-numeric slugs 404 at match time before any DB load, and add \`_entity_access: 'node.view'\` under the same \`requirements\` block so access is checked against the upcast entity using the \`view\` operation. Declare \`options.parameters.node.type: entity:node\` so the object exists to check against. This is roughly Symfony's \`{node<\\d+>}\` plus an \`#[IsGranted]\` voter wired to the loaded entity, but Drupal expresses both in one YAML \`requirements\` block.",
    },
    {
      q: "What are the cache implications a Symfony dev might miss when a controller returns a rendered entity?",
      a: "Drupal controllers usually return a render array, not a \`Response\`. Because the output depends on the upcast entity, you must attach cache metadata — \`'#cache' => ['tags' => $node->getCacheTags(), 'contexts' => [...]]\` — so the page cache invalidates when that node changes. Symfony leaves HTTP caching largely to you (\`Response::setCache\`); Drupal's render pipeline bubbles cache tags/contexts/max-age automatically, but only if you provide them. Forgetting tags means stale pages after an edit.",
    },
  ],
  quiz: [
    {
      question:
        "Which single line in a Drupal route actually causes {node} to be loaded as an entity object?",
      options: [
        "The NodeInterface $node type-hint on the controller method",
        "requirements: node: '\\d+'",
        "options.parameters.node.type: entity:node",
        "defaults._controller pointing at the method",
      ],
      answerIndex: 2,
      explain:
        "Upcasting is switched on by declaring the parameter's type as entity:node in options.parameters. The regex requirement only constrains the slug, and the type-hint merely helps ControllerResolver bind the already-converted value by name.",
    },
    {
      question:
        "A custom route has path '/article/{node}' with type: entity:node, but the controller is `public function view(NodeInterface $article)`. What happens?",
      options: [
        "It works — Drupal matches by type-hint like Symfony",
        "The binding fails because the argument name $article does not match the {node} slug",
        "Drupal renames the argument automatically",
        "The route 404s for every request",
      ],
      answerIndex: 1,
      explain:
        "Drupal's ControllerResolver binds converted parameters to controller arguments by NAME. The slug is {node}, so the argument must be $node. Unlike Symfony's type-driven resolution, the type-hint alone will not deliver the object.",
    },
    {
      question:
        "What is the closest Symfony 6.4/7 equivalent of Drupal's entity upcasting?",
      options: [
        "The #[MapEntity] attribute / ParamConverter loading a Doctrine entity from a route id",
        "The #[Route] attribute by itself",
        "A Twig extension",
        "The messenger component",
      ],
      answerIndex: 0,
      explain:
        "#[MapEntity] (and the older SensioFrameworkExtraBundle ParamConverter) turns a route id into a loaded Doctrine entity and 404s on failure — the same job Drupal's EntityConverter does, differing mainly in being type-hint-driven rather than YAML-driven.",
    },
  ],
};

export default lesson;

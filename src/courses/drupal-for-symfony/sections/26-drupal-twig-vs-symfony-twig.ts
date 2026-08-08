import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "drupal-twig-vs-symfony-twig",
  title: "Twig in Drupal vs Symfony Twig",
  part: "Rendering, Config & Shipping",
  estMinutes: 13,
  summary:
    "Same Twig engine, very different plumbing: Drupal picks templates by theme hook and file-name suggestions, feeds them variables through preprocess functions, and renders arrays instead of controllers calling render().",

  concept: `
You already know Twig from Symfony — the engine is *literally the same*
\`twig/twig\` package. The syntax (\`{{ }}\`, \`{% %}\`, filters, \`extends\`,
\`block\`) is identical. What changes in Drupal is **who chooses the template**
and **how variables get in**.

### In Symfony you name the template; in Drupal the theme layer does

In Symfony a controller ends with
\`return $this->render('article/show.html.twig', ['article' => $a])\`. You pick
the file, you pass the variables, done. Drupal controllers almost never name a
template. They return a **render array** (\`['#theme' => 'node', '#node' => $n]\`),
and Drupal's theme layer resolves which \`.html.twig\` runs. That resolution is
driven by a **theme hook** (\`node\`, \`block\`, \`item_list\`, \`page\`, …) plus
**template suggestions** — increasingly specific file names Drupal tries in order:

\`\`\`
node--article--full.html.twig   (most specific)
node--article.html.twig
node--full.html.twig
node.html.twig                  (base hook, always exists)
\`\`\`

Double-dash \`--\` in a file name means "a more specific variant." The first file
that exists wins. This is Drupal's version of Symfony template inheritance +
\`@Override\` folders, but based on **naming convention**, not an explicit
\`render()\` call.

### Preprocess functions replace the controller's context array

In Symfony, the associative array you pass to \`render()\` *is* the Twig context.
In Drupal the context is assembled by **preprocess functions** that run before
the template. A hook named \`HOOK_preprocess_node(&$variables)\` (in a module's
\`.module\` file or a theme's \`.theme\` file) mutates \`$variables\` by reference,
adding or reshaping data the template will use. Multiple modules and the active
theme each get a turn, in order — so a template's variables are a *collaborative*
build-up, not one controller's return value.

### {{ content }}, attach_library(), and autoescape

Inside a node template you usually just print \`{{ content }}\` — that is the
rendered render-array of all the entity's fields, already themed and access-
checked. You rarely echo raw field values. To load CSS/JS you call
\`{{ attach_library('mytheme/article') }}\` (or set \`#attached\` in a preprocess),
which maps to a library declared in \`mytheme.libraries.yml\` — there is no Symfony
Encore/asset-mapper call in the template.

Finally, **autoescape is on**, same as a well-configured Symfony project, but
Drupal wraps safe strings in markup objects and renders render arrays passed to
\`{{ }}\`, so printing \`{{ content.field_body }}\` themes a field rather than
dumping an object. When you truly have raw HTML, you use \`|raw\` — sparingly.
`,

  comparisons: [
    {
      label: "Controller names template vs returns a render array",
      intro:
        "The core divergence: Symfony's controller picks the Twig file and the context. Drupal returns data and lets the theme layer choose the template by hook + suggestions.",
      php: `<?php
// Symfony 6.4 / 7 — controller names the template AND the context.
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;

class ArticleController extends AbstractController
{
    public function show(Article $article): Response
    {
        // You choose the file; the array IS the Twig context.
        return $this->render('article/show.html.twig', [
            'article' => $article,
            'related' => $article->getRelated(),
        ]);
    }
}`,
      ts: `<?php
// Drupal 10 / 11 — controller returns a render array; theme layer picks template.
namespace Drupal\\my_module\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\node\\NodeInterface;

class ArticleController extends ControllerBase {

  public function show(NodeInterface $node): array {
    // No template named here. '#theme' => 'node' selects the hook; Drupal
    // then tries node--article.html.twig, node.html.twig, etc.
    return [
      '#theme' => 'node',
      '#node' => $node,
      '#view_mode' => 'full',
    ];
  }
}`,
      note: "Symfony binds controller->template directly; Drupal binds controller->render array->theme hook->template suggestion. Variables come from preprocess, not the return.",
    },
    {
      label: "Passing variables: render() context vs preprocess",
      intro:
        "Where do template variables originate? Symfony: the render() array. Drupal: a preprocess hook that mutates $variables by reference before the template runs.",
      php: `<?php
// Symfony: variables are exactly what you pass to render().
return $this->render('article/show.html.twig', [
    'article'   => $article,
    'wordCount' => str_word_count($article->getBody()),
]);

// Template article/show.html.twig:
//   <h1>{{ article.title }}</h1>
//   <p>{{ wordCount }} words</p>`,
      ts: `<?php
// Drupal: a preprocess hook adds variables. Put this in my_theme.theme
// (theme layer) or my_module.module (module layer).
function my_theme_preprocess_node(array &$variables): void {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];
  if ($node->bundle() === 'article') {
    $body = $node->get('body')->value ?? '';
    // New variable, now available in node--article.html.twig as {{ word_count }}
    $variables['word_count'] = str_word_count(strip_tags($body));
  }
}

// Template node--article.html.twig:
//   <h1>{{ label }}</h1>
//   {{ content }}
//   <p>{{ word_count }} words</p>`,
      note: "'&$variables' is by-reference: every module + the theme mutates the same context in turn. There is no single 'return the context' step.",
    },
    {
      label: "Loading assets in the template",
      intro:
        "Symfony templates reach for Encore/AssetMapper helpers. Drupal templates call attach_library(), which resolves against a *.libraries.yml declaration.",
      php: `{# Symfony 6.4/7 with AssetMapper — importmap() emits the <script> tags itself #}
{% block javascripts %}
  {% block importmap %}{{ importmap('app') }}{% endblock %}
{% endblock %}

{# or with Webpack Encore: #}
{{ encore_entry_link_tags('article') }}
{{ encore_entry_script_tags('article') }}`,
      ts: `{# Drupal node--article.html.twig #}
{{ attach_library('my_theme/article') }}

<article{{ attributes }}>
  <h1{{ title_attributes }}>{{ label }}</h1>
  {{ content }}
</article>

{# my_theme.libraries.yml declares what 'article' means:
   article:
     css:
       theme:
         css/article.css: {}
     js:
       js/article.js: {}
#}`,
      leftLang: "php",
      rightLang: "php",
      note: "attach_library() adds to the page's #attached assets; Drupal dedupes and aggregates them. The library name is theme_or_module/library_key.",
    },
    {
      label: "Template selection: inheritance vs suggestions",
      intro:
        "Both let you override a base template, but the mechanism differs: Symfony uses explicit extends/bundle override paths; Drupal uses file-name suggestions resolved automatically.",
      php: `{# Symfony: explicit inheritance, you name the parent #}
{# templates/article/show.html.twig #}
{% extends 'base.html.twig' %}

{% block body %}
  <h1>{{ article.title }}</h1>
{% endblock %}

{# Overriding a bundle template = copy into
   templates/bundles/SomeBundle/... — an explicit path. #}`,
      ts: `{# Drupal: no name in the controller. File NAME is the selector. #}
{# node.html.twig  -> applies to every node #}
{# node--article.html.twig -> only 'article' bundle (more specific wins) #}

{# You can inspect/add suggestions in a hook: #}
{#
function my_theme_theme_suggestions_node_alter(
  array &$suggestions, array $variables): void {
  $node = $variables['elements']['#node'];
  if ($node->isPromoted()) {
    $suggestions[] = 'node__promoted'; // adds node--promoted.html.twig
  }
}
#}`,
      leftLang: "php",
      rightLang: "php",
      note: "Symfony override = explicit extends/path. Drupal override = drop in a more specific *--suggestion.html.twig; hook_theme_suggestions_HOOK_alter() adds custom ones.",
    },
  ],

  playground: {
    intro:
      "Drupal's most surprising bit is template-suggestion resolution: it builds a list of candidate file names from most-specific to least, then renders the first that exists. This pure-PHP model reproduces that lookup for a node render array.",
    lang: "php",
    code: `<?php
// Which .html.twig files actually exist in our theme.
$existing = [
  'node.html.twig'            => true,
  'node--article.html.twig'   => true,
  // note: node--article--full.html.twig does NOT exist here.
];

// A render array as a controller might return it.
$element = ['#theme' => 'node', 'bundle' => 'article', 'view_mode' => 'full'];

// Build suggestions most-specific -> least-specific (Drupal's order).
function build_suggestions(array $el): array {
  $hook = $el['#theme'];                 // 'node'
  $bundle = $el['bundle'];               // 'article'
  $mode = $el['view_mode'];              // 'full'
  return [
    "{$hook}--{$bundle}--{$mode}.html.twig",
    "{$hook}--{$bundle}.html.twig",
    "{$hook}--{$mode}.html.twig",
    "{$hook}.html.twig",
  ];
}

$suggestions = build_suggestions($element);
echo "Tried in order:\\n";
$chosen = null;
foreach ($suggestions as $file) {
  $hit = isset($existing[$file]);
  echo "  {$file} => " . ($hit ? 'FOUND' : 'miss') . "\\n";
  if ($hit && $chosen === null) {
    $chosen = $file;
  }
}
echo "Rendered with: {$chosen}\\n";`,
    output: `Tried in order:
  node--article--full.html.twig => miss
  node--article.html.twig => FOUND
  node--full.html.twig => miss
  node.html.twig => FOUND
Rendered with: node--article.html.twig`,
  },

  keyPoints: [
    "Same engine: Drupal and Symfony both run twig/twig — identical syntax. What differs is template selection and variable injection, not Twig itself.",
    "Symfony controllers name the template via render(); Drupal controllers return a render array and the theme layer picks the file via a theme hook + template suggestions.",
    "Template suggestions are file names from specific to generic (node--article--full → node--article → node); the first that exists wins. '--' means 'more specific variant'.",
    "Variables come from preprocess functions (HOOK_preprocess_node(&$variables)) in .theme/.module files, not from a single controller context array; multiple layers contribute by reference.",
    "{{ content }} prints the already-themed, access-checked render array of an entity's fields; you rarely echo raw field values.",
    "Load assets with {{ attach_library('theme/key') }} resolving against *.libraries.yml, and remember autoescape is on — reach for |raw only for genuinely trusted HTML.",
  ],

  interview: [
    {
      q: "A Symfony controller ends with $this->render('x.html.twig', [...]). What is the Drupal equivalent, and how does Drupal decide which template runs?",
      a: "A Drupal controller usually returns a **render array** such as \`['#theme' => 'node', '#node' => $node]\` rather than naming a template. The \`#theme\` key names a **theme hook** (\`node\`, \`block\`, \`item_list\`, \`page\`…). Drupal's theme layer then builds a list of **template suggestions** — file names from most specific to least, e.g. \`node--article--full.html.twig\`, \`node--article.html.twig\`, \`node.html.twig\` — and renders the first one that exists. So selection is convention-driven by file name, not an explicit \`render()\` call. You can add custom suggestions with \`hook_theme_suggestions_HOOK_alter()\`.",
    },
    {
      q: "Where do a Drupal template's variables come from, given the controller didn't pass a context array?",
      a: "From **preprocess functions**. A hook like \`HOOK_preprocess_node(&$variables)\` — living in a module's \`.module\` file or a theme's \`.theme\` file — receives \`$variables\` **by reference** and adds or reshapes what the template will see. Several layers run in order (core, contrib modules, then the active theme), each mutating the same array, so the final context is a collaborative build-up rather than one controller's return value. This is why you set \`$variables['word_count'] = …\` in PHP and then print \`{{ word_count }}\` in Twig.",
    },
    {
      q: "In a node template you see {{ content }} and {{ attach_library('theme/x') }}. Explain both to someone from Symfony.",
      a: "\`{{ content }}\` prints the **rendered render array of the entity's fields** — already themed, formatted, and access-checked by Drupal's field/render pipeline. It's not the raw body string; it's closer to printing a fully-built sub-view than echoing a property. \`{{ attach_library('theme/x') }}\` attaches an **asset library** (CSS/JS) declared in \`theme.libraries.yml\`, adding it to the page's \`#attached\` assets, which Drupal then dedupes and aggregates. There's no Encore/AssetMapper helper in the template; asset loading goes through the library system, in Twig or via \`$variables['#attached']['library'][]\` in preprocess.",
    },
  ],

  quiz: [
    {
      question:
        "A Drupal controller returns ['#theme' => 'node', '#node' => $node]. Both node--article.html.twig and node.html.twig exist for an 'article' node. Which renders?",
      options: [
        "node.html.twig, because it is the base hook and always wins",
        "node--article.html.twig, because it is the more specific suggestion and exists",
        "Neither — you must name the template in the controller",
        "Both are rendered and concatenated",
      ],
      answerIndex: 1,
      explain:
        "Drupal builds suggestions from most specific to least (node--article--… → node--article → node) and renders the FIRST that exists. Since node--article.html.twig exists, it wins over the generic node.html.twig.",
    },
    {
      question:
        "You need a new variable {{ word_count }} available in node--article.html.twig. Where do you add it?",
      options: [
        "In the controller's return array as a context key",
        "As a #[Template] attribute on the controller method",
        "In a HOOK_preprocess_node(&$variables) function in a .theme or .module file",
        "Directly in the Twig file with {% set %} only — PHP cannot add it",
      ],
      answerIndex: 2,
      explain:
        "Template variables in Drupal are assembled by preprocess functions that mutate $variables by reference. Adding $variables['word_count'] in HOOK_preprocess_node makes {{ word_count }} available in the template.",
    },
    {
      question: "What does {{ attach_library('my_theme/article') }} do in a Drupal template?",
      options: [
        "Imports another Twig template for inclusion",
        "Attaches CSS/JS declared under 'article' in my_theme.libraries.yml to the page",
        "Autoloads a PHP class named Article",
        "Runs Webpack Encore to build the article bundle",
      ],
      answerIndex: 1,
      explain:
        "attach_library() references an asset library (theme_or_module/library_key) declared in *.libraries.yml and adds its CSS/JS to the page's #attached assets, which Drupal then aggregates and dedupes.",
    },
  ],
};

export default lesson;

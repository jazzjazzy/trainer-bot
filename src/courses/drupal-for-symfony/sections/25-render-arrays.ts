import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "render-arrays",
  title: "Render Arrays vs Twig-in-Controller",
  part: "Rendering, Config & Shipping",
  estMinutes: 13,
  summary:
    "Why Drupal controllers and blocks return a nested render array instead of rendering Twig to a string — and how deferring rendering unlocks caching, cache metadata, and alter hooks.",

  concept: `
In Symfony a controller usually ends with
\`return $this->render('page.html.twig', ['rows' => $rows])\`. That call runs
Twig **immediately** and hands back a \`Response\` — a finished string of HTML.
Rendering is *eager*: by the time the value leaves your method, the work is done.

Drupal flips this. A controller (or block, or field formatter) returns a
**render array**: a nested associative PHP array that *describes* what to render,
not the rendered result. Drupal's render service walks that array **late**, right
before the response is sent, turning it into HTML. Rendering is *lazy*.

### What a render array looks like

Keys starting with \`#\` are **properties/directives**; every other key is a
**child element** (itself a render array), so the whole thing is a tree.

\`\`\`
$build = [
  '#type' => 'container',
  'title' => ['#markup' => 'Team roster'],
  'table' => [
    '#type' => 'table',
    '#header' => ['Name', 'Role'],
    '#rows' => [['Ada', 'Lead'], ['Lin', 'Dev']],
  ],
  '#cache' => [
    'contexts' => ['user.permissions'],
    'tags' => ['node_list'],
    'max-age' => 3600,
  ],
];
\`\`\`

Common properties: \`#type\` (a render element plugin like \`table\`, \`container\`,
\`link\`), \`#theme\` (a theme hook + Twig template, e.g. \`item_list\`),
\`#markup\` (a small safe HTML string), \`#attached\` (CSS/JS libraries,
\`drupalSettings\`, HTTP headers), and \`#cache\` (cacheability metadata).

### Why an array and not a string

Because the render happens **later**, Drupal can do things Symfony's eager
\`render()\` cannot:

- **Render caching.** The \`#cache\` metadata on the array — \`contexts\` (what it
  varies by), \`tags\` (what invalidates it), \`max-age\` — lets Drupal cache a
  subtree and reuse it. Cache metadata **bubbles up**: a child's tags become the
  parent's tags automatically.
- **Alter hooks.** Because the structure is still data, other modules can mutate
  it via \`hook_preprocess_HOOK\`, \`hook_element_info_alter\`, or
  \`hook_ENTITY_TYPE_view_alter\` before it becomes HTML. You cannot alter a
  string you already built.
- **Placeholders / lazy builders.** Expensive, highly-dynamic bits (a "3 items
  in cart" badge) can be \`#lazy_builder\` placeholders rendered *after* the
  cached shell, so one uncacheable fragment doesn't poison the whole page.

### The mental shift

Think of a Symfony action as returning a **Response**; think of a Drupal
controller as returning a **view-model** that the theme layer renders. You still
*can* return a \`Response\` directly (JSON, downloads, redirects — same
\`symfony/http-foundation\` classes), but for pages the render array is what makes
Drupal's caching and theming work. Twig still exists in Drupal — templates run
via \`#theme\` — you just rarely call it yourself from a controller.
`,

  comparisons: [
    {
      label: "Eager render() vs a render array",
      intro:
        "The same 'list of names' page. Symfony renders Twig to a string in the action; Drupal returns a data structure and lets the render pipeline produce HTML later.",
      php: `<?php
// Symfony 6.4 / 7 — Twig runs NOW, returns a finished Response.
class RosterController extends AbstractController
{
    #[Route('/roster', name: 'app_roster')]
    public function index(): Response
    {
        $names = ['Ada', 'Lin', 'Ravi'];

        // render() executes the template immediately -> HTML string.
        return $this->render('roster/index.html.twig', [
            'names' => $names,
        ]);
    }
}`,
      ts: `<?php
// Drupal 10 / 11 — return a render array; HTML is built later.
class RosterController extends ControllerBase {

  public function index(): array {
    $names = ['Ada', 'Lin', 'Ravi'];

    // No rendering here. #theme 'item_list' + template runs in the pipeline.
    return [
      '#theme' => 'item_list',
      '#items' => $names,
      '#title' => $this->t('Roster'),
    ];
  }
}`,
      note: "Symfony's render() is eager (string out); Drupal returns data and defers the Twig/theme step to the render pipeline.",
    },
    {
      label: "Cacheability lives on the array",
      intro:
        "In Symfony you set caching on the Response (or via the HttpCache/annotations). In Drupal, cache metadata rides along inside the render array under #cache and bubbles up the tree.",
      php: `<?php
// Symfony — cache metadata set on the Response object.
public function teaser(int $id): Response
{
    $response = $this->render('node/teaser.html.twig', [...]);
    $response->setPublic();
    $response->setMaxAge(3600);
    // Vary handled via headers; tag invalidation needs extra tooling.
    return $response;
}`,
      ts: `<?php
// Drupal — #cache is part of the render array itself.
public function teaser(int $id): array {
  $node = $this->entityTypeManager()->getStorage('node')->load($id);
  return [
    '#markup' => $node->label(),
    '#cache' => [
      // Vary the cache by these dimensions:
      'contexts' => ['user.permissions', 'url.query_args'],
      // Invalidate automatically when this node changes:
      'tags' => $node->getCacheTags(),      // e.g. ['node:42']
      'max-age' => 3600,                    // seconds; Cache::PERMANENT = -1
    ],
  ];
}`,
      note: "Drupal caching is declarative and tag-driven: saving node 42 invalidates every fragment tagged node:42, no manual purge. Child #cache bubbles to the parent.",
    },
    {
      label: "Attaching assets: #attached vs {{ encore }}",
      intro:
        "Both frameworks avoid dumping <script> tags into markup. Symfony attaches assets in the template (Encore/AssetMapper); Drupal declares libraries on the render array so they load only when that element renders.",
      php: `{# Symfony Twig — assets referenced in the template layer #}
{# templates/roster/index.html.twig #}
{% block javascripts %}
  {{ parent() }}
  {{ encore_entry_script_tags('roster') }}
{% endblock %}

{# Or with AssetMapper: #}
{# <script type="module" src="{{ importmap('roster') }}"></script> #}`,
      ts: `<?php
// Drupal — attach a library (defined in my_module.libraries.yml)
// directly on the element that needs it.
return [
  '#markup' => $this->t('Interactive roster'),
  '#attached' => [
    'library' => ['my_module/roster'],
    'drupalSettings' => ['roster' => ['live' => TRUE]],
  ],
];`,
      leftLang: "php",
      rightLang: "php",
      note: "#attached is aggregated across the whole page: assets load once, only if their element actually made it into the output.",
    },
    {
      label: "When you still want a raw Response",
      intro:
        "Not everything is a themed page. For JSON, downloads, and redirects both frameworks drop to shared HttpFoundation — this is the one place the APIs look nearly identical.",
      php: `<?php
// Symfony
public function api(): Response
{
    return $this->json(['ok' => true]);          // JsonResponse
}`,
      ts: `<?php
// Drupal — same HttpFoundation class, no render array involved.
use Symfony\\Component\\HttpFoundation\\JsonResponse;

public function api(): JsonResponse {
  return new JsonResponse(['ok' => TRUE]);
}`,
      note: "Return an array for cacheable, themeable pages; return a Response when you need full control and no theming.",
    },
  ],

  playground: {
    intro:
      "Drupal's renderer walks a render array: '#'-keyed keys are directives, other keys are child elements it recurses into, and #cache metadata bubbles UP from children to parents. This pure-PHP model reproduces that walk and the tag-bubbling so you can predict the output.",
    lang: "php",
    code: `<?php
// A render array as a controller would return it: a tree of elements.
$build = [
  '#markup' => 'Roster',
  '#cache' => ['tags' => ['user_list']],
  'table' => [
    '#theme' => 'item_list',
    '#items' => ['Ada', 'Lin', 'Ravi'],
    '#cache' => ['tags' => ['node:42']],   // child tag — should bubble up
  ],
];

// Tiny stand-in for Drupal's renderer. Returns [html, bubbled_cache_tags].
function render_element(array $el): array {
  $html = '';
  $tags = $el['#cache']['tags'] ?? [];

  if (isset($el['#markup'])) {
    $html .= "<h2>{$el['#markup']}</h2>";
  }
  if (($el['#theme'] ?? null) === 'item_list') {
    $html .= '<ul>';
    foreach ($el['#items'] as $item) {
      $html .= "<li>{$item}</li>";
    }
    $html .= '</ul>';
  }
  // Recurse into child elements (keys not starting with '#').
  foreach ($el as $key => $child) {
    if (is_string($key) && $key[0] !== '#' && is_array($child)) {
      [$childHtml, $childTags] = render_element($child);
      $html .= $childHtml;
      $tags = array_merge($tags, $childTags);   // tags bubble UP
    }
  }
  return [$html, array_values(array_unique($tags))];
}

[$html, $tags] = render_element($build);
echo $html, "\\n";
echo 'bubbled cache tags: ', implode(', ', $tags), "\\n";`,
    output: `<h2>Roster</h2><ul><li>Ada</li><li>Lin</li><li>Ravi</li></ul>
bubbled cache tags: user_list, node:42`,
  },

  keyPoints: [
    "Symfony's $this->render() is eager: Twig runs now and returns an HTML string; a Drupal controller returns a render array that the pipeline renders late.",
    "A render array is a tree: '#'-prefixed keys are directives (#type, #theme, #markup, #attached, #cache); other keys are child render arrays.",
    "Deferring rendering is what enables render caching, alter/preprocess hooks, and #lazy_builder placeholders — none of which work on an already-built string.",
    "#cache carries contexts (what it varies by), tags (what invalidates it), and max-age; metadata bubbles from child elements up to their parents.",
    "Cache tags make invalidation declarative: saving node 42 clears every fragment tagged node:42 automatically, no manual purge.",
    "#attached declares CSS/JS libraries and drupalSettings on the element, so assets load once and only when that element is actually rendered.",
    "You can still return a Symfony Response (JSON, download, redirect) directly — same symfony/http-foundation classes — when you don't want theming.",
  ],

  interview: [
    {
      q: "Why does a Drupal controller return a render array instead of a rendered string like Symfony's $this->render()?",
      a: "Symfony's \`render()\` is **eager** — it executes Twig immediately and returns a finished \`Response\`. Drupal returns a **render array**, a nested \`#\`-keyed data structure that only *describes* the output; the render pipeline turns it into HTML **late**, just before the response is sent. Deferring the render is the whole point: while it's still data, Drupal can attach and bubble \`#cache\` metadata, let modules mutate it through alter/preprocess hooks, and swap in \`#lazy_builder\` placeholders for the dynamic bits. You cannot cache-by-tag or alter a string you have already built, so the array is what makes Drupal's caching and theming layers possible.",
    },
    {
      q: "Explain the #cache metadata on a render array. What are contexts, tags, and max-age?",
      a: "\`#cache\` declares how a fragment may be cached, right on the array. **contexts** are the dimensions it *varies by* — e.g. \`user.permissions\`, \`url.query_args\`, \`languages\` — so Drupal stores a separate variant per distinct context value. **tags** are the data it *depends on* — e.g. \`node:42\`, \`node_list\` — and when that data changes, invalidating the tag drops every cached fragment carrying it, no manual purge. **max-age** is a lifetime in seconds (\`0\` = uncacheable, \`Cache::PERMANENT\` / \`-1\` = forever). Crucially this metadata **bubbles up**: a child element's contexts and tags are merged into its parent's, so the outer cache entry is always at least as specific as anything nested inside it.",
    },
    {
      q: "How do you load a JS/CSS asset for a page in Drupal, versus Symfony?",
      a: "In Symfony you reference assets in the Twig template layer — \`encore_entry_script_tags()\` with Webpack Encore, or an \`importmap()\`/module script with AssetMapper. In Drupal you define a **library** in \`my_module.libraries.yml\` (its CSS and JS files, plus dependencies), then attach it to the render array with \`'#attached' => ['library' => ['my_module/roster']]\`. Because it's attached to a specific element, the asset is only loaded if that element actually renders, and Drupal aggregates \`#attached\` across the whole page so each library loads once. You can also push \`drupalSettings\` and HTTP headers through \`#attached\`.",
    },
  ],

  quiz: [
    {
      question: "What is the core difference between Symfony's $this->render() and a Drupal controller's return value?",
      options: [
        "Symfony returns JSON; Drupal returns XML",
        "Symfony renders Twig eagerly to an HTML Response; Drupal returns a render array that is rendered later by the pipeline",
        "Both return render arrays, but Drupal's is typed",
        "Drupal renders Twig eagerly too; only the template syntax differs",
      ],
      answerIndex: 1,
      explain:
        "Symfony's render() executes Twig immediately and returns a finished Response string. A Drupal controller returns a render array — a data structure the render pipeline turns into HTML late, which is what enables caching, alter hooks, and placeholders.",
    },
    {
      question: "In a render array, what distinguishes a directive/property from a child element?",
      options: [
        "Properties are objects; children are arrays",
        "Properties start with '#' (e.g. #theme, #cache); any key without '#' is a child render array",
        "Children start with '#'; properties do not",
        "There is no distinction — order alone decides",
      ],
      answerIndex: 1,
      explain:
        "Keys beginning with '#' are properties/directives read by the renderer (#type, #theme, #markup, #attached, #cache). Every other key is treated as a nested child element (itself a render array), making the whole thing a tree.",
    },
    {
      question: "You render a fragment showing node 42 and tag it with the node's cache tags. Later an editor saves node 42. What happens?",
      options: [
        "Nothing until max-age expires — tags are only documentation",
        "You must manually call a purge command for that fragment",
        "Invalidating the node:42 cache tag automatically drops every cached fragment carrying that tag",
        "The whole site cache is cleared because tags are global",
      ],
      answerIndex: 2,
      explain:
        "Cache tags make invalidation declarative. Saving the node invalidates node:42, and Drupal removes exactly the cached render fragments that declared that tag — no manual purge, and no need to clear unrelated caches.",
    },
  ],
};

export default lesson;

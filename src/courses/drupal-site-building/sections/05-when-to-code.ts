import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "when-to-code",
  title: "When to Stop Clicking and Start Coding",
  part: "The Site-Builder Mindset",
  estMinutes: 12,
  summary:
    "Where the click-first rule ends: config owns structure and presentation, custom modules own behaviour and integrations — and both anti-patterns (code in the UI, hand-coding a Views page) are equally wrong.",

  concept: `
## The judgment call

The last four lessons made the case for clicking. This one draws the boundary,
because the boundary — not the clicking — is the real skill. Experienced
Drupal teams can look at a ticket and say "site building" or "module work" in
seconds, and the split is more crisp than it first appears.

### The UI owns structure and presentation

If a requirement describes **what the site is made of** or **how it's
arranged**, it's config built in the admin UI:

- Content modeling: content types, fields, taxonomies, media types
- Listings: Views — pages, blocks, feeds, even admin screens
- Layout: block placement, Layout Builder, menus
- People: roles, the permissions grid, moderation workflows
- URLs: path aliases and Pathauto patterns

### Code owns behaviour

If a requirement describes **what the site does** — especially to systems
outside itself — it's a custom module:

- Business logic reacting to lifecycle events: hooks
  (\`hook_ENTITY_TYPE_insert()\` and friends), event subscribers, services
- Integrations: calling an ERP, a payment gateway, a search backend
- Access rules that read runtime data the permissions grid can't express:
  \`hook_node_access()\`, access control handlers
- New data shapes: custom FieldType / FieldWidget / FieldFormatter plugins
- Performance-critical queries where you must hand-tune what Views generates

## Two anti-patterns, one on each side

**Code in the UI is dead.** Drupal 6/7 shipped a "PHP filter" module that let
admins paste PHP into node and block bodies — executable code stored in the
database: unversioned, unreviewable, and a security disaster. Core removed it
in Drupal 8, and nothing like it should ever come back. If you find yourself
typing PHP into an admin textarea, stop.

**Hand-coding what config gives you free is just as wrong.** The Symfony
instinct — route, controller, repository query, Twig template — rebuilds in a
day what Views clicks together in ten minutes, and the hand-rolled version
makes *you* the permanent owner of paging, exposed filters, access checks,
caching, and AJAX. Exhaust the UI, then Views' own plugin and hook escape
hatches, before writing a bespoke page.

## A decision checklist

Ask, in order:

1. Is it structure, a listing, layout, or permissions? → **click it**.
2. Can a well-maintained contrib module do it? → **install and configure**.
3. Does it have side effects or talk to an external system? → **code**.
4. Does access depend on per-entity runtime data no checkbox expresses? → **code**.
5. Is it a genuinely new field/data shape? → **code (plugins)**.
6. Still unsure? Default to the UI and escalate only when it fights back.

## How healthy teams split it

Site builders own the config: they model content, build Views, place blocks.
Developers own \`modules/custom\`. The bridge is \`drush config:export\` —
every click lands in \`config/sync\` as YAML, goes into a branch, and gets
**reviewed in a pull request exactly like code**: a dev reads the Views YAML
diff the way they'd read a controller diff. Config isn't a lawless zone next
to the codebase; it's a first-class, reviewable artifact of it.
`,

  comparisons: [
    {
      label: "The listing you should never hand-code",
      intro:
        "A /news page: newest published articles, filterable by topic, paged. The framework reflex builds a vertical slice; Drupal builds one config entity.",
      php: `// The instinct: a whole vertical slice for one listing.
#[Route('/news', name: 'news')]
public function news(Request $request, ArticleRepository $repo): Response
{
    $topic = $request->query->get('topic');
    $page  = $request->query->getInt('page', 1);

    return $this->render('news/index.html.twig', [
        'articles' => $repo->findPublished($topic, $page, 10),
        // ...plus the repository method, the Twig template,
        // the pager partial, the filter form, cache headers...
    ]);
}`,
      ts: `# Structure > Views > Add view:
#   View settings: show Content of type Article
#   Page: path /news, 10 items, mini pager
#   Add filter "Has taxonomy term" -> expose it as "topic"
# Save, then:  drush cex
# views.view.news.yml (trimmed) — the WHOLE page:
id: news
base_table: node_field_data
display:
  default:
    display_options:
      pager:
        type: mini
        options:
          items_per_page: 10
      filters:
        status: { value: '1' }
      sorts:
        created: { order: DESC }
  page_1:
    display_plugin: page
    display_options:
      path: news`,
      note:
        "Ten minutes of clicking replaces the route, query, pager, exposed filter, template, and cache wiring — and Views output is render-cached out of the box.",
    },
    {
      label: "Business logic stays code — reacting to a save",
      intro:
        "Every saved order must be pushed to an external ERP. There is no admin path for this — and that absence is the tell.",
      php: `// Symfony instinct: an entity listener with an injected client.
#[AsEntityListener(event: Events::postPersist, entity: Order::class)]
final class PushOrderToErp
{
    public function __construct(private ErpClient $erp)
    {
    }

    public function postPersist(Order $order): void
    {
        $this->erp->push($order);
    }
}`,
      ts: `// No click-path exists for this — so it's a module:
//   modules/custom/acme_erp/acme_erp.module
use Drupal\\node\\NodeInterface;

/**
 * Implements hook_ENTITY_TYPE_insert() for node.
 */
function acme_erp_node_insert(NodeInterface $node): void {
  if ($node->bundle() !== 'order') {
    return;
  }
  \\Drupal::service('acme_erp.client')->push($node);
}
// Works in Drupal 10 and 11; Drupal 11.1+ can also
// implement this as a #[Hook('node_insert')] class method.`,
      note:
        "This is where Drupal agrees with your instincts: side effects are code, in git. Config describes structure — it cannot call an API.",
      rightLang: "php",
    },
    {
      label: "Access: config for the grid, code for the runtime rule",
      intro:
        "Most access rules are a role-permission matrix — pure config. Only rules that read per-entity runtime data go back to code.",
      php: `// Symfony: every access nuance becomes a Voter.
final class ArticleVoter extends Voter
{
    protected function supports(string $attribute, mixed $subject): bool
    {
        return $attribute === 'EDIT' && $subject instanceof Article;
    }

    protected function voteOnAttribute(
        string $attribute,
        mixed $subject,
        TokenInterface $token,
    ): bool {
        return $subject->getAuthor() === $token->getUser();
    }
}`,
      ts: `# The 90% case: People > Permissions — tick boxes, drush cex.
# user.role.editor.yml (excerpt):
id: editor
label: Editor
permissions:
  - 'create article content'
  - 'edit own article content'    # "own" is built in
  - 'delete own article content'
# The other 10% — access depending on runtime data the grid
# can't express (e.g. "only nodes tagged with the editor's
# own region") — goes BACK to code:
#   hook_node_access() in modules/custom/acme_access`,
      note:
        "Don't write an access hook for anything the permissions grid already expresses — 'edit own' and 'edit any' per bundle cover most voters you'd have written.",
    },
    {
      label: "The dead anti-pattern: PHP in the database",
      intro:
        "The Drupal 6/7-era 'PHP filter' let admins paste executable PHP into content. Modern Drupal splits the same need into config placement plus module code.",
      php: `// Drupal 6/7 era: pasted into a BLOCK BODY via the UI.
// Executable code in the database — unversioned,
// unreviewed, and one compromised account from disaster.
<?php
global $user;
if (in_array('editor', array_values($user->roles))) {
  print views_embed_view('news', 'block_1');
}
?>`,
      ts: `# DEAD since Drupal 8: core removed the PHP filter.
# The same requirement is plain block placement config now:
#   Structure > Block layout > Place block > "News"
#   Visibility > Roles: Editor -> Save block, drush cex
# block.block.news.yml (excerpt):
id: news
plugin: 'views_block:news-block_1'
theme: olivero          # block placement is per-theme
region: sidebar
visibility:
  user_role:
    id: user_role
    roles:
      editor: editor
# Anything that must genuinely be PHP becomes a Block
# plugin class in modules/custom — reviewed in git.`,
      note:
        "The rule outlived the module: code lives in modules and goes through review; placement and visibility live in exportable config.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The build-vs-click triage a healthy team runs on every ticket. Predict which requirements get clicked into config and which become module code, then run.",
    code: `<?php
// First rule that matches wins — same order as the lesson's checklist.

function triage(array $flags): array
{
    if (!empty($flags['external'])) {
        return ['MODULE', 'external side effects: hooks/events/services'];
    }
    if (!empty($flags['dynamic'])) {
        return ['MODULE', 'per-entity runtime logic: hook_ENTITY_TYPE_access'];
    }
    if (!empty($flags['new_field_type'])) {
        return ['MODULE', 'new data shape: FieldType/Widget/Formatter plugins'];
    }
    if (!empty($flags['listing'])) {
        return ['CONFIG', 'Views builds this in ~10 minutes'];
    }
    return ['CONFIG', 'content model / roles: pure admin UI'];
}

$requirements = [
    'Article content type with six fields'        => [],
    'Landing page at /news with topic filter'     => ['listing' => true],
    'Push saved orders to the ERP over REST'      => ['external' => true],
    'Editors may only edit nodes in their region' => ['dynamic' => true],
    'A star-rating field with half stars'         => ['new_field_type' => true],
    'Editor role: create + edit any article'      => [],
];

$counts = ['CONFIG' => 0, 'MODULE' => 0];

foreach ($requirements as $name => $flags) {
    [$verdict, $why] = triage($flags);
    $counts[$verdict]++;
    printf("%-6s %s\\n       -> %s\\n", $verdict, $name, $why);
}

echo "\\n";
echo "Clicked into config: {$counts['CONFIG']}   (site builder owns, exported via drush cex)\\n";
echo "Written as code:     {$counts['MODULE']}   (developer owns, lives in modules/custom)\\n";`,
    output: `CONFIG Article content type with six fields
       -> content model / roles: pure admin UI
CONFIG Landing page at /news with topic filter
       -> Views builds this in ~10 minutes
MODULE Push saved orders to the ERP over REST
       -> external side effects: hooks/events/services
MODULE Editors may only edit nodes in their region
       -> per-entity runtime logic: hook_ENTITY_TYPE_access
MODULE A star-rating field with half stars
       -> new data shape: FieldType/Widget/Formatter plugins
CONFIG Editor role: create + edit any article
       -> content model / roles: pure admin UI

Clicked into config: 3   (site builder owns, exported via drush cex)
Written as code:     3   (developer owns, lives in modules/custom)`,
  },

  keyPoints: [
    "Config (built in the UI) owns structure and presentation: content model, Views listings, blocks and Layout Builder, menus, roles/permissions, moderation workflows, URL patterns.",
    "Code (custom modules) owns behaviour: hooks/events/services for business logic, external integrations, runtime access rules, custom field plugins, hand-tuned queries.",
    "Anti-pattern 1 — code in the UI: the PHP filter was removed from core in Drupal 8; never store or evaluate code in the database.",
    "Anti-pattern 2 — hand-coding a listing: a controller + query + template rebuilds in a day what Views clicks together in ten minutes, and you inherit paging, filters, access, and caching forever.",
    "Checklist order: structure/listing/layout/permissions → click; contrib covers it → configure; side effects, external systems, runtime access logic, new data shapes → code.",
    "Healthy team split: site builders own config, developers own modules/custom — and exported config YAML is reviewed in pull requests exactly like code.",
  ],

  interview: [
    {
      q: "How do you decide whether a requirement is site-building work or custom module work in Drupal?",
      a: "I run it through a short checklist. If it describes structure or presentation — content types, fields, a listing, layout, menus, roles, a moderation workflow — it's config built in the admin UI, and the next question is only whether core or contrib covers it. If it describes behaviour — side effects on save, calling an external system, access decisions based on runtime data, a genuinely new field data shape, or a query Views can't produce efficiently — it's a custom module using hooks, event subscribers, services, or plugins. The tell for code is usually that no admin path exists for the requirement at all. When it's ambiguous I default to the UI first, because config is cheaper to build, review, and hand over than code.",
    },
    {
      q: "What was the 'PHP filter' era, and what does modern Drupal do instead?",
      a: "Drupal 6 and 7 shipped a PHP filter module that let administrators paste executable PHP into node bodies and blocks through the UI — code stored in the database, outside version control, invisible to review, and a serious security hole since any account with that text format could execute arbitrary PHP. Core removed it in Drupal 8, and it's considered a dead practice. Modern Drupal splits the same needs: anything that must be PHP lives in a custom module in git, while placement, visibility, and structure live in exportable config YAML. If you catch yourself typing code into an admin textarea, that's the signal you're on the wrong side of the boundary.",
    },
    {
      q: "Your new team's developers hand-code listing pages with controllers and queries. What's your argument for Views?",
      a: "A hand-coded listing means the team permanently owns the route, the query, the pager, the exposed filter form, access checks, and cache invalidation — all things Views provides out of the box, render-cached, in about ten minutes of clicking. The result is also a single config entity (`views.view.*.yml`) that exports with `drush cex`, so it's still reviewable in a pull request like any code change. When Views genuinely can't produce the markup or performance needed, the first escalation is its escape hatches — Views hooks, plugins, and template overrides — not a bespoke controller. I'd reserve fully custom pages for cases with real business logic or query shapes Views can't express.",
    },
  ],

  quiz: [
    {
      question:
        "Which requirement genuinely needs a custom module rather than site building?",
      options: [
        "A /team page listing staff profiles, filterable by department",
        "Pushing every saved order to an external ERP over REST",
        "An Editor role that can create and edit articles",
        "A draft → review → published editorial workflow",
      ],
      answerIndex: 1,
      explain:
        "The listing is a View, the role is the permissions grid, and the workflow is Content Moderation config — all clicked together and exported as YAML. Only the ERP push has an external side effect, and config cannot call an API: that's hook/event/service code in a custom module.",
    },
    {
      question:
        "What is the modern status of pasting PHP into a node or block body through the admin UI?",
      options: [
        "Fine, as long as the text format is restricted to administrators",
        "The PHP filter was removed from Drupal core in Drupal 8; the practice is dead and dangerous",
        "Recommended for quick fixes if you also run drush cex afterwards",
        "Required for embedding a View inside a block",
      ],
      answerIndex: 1,
      explain:
        "Executable code in the database is unversioned, unreviewable, and a security hole — core deleted the PHP filter in Drupal 8. Code belongs in modules in git; embedding a View in a block is plain block placement config, no PHP involved.",
    },
    {
      question:
        "Views can't quite produce the markup or performance you need for one listing. What's the best FIRST move?",
      options: [
        "Rewrite the listing as a custom controller with a hand-written query",
        "Use Views' escape hatches — its hooks, plugins, and template overrides — before abandoning it",
        "Patch the Views module code directly",
        "Run raw SQL from the Twig template",
      ],
      answerIndex: 1,
      explain:
        "Views is extensible by design: hook_views_query_alter(), custom field/filter/style plugins, and template overrides handle most 'Views can't do this' cases while keeping the listing as reviewable config. A fully custom page is the last resort, patching contrib/core is unmaintainable, and SQL in templates is never acceptable.",
    },
    {
      question:
        "On a healthy Drupal team, what happens to config a site builder clicked together before it reaches production?",
      options: [
        "It is recreated by hand on the production site",
        "It is exported with drush cex, committed, reviewed in a pull request like code, then imported with drush cim on deploy",
        "It is copied to production inside a database dump",
        "Nothing — config synchronizes between environments automatically",
      ],
      answerIndex: 1,
      explain:
        "The healthy split is: site builders own config, developers own modules — and the exported YAML in config/sync is branch-committed and PR-reviewed exactly like code. Deployment applies it with drush config:import; rebuilding by hand or moving it in DB dumps defeats review and repeatability.",
    },
  ],
};

export default lesson;

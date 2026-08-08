import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-interview-contrib",
  title: "Cheat Sheet, Interview Prep & the Contrib Ecosystem",
  part: "Rendering, Config & Shipping",
  estMinutes: 12,
  summary:
    "A capstone Symfony-to-Drupal quick-reference: the concept-mapping table, the contrib modules you must know (Views, Token, Pathauto, Paragraphs, Webform, Migrate), and the interview questions a Symfony dev should nail cold.",

  concept: `
You now have the whole map. This section is the fold-out cheat sheet: a
Symfony-term -> Drupal-term lookup, the handful of **contrib** modules every
real project uses, and the interview answers that prove you actually understand
the platform rather than just its jargon.

### The one-line mapping table

| You know (Symfony) | Drupal equivalent | Note |
| --- | --- | --- |
| bundle | **module** | Same idea: a directory of code + \`*.info.yml\` instead of \`composer.json\` extra. |
| \`services.yaml\` autowiring | \`*.services.yml\` (**explicit** args) | No autowiring; you list arguments and tags by hand. |
| \`#[Route]\` attribute | \`*.routing.yml\` | Routes live in YAML keyed by route name; controller under \`_controller\`. |
| Doctrine ORM + migrations | **Entity + Field API** | Fields are config; adding one writes schema for you, no migration files. |
| \`$repo->findBy([...])\` | \`entityQuery\` / storage | Fluent condition builder; \`->accessCheck(TRUE)\` is mandatory. |
| Security voter | **access handler / hook_entity_access** | Returns \`AccessResult\` with cacheability. |
| \`$this->render(twig)\` | **render array** | Return data; the pipeline themes it late. |
| \`.env\` + bundle config | **config entities + \`cex\`/\`cim\`** | Config exports to YAML; deploy = import. |
| \`EventSubscriber\` | events **and** hooks | Both exist; core still fires many hooks. |
| \`bin/console\` | **\`drush\`** | \`drush cr\`, \`drush cim\`, \`drush updb\`, \`drush uli\`. |

### Contrib: the modules that ship on nearly every site

Drupal's "assemble, don't build" culture means you reach for
[drupal.org](https://drupal.org) contrib before writing code. The essentials:

- **Views** (*in core since D8*) — a query builder + display UI. It is Drupal's
  answer to "write a listing page". Build listings, blocks, and REST/JSON exports
  through admin config, no controller. Knowing Views is non-negotiable.
- **Token** — reusable placeholder strings like \`[node:title]\`, consumed by many
  other modules.
- **Pathauto** (depends on Token + Ctools) — auto-generates URL aliases from a
  pattern (\`/blog/[node:title]\`) instead of hand-typing each path.
- **Paragraphs** — component/layout content: an entity-reference-revisions field
  of reusable "paragraph" bundles, so editors compose a page from blocks.
- **Webform** — a full form-builder + submission storage UI; think of it as a
  no-code alternative to hand-writing the Form API.
- **Migrate** (*core API*, + Migrate Plus / Migrate Tools contrib) — the ETL
  pipeline for imports and D7->D10/11 upgrades. Source -> process -> destination
  plugins, run with \`drush migrate:import\`.

### Where the jobs are, and how to talk about them

Drupal work clusters in **government, higher-ed, NGOs, media/publishing, and
large enterprise** — sites with heavy editorial workflows and long lifespans,
exactly where "config in code + content model in the UI" pays off. Sell your
Symfony background as an asset: you already understand DI, the HttpKernel,
routing, and Twig. The delta they will probe is the **Drupal-specific** layer —
entities vs Doctrine, plugins vs tagged services, render arrays, cache tags, and
config management. Nail those and you interview above a typical "site builder".
`,

  comparisons: [
    {
      label: "Data access: findBy() vs entityQuery",
      intro:
        "The single most common thing you will re-learn. Symfony's repository returns hydrated entities from a criteria array; Drupal builds a query of IDs, and access checking is an explicit, mandatory decision.",
      php: `<?php
// Symfony 6.4 / 7 — Doctrine repository.
$articles = $em->getRepository(Article::class)->findBy(
    ['status' => 'published', 'author' => $user],
    ['createdAt' => 'DESC'],
    10,
);
// $articles is already an array of Article objects.`,
      ts: `<?php
// Drupal 10 / 11 — entityQuery returns IDs, then load.
$storage = \\Drupal::entityTypeManager()->getStorage('node');
$ids = $storage->getQuery()
  ->condition('type', 'article')
  ->condition('status', 1)
  ->condition('uid', $user->id())
  ->sort('created', 'DESC')
  ->range(0, 10)
  ->accessCheck(TRUE)   // MANDATORY in D10/11 — omitting it throws.
  ->execute();
$articles = $storage->loadMultiple($ids);`,
      note: "entityQuery returns entity IDs, not objects — you loadMultiple() them. Since D9.2, accessCheck(TRUE|FALSE) is required or the query throws a QueryException.",
    },
    {
      label: "Access decision: voter vs access handler",
      intro:
        "Symfony votes on a subject and returns a bool-ish constant. Drupal returns an AccessResult object that also carries cache metadata, so the decision itself is cacheable.",
      php: `<?php
// Symfony voter.
class ArticleVoter extends Voter {
  protected function voteOnAttribute(string $attr, $subject, TokenInterface $token): bool {
    $user = $token->getUser();
    return $subject->getAuthor() === $user;   // true = allowed
  }
}`,
      ts: `<?php
// Drupal — hook or access handler returns an AccessResult with cacheability.
function mymodule_node_access(NodeInterface $node, string $op, AccountInterface $account) {
  if ($op === 'update' && $node->getOwnerId() === $account->id()) {
    return \\Drupal\\Core\\Access\\AccessResult::allowed()
      ->cachePerUser()
      ->addCacheableDependency($node);   // re-checked when node/user change
  }
  return \\Drupal\\Core\\Access\\AccessResult::neutral();
}`,
      note: "AccessResult is allowed/forbidden/neutral and carries cache contexts + tags, so an access decision can be cached and correctly invalidated — a voter just returns a bool.",
    },
    {
      label: "Config lifecycle: .env/import vs cex/cim",
      intro:
        "Both separate content (in the DB) from configuration (in code). Symfony uses env vars + compiled container config; Drupal exports active config to YAML files that you commit and re-import on deploy.",
      php: `# Symfony — environment + committed config, container recompiled on deploy.
# .env / .env.local
APP_ENV=prod
DATABASE_URL="postgresql://..."

# Build/deploy:
composer install --no-dev
php bin/console cache:clear`,
      ts: `# Drupal — export active config to YAML, commit, import on the target.
# Locally, after changing settings in the admin UI:
drush config:export        # alias: drush cex  -> writes ../config/sync/*.yml

# On deploy (in the target environment):
drush deploy               # runs: updatedb, config:import, cache:rebuild, deploy:hook
# or step by step:
drush updatedb -y          # updb  — run pending schema/hook_update_N
drush config:import -y     # cim   — import the committed YAML into the DB
drush cache:rebuild        # cr`,
      leftLang: "yaml",
      rightLang: "yaml",
      note: "Drupal's config lives in the DB at runtime but ships as YAML; 'drush cex' snapshots it out, 'drush cim' applies it. 'drush deploy' is the D9.5+ one-shot deploy command.",
    },
    {
      label: "Listings: a controller vs Views",
      intro:
        "In Symfony you write a controller + Twig for every listing. In Drupal the reflex is Views: configure a query and display in the admin UI, no PHP — and it produces a cacheable, alterable render array for free.",
      php: `<?php
// Symfony — hand-written listing action.
#[Route('/blog', name: 'blog_index')]
public function index(ArticleRepository $repo): Response {
    return $this->render('blog/index.html.twig', [
        'articles' => $repo->findBy(['status' => 'published'], ['createdAt' => 'DESC']),
    ]);
}`,
      ts: `# Drupal — no controller. A View is config exported as YAML:
# views.view.blog.yml (created in the UI, then 'drush cex')
langcode: en
status: true
id: blog
label: 'Blog'
base_table: node_field_data
display:
  default:
    display_options:
      filters:
        status: { field: status, value: { value: '1' } }
        type:   { field: type, value: { article: article } }
      sorts:
        created: { field: created, order: DESC }
      # Attach to /blog via a 'page' display, or expose as a block/REST feed.`,
      leftLang: "yaml",
      rightLang: "yaml",
      note: "Views (core since D8) replaces most listing controllers. It emits a cacheable render array and is alterable via hook_views_query_alter — you rarely hand-write a listing.",
    },
  ],

  playground: {
    intro:
      "The cheat sheet as runnable data: this models the Symfony->Drupal lookup as an array and prints it as an aligned table, exactly how you'd want it pinned above your desk during the interview.",
    lang: "php",
    code: `<?php
// The core concept map, as data.
$map = [
  ['bundle',            'module'],
  ['services.yaml',     '*.services.yml'],
  ['#[Route] attr',     '*.routing.yml'],
  ['Doctrine ORM',      'Entity + Field API'],
  ['findBy()',          'entityQuery + load'],
  ['security voter',    'access handler'],
  ['$this->render()',   'render array'],
  ['.env / config',     'config cex / cim'],
  ['bin/console',       'drush'],
];

// Compute the left-column width for alignment.
$w = 0;
foreach ($map as [$sf, $dr]) {
  $w = max($w, strlen($sf));
}

echo "SYMFONY" . str_repeat(' ', $w - 7) . "  ->  DRUPAL\\n";
echo str_repeat('-', $w) . "  ->  " . str_repeat('-', 18) . "\\n";
foreach ($map as [$sf, $dr]) {
  echo $sf . str_repeat(' ', $w - strlen($sf)) . "  ->  " . $dr . "\\n";
}
echo "\\n" . count($map) . " mappings memorised.\\n";`,
    output: `SYMFONY          ->  DRUPAL
---------------  ->  ------------------
bundle           ->  module
services.yaml    ->  *.services.yml
#[Route] attr    ->  *.routing.yml
Doctrine ORM     ->  Entity + Field API
findBy()         ->  entityQuery + load
security voter   ->  access handler
$this->render()  ->  render array
.env / config    ->  config cex / cim
bin/console      ->  drush

9 mappings memorised.`,
  },

  keyPoints: [
    "Bundle->module, services.yaml->*.services.yml (no autowiring), #[Route]->routing.yml, Doctrine->Entity/Field API, findBy->entityQuery, voter->access handler, render()->render array, .env/config->cex/cim, bin/console->drush.",
    "entityQuery returns entity IDs (then loadMultiple); ->accessCheck(TRUE|FALSE) is mandatory in Drupal 10/11 or the query throws.",
    "Views (in core since D8) is the reflex for listings, blocks, and feeds — configured in the UI, exported as YAML, no controller needed.",
    "Know the contrib staples: Token, Pathauto, Paragraphs, Webform, and the Migrate API — most projects assemble these rather than writing code.",
    "Config lives in the DB but ships as YAML: 'drush cex' exports, 'drush cim' imports, and 'drush deploy' runs updb+cim+cr+deploy:hook on deploy.",
    "Drupal jobs cluster in gov, higher-ed, NGO, media and enterprise; sell your Symfony DI/kernel/Twig knowledge and study the Drupal-specific layer (entities, plugins, render arrays, cache tags, config management).",
  ],

  interview: [
    {
      q: "You know Symfony well. What are the biggest conceptual shifts moving to Drupal?",
      a: "Four things. **Data**: Doctrine entities-as-classes become the runtime **Entity + Field API**, where fields are configuration and adding one writes its own schema — no migration files. **Extension**: Symfony's tagged services become the **plugin system** (discovery via attributes/annotations + a plugin manager), and core still fires **hooks** alongside the event dispatcher. **Rendering**: \`$this->render()\` returning a string becomes a **render array** the pipeline themes late, carrying \`#cache\` metadata. **Wiring**: \`*.services.yml\` has **no autowiring** — you declare arguments and tags explicitly. Frame it as 'same Symfony foundation, different application layer on top'.",
    },
    {
      q: "How do you query content in Drupal, and what's the accessCheck gotcha?",
      a: "You use \`entityQuery\` (or the storage handler's \`getQuery()\`): a fluent builder of \`->condition()\`, \`->sort()\`, \`->range()\` that \`->execute()\`s to an array of **entity IDs**, which you then \`loadMultiple()\`. Unlike Doctrine's \`findBy()\` it does not return hydrated objects directly. The gotcha: since Drupal 9.2 you **must** call \`->accessCheck(TRUE)\` or \`->accessCheck(FALSE)\` explicitly — omitting it throws a \`QueryException\`. Use \`TRUE\` for anything user-facing so node/entity access is respected, and \`FALSE\` only for trusted admin/cron logic where you deliberately bypass access.",
    },
    {
      q: "A stakeholder wants a filterable, sortable listing of published articles. What's your first move in Drupal, and why not a controller?",
      a: "Reach for **Views** (in core since Drupal 8) before writing any PHP. I'd build a View with a page display at \`/blog\`, filter on \`type = article\` and \`status = published\`, sort by \`created DESC\`, add exposed filters for the editor, and export it with \`drush cex\` so it ships as \`views.view.blog.yml\`. A hand-written controller would re-implement pagination, caching, access, and theming that Views gives for free — and Views emits a cacheable render array that other modules can alter via \`hook_views_query_alter\`. In Drupal, building listings in code is usually a smell.",
    },
    {
      q: "Walk me through deploying a config change from local to production in Drupal.",
      a: "Drupal keeps configuration in the database at runtime but treats YAML as the source of truth. Locally I make the change in the admin UI (say, a new field or a View), then run \`drush config:export\` (\`cex\`) which writes the updated \`*.yml\` into \`config/sync\`, and I commit that. On the target environment the deploy runs \`drush deploy\`, which sequences \`drush updatedb\` (pending \`hook_update_N\` / schema), \`drush config:import\` (\`cim\`, applying the committed YAML into the active DB config), \`drush cache:rebuild\`, and \`drush deploy:hook\` (running pending \`hook_deploy_N\` / post-update hooks; Drupal 11.2+ also adds \`cache:warm\`). This is the Drupal analogue of Symfony's env-vars-plus-recompile flow, and it's what makes 'config in code' auditable and repeatable.",
    },
  ],

  quiz: [
    {
      question:
        "In Drupal 10/11, what happens if you build an entityQuery and call execute() without ever calling accessCheck()?",
      options: [
        "It silently runs with access checking enabled by default",
        "It silently runs with access checking disabled by default",
        "It throws a QueryException — accessCheck(TRUE|FALSE) must be set explicitly",
        "It emits a deprecation notice but returns results anyway",
      ],
      answerIndex: 2,
      explain:
        "Since Drupal 9.2 the accessCheck flag has no default: leaving it null makes prepare() throw a QueryException. You must explicitly opt in (TRUE) or out (FALSE) so access behaviour is a deliberate decision.",
    },
    {
      question:
        "A Symfony developer asks which Drupal tool replaces hand-writing a listing controller + Twig for 'published articles, newest first'. Best answer?",
      options: [
        "Write a ControllerBase subclass returning loadMultiple() results",
        "Views — configure the query/display in the UI and export it as YAML config",
        "The Migrate API",
        "Webform",
      ],
      answerIndex: 1,
      explain:
        "Views (in core since D8) is the standard way to build listings, blocks, and feeds without code. It handles pagination, caching, access, and theming, emits a cacheable render array, and exports to YAML so it ships in config.",
    },
    {
      question: "Which pairing is correct for exporting and importing Drupal configuration?",
      options: [
        "drush cim exports, drush cex imports",
        "drush cex exports active config to YAML; drush cim imports committed YAML into the DB",
        "composer dump-env handles both",
        "config is stored only in YAML, so no export/import step is needed",
      ],
      answerIndex: 1,
      explain:
        "Config lives in the database at runtime. 'drush config:export' (cex) snapshots it to YAML you commit; 'drush config:import' (cim) applies committed YAML into the active DB config on the target. 'drush deploy' chains updb, cim and cache:rebuild.",
    },
  ],
};

export default lesson;

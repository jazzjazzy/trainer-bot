import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "content-deployment",
  title: "Deploying Content (When You Must)",
  part: "Team Workflow",
  estMinutes: 13,
  summary:
    "Config travels through your pipeline and content does not, so when a taxonomy of statuses or a set of landing pages has to ship, you pick a tool (default content, Migrate, single_content_sync, a recipe's content directory) and you solve the identity problem with UUIDs.",

  concept: `
Your pipeline moves code and config. Content lives in the production database and
flows the other way, down to stage and dev via a database sync. That asymmetry is
the whole design, and it works right up until somebody says "the eight workflow
terms have to exist on every environment" or "the new microsite needs its twelve
landing pages seeded before launch".

## The identity problem

A content entity has two identifiers. The **serial ID** (\`nid\`, \`tid\`, \`mid\`) is
an auto-increment column, local to one database, and it means nothing anywhere
else. The **UUID** is generated once at creation and is stable across every copy
of that entity. Deploying content is really just the problem of preserving UUIDs
so that references still point at the right thing.

Drupal already thinks this way. A config entity that depends on a content entity
records the dependency as \`ENTITY_TYPE_ID:BUNDLE:UUID\` under
\`dependencies.content\` — never as an ID. A placed custom block is
\`block.block.sidebar_promo\` with \`plugin: 'block_content:<uuid>'\`. That is the
pattern to copy: **if your thing is referenced by ID, it is not portable.**

## The recurring victims

Four things get assumed to be config and are not:

- **Menu links** created in the UI are \`menu_link_content\` entities. The menu
  itself (\`system.menu.main\`) is config; the links inside it are content. Links
  declared in a module's \`*.links.menu.yml\` are plugins in code, and those *do*
  deploy.
- **Custom blocks.** The placement is config; the block body is a
  \`block_content\` entity. Export config alone and prod gets an empty region.
- **Taxonomy terms.** The vocabulary is a config entity, the terms are content.
- **Layout Builder overrides.** A per-node override lives in the node's
  \`layout_builder__layout\` field — content. Only the default layout, stored on
  \`core.entity_view_display.*\`, is config.

## Choosing a tool

- **Recipe \`content/\` directory** — YAML files under
  \`content/<entity_type>/<name>.yml\`, applied when the recipe is applied. Core's
  Default Content API (\`Drupal\\Core\\DefaultContent\\Importer\`) landed in 10.3
  alongside the recipe work; recipes themselves became stable in 11.1. Best for
  seeding a *new* environment once.
- **default_content module** — the same idea for modules and profiles. The 1.x
  branch exports HAL+JSON; 2.x uses a compact YAML format and can still import
  the old one. \`drush dcer node 12\` walks references and exports the lot.
- **Migrate API** — the only option that is genuinely *repeatable*. The
  \`migrate_map_*\` table remembers the source ID to destination ID mapping, so a
  second \`drush migrate:import\` updates instead of duplicating.
- **single_content_sync** — ad-hoc, editor-facing: export one entity to YAML in
  the UI, paste it into another site.

## The decision rule

Before you build an import pipeline, ask: *does an editor own this, and will they
change it in production?* If no — the set is finite, and code, views filters or
permissions reference it by name — it should have been a **config entity**, not
content. Shipping a bespoke content deployment for something that never changes
is fixing the wrong problem.
`,

  comparisons: [
    {
      label: "Seeding a fresh environment with a known dataset",
      intro:
        "Both teams need the same starter data to exist everywhere. Symfony writes a fixture class; Drupal ships YAML files inside a recipe (or a module) and lets the Default Content importer create the entities.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// src/DataFixtures/StatusFixtures.php
namespace App\\DataFixtures;

use App\\Entity\\Status;
use Doctrine\\Bundle\\FixturesBundle\\Fixture;
use Doctrine\\Persistence\\ObjectManager;

final class StatusFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        foreach (['Draft', 'In review', 'Published'] as $name) {
            $status = new Status();
            $status->setName($name);
            $manager->persist($status);
            // Named handle so other fixtures can reference this row
            // without knowing its (not-yet-assigned) primary key.
            $this->addReference('status_' . $name, $status);
        }
        $manager->flush();
    }
}

// php bin/console doctrine:fixtures:load --env=dev
// NOTE: purges the tables first. Never pointed at production.`,
      ts: `# recipes/editorial_statuses/recipe.yml
name: 'Editorial statuses'
type: 'Content type'
install:
  - taxonomy
config:
  strict: false
# No config.import key here. That key can only pull config an
# *installed extension* already ships in its own config/install
# or config/optional - taxonomy ships no vocabularies, so
# "taxonomy: - taxonomy.vocabulary.status" would filter down to
# nothing and the vocabulary would silently never be created.

# recipes/editorial_statuses/config/taxonomy.vocabulary.status.yml
# A recipe's own config/ directory is applied automatically and
# needs no entry in recipe.yml.
langcode: en
status: true
dependencies: {  }
name: Status
vid: status
description: 'Editorial statuses used by the workflow.'
weight: 0

# recipes/editorial_statuses/content/taxonomy_term/draft.yml
_meta:
  version: '1.0'
  entity_type: taxonomy_term
  uuid: 6f8b1c2a-9d43-4f0e-8a71-2b5c9e4d1a30
  bundle: status
  default_langcode: en
default:
  name:
    - value: Draft
  weight:
    - value: 0

# drush recipe recipes/editorial_statuses
# Re-applying is safe: an entity whose UUID already
# exists is left alone, not duplicated.`,
      note:
        "The recipe's config/ directory carries the vocabulary (a config entity); content/ carries the terms (content entities). Both directories are applied automatically. Reserve config.import for config an installed extension genuinely provides, such as node: - core.entity_view_display.node.article.teaser. The UUID in _meta is the primary key that survives the trip.",
    },
    {
      label: "Referencing the seeded data from code",
      intro:
        "Once the data is in, something has to look it up. Symfony can lean on a natural key or a fixture reference; Drupal must resolve the UUID, because the numeric ID differs per environment.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// A Symfony service looking up seeded reference data.
// The auto-increment id is never written down anywhere,
// so a natural key does the job.
final class ArticlePromoter
{
    public function __construct(
        private readonly StatusRepository $statuses,
    ) {}

    public function promote(Article $article): void
    {
        $published = $this->statuses->findOneBy(['name' => 'Published']);
        $article->setStatus($published);
    }
}

// If you did hardcode an id, it would still work,
// because fixtures load into an empty database and
// the sequence restarts from 1 every single time.`,
      ts: `<?php
// Drupal: resolve the UUID, never the tid.
// EntityRepositoryInterface is the 'entity.repository' service.
use Drupal\\Core\\Entity\\EntityRepositoryInterface;

final class ArticlePromoter {

  public const PUBLISHED_UUID = '6f8b1c2a-9d43-4f0e-8a71-2b5c9e4d1a30';

  public function __construct(
    private readonly EntityRepositoryInterface $entityRepository,
  ) {}

  public function promote(NodeInterface $node): void {
    $term = $this->entityRepository->loadEntityByUuid(
      'taxonomy_term',
      self::PUBLISHED_UUID,
    );
    if ($term === NULL) {
      // The seed never ran on this environment. Fail loudly
      // in a deploy hook, not silently at request time.
      throw new \\RuntimeException('Status term missing: ' . self::PUBLISHED_UUID);
    }
    $node->set('field_status', $term->id());
  }
}`,
      note:
        "loadEntityByUuid() returns NULL when the entity is absent. Hardcoding a tid works on dev and quietly points at an unrelated term on prod, which is the exact failure the playground below demonstrates.",
    },
    {
      label: "An import you can run more than once",
      intro:
        "Seeding once is easy. Re-importing a feed of 400 product pages on every deploy, without duplicating them, needs a persistent source-to-destination map.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony: an idempotent console command. You own the
// bookkeeping - usually an external_ref column plus an upsert.
#[AsCommand(name: 'app:import:products')]
final class ImportProductsCommand extends Command
{
    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        foreach ($this->feed->rows() as $row) {
            $product = $this->products->findOneBy(['externalRef' => $row['sku']])
                ?? new Product();
            $product->setExternalRef($row['sku']);
            $product->setTitle($row['title']);
            $this->em->persist($product);
        }
        $this->em->flush();
        return Command::SUCCESS;
    }
}

// Second run updates rather than duplicating, because
// externalRef is a unique natural key you remembered
// to add and to index.`,
      ts: `# config/install/migrate_plus.migration.product_pages.yml
# Provided as config by migrate_plus; run with migrate_tools.
# The migrate_plus.migration.<id> prefix marks a config entity, so
# the file belongs in config/install (or config/sync for a
# site-level migration) and only registers on module install or
# drush cim. The alternative is a plain core Migrate plugin at
# migrations/product_pages.yml - no prefix, picked up by drush cr.
id: product_pages
label: 'Product pages from the PIM feed'
migration_tags:
  - content
source:
  plugin: url
  data_fetcher_plugin: file
  data_parser_plugin: json
  urls:
    - 'private://feeds/products.json'
  ids:
    sku:
      type: string
  fields:
    - name: sku
      selector: sku
    - name: title
      selector: title
process:
  title: title
  type:
    plugin: default_value
    default_value: product
destination:
  plugin: 'entity:node'

# drush migrate:import product_pages --update
# migrate_map_product_pages stores sku -> nid, so the
# second run updates the same nodes. Rollback is real:
# drush migrate:rollback product_pages`,
      note:
        "Migrate is the only one of these tools with a built-in map table, which is what makes it re-runnable and rollback-able. That bookkeeping is the feature you are paying the setup cost for.",
    },
    {
      label: "Moving one page to prod, today",
      intro:
        "A marketing page was built on stage and has to reach production before the next full deploy. Neither team should be hand-editing production, but both need an escape hatch.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: there is no first-class answer. In practice:
# dump the rows and their join tables by hand.
mysqldump --no-create-info --where="id=482" \\
  app_prod landing_page > /tmp/page-482.sql

# Then discover the referenced rows the hard way:
#   landing_page_block, media, seo_metadata ...
# and hope the ids on prod are free.

# Which is why most teams do this instead:
php bin/console app:page:clone --from=stage --id=482
# i.e. write a bespoke command, per entity, per project.`,
      ts: `# Drupal, ad-hoc: single_content_sync.
# Export one entity (by ID or UUID) plus its assets to YAML.
drush content:export node ./export-folder \\
  --entities="482" --assets --translate

# Or from the UI, which renders the YAML on screen for
# copy/paste, and import it on the target site at
# /admin/content/import.

# Drupal 11.3 also ships a core exporter, aimed at recipe
# authoring (a PHP script, not a Drush command):
php core/scripts/drupal content:export node 482 \\
  --with-dependencies --dir=recipes/launch/content`,
      note:
        "single_content_sync is editor-facing and ad-hoc by design; the core content:export script exists to author recipe content, not to run on a live site. Both keep UUIDs, which is why the imported page reconnects to the right media and terms.",
    },
  ],

  playground: {
    intro:
      "No Drupal here, just the mechanism: two databases holding the same content under different serial IDs. Watch what happens to a reference carried as an ID versus one carried as a UUID.",
    lang: "php",
    code: `<?php

// A tiny model of "deploying content". Content entities carry a serial ID that
// is local to one database, and a UUID that is the same everywhere.

// Dev: where the four of us authored the content.
$dev = [
  'taxonomy_term' => [
    4 => ['uuid' => 'tt-legal', 'name' => 'Legal'],
    5 => ['uuid' => 'tt-press', 'name' => 'Press'],
  ],
  'node' => [
    11 => ['uuid' => 'nd-privacy', 'title' => 'Privacy policy', 'term_id' => 4],
  ],
];

// Prod: same site, different history, so the serial IDs do not line up.
$prod = [
  'taxonomy_term' => [
    4 => ['uuid' => 'tt-careers', 'name' => 'Careers'],
    5 => ['uuid' => 'tt-legal', 'name' => 'Legal'],
  ],
  'node' => [],
];

function find_by_uuid(array $store, string $type, string $uuid): ?int {
  foreach ($store[$type] as $id => $entity) {
    if ($entity['uuid'] === $uuid) {
      return $id;
    }
  }
  return NULL;
}

function next_id(array $store, string $type): int {
  return $store[$type] ? max(array_keys($store[$type])) + 1 : 1;
}

// The export file records UUIDs, never IDs. Build one from dev.
$export = [];
foreach ($dev['taxonomy_term'] as $entity) {
  $export[] = ['type' => 'taxonomy_term', 'uuid' => $entity['uuid'], 'name' => $entity['name']];
}
foreach ($dev['node'] as $entity) {
  $export[] = [
    'type' => 'node',
    'uuid' => $entity['uuid'],
    'title' => $entity['title'],
    // The reference travels as a UUID...
    'term_uuid' => $dev['taxonomy_term'][$entity['term_id']]['uuid'],
    // ...and here is the same reference as the raw ID, for comparison.
    'term_id_from_dev' => $entity['term_id'],
  ];
}

echo "== Import plan against prod ==\\n";
foreach ($export as $record) {
  $existing = find_by_uuid($prod, $record['type'], $record['uuid']);
  if ($existing !== NULL) {
    printf("  SKIP   %-14s %-12s already present as id %d\\n", $record['type'], $record['uuid'], $existing);
    continue;
  }
  $id = next_id($prod, $record['type']);
  $prod[$record['type']][$id] = ['uuid' => $record['uuid']] + array_diff_key($record, array_flip(['type', 'uuid']));
  printf("  CREATE %-14s %-12s as id %d\\n", $record['type'], $record['uuid'], $id);
}

echo "\\n== Resolving the node's term reference on prod ==\\n";
$node = $export[count($export) - 1];
$byUuid = find_by_uuid($prod, 'taxonomy_term', $node['term_uuid']);
$byId = $node['term_id_from_dev'];
printf("  by UUID %-10s -> term %d (%s)\\n", $node['term_uuid'], $byUuid, $prod['taxonomy_term'][$byUuid]['name']);
printf("  by ID   %-10d -> term %d (%s)\\n", $byId, $byId, $prod['taxonomy_term'][$byId]['name']);
echo "  verdict: " . ($prod['taxonomy_term'][$byId]['uuid'] === $node['term_uuid'] ? "same term" : "WRONG TERM - the ID-based reference silently retargets") . "\\n";

echo "\\n== prod taxonomy_term after import ==\\n";
foreach ($prod['taxonomy_term'] as $id => $entity) {
  printf("  %d => %s (%s)\\n", $id, $entity['name'], $entity['uuid']);
}
`,
    output: `== Import plan against prod ==
  SKIP   taxonomy_term  tt-legal     already present as id 5
  CREATE taxonomy_term  tt-press     as id 6
  CREATE node           nd-privacy   as id 1

== Resolving the node's term reference on prod ==
  by UUID tt-legal   -> term 5 (Legal)
  by ID   4          -> term 4 (Careers)
  verdict: WRONG TERM - the ID-based reference silently retargets

== prod taxonomy_term after import ==
  4 => Careers (tt-careers)
  5 => Legal (tt-legal)
  6 => Press (tt-press)
`,
  },

  keyPoints: [
    "Serial IDs (nid, tid, mid) are local to one database; UUIDs are the only content identifier that survives a trip between environments, which is why Drupal records config-to-content dependencies as ENTITY_TYPE_ID:BUNDLE:UUID.",
    "Menu links, custom block bodies, taxonomy terms and Layout Builder per-node overrides are content entities even though the surrounding structure (system.menu.*, block.block.*, the vocabulary, core.entity_view_display.*) is config.",
    "A recipe's content/ directory holds YAML content files applied through core's Default Content API (Drupal\\Core\\DefaultContent\\Importer, added in 10.3); recipes went stable in 11.1. It seeds a new environment, it is not a sync mechanism.",
    "default_content 1.x exports HAL+JSON, 2.x exports a compact YAML format and still imports the old one; drush dcer walks an entity's references so you do not export a node without its media.",
    "Migrate is the only listed option that is genuinely repeatable: migrate_map_* stores source-id to destination-id, giving you --update and a real migrate:rollback.",
    "Before building any of this, ask whether the thing should have been a config entity: if editors never touch it in production and code references it by name, config is the correct home and the deployment problem disappears.",
  ],

  interview: [
    {
      q: "Why can't you just export content with drush cex like you do config?",
      a: "Because `drush cex` only walks the config storage, and content entities live in their own entity tables, not in `config`. The deeper reason is identity: config objects have a stable string name (`node.type.article`), so an importer can match them across environments, whereas a node's primary key is an auto-increment column that means something different in every database. Content also flows the other way in a normal pipeline (prod down to stage and dev), so a two-way sync would immediately produce conflicts nobody can merge. When content genuinely has to ship, you use a tool that keys on UUID instead of ID, such as a recipe's `content/` directory, the `default_content` module, or the Migrate API.",
    },
    {
      q: "A client edits a menu on dev and the links don't appear on production after deploy. What happened and how do you fix it?",
      a: "Menu links created through the UI are `menu_link_content` entities, which is content, so `drush cex` never captured them. Only the menu itself (`system.menu.main`) and links declared in a module's `*.links.menu.yml` file deploy as code or config. The honest fixes are: declare the links in a module's `.links.menu.yml` if they are structural and permanent; ship them as default content in a recipe or module if the site needs them seeded once; or create them in a `hook_update_N`/deploy hook guarded by a UUID lookup so re-running is safe. The same trap catches custom block bodies, taxonomy terms and Layout Builder overrides, so it is worth naming those in the same breath.",
    },
    {
      q: "How does this compare with Doctrine fixtures in Symfony?",
      a: "Conceptually it is the same idea - a dataset that ships with the code so any environment can be brought to a known state. The difference is where they run and what identity problem they face. `doctrine:fixtures:load` purges the tables and loads into an empty database, so sequences restart and in-run references (`addReference`/`getReference`) are enough; you never point it at production. Drupal's default content is imported into a live database that already has content, so the importer has to match on UUID and decide whether an entity already exists. That is why Drupal's content files carry an explicit UUID in their `_meta` block and Doctrine fixtures do not need one.",
    },
    {
      q: "When would you choose Migrate over default content for shipping content?",
      a: "Choose default content when the dataset is fixed and you need it once per environment - eight workflow terms, a legal footer block, demo content for a fresh install. Choose Migrate when the import is repeatable or driven by an external source: a product feed, a legacy database, anything that will be re-run as the source changes. Migrate's `migrate_map_*` table records the source-id to destination-id mapping, which is what makes `drush migrate:import --update` update rather than duplicate and makes `drush migrate:rollback` possible. The cost is setup: source, process and destination plugins plus `migrate_plus`/`migrate_tools` for config-based migrations and the Drush commands.",
    },
  ],

  quiz: [
    {
      question:
        "A config entity needs to depend on a specific custom block body. How does Drupal record that dependency?",
      options: [
        "As the block_content entity's numeric ID under dependencies.content",
        "As ENTITY_TYPE_ID:BUNDLE:UUID under dependencies.content",
        "As a module dependency on block_content",
        "It cannot; config entities may only depend on other config entities",
      ],
      answerIndex: 1,
      explain:
        "Config-to-content dependencies use the format ENTITY_TYPE_ID:BUNDLE:UUID (for example block_content:basic:6f8b1c2a-...), because the UUID is the only identifier that is the same in every database. A placed custom block's plugin id follows the same idea: block_content:<uuid>.",
    },
    {
      question:
        "Which of these is a config entity that will travel through drush cex/cim?",
      options: [
        "A menu link created at /admin/structure/menu",
        "A taxonomy term in the Tags vocabulary",
        "The Tags vocabulary itself",
        "A Layout Builder override on a single node",
      ],
      answerIndex: 2,
      explain:
        "The vocabulary (taxonomy.vocabulary.tags) is a config entity. The terms inside it are content, as are UI-created menu links (menu_link_content) and per-node Layout Builder overrides, which are stored in the node's layout_builder__layout field.",
    },
    {
      question:
        "You must re-import a 400-row product feed on every deploy without creating duplicates. Which tool is built for this?",
      options: [
        "The Migrate API, because migrate_map_* stores source-id to destination-id",
        "A recipe's content/ directory, because recipes can be re-applied",
        "single_content_sync, because it exports YAML",
        "default_content, because drush dcer follows references",
      ],
      answerIndex: 0,
      explain:
        "Only Migrate keeps a persistent map table, which is what gives you drush migrate:import --update and drush migrate:rollback. Recipes and default_content are designed to seed an environment once; single_content_sync is for ad-hoc, one-entity moves.",
    },
    {
      question:
        "Your team keeps hand-rolling a content deployment for a fixed list of eight statuses that editors never change and that Views filters reference by name. What is the better fix?",
      options: [
        "Write a hook_update_N that recreates the terms on every deploy",
        "Sync the production database down before every release",
        "Model the statuses as a config entity type so they deploy with cex/cim",
        "Store the term IDs in settings.php per environment",
      ],
      answerIndex: 2,
      explain:
        "If the set is finite, editors do not own it, and code or config references it by name, it is structure rather than content. Modelling it as a config entity puts it in the config export and removes the identity problem entirely.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "install-uninstall-schema",
  title: "Install, Uninstall & Custom Tables: the .install File",
  part: "Data, State & Background Work",
  estMinutes: 12,
  summary:
    "Give incident_tracker a real lifecycle: hook_schema declares an incident_log table that Drupal creates at install and drops at uninstall, hook_install/hook_uninstall seed and clean up runtime leftovers, and hook_requirements guards installation — a discipline Symfony bundles never ask of you.",

  concept: `
## The .install file: code with a lifecycle

Symfony bundles are just code: you \`composer require\` them, they register
services, done. A Drupal module has a **lifecycle** — install, update,
uninstall — and \`incident_tracker.install\` is where it lives. The file sits
next to the \`.module\` file and is loaded only when needed (install,
uninstall, \`drush updb\`), so it costs nothing on normal requests. Everything
in it stays **procedural in both Drupal 10 and 11** — the OOP \`#[Hook]\`
classes of 11.1+ can't take these hooks over, because during install/uninstall
your module's classes and services aren't reliably available yet.

## hook_schema: tables you declare, not create

\`incident_tracker_schema()\` returns a spec array describing tables; Drupal's
Schema API renders it as DDL for MySQL, PostgreSQL or SQLite. Fields use
abstract types (\`serial\`, \`varchar\` / \`varchar_ascii\`, \`int\`, \`text\`)
with \`length\`, \`unsigned\`, \`not null\`, \`default\`; the spec also declares
\`primary key\`, \`indexes\` and \`unique keys\`. The payoff is automation:
**every declared table is created when the module is installed and dropped when
it's uninstalled**. You never write the equivalent of a Doctrine migration's
\`down()\`.

### Raw table or content entity?

Ask what you need *around* the data:

- **Content entity** — CRUD forms, Field UI, Views, access control, revisions,
  translation and JSON:API arrive essentially free. Right for data humans edit.
- **hook_schema table** — one lean table, cheap bulk inserts and deletes,
  nothing else. Right for high-volume, append-only, machine-written rows:
  audit trails, metrics, and our \`incident_log\`, which cron will later purge
  by the thousands. (Views over a raw table means writing
  \`hook_views_data()\` yourself.)

## hook_install and hook_uninstall

\`incident_tracker_install(bool $is_syncing)\` runs once, after the schema
tables exist and \`config/install\` has been imported. Use it for what YAML
can't express: seeding **State** (environment-specific runtime values that are
never exported), \`module_set_weight()\` so your hooks run after other
modules', a welcome message. Skip user-facing side effects when
\`$is_syncing\` is TRUE — that means \`drush cim\` is installing the module on
a deploy target.

\`hook_uninstall\` is the discipline Symfony never demands: \`composer remove\`
deletes code but leaves Doctrine tables, migration rows and cached data behind
forever. A Drupal module must leave **no trace**. Much is automatic — your
hook_schema tables are dropped and the config you own is deleted. The rest is
on you: delete State keys, purge queues
(\`\\Drupal::queue('...')->deleteQueue()\`), remove files you wrote.

## hook_requirements: guards and the status report

\`hook_requirements($phase)\` serves three phases. At \`'install'\`, returning
an item with \`REQUIREMENT_ERROR\` **blocks installation** — check PHP
extensions or companion modules here, not your own tables or services, which
don't exist yet. At \`'runtime'\`, each item becomes a row on
\`/admin/reports/status\` with \`title\`, \`value\`, \`description\` and a
severity (\`REQUIREMENT_OK\` / \`WARNING\` / \`ERROR\` / \`INFO\` — deprecated in
11.2 and removed in 12 in favour of the \`RequirementSeverity\` enum
(\`RequirementSeverity::Error\` etc.), though the constants still work across
D10 and D11). At
\`'update'\` it can halt \`drush updb\`. Drupal 11.2 adds OOP-friendly
\`hook_runtime_requirements()\` and \`hook_update_requirements()\` for the last
two phases, plus a class-based option for \`'install'\` — a Requirements class
in \`src/Install/Requirements\` implementing \`InstallRequirementsInterface\` —
and 11.3 deprecates \`hook_requirements()\` itself for all phases. Across both
Drupal 10 and 11, though, \`hook_requirements()\` remains the one way that
covers all three.
`,

  comparisons: [
    {
      label: "Declaring the incident_log table",
      intro:
        "Both describe a table in PHP — but Doctrine migrations run at deploy time, detached from the bundle's presence, while a hook_schema spec is bound to the module: install creates it, uninstall drops it.",
      php: `<?php
// Symfony: Doctrine owns schema. You change an entity, generate a
// migration, and deploys run doctrine:migrations:migrate. Removing
// the bundle later does NOT reverse this — down() is only for
// rollbacks you trigger yourself.
declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\\DBAL\\Schema\\Schema;
use Doctrine\\Migrations\\AbstractMigration;

final class Version20260807120000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $table = $schema->createTable('incident_log');
        $table->addColumn('id', 'integer', ['autoincrement' => true, 'unsigned' => true]);
        $table->addColumn('severity', 'string', ['length' => 32]);
        $table->addColumn('message', 'string', ['length' => 255]);
        $table->addColumn('details', 'text', ['notnull' => false]);
        $table->addColumn('created', 'integer', ['unsigned' => true]);
        $table->setPrimaryKey(['id']);
        $table->addIndex(['severity', 'created'], 'idx_severity_created');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('incident_log');
    }
}`,
      ts: `<?php
/**
 * @file
 * Install, update and uninstall functions for incident_tracker.
 */

/**
 * Implements hook_schema().
 */
function incident_tracker_schema(): array {
  $schema['incident_log'] = [
    'description' => 'Raw incident log entries (high-volume, append-only).',
    'fields' => [
      'id' => [
        'type' => 'serial',
        'unsigned' => TRUE,
        'not null' => TRUE,
        'description' => 'Primary key.',
      ],
      'severity' => [
        'type' => 'varchar_ascii',
        'length' => 32,
        'not null' => TRUE,
        'default' => 'notice',
        'description' => 'Severity: notice, warning or critical.',
      ],
      'message' => [
        'type' => 'varchar',
        'length' => 255,
        'not null' => TRUE,
        'description' => 'One-line incident summary.',
      ],
      'details' => [
        'type' => 'text',
        'not null' => FALSE,
        'description' => 'Optional long description.',
      ],
      'created' => [
        'type' => 'int',
        'unsigned' => TRUE,
        'not null' => TRUE,
        'default' => 0,
        'description' => 'Unix timestamp when the incident was logged.',
      ],
    ],
    'primary key' => ['id'],
    'indexes' => [
      'severity_created' => ['severity', 'created'],
      'created' => ['created'],
    ],
  ];
  return $schema;
}`,
      note:
        "The spec is engine-agnostic (MySQL/PostgreSQL/SQLite) and Drupal runs the create/drop for you at install/uninstall. varchar_ascii suits machine names like severity — smaller, byte-exact indexes.",
    },
    {
      label: "First-run setup: hook_install",
      intro:
        "Symfony has no 'bundle was installed' moment — one-time setup is a console command someone must remember to run. Drupal calls hook_install for you, exactly once, at the right time.",
      php: `<?php
// Symfony: a one-off console command (or deploy script). Nothing in
// the framework guarantees it runs, runs once, or runs before the
// bundle's routes go live.
namespace App\\Command;

use Doctrine\\DBAL\\Connection;
use Symfony\\Component\\Console\\Attribute\\AsCommand;
use Symfony\\Component\\Console\\Command\\Command;
use Symfony\\Component\\Console\\Input\\InputInterface;
use Symfony\\Component\\Console\\Output\\OutputInterface;

#[AsCommand(name: 'app:incident:setup', description: 'One-time setup')]
class IncidentSetupCommand extends Command
{
    public function __construct(private Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        // Seed a marker row — and hope nobody runs this twice.
        $this->db->insert('app_runtime_flags', [
            'name'  => 'incident_setup_at',
            'value' => (string) time(),
        ]);
        return Command::SUCCESS;
    }
}`,
      ts: `<?php
// incident_tracker.install — Drupal invokes this exactly once, right
// after the hook_schema tables exist and config/install is imported.

/**
 * Implements hook_install().
 */
function incident_tracker_install(bool $is_syncing): void {
  // Seed STATE — environment-specific runtime values. Unlike config,
  // state is never exported to YAML, so it belongs here rather than
  // in config/install.
  \\Drupal::state()->set(
    'incident_tracker.last_cleanup',
    \\Drupal::time()->getRequestTime(),
  );

  // Run our hook implementations after most modules' (default 0).
  module_set_weight('incident_tracker', 5);

  // $is_syncing is TRUE when 'drush cim' installs the module as part
  // of a config import on a deploy target — stay quiet there.
  if (!$is_syncing) {
    \\Drupal::messenger()->addStatus(t('Incident Tracker installed.'));
  }
}`,
      note:
        "The bool $is_syncing parameter (Drupal 9.1+, so both 10 and 11) tells you config synchronization triggered the install. Config defaults still come from config/install YAML — hook_install is for state, weights and side effects.",
    },
    {
      label: "Uninstall: leave no trace",
      intro:
        "Removing a Symfony bundle removes code only — its tables and data are orphaned forever. Drupal gives you an uninstall phase and expects you to use it.",
      leftLang: "bash",
      php: `# Symfony: removing a bundle removes CODE, nothing else.
composer remove acme/incident-bundle

# Left behind on every environment, until someone cleans it by hand:
#   - the incident_log table (nobody runs the migrations' down())
#   - the bundle's rows in doctrine_migration_versions
#   - messenger queue rows, cache pool entries, uploaded files
#
# There is no uninstall lifecycle to hook into. Bundle docs just say
# "also drop these tables" and hope.`,
      ts: `<?php
/**
 * Implements hook_uninstall().
 */
function incident_tracker_uninstall(bool $is_syncing): void {
  // Automatic, no code needed here:
  //   - every hook_schema() table (incident_log) is DROPPED
  //   - config this module owns (incident_tracker.settings) is DELETED
  //
  // Manual: everything else the module scattered around at runtime.
  \\Drupal::state()->deleteMultiple([
    'incident_tracker.last_cleanup',
    'incident_tracker.last_cron',
  ]);

  // Purge queued-but-unprocessed notification items (queues live in
  // the 'queue' table, keyed by name — they are not schema tables).
  \\Drupal::queue('incident_tracker_notify')->deleteQueue();
}

// Verify the discipline:
//   drush pm:uninstall incident_tracker
//   drush sql:query "SHOW TABLES LIKE 'incident_log'"   -> empty
//   drush state:get incident_tracker.last_cleanup       -> empty`,
      note:
        "hook_uninstall runs BEFORE the schema tables are dropped, so you can still query incident_log here (e.g. to archive rows). 'Leaves no trace' is the contrib-quality bar: a reinstall must behave like a first install.",
    },
    {
      label: "Environment guards: hook_requirements",
      intro:
        "Symfony apps hand-roll health endpoints; Drupal ships a status report and an install-time gate that every module can plug into with one hook.",
      php: `<?php
// Symfony: no built-in status page, no install-time gate. You write a
// health check endpoint and point monitoring at it.
namespace App\\Controller;

use Symfony\\Component\\HttpFoundation\\JsonResponse;
use Symfony\\Component\\Routing\\Attribute\\Route;

class HealthController
{
    #[Route('/healthz', name: 'app_healthz')]
    public function __invoke(): JsonResponse
    {
        $problems = [];
        if (!extension_loaded('curl')) {
            $problems[] = 'curl extension missing';
        }
        return new JsonResponse(
            ['status' => $problems ? 'degraded' : 'ok'],
            $problems ? 503 : 200,
        );
    }
}`,
      ts: `<?php
/**
 * Implements hook_requirements().
 */
function incident_tracker_requirements(string $phase): array {
  $requirements = [];

  // Install-time guard: REQUIREMENT_ERROR here BLOCKS installation.
  // Only environment checks — our tables/services don't exist yet.
  if ($phase === 'install' && !extension_loaded('curl')) {
    $requirements['incident_tracker_curl'] = [
      'title' => t('Incident Tracker'),
      'description' => t('The curl PHP extension is required to deliver incident webhooks.'),
      'severity' => REQUIREMENT_ERROR,
    ];
  }

  // Runtime: one row on /admin/reports/status.
  if ($phase === 'runtime') {
    $count = (int) \\Drupal::database()
      ->select('incident_log', 'il')
      ->countQuery()->execute()->fetchField();
    $requirements['incident_tracker_log'] = [
      'title' => t('Incident Tracker log'),
      'value' => t('@count incidents stored', ['@count' => $count]),
      'severity' => $count > 100000 ? REQUIREMENT_WARNING : REQUIREMENT_OK,
    ];
    if ($count > 100000) {
      $requirements['incident_tracker_log']['description'] =
        t('Consider lowering the retention period in the settings form.');
    }
  }

  return $requirements;
}`,
      note:
        "Severities: REQUIREMENT_INFO / OK / WARNING / ERROR — these constants are deprecated in Drupal 11.2 (removed in 12) in favour of the \\Drupal\\Core\\Extension\\Requirement\\RequirementSeverity enum (RequirementSeverity::Error etc.), but they still work across D10 and D11. Drupal 11.2 adds hook_runtime_requirements()/hook_update_requirements() (OOP #[Hook]-capable) plus an InstallRequirementsInterface class in src/Install/Requirements for the install phase; hook_requirements() itself is deprecated in 11.3 but remains the cross-version (D10+D11) way to do all three.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A miniature ModuleInstaller: hook_schema tables created at install and dropped at uninstall, with hook_install/hook_uninstall dispatched by function name — the actual mechanism. Predict the console output, then run.",
    code: `<?php
// Simulate what ModuleInstaller does with incident_tracker.install:
// INSTALL  = create every hook_schema() table, then run hook_install().
// UNINSTALL = run hook_uninstall(), then drop the hook_schema() tables.
// Goal of a well-behaved module: leave NO trace.

$database = [];   // table name => spec (stands in for MySQL/Postgres/SQLite)
$state    = [];   // Drupal's State API key/value store

// ---- contents of incident_tracker.install (simplified) ----------------

function incident_tracker_schema(): array {
    return [
        'incident_log' => [
            'fields' => [
                'id'       => ['type' => 'serial', 'unsigned' => true],
                'severity' => ['type' => 'varchar_ascii', 'length' => 32],
                'message'  => ['type' => 'varchar', 'length' => 255],
                'created'  => ['type' => 'int', 'unsigned' => true],
            ],
            'primary key' => ['id'],
            'indexes' => ['severity_created' => ['severity', 'created']],
        ],
    ];
}

function incident_tracker_install(bool $is_syncing): void {
    global $state;
    $state['incident_tracker.last_cleanup'] = 1754870400;
    echo "  hook_install: seeded state incident_tracker.last_cleanup\\n";
    if (!$is_syncing) {
        echo "  hook_install: status message shown (skipped during config sync)\\n";
    }
}

function incident_tracker_uninstall(bool $is_syncing): void {
    global $state;
    foreach (array_keys($state) as $key) {
        if (str_starts_with($key, 'incident_tracker.')) {
            unset($state[$key]);
            echo "  hook_uninstall: deleted state $key\\n";
        }
    }
}

// ---- a miniature ModuleInstaller --------------------------------------

function module_install(string $module): void {
    global $database;
    echo "Installing $module\\n";
    $hook = $module . '_schema';                 // hook = MODULE_schema()
    if (function_exists($hook)) {
        foreach ($hook() as $table => $spec) {
            $database[$table] = $spec;           // CREATE TABLE, automatically
            $cols = implode(', ', array_keys($spec['fields']));
            echo "  created table $table ($cols)\\n";
        }
    }
    $hook = $module . '_install';
    if (function_exists($hook)) {
        $hook(false);                            // $is_syncing = FALSE here
    }
}

function module_uninstall(string $module): void {
    global $database;
    echo "Uninstalling $module\\n";
    $hook = $module . '_uninstall';              // module cleans up first...
    if (function_exists($hook)) {
        $hook(false);
    }
    $hook = $module . '_schema';                 // ...then tables are dropped
    if (function_exists($hook)) {
        foreach (array_keys($hook()) as $table) {
            unset($database[$table]);
            echo "  dropped table $table\\n";
        }
    }
}

module_install('incident_tracker');
echo "\\ntables now:  " . implode(', ', array_keys($database)) . "\\n";
echo "state keys:  " . implode(', ', array_keys($state)) . "\\n\\n";

module_uninstall('incident_tracker');
echo "\\ntables left: " . count($database) . ", state keys left: " . count($state) . "\\n";
echo "No trace left - the site is exactly as it was before install.";`,
    output: `Installing incident_tracker
  created table incident_log (id, severity, message, created)
  hook_install: seeded state incident_tracker.last_cleanup
  hook_install: status message shown (skipped during config sync)

tables now:  incident_log
state keys:  incident_tracker.last_cleanup

Uninstalling incident_tracker
  hook_uninstall: deleted state incident_tracker.last_cleanup
  dropped table incident_log

tables left: 0, state keys left: 0
No trace left - the site is exactly as it was before install.`,
  },

  keyPoints: [
    "incident_tracker.install is loaded only during install/uninstall/updates, and its hooks stay procedural in Drupal 10 AND 11 — the OOP #[Hook] classes can't take over lifecycle hooks because the module isn't fully wired up when they run.",
    "hook_schema() declares tables as spec arrays (serial/varchar/varchar_ascii/int/text fields, 'primary key', 'indexes', 'unique keys'); Drupal creates them automatically at install and drops them at uninstall, on any supported database engine.",
    "Pick a content entity when you want forms, Field UI, Views, access control, revisions and JSON:API for free; pick a raw hook_schema table for high-volume, append-only, machine-written data like incident_log.",
    "hook_install(bool $is_syncing) seeds State and does one-time setup (module_set_weight, messages); config defaults come from config/install YAML, not code — and $is_syncing lets you stay quiet during drush cim deploys.",
    "Uninstall must leave no trace: schema tables and module-owned config are removed automatically, but State keys, queues (deleteQueue()) and files you wrote must be cleaned up in hook_uninstall — which runs before the tables are dropped.",
    "hook_requirements($phase) blocks installation with REQUIREMENT_ERROR at the 'install' phase and feeds /admin/reports/status at 'runtime'; Drupal 11.2 adds OOP hook_runtime_requirements()/hook_update_requirements() for the non-install phases.",
  ],

  interview: [
    {
      q: "You need to store data in a custom Drupal module — when do you use hook_schema instead of a content entity?",
      a: "It's the same judgment call as raw DBAL versus a Doctrine entity, but with higher stakes because Drupal entities bring so much: CRUD forms, Field UI, Views integration, access control, revisions, translation and JSON:API essentially free. If humans create and edit the records, define a content entity. A `hook_schema` table wins for high-volume, append-only, machine-written data — audit logs, metrics, something like an `incident_log` that gets thousands of inserts and bulk purges from cron — because it's one lean table with none of the entity system's write overhead. The cost is that you write your own queries, access logic and `hook_views_data()` if Views needs it. Declaring it in `hook_schema` also buys lifecycle automation: the table is created at install and dropped at uninstall without any migration code.",
    },
    {
      q: "What happens automatically when a Drupal module is uninstalled, and what must you do yourself?",
      a: "Automatic: every table declared in `hook_schema()` is dropped, all config the module owns (its `config/install` objects, plus things like field storage it defined) is deleted, and its routes, permissions and services disappear on the container rebuild. Manual, in `hook_uninstall()`: State entries the module set, queue items (`\\Drupal::queue('...')->deleteQueue()`), files it wrote, and any third-party settings it added to other modules' config. `hook_uninstall` runs *before* the schema tables are dropped, so you can still read `incident_log` to archive rows. The contrast with Symfony is stark — `composer remove` deletes code and orphans the Doctrine tables and migration rows forever — and it's why 'uninstall leaves no trace' is a hard quality bar for Drupal contrib modules.",
    },
    {
      q: "How would you prevent your module from being installed on an environment that can't support it?",
      a: "Implement `hook_requirements()` in the `.install` file and handle the `'install'` phase: return a requirement with `'severity' => REQUIREMENT_ERROR` and a `description`, and Drupal refuses to install the module, showing your message. Only check environment-level facts there — PHP extensions, companion modules, reachable services — because your own tables, config and services don't exist yet during that phase. The same hook's `'runtime'` phase adds rows to `/admin/reports/status` (title, value, severity) for ongoing health, and `'update'` can halt `drush updb`. In Drupal 11.2+ the runtime and update phases have OOP replacements, `hook_runtime_requirements()` and `hook_update_requirements()`, and the install phase gains a class-based alternative — a Requirements class in `src/Install/Requirements` implementing `InstallRequirementsInterface`. Drupal 11.3 deprecates `hook_requirements()` for all phases, but it remains the approach that works across both Drupal 10 and 11.",
    },
  ],

  quiz: [
    {
      question:
        "Where does the code that creates the incident_log table at module install actually live?",
      options: [
        "In hook_install(), which must call \\Drupal::database()->schema()->createTable()",
        "Nowhere — the table is declared in hook_schema() and Drupal creates it automatically at install (and drops it at uninstall)",
        "In an update hook that runs on the first drush updb after enabling",
        "The table is created lazily on the first insert",
      ],
      answerIndex: 1,
      explain:
        "hook_schema() is declarative: return the spec array and the module installer creates every declared table during install and drops them all at uninstall. createTable() is only needed when adding a table to an already-installed module via an update hook — which is next section's topic.",
    },
    {
      question:
        "Which of these must incident_tracker clean up ITSELF in hook_uninstall()?",
      options: [
        "The incident_log table defined in hook_schema()",
        "The incident_tracker.settings config shipped in config/install",
        "State keys like incident_tracker.last_cleanup and queued items in its queue",
        "Its routes and menu links from the YAML files",
      ],
      answerIndex: 2,
      explain:
        "Schema tables, module-owned config, routes and menu links are all removed automatically when the module is uninstalled. State entries, queue items, and files the module wrote are runtime leftovers Drupal can't attribute to the module — deleting them in hook_uninstall() is your job.",
    },
    {
      question:
        "hook_requirements() returns an item with severity REQUIREMENT_ERROR during the 'install' phase. What happens?",
      options: [
        "The module installs but a warning appears on /admin/reports/status",
        "Installation is blocked and the requirement's description is shown to the user",
        "The module installs in a disabled state until the requirement passes",
        "Nothing — the install phase only supports REQUIREMENT_WARNING",
      ],
      answerIndex: 1,
      explain:
        "An ERROR-severity requirement at the 'install' phase is a gate: Drupal's module install UI refuses to install the module and surfaces your description. Note drush pm:install only logs the error and prompts \"The <module> module's install requirements failed. Do you wish to continue?\" (and proceeds under -y), so an install-phase gate is not a hard guarantee on the CLI. Either way, install-phase checks must test the environment (PHP extensions, other modules) rather than the module's own not-yet-existing tables or services.",
    },
  ],
};

export default lesson;

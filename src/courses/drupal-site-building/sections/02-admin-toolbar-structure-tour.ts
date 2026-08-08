import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "admin-toolbar-structure-tour",
  title: "Finding Your Way: The Admin Toolbar & Structure",
  part: "The Site-Builder Mindset",
  estMinutes: 10,
  summary:
    "A guided tour of the admin toolbar — Structure, Configuration, Extend, Appearance, People, Reports — mapping each section to the Symfony concept it replaces.",

  concept: `
## Seven doors, one habit to unlearn

Log in as an administrator and Drupal's toolbar shows seven top-level sections.
Every one of them replaces something you'd otherwise do in code, a terminal, or
a YAML file in Symfony. Learn the map once and you'll stop hunting:

- **Content** (\`/admin/content\`) — the rows: nodes, media, files. This is
  *data*, the one section that is NOT config.
- **Structure** (\`/admin/structure\`) — the schema and wiring. Content types,
  fields, block layout, menus, taxonomy vocabularies, Views, and display modes.
  This is where the Doctrine entities, FormTypes, controllers, and Twig loops
  you keep wanting to write actually get *built* — by clicking.
- **Appearance** (\`/admin/appearance\`) — themes: which one is active, its
  settings. Roughly "which \`templates/\` layer renders the site".
- **Extend** (\`/admin/modules\`) — install/uninstall modules. Composer still
  downloads the code, but *enabling* it happens here (or \`drush pm:enable\`) —
  the moral equivalent of registering a bundle in \`config/bundles.php\`. The
  on/off list is itself config (\`core.extension.yml\`).
- **Configuration** (\`/admin/config\`) — the sprawling equivalent of
  \`config/packages/*.yaml\` plus \`.env\`: site name and front page, performance
  and caching, text formats, URL aliases, regional/language settings, media
  settings, logging. Grouped by topic (System, Media, Search and metadata,
  Development, Regional and language...). Almost every form here saves a config
  object you can export.
- **People** (\`/admin/people\`) — users, roles, and the permissions grid at
  \`/admin/people/permissions\`. What \`security.yaml\` role hierarchies and
  voters do in Symfony, expressed as checkboxes — and exported as
  \`user.role.*.yml\`.
- **Reports** (\`/admin/reports\`) — observability. **Status report**
  (\`/admin/reports/status\`) is a one-page health check: PHP and DB versions,
  cron, security updates, file permissions. **Recent log messages**
  (\`/admin/reports/dblog\`) is the database log — your stand-in for tailing
  \`var/log/dev.log\` or opening the Symfony profiler.

## Three routes to memorize

You will type these constantly: \`/admin/structure\` (build things),
\`/admin/config\` (tune things), \`/admin/reports/status\` (check things). When
lost, \`/admin/index\` lists every admin page.

## The near-universal first install: Admin Toolbar

Core's toolbar makes you click *into* each section to see what's inside. The
contrib **Admin Toolbar** module (\`composer require drupal/admin_toolbar\`,
then enable \`admin_toolbar\` and \`admin_toolbar_tools\` on the Extend page)
turns it into hover-to-open drop-down menus reaching every page in two moves,
and adds shortcuts like "Flush all caches". Enable its \`admin_toolbar_search\`
submodule too and the toolbar gains a search box that finds admin pages by
name. It's on virtually every real Drupal site — install it first, on every
project.

## Why the tour matters

Everything under Structure, Configuration, and People produces **exportable
config**. The toolbar isn't just navigation — it's the IDE for the half of the
application that lives as data. The rest of this course is essentially a deep
dive into individual doors of this toolbar.
`,

  comparisons: [
    {
      label: "Enabling functionality: Extend vs bundles.php",
      intro:
        "You need logging/toolbar functionality the framework doesn't ship enabled. In Symfony that's composer + bundle registration in code; in Drupal composer fetches the code but the Extend page turns it on — and that on/off state is config.",
      php: `// Symfony: composer require symfony/monolog-bundle, then Flex
// registers MonologBundle in config/bundles.php — PHP, committed to git:
return [
    Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
    Symfony\\Bundle\\TwigBundle\\TwigBundle::class => ['all' => true],
    Symfony\\Bundle\\MonologBundle\\MonologBundle::class => ['all' => true],
    // every enabled bundle is a line of PHP in the repo
];`,
      ts: `# Drupal: composer require drupal/admin_toolbar   (code on disk)
# Then ENABLE it in the UI:
#   Extend (/admin/modules) > check "Admin Toolbar"
#   and "Admin Toolbar Extra Tools" > Install
# The enabled-module list is itself config. drush cex exports:
# --- core.extension.yml ---
module:
  admin_toolbar: 0
  admin_toolbar_tools: 0
  node: 0
  views: 0
theme:
  claro: 0
  olivero: 0
profile: standard`,
      note:
        "Composer gets code onto disk; Extend (or drush pm:enable) turns it on. The on/off state deploys as core.extension.yml via config import — not as a code change.",
    },
    {
      label: "Site-wide settings",
      intro:
        "Site name, contact email, and which page is the homepage. Symfony scatters this across parameters, .env, and a route attribute; Drupal has one form whose Save button writes one config object.",
      php: `# Symfony: parameters + env vars, edited in the repo.
# config/services.yaml
parameters:
  app.site_name: 'Acme Intranet'
  app.support_email: 'help@acme.test'

# ...and the homepage is a route in code:
#   #[Route('/', name: 'front')]
#   public function front(): Response { ... }`,
      ts: `# Drupal: Configuration > System > Basic site settings
#   (/admin/config/system/site-information)
# Fill the form, Save. drush cex exports:
# --- system.site.yml (excerpt) ---
name: 'Acme Intranet'
mail: help@acme.test
slogan: ''
page:
  403: ''
  404: ''
  front: /node/1`,
      note:
        "One admin form = one config object (system.site). Even 'which page is the front page' is config data, not a route you author.",
      leftLang: "yaml",
    },
    {
      label: "Reading the logs",
      intro:
        "Something 500'd on staging. In Symfony you tail a log file or open the profiler; in Drupal the dblog module writes to the database and Reports gives you a filterable UI.",
      php: `# Symfony: logs are files + the web profiler.
tail -f var/log/dev.log
# prod: whatever handlers config/packages/monolog.yaml wires up
# per-request detail: the profiler at /_profiler`,
      ts: `# Drupal: Reports > Recent log messages (/admin/reports/dblog)
# dblog logs to the DB — filter by severity/type in the UI.
drush watchdog:show                    # alias: drush ws
drush watchdog:show --severity=Error
# Retention is (of course) config: the form at
# /admin/config/development/logging exports
# dblog.settings.yml  (row_limit: 1000)`,
      note:
        "dblog is browsable by non-devs and needs zero shell access — but it's capped (row_limit) and DB-backed. For serious ops, enable syslog and ship files, just like prod monolog.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Health check: Status report",
      intro:
        "Is this environment sane — PHP version, DB, cron, pending updates? Symfony makes you assemble that picture from several commands; Drupal renders it as one admin page.",
      php: `# Symfony: assemble the picture yourself.
php bin/console about          # kernel, env, PHP version
php bin/console debug:dotenv   # which env vars won
composer outdated              # library updates
# security advisories: composer audit`,
      ts: `# Drupal: Reports > Status report (/admin/reports/status)
# One page: PHP & DB versions, trusted hosts, cron last run,
# security updates, file-system permissions, config overrides.
drush core:requirements        # the same checks, from the CLI
drush core:status              # env summary (drush status)`,
      note:
        "First stop on any unfamiliar Drupal site: /admin/reports/status. Errors and warnings are triaged for you — check it before debugging anything else.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The admin toolbar as a lookup table: each section mapped to its route, its Symfony equivalent, and what's inside. Predict the cheat sheet this prints, then run it.",
    code: `<?php
// The admin toolbar as a lookup table: where does a Symfony
// habit send you in Drupal's UI? Predict the cheat sheet.

$toolbar = [
    'Structure' => [
        'path'    => '/admin/structure',
        'symfony' => 'the entities, FormTypes & controllers you no longer write',
        'inside'  => ['Content types', 'Block layout', 'Menus', 'Taxonomy', 'Views', 'Display modes'],
    ],
    'Configuration' => [
        'path'    => '/admin/config',
        'symfony' => 'config/packages/*.yaml + .env',
        'inside'  => ['Basic site settings', 'Performance', 'URL aliases', 'Regional and language'],
    ],
    'Extend' => [
        'path'    => '/admin/modules',
        'symfony' => 'composer require + bundles.php',
        'inside'  => ['Install / uninstall modules'],
    ],
    'Appearance' => [
        'path'    => '/admin/appearance',
        'symfony' => 'choosing the templates/ layer',
        'inside'  => ['Themes', 'Theme settings'],
    ],
    'People' => [
        'path'    => '/admin/people',
        'symfony' => 'security.yaml roles + voters',
        'inside'  => ['Users', 'Roles', 'Permissions'],
    ],
    'Reports' => [
        'path'    => '/admin/reports',
        'symfony' => 'profiler + var/log/dev.log',
        'inside'  => ['Status report', 'Recent log messages'],
    ],
];

foreach ($toolbar as $section => $info) {
    echo $section . '  (' . $info['path'] . ")\\n";
    echo '  ~ Symfony: ' . $info['symfony'] . "\\n";
    echo '  contains: ' . implode(', ', $info['inside']) . "\\n";
}

// A developer's first week, as a route table.
$tasks = [
    'add a field to Article'  => '/admin/structure/types/manage/article/fields',
    'see why cron failed'     => '/admin/reports/dblog',
    'check PHP + DB versions' => '/admin/reports/status',
];

echo "\\nTask router:\\n";
foreach ($tasks as $task => $path) {
    echo '  ' . str_pad($task, 26) . '-> ' . $path . "\\n";
}`,
    output: `Structure  (/admin/structure)
  ~ Symfony: the entities, FormTypes & controllers you no longer write
  contains: Content types, Block layout, Menus, Taxonomy, Views, Display modes
Configuration  (/admin/config)
  ~ Symfony: config/packages/*.yaml + .env
  contains: Basic site settings, Performance, URL aliases, Regional and language
Extend  (/admin/modules)
  ~ Symfony: composer require + bundles.php
  contains: Install / uninstall modules
Appearance  (/admin/appearance)
  ~ Symfony: choosing the templates/ layer
  contains: Themes, Theme settings
People  (/admin/people)
  ~ Symfony: security.yaml roles + voters
  contains: Users, Roles, Permissions
Reports  (/admin/reports)
  ~ Symfony: profiler + var/log/dev.log
  contains: Status report, Recent log messages

Task router:
  add a field to Article    -> /admin/structure/types/manage/article/fields
  see why cron failed       -> /admin/reports/dblog
  check PHP + DB versions   -> /admin/reports/status`,
  },

  keyPoints: [
    "Structure (/admin/structure) is where a site builder does what you'd code in Symfony: content types, fields, block layout, menus, taxonomy, Views, display modes.",
    "Configuration (/admin/config) is config/packages + .env as clickable forms, grouped by topic — nearly every Save writes an exportable config object.",
    "Extend (/admin/modules) enables modules Composer downloaded — the bundles.php step as a UI — and the enabled list itself deploys as core.extension.yml.",
    "People (/admin/people) holds users, roles, and the permissions grid; roles and their permissions export as user.role.*.yml config.",
    "Reports > Status report (/admin/reports/status) is the one-page health check; Reports > Recent log messages (/admin/reports/dblog) is your var/log/dev.log — also readable via drush ws.",
    "Install the contrib Admin Toolbar module (admin_toolbar + admin_toolbar_tools) on every project: hoverable drop-down menus that reach any admin page in two moves.",
  ],

  interview: [
    {
      q: "You land on an unfamiliar Drupal site. Walk me through how you'd orient yourself using only the admin UI.",
      a: "Start at **Reports > Status report** (`/admin/reports/status`) — it triages PHP/DB versions, cron, security updates, and config problems on one page, so you know the environment is sane before touching anything. Then **Extend** (`/admin/modules`) to see which core and contrib modules are enabled — that's the feature inventory, like scanning `composer.json` plus `bundles.php`. Next **Structure** (`/admin/structure`) for the content model: content types and their fields, taxonomy vocabularies, Views, and block layout tell you how the site is actually built. Finally **People > Permissions** for the access model and **Reports > Recent log messages** for anything currently failing. That sequence answers most 'how does this site work' questions without opening the codebase.",
    },
    {
      q: "How does Drupal's logging compare to what you'd use in Symfony, and what would you change for production?",
      a: "Out of the box the **dblog** module writes log entries to the database, browsable and filterable at Reports > Recent log messages (`/admin/reports/dblog`) — the everyday equivalent of tailing `var/log/dev.log` or checking the profiler, with the bonus that non-developers can read it. It's capped by a `row_limit` setting (config in `dblog.settings.yml`, edited at `/admin/config/development/logging`), so it rotates away and adds DB writes on busy sites. For production I'd enable core's **syslog** module (or a contrib handler) so logs go to the system logger and a real aggregator — the same reasoning as configuring monolog handlers for prod — and often disable or tightly cap dblog. Drush gives CLI access too: `drush watchdog:show`.",
    },
    {
      q: "A teammate asks why you always install the Admin Toolbar module first on a new build. What's the case for it?",
      a: "Core's toolbar only shows the seven top-level sections, so every task means clicking through intermediate landing pages. The contrib **Admin Toolbar** module (`drupal/admin_toolbar`) turns the same toolbar into hover-driven drop-down menus that reach any admin page — a specific content type's field settings, a specific View — in one or two moves, and its `admin_toolbar_tools` submodule adds practical extras like a flush-caches link. It changes no behaviour for anonymous users or editors without admin access; it's pure admin ergonomics. Because site building in Drupal *is* navigating the admin UI hundreds of times a day, it pays for itself immediately — which is why it's one of the most-installed contrib modules in the ecosystem.",
    },
  ],

  quiz: [
    {
      question:
        "Where do you go to create a new content type and add fields to it?",
      options: [
        "Configuration > System (/admin/config/system)",
        "Structure > Content types (/admin/structure/types)",
        "Extend (/admin/modules)",
        "Content (/admin/content)",
      ],
      answerIndex: 1,
      explain:
        "Structure is the schema-and-wiring section: content types, fields, menus, taxonomy, Views, block layout, and display modes all live under /admin/structure. Content lists the actual nodes (data), Configuration tunes settings, and Extend enables modules.",
    },
    {
      question:
        "You enable a contrib module on the Extend page. Where is that enabled/disabled state recorded for deployment?",
      options: [
        "In config/bundles.php, like a Symfony bundle",
        "Only in the database — it can't be deployed",
        "In core.extension.yml, exported with the rest of the site's config",
        "In composer.json's require section",
      ],
      answerIndex: 2,
      explain:
        "Composer (composer.json) only gets the code onto disk. Whether a module is enabled is itself configuration, stored in the core.extension config object and exported as core.extension.yml — so a config import on another environment enables the same modules. bundles.php is Symfony, and the state absolutely does deploy.",
    },
    {
      question:
        "Which pair is the closest Drupal equivalent of 'tail -f var/log/dev.log' plus the Symfony profiler's error view?",
      options: [
        "Reports > Status report, and drush core:status",
        "Reports > Recent log messages (/admin/reports/dblog), and drush watchdog:show",
        "Configuration > Development > Performance",
        "Extend > Uninstall module",
      ],
      answerIndex: 1,
      explain:
        "The dblog module records log messages to the database and Reports > Recent log messages is its filterable UI; drush watchdog:show (ws) is the CLI view. The Status report is a health/requirements check, not a log, and Performance is about caching.",
    },
  ],
};

export default lesson;

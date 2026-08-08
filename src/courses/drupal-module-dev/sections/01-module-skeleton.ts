import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "module-skeleton",
  title: "The Module Skeleton: info.yml & Folder Layout",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 11,
  summary:
    "Scaffold incident_tracker from a bare folder: the info.yml manifest with core_version_requirement and prefixed dependencies, the automatic src/ PSR-4 root, the standard folder layout, and the drush install/uninstall lifecycle.",

  concept: `
## From architecture to a working folder

You know the theory — a module is Drupal's bundle-shaped unit of code, config,
and data. This course builds one for real: **incident_tracker**, a module that
will log site incidents, triage them through forms, process them on cron, and
render them in a block. Every section adds a piece. Today: the skeleton.

Custom code lives in \`modules/custom/\` (Composer puts contrib in
\`modules/contrib/\`). The folder name **is** the machine name, and the machine
name is the module's identity everywhere — file prefixes, PHP namespace, config
prefix, hook prefix:

\`\`\`bash
mkdir -p web/modules/custom/incident_tracker
\`\`\`

Machine names use lowercase letters, digits, and underscores, and must not start
with a digit.

### The one required file

\`incident_tracker.info.yml\` is the entire declaration — everything a Symfony
bundle spreads across \`composer.json\`, a bundle class, and \`config/bundles.php\`:

\`\`\`yaml
name: Incident Tracker
type: module
description: 'Log, triage and resolve site incidents.'
package: Custom
core_version_requirement: ^10 || ^11
dependencies:
  - drupal:node
  - drupal:datetime
\`\`\`

- **name / description / package** are what admins see at \`/admin/modules\`;
  \`package: Custom\` groups your in-house modules under one heading.
- **type: module** matters because the same discovery system also finds themes
  and install profiles.
- **core_version_requirement** is the Drupal 10/11 compatibility declaration — a
  Composer-style constraint. \`^10 || ^11\` is the standard "supports both" form;
  one codebase then runs on Symfony 6.4 (D10) and Symfony 7 (D11) underneath.
- **dependencies** use \`project:module\` form: \`drupal:node\` means "the node
  module shipped by the drupal project". A contrib dependency looks like
  \`token:token\` or \`pathauto:pathauto\`. Drupal refuses to install your module
  until every dependency is present and installed.

### src/ — the PSR-4 root

The moment the module is installed, \`Drupal\\incident_tracker\\\` maps to
\`src/\` — no autoload entry, no \`composer dump-autoload\`. The rest of the
layout is convention, and later sections fill it in:

\`\`\`text
incident_tracker/
  incident_tracker.info.yml     # required — the manifest
  incident_tracker.module       # procedural hooks (next section)
  incident_tracker.routing.yml  # routes
  incident_tracker.services.yml # service definitions
  config/install/               # default config imported on install
  config/schema/                # config schema
  templates/  css/  js/         # Twig + assets (wired via libraries.yml)
  src/                          # PSR-4: Drupal\\incident_tracker\\
    Controller/  Form/  Plugin/Block/  EventSubscriber/
    Hook/                       # #[Hook] attribute classes (D11.1+)
\`\`\`

### Enable it — and uninstall it properly

\`\`\`bash
drush en incident_tracker -y     # alias of drush pm:install
\`\`\`

Drush resolves \`dependencies\` first, then installs. Going the other way,
\`drush pm:uninstall incident_tracker\` is a **lifecycle event**, not file
deletion: \`hook_uninstall\` runs, \`hook_schema\` tables are dropped, and config
the module shipped is removed. Compare Symfony: removing a bundle is
\`composer remove\` plus a redeploy, and nothing "cleans up" because a bundle
never owned site data. Corollary: never delete an installed module's folder —
\`core.extension\` still lists it and the site will complain about the missing
module. Uninstall first, delete second.
`,

  comparisons: [
    {
      label: "Scaffolding the unit",
      intro:
        "Start the same feature in both worlds. A reusable Symfony bundle needs a package, a class, and a registration entry; the Drupal module needs one folder and one YAML file.",
      php: `acme/incident-bundle/            # reusable Symfony bundle
  composer.json                  # name, PSR-4 autoload, requires
  src/AcmeIncidentBundle.php     # class extending AbstractBundle
  src/Controller/
  config/services.yaml
  templates/

# ...plus an entry in the app's config/bundles.php:
#   Acme\\IncidentBundle\\AcmeIncidentBundle::class => ['all' => true]`,
      ts: `web/modules/custom/incident_tracker/
  incident_tracker.info.yml      # the ONLY required file
  src/                           # PSR-4: Drupal\\incident_tracker\\
  config/install/                # default config (later sections)
  config/schema/
  templates/  css/  js/

# No class. No composer.json. No registration entry anywhere —
# discovery finds the folder because the info.yml exists.`,
      note:
        "Folder name = machine name = identity. Everything else about the module hangs off 'incident_tracker'.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The manifest: composer.json vs info.yml",
      intro:
        "Both files declare metadata, platform compatibility, and dependencies. core_version_requirement is the Drupal analogue of your symfony/* version constraints.",
      php: `{
  "name": "acme/incident-bundle",
  "type": "symfony-bundle",
  "description": "Log, triage and resolve incidents.",
  "require": {
    "php": ">=8.1",
    "symfony/framework-bundle": "^6.4 || ^7.0"
  },
  "autoload": {
    "psr-4": { "Acme\\\\IncidentBundle\\\\": "src/" }
  }
}`,
      ts: `# incident_tracker.info.yml — file name carries the machine name
name: Incident Tracker
type: module                     # discovery also handles theme/profile
description: 'Log, triage and resolve site incidents.'
package: Custom                  # grouping on /admin/modules
core_version_requirement: ^10 || ^11
dependencies:
  - drupal:node                  # project:module — core uses drupal:
  - drupal:datetime              # contrib would be e.g. token:token`,
      note:
        "core_version_requirement is a Composer-style constraint; ^10 || ^11 is the standard dual D10/D11 declaration. Drupal.org packaging adds version/project keys for you — don't write them.",
      leftLang: "json",
      rightLang: "yaml",
    },
    {
      label: "The PSR-4 root proves itself",
      intro:
        "Drop the same controller stub in both src/ folders. Symfony needs the composer.json mapping dumped; Drupal resolves the class the moment the module is installed.",
      php: `<?php

// src/Controller/IncidentListController.php
// Needs the composer.json psr-4 entry, then:
//   composer dump-autoload

namespace Acme\\IncidentBundle\\Controller;

class IncidentListController
{
}`,
      ts: `<?php

// src/Controller/IncidentListController.php
// Resolves with ZERO configuration once the module is installed:
//   Drupal\\incident_tracker\\  =>  incident_tracker/src/

namespace Drupal\\incident_tracker\\Controller;

class IncidentListController {
  // Routes arrive in a later section — the namespace already works.
}`,
      note:
        "The namespace segment after Drupal\\ must exactly match the machine name, underscores included.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Install vs require — and the uninstall difference",
      intro:
        "A bundle joins the app via Composer and a deploy; a module joins the site via config at runtime. Uninstalling a module is cleanup, not just deletion.",
      php: `$ composer require acme/incident-bundle
# Symfony Flex appends it to config/bundles.php —
# that's a CODE change, shipped with your next deploy.

$ composer remove acme/incident-bundle
# Gone from the codebase. Nothing else happens:
# a bundle never owned site data, so there is
# nothing to clean up.`,
      ts: `$ drush en incident_tracker -y     # 'en' is an alias of pm:install
 [success] Module incident_tracker has been installed.

$ drush pm:uninstall incident_tracker -y
 [success] Successfully uninstalled: incident_tracker
# hook_uninstall ran, hook_schema tables dropped,
# shipped config removed. Only NOW is it safe to
# delete the folder from disk.`,
      note:
        "Deleting an installed module's folder breaks the site — core.extension still lists it. Uninstall first, delete second. Output shown is Drush 13; Drush 12 (D10-era) logs 'Successfully enabled: incident_tracker' instead.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    intro:
      "Drupal discovers extensions by scanning for *.info.yml files. This models that in plain PHP: parse the manifest, check core_version_requirement against three core majors, and derive the automatic PSR-4 mapping. Predict the output before running.",
    lang: "php",
    code: `<?php
// Model Drupal's extension discovery: it scans for *.info.yml files, parses
// the keys, checks core_version_requirement, and registers a PSR-4 root.

$files = [
    'modules/custom/incident_tracker/incident_tracker.info.yml' => <<<'YAML'
name: Incident Tracker
type: module
description: 'Log, triage and resolve site incidents.'
package: Custom
core_version_requirement: ^10 || ^11
dependencies:
  - drupal:node
  - drupal:datetime
YAML,
];

// Tiny parser for the flat subset of YAML that info files use.
function parse_info(string $yaml): array {
    $info = [];
    $listKey = null;
    foreach (explode("\\n", $yaml) as $line) {
        if (preg_match('/^(\\w+):\\s*(.*)$/', $line, $m)) {
            $listKey = $m[2] === '' ? $m[1] : null;
            $info[$m[1]] = $m[2] === '' ? [] : trim($m[2], "'");
        } elseif ($listKey !== null && preg_match('/^\\s+-\\s+(.+)$/', $line, $m)) {
            $info[$listKey][] = $m[1];
        }
    }
    return $info;
}

// Does "^10 || ^11" allow this core major version?
function compatible(string $constraint, int $major): bool {
    foreach (explode('||', $constraint) as $part) {
        if ((int) ltrim(trim($part), '^') === $major) {
            return true;
        }
    }
    return false;
}

foreach ($files as $path => $yaml) {
    $machine = basename($path, '.info.yml');
    $dir = dirname($path);
    $info = parse_info($yaml);

    echo "Discovered {$info['type']}: {$machine}\\n";
    echo "  name:         {$info['name']}\\n";
    echo "  package:      {$info['package']}\\n";
    echo "  dependencies: " . implode(', ', $info['dependencies']) . "\\n\\n";

    foreach ([9, 10, 11] as $major) {
        $ok = compatible($info['core_version_requirement'], $major) ? 'yes' : 'no';
        echo "Installable on Drupal {$major}? {$ok}\\n";
    }

    echo "\\nPSR-4 root (registered automatically, no composer.json):\\n";
    echo "  Drupal\\\\{$machine}\\\\  =>  {$dir}/src/\\n";
    echo "  Drupal\\\\{$machine}\\\\Controller\\\\IncidentListController\\n";
    echo "    -> {$dir}/src/Controller/IncidentListController.php\\n";
}`,
    output: `Discovered module: incident_tracker
  name:         Incident Tracker
  package:      Custom
  dependencies: drupal:node, drupal:datetime

Installable on Drupal 9? no
Installable on Drupal 10? yes
Installable on Drupal 11? yes

PSR-4 root (registered automatically, no composer.json):
  Drupal\\incident_tracker\\  =>  modules/custom/incident_tracker/src/
  Drupal\\incident_tracker\\Controller\\IncidentListController
    -> modules/custom/incident_tracker/src/Controller/IncidentListController.php
`,
  },

  keyPoints: [
    "A custom module is a folder in `modules/custom/` whose name is the machine name — the identity reused in file prefixes, the PHP namespace, config names, and hooks.",
    "`incident_tracker.info.yml` is the only required file; its core keys are name, type: module, description, package, core_version_requirement, and dependencies.",
    "`core_version_requirement: ^10 || ^11` is the Composer-style constraint that declares Drupal 10 and 11 compatibility in one line.",
    "Dependencies use `project:module` form — `drupal:node` for core, `token:token` for contrib — and block installation until satisfied.",
    "`src/` is an automatic PSR-4 root: `Drupal\\incident_tracker\\` maps to it with no composer.json entry and no dump-autoload.",
    "`drush en incident_tracker` installs (resolving dependencies); `drush pm:uninstall` runs cleanup hooks and removes data — never just delete an installed module's folder.",
  ],

  interview: [
    {
      q: "What is the minimum a working Drupal module needs, and how does that compare to starting a Symfony bundle?",
      a: "One folder under `modules/custom/` named after the machine name, containing one file: `<machine_name>.info.yml` with at least `name`, `type: module`, and `core_version_requirement`. That single YAML file replaces three Symfony artifacts: the `composer.json` package manifest, the bundle class extending `AbstractBundle`, and the `config/bundles.php` registration entry. Discovery is filesystem-based — Drupal finds the module because the info.yml exists, and once installed it registers `Drupal\\<machine_name>\\` as a PSR-4 root for `src/` automatically. Everything else (routing.yml, services.yml, `.module`, `config/`) is added only when you need it.",
    },
    {
      q: "How do you declare that one module release supports both Drupal 10 and 11?",
      a: "With `core_version_requirement: ^10 || ^11` in the info.yml — it accepts a Composer-style semver constraint, exactly like a `require` line in composer.json. That is realistic because Drupal 10 and 11 share most APIs (Symfony 6.4 vs 7 underneath), so a single codebase usually satisfies both; you only branch when you use something version-specific, like `#[Hook]` attribute classes which need 11.1+. In an interview it's worth adding that this key replaced the old `core: 8.x` key, and that drupal.org's packager injects `version` and `project` keys into released info.yml files — you never write those by hand.",
    },
    {
      q: "Why can't you remove a Drupal module the way you remove a Symfony bundle — by deleting the code?",
      a: "Because a module's installed state lives in configuration (`core.extension`) and a module owns site data: schema tables, shipped config, possibly content. `drush pm:uninstall` is therefore a real lifecycle event — it runs `hook_uninstall`, drops `hook_schema` tables, and deletes the config the module installed. If you delete the folder while the module is still installed, `core.extension` still references it and the site logs 'missing module' errors with no clean way to run the uninstall logic. A bundle has no equivalent problem: `composer remove` plus a deploy suffices because a bundle never owned persistent site state.",
    },
  ],

  quiz: [
    {
      question:
        "Which single file is required for Drupal to discover the incident_tracker module?",
      options: [
        "incident_tracker.module",
        "composer.json with type: drupal-module",
        "incident_tracker.info.yml",
        "src/IncidentTrackerModule.php",
      ],
      answerIndex: 2,
      explain:
        "The *.info.yml file, named after the machine name, is the entire declaration. The .module file, composer.json, and any class are all optional — there is no module class at all.",
    },
    {
      question:
        "In the dependencies list, what does the entry 'drupal:node' mean?",
      options: [
        "A Composer package named drupal/node must be required",
        "The node module from the drupal project (core) must be installed — the format is project:module",
        "The module needs Node.js available on the server",
        "It pins the module to sites whose front page is a node",
      ],
      answerIndex: 1,
      explain:
        "Dependencies use project:module form. Core modules belong to the 'drupal' project (drupal:node, drupal:views); a contrib dependency uses its project name, e.g. token:token. Install is blocked until dependencies are satisfied.",
    },
    {
      question:
        "Which info.yml line lets one release of incident_tracker install on both Drupal 10 and Drupal 11?",
      options: [
        "core: 10.x, 11.x",
        "compatible_with: [10, 11]",
        "core_version_requirement: ^10 || ^11",
        "php_requirement: ^10 || ^11",
      ],
      answerIndex: 2,
      explain:
        "core_version_requirement takes a Composer-style semver constraint; ^10 || ^11 is the standard dual-support declaration. The old 'core: 8.x' key is gone, and there is no compatible_with key.",
    },
    {
      question:
        "The module is installed and you want it gone. What is the correct order of operations?",
      options: [
        "Delete modules/custom/incident_tracker, then clear caches",
        "Run drush pm:uninstall incident_tracker, then delete the folder",
        "Remove it from core.extension.yml by hand, then delete the folder",
        "Set core_version_requirement to an impossible constraint and redeploy",
      ],
      answerIndex: 1,
      explain:
        "Uninstall is a lifecycle event: hook_uninstall runs, hook_schema tables are dropped, and shipped config is removed. Deleting the folder first leaves core.extension pointing at a missing module and skips all cleanup.",
    },
  ],
};

export default lesson;

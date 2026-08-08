import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "modules-vs-bundles",
  title: "Modules vs Bundles: The Unit of Code",
  part: "Foundations & Mental Model",
  estMinutes: 12,
  summary:
    "A Drupal module is the unit of reusable code — like a Symfony bundle, but declared by an info.yml, autoloaded by convention, and turned on or off at runtime by site admins.",

  concept: `
In Symfony, the **bundle** is the unit of reusable, self-contained code: a folder
with a bundle class, its own \`config/\`, service definitions, and controllers. In
Drupal, that unit is the **module**. The mental model transfers almost perfectly —
but three things differ in ways that matter.

### Declared by a file, not a class

A Symfony bundle needs a **class** (extending \`AbstractBundle\`) and an entry in
\`config/bundles.php\`. A Drupal module needs neither. It is declared by a single
YAML file named after its machine name: \`my_blog.info.yml\`. That file carries the
metadata Symfony would spread across a bundle class, \`composer.json\`, and
\`bundles.php\`:

\`\`\`yaml
name: My Blog
type: module
core_version_requirement: ^10 || ^11
dependencies:
  - drupal:node
\`\`\`

The machine name (\`my_blog\`) is the module's identity everywhere: the folder name,
the file prefix, the config namespace, and the PHP namespace segment.

### Autoloaded by convention

Symfony wires PSR-4 explicitly in \`composer.json\` (\`"App\\\\": "src/"\`). Drupal does
it for you: for **every enabled module**, the namespace \`Drupal\\my_blog\\\` maps
automatically to \`modules/custom/my_blog/src/\`. You never register it. Drop a class
at \`src/Controller/BlogController.php\` and it is \`Drupal\\my_blog\\Controller\\BlogController\`.
No autoload config, no \`composer dump-autoload\`.

### On/off at runtime, stored in config

This is the big one. A Symfony bundle is either in \`bundles.php\` or it is not —
changing that is a **code edit and a redeploy**. A Drupal module's *enabled state*
lives in **configuration** (\`core.extension\`), so a site administrator can install
or uninstall it through the UI or Drush **without touching code**. The code sits on
disk inertly; config decides whether it participates.

\`\`\`bash
drush pm:install my_blog     # enable (resolves dependencies first)
drush pm:uninstall my_blog   # remove + run cleanup
\`\`\`

Note: since Drupal 8 there is no "disabled" middle state (Drupal 7 had one). A
module is **installed** or **uninstalled** — uninstalling runs cleanup hooks and
deletes the module's data. Installing runs \`hook_install\` and imports default config.

### It carries more than code

A bundle bundles services and controllers. A module bundles those **plus** hooks
(\`my_blog.module\`), install/schema logic (\`my_blog.install\` with \`hook_schema\`),
and default configuration shipped in \`config/install/\`. Enabling the module imports
that config into the live site; uninstalling removes it. The module is therefore
the unit of *code, config, and data* together — a wider boundary than a bundle.
`,

  comparisons: [
    {
      label: "Declaring the unit of code",
      intro:
        "You want to introduce a self-contained feature. In Symfony that means a bundle class plus a registration entry; in Drupal it means one info.yml file whose name encodes the machine name.",
      php: `// src/MyBlog/MyBlogBundle.php  (Symfony 6.4 / 7)
namespace App\\MyBlog;

use Symfony\\Component\\HttpKernel\\Bundle\\AbstractBundle;

class MyBlogBundle extends AbstractBundle {}

// config/bundles.php — explicit registration array
return [
    App\\MyBlog\\MyBlogBundle::class => ['all' => true],
];`,
      ts: `# modules/custom/my_blog/my_blog.info.yml
name: My Blog
type: module
description: 'Adds a simple blog.'
package: Custom
core_version_requirement: ^10 || ^11
dependencies:
  - drupal:node`,
      note:
        "No Drupal equivalent of a Bundle class or bundles.php array — the *.info.yml file IS the declaration.",
      leftLang: "php",
      rightLang: "yaml",
    },
    {
      label: "PSR-4 autoloading",
      intro:
        "Both put classes under src/. Symfony maps the namespace explicitly in composer.json; Drupal maps it by convention for every enabled module, with no configuration at all.",
      php: `// composer.json — you declare the PSR-4 root
{
  "autoload": {
    "psr-4": { "App\\\\": "src/" }
  }
}
// App\\MyBlog\\Controller\\BlogController
//   -> src/MyBlog/Controller/BlogController.php`,
      ts: `// No autoload config anywhere. Drupal registers it for you:
//   namespace  Drupal\\my_blog\\
//   maps to    modules/custom/my_blog/src/
//
// Drupal\\my_blog\\Controller\\BlogController
//   -> modules/custom/my_blog/src/Controller/BlogController.php`,
      note:
        "Drupal derives the namespace from the machine name; no `composer dump-autoload` needed after adding a class.",
      leftLang: "php",
      rightLang: "php",
    },
    {
      label: "Turning it on/off",
      intro:
        "Symfony decides membership in code (bundles.php) — a deploy. Drupal stores enabled state in the core.extension config object, so an admin toggles it at runtime.",
      php: `// config/bundles.php — editing this is a code change + redeploy
return [
    Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
    App\\MyBlog\\MyBlogBundle::class => ['all' => true],
];`,
      ts: `# core.extension.yml — enabled state lives in CONFIG, not code
module:
  node: 0
  my_blog: 0   # 0 = weight; presence of the key means "installed"

# Admins change this via UI or Drush, no deploy:
#   drush pm:install my_blog
#   drush pm:uninstall my_blog`,
      note:
        "Same code on disk can be active or inactive per-site; Symfony has no runtime enable/disable of bundles.",
      leftLang: "php",
      rightLang: "yaml",
    },
    {
      label: "What the unit contains",
      intro:
        "A bundle groups services and controllers. A module groups those plus hooks, install/schema logic, and default config it imports on install and removes on uninstall.",
      php: `MyBlogBundle/
  src/MyBlogBundle.php          # bundle class
  src/Controller/               # PSR-4 controllers
  src/DependencyInjection/      # extension + Configuration
  config/services.yaml          # service defs`,
      ts: `my_blog/
  my_blog.info.yml              # metadata + dependencies
  my_blog.module                # hook implementations (procedural)
  my_blog.install               # hook_install / hook_schema
  my_blog.routing.yml           # routes
  my_blog.services.yml          # service defs
  config/install/*.yml          # default config imported on install
  src/                          # PSR-4: Controller, Form, Plugin, ...`,
      note:
        "The module boundary spans code + config + data; a bundle boundary is code + services only.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    intro:
      "This models Drupal's module system in plain PHP: info.yml as an array, core.extension as the config that stores enabled state, and dependency resolution when an admin installs a module at runtime.",
    lang: "php",
    code: `<?php
// Each module is declared by its *.info.yml (modeled as an array).
$modules = [
    'user'    => ['name' => 'User',    'dependencies' => []],
    'node'    => ['name' => 'Node',    'dependencies' => ['user']],
    'my_blog' => ['name' => 'My Blog', 'dependencies' => ['node']],
];

// core.extension stores the ENABLED state in CONFIG — not hardcoded in code.
$coreExtension = ['module' => []];

// Installing a module resolves its dependencies first, then records it.
function install(string $name, array $modules, array &$config): void {
    foreach ($modules[$name]['dependencies'] as $dep) {
        if (!isset($config['module'][$dep])) {
            install($dep, $modules, $config);
        }
    }
    $config['module'][$name] = 0; // 0 = weight
}

// An admin runs: drush pm:install my_blog
install('my_blog', $modules, $coreExtension);

echo "Enabled modules (from core.extension config):\\n";
foreach (array_keys($coreExtension['module']) as $machine) {
    echo "  - {$machine} => {$modules[$machine]['name']}\\n";
}

echo "\\nPSR-4 mapping (automatic, no composer.json entry):\\n";
echo "  Drupal\\\\my_blog\\\\Controller\\\\BlogController\\n";
echo "    -> modules/custom/my_blog/src/Controller/BlogController.php\\n";`,
    output: `Enabled modules (from core.extension config):
  - user => User
  - node => Node
  - my_blog => My Blog

PSR-4 mapping (automatic, no composer.json entry):
  Drupal\\my_blog\\Controller\\BlogController
    -> modules/custom/my_blog/src/Controller/BlogController.php`,
  },

  keyPoints: [
    "A **module** is Drupal's unit of reusable code — the direct analog of a Symfony **bundle**.",
    "It is declared by \`my_module.info.yml\`, not a bundle class or a \`config/bundles.php\` entry.",
    "PSR-4 is automatic: \`Drupal\\my_module\\\` maps to \`modules/custom/my_module/src/\` for every enabled module — no \`composer.json\` autoload config.",
    "Enabled state lives in the \`core.extension\` **config**, so admins install/uninstall at runtime with no code deploy (\`drush pm:install\` / \`pm:uninstall\`).",
    "Since Drupal 8 there is no 'disabled' state — a module is installed or uninstalled; uninstalling runs cleanup and removes its data.",
    "A module bundles **code + config + data** (hooks, \`hook_schema\`, and \`config/install/\` defaults), a wider boundary than a bundle.",
  ],

  interview: [
    {
      q: "How is a Drupal module like a Symfony bundle, and how is it different?",
      a: "Both are the framework's unit of reusable, self-contained code — a folder with classes under \`src/\`, its own routing, and service definitions. The differences: a bundle is declared by a **class** plus an entry in \`config/bundles.php\`, whereas a module is declared by a single \`*.info.yml\` file named after its machine name. Drupal autoloads \`Drupal\\my_module\\\` to \`src/\` by convention with no \`composer.json\` config. And crucially, a module's enabled state lives in **configuration** (\`core.extension\`), so it can be installed or uninstalled at runtime by an admin — a bundle's membership is code and requires a redeploy.",
    },
    {
      q: "Where does Drupal record which modules are enabled, and why does that matter?",
      a: "In the \`core.extension\` config object (a key under \`module:\`, with a weight value). Because it is configuration rather than code, a site builder can turn functionality on or off through the UI or with \`drush pm:install\` / \`drush pm:uninstall\` without editing files or redeploying. This is why the same codebase can power sites with different feature sets — the code sits on disk inertly until config activates it. In Symfony the equivalent switch is \`config/bundles.php\`, which is code and part of your deploy.",
    },
    {
      q: "A junior asks why there is no 'disable' option like Drupal 7 had. What do you say?",
      a: "Since Drupal 8, a module is either **installed** or **uninstalled** — there is no dormant 'disabled' middle state. Uninstalling actually runs cleanup: \`hook_uninstall\` fires, schema tables from \`hook_schema\` are dropped, and config the module shipped is removed. This keeps a site's state unambiguous — no half-active modules leaving stale data. If you just want code present but inactive, you simply don't install it; the files on disk do nothing until \`core.extension\` lists them.",
    },
  ],

  quiz: [
    {
      question:
        "What plays the role of Symfony's bundle class + config/bundles.php entry in a Drupal module?",
      options: [
        "A ModuleBundle class registered in a services array",
        "The my_module.info.yml file",
        "An @Module PHP attribute on the main class",
        "An entry in the site's composer.json",
      ],
      answerIndex: 1,
      explain:
        "A module is declared by its *.info.yml file (named after the machine name). There is no bundle class and no bundles.php-style registration array in Drupal.",
    },
    {
      question:
        "How does Drupal know to load the class Drupal\\my_module\\Form\\SettingsForm?",
      options: [
        "You add a psr-4 mapping to composer.json and run composer dump-autoload",
        "Automatically: Drupal\\my_module\\ maps to modules/custom/my_module/src/ for every enabled module",
        "You list the class in my_module.services.yml",
        "The class must be registered in core.extension",
      ],
      answerIndex: 1,
      explain:
        "Drupal registers PSR-4 by convention for each enabled module: the Drupal\\<machine_name>\\ namespace maps to that module's src/ directory. No composer autoload config or dump is required.",
    },
    {
      question:
        "Where is a module's enabled/installed state stored?",
      options: [
        "In config/bundles.php",
        "In the module's own info.yml",
        "In the core.extension configuration object",
        "In a compiled container cache only",
      ],
      answerIndex: 2,
      explain:
        "core.extension lists installed modules (and themes) as config. Because it is configuration, admins can install/uninstall at runtime via the UI or Drush without a code deploy.",
    },
  ],
};

export default lesson;

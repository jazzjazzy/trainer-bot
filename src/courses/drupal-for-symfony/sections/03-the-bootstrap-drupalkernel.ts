import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "the-bootstrap-drupalkernel",
  title: "The Bootstrap: DrupalKernel vs Symfony Kernel",
  part: "Foundations & Mental Model",
  estMinutes: 12,
  summary:
    "How a request boots a Drupal site through DrupalKernel and a container compiled from every enabled module, versus Symfony's App\\Kernel compiled from config/services.yaml plus bundles.",

  concept: `
You already know the Symfony front controller cold: \`public/index.php\` builds an
\`App\\Kernel\`, hands it the \`Request\`, and \`$kernel->handle()\` returns a
\`Response\`. Drupal boots the *same way* — it literally uses Symfony's HttpKernel,
HttpFoundation, and DependencyInjection components — but almost every decision that
Symfony leaves to *you* (which bundles, which config files) Drupal makes
*dynamically* from the set of enabled modules.

### Two front controllers, one shape

In Symfony you own \`App\\Kernel\` (via \`MicroKernelTrait\`) and you point it at
\`config/services.yaml\` and \`config/bundles.php\`. In Drupal you never write a
kernel class. Core ships \`web/index.php\`, which instantiates \`DrupalKernel\`.
Note that \`DrupalKernel\` is *not* a subclass of Symfony's abstract \`Kernel\`: it
\`implements DrupalKernelInterface, TerminableInterface\` (so it satisfies the same
\`HttpKernelInterface\` Symfony's kernel does) but reimplements container building and
boot itself — there is no \`registerBundles()\` or \`registerContainerConfiguration()\`.
\`DrupalKernel::boot()\` discovers everything from enabled modules.

### The container is compiled from *every enabled module*

This is the mental shift. A Symfony app has a fixed, developer-curated container:
the bundles in \`config/bundles.php\` plus your \`services.yaml\`. Drupal instead
scans **all enabled modules**, reads each module's \`\${module}.services.yml\`, and
merges them into one \`ContainerBuilder\`. Enabling a module at runtime (via the UI
or \`drush pm:enable\`) changes which services exist. There is no master
\`services.yaml\` listing them — the list is the union of every module's file.

On top of static YAML, Drupal adds two dynamic layers Symfony developers will
recognize as *compiler passes with a different name*:

- **Service providers** — a module ships \`src/\${Module}ServiceProvider.php\`. Its
  \`register()\` adds definitions programmatically; its \`alter()\` rewrites *other
  modules'* definitions. This is Symfony's \`CompilerPassInterface\`, per module.
- **Dynamic discovery / plugin managers** — many "services" (blocks, field types,
  entity types) are found by scanning code, not declared in YAML at all.

### Caching: compiled once, read many times

Symfony dumps a compiled container to \`var/cache/\${env}/App_KernelProdContainer.php\`
and reuses it until you clear the cache. Drupal does the equivalent, but stores the
dumped container in the \`cache_container\` cache bin (the database by default) plus a
PHP file. Because the container depends on *which modules are on*, Drupal rebuilds it
when you install/uninstall a module or run \`drush cache:rebuild\` (\`drush cr\`). In
Symfony you rarely think about the container after \`cache:clear\`; in Drupal
"rebuild the container" (\`drush cr\`) is the single most-run command you will type.

\`\`\`text
Symfony:  index.php -> App\\Kernel -> bundles + config/services.yaml -> compiled container
Drupal:   index.php -> DrupalKernel -> ALL enabled modules' *.services.yml
                                        + ServiceProviders + plugin discovery
                                        -> compiled container (cache_container bin)
\`\`\`

Same HttpKernel machinery underneath; the difference is *who decides what goes in the
container* — you, statically, in Symfony; the enabled-module set, dynamically, in
Drupal.
`,

  comparisons: [
    {
      label: "The front controller",
      intro:
        "Both are the single entry point that turns a Request into a Response. Symfony builds your kernel; Drupal builds core's DrupalKernel.",
      php: `<?php
// public/index.php (Symfony 6.4 / 7)
use App\\Kernel;
use Symfony\\Component\\HttpFoundation\\Request;

require_once dirname(__DIR__).'/vendor/autoload_runtime.php';

return function (array $context) {
    return new Kernel($context['APP_ENV'], (bool) $context['APP_DEBUG']);
};`,
      ts: `<?php
// web/index.php (Drupal 10 / 11) — shipped by core, you don't edit it
use Drupal\\Core\\DrupalKernel;
use Symfony\\Component\\HttpFoundation\\Request;

$autoloader = require_once __DIR__ . '/autoload.php';

$kernel  = new DrupalKernel('prod', $autoloader);
$request = Request::createFromGlobals();
$response = $kernel->handle($request);
$response->send();

$kernel->terminate($request, $response);`,
      note: "DrupalKernel implements the same HttpKernelInterface as Symfony's Kernel but is a separate implementation, not a subclass — it builds its container from enabled modules itself. You never write or subclass it; the app-specific part lives in modules, not in a kernel class.",
    },
    {
      label: "Where services are declared",
      intro:
        "Symfony has one project-owned services file with autowiring/autoconfigure. Drupal has one file per module, explicitly wired, all merged into one container.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/services.yaml (Symfony) — one file for the whole app
services:
  _defaults:
    autowire: true
    autoconfigure: true

  App\\:
    resource: '../src/'

  App\\Mailer\\SmtpMailer: ~`,
      ts: `# modules/custom/my_module/my_module.services.yml
# one such file PER enabled module; core merges them all
services:
  my_module.mailer:
    class: Drupal\\my_module\\SmtpMailer
    arguments: ['@config.factory', '@logger.factory']

  my_module.subscriber:
    class: Drupal\\my_module\\EventSubscriber\\MySubscriber
    tags:
      - { name: event_subscriber }`,
      note: "No autowiring by default in Drupal: you list arguments explicitly with @service references, and opt into behavior via tags (like Symfony tags), not autoconfigure.",
    },
    {
      label: "Compile-time container hooks",
      intro:
        "Need to add or rewrite definitions in code, not YAML? Symfony uses a CompilerPass registered in the kernel; Drupal uses a per-module ServiceProvider.",
      php: `<?php
// Symfony: a compiler pass, registered in App\\Kernel::build()
namespace App\\DependencyInjection\\Compiler;

use Symfony\\Component\\DependencyInjection\\ContainerBuilder;
use Symfony\\Component\\DependencyInjection\\Compiler\\CompilerPassInterface;

final class SwapMailerPass implements CompilerPassInterface
{
    public function process(ContainerBuilder $container): void
    {
        $container->getDefinition('app.mailer')
            ->setClass(\\App\\Mailer\\SmtpMailer::class);
    }
}`,
      ts: `<?php
// Drupal: src/MyModuleServiceProvider.php (auto-discovered by name)
namespace Drupal\\my_module;

use Drupal\\Core\\DependencyInjection\\ContainerBuilder;
use Drupal\\Core\\DependencyInjection\\ServiceProviderBase;

class MyModuleServiceProvider extends ServiceProviderBase {

  // like a CompilerPass over OTHER modules' definitions
  public function alter(ContainerBuilder $container) {
    if ($container->hasDefinition('my_module.mailer')) {
      $container->getDefinition('my_module.mailer')
        ->setClass('Drupal\\\\my_module\\\\SmtpMailer');
    }
  }
}`,
      note: "Class name must be {Module}ServiceProvider (StudlyCase of the machine name); Drupal finds it by convention. register() adds definitions, alter() rewrites existing ones.",
    },
  ],

  playground: {
    intro:
      "Model of what DrupalKernel does at boot: merge every enabled module's *.services.yml into one container, then let a service provider's alter() rewrite a definition — the whole thing then gets cached. Predict the output.",
    lang: "php",
    code: `<?php
// Each enabled module contributes a *.services.yml (parsed here to arrays).
$modules = [
  'system' => [
    'logger.channel.default' => ['class' => 'Drupal\\Core\\Logger\\LoggerChannel'],
    'path.validator'         => ['class' => 'Drupal\\Core\\Path\\PathValidator'],
  ],
  'node' => [
    'node.grant_storage'     => ['class' => 'Drupal\\node\\NodeGrantDatabaseStorage'],
  ],
  'my_module' => [
    'my_module.mailer'       => ['class' => 'Drupal\\my_module\\DefaultMailer'],
  ],
];

// 1) Compile: merge every module's definitions into ONE container.
$container = [];
foreach ($modules as $module => $services) {
  foreach ($services as $id => $def) {
    $container[$id] = $def + ['provider' => $module];
  }
}

// 2) Service providers run: MyModuleServiceProvider::alter() swaps a class.
if (isset($container['my_module.mailer'])) {
  $container['my_module.mailer']['class'] = 'Drupal\\my_module\\SmtpMailer';
}

// 3) The compiled container is cached; later requests just read it.
echo 'Compiled ' . count($container) . ' services from '
   . count($modules) . " modules\\n";
foreach ($container as $id => $def) {
  echo "  {$id} => {$def['class']} (from {$def['provider']})\\n";
}`,
    output: `Compiled 4 services from 3 modules
  logger.channel.default => Drupal\\Core\\Logger\\LoggerChannel (from system)
  path.validator => Drupal\\Core\\Path\\PathValidator (from system)
  node.grant_storage => Drupal\\node\\NodeGrantDatabaseStorage (from node)
  my_module.mailer => Drupal\\my_module\\SmtpMailer (from my_module)`,
  },

  keyPoints: [
    "DrupalKernel implements Symfony's HttpKernelInterface (via DrupalKernelInterface) and TerminableInterface, but is NOT a subclass of Symfony's abstract Kernel — it has no registerBundles()/registerContainerConfiguration() and builds its container from enabled modules itself; core's web/index.php builds it, so you never write a kernel class the way you write App\\Kernel.",
    "The container is compiled from the union of every enabled module's {module}.services.yml, not from one project-owned services.yaml plus bundles.",
    "Enabling/uninstalling a module changes which services exist; there is no single master list of them.",
    "Service providers ({Module}ServiceProvider with register()/alter()) are Drupal's per-module equivalent of Symfony CompilerPasses.",
    "Drupal has no autowiring by default: declare arguments explicitly with @service refs and opt into behavior via tags.",
    "The compiled container is cached (cache_container bin); `drush cr` rebuilds it, and you run it constantly after code or module changes.",
  ],

  interview: [
    {
      q: "How does Drupal's bootstrap relate to Symfony's, and what's the key difference?",
      a: "Drupal uses the same Symfony HttpKernel, HttpFoundation and DependencyInjection components. \`web/index.php\` builds a \`DrupalKernel\` (which implements the same \`HttpKernelInterface\` as Symfony's \`Kernel\` but is a separate implementation, not a subclass), calls \`handle($request)\`, sends the \`Response\`, then \`terminate()\` — identical to \`App\\Kernel\` in \`public/index.php\`. The key difference is *what fills the container*: Symfony compiles from a fixed \`config/bundles.php\` plus \`config/services.yaml\` that you curate, whereas Drupal compiles dynamically from every enabled module's \`{module}.services.yml\`. So the set of services is a function of which modules are enabled, not a single developer-maintained file.",
    },
    {
      q: "In Symfony I'd add a CompilerPass to modify the container. What's the Drupal equivalent?",
      a: "A module ships \`src/{Module}ServiceProvider.php\` extending \`ServiceProviderBase\`. Its \`register(ContainerBuilder $container)\` adds definitions programmatically (like registering a pass that creates services), and \`alter(ContainerBuilder $container)\` rewrites *other* modules' definitions — e.g. \`setClass()\` or \`setArguments()\` on an existing definition — which is exactly what a \`CompilerPassInterface::process()\` does. Drupal discovers the class by naming convention (StudlyCase of the machine name), so there is no manual registration step like \`App\\Kernel::build()\`.",
    },
    {
      q: "Why do Drupal developers run `drush cr` so often, and what's the Symfony analogue?",
      a: "The container is expensive to compile, so Drupal dumps it and caches it in the \`cache_container\` bin (database by default) plus a PHP file, reusing it every request. Because the container depends on the enabled-module set and on service-provider/plugin discovery, adding a service, changing a \`*.services.yml\`, or altering a plugin means the cached container is stale. \`drush cache:rebuild\` (\`drush cr\`) rebuilds it and clears related caches. The rough Symfony analogue is \`php bin/console cache:clear\`, but Drupal caches far more than the container (render cache, plugin definitions, routes), so \`drush cr\` is a much more frequent reflex.",
    },
  ],

  quiz: [
    {
      question:
        "In Drupal 10/11, which file lists the services that end up in the compiled container?",
      options: [
        "A single web/services.yaml maintained by the developer, like Symfony's config/services.yaml",
        "The merged set of every enabled module's {module}.services.yml, plus service providers and plugin discovery",
        "config/bundles.php, which enumerates every service class",
        "The DrupalKernel class, where each service is registered in code",
      ],
      answerIndex: 1,
      explain:
        "There is no master services file. DrupalKernel scans all enabled modules, reads each {module}.services.yml, and merges them, then service providers and plugin managers add/alter definitions. Enabling a module changes the container.",
    },
    {
      question:
        "You want to change the class of a service another module defined, in code at container-compile time. What do you use?",
      options: [
        "A Symfony CompilerPass registered in DrupalKernel::build()",
        "A hook_service_alter() function in your .module file",
        "A {Module}ServiceProvider class whose alter() method calls getDefinition()->setClass()",
        "An entry under services._defaults in your module's services.yml",
      ],
      answerIndex: 2,
      explain:
        "Drupal's per-module equivalent of a CompilerPass is a {Module}ServiceProvider (extending ServiceProviderBase). register() adds definitions; alter() rewrites existing ones. It is discovered by naming convention, not registered in the kernel, and there is no hook_service_alter().",
    },
    {
      question: "Why does `drush cr` matter so much more than `cache:clear` habits from Symfony?",
      options: [
        "Drupal never compiles its container, so it must be rebuilt on every request",
        "The compiled container is cached (cache_container bin) and depends on the enabled-module set, so code/module changes leave it stale until rebuilt",
        "drush cr recompiles PHP opcode that Symfony handles automatically",
        "Drupal stores services in the database at runtime instead of compiling them",
      ],
      answerIndex: 1,
      explain:
        "Drupal does compile and cache the container (like Symfony), but because the container is derived from enabled modules, service providers and plugin discovery, many changes invalidate it. drush cache:rebuild rebuilds the container and related caches, making it the most common command in Drupal work.",
    },
  ],
};

export default lesson;

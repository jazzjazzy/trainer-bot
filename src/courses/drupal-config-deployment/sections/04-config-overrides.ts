import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "config-overrides",
  title: "Overrides: settings.php, $config and the Override Stack",
  part: "The Configuration System",
  estMinutes: 12,
  summary:
    "Symfony resolves per-environment values once, at container build time; Drupal resolves them on every read through an override stack that sits on top of the active store — which is exactly why an override changes what the site does without ever showing up in drush cex.",

  concept: `
Your team of four has one \`config/sync\` directory in git and three environments.
Dev needs Mailhog, stage needs a sandbox payment key, prod needs the real one.
The naive answer — export on stage, import on prod, hand-edit the diff — produces
the thing this whole course exists to prevent: **config drift**, where the git
tree and the running site disagree and nobody knows which is authoritative.

Drupal's answer is the **override stack**.

## Resolution time is the whole difference

In Symfony, which of \`config/packages/dev/mailer.yaml\` vs
\`config/packages/prod/mailer.yaml\` gets loaded is decided once, when the
container is compiled — change that layering and you must rebuild the cache.
(Env-var placeholders like \`%env(MAILER_DSN)%\` are the exception: Symfony
resolves those at runtime, so editing \`.env\` needs no cache clear.)

Drupal has no compile step for config at all. It layers at **read time**, on
every call:

\`\`\`text
config/install defaults   (shipped by the module, only on install)
        v
active storage            (the database — what drush cex exports)
        v
module overrides          (ConfigFactoryOverrideInterface, by priority)
        v
$config in settings.php   (highest priority, always wins)
\`\`\`

Put this in \`settings.php\` (or a gitignored \`settings.local.php\`):

\`\`\`php
$config['system.site']['name'] = 'Acme Corp [DEV]';
$config['smtp.settings']['smtp_host'] = 'mailhog';
$config['stripe.settings']['secret_key'] = getenv('STRIPE_SECRET_KEY');
\`\`\`

The active store is untouched. \`drush cex\` reads the active store, so the
override **cannot** be exported, **cannot** land in git, and **cannot** drift.
That is the entire trick.

## get() sees overrides, getEditable() does not

This is the part that trips people up, and it is deliberate:

\`\`\`php
// Reading: overrides applied. Use this everywhere in runtime code.
$name = \\Drupal::config('system.site')->get('name');   // 'Acme Corp [DEV]'

// Writing: raw stored value, NO overrides. ConfigFormBase uses this.
$raw = \\Drupal::configFactory()
  ->getEditable('system.site')->get('name');           // 'Acme Corp'
\`\`\`

If \`getEditable()\` applied overrides, the site-information form would load
"Acme Corp [DEV]" into the textfield and save that string into the active store
on the next submit — the override would burn itself into your export. Because it
returns the raw value, forms round-trip cleanly. The cost is a support ticket
you will get: an editor changes the site name, saves, and nothing visibly
changes, because the override still wins on read. Check with
\`drush cget system.site name --include-overridden\`.

## Override vs State vs config

- **Config with an override** — same key everywhere, different value per
  environment: API endpoints, mail transport, dev flags, credentials.
- **State** (\`\\Drupal::state()\`) — runtime values that are never deployed and
  have no per-environment "correct" value: last cron run, migration cursors.
- **Plain config** — anything all three environments genuinely share.

Overrides can only change values on config objects that already exist; they
cannot create or delete config, and they are invisible to \`drush cim\` diffs.
Keep them few, and keep the list of overridden keys documented in the repo.
`,

  comparisons: [
    {
      label: "Per-environment values",
      intro:
        "The same requirement — a different mail host in dev than in prod — expressed the Symfony way and the Drupal way.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/packages/mailer.yaml — shared default
framework:
  mailer:
    dsn: '%env(MAILER_DSN)%'

# config/packages/dev/mailer.yaml — dev only
framework:
  mailer:
    dsn: 'smtp://mailhog:1025'

# .env / .env.prod
MAILER_DSN=smtp://postmaster@mg.acme.io

# The environment picks which files load, and that choice
# is baked into the compiled container; the %env()%
# placeholder inside it still resolves per request.`,
      ts: `<?php
// web/sites/default/settings.php (committed, env-aware)
if (file_exists($app_root . '/' . $site_path . '/settings.local.php')) {
  include $app_root . '/' . $site_path . '/settings.local.php';
}

// settings.local.php on dev (gitignored)
$config['smtp.settings']['smtp_host'] = 'mailhog';
$config['smtp.settings']['smtp_port'] = '1025';

// On prod, from the real environment.
$config['smtp.settings']['smtp_host'] = getenv('SMTP_HOST');

// smtp.settings.yml in config/sync still holds the
// shared, non-secret defaults — unchanged by any of this.`,
      note: "Symfony picks a file per environment and bakes the *file* layering into the compiled container (env placeholders excepted — those still resolve per request); Drupal keeps one exported file and layers a runtime override on top of it.",
    },
    {
      label: "When the value is resolved",
      intro:
        "Both frameworks let you read a configured value. The difference is whether the environment layering already happened.",
      php: `<?php
namespace App\\Service;

class Notifier {
  public function __construct(
    // Which YAML layer supplied this argument was decided
    // at build time; changing the layering requires a
    // cache:clear (an env placeholder would still resolve
    // per request).
    private readonly string $mailerDsn,
  ) {}

  public function dsn(): string {
    return $this->mailerDsn;
  }
}`,
      ts: `<?php
namespace Drupal\\acme_notify;

use Drupal\\Core\\Config\\ConfigFactoryInterface;

class Notifier {
  public function __construct(
    private readonly ConfigFactoryInterface $configFactory,
  ) {}

  public function host(): string {
    // Resolved on THIS call: active store, then module
    // overrides, then $config from settings.php.
    // Edit settings.php and the next request sees it.
    return $this->configFactory
      ->get('smtp.settings')
      ->get('smtp_host');
  }
}`,
      note: "Drupal's read-time resolution is why an override needs no rebuild — and why you must never cache a config value in a static without accounting for the override's cacheable metadata.",
    },
    {
      label: "Reading vs writing the same key",
      intro:
        "A settings form must not persist the environment's override. Drupal enforces that by giving reads and writes two different objects.",
      php: `<?php
// Symfony: parameters are read-only at runtime.
// There is no "write back to config/packages" API,
// so the question never arises — you edit YAML in git
// and redeploy. Anything user-editable goes to the
// database via Doctrine instead:
$settings = $repo->find(1);
$settings->setSiteName($form->get('name')->getData());
$em->flush();

// Config (git) and user-editable data (DB) are
// two entirely separate systems.`,
      ts: `<?php
// Drupal: ONE system, two accessors.
// ImmutableConfig — overrides applied.
$effective = \\Drupal::config('system.site')->get('name');
// 'Acme Corp [DEV]'

// Config (mutable) — raw active-store value.
$editable = \\Drupal::service('config.factory')
  ->getEditable('system.site');
$editable->get('name');            // 'Acme Corp'
$editable->set('name', 'Acme Group')->save();

// Still 'Acme Corp [DEV]' — the override outranks it.
\\Drupal::config('system.site')->get('name');

// Need the raw value from an immutable object?
\\Drupal::config('system.site')->getOriginal('name', FALSE);`,
      note: "ConfigFormBase's config() helper calls getEditable() for exactly this reason: the form edits the exportable layer, never the override on top of it.",
    },
    {
      label: "Programmatic overrides",
      intro:
        "When the override has to be computed — per language, per domain, per tenant — you register a service instead of writing literals in settings.php.",
      php: `<?php
// Symfony: a compiler pass rewrites parameters while
// the container is still being built.
namespace App\\DependencyInjection\\Compiler;

use Symfony\\Component\\DependencyInjection\\ContainerBuilder;
use Symfony\\Component\\DependencyInjection\\Compiler\\CompilerPassInterface;

class TenantPass implements CompilerPassInterface {
  public function process(ContainerBuilder $container): void {
    $tenant = $container->getParameter('tenant');
    $container->setParameter(
      'site_name',
      'Acme ' . ucfirst($tenant),
    );
  }
}
// Runs ONCE, at build. Per-request variation is
// impossible without a container per tenant.`,
      ts: `<?php
namespace Drupal\\acme_tenant;

use Drupal\\Core\\Cache\\CacheableMetadata;
use Drupal\\Core\\Config\\ConfigFactoryOverrideInterface;
use Drupal\\Core\\Config\\StorageInterface;

class TenantOverrides implements ConfigFactoryOverrideInterface {

  public function loadOverrides($names) {
    $overrides = [];
    if (in_array('system.site', $names, TRUE)) {
      $overrides['system.site']['name'] = 'Acme ' . $this->tenant();
    }
    return $overrides;
  }

  public function getCacheSuffix() {
    return 'acme_tenant:' . $this->tenant();
  }

  public function getCacheableMetadata($name) {
    return (new CacheableMetadata())->addCacheContexts(['url.site']);
  }

  public function createConfigObject($name, $collection = StorageInterface::DEFAULT_COLLECTION) {
    return NULL;
  }
}

# acme_tenant.services.yml
# services:
#   acme_tenant.overrides:
#     class: Drupal\\acme_tenant\\TenantOverrides
#     tags:
#       - { name: config.factory.override, priority: 100 }`,
      note: "This is the seam core's own language overrides use (the language.config_factory_override service). Config Split is a different seam entirely — it transforms the storage during export/import rather than overriding values at read time.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the override stack. Watch what get() returns, what getEditable() returns, and what would actually land in config/sync.",
    lang: "php",
    code: `<?php

// A miniature of Drupal's config override stack. No Drupal bootstrap.

// Layer 1: ACTIVE STORAGE. The only layer \`drush cex\` ever writes out.
$active = [
  'system.site'   => ['name' => 'Acme Corp', 'mail' => 'web@acme.test'],
  'smtp.settings' => ['host' => 'smtp.acme.test', 'enabled' => true],
];

// Layer 2: modules implementing ConfigFactoryOverrideInterface::loadOverrides().
$module_overrides = [
  'system.site' => ['name' => 'Acme Corp (FR)'],
];

// Layer 3: $config[...] in settings.php. Highest priority, runtime only.
$settings_php = [
  'system.site'   => ['name' => 'Acme Corp [STAGE]'],
  'smtp.settings' => ['host' => 'mailhog', 'enabled' => false],
];

/** \\Drupal::config() -> ImmutableConfig::get(): every layer applied. */
function config_get(string $name, string $key, array $layers) {
  $value = null;
  foreach ($layers as $layer) {
    if (array_key_exists($key, $layer[$name] ?? [])) {
      $value = $layer[$name][$key];
    }
  }
  return $value;
}

/** getEditable() -> Config::get(): raw stored value, NO overrides. */
function config_get_editable(string $name, string $key, array $active) {
  return $active[$name][$key] ?? null;
}

function fmt($v): string {
  return is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
}

$stack = [$active, $module_overrides, $settings_php];
$probes = [
  ['system.site', 'name'],
  ['system.site', 'mail'],
  ['smtp.settings', 'host'],
  ['smtp.settings', 'enabled'],
];

echo "KEY                       get() [overridden]     getEditable() [raw]\\n";
echo str_repeat('-', 68) . "\\n";
foreach ($probes as [$name, $key]) {
  printf(
    "%-25s %-22s %s\\n",
    "$name:$key",
    fmt(config_get($name, $key, $stack)),
    fmt(config_get_editable($name, $key, $active))
  );
}

// A ConfigFormBase submit does getEditable()->set()->save(): it reads and writes
// the RAW value, so it can never accidentally persist the [STAGE] override.
$active['system.site']['name'] = 'Acme Group';
$stack = [$active, $module_overrides, $settings_php];

echo "\\nAfter the site-information form saves 'Acme Group':\\n";
echo '  get()         = ' . config_get('system.site', 'name', $stack) . "\\n";
echo '  getEditable() = ' . config_get_editable('system.site', 'name', $active) . "\\n";

echo "\\ndrush cex writes ONLY the active layer:\\n";
foreach ($active as $name => $data) {
  echo "  $name.yml\\n";
  foreach ($data as $k => $v) {
    echo "    $k: " . fmt($v) . "\\n";
  }
}
echo "\\nNo override leaked into the export -> zero config drift.\\n";
`,
    output: `KEY                       get() [overridden]     getEditable() [raw]
--------------------------------------------------------------------
system.site:name          Acme Corp [STAGE]      Acme Corp
system.site:mail          web@acme.test          web@acme.test
smtp.settings:host        mailhog                smtp.acme.test
smtp.settings:enabled     false                  true

After the site-information form saves 'Acme Group':
  get()         = Acme Corp [STAGE]
  getEditable() = Acme Group

drush cex writes ONLY the active layer:
  system.site.yml
    name: Acme Group
    mail: web@acme.test
  smtp.settings.yml
    host: smtp.acme.test
    enabled: true

No override leaked into the export -> zero config drift.
`,
  },

  keyPoints: [
    "Symfony collapses environment layering at container-build time; Drupal layers config/install defaults, active storage, module overrides and settings.php $config on every read.",
    "$config['name']['key'] in settings.php changes what the site does at runtime but never touches the active store, so drush cex cannot export it and it cannot cause drift.",
    "\\Drupal::config()->get() applies overrides; configFactory()->getEditable()->get() returns the raw stored value — which is why ConfigFormBase saves the un-overridden value and forms round-trip safely.",
    "The visible symptom of an override is a form that appears to save but shows no change on the front end; confirm with drush cget <name> <key> --include-overridden.",
    "Computed overrides implement ConfigFactoryOverrideInterface and are registered with the config.factory.override service tag, with getCacheableMetadata() declaring how the value varies.",
    "Use an override for per-environment config values, State for runtime bookkeeping that is never deployed, and plain exported config for anything all environments share.",
  ],

  interview: [
    {
      q: "How do you handle a value that must differ between dev, stage and production without causing config drift?",
      a: "Export the shared default into `config/sync` like everything else, then override the environment-specific value in `settings.php` with `$config['smtp.settings']['smtp_host'] = getenv('SMTP_HOST');`. The override is applied at read time on top of the active store, so `\\Drupal::config()` returns the environment's value while the active store — and therefore `drush cex` — still holds the shared default. Because the exporter only ever reads the active layer, the override is structurally incapable of leaking into git, which is what makes this drift-proof rather than merely disciplined. Coming from Symfony, the mental shift is that there is no per-environment config file: one exported file plus a runtime override, instead of `config/packages/prod/*.yaml` collapsing at container build.",
    },
    {
      q: "Why does getEditable() ignore overrides when get() applies them?",
      a: "`get()` returns an `ImmutableConfig` that walks the whole override stack, because runtime code wants the effective value. `getEditable()` returns a mutable `Config` bound to the active store only, because write paths must not read through the overrides. If it did, a settings form would load the overridden value into its fields and save it back on submit, permanently baking the dev-only value into the export. `ConfigFormBase` uses `getEditable()` for precisely this reason. The practical consequence to flag in an interview is the support ticket it generates: an editor saves a new site name, the export changes correctly, but the front end still shows the override — diagnose it with `drush cget system.site name --include-overridden`.",
    },
    {
      q: "When would you reach for ConfigFactoryOverrideInterface instead of just writing $config in settings.php?",
      a: "When the override has to be computed per request rather than fixed per environment — varying by language, domain, or tenant. You implement `loadOverrides()` to return the override array, `getCacheSuffix()` so the config cache is keyed per variation, and `getCacheableMetadata()` to declare the cache contexts the value depends on, then register the service with the `config.factory.override` tag and a priority. Core's own language overrides work this way. The Symfony analogue is a compiler pass, but that runs once at build time and so cannot vary per request — this is the clearest example of Drupal trading build-time resolution for runtime flexibility.",
    },
    {
      q: "What belongs in a config override versus State versus plain exported config?",
      a: "Plain exported config is anything all environments genuinely share — field definitions, view modes, view displays, permissions. A config override is for a key that exists everywhere but whose *value* is environment-specific: API endpoints, mail transport, credentials pulled from `getenv()`, dev-only feature flags. State (`\\Drupal::state()`) is for runtime bookkeeping that is never deployed and has no correct per-environment value — last cron run, a migration cursor, a rebuild timestamp. Getting this wrong is a common source of noisy diffs: putting a runtime timestamp in config means every export shows a change, and putting an API endpoint in State means it silently reverts to nothing on a fresh install.",
    },
  ],

  quiz: [
    {
      question:
        "You add $config['system.site']['name'] = 'Dev copy'; to settings.php on your local. What does drush cex export for system.site.yml?",
      options: [
        "name: 'Dev copy' — the override is now the active value",
        "The unchanged committed name — overrides are never written to the active store",
        "Nothing; the override makes system.site unexportable",
        "It exports 'Dev copy' but marks the key as overridden in the YAML",
      ],
      answerIndex: 1,
      explain:
        "Overrides are applied at read time, layered on top of the active store. The exporter reads the active store itself, so the override is invisible to it. This is the whole reason overrides are the drift-free way to vary a value per environment.",
    },
    {
      question:
        "An editor changes the site name in the UI and saves. The form redisplays the new name, but the site header still shows the old one. What is the most likely cause?",
      options: [
        "The config export is stale and needs drush cim",
        "The form used getEditable(), so the save failed silently",
        "A $config override in settings.php outranks the saved value on read",
        "The render cache needs a full drush cr before any config change appears",
      ],
      answerIndex: 2,
      explain:
        "The form reads and writes through getEditable(), which sees only the active store — so it correctly shows the value it just saved. The page renders via \\Drupal::config()->get(), which applies the override on top. Confirm with drush cget system.site name --include-overridden.",
    },
    {
      question:
        "Which method of ConfigFactoryOverrideInterface ensures the config cache is keyed separately for each variation your override produces?",
      options: [
        "loadOverrides()",
        "createConfigObject()",
        "getCacheSuffix()",
        "getEditable()",
      ],
      answerIndex: 2,
      explain:
        "getCacheSuffix() returns a string appended to the config cache key so different override results do not collide. getCacheableMetadata() separately declares the cache contexts and tags that the rendered output depends on. loadOverrides() returns the values themselves.",
    },
    {
      question:
        "Which of these is the best candidate for State rather than a config override?",
      options: [
        "The Stripe secret key, which differs per environment",
        "The timestamp of the last successful feed import",
        "A dev-only flag that disables outbound email",
        "The base URL of the search API backend",
      ],
      answerIndex: 1,
      explain:
        "A last-run timestamp is runtime bookkeeping with no correct per-environment value and no reason to be deployed — that is exactly what State is for. The other three are config keys that exist in every environment and simply take a different value, which is the definition of an override.",
    },
  ],
};

export default lesson;

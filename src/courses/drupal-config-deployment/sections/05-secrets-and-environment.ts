import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "secrets-and-environment",
  title: "Secrets & Environment-Specific Values",
  part: "The Configuration System",
  estMinutes: 12,
  summary:
    "Exported config is a public artefact that deploys everywhere identically, so credentials and per-environment values have to live outside it — in settings.php, environment variables, a gitignored settings.local.php, or a platform secret store.",

  concept: `
## The export is a public artefact

Treat everything under \`config/sync\` as if it will end up on the internet,
because operationally it already has: it is committed, cloned by four
developers, mirrored onto CI runners, baked into build artefacts and restored
onto every environment. A secret in exported YAML is not "a secret in a private
repo" — it is a secret in every clone that ever existed, including the ones
taken before you rotated it.

The rule is absolute: **no credential, token, salt or key material ever appears
in an exported config object.** What ships is the *shape* of the setting. The
value arrives at runtime, from outside the repository.

## settings.php is the escape hatch

\`settings.php\` is plain PHP, executed before the kernel finishes booting. It is
never exported and \`drush cim\` never touches it. Three globals matter:

- \`$databases\` — connection credentials, per environment.
- \`$settings[...]\` — runtime settings that are *not* configuration at all:
  \`hash_salt\`, \`trusted_host_patterns\`, \`file_private_path\`,
  \`config_sync_directory\`, \`reverse_proxy\` /
  \`reverse_proxy_addresses\` / \`reverse_proxy_trusted_headers\`. Nothing exports
  them; nothing imports them.
- \`$config[...]\` — **overrides** of real config objects. These layer on top of
  active storage when config is *read*, and are invisible to the exporter.

That last point is the whole trick. Set
\`$config['smtp.settings']['smtp_password'] = getenv('SMTP_PASSWORD');\` and the
mail system gets the real password while \`drush cex\` still writes an empty
string into YAML. The read-time layering is: **active storage** (what \`cim\`
wrote, seeded once from \`config/install\` when the module was installed) →
**module overrides** from \`ConfigFactoryOverrideInterface\` implementations
(language, config_translation) → **\`$config\` in settings.php**, which has the
highest priority. Note that \`config/install\` is not a read-time layer at all:
those YAML files are copied into active storage at install time and never
consulted again.

The highest layer that *sets* the key wins — including when it sets it to an
empty string or NULL. \`Config\` deep-merges each override over the stored data,
it does not coalesce, so on a box where \`SMTP_PASSWORD\` is unset
\`getenv('SMTP_PASSWORD') ?: ''\` overrides storage with \`''\` rather than falling
back to it. A missing environment variable gives you an empty password,
silently.

The catch worth memorising: \`ConfigFactory::getEditable()\` deliberately ignores
overrides, so admin forms show the *stored* value, not the running one. An
editor can look at an empty password field on a site that is happily sending
mail. Document it, or your team will "fix" it.

## Where the value comes from per environment

- **Environment variables** read with \`getenv()\`. Platform.sh, Acquia, Pantheon,
  Kubernetes secrets and Vault agents all ultimately present themselves as env
  vars or an injected file. This is the portable default.
- **\`settings.local.php\`** — for laptops. Core ships
  \`sites/example.settings.local.php\`, and \`default.settings.php\` ends with a
  commented-out conditional include. Uncomment it, commit the \`example.\` file,
  and gitignore the real one. The example file is what onboarding reads.
- **The Key module** — when a secret must be *referenceable from config*, e.g. a
  Search API server or a mail provider that stores "which key to use". The
  \`key.key.*\` config entity exports a pointer (file path, env var name, State
  key) and never the value. Override the pointer per environment in
  \`settings.php\`.

## Auditing before it is too late

Before a repo goes public — or during onboarding of a repo you inherited —
grep the export for secret-shaped keys and secret-shaped values, and check the
history, not just \`HEAD\`. If you find one: rotate first, scrub second. Removing
it from the tip of a branch protects nobody.
`,

  comparisons: [
    {
      label: "Per-environment values",
      intro:
        "Same job on both sides: the database DSN and an API endpoint differ per environment and must not be committed. Symfony resolves env vars inside its container config; Drupal does it in PHP before the container exists.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# .env  (committed — defaults and documentation only)
DATABASE_URL="mysql://app:!ChangeMe!@127.0.0.1:3306/app"
COUNCIL_API_ENDPOINT="https://api.example.gov.au/v2"

# .env.local  (gitignored, real values on this machine)
# DATABASE_URL="mysql://app:realpw@db:3306/four_rivers"

# config/packages/doctrine.yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'

# config/services.yaml
parameters:
  council.api_endpoint: '%env(COUNCIL_API_ENDPOINT)%'`,
      ts: `<?php
// sites/default/settings.php — committed, but contains no literals.

$databases['default']['default'] = [
  'driver' => 'mysql',
  'host' => getenv('DB_HOST') ?: 'localhost',
  'port' => getenv('DB_PORT') ?: '3306',
  'database' => getenv('DB_NAME'),
  'username' => getenv('DB_USER'),
  'password' => getenv('DB_PASSWORD'),
  'prefix' => '',
];

// Not configuration: never exported, never imported.
$settings['hash_salt'] = getenv('DRUPAL_HASH_SALT');
$settings['config_sync_directory'] = '../config/sync';
$settings['file_private_path'] = getenv('DRUPAL_PRIVATE_FILES') ?: '../private';
$settings['trusted_host_patterns'] = [
  '^www\\.fourrivers\\.gov\\.au$',
  '^stage\\.fourrivers\\.gov\\.au$',
];

// Behind a load balancer, so Symfony's Request trusts the forwarded headers.
$settings['reverse_proxy'] = TRUE;
$settings['reverse_proxy_addresses'] = [getenv('LB_ADDRESS')];

// A real config object, overridden at read time. cex still exports the
// value that lives in active storage, not this one.
$config['four_rivers.settings']['endpoint'] = getenv('COUNCIL_API_ENDPOINT');`,
      note: "Symfony compiles %env() placeholders into the container and resolves them at runtime; Drupal has no equivalent placeholder syntax in YAML — the substitution is literal PHP in settings.php, which is why settings.php is deliberately excluded from config management.",
    },
    {
      label: "The local override file, and what git sees",
      intro:
        "Both frameworks split a committed template from a gitignored real file. Getting the ignore rules exactly right is the entire security control.",
      leftLang: "bash",
      rightLang: "php",
      php: `# Symfony convention, enforced by the flex recipe's .gitignore:
#   .env        committed  — safe defaults, doubles as documentation
#   .env.local  IGNORED    — this machine's real values
#   .env.dev / .env.prod          committed, non-secret per-env defaults
#   .env.dev.local / .env.prod.local  IGNORED

$ cat .gitignore
###> symfony/framework-bundle ###
/.env.local
/.env.local.php
/.env.*.local
/var/
/vendor/
###< symfony/framework-bundle ###

$ git check-ignore -v .env.local
.gitignore:2:/.env.local	.env.local

# Loading order: .env -> .env.local -> .env.<env> -> .env.<env>.local
# Real environment variables always beat every file.`,
      ts: `<?php
// The last block of core's default.settings.php, uncommented.
// Everything above it is committed; this include is the seam.

if (file_exists($app_root . '/' . $site_path . '/settings.local.php')) {
  include $app_root . '/' . $site_path . '/settings.local.php';
}

// Ship the template, ignore the real thing:
//
//   .gitignore
//     sites/*/settings.local.php
//     sites/*/files
//     sites/default/settings.php   # only if the platform writes it
//
//   committed:
//     sites/default/example.settings.local.php   (copy of core's, annotated)
//
// Core already ships sites/example.settings.local.php with the dev-friendly
// bits: a $settings['container_yamls'][] = DRUPAL_ROOT
// . '/sites/development.services.yml'; include, verbose error reporting,
// CSS/JS aggregation off, rebuild.php access and skip_permissions_hardening --
// plus commented-out null cache backends for the render, page and dynamic
// page caches that you uncomment as needed.
//
// Onboarding is then one line, and it is in the README:
//   cp sites/default/example.settings.local.php sites/default/settings.local.php`,
      note: "The committed example file is not a nicety — it is the only documentation of which overrides exist. A gitignored file nobody can see is a file nobody sets, and then 'works on my machine' becomes 'works on Priya's machine'.",
    },
    {
      label: "A secret that configuration must point at",
      intro:
        "Sometimes config genuinely has to reference a credential — a mail provider, a Search API server, a payment gateway. Neither framework stores the value in the versioned file; both store a reference.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Symfony's secrets vault: encrypted blobs are committed, the decrypt
# key is not.

$ php bin/console secrets:generate-keys --env=prod
$ php bin/console secrets:set STRIPE_SECRET --env=prod
 # value read from stdin, never from argv (argv lands in shell history)

$ git status --short
 A config/secrets/prod/STRIPE_SECRET.5f2a1c.php     # encrypted, committed
 ?? config/secrets/prod/prod.decrypt.private.php    # gitignored

# The decrypt key is injected on the server instead:
$ export SYMFONY_DECRYPTION_SECRET="$(cat /run/secrets/decrypt_key)"

# In services.yaml the reference is just an env var:
#   parameters:
#     stripe.secret: '%env(STRIPE_SECRET)%'

# Inspecting the vault is name-only unless you explicitly opt in:
$ php bin/console secrets:list
 --------------- ------- -------------
  Name            Value   Local Value
 --------------- ------- -------------
  STRIPE_SECRET
 --------------- ------- -------------

# secrets:list --reveal fills the Value column with the decrypted secret and
# needs the decryption key, so it only works where the key is present.
#
# debug:container --env-vars is NOT a safe inspector: its table
# (Name / Default value / Real value) prints resolved values in clear text.`,
      ts: `# config/sync/key.key.stripe.yml — safe to commit.
# The key entity records WHERE the secret is, never WHAT it is.
uuid: 2b1c0d4e-9a77-4c31-8a51-6f0f9a1b2c3d
langcode: en
status: true
dependencies: {  }
id: stripe
label: 'Stripe secret key'
description: 'Live secret key for the payments gateway.'
key_type: authentication
key_type_settings: {  }
key_provider: file
key_provider_settings:
  file_location: '/run/secrets/stripe_secret'
  strip_line_breaks: true
key_input: none
key_input_settings: {  }

# Key also ships providers that read from Drupal's State system or from an
# environment variable, and the Encrypt module can wrap a key so an encrypted
# value may be stored elsewhere. Whichever provider you pick, the exported
# YAML holds a pointer.
#
# Per environment, override the pointer in settings.php:
#   $config['key.key.stripe']['key_provider_settings']['file_location']
#     = getenv('STRIPE_KEY_FILE');
#
# Consuming code never sees the storage detail:
#   \\Drupal::service('key.repository')->getKey('stripe')->getKeyValue();`,
      note: "Both approaches move the trust boundary to one bootstrap secret — Symfony's decryption key, or the path/permissions on the injected file. That single secret is the only thing the platform has to inject, which is exactly what platform secret stores are good at.",
    },
    {
      label: "Auditing an inherited repo before it goes public",
      intro:
        "The team is about to open-source the site. Both audits look the same, and both have the same punchline: history is not HEAD.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Generic PHP/Symfony audit
$ gitleaks detect --source . --redact --no-banner
    Finding:     APP_SECRET=***
    File:        .env
    Commit:      9f31c0a
    Date:        2023-11-02
2 leaks found

# Was a committed .env ever tracked, even if it is ignored now?
$ git log --all --oneline -- .env .env.local
9f31c0a  Initial deploy config
$ git log -p --all -S 'STRIPE_SECRET' -- . | head -40

# Ignoring a file today does nothing about the objects already in the pack.
$ git rev-list --objects --all | grep '\\.env$'
4a9e1b2f0c .env`,
      ts: `# Drupal audit — the export tree first, then history
$ grep -rEn '(pass(word|wd)?|secret|token|api_?key|key_value|private_key):[[:space:]]*[^ ]' config/sync/ \\
    | grep -v ": ''$" | grep -v ': null$'
config/sync/smtp.settings.yml:14:smtp_password: 'Wint3r-Mailg8n'
config/sync/key.key.stripe.yml:11:  key_value: 'sk_live_51Nq8xR2eZvKY'

# Values that look live regardless of the key name.
$ grep -rE '(sk_live_|AKIA[0-9A-Z]{4}|ghp_|-----BEGIN )' config/sync/

# Anything that ever contained it, on any branch.
$ git log -p --all -S 'sk_live_' -- config/ | head -40

# Is settings.php itself tracked, and does it hold literals?
$ git ls-files sites/default/settings.php
sites/default/settings.php
$ grep -nE "'(password|hash_salt)' *=>" sites/default/settings.php

# Order of operations, always:
#   1. rotate the credential at the provider
#   2. move it to env / Key / the platform store
#   3. re-export so config/sync holds '' and commit
#   4. only then rewrite history (git filter-repo) if you still want to
$ drush config:set smtp.settings smtp_password '' -y && drush cex -y`,
      note: "Step 1 is non-negotiable. Rewriting history invalidates every fork and clone and still leaves the secret in anyone's local reflog, on CI caches and in any mirror — rotation is the only thing that actually revokes it.",
    },
  ],

  playground: {
    intro:
      "Two halves of the same story with no Drupal bootstrap: first audit a parsed config/sync tree for leaked secrets, then resolve the same value through the override layers to see what the site really uses at runtime — and what drush cex would still write.",
    lang: "php",
    code: `<?php
// Pre-flight audit of an exported config/sync tree, plus the override layering
// that decides what the site actually uses at runtime.

// 1. What drush cex wrote to config/sync, keyed by config object name.
$exported = [
  'system.site' => [
    'name' => 'Four Rivers Council',
    'mail' => 'web@example.gov.au',
  ],
  'key.key.stripe' => [
    'key_provider' => 'config',
    'key_provider_settings' => ['key_value' => 'sk_live_51Nq8xR2eZvKY'],
  ],
  'smtp.settings' => [
    'smtp_host' => 'smtp.mailgun.org',
    'smtp_username' => 'postmaster@mg.example.gov.au',
    'smtp_password' => 'Wint3r-Mailg8n',
  ],
  'search_api.server.solr' => [
    'backend_config' => ['connector_config' => ['host' => 'solr', 'port' => 8983]],
  ],
  'four_rivers.settings' => [
    'api_token' => '',
    'endpoint' => 'https://api.example.gov.au/v2',
  ],
];

// 2. Two independent rules: a secret-shaped key name, or a value that looks
//    like a live credential no matter what it is called.
$suspicious_name = '/(password|passwd|secret|token|api[_-]?key|key_value|private_key|credential)$/i';
$secret_shaped = '/^(sk_live_|sk_test_|AKIA[0-9A-Z]{4}|ghp_|xox[baprs]-|-----BEGIN )/';

function flatten(array $tree, string $prefix = ''): array {
  $flat = [];
  foreach ($tree as $k => $v) {
    $path = $prefix === '' ? (string) $k : $prefix . '.' . $k;
    if (is_array($v)) {
      $flat = array_merge($flat, flatten($v, $path));
    }
    else {
      $flat[$path] = $v;
    }
  }
  return $flat;
}

$findings = [];
foreach ($exported as $name => $data) {
  foreach (flatten($data) as $path => $value) {
    // An empty string is a *correctly* sanitised export: leave it alone.
    if (!is_string($value) || $value === '') {
      continue;
    }
    if (preg_match($secret_shaped, $value)) {
      $findings[] = [$name . ':' . $path, 'value carries a live-credential prefix'];
    }
    elseif (preg_match($suspicious_name, $path)) {
      $findings[] = [$name . ':' . $path, 'secret-shaped key holds a literal'];
    }
  }
}

echo "== config/sync audit ==\\n";
foreach ($findings as [$where, $why]) {
  printf("  LEAK  %-46s %s\\n", $where, $why);
}
echo '  ' . count($findings) . " item(s) must never reach git.\\n\\n";

// 3. Where that SMTP password belongs instead, and how it resolves at runtime.
putenv('SMTP_PASSWORD=Wint3r-Mailg8n');

// NULL below means "this layer does not set the key at all". A module's
// config/install YAML is NOT one of these layers: it was copied into active
// storage when the module was installed and is never read again.
$layers = [
  // Active storage, loaded by drush cim from the sanitised export.
  'active storage' => '',
  // ConfigFactoryOverrideInterface implementations (language, etc.).
  'module override' => NULL,
  // settings.php: $config['smtp.settings']['smtp_password'] = getenv('SMTP_PASSWORD');
  'settings.php override' => getenv('SMTP_PASSWORD') ?: '',
];

echo "== effective value of smtp.settings:smtp_password ==\\n";
$effective = '';
$source = 'nowhere (mail would fail)';
foreach ($layers as $layer => $candidate) {
  printf("  %-22s %s\\n", $layer, var_export($candidate, TRUE));
  // Config deep-merges each override over storage, it does not coalesce: the
  // highest layer that SETS the key wins even when it sets it to ''. Unset the
  // environment variable and the password becomes '' -- it does not fall back.
  if ($candidate !== NULL) {
    $effective = $candidate;
    $source = $layer;
  }
}

echo "\\n  winning layer : " . $source . "\\n";
echo '  length seen by the SMTP client : ' . strlen($effective) . "\\n";
// Overrides live outside the config factory's stored data, so the exporter
// cannot see them -- re-exporting on this box still writes the empty string.
echo '  drush cex would still write : ' . var_export('', TRUE) . "\\n";
`,
    output: `== config/sync audit ==
  LEAK  key.key.stripe:key_provider_settings.key_value value carries a live-credential prefix
  LEAK  smtp.settings:smtp_password                    secret-shaped key holds a literal
  2 item(s) must never reach git.

== effective value of smtp.settings:smtp_password ==
  active storage         ''
  module override        NULL
  settings.php override  'Wint3r-Mailg8n'

  winning layer : settings.php override
  length seen by the SMTP client : 14
  drush cex would still write : ''
`,
  },

  keyPoints: [
    "Exported config is committed, cloned and deployed everywhere identically, so it must never contain a credential, token or key value — only the shape of the setting, with the value supplied at runtime.",
    "settings.php is plain PHP that is neither exported nor imported: $databases holds connection credentials, $settings holds non-config runtime values (hash_salt, trusted_host_patterns, file_private_path, config_sync_directory, reverse_proxy*), and $config holds read-time overrides of real config objects.",
    "$config overrides layer on top of active storage when config is read and are invisible to the exporter, so a site can run with a real password while config/sync keeps an empty string — but getEditable() ignores overrides, so admin forms show the stored value, not the running one.",
    "settings.local.php must be gitignored while a committed example.settings.local.php documents which overrides exist; core ships sites/example.settings.local.php and a commented conditional include at the end of default.settings.php.",
    "When config must reference a secret, the Key module's key.key.* entity exports a pointer (file path, State key, environment variable) rather than the value, and the pointer itself can be overridden per environment in settings.php.",
    "Audit history, not just HEAD: grep config/sync for secret-shaped keys and live-credential prefixes, use git log -S across all branches, and always rotate the credential before attempting to scrub it.",
  ],

  interview: [
    {
      q: "A teammate committed an SMTP password in config/sync and pushed to a shared branch. Walk me through what you do.",
      a: `Rotate first, everything else second. The moment it hit a shared remote it exists in every clone, every CI cache and any mirror, so the only action that actually revokes it is changing the password at the provider. Then I move the value out of config: set \`$config['smtp.settings']['smtp_password'] = getenv('SMTP_PASSWORD');\` in \`settings.php\`, set the variable in each environment's secret store, run \`drush config:set smtp.settings smtp_password ''\` and re-export so the YAML holds an empty string. Only after that would I consider rewriting history with \`git filter-repo\`, and I'd treat it as tidying rather than remediation — it invalidates everyone's clones and still doesn't reach reflogs or forks. Finally I'd add a secret scanner to CI so the next one fails the pipeline instead of the postmortem.`,
    },
    {
      q: "How is Drupal's settings.php different from Symfony's .env, and what maps to what?",
      a: `Both are the machine-specific layer that the framework's versioned configuration deliberately excludes, but Symfony resolves env vars *inside* the container using \`%env(VAR)%\` placeholders, whereas Drupal has no placeholder syntax in YAML at all — \`settings.php\` is executed PHP, so you call \`getenv()\` yourself and assign into \`$databases\`, \`$settings\` or \`$config\`. \`.env\` (committed, safe defaults) maps to a committed \`example.settings.local.php\`; \`.env.local\` (gitignored, real values) maps to \`settings.local.php\`. Symfony's secrets vault, where encrypted blobs are committed and only the decryption key is injected, has no core Drupal equivalent — the closest is the contributed Key module plus Encrypt. One Drupal-specific subtlety: \`$settings\` and \`$config\` are different mechanisms. \`$settings['hash_salt']\` is not configuration and will never appear in an export, while \`$config['x.y']['z']\` overrides a real config object at read time.`,
    },
    {
      q: "An editor reports that the SMTP settings form shows an empty password even though mail is sending fine. Explain.",
      a: `That's the expected consequence of a \`settings.php\` override. Config reads through \`ConfigFactory::get()\` return the overridden value, which is what the mail system uses, but \`getEditable()\` deliberately returns the *stored* value with overrides stripped — otherwise saving the form would write the environment's secret straight back into active storage and then into the next export. Config forms use \`getEditable()\` on save. Since Drupal 10.4/11.0, core config forms can show an "overridden configuration" message, but only for elements declared with the \`#config_target\` property (available from 10.2) — most contrib forms, including SMTP's, don't use it, so you get no warning at all. So the form is telling the truth about what is stored; the override is doing its job. The fix is documentation, not code: note in the README which keys are environment-overridden, and where the real value lives.`,
    },
    {
      q: "Which values belong in $settings rather than in exported configuration, and why does the distinction matter for deployment?",
      a: `\`$settings\` is for things that are properties of the *machine*, not of the site: \`hash_salt\`, \`trusted_host_patterns\`, \`file_private_path\`, \`config_sync_directory\`, and the reverse proxy trio \`reverse_proxy\`, \`reverse_proxy_addresses\` and \`reverse_proxy_trusted_headers\`. None of them are configuration objects, so no export contains them and \`drush cim\` cannot change them. That matters at deploy time because it means these can never drift through the config workflow — they drift through whatever provisions the server, so they belong in the same infrastructure code or platform variables that build the environment. It also means an environment that is missing one fails loudly and immediately: a wrong \`trusted_host_patterns\` returns 400s, a missing \`hash_salt\` breaks session and CSRF handling, and a missing \`config_sync_directory\` makes \`drush cex\` refuse to run.`,
    },
  ],

  quiz: [
    {
      question:
        "You set $config['smtp.settings']['smtp_password'] = getenv('SMTP_PASSWORD'); in settings.php on production, then run drush cex there. What does the exported smtp.settings.yml contain for smtp_password?",
      options: [
        "The real password from the environment variable, because cex exports the effective runtime value.",
        "Whatever is in active storage — typically an empty string — because overrides are applied at read time and are invisible to the exporter.",
        "The literal string 'getenv(SMTP_PASSWORD)'.",
        "Nothing: the key is omitted entirely from the export.",
      ],
      answerIndex: 1,
      explain:
        "$config overrides layer on top of active storage when configuration is read through the config factory's normal get(), but they are not part of the stored data. The export reads storage, so it writes whatever cim last put there — which is exactly why this pattern is safe to run on production.",
    },
    {
      question:
        "Which pair of files should be in version control for the local-settings pattern?",
      options: [
        "Commit settings.local.php; gitignore example.settings.local.php.",
        "Commit both, and keep the secrets out of settings.local.php by convention.",
        "Gitignore settings.local.php; commit an example.settings.local.php template.",
        "Gitignore both and document the contents in the wiki.",
      ],
      answerIndex: 2,
      explain:
        "The real file holds machine-specific values and must never be tracked. The committed example file is the only discoverable documentation of which overrides exist — gitignoring both means new developers can't know what to create. Core ships sites/example.settings.local.php for exactly this purpose.",
    },
    {
      question:
        "A Search API server needs a Solr basic-auth password, and the server config entity is exported to config/sync. What is the standard Drupal approach?",
      options: [
        "Put the password in the exported YAML and make the repository private.",
        "Store it with the Key module so the exported key.key.* entity records only a pointer — a file path, State key or environment variable name — and override that pointer per environment in settings.php.",
        "Add the password to $settings['solr_password'], since $settings is never exported.",
        "Base64-encode the password in the YAML so it isn't readable at a glance.",
      ],
      answerIndex: 1,
      explain:
        "Key exists precisely for secrets that configuration must be able to reference by name. The config entity holds the provider and its settings, never the value; consuming code asks the key repository for it at runtime. A private repo is not a secret store, $settings can't be referenced by a config entity, and base64 is encoding, not encryption.",
    },
    {
      question:
        "Which of these is NOT part of exported configuration and therefore has to be provisioned per environment some other way?",
      options: [
        "$settings['trusted_host_patterns']",
        "system.site's site name",
        "The enabled-module list in core.extension",
        "A view's display settings",
      ],
      answerIndex: 0,
      explain:
        "trusted_host_patterns is a $settings value read from settings.php, not a configuration object. Nothing exports it and drush cim never touches it, so it must come from settings.php, an environment variable or your provisioning tooling. Site name, core.extension and views are all ordinary config objects that travel in config/sync.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "config-ignore-and-drift",
  title: "Config Drift & config_ignore",
  part: "Everyday Workflow",
  estMinutes: 12,
  summary:
    "Why production's active config wanders away from the sync directory, how to detect it with drush config:status and a CI gate, and when to reach for config_ignore or config_readonly instead of just telling people to stop clicking.",

  concept: `
## Drift is a Drupal-shaped problem

In Symfony, \`config/packages/*.yaml\` is read from disk on every container
build. There is no second copy of it. Nobody can log into prod and change
\`framework.session.cookie_lifetime\` through a form, because no such form
exists. Deployment overwrites the only source of truth and the question "did
production diverge?" never comes up.

Drupal has two stores: the **active** config (rows in the \`config\` table,
served through the config factory) and the **sync directory** (\`config/sync\`,
in git). The admin UI writes to the active store. Git writes to the sync
directory. **Drift** is the gap between them, and it opens the moment someone
with \`administer site configuration\` edits something on prod at 4pm on a
Friday.

The consequence is not a crash — it is silence. The next \`drush cim\` computes
a diff, sees the prod value differs from the file, and reverts it. The editor's
change disappears with no error and no audit trail. Worse, if the drift is a
new field or view, the importer can fail mid-way on a dependency it did not
expect.

## Detecting it

\`\`\`bash
drush @prod config:status
# Name                     State
# system.site              Different
# views.view.frontpage     Only in DB
\`\`\`

Three states matter: **Different** (both sides have it, values disagree),
**Only in DB** (created on prod, never exported — \`cim\` will delete it), and
**Only in sync dir** (\`cim\` will create it). Run it as a nightly CI job and
alert on anything that is not clean; the command prints "No differences" when
active and sync agree, which is easy to grep for. Detection beats discipline:
the four of you will forget, the client's agency partner never knew.

One caveat that bites later in this lesson: \`config:status\` runs the sync
storage through the **import storage transformer** before comparing, exactly
as \`cim\` does. So once \`config_ignore\` is installed, every object on its
ignore list reports **Identical** no matter how far prod has drifted. To get
an unfiltered picture, set \`$settings['config_ignore_deactivate'] = TRUE;\`
on the environment you are inspecting.

## Policy first, module second

The default answer is: **production UI edits are forbidden**. Config changes
happen in a branch, get reviewed, and ride a deploy. Everything else is an
exception you have to justify.

For the genuine exceptions — a site name marketing owns, a maintenance-mode
flag support flips at 2am, a third-party API key rotated out-of-band —
\`config_ignore\` tells the import/export transformer to leave those objects
alone. Its list supports \`*\` wildcards, \`:\` for a single key inside an
object, \`~\` to carve an exception out of a wildcard, and \`|\` to scope to a
config collection (a language override):

\`\`\`yaml
# config/sync/config_ignore.settings.yml
mode: simple
ignored_config_entities:
  - system.site:name          # just the name key
  - system.maintenance        # whole object
  - 'views.view.*_archive'    # wildcard
  - '~views.view.news_archive'  # ...except this one
\`\`\`

Two sharp edges. First: **ignored config never deploys either.** Pin
\`system.site:name\` and your carefully reviewed change to it in git will sit
there forever. In simple mode the 3.x branch ignores on export as well as
import, so the value also stops appearing in your \`cex\` diffs. Second: never
ignore \`core.extension\` — you would block every module enable that arrives by
import. Use config_split for environment-specific modules instead.

When policy needs teeth, \`config_readonly\` refuses config writes outright.
Guard it so deploys still work:

\`\`\`php
// settings.php on prod
if (PHP_SAPI !== 'cli') {
  $settings['config_readonly'] = TRUE;
}
\`\`\`

The forms go read-only; \`drush cim\` still runs.
`,

  comparisons: [
    {
      label: "Asking \"has production diverged?\"",
      intro:
        "The same question in both stacks. In Symfony it is a filesystem question with a boring answer; in Drupal it is a database-versus-git question that needs a dedicated command.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: config lives only in the release directory.
# Drift can only mean "someone edited files on the server".
ssh deploy@prod 'cd /srv/app/current && git status --porcelain config/'
# (empty — releases are immutable, config/ is baked into the artifact)

# The runtime values are just the compiled container:
ssh deploy@prod 'cd /srv/app/current && bin/console debug:config framework session'

# .env parity is the only real drift risk, and it is compared by key:
ssh deploy@prod 'cd /srv/app/current && bin/console debug:dotenv'`,
      ts: `# Drupal: the active store is in the database, so compare it to git.
drush @prod config:status
# ------------------------ -----------------
#  Name                     State
# ------------------------ -----------------
#  system.site              Different
#  views.view.frontpage     Only in DB
#  block.block.olivero_ad   Only in sync dir

# See exactly which objects an editor changed (there is no core config:diff
# command — config-diff was a Drush 8 command, dropped in Drush 9):
drush @prod cst --state=Different --format=list

# One object, file vs active — --source is the option that picks the storage:
diff <(drush @prod config:get system.site --source=sync) \\
     <(drush @prod config:get system.site --source=active)`,
      note:
        "Symfony's answer is 'the artifact is the config'. Drupal's answer is a three-state comparison: Different, Only in DB, Only in sync dir — each implies a different cim action (update, delete, create). Note that --source=sync|active selects the storage config:get reads; --include-overridden is a different thing entirely (it applies settings.php and module overrides to the active value, which is lesson 04's topic).",
    },
    {
      label: "Locking production down",
      intro:
        "Making the environment refuse writes rather than trusting a wiki page that says 'do not edit prod'.",
      leftLang: "bash",
      rightLang: "php",
      php: `# Symfony: nothing to lock. The container is compiled at build time and
# the release directory is read-only; only var/ is writable.
chown -R deploy:www-data /srv/app/releases/2026-08-11
chmod -R a-w /srv/app/releases/2026-08-11
chmod -R u+w /srv/app/releases/2026-08-11/var

# Secrets are injected, never edited in place:
APP_ENV=prod APP_SECRET="$(vault kv get -field=secret app/prod)" \\
  php-fpm --daemonize

# A "config change" is a new release. There is no other path.`,
      ts: `<?php
// settings.php on prod — config_readonly (contrib).
// Blocks Config::save() so admin forms cannot write, while leaving
// CLI deploys (drush cim, update hooks) working.
if (PHP_SAPI !== 'cli') {
  $settings['config_readonly'] = TRUE;
}

// Bypassing config_ignore entirely (e.g. to prove what a clean import
// would do on a scratch copy of prod):
// $settings['config_ignore_deactivate'] = TRUE;`,
      note:
        "config_readonly turns 'please do not edit prod' into an enforced rule. The PHP_SAPI guard is the standard escape hatch so your deploy pipeline is not locked out along with the editors.",
    },
    {
      label: "Where editor-owned values live",
      intro:
        "Some values genuinely belong to production and must survive a deploy. Symfony solves this by keeping them out of config entirely; Drupal solves it by exempting them from sync.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: anything a human changes at runtime is not config/ at all.
# It is a row in a table, behind an entity and an admin controller.

# config/packages/app.yaml — build-time only, deployed as code
parameters:
  app.default_site_name: 'Riverbank Council'

# The editable value comes from the database via a settings service:
services:
  App\\Settings\\SiteSettings:
    arguments: ['@doctrine.orm.entity_manager', '%app.default_site_name%']

# Secrets stay in the vault, referenced by env var:
# APP_PAYMENTS_KEY=%env(APP_PAYMENTS_KEY)%`,
      ts: `# config/sync/config_ignore.settings.yml
mode: simple
ignored_config_entities:
  # Marketing owns the site name; the slogan still ships from git.
  - system.site:name
  # Support toggles maintenance mode during incidents.
  - system.maintenance
  # Every archive view except the news one is prod-owned.
  - 'views.view.*_archive'
  - '~views.view.news_archive'
  # Only the French override of this object is ignored.
  - 'language.fr|system.site'

# NEVER add core.extension here — module enables arrive by import.
# Use config_split for environment-specific modules.`,
      note:
        "config_ignore's list is order-independent but syntax-heavy: ':' scopes to a key, '*' wildcards the name, '~' un-ignores a match, '|' scopes to a config collection. Every line you add is a value you can no longer deploy.",
    },
    {
      label: "A CI gate that catches drift",
      intro:
        "Nobody remembers to run config:status by hand. Make the pipeline do it and fail loudly on anything unexpected.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml (Symfony) — there is no drift job, because there is
# no runtime config store. The equivalent checks are static:
lint:
  stage: test
  script:
    - php bin/console lint:container
    - php bin/console lint:yaml config/
    - php bin/console doctrine:schema:validate --skip-sync
    # Catch a .env key added in code but missing on the server:
    - php bin/console debug:dotenv --env=prod`,
      ts: `# .gitlab-ci.yml (Drupal) — nightly drift detector
drift:
  stage: verify
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - drush @prod config:status --format=json > status.json
    # Empty JSON object means active == sync for every object.
    - |
      if [ "$(jq 'length' status.json)" != "0" ]; then
        echo "Config drift detected on production:"
        jq -r 'to_entries[] | "  \\(.key): \\(.value.state)"' status.json
        exit 1
      fi
  artifacts:
    when: always
    paths: [status.json]`,
      note:
        "config:status exits 0 whether or not there are differences, so the job has to inspect the output itself. --format=json gives you a machine-readable map of name to state; the plain table prints 'No differences' when clean. One blind spot: config:status applies the import storage transformer before comparing, so once config_ignore is installed every ignored object reports Identical and this job stops reporting the values most likely to be edited on prod — run it against an environment with $settings['config_ignore_deactivate'] = TRUE; if you want an unfiltered drift report.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of what drush cim does on a drifted production site once config_ignore is in play: build the diff, apply the ignore patterns (wildcard, key-scoped, and '~' exceptions), then print both the revert plan and the values that are now permanently stuck.",
    lang: "php",
    code: `<?php

// --- The sync directory (config/sync, in git) — what the deploy will import.
$sync = [
  'contact.settings'         => ['flood' => ['limit' => 5]],
  'node.settings'            => ['use_admin_theme' => true],
  'system.site'              => ['name' => 'Riverbank Council', 'mail' => 'web@riverbank.example'],
  'views.view.event_archive' => ['status' => true],
  'views.view.news_archive'  => ['status' => true],
];

// --- Production's ACTIVE config. Two people have been editing in the UI.
$active = [
  'contact.settings'         => ['flood' => ['limit' => 2]],
  'node.settings'            => ['use_admin_theme' => true],
  'system.site'              => ['name' => 'Riverbank Council - storm response', 'mail' => 'press@riverbank.example'],
  'views.view.event_archive' => ['status' => false],
  'views.view.news_archive'  => ['status' => false],
];

// --- config_ignore.settings (simple mode). '*' = wildcard, ':' = single key,
//     '~' = exception (this one is NOT ignored after all).
$patterns = [
  'system.site:name',
  'contact.settings',
  'views.view.*_archive',
  '~views.view.news_archive',
];

function wildcard_match(string $pattern, string $subject): bool {
  return (bool) preg_match('/^' . str_replace('\\\\*', '.*', preg_quote($pattern, '/')) . '$/', $subject);
}

/** Returns 'all', a list of ignored keys, or [] when nothing is ignored. */
function ignored_for(string $name, array $patterns) {
  foreach ($patterns as $pattern) {
    if ($pattern[0] === '~' && wildcard_match(substr($pattern, 1), $name)) {
      return [];
    }
  }
  $keys = [];
  foreach ($patterns as $pattern) {
    if ($pattern[0] === '~') {
      continue;
    }
    [$name_pattern, $key] = array_pad(explode(':', $pattern, 2), 2, null);
    if (!wildcard_match($name_pattern, $name)) {
      continue;
    }
    if ($key === null) {
      return 'all';
    }
    $keys[] = $key;
  }
  return $keys;
}

function show($v): string {
  return is_bool($v) ? ($v ? 'true' : 'false') : var_export($v, true);
}

// Note: this is the RAW diff. "drush config:status" would not show it this
// way — it runs sync storage through the import transformer first, so the
// ignored objects below report Identical there.
echo "raw drift (active config vs the YAML in git)\\n";
echo str_repeat('-', 52) . "\\n";
foreach ($sync as $name => $data) {
  $state = $data == $active[$name] ? 'Identical' : 'Different';
  echo str_pad($name, 28) . $state . "\\n";
}

echo "\\nimport plan once config_ignore is applied\\n";
echo str_repeat('-', 52) . "\\n";
$stuck = [];
foreach ($sync as $name => $data) {
  $ignored = ignored_for($name, $patterns);
  if ($ignored === 'all') {
    if ($data != $active[$name]) {
      $stuck[] = $name;
    }
    echo str_pad($name, 28) . "SKIP  entire object is ignored\\n";
    continue;
  }
  foreach ($data as $key => $value) {
    if ($value === $active[$name][$key]) {
      continue;
    }
    if (in_array($key, $ignored, true)) {
      echo str_pad($name, 28) . 'KEEP  ' . $key . ' = ' . show($active[$name][$key]) . "\\n";
      $stuck[] = $name . ':' . $key;
    }
    else {
      echo str_pad($name, 28) . 'REVERT ' . $key . ': ' . show($active[$name][$key])
        . ' -> ' . show($value) . "\\n";
    }
  }
}

echo "\\nthe sharp edge: ignored means it never deploys either\\n";
echo str_repeat('-', 52) . "\\n";
foreach ($stuck as $item) {
  echo "  " . $item . " is pinned to prod's value; your git change will never land\\n";
}
`,
    output: `raw drift (active config vs the YAML in git)
----------------------------------------------------
contact.settings            Different
node.settings               Identical
system.site                 Different
views.view.event_archive    Different
views.view.news_archive     Different

import plan once config_ignore is applied
----------------------------------------------------
contact.settings            SKIP  entire object is ignored
system.site                 KEEP  name = 'Riverbank Council - storm response'
system.site                 REVERT mail: 'press@riverbank.example' -> 'web@riverbank.example'
views.view.event_archive    SKIP  entire object is ignored
views.view.news_archive     REVERT status: false -> true

the sharp edge: ignored means it never deploys either
----------------------------------------------------
  contact.settings is pinned to prod's value; your git change will never land
  system.site:name is pinned to prod's value; your git change will never land
  views.view.event_archive is pinned to prod's value; your git change will never land
`,
  },

  keyPoints: [
    "Drift is the gap between Drupal's active config (database) and the sync directory (git); Symfony has no equivalent because there is no runtime config store to diverge from.",
    "The failure mode is silence: drush cim reverts the prod edit with no error, or fails mid-import on a dependency that only exists in the database.",
    "drush config:status reports three actionable states — Different, Only in DB (cim will delete it), Only in sync dir (cim will create it) — and prints 'No differences' when clean.",
    "The default policy is 'no config edits on production'; config_ignore is for the small set of genuine exceptions, not a way to avoid that conversation.",
    "config_ignore patterns support '*' wildcards, ':' for a single key, '~' to exempt a match, and '|' to scope to a config collection — and the 3.x simple mode ignores on export as well as import.",
    "Anything you ignore can no longer be deployed to; never ignore core.extension (use config_split for environment-specific modules), and use config_readonly with a PHP_SAPI !== 'cli' guard when you need enforcement rather than etiquette.",
  ],

  interview: [
    {
      q: "What is config drift in Drupal, and why does the equivalent problem not exist in a Symfony app?",
      a: "Drupal keeps configuration in two places: the **active** store (rows in the \`config\` table, read through the config factory) and the **sync directory** (\`config/sync\` YAML in git). The admin UI writes to the active store, so any privileged user can change production's real configuration without touching the repository — that gap is drift. In Symfony, \`config/packages/*.yaml\` is compiled into the container at build time and there is no admin form that writes it back, so the deployed artifact is the only source of truth. The practical consequence in Drupal is that the next \`drush cim\` silently reverts the editor's change, or fails partway through if the drift introduced a new object other config now depends on. This is why a Drupal deployment process needs an explicit drift policy and a detection step, and a Symfony one does not.",
    },
    {
      q: "You inherit a site where the marketing team edits the site name on production. How do you handle it?",
      a: "First establish the policy question: is this a legitimate exception, or a habit to break? If the business genuinely owns that value at runtime, add it to \`config_ignore\` scoped to the single key — \`system.site:name\` — rather than ignoring the whole \`system.site\` object, so the slogan and site email still ship from git. Then document the trade-off loudly: an ignored value can no longer be deployed, so a future change to the site name in the repository will never reach production and, in config_ignore 3.x simple mode, it will stop showing up in \`drush cex\` diffs too. If the edits turn out to be casual rather than owned, the better fix is \`config_readonly\` on production plus a normal review-and-deploy path. Either way, add a scheduled \`drush @prod config:status\` job so you find out about the next surprise from CI, not from a broken deploy.",
    },
    {
      q: "How would you detect drift automatically, and what would you do with a 'Only in DB' result?",
      a: "Run \`drush @prod config:status --format=json\` on a schedule and fail the job when the result is non-empty; the table format prints 'No differences' when active and sync agree, but the command exits 0 either way, so the pipeline has to inspect the output rather than rely on the exit code. **Only in DB** means the object exists on production but not in the sync directory, so the next import will *delete* it — typically someone created a view, a text format or a field through the UI. The response is to investigate before deploying: either export it properly into a branch and get it reviewed, or confirm it was a mistake and let the import remove it. Treating that state as a hard build failure is what prevents an editor's afternoon of work vanishing during a Thursday release.",
    },
  ],

  quiz: [
    {
      question:
        "A developer adds \`system.site:name\` to config_ignore on production. What happens when the team later changes the site name in \`config/sync/system.site.yml\` and deploys?",
      options: [
        "The new name is imported normally; config_ignore only affects the UI.",
        "The import fails with a config dependency error.",
        "The name stays at production's current value — ignored config is not imported.",
        "The name is imported but reverts on the next cron run.",
      ],
      answerIndex: 2,
      explain:
        "config_ignore works by transforming the storage the importer compares against, so an ignored key is excluded from the import diff entirely. The production value wins permanently. This is the single most common surprise with the module: ignoring a value also means you can never deploy that value again.",
    },
    {
      question:
        "\`drush @prod config:status\` reports \`views.view.incidents  Only in DB\`. What will the next \`drush cim\` do to that view?",
      options: [
        "Create it in the sync directory automatically.",
        "Delete it, because it exists in the active store but not in the sync directory.",
        "Leave it alone; cim only updates objects present on both sides.",
        "Merge it with the sync version key by key.",
      ],
      answerIndex: 1,
      explain:
        "Config import makes the active store match the sync directory exactly. 'Only in DB' means someone created the view on production without exporting it, so the import treats it as a deletion. Export it into a reviewed branch before deploying, or it disappears.",
    },
    {
      question:
        "Which line should never appear in \`config_ignore.settings.yml\`?",
      options: [
        "system.site:name",
        "core.extension",
        "'views.view.*_archive'",
        "'~views.view.news_archive'",
      ],
      answerIndex: 1,
      explain:
        "\`core.extension\` records which modules and themes are installed. Ignoring it means a config import can no longer enable or uninstall anything on that environment, which breaks deploys in a confusing way. Environment-specific module sets belong in config_split instead.",
    },
    {
      question:
        "You set \`$settings['config_readonly'] = TRUE;\` unconditionally on production. What breaks?",
      options: [
        "Nothing — config_readonly only affects admin forms.",
        "Anonymous page caching, because config writes are part of the render pipeline.",
        "Your deployment: drush config:import and update hooks that save config are blocked too.",
        "Config export, but import still works.",
      ],
      answerIndex: 2,
      explain:
        "config_readonly blocks configuration writes wherever they come from, including CLI. The conventional fix is to guard it with \`if (PHP_SAPI !== 'cli')\` so the admin UI is locked while drush deploys and update hooks continue to work.",
    },
  ],
};

export default lesson;

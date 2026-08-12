import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "multisite-and-scale",
  title: "Many Sites, One Codebase",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "Drupal multisite gives you one codebase and N independent databases — which also means N sync directories, N update paths and N chances for a deploy to half-finish, so you need a loop, a distribution mechanism and an honest answer to whether you needed multisite at all.",

  concept: `
Your team of four now has to ship five sites. In Symfony you would barely call
this a question: build one artefact, deploy it five times, give each instance its
own \`DATABASE_URL\` and its own secrets. Five deployments of one app. Drupal can
do exactly that too — and it is usually the right answer — but it also ships a
mode Symfony has no equivalent of, and you will be asked about it.

## How multisite actually works

One docroot, one \`vendor/\`, one set of modules and themes. What varies is the
\`sites/\` directory — and multisite is **opt-in**, with a file as the switch. On
every request \`DrupalKernel::findSitePath()\` checks for \`sites/sites.php\` before
it looks at anything else: if that file is absent it returns \`sites/default\`
immediately and no per-host directory is ever searched for, even when
\`sites/careers.example.com/settings.php\` exists. That is the multisite bug people
lose an afternoon to — every host quietly serving the default site.

When \`sites.php\` is present, core builds candidate identifiers shaped like
\`<port>.<host>.<path>\`, stripping the hostname left-to-right and the path
right-to-left, most specific first. For each candidate it maps the identifier
through the \`$sites\` array, then looks for \`sites/<identifier>/settings.php\`;
first match wins, otherwise \`sites/default\`. So \`$sites\` is not a separate pass
checked "first" — it is an alias applied to each candidate inside the same loop,
which is how \`careers.localhost\` on your laptop reaches the same directory as
\`careers.example.com\` in production. (\`getSitePath()\` is only the cached accessor
that hands back the already-resolved path once the kernel exists.)

Each site directory holds a \`settings.php\` with its **own** \`$databases\` array and
its **own** \`$settings['config_sync_directory']\`. That is the whole trick, and it
is also the whole problem: config is per site because the active config store
lives in the site's database.

## N sync directories

There is no fleet-wide \`drush cim\`. A change to a shared content type is a change
you must land in five sync directories and import five times. Teams solve this
three ways:

- **Copy on export.** A script exports one site and rsyncs the diff into the other
  sync directories. Cheap, and it silently overwrites per-site divergence.
- **A shared split.** One \`config/shared\` directory imported everywhere plus a
  per-site sync directory, wired with config_split. Explicit about what is common.
- **A recipe.** Package the shared change as a recipe and apply it once per site.
  Recipes are one-shot actions, not subscriptions: editing the recipe later does
  not retroactively update sites that already ran it, you re-run it.

## The loop, and partial failure

Modern Drush has no \`@sites\` shorthand for "every site here" — that was a Drush 8
feature. You write the loop yourself, passing \`--uri\` (or a site alias) per site,
and you decide what happens when site three fails. Schema versions live in each
site's database, so \`drush updatedb\` genuinely has to run once per site, and site
one can be three update hooks ahead of site four. There is no transaction across
sites: a failed loop leaves the fleet in mixed states, and your recovery is "fix
the cause, re-run the loop" — which only works because import and update hooks are
idempotent.

## Domain Access, and when multisite is a trap

If the "sites" are really one site with several front doors — shared users,
shared content, shared editorial team — the Domain Access contrib module keeps a
single install, single database and single config, and filters content and
settings per domain. One deploy, one update path. Check its current release
status against your core version before betting a project on it.

Multisite pays when the sites are genuinely the same site with different content
and a small owner. It becomes a trap when needs diverge (one site wants a module
that breaks another), when a noisy neighbour's cron eats the shared PHP workers,
or when one bad deploy takes down all five at once with no way to roll back just
the broken one. Separate installs sharing a repo cost more infrastructure and buy
you blast-radius isolation. Say that out loud in an interview.
`,

  comparisons: [
    {
      label: "Where a site's identity lives",
      intro:
        "Same goal — five deployments of one codebase, each with its own database. Symfony varies the environment per container; Drupal varies a directory inside the docroot.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Symfony: one image, five instances. Identity is injected.
# docker-compose.prod.yml (or five ECS task definitions)
services:
  marketing:
    image: registry.example.com/app:2026.08.11
    environment:
      APP_ENV: prod
      DATABASE_URL: 'postgresql://app:\${MKT_DB_PW}@db/marketing'
      SITE_NAME: 'Marketing'

  careers:
    image: registry.example.com/app:2026.08.11
    environment:
      APP_ENV: prod
      DATABASE_URL: 'postgresql://app:\${CAR_DB_PW}@db/careers'
      SITE_NAME: 'Careers'

# The app never asks "which site am I?" - the container knows.
# Nothing is shared at runtime except the image digest.`,
      ts: `<?php
// Drupal multisite: one docroot. Identity is resolved per request.

// web/sites/sites.php - this file MUST exist or multisite is off:
// findSitePath() returns sites/default without ever looking for a
// per-host directory. It must exist even if $sites stays empty.
$sites = [
  // Local dev hostnames pointing at the production site directories.
  'careers.localhost'   => 'careers.example.com',
  'marketing.localhost' => 'marketing.example.com',
];

// web/sites/careers.example.com/settings.php
$databases['default']['default'] = [
  'driver'    => 'mysql',
  'database'  => 'careers',
  'username'  => getenv('DB_USER'),
  'password'  => getenv('CAREERS_DB_PASSWORD'),
  'host'      => 'db',
  'prefix'    => '',
];

// Per-site sync directory - this is why config is never fleet-wide.
$settings['config_sync_directory'] = '../config/careers/sync';
$settings['file_public_path'] = 'sites/careers.example.com/files';
$settings['hash_salt'] = getenv('CAREERS_HASH_SALT');`,
      note:
        "Drupal picks the site by hostname at request time, but only if sites/sites.php exists — no sites.php means sites/default, full stop. With it present, each candidate identifier is mapped through $sites and then matched against a sites/<id>/settings.php, most specific first. Get that mapping wrong in CI and you will happily run drush cim against the wrong database.",
    },
    {
      label: "Applying one change everywhere",
      intro:
        "The shared content type changed. Symfony's deploy pipeline fans out over instances; in Drupal you write the same fan-out by hand and have to decide what a mid-loop failure means.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Symfony: the pipeline already deploys per instance, so "many sites"
# is just more matrix cells. Each one is independent and isolated.
set -euo pipefail

for INSTANCE in marketing support careers events; do
  echo "--- deploying $INSTANCE ---"
  # Each instance has its own container, own DB, own migration table.
  docker compose -f "deploy/$INSTANCE.yml" up -d --no-deps app
  docker compose -f "deploy/$INSTANCE.yml" exec -T app \\
    bin/console doctrine:migrations:migrate --no-interaction
  docker compose -f "deploy/$INSTANCE.yml" exec -T app \\
    bin/console cache:clear
done

# A failure in "careers" stops the loop but cannot corrupt "marketing":
# nothing is shared. Re-run just the failed cell from CI.`,
      ts: `#!/usr/bin/env bash
# Drupal multisite: one codebase is already live for every site the
# moment you deploy it. The loop only catches config and schema up.
set -uo pipefail

SITES=(marketing.example.com support.example.com \\
       careers.example.com events.example.com)
FAILED=()

for URI in "\${SITES[@]}"; do
  echo "--- $URI ---"
  # drush deploy = updatedb, cache:rebuild, config:import, deploy hooks.
  if ! drush --uri="https://$URI" --yes deploy; then
    echo "!! $URI failed - continuing so one site cannot block the rest"
    FAILED+=("$URI")
  fi
done

if (( \${#FAILED[@]} )); then
  printf 'FAILED: %s\\n' "\${FAILED[*]}"
  exit 1
fi

# Modern Drush has no "@sites" shorthand - you own this loop, including
# whether it stops on first failure or drains the queue and reports.`,
      note:
        "New code goes live for all sites at once; only config and schema are per site. That window — new code, old schema, on four databases — is the multisite deploy risk in one sentence.",
    },
    {
      label: "Shipping a shared feature",
      intro:
        "A packaged, repeatable way to add the same thing to several codebases. Symfony has Flex recipes; Drupal 11 has recipes as a core feature.",
      leftLang: "js",
      rightLang: "yaml",
      php: `// Symfony Flex recipe: manifest.json in the recipes repo.
// "composer require acme/editorial-bundle" copies these files in
// and registers the bundle - once, per project.
{
  "bundles": {
    "Acme\\\\EditorialBundle\\\\AcmeEditorialBundle": ["all"]
  },
  "copy-from-recipe": {
    "config/": "%CONFIG_DIR%/"
  },
  "env": {
    "EDITORIAL_REVIEW_MAILBOX": "editors@example.com"
  }
}

// Applied at composer time, into the filesystem. Each project that
// requires the bundle gets it once; upgrading the bundle later does
// not re-run the recipe.`,
      ts: `# Drupal recipe: recipes/editorial_workflow/recipe.yml
# Applied per site, against the site's database.
name: 'Team editorial workflow'
description: 'Moderation states and the review queue every site shares.'
type: 'Workflow'

install:
  - content_moderation
  # The moderated_content view depends on Node.
  - node
  - views

config:
  # If the config already exists on this site, do not fight it.
  strict: false
  import:
    content_moderation:
      - views.view.moderated_content
  actions:
    system.site:
      simpleConfigUpdate:
        slogan: 'Reviewed before it ships'

# Apply it once per site, then export that site's config so the change
# is captured in that site's sync directory. Drush is what targets a
# site: -l/--uri is "a base URL for building links and selecting a
# multi-site", so it picks the right database.
#   drush --uri=https://careers.example.com recipe recipes/editorial_workflow
#   drush --uri=https://careers.example.com cex
#
# Drush 13+ re-exposes core's own command; on Drupal 11.4+ it is named
# recipe:apply with "recipe" as the alias. The bare core script is not a
# per-site tool: on 11.3 and older "php core/scripts/drupal recipe ..."
# always boots sites/default, and in 11.4+ that script is deprecated for
# core/scripts/dr, which needs --url to select a site.`,
      note:
        "The shapes match: a declarative package applied once per target. The difference is where it lands — Flex writes files into a project, a Drupal recipe writes config into one site's database, so a fleet of five sites means five applications.",
    },
    {
      label: "Letting one site differ",
      intro:
        "Careers needs a module the other four must not have. Symfony varies by environment; Drupal has to vary by site, which config split handles and settings.php overrides finish.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Symfony: variation is a first-class dimension of config.
# config/packages/prod/monolog.yaml applies to every prod instance;
# per-instance differences come from environment variables.
parameters:
  app.job_board_enabled: '%env(bool:APP_JOB_BOARD)%'

services:
  Acme\\JobBoard\\Listing:
    arguments:
      $enabled: '%app.job_board_enabled%'

# Careers sets APP_JOB_BOARD=1, everyone else leaves it 0.
# One codebase, one config tree, a boolean per deployment.`,
      ts: `<?php
// Drupal: "enabled modules" is itself config (core.extension), and it
// lives in each site's database. So variation is a config-split problem.

// web/sites/careers.example.com/settings.php
$settings['config_sync_directory'] = '../config/careers/sync';

// The shared baseline every site imports, then the site's own layer.
$config['config_split.config_split.shared']['status'] = TRUE;
$config['config_split.config_split.careers']['status'] = TRUE;

// Truly per-site values that must never be exported (keys, endpoints)
// stay as runtime overrides, exactly as on a single site.
$config['system.site']['name'] = 'Acme Careers';
$config['jobboard.settings']['feed_endpoint'] = getenv('JOBBOARD_FEED');

// web/sites/marketing.example.com/settings.php
$config['config_split.config_split.shared']['status'] = TRUE;
$config['config_split.config_split.careers']['status'] = FALSE;`,
      note:
        "Once two sites disagree about core.extension you no longer have one config set with knobs — you have N config sets that happen to overlap. That divergence is the cost curve that eventually kills a multisite.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the fleet loop: four sites, one shared change, each with its own active config and its own enabled modules. Read the plan per site, then look at what a mid-loop failure leaves behind.",
    lang: "php",
    code: `<?php
// One shared change, four sites, four separate active config stores.
// This is what "apply it N times" actually means.

$change = [
  'label' => 'Editorial workflow rollout',
  'items' => [
    'workflows.workflow.editorial' => ['hash' => 'a1', 'needs' => ['content_moderation']],
    'views.view.moderated_content' => ['hash' => 'b2', 'needs' => ['views', 'node']],
    'system.site'                  => ['hash' => 'c3', 'needs' => []],
  ],
];

// Each site owns its database, its sync directory and its enabled modules.
$fleet = [
  'marketing' => [
    'uri'     => 'https://marketing.example.com',
    'modules' => ['node', 'views', 'content_moderation'],
    'active'  => ['system.site' => 'c0'],
  ],
  'support' => [
    'uri'     => 'https://support.example.com',
    'modules' => ['node', 'views', 'content_moderation'],
    'active'  => ['system.site' => 'c3', 'workflows.workflow.editorial' => 'a1'],
  ],
  'careers' => [
    'uri'     => 'https://careers.example.com',
    // content_moderation was never enabled on this one.
    'modules' => ['node', 'views'],
    'active'  => ['system.site' => 'c0'],
  ],
  'events' => [
    'uri'     => 'https://events.example.com',
    'modules' => ['node', 'views', 'content_moderation'],
    'active'  => ['system.site' => 'c0'],
  ],
];

function planFor(array $site, array $change): array {
  $plan = [];
  $blockers = [];
  foreach ($change['items'] as $name => $item) {
    $missing = array_values(array_diff($item['needs'], $site['modules']));
    if ($missing) {
      $blockers[] = $name . ' needs ' . implode(', ', $missing);
      continue;
    }
    $current = $site['active'][$name] ?? NULL;
    if ($current === NULL) {
      $plan[$name] = 'create';
    }
    elseif ($current !== $item['hash']) {
      $plan[$name] = 'update';
    }
    else {
      $plan[$name] = 'identical';
    }
  }
  return [$plan, $blockers];
}

echo '== ' . $change['label'] . " ==\\n\\n";

$applied = [];
$failed = NULL;
$skipped = [];

foreach ($fleet as $name => $site) {
  if ($failed !== NULL) {
    $skipped[] = $name;
    continue;
  }
  [$plan, $blockers] = planFor($site, $change);
  echo '--uri=' . $site['uri'] . "\\n";
  foreach ($plan as $config => $verb) {
    printf("  %-9s %s\\n", $verb, $config);
  }
  if ($blockers) {
    foreach ($blockers as $blocker) {
      echo '  BLOCKED   ' . $blocker . "\\n";
    }
    echo "  import aborted: unmet dependency\\n\\n";
    $failed = $name;
    continue;
  }
  $changed = count(array_filter($plan, fn ($verb) => $verb !== 'identical'));
  printf("  import ok: %d changed, %d identical\\n\\n", $changed, count($plan) - $changed);
  $applied[] = $name;
}

echo "Fleet state after one pass of the loop\\n";
echo '  applied:   ' . (implode(', ', $applied) ?: 'none') . "\\n";
echo '  failed:    ' . ($failed ?? 'none') . "\\n";
echo '  never ran: ' . (implode(', ', $skipped) ?: 'none') . "\\n\\n";
echo "Three different states, no transaction across sites. Fix careers,\\n";
echo "then re-run the whole loop: import is idempotent, so the sites that\\n";
echo "already succeeded are no-ops the second time around.\\n";
`,
    output: `== Editorial workflow rollout ==

--uri=https://marketing.example.com
  create    workflows.workflow.editorial
  create    views.view.moderated_content
  update    system.site
  import ok: 3 changed, 0 identical

--uri=https://support.example.com
  identical workflows.workflow.editorial
  create    views.view.moderated_content
  identical system.site
  import ok: 1 changed, 2 identical

--uri=https://careers.example.com
  create    views.view.moderated_content
  update    system.site
  BLOCKED   workflows.workflow.editorial needs content_moderation
  import aborted: unmet dependency

Fleet state after one pass of the loop
  applied:   marketing, support
  failed:    careers
  never ran: events

Three different states, no transaction across sites. Fix careers,
then re-run the whole loop: import is idempotent, so the sites that
already succeeded are no-ops the second time around.
`,
  },

  keyPoints: [
    "Multisite shares the codebase and nothing else: each site directory under sites/ carries its own settings.php with its own $databases and its own $settings['config_sync_directory'], so active config is per site by construction.",
    "sites/sites.php is the opt-in switch for multisite: DrupalKernel::findSitePath() returns sites/default immediately if the file is missing. With it present, core walks candidate identifiers (hostname stripped left-to-right, path right-to-left, most specific first), maps each through $sites, then looks for sites/<id>/settings.php — which is how local hostnames map onto production site directories.",
    "One shared config change is N imports. Distribute it with a shared config split, a scripted export fan-out, or a recipe applied once per site — and remember a recipe is a one-shot action, not a live subscription.",
    "Modern Drush has no @sites shorthand: you write the loop with --uri or per-site aliases, and you choose whether it stops on the first failure or drains and reports. Schema versions are per database, so updatedb genuinely runs once per site.",
    "There is no transaction across sites — a failed loop leaves a mixed fleet, and recovery relies on config import and update hooks being idempotent so re-running is safe.",
    "Domain Access (one install, one database, one config, filtered per domain) fits when the sites are really one site with several front doors; separate installs sharing a repo cost more infrastructure and buy blast-radius isolation, which is usually the better trade.",
  ],

  interview: [
    {
      q: "We run twelve sites. Would you use Drupal multisite, separate installs, or Domain Access?",
      a: "I would start by asking how similar the sites really are and who owns them. **Domain Access** fits when they are one site with several front doors — shared users, shared content, one editorial team — because it keeps one database, one config set and one update path. **Multisite** fits when the sites are structurally identical but must not share content or users, and one team owns all twelve. **Separate installs sharing a repo** is my default otherwise: it costs more infrastructure but each site gets its own deploy, its own rollback and its own blast radius, which is what you actually want the day one site's update hook fails. The question I always ask is \"can we afford to break all twelve at once?\" — because with multisite, one bad deploy of shared code does exactly that.",
    },
    {
      q: "How does config management work across a multisite? Walk me through shipping one change to all sites.",
      a: "Active config lives in each site's database and each site has its own \`config_sync_directory\`, so there is no fleet-wide import — the change has to land in N sync directories and be imported N times. In a repo I would keep a shared baseline plus a per-site layer, wired with config_split, so a common change is one commit to the shared directory that every site's import picks up. For a bigger feature I would package it as a recipe and apply it once per site, then export each site so the result is captured in that site's sync directory. Deployment is a shell loop over \`drush --uri=... deploy\` — modern Drush has no \`@sites\` shorthand, so you own that loop, including failure handling. I would also make the loop continue past a failed site and report at the end, so one broken site cannot leave the other eleven un-deployed.",
    },
    {
      q: "A multisite deploy failed halfway through the loop. What is the state of the fleet and how do you recover?",
      a: "The code is already live everywhere — a deploy publishes one codebase for all sites simultaneously — so what is inconsistent is config and database schema. Sites processed before the failure are fully updated, the failing site is somewhere between — update hooks that ran are recorded, and config import validates the whole changelist up front, so a dependency problem aborts before anything is written, but once the import is actually running there is no transaction, so a crash partway leaves some config objects saved and the rest not — and the rest are running new code against old schema and old config. That last group is the dangerous one, which is why the loop should keep going rather than stop dead. Recovery is: read the actual error, fix the cause in the repo or on that site, then re-run the whole loop — \`drush deploy\` is idempotent, so already-updated sites are no-ops. If the failure is in shared code rather than one site's data, I roll the codebase back first, because every site is exposed to it.",
    },
    {
      q: "What is the performance argument against multisite?",
      a: "All sites share one PHP-FPM pool, one opcache and usually one database server, so they are noisy neighbours by design. A traffic spike or an expensive cron run on the smallest site can starve workers that the flagship site needs, and there is no per-site resource limit to reach for. Caches are per site so the memory cost multiplies, and cron, backups and search indexing all become N jobs on the same box. You can mitigate it — separate PHP pools per vhost, staggered cron, a queue runner per site — but each mitigation chips away at the operational simplicity that was the reason to use multisite in the first place. At that point separate installs are usually cheaper to run and much easier to reason about.",
    },
  ],

  quiz: [
    {
      question:
        "In a Drupal multisite, where does each site's configuration sync directory come from?",
      options: [
        "A single fleet-wide setting in the root settings.php, shared by all sites",
        "$settings['config_sync_directory'] in that site's own sites/<dir>/settings.php",
        "The config module's admin UI, stored in the shared codebase",
        "It is derived automatically from the site's hostname and cannot be changed",
      ],
      answerIndex: 1,
      explain:
        "Every site directory has its own settings.php, and $settings['config_sync_directory'] there points at that site's sync directory. Because active config lives in the site's database, config is per site by construction — which is exactly why a shared change must be imported once per site.",
    },
    {
      question:
        "Your deploy script needs to run updates and import config for four multisite sites. What is the correct approach with modern Drush?",
      options: [
        "Run 'drush @sites deploy' once — Drush fans out to every site automatically",
        "Run 'drush deploy' once from the docroot; it detects all sites in sites/",
        "Loop over the sites, passing --uri (or a per-site alias) to drush deploy for each",
        "Import config once, then run updatedb once — schema versions are shared across the multisite",
      ],
      answerIndex: 2,
      explain:
        "The @sites shorthand was a Drush 8 feature and is not in modern Drush, and a bare drush deploy only targets one site. You write the loop yourself with --uri or site aliases. Schema versions live in each site's database, so updatedb really does have to run once per site.",
    },
    {
      question:
        "A team runs five sites that share users, share a content pool and are edited by one editorial team, but need different domains and branding. Which approach fits best?",
      options: [
        "Multisite: five site directories, five databases, five sync directories",
        "Domain Access: one install, one database, one config set, filtered per domain",
        "Five separate installs sharing a Git repository",
        "One site with five themes and no other changes",
      ],
      answerIndex: 1,
      explain:
        "Shared users and shared content are the giveaway that this is one site with several front doors. Domain Access keeps a single install, database and config set and filters per domain — one deploy and one update path. Multisite would force you to duplicate the users and content it is meant to share.",
    },
    {
      question:
        "You apply a recipe to three of five sites, then edit the recipe to change a default. What happens to the three sites that already ran it?",
      options: [
        "They update automatically the next time cron runs",
        "Nothing — applying a recipe is a one-time action, so you re-run it against those sites",
        "The next drush cim on those sites re-applies the recipe from the codebase",
        "Drupal blocks the edit because the recipe is already in use",
      ],
      answerIndex: 1,
      explain:
        "A recipe is applied once against a site, not subscribed to. Editing it afterwards changes what future applications do; existing sites are untouched until you deliberately re-run it. That is why the workflow is 'apply the recipe, then export that site's config' — the sync directory is what actually holds the site's state.",
    },
  ],
};

export default lesson;

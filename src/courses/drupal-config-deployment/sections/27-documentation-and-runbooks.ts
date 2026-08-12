import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "documentation-and-runbooks",
  title: "Runbooks & Team Conventions",
  part: "Safety & Operations",
  estMinutes: 12,
  summary:
    "Write down the four artefacts that make a Drupal deploy repeatable by someone other than its author — onboarding README, deploy runbook plus its emergency variant, a config-vs-state-vs-code decision record, and an ownership table with a definition of done — and keep them honest by putting them next to the code they describe.",

  concept: `
## Why Drupal needs the paperwork more than Symfony does

In a Symfony app, production behaviour changes when someone merges a commit.
That is a hard technical boundary, and it does most of your governance for
free: the reviewer list, the branch protection rule and the CI pipeline are
the policy. Drupal deliberately removes that boundary. \`/admin\` is a write
interface to **deployable state** — a site builder can add a view, an editor
with the right role can change a text format, a contractor can install a
module — and all of it lands in the active config store, where the next
\`drush cex\` will sweep it into a commit somebody has to review.

So on a Drupal team the social protocol *is* part of the technical system:
what a compiler enforces elsewhere, you enforce with a written convention
plus a CI check that encodes it. Four artefacts carry almost all of that
weight.

### 1. A README that ends at a working site

The test is brutal and specific: a new developer clones the repo and runs
**one** command. Everything else — which PHP version, which database, where
the sanitised dump lives — is that command's problem, not a paragraph of
prose. \`ddev start && ddev import-db --file=... && ddev drush cim -y\` behind
a \`make setup\` target beats three pages of instructions that were true in
March.

### 2. A deploy runbook, and its emergency twin

Two documents, because they are read in different states of mind. The normal
runbook is the ordered sequence with the reasoning: back up, \`drush deploy\`,
smoke test, maintenance mode off. The **emergency runbook** is written for
someone at 02:00 who did not build the site: how to reach production, how to
put it in maintenance mode, where the pre-deploy dump is, the exact restore
command, and — the part everyone forgets — who to wake up. Numbered steps,
no prose, real hostnames.

### 3. A decision record for config vs state vs code

Every Drupal team re-litigates the same question: does this value belong in
exported configuration, in the State API, in \`settings.php\`, or hard-coded?
Write the rule down once, with the reasoning, and stop having the argument.
A short ADR — "0007: API endpoints live in config, credentials live in
environment variables read by settings.php, last-run timestamps live in
state" — is worth more than a wiki page nobody edits.

### 4. Ownership plus a definition of done

Ownership answers "who may change \`views.view.press_releases\`, and where?"
Some config is genuinely editorial's to own and edit in the UI; field storage
and \`system.*\` are not. Encode it in \`CODEOWNERS\` so GitHub enforces the
review, and mirror it in a table people can read.

The definition of done for a config change is the other half: **exported**
(\`drush cst\` clean), **reviewed** as a config diff rather than a rubber
stamp, and **rehearsed** — imported against a copy of the production database,
not just your local one. A change that has not met all three is not done, it
is just working on somebody's laptop.

### Keeping it current

Documentation rots wherever it cannot be executed or reviewed. Keep these
files **in the repo**, so changing them is part of the pull request that
changes the behaviour, and make the pipeline the enforcer where you can: if
the runbook says "config must be exported", a CI job running
\`drush config:status\` proves it on every push. Rehearse the rest — run the
emergency runbook against stage once a quarter and fix the step that turns
out to be wrong.
`,

  comparisons: [
    {
      label: "Onboarding: from clone to working site",
      intro:
        "Both teams want a single command. The difference is what the command has to reconstruct: Symfony builds everything it needs from code, while a Drupal site is not usable until a database exists and configuration has been imported into it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# README.md - Symfony
## Getting started

    make setup

# Makefile
setup:
	composer install
	cp -n .env.local.dist .env.local
	docker compose up -d database
	bin/console doctrine:database:create --if-not-exists
	bin/console doctrine:migrations:migrate --no-interaction
	bin/console doctrine:fixtures:load --no-interaction
	yarn install && yarn build

# The schema comes from migrations, the behaviour
# from config/packages, the sample data from
# fixtures. All of it is in the repo already.`,
      ts: `# README.md - Drupal
## Getting started

    make setup

# Makefile
setup:
	ddev start
	ddev composer install
	# Content is NOT in the repo. Pull the nightly
	# sanitised dump - never a raw prod dump.
	ddev pull acquia --skip-files -y
	ddev drush config:import -y
	ddev drush user:login

# Why the import: the dump carries prod's ACTIVE
# config, which is behind config/sync. Skip cim and
# every new dev starts on last week's settings.`,
      note:
        "The Drupal onboarding path has a step Symfony has no analogue for — importing config into a database that already contains a different version of it. Document the sanitised-dump source too: 'ask Priya for a dump' is how a team ends up with four different local sites.",
    },
    {
      label: "Ownership: who may change what, and where",
      intro:
        "A Symfony team gets ownership almost for free, because everything that changes behaviour is a file. A Drupal team has to state which config is editable in a running site's UI and which is developers-only, then enforce it in two places.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/CODEOWNERS - Symfony
# Every behaviour change is a file change, so the
# review rules are the whole ownership model.
/config/packages/security.yaml   @acme/platform
/config/packages/messenger.yaml  @acme/backend
/migrations/                     @acme/backend
/.github/workflows/              @acme/platform

# There is no second enforcement point: nobody can
# change production behaviour without a commit, so
# CODEOWNERS is not advisory - it is the gate.`,
      ts: `# .github/CODEOWNERS - Drupal
/config/sync/system.*            @acme/ops
/config/sync/field.storage.*     @acme/backend
/config/sync/core.entity_*       @acme/backend
/config/sync/views.view.*        @acme/editorial
/config/sync/user.role.*         @acme/ops
/config/sync/config_split.*      @acme/ops

# Second gate, because the UI is also a writer.
# docs/adr/0009-config-ownership.md records WHY,
# and prod locks the door (contrib config_readonly):
#   if (PHP_SAPI !== 'cli') {
#     $settings['config_readonly'] = TRUE;
#   }
# Guard it: the admin forms go read-only while
# drush cim / drush deploy keep writing. Unguarded
# it blocks CLI too, and there is no bypass flag.
# Editorial-owned prefixes are exempted with
# $settings['config_readonly_whitelist_patterns'].`,
      note:
        "CODEOWNERS only catches config that reaches a pull request. The prod-side lock — config_readonly, or simply not granting 'administer views' in production — is what stops the change being made in the first place. Keep the PHP_SAPI guard on it, or the same lock that stops the editor also stops your deploy, and document which prefixes are deliberately exempt.",
    },
    {
      label: "The decision record: where does a value live?",
      intro:
        "Symfony has essentially two homes for a value: a parameter compiled into the container, or an environment variable. Drupal has four, they behave differently at deploy time, and a team that has not written the rule down will use all four inconsistently.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# docs/adr/0007-configuration-values.md (Symfony)
# Decision: two homes, chosen by "does it differ
# per environment?"

# 1. Same everywhere -> parameter, in the repo,
#    compiled into the container.
parameters:
  app.export_batch_size: 250

services:
  App\\Export\\Exporter:
    arguments:
      $batchSize: '%app.export_batch_size%'
      $apiKey: '%env(EXPORT_API_KEY)%'

# 2. Differs per environment or is secret -> env
#    var, resolved at runtime, never committed.
#    Secrets go in the vault: bin/console
#    secrets:set EXPORT_API_KEY --env=prod`,
      ts: `<?php
// docs/adr/0007-configuration-values.md (Drupal)
// Decision: four homes, and the test for each.

// 1. Config: deployable, same in every env,
//    belongs in the config diff. Exported.
$size = \\Drupal::config('four_rivers.settings')
  ->get('export_batch_size');

// 2. State: runtime bookkeeping. Per-environment,
//    NEVER exported, survives cim untouched.
\\Drupal::state()->set('four_rivers.last_run', time());

// 3. settings.php override: per-environment value
//    for a config key. Wins at read time; cex does
//    NOT capture it, so config/sync stays clean.
$config['four_rivers.settings']['api_base'] =
  'https://sandbox.api.example.com';

// 4. Environment variable: secrets only.
$settings['four_rivers_api_key'] =
  getenv('FOUR_RIVERS_API_KEY');`,
      note:
        "The rule worth writing in one line: if two environments must disagree about it, it is not plain config — it is a settings.php override, state, or an environment variable. Getting this wrong is what produces a config diff that flip-flops on every export.",
    },
    {
      label: "The emergency runbook",
      intro:
        "The document you write for the person who did not build the site and is reading it at 02:00. Symfony's version is short because rollback is symmetric; Drupal's has to say explicitly what a rollback cannot undo.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# docs/EMERGENCY.md (Symfony)
# 1. Roll back the release.
ssh deploy@web-1.acme.internal
ln -sfn /srv/app/releases/r41 /srv/app/current
sudo systemctl reload php8.3-fpm

# 2. If the migration is the problem, reverse it.
cd /srv/app/current
php bin/console doctrine:migrations:migrate \\
  'DoctrineMigrations\\Version20260810120000' \\
  --no-interaction

# 3. Escalate: #acme-platform, then the on-call
#    rota in PagerDuty service "acme-web".
# Migrations have down() - the rollback is
# symmetric and no content is at risk.`,
      ts: `# docs/EMERGENCY.md (Drupal)
# 0. Stop the bleeding FIRST.
ssh deploy@web-1.acme.internal
cd /srv/app/current && drush maint:set 1

# 1. Roll the code back.
ln -sfn /srv/app/releases/r41 /srv/app/current

# 2. Config only, and r42 added no fields/modules?
cd /srv/app/current && drush config:import --diff
# READ THE DELETE LIST before you confirm. Going
# back to r41's export deletes what r42 created:
# a dropped field.storage.* purges that field's
# content, and modules r42 installed get
# uninstalled. Same sign-off as step 3.

# 3. Did this release run update hooks?
#    NOT updatedb:status - it lists only PENDING
#    updates, so it prints nothing either way.
#    Ask what r42 shipped, from a repo clone:
git diff r41..r42 -- '*.install' '*.post_update.php'
# (or read the deploy job's log for its
#  "drush updatedb" step). Non-empty output means
# YES: code rollback alone is NOT enough -
# hooks have no down(). Restore the dump taken
# at 02:14 by the deploy job:
#   gunzip -c /backups/pre-r42.sql.gz | drush sqlc
# COST: every node/order created since 02:14 is
# lost. Get sign-off from @lena before running it.

# 4. drush cr && drush maint:set 0
# 5. Escalate: #acme-drupal, then on-call.`,
      note:
        "The Drupal runbook has to name every irreversible step and its cost, because the person following it at 02:00 cannot be expected to know that hook_update_N has no inverse, or that re-importing an older config/sync deletes what the newer release created — and a deleted field.storage.* takes its stored content with it. Note what the runbook must not say, either: drush updatedb:status answers 'what is still pending', not 'what did this release run', so that question goes to the release itself — its diff, or the deploy job's log. 'Get sign-off before running step 3' is a technical instruction, not politeness.",
    },
  ],

  playground: {
    intro:
      "Conventions that only live in a wiki are suggestions. Here the same team rules — a config ownership table and a definition of done — are expressed as data, so a CI job can apply them to one pull request's config diff and say exactly which rule each change broke.",
    lang: "php",
    code: `<?php

// The team's written conventions, encoded as data so CI can enforce them.
// Each rule names the group that owns a config prefix, and says whether
// editing it in the production UI is sanctioned or counts as drift.
$ownership = [
  'views.view.'    => ['owner' => 'editorial', 'ui_ok' => true],
  'field.storage.' => ['owner' => 'backend',   'ui_ok' => false],
  'system.'        => ['owner' => 'ops',       'ui_ok' => false],
];

// The definition of done for a config change, in the order the runbook lists it.
$definitionOfDone = ['exported', 'reviewed', 'rehearsed_on_prod_copy'];

// One pull request's worth of changed config, plus where each change came from.
$changes = [
  ['name' => 'views.view.press_releases',  'origin' => 'prod-ui',
   'done' => ['exported', 'reviewed']],
  ['name' => 'field.storage.node.embargo', 'origin' => 'local-ui',
   'done' => ['exported', 'reviewed', 'rehearsed_on_prod_copy']],
  ['name' => 'system.performance',         'origin' => 'prod-ui',
   'done' => ['exported']],
];

function ownerOf(array $ownership, string $name): array {
  foreach ($ownership as $prefix => $rule) {
    if (str_starts_with($name, $prefix)) {
      return $rule;
    }
  }
  // An unowned config object is a documentation bug, not a code bug.
  return ['owner' => 'UNOWNED', 'ui_ok' => false];
}

$blocked = 0;
foreach ($changes as $change) {
  $rule = ownerOf($ownership, $change['name']);
  $missing = array_values(array_diff($definitionOfDone, $change['done']));
  $problems = [];
  if ($rule['owner'] === 'UNOWNED') {
    $problems[] = 'no owner recorded in the decision record';
  }
  if ($change['origin'] === 'prod-ui' && !$rule['ui_ok']) {
    $problems[] = 'changed in the prod UI, which the convention forbids';
  }
  if ($missing) {
    $problems[] = 'definition of done missing: ' . implode(', ', $missing);
  }
  printf("%-30s owner=%-9s origin=%s\\n",
    $change['name'], $rule['owner'], $change['origin']);
  if (!$problems) {
    echo "  PASS\\n";
    continue;
  }
  $blocked++;
  foreach ($problems as $problem) {
    echo "  BLOCK  " . $problem . "\\n";
  }
}

printf("\\n%d of %d changes blocked by the team's own written rules.\\n",
  $blocked, count($changes));
`,
    output: `views.view.press_releases      owner=editorial origin=prod-ui
  BLOCK  definition of done missing: rehearsed_on_prod_copy
field.storage.node.embargo     owner=backend   origin=local-ui
  PASS
system.performance             owner=ops       origin=prod-ui
  BLOCK  changed in the prod UI, which the convention forbids
  BLOCK  definition of done missing: reviewed, rehearsed_on_prod_copy

2 of 3 changes blocked by the team's own written rules.
`,
  },

  keyPoints: [
    "Drupal's admin UI is a write interface to deployable state, so the social protocol is part of the technical system — a Symfony team gets most of its governance free from the fact that only a commit can change behaviour.",
    "The README's acceptance test is one command from clone to working site, and for Drupal that command must include importing config into a database that already holds an older version of it.",
    "Keep two runbooks: the normal deploy sequence with its reasoning, and an emergency runbook written for someone who did not build the site — numbered steps, real hostnames, the restore command, and who to wake up.",
    "Write a decision record for config vs State API vs settings.php override vs environment variable; the deciding question is whether two environments must ever disagree about the value.",
    "Ownership needs two enforcement points: CODEOWNERS over config/sync prefixes for changes that reach a pull request, and a production-side lock (config_readonly behind a PHP_SAPI !== 'cli' guard so deploys still write, or simply withholding the admin permission) for changes made in the UI.",
    "A config change is done when it is exported (drush config:status clean), reviewed as a diff, and rehearsed against a copy of the production database — anything CI cannot check, rehearse on stage on a schedule instead.",
  ],

  interview: [
    {
      q: "Why does a Drupal team need more written convention than a Symfony team working on a comparable app?",
      a: "Because Drupal removes the boundary Symfony relies on. In Symfony, the only way to change production behaviour is to merge a commit, so branch protection, `CODEOWNERS` and CI *are* the governance model — there is no second path. Drupal's admin UI is a legitimate, intended way to change deployable state: a view, a text format, a field display, an installed module. All of it lands in the active config store and gets swept into somebody's next `drush cex`. So the questions a compiler answers elsewhere — who may change this, does it belong in the repo at all — have to be answered by a written convention plus a check that encodes it. I would rather have a one-page ownership table and a CI job running `drush config:status` than a beautifully documented architecture nobody follows.",
    },
    {
      q: "What is in your emergency runbook that is not in your normal deploy runbook?",
      a: "The normal runbook assumes the author is reading it and everything is going well; the emergency one assumes neither. It starts with maintenance mode rather than diagnosis, because stopping the bleeding comes before understanding. It names real hosts and the exact path of the pre-deploy dump, since nobody should be hunting for a backup at 02:00. Crucially it distinguishes the reversible steps from the irreversible ones. Rolling the release symlink back is cheap. Re-importing the previous `config/sync` usually is too, but not always — if the bad release added a field or installed a module, going back deletes them, and deleting a `field.storage.*` object purges that field's content — so the step says to read `drush config:import --diff` before confirming rather than reaching for `-y`. And if the release ran update hooks there is no `down()`, so recovery means restoring the pre-deploy dump and losing every piece of content created since. That last question has to be asked carefully: `drush updatedb:status` lists only *pending* updates, so once the release has run it prints nothing whether hooks ran or not — the honest check is the release's own diff for `.install` and `.post_update.php` changes, or the deploy job's log. I write the cost into the step, along with who has to sign off before it runs and who to escalate to. Then I rehearse it against stage periodically, because an untested runbook is fiction.",
    },
    {
      q: "How do you decide whether a value belongs in exported configuration, in state, in settings.php, or in an environment variable?",
      a: "One question first: must two environments ever disagree about it? If no, it is configuration — it goes in `config/install` or the active store, gets exported, and appears in the config diff like any other change. If yes, it is not plain config. A per-environment value for an existing config key is a `$config[...]` override in `settings.php`, which wins at read time but is deliberately invisible to `drush cex`, so `config/sync` stays clean. Runtime bookkeeping — last cron run, a migration cursor — is the State API, which is never exported and survives `cim` untouched. Secrets are environment variables read into `$settings` in `settings.php`, never committed anywhere. I write this down as a short decision record because otherwise every developer re-decides it, and you end up with a config diff that flip-flops on every export.",
    },
    {
      q: "Your team of four keeps shipping config changes that break on stage. What conventions would you introduce first?",
      a: "A definition of done for a config change, with three gates. Exported: `drush config:status` must be clean before the pull request opens, enforced by a CI job so nobody has to remember. Reviewed: the config YAML diff gets read as a diff, not rubber-stamped — permission grants and text format filters in particular, since a one-line change there is a security change. Rehearsed: the branch is imported against a sanitised copy of the production database in CI, not just against the reviewer's local site, because most stage failures are the active store on stage differing from the reviewer's laptop. Alongside that I would add an ownership table mapping config prefixes to people, wired into `CODEOWNERS`, so views changes route to the person who understands the views and `system.*` changes route to ops.",
    },
  ],

  quiz: [
    {
      question:
        "What is the structural reason a Drupal team needs written config conventions more than a Symfony team does?",
      options: [
        "Drupal YAML files are harder to read than Symfony YAML files",
        "Drupal's admin UI lets non-developers change deployable state without a commit",
        "Drupal has no equivalent of CODEOWNERS",
        "Symfony validates its configuration at compile time, so it needs no review",
      ],
      answerIndex: 1,
      explain:
        "In Symfony the only route to changing production behaviour is a merged commit, so branch protection and CI carry the governance. Drupal deliberately provides a second route — the admin UI writes to the active config store — so the convention about who may change what has to be written down and enforced separately.",
    },
    {
      question:
        "A value must be 'https://sandbox.api.example.com' on stage and 'https://api.example.com' on production. Where does it belong?",
      options: [
        "In config/sync, edited by hand after each import",
        "In the State API, set by an update hook per environment",
        "As a $config[...] override in each environment's settings.php",
        "Hard-coded in the module, behind an if on the hostname",
      ],
      answerIndex: 2,
      explain:
        "The deciding question is whether two environments must disagree. They do, so it is not plain config. A $config[...] override in settings.php wins at read time but is invisible to drush cex, so config/sync keeps one canonical value and the diff never flip-flops. State is for runtime bookkeeping, not for values a deploy should set.",
    },
    {
      question:
        "Which set of gates makes a reasonable 'definition of done' for a config change?",
      options: [
        "Exported, reviewed as a diff, and imported against a copy of the production database",
        "Exported, and the site still loads locally",
        "Reviewed by a second developer and merged to main",
        "Documented in the wiki and announced in the team channel",
      ],
      answerIndex: 0,
      explain:
        "Export is checkable in CI with drush config:status. Reviewing the YAML as a diff catches permission and text-format changes that are really security changes. Rehearsing the import against a sanitised production database copy catches the failure mode a local site cannot: stage and prod having a different active store from the reviewer's laptop.",
    },
    {
      question:
        "Why does CODEOWNERS on config/sync paths not, on its own, enforce config ownership in Drupal?",
      options: [
        "Because CODEOWNERS cannot match wildcard paths",
        "Because config/sync is not tracked in version control",
        "Because it only sees changes that arrive as a pull request, not changes made in the production UI",
        "Because drush cex bypasses git entirely",
      ],
      answerIndex: 2,
      explain:
        "CODEOWNERS routes review for config that reaches a pull request. Someone editing a view directly in production has already changed the active store; the reviewer only sees it later, if at all. That is why ownership needs a second, production-side enforcement point — the config_readonly module, or simply not granting the administer permission in that environment.",
    },
  ],
};

export default lesson;

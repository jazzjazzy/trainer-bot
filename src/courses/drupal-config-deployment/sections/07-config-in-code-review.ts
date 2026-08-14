import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "config-in-code-review",
  title: "Reviewing Config in Pull Requests",
  part: "Everyday Workflow",
  estMinutes: 13,
  summary:
    "A config diff is a code diff with production consequences: what to actually read in a YAML pull request, which files are security artifacts, and how to keep the noise low enough that anyone still bothers.",

  concept: `
## Nobody reads a 4,000-line YAML diff

The failure mode is universal. A teammate exports config, the PR shows
"142 files changed", and the reviewer types LGTM. Six days later prod has an
extra role with \`administer users\`, or the \`dblog\` module is gone along with
its settings, and nobody can say which PR did it.

Config review is not a lesser form of code review. In Drupal, \`config/sync\`
*is* deployment instructions: on the next \`drush config:import\` every one of
those files is applied to production, non-interactively, by CI. You already do
this in Symfony — you read \`security.yaml\` more carefully than a controller,
because an \`access_control\` line is a security decision expressed as YAML. Same
instinct, wider blast radius.

### The files that are never routine

Sort every config diff into "shape of the site" and "consequences". These have
consequences:

- **\`core.extension.yml\`** — the module and theme list. Adding a key installs a
  module on deploy. *Removing* a key uninstalls it, which runs its uninstall
  hooks, drops its tables and **deletes its configuration**. A removal that
  arrived by accident (someone exported from a site where they'd toggled a
  module off) is one of the most destructive diffs a Drupal PR can carry, and it
  looks like a one-line YAML change.
- **\`user.role.*.yml\`** — the \`permissions\` list. Any added line is a privilege
  grant. Treat it exactly like a change to \`security.yaml\`: who asked, and does
  this role really need it? Watch for \`is_admin: true\`, which grants everything
  regardless of the list.
- **\`filter.format.*.yml\`** — a text format's filters, their \`weight\` (order
  matters: filtering after a filter that re-introduces markup is a hole) and
  \`settings.allowed_html\`. A new \`<iframe src>\` or \`<script>\` in allowed HTML is
  a stored-XSS review, not a formatting tweak.
- **\`views.view.*.yml\`** — under \`display_options.access\`, a \`type\` of \`none\`
  means the view's page is public. Also read exposed filters and any raw
  arguments.
- **\`field.storage.*.yml\`** — \`type\` and \`cardinality\`. Narrowing cardinality or
  changing type implies existing data has to go somewhere; config import will
  not migrate it for you.
- **\`node.type.*.yml\`** — \`new_revision\`, which quietly decides whether editors
  can undo mistakes.

### Noise reduction is a review technique

A diff only gets read if it is small enough to read.

- **Export before you branch.** Run \`drush config:export\` on a clean main first;
  if it produces changes, that is someone else's drift, and it belongs in its own
  PR.
- **Use the tooling to summarise.** \`drush config:status\` lists what differs;
  \`drush config:export --diff\` previews the change as a diff rather than a file
  list, so you can sanity-check your own PR before opening it.
- **Expect \`_core: default_config_hash\` and \`uuid\` churn** and be suspicious of
  it: a changed \`uuid\` usually means the object was deleted and recreated, not
  edited, which will delete and recreate it in prod too.
- **Own files, not just code.** A \`CODEOWNERS\` entry pointing \`config/sync/user.role.*\`
  and \`config/sync/core.extension.yml\` at a security-minded reviewer costs one
  line and turns "someone should look" into a required approval.

### The checklist

Paste it into the PR template: (1) does the PR description say *why* each config
object changed; (2) is \`core.extension.yml\` intentional in both directions;
(3) any new permissions, and who signed off; (4) any text format or view access
change; (5) does any field change need an update hook or a data migration;
(6) did CI import this onto a copy of prod's database and come back clean?
`,

  comparisons: [
    {
      label: "The security-sensitive file",
      intro:
        "Both frameworks put access rules in YAML. The Symfony reviewer's instinct for security.yaml transfers directly to a Drupal role file.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/security.yaml (Symfony)
security:
  role_hierarchy:
    ROLE_EDITOR: [ROLE_USER]
+   ROLE_EDITOR: [ROLE_USER, ROLE_ADMIN]   # <-- read this twice
  access_control:
    - { path: ^/admin, roles: ROLE_ADMIN }
+   - { path: ^/admin/users, roles: ROLE_EDITOR }

# Review question: who asked for editors to reach
# /admin/users, and is it in the ticket?`,
      ts: `# config/sync/user.role.editor.yml (Drupal)
langcode: en
status: true
dependencies: {  }
id: editor
label: Editor
weight: 3
is_admin: false
permissions:
  - 'access content overview'
  - 'create article content'
  - 'edit any article content'
+ - 'administer users'
+ - 'administer permissions'

# Same review question. 'administer permissions'
# lets that role grant itself anything else.`,
      note:
        "Every added line under permissions is a privilege grant. 'administer permissions' and 'administer users' are effectively root; is_admin: true is root with an empty permissions list.",
    },
    {
      label: "The module list",
      intro:
        "Symfony's enabled bundles live in a PHP array that is obviously code. Drupal's live in exported YAML that looks like data — and is applied on deploy.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// config/bundles.php (Symfony)
return [
  Symfony\\Bundle\\FrameworkBundle\\FrameworkBundle::class => ['all' => true],
  Doctrine\\Bundle\\DoctrineBundle\\DoctrineBundle::class => ['all' => true],
- Symfony\\Bundle\\MonologBundle\\MonologBundle::class => ['all' => true],
];

// Removing a line stops the bundle booting.
// Nothing is dropped: no tables, no config, no data.
// Re-add the line and you are back where you were.`,
      ts: `# config/sync/core.extension.yml (Drupal)
_core:
  default_config_hash: 2b1WOB3bDy-Nrs9Iy...
module:
  node: 0
  user: 0
  views: 10
+ webform: 0
- dblog: 0
theme:
  claro: 0
  olivero: 0

# webform: installed on the next config import
# (and must be in composer.json, or the import fails).
# dblog: UNINSTALLED. Its hook_uninstall() runs, its
# tables are dropped and its config is deleted.
# Re-adding the line reinstalls it empty.`,
      note:
        "Additions and removals in core.extension.yml are not symmetric. An accidental removal is destructive and irreversible by git revert alone — the data is already gone from prod.",
    },
    {
      label: "Checking your own diff before you open the PR",
      intro:
        "Reviewers give up on noisy PRs. Both ecosystems have a cheap way to see exactly what you are about to ask someone to read.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: is my config change the only thing in here?
git switch -c feature/press-page main
git diff --stat main -- config/

# Catch config that no longer compiles
php bin/console lint:container
php bin/console lint:yaml config/

# Cache-warm against the prod environment to prove
# config/packages/prod/ still resolves
APP_ENV=prod php bin/console cache:warmup`,
      ts: `# Drupal: export from a clean main FIRST
git switch main && git pull
drush config:import -y      # match main exactly
drush config:status         # must say "No differences"

# now branch, click in the UI, and export
git switch -c feature/press-page

# what did the clicking actually change? (before exporting)
drush config:status --state=Different
drush config:status --state=Different \\
  --prefix=user.role.   # did I touch any role files?

drush config:export --diff  # preview as a diff, not a file list
drush config:export -y
git add config/sync && git diff --cached --stat`,
      note:
        "drush config:status shows what differs between the database and the sync directory; --diff on config:export previews the change as a diff. If main was already dirty, that drift belongs in a separate PR.",
    },
    {
      label: "Routing the review to the right eyes",
      intro:
        "Neither framework can tell a reviewer that a file is dangerous. A CODEOWNERS file can.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/CODEOWNERS (Symfony project)
/config/packages/security.yaml   @acme/security
/config/packages/prod/           @acme/platform
/migrations/                     @acme/dba
/.github/workflows/              @acme/platform`,
      ts: `# .github/CODEOWNERS (Drupal project)
/config/sync/core.extension.yml      @acme/platform
/config/sync/user.role.*.yml         @acme/security
/config/sync/filter.format.*.yml     @acme/security
/config/sync/field.storage.*.yml     @acme/dba
/config/sync/views.view.*.yml        @acme/backend
/config/sync/                        @acme/backend`,
      note:
        "Glob ownership turns 'someone should really look at the role files' into a required approval that GitHub enforces, without a single extra process meeting.",
    },
  ],

  playground: {
    intro:
      "A tiny triage tool: feed it the config/sync snapshot on main and on the PR branch, and it turns the raw diff into the short list of things a human actually has to decide. Note which changes it refuses to wave through.",
    lang: "php",
    code: `<?php
declare(strict_types=1);

// Two snapshots of config/sync: what is on main, and what the PR branch adds.
// The job of review is to turn this diff into a short list of human decisions.

$base = [
  'core.extension' => ['module' => ['node' => 0, 'user' => 0, 'views' => 10, 'dblog' => 0]],
  'user.role.editor' => ['permissions' => ['access content', 'create article content']],
  'filter.format.basic_html' => ['allowed_html' => '<p> <a href> <em> <strong>'],
  'field.storage.node.field_tags' => ['type' => 'entity_reference', 'cardinality' => -1],
  'views.view.press' => ['access' => 'perm:access content'],
];

$head = [
  'core.extension' => ['module' => ['node' => 0, 'user' => 0, 'views' => 10, 'webform' => 0]],
  'user.role.editor' => ['permissions' => ['access content', 'create article content', 'administer users']],
  'filter.format.basic_html' => ['allowed_html' => '<p> <a href> <em> <strong> <iframe src>'],
  'field.storage.node.field_tags' => ['type' => 'entity_reference', 'cardinality' => 3],
  'views.view.press' => ['access' => 'none'],
  'system.menu.legal' => ['label' => 'Legal'],
];

/** Classify one changed config object: [severity, what the reviewer must check]. */
function triage(string $name, array $old, array $new): array {
  if ($name === 'core.extension') {
    $gone = array_keys(array_diff_key($old['module'], $new['module']));
    $added = array_keys(array_diff_key($new['module'], $old['module']));
    if ($gone !== []) {
      return ['BLOCK', 'uninstalls ' . implode(', ', $gone) . ' on import; that module\\'s config is deleted'];
    }
    return ['REVIEW', 'installs ' . implode(', ', $added) . '; is it required in composer.json?'];
  }
  if (str_starts_with($name, 'user.role.')) {
    $granted = array_values(array_diff($new['permissions'], $old['permissions']));
    return $granted === []
      ? ['OK', 'no new permissions']
      : ['SECURITY', 'grants: ' . implode(', ', $granted)];
  }
  if (str_starts_with($name, 'filter.format.')) {
    return $old['allowed_html'] === $new['allowed_html']
      ? ['OK', 'filter set unchanged']
      : ['SECURITY', 'allowed HTML now: ' . $new['allowed_html']];
  }
  if (str_starts_with($name, 'field.storage.')) {
    if ($old['type'] !== $new['type']) {
      return ['BLOCK', 'field type change needs a data migration, not an import'];
    }
    $shrunk = $old['cardinality'] === -1 || ($new['cardinality'] !== -1 && $new['cardinality'] < $old['cardinality']);
    return $shrunk
      ? ['BLOCK', 'cardinality ' . $old['cardinality'] . ' to ' . $new['cardinality'] . ' can orphan saved values']
      : ['REVIEW', 'cardinality widened'];
  }
  if (str_starts_with($name, 'views.view.')) {
    return $old['access'] === $new['access']
      ? ['OK', 'access unchanged']
      : ['SECURITY', 'view access ' . $old['access'] . ' to ' . $new['access']];
  }
  return ['REVIEW', 'read the diff'];
}

$rows = [];
foreach ($head as $name => $new) {
  if (!array_key_exists($name, $base)) {
    $rows[] = ['CREATE', 'REVIEW', $name, 'new object; does it belong in sync or in a module?'];
  }
  elseif ($base[$name] !== $new) {
    [$sev, $note] = triage($name, $base[$name], $new);
    $rows[] = ['UPDATE', $sev, $name, $note];
  }
}
foreach ($base as $name => $old) {
  if (!array_key_exists($name, $head)) {
    $rows[] = ['DELETE', 'BLOCK', $name, 'removed from sync; import will delete it in prod'];
  }
}

$rank = ['BLOCK' => 0, 'SECURITY' => 1, 'REVIEW' => 2, 'OK' => 3];
usort($rows, fn(array $a, array $b): int => [$rank[$a[1]], $a[2]] <=> [$rank[$b[1]], $b[2]]);

echo "PR 482: config/sync review triage\\n";
echo str_repeat('=', 66) . "\\n";
foreach ($rows as [$op, $sev, $name, $note]) {
  printf("[%-8s] %-6s %s\\n", $sev, $op, $name);
  echo "           " . $note . "\\n";
}
$needHuman = count(array_filter($rows, fn(array $r): bool => $r[1] === 'BLOCK' || $r[1] === 'SECURITY'));
echo str_repeat('=', 66) . "\\n";
printf("%d of %d changed objects need a named human sign-off.\\n", $needHuman, count($rows));
`,
    output: `PR 482: config/sync review triage
==================================================================
[BLOCK   ] UPDATE core.extension
           uninstalls dblog on import; that module's config is deleted
[BLOCK   ] UPDATE field.storage.node.field_tags
           cardinality -1 to 3 can orphan saved values
[SECURITY] UPDATE filter.format.basic_html
           allowed HTML now: <p> <a href> <em> <strong> <iframe src>
[SECURITY] UPDATE user.role.editor
           grants: administer users
[SECURITY] UPDATE views.view.press
           view access perm:access content to none
[REVIEW  ] CREATE system.menu.legal
           new object; does it belong in sync or in a module?
==================================================================
5 of 6 changed objects need a named human sign-off.
`,
  },

  keyPoints: [
    "config/sync is deployment instructions, not data: everything in it is applied to production by config import, so review it with the same seriousness as a controller diff.",
    "core.extension.yml is asymmetric — adding a module key installs it on deploy, removing one uninstalls the module and deletes its configuration and tables. Check removals were deliberate.",
    "user.role.*.yml permissions, filter.format.*.yml allowed_html and filter order, and a view's access type are security artifacts; read them the way you read Symfony's security.yaml.",
    "field.storage.*.yml type and cardinality changes imply existing data has to move; config import will not migrate it, so those PRs need an update hook or a migration plan.",
    "Keep diffs readable: export from a clean main, use drush config:status and drush config:export --diff to preview your own PR, and treat unexplained uuid changes as delete-and-recreate.",
    "Encode the judgement in tooling — a CODEOWNERS glob on config/sync/user.role.*.yml makes the right reviewer mandatory instead of hopeful.",
  ],

  interview: [
    {
      q: "A pull request changes one line in core.extension.yml. Why might that be the most dangerous line in the PR?",
      a: "Because \`core.extension.yml\` is how modules get installed and uninstalled on deploy. Adding a key under \`module:\` installs that module during \`drush config:import\`; removing a key **uninstalls** it, which runs the module's uninstall hooks, drops its tables and deletes its configuration. That is not reversible by reverting the commit — the data is already gone from production, so you are restoring from backup. Accidental removals are common because someone toggled a module off locally while debugging and then exported. In review I check every removal against the ticket, and I make sure any addition also appears in \`composer.json\`, otherwise the import fails on an environment that never had the code.",
    },
    {
      q: "You come from Symfony. Which Drupal config files would you insist on reviewing personally, and why?",
      a: "The ones that are security decisions expressed as YAML — the same category as \`security.yaml\` in a Symfony project. That is \`user.role.*.yml\` (every added line under \`permissions\` is a privilege grant, and \`is_admin: true\` grants everything), \`filter.format.*.yml\` (\`settings.allowed_html\` and the \`weight\` ordering of filters decide whether stored XSS is possible), and \`views.view.*.yml\` where \`display_options.access.type\` set to \`none\` makes a listing public. I'd add \`core.extension.yml\` for the install/uninstall reason and \`field.storage.*.yml\` because type and cardinality changes are really data migrations. In practice I'd put those globs in CODEOWNERS so review is enforced rather than remembered.",
    },
    {
      q: "How do you stop config PRs from becoming unreviewable 100-file diffs?",
      a: "Mostly by removing drift before it accumulates. The rule is: export from a clean \`main\` first — pull, run \`drush config:import\`, then \`drush config:status\` and confirm it reports no differences. If it doesn't, that drift is someone else's and gets its own PR rather than being smuggled into yours. Before opening the PR I run \`drush config:export --diff\` to see the change as a diff instead of a file list, and I keep unrelated UI clicking out of the branch. I also expect some churn in \`_core.default_config_hash\`, but a changed \`uuid\` gets investigated, because it usually means the object was deleted and recreated rather than edited — and the import will do exactly that in production.",
    },
    {
      q: "A PR narrows a field's cardinality from unlimited to 3. What do you say in review?",
      a: "That this is a data change wearing a config change's clothes. \`drush config:import\` will happily update \`field.storage.node.field_tags.yml\`, but it does nothing about nodes that already have five values — they can be silently orphaned or truncated depending on the field type and storage. So the PR needs a plan: a \`hook_update_N()\` or a batch that trims or migrates the existing values, plus a query against a production database copy showing how many entities are affected. I'd also want it deployed as its own release rather than bundled with unrelated config, so it can be rolled back independently. Same conversation as reviewing a Doctrine migration that drops a column.",
    },
  ],

  quiz: [
    {
      question:
        "A pull request removes the line \"dblog: 0\" from config/sync/core.extension.yml. What happens on the next production config import?",
      options: [
        "Nothing at runtime; the module simply stops appearing in the modules admin list.",
        "The dblog module is uninstalled: its uninstall hooks run, its tables are dropped and its configuration is deleted.",
        "The import aborts with an error because modules can only be uninstalled through the admin UI.",
        "The module is disabled but retains its tables and configuration so it can be re-enabled cleanly.",
      ],
      answerIndex: 1,
      explain:
        "core.extension.yml is the installed extension list. Removing a module key makes config import uninstall it, which runs hook_uninstall(), drops its schema and removes its configuration. Drupal has had no 'disabled but retained' state since Drupal 8 — re-adding the line reinstalls the module from scratch, empty.",
    },
    {
      question:
        "Which of these config diffs should be treated as a security review rather than a routine change?",
      options: [
        "A new line under permissions in user.role.editor.yml",
        "A change to settings.allowed_html in filter.format.basic_html.yml",
        "display_options.access.type changing from 'perm' to 'none' in a views.view.*.yml",
        "All three",
      ],
      answerIndex: 3,
      explain:
        "All three are access or output-safety decisions expressed as YAML. A permission line is a privilege grant, allowed_html governs what markup survives filtering (a new <iframe> or <script> is a stored-XSS vector), and an access type of 'none' makes a view's page publicly reachable. These are the Drupal equivalents of editing Symfony's security.yaml.",
    },
    {
      question:
        "Your PR branch shows 60 changed files under config/sync but you only edited one View. What is the most likely cause and the right fix?",
      options: [
        "Drupal always rewrites every config file on export; ignore it and merge.",
        "Your local site had drift from main, so the export captured other people's or your own unrelated changes — sync with main (import, confirm config:status is clean) and re-export.",
        "The sync directory needs to be deleted and regenerated before every export.",
        "Someone changed the site UUID, which renames every file.",
      ],
      answerIndex: 1,
      explain:
        "drush config:export rewrites the whole sync directory from the active store, so the only files whose content actually changes in git are the ones that differ — a large unexplained diff means the local database was not in sync with main before you started. Pull main, run drush config:import, confirm drush config:status reports no differences, then branch and re-export so your PR contains only your change.",
    },
    {
      question:
        "A PR changes field.storage.node.field_tags.yml cardinality from -1 (unlimited) to 3. What should review require?",
      options: [
        "Nothing extra — config import updates the storage definition and Drupal reconciles existing values automatically.",
        "Only that the change is documented in the PR description.",
        "A plan for existing entities that already hold more than three values, such as an update hook or migration, plus a count from a production database copy.",
        "That the field be deleted and recreated with the new cardinality.",
      ],
      answerIndex: 2,
      explain:
        "Config import updates the storage definition; it does not migrate stored field values. Entities already holding more than three values are the problem the diff hides, so the PR needs an explicit data plan (hook_update_N or a batch) and evidence of how many rows are affected on production data. Deleting and recreating the field would destroy all existing values.",
    },
  ],
};

export default lesson;

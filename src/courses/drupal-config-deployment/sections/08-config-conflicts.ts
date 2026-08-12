import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "config-conflicts",
  title: "Merge Conflicts & Two Developers, One View",
  part: "Everyday Workflow",
  estMinutes: 12,
  summary:
    "Exported config is machine-written, order-sensitive YAML that a three-way merge resolves into plausible garbage — so the resolution is to take one side wholesale, re-import, and redo the smaller change through the UI.",

  concept: `
## git merges lines; config is an object graph

A \`views.view.incidents.yml\` export runs to several hundred lines of
machine-written YAML: a \`uuid\`, a \`_core.default_config_hash\`, a
\`dependencies\` block core recalculated for you, and one deeply nested mapping
per display. Nothing in it was typed by a human, and very little of it is
order-free. Inside a views display the \`fields\`, \`filters\` and \`sorts\`
mappings carry no weight key — **the order of the keys is the order of the
output**. Adding one column inserts fifteen or twenty lines into the middle of a
mapping whose position is meaningful.

Now have two developers do that in the same sprint.

### The dangerous case is a clean merge, not a conflict

If the two hunks touch, git reports a conflict and at least you know. If they
are a few lines apart — very likely in a file this verbose — git merges both
sides cleanly and hands you syntactically valid YAML describing a view that
neither developer designed: both new columns present, in an order nobody chose,
sitting next to a \`dependencies\` list that no longer matches the handlers above
it. \`drush cim\` accepts it without complaint. The bug shows up on stage as a
column in the wrong place, or a filter that quietly disappeared.

### The only safe resolution

Never hand-merge generated config. Take one side of the file whole, then rebuild
the difference through the UI:

1. Take the incoming side of the file. Which command depends on whether the
   merge is still open:
   - **Merge in progress** (this file conflicted, or some *other* path did):
     \`git checkout --theirs -- config/sync/views.view.incidents.yml\`, or
     \`git checkout MERGE_HEAD -- <file>\` if this file auto-merged silently and
     has no \`--theirs\` stage to check out. Then \`git add\` and finish the merge.
   - **Merge already committed** (nothing conflicted, so git committed it for
     you): \`MERGE_HEAD\` no longer exists — \`git checkout MERGE_HEAD -- <file>\`
     fails with *fatal: invalid reference: MERGE_HEAD*. Name the merged-in
     branch instead: \`git checkout origin/main -- <file>\` (or
     \`git checkout HEAD^2 -- <file>\` while sitting on the merge commit), then
     \`git add\` and commit that as a follow-up commit.
2. \`drush cim -y\`, so the active store matches the branch byte for byte.
3. Redo the smaller of the two changes in the admin UI.
4. \`drush cex -y\` and commit that one file.

Whoever's change is cheaper to redo is the one who redoes it. Two minutes of
clicking beats an hour of YAML archaeology and a wrong view in production.

### Your active store drifts silently

\`git status\` is blind to the database. After a \`git pull\` that brought in
config, your active store is *behind* the branch; after building something you
never exported, it is *ahead*. \`drush config:status\` is the only honest
answer — it reports each object as \`Only in DB\`, \`Only in sync dir\` or
\`Different\`. The trap: run \`drush cex\` while behind and you re-export your
stale copy of a teammate's object, reverting their work inside a commit that
looks like yours. Always \`drush cim\` after pulling and before you open the UI.
\`cim\` is destructive on purpose — unexported local work is discarded, which is
exactly the reset you want.

### Why this is harder than merging code

A code conflict is between two things humans wrote and can both read. A config
conflict is between two *UI intentions* serialised into a graph, and no diff
view shows intent. So teams manage it socially: short-lived branches, small PRs,
one owner per config area at a time, and a message in the channel before anyone
opens a shared view. Symfony teams rarely feel this, because
\`config/packages/*.yaml\` is short, hand-written and mostly order-insensitive,
and schema changes arrive as uniquely-named migration files that physically
cannot collide.
`,

  comparisons: [
    {
      label: "What the conflict actually looks like",
      intro:
        "Same event on both stacks: two branches edited the same configuration file. Compare how much of the resolution a human can hold in their head.",
      php: `# config/packages/messenger.yaml - 22 lines, written by a person.
# Both sides added one transport. Keeping both is obviously correct.
framework:
    messenger:
        transports:
<<<<<<< HEAD
            async: '%env(MESSENGER_TRANSPORT_DSN)%'
            failed: 'doctrine://default?queue_name=failed'
=======
            async: '%env(MESSENGER_TRANSPORT_DSN)%'
            audit: 'doctrine://default?queue_name=audit'
>>>>>>> feature/audit-queue
        routing:
            'App\\Message\\SendDigest': async

# Order of the transports keys does not change behaviour.
# Resolution: delete the markers, keep three transports, lint, commit.`,
      ts: `# config/sync/views.view.incidents.yml - excerpt from a 612-line file.
# fields: is a MAPPING whose key order IS the column order.
display:
  default:
    display_options:
      fields:
        title:
          id: title
          table: node_field_data
          field: title
          entity_type: node
          entity_field: title
          plugin_id: field
          label: ''
<<<<<<< HEAD
        field_severity:
          id: field_severity
          table: node__field_severity
          field: field_severity
          plugin_id: field
          label: Severity
=======
        field_owner:
          id: field_owner
          table: node__field_owner
          field: field_owner
          plugin_id: field
          label: Owner
>>>>>>> feature/incident-owner
        created:
          id: created
          plugin_id: field
          label: 'Reported on'`,
      leftLang: "yaml",
      rightLang: "yaml",
      note: "Keeping both hunks here is not obviously correct: it decides column order, and the dependencies block further down the file was generated for one side only. Worse, move the two additions ten lines apart and git merges them with no markers at all.",
    },
    {
      label: "Resolving it",
      intro:
        "The Symfony fix is to edit the file. The Drupal fix is to refuse to edit the file and let Drupal regenerate it.",
      php: `# Symfony: open it, keep both transports, delete the markers.
git merge origin/main
#  CONFLICT (content): Merge conflict in config/packages/messenger.yaml

$EDITOR config/packages/messenger.yaml

php bin/console lint:yaml config/packages
php bin/console debug:messenger          # prove the result is sane

git add config/packages/messenger.yaml
git commit`,
      ts: `# Drupal: take ONE side wholesale, then redo the other by hand.
git merge origin/main
#  CONFLICT (content): Merge conflict in config/sync/views.view.incidents.yml

# 1. --theirs = the branch being merged IN (MERGE_HEAD).
#    In a rebase the two words swap round - check 'git status' first.
git checkout --theirs -- config/sync/views.view.incidents.yml

#    If THIS file auto-merged silently but the merge is still open because
#    some OTHER path conflicted, there is no --theirs stage for it, so name
#    the incoming commit instead - MERGE_HEAD only exists mid-merge:
#      git checkout MERGE_HEAD -- config/sync/views.view.incidents.yml

git add config/sync/views.view.incidents.yml
git commit                                  # finish the merge

# 1b. If NOTHING conflicted, git already committed the merge and MERGE_HEAD
#     is gone ('fatal: invalid reference: MERGE_HEAD'). Check the file out
#     of the branch you merged in and commit that as a follow-up:
#       git checkout origin/main -- config/sync/views.view.incidents.yml
#       # or, sitting on the merge commit:  git checkout HEAD^2 -- <file>
#       git add config/sync/views.view.incidents.yml
#       git commit -m "Take origin/main's incidents view wholesale"

# 2. Make the active store match the branch exactly.
drush cim -y
drush config:status                         # expect: no differences

# 3. Redo YOUR (smaller) change in the UI:
#    /admin/structure/views/view/incidents -> add the Severity column.

# 4. Re-export and commit that one file.
drush cex -y
git add config/sync/views.view.incidents.yml
git commit -m "Re-add Severity column to the incidents view"`,
      leftLang: "bash",
      rightLang: "bash",
      note: "Step 2 is the one people skip. Without a cim the active store still holds your pre-merge view, and your next cex overwrites the file you just resolved.",
    },
    {
      label: "Knowing whether you are in sync",
      intro:
        "After a pull, how do you tell that your environment matches the branch? The answer is very different when config round-trips through a database.",
      php: `# Symfony: config lives in files only. git IS the source of truth,
# so 'git status' answers the question completely.
git pull --rebase
git status --short config/

php bin/console cache:clear
php bin/console doctrine:migrations:migrate --no-interaction

# There is no second copy of config/packages to drift out of step.`,
      ts: `# Drupal: there are TWO stores. git can only see one of them.
git pull --rebase
git status --short config/sync     # clean - and proves nothing

drush config:status
#  --------------------------------------- -----------------
#   Name                                    State
#  --------------------------------------- -----------------
#   views.view.incidents                    Different
#   core.entity_form_display.node.incident  Only in DB
#   field.field.node.incident.field_owner   Only in sync dir
#  --------------------------------------- -----------------

#  Only in DB       -> you built it locally and never exported it
#  Only in sync dir -> a teammate's work you have not imported
#  Different        -> both sides moved on the SAME object

drush cim -y        # active store == branch. Unexported work is gone.

# Narrow the question when you only care about one area:
drush config:status --state='Only in DB' --prefix=views.view.`,
      leftLang: "bash",
      rightLang: "bash",
      note: "Running drush cex from a 'behind' active store is the classic silent revert: you export your stale copy of your colleague's object and it lands in your PR looking deliberate.",
    },
    {
      label: "Preventing the collision",
      intro:
        "Doctrine sidesteps the whole problem by making every schema change a new file. Drupal cannot, so the mitigations are part tooling, part team agreement.",
      php: `# Symfony: a schema change is an append-only file with a unique name,
# so two developers physically cannot conflict on it.
php bin/console make:migration
#  created: migrations/Version20260811093214.php

# Ben, the same afternoon, on his own branch:
php bin/console make:migration
#  created: migrations/Version20260811121907.php

# Both files land, both run, in timestamp order. Zero merge risk.
# Only config/packages/*.yaml can conflict - and humans wrote those.`,
      ts: `# Drupal: a view is ONE mutable shared file. Three real mitigations.

# 1. Stop git guessing. 'binary' is a BUILT-IN merge driver: it keeps
#    your version in the work tree and marks the path conflicted, so a
#    silent bad auto-merge becomes impossible.
cat .gitattributes
#  config/sync/*.yml merge=binary

# 2. Keep branches short and own config per feature.
#    "I have the incidents view until 16:00" in the team channel beats
#    any tooling. Hours-long branches, not week-long ones.

# 3. Move environment-only config out of the shared file set entirely,
#    so dev-only objects never reach a colleague's diff.
composer require drupal/config_split

# 4. Review the diff, not the PR title:
git diff origin/main -- config/sync | grep -E '^[-+](  )*(uuid|label|status):'`,
      leftLang: "bash",
      rightLang: "bash",
      note: "merge=binary trades convenience for safety: every shared-view collision now stops you, which is the point. It only helps if the whole team has it, so commit .gitattributes.",
    },
  ],

  playground: {
    intro:
      "A structural three-way merge of one views display — the merge git cannot perform. Read the two branches, predict which paths merge cleanly and which two cannot be decided, then run it.",
    lang: "php",
    code: `<?php
// A structural three-way merge of one views display - the merge git CANNOT do.
// git merges views.view.incidents.yml as lines; this merges it as data, so the
// decisions a line-based merge is silently guessing at become visible.

$base = [
  'label' => 'Incidents',
  'display_options.fields' => ['title', 'created'],
  'display_options.fields.title.label' => 'Title',
  'display_options.pager.options.items_per_page' => '10',
  'display_options.filters.status.value' => '1',
];

// Ana's branch: adds a Severity column, bumps the pager.
$ours = $base;
$ours['display_options.fields'] = ['title', 'field_severity', 'created'];
$ours['display_options.fields.field_severity.label'] = 'Severity';
$ours['display_options.pager.options.items_per_page'] = '25';

// Ben's branch: adds an Owner column, renames Title, bumps the pager too.
$theirs = $base;
$theirs['display_options.fields'] = ['title', 'field_owner', 'created'];
$theirs['display_options.fields.field_owner.label'] = 'Owner';
$theirs['display_options.fields.title.label'] = 'Incident';
$theirs['display_options.pager.options.items_per_page'] = '50';

$paths = array_keys($base + $ours + $theirs);
sort($paths);

$conflicts = 0;
printf("%-46s %s\\n", 'path', 'decision');
echo str_repeat('-', 72) . "\\n";

foreach ($paths as $path) {
  $b = $base[$path] ?? NULL;
  $o = $ours[$path] ?? NULL;
  $t = $theirs[$path] ?? NULL;

  // A views fields/filters/sorts list is a MAPPING whose key order IS the
  // render order - there is no weight key to break a tie. Handle it apart.
  if (is_array($o) || is_array($t)) {
    $oAdded = array_values(array_diff($o ?? [], $b ?? []));
    $tAdded = array_values(array_diff($t ?? [], $b ?? []));
    if ($oAdded && $tAdded) {
      $conflicts++;
      printf("%-46s %s\\n", $path, 'CONFLICT: both inserted at index 1 ('
        . implode(', ', array_merge($oAdded, $tAdded)) . ') - order undecidable');
      continue;
    }
    printf("%-46s %s\\n", $path, 'clean (only one side touched the order)');
    continue;
  }

  if ($o === $t) {
    printf("%-46s %s\\n", $path, 'clean (identical)');
  }
  elseif ($o === $b) {
    printf("%-46s take theirs -> %s\\n", $path, var_export($t, TRUE));
  }
  elseif ($t === $b) {
    printf("%-46s take ours   -> %s\\n", $path, var_export($o, TRUE));
  }
  else {
    $conflicts++;
    printf("%-46s CONFLICT: ours=%s theirs=%s\\n", $path, var_export($o, TRUE), var_export($t, TRUE));
  }
}

echo str_repeat('-', 72) . "\\n";
echo "conflicts a human must decide: {$conflicts}\\n";
echo "\\n";
echo "git sees none of this structure. It merges the hunks by line and will\\n";
echo "happily emit a fields: mapping holding both new columns in an order\\n";
echo "nobody chose, beside a pager value it picked by proximity - with no\\n";
echo "conflict markers to warn you.\\n";
echo "Safe resolution: take one side whole, drush cim, redo the smaller\\n";
echo "change in the UI, drush cex. Never hand-merge generated YAML.\\n";
`,
    output: `path                                           decision
------------------------------------------------------------------------
display_options.fields                         CONFLICT: both inserted at index 1 (field_severity, field_owner) - order undecidable
display_options.fields.field_owner.label       take theirs -> 'Owner'
display_options.fields.field_severity.label    take ours   -> 'Severity'
display_options.fields.title.label             take theirs -> 'Incident'
display_options.filters.status.value           clean (identical)
display_options.pager.options.items_per_page   CONFLICT: ours='25' theirs='50'
label                                          clean (identical)
------------------------------------------------------------------------
conflicts a human must decide: 2

git sees none of this structure. It merges the hunks by line and will
happily emit a fields: mapping holding both new columns in an order
nobody chose, beside a pager value it picked by proximity - with no
conflict markers to warn you.
Safe resolution: take one side whole, drush cim, redo the smaller
change in the UI, drush cex. Never hand-merge generated YAML.
`,
  },

  keyPoints: [
    "Exported config is machine-written and order-sensitive: in a views display the key order of fields, filters and sorts is the output order, with no weight to arbitrate a merge.",
    "The worst outcome is a clean auto-merge, not a conflict — valid YAML describing a view nobody designed, which drush cim imports happily.",
    "Resolve by taking one side of the file wholesale, then drush cim, redo the smaller change in the UI, drush cex. Mid-merge that is git checkout --theirs (or git checkout MERGE_HEAD for a path that auto-merged while another path conflicted); if the merge already auto-committed with no conflicts, MERGE_HEAD is gone, so check the file out of the merged-in branch (git checkout origin/main -- config/sync/views.view.incidents.yml) and commit that as a follow-up.",
    "git status cannot see the active store. drush config:status is the real answer, reporting each object as Only in DB, Only in sync dir or Different.",
    "Always drush cim after pulling config and before touching the UI, or your next cex silently reverts a teammate's object.",
    "Prevention is mostly social: short-lived branches, small PRs, one owner per config area, plus config/sync/*.yml merge=binary in .gitattributes to stop git guessing.",
  ],

  interview: [
    {
      q: "Two developers changed the same view on separate branches and the merge conflicts. Walk me through your resolution.",
      a: "I do not hand-merge it — a views export is generated YAML where key order carries meaning, so a hand-merge produces something plausible and wrong. I take one side of the file whole. While the merge is still open that is `git checkout --theirs -- config/sync/views.view.incidents.yml`, or `git checkout MERGE_HEAD -- <file>` if that file auto-merged without markers but another path conflicted so the merge is still in progress. If nothing conflicted at all, git has already committed the merge and `MERGE_HEAD` no longer exists, so I check the file out of the branch I merged in — `git checkout origin/main -- <file>`, or `git checkout HEAD^2 -- <file>` on the merge commit — and commit that as a follow-up. Either way I then run `drush cim -y` so my active store matches the branch exactly. Then I redo the smaller of the two changes through the admin UI, `drush cex -y`, and commit just that file. Whoever's change is cheaper to rebuild is the one who rebuilds it. The whole point is that Drupal, not git, regenerates the file.",
    },
    {
      q: "Why is a config merge conflict more dangerous than a code merge conflict?",
      a: "A code conflict sits between two pieces of text humans wrote, so both sides can be read and reasoned about, and the compiler or test suite usually catches a bad resolution. A config conflict sits between two UI intentions that were serialised into a deep object graph — a merged views file can be perfectly valid YAML, import without error, and still render the wrong columns in the wrong order. There is no type checker for it. And because these files are long and verbose, the two edits are often far enough apart that git merges them with no conflict markers at all, so nobody is even prompted to look.",
    },
    {
      q: "You pull main and `drush config:status` shows differences you did not make. What do you do, and what must you not do?",
      a: "The states tell me what happened: `Only in sync dir` means a teammate exported config I have not imported, `Only in DB` means I built something locally and never exported it, and `Different` means we both moved the same object. The thing I must not do is run `drush cex` — that would export my stale active copy over their file and land a silent revert inside my PR. I run `drush cim -y` first, accepting that any unexported local work is discarded, which is exactly the reset I want. If I genuinely had local work worth keeping, I export it to a scratch directory first, or re-do it in the UI after the import.",
    },
    {
      q: "How would you organise a four-person team to reduce config conflicts in the first place?",
      a: "Mostly process, backed by a little tooling. Branches live hours, not weeks, and PRs are small enough that one person owns one config area at a time — whoever is editing the incidents view says so in the channel. Environment-specific config gets moved out of the shared file set with config_split so dev-only objects never reach anyone else's diff. I commit a `.gitattributes` with `config/sync/*.yml merge=binary`, which uses git's built-in binary merge driver to keep my version in the work tree and mark the path conflicted, so git can never silently auto-merge a generated file. Finally, config diffs get reviewed as carefully as code — that is where accidental permission and workflow changes hide.",
    },
  ],

  quiz: [
    {
      question:
        "Two branches each add one field to the same view, twelve lines apart in the exported YAML. What is the most likely outcome of the merge?",
      options: [
        "git refuses to merge the file at all because it is machine-generated",
        "git merges both hunks cleanly and produces valid YAML for a view neither developer designed",
        "git raises a conflict, which is the safest possible result",
        "drush cim rejects the merged file because the dependencies block is stale",
      ],
      answerIndex: 1,
      explain:
        "Twelve lines apart is comfortably outside a conflict window, so git merges both additions silently. The result is syntactically valid YAML with both columns in an order nobody chose, and drush cim imports it without complaint — the failure surfaces later, on stage, as a wrong-looking view.",
    },
    {
      question:
        "You have just pulled a branch that changed config/sync. What must you do before opening the admin UI and making your own change?",
      options: [
        "Run drush cex so the sync directory reflects your site",
        "Run drush cr to rebuild caches, which reloads the sync directory",
        "Run drush cim so the active store matches the branch",
        "Nothing — a git pull updates the active configuration store",
      ],
      answerIndex: 2,
      explain:
        "A git pull only touches files. The active store still holds the pre-pull state, so any cex you run afterwards re-exports your stale copies over your teammate's objects. drush cim resets the active store to match the branch; unexported local work is discarded, which is the intended behaviour.",
    },
    {
      question:
        "What does `config/sync/*.yml merge=binary` in .gitattributes do?",
      options: [
        "Stores the YAML files as binary blobs so they compress better in the repository",
        "Makes git run a three-way merge but take lines from both versions without markers",
        "Keeps your branch's version in the work tree and marks the path conflicted for you to sort out",
        "Tells drush to import those files without validating them against config schema",
      ],
      answerIndex: 2,
      explain:
        "'binary' is one of git's built-in merge drivers: it does not attempt a textual merge, keeps the version from your branch in the working tree, and leaves the path in a conflicted state. That is what you want for generated config — it converts every silent auto-merge into a stop-and-decide moment. (The driver that takes lines from both sides without markers is 'union'.)",
    },
    {
      question:
        "drush config:status reports views.view.incidents as 'Different'. What does that mean?",
      options: [
        "The object exists only in the database and has never been exported",
        "The object exists only in the sync directory and has never been imported",
        "The object exists in both stores but their contents do not match",
        "The object's UUID does not match the site UUID in system.site",
      ],
      answerIndex: 2,
      explain:
        "config:status compares the active store with the sync directory per object. 'Only in DB' and 'Only in sync dir' cover the one-sided cases; 'Different' means the object exists on both sides with differing contents — typically because you and a teammate both changed it. Resolve that before running either cex or cim.",
    },
  ],
};

export default lesson;

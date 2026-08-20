import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "government-content-dlm-and-workflow",
  title: "Markers, Consultations and Government Editorial Workflow",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "What the profile already decided about your editorial workflow, why govcms_dlm only touches email subjects, and why three of the four government-shaped modules in your codebase cannot be switched on.",
  concept: `## The parts of the stack that exist because this is government

You know \`content_moderation\`, \`workflows\` and the revision UI. What changes on GovCMS is that some of that is decided for you before you arrive, some is one line away, and some is code you can read in \`web/modules/contrib\` and still cannot enable.

### Already installed, already configured

The profile's \`install:\` list includes \`drupal:content_moderation\` and \`drupal:workflows\`, and \`config/install\` ships \`workflows.workflow.editorial.yml\`: states \`draft\`, \`needs_review\`, \`published\`, \`archived\`, and seven transitions. It also ships three roles. The split between two of them is the whole point:

\`\`\`yaml
# user.role.govcms_content_author.yml
- 'use editorial transition create_new_draft'
- 'use editorial transition needs_review'
# user.role.govcms_content_approver.yml also has
- 'use editorial transition publish'
- 'use editorial transition archive'
\`\`\`

Authors cannot publish; approvers can. Separation of duties, out of the box. But it is **site-wide**: \`govcms_content_author\` holds \`edit any govcms_standard_page content\`, not "edit pages in my branch of the agency".

### Sectioned ownership is bundled, not reachable

\`drupal/workbench_access\` 2.0.4 is in the distribution's \`composer.json\`. It is not in the profile's install list, and it is not one of the names in \`$config['module_permissions.settings']['managed_modules']\`. The same is true of \`drupal/diff\` 1.10.0 and \`drupal/consultation-consultation\` 1.1.0. Verified status for all three: bundled, not installed, not allowlisted. Present in the codebase is not the same as available.

\`drupal/scheduled_transitions\` 2.8.4 is the exception. It *is* on the allowlist, and so is its whole dependency chain — \`content_moderation\` from the profile, \`dynamic_entity_reference\` from the same list.

### Embargo runs on cron, and cron is hourly

Scheduled Transitions' \`hook_cron()\` creates queue items; the \`scheduled_transition_job\` QueueWorker drains them under a 900-second cron budget. In the scaffold's \`.lagoon.yml\`, cron is declared exactly once:

\`\`\`yaml
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
\`\`\`

Lagoon's \`M\` means "a minute the platform picks, the same one every hour", and the default cron timezone is UTC. So a 9am embargo lifts somewhere inside the 9 o'clock hour, not at 9:00:00. The block also sits under \`master\` only, so non-production Lagoon environments have no cron entry at all — which is why editors testing a scheduled transition on a branch environment report that nothing happened. On SaaS \`.lagoon.yml\` is a locked file, so you cannot tighten the schedule.

### govcms_dlm marks email subjects, and nothing else

\`govcms_dlm\` 3.0.0 — \`GovCMS Dissemination Limiting Marker (DLM)\`, described as \`Add optional DLM to emails sent from drupal mail.\` — is on the allowlist and off by default. Its entire behaviour is one \`hook_mail_alter()\` that rewrites \`$message['subject']\` to \`'@subject @dlm'\`, where \`@dlm\` is the single \`suffix\` value in \`govcms_dlm.settings\`: one of \`[SEC=UNOFFICIAL]\`, \`[SEC=OFFICIAL]\`, \`[SEC=OFFICIAL:Sensitive]\`, chosen at \`/admin/config/system/dlm\`. It reads no node, no field, no recipient. Per-content markers are a field you build.

### Consultations

Consultation (the module drupal.org describes as "previously known as Have Your Say") ships a \`consultation\` node type, two paragraph types, a \`consultation_update_type\` vocabulary and a \`consultation_default\` webform you duplicate. Remember \`webform.webform.*\` is in the GovCMS \`config_ignore\` defaults — the cloned form never travels in \`config/default\`.`,
  comparisons: [
    {
      label: "Turning on the editorial stack",
      intro:
        "You want scheduled publishing, sectioned ownership and a revision diff. On your own Drupal 11 site that is one composer require and one drush en. On GovCMS the packages are already there and the question is a different one.",
      leftLang: "bash",
      rightLang: "php",
      php: `# Vanilla Drupal 11 site you control.
composer require drupal/scheduled_transitions drupal/workbench_access drupal/diff
drush -y en content_moderation workflows scheduled_transitions workbench_access diff
drush -y config:export
git add config composer.json composer.lock
git commit -m "Add scheduled publishing, editorial sections and revision diff"`,
      ts: `<?php
// scaffold-tooling drupal/settings/security.settings.php -- 6 of the 73 entries.
// composer require is a no-op here: workbench_access 2.0.4, diff 1.10.0 and
// consultation 1.1.0 are already pinned in the distribution's composer.json.
// What decides whether a site may enable them is this list.
$config['module_permissions.settings']['managed_modules'] = [
  'dynamic_entity_reference',
  'field_group',
  'govcms_dlm',
  'paragraphs',
  'scheduled_transitions',
  'webform',
];

$config['module_permissions.settings']['protected_modules'] = [
  'module_permissions',
  'module_permissions_ui',
];`,
      note:
        "scheduled_transitions and govcms_dlm are on the allowlist; workbench_access, diff and consultation are bundled, not in the profile's install list, and not on it.",
    },
    {
      label: "Sectioned editorial ownership across a big agency",
      intro:
        "A department with six divisions wants each division's editors confined to their own content. Vanilla Drupal answers with a Workbench Access scheme; GovCMS answers with the roles the profile shipped.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# workbench_access.access_scheme.editorial_section.yml
langcode: en
status: true
dependencies:
  config:
    - field.field.node.article.field_workbench_access
    - taxonomy.vocabulary.editorial_section
id: editorial_section
label: 'Editorial section'
plural_label: 'Editorial sections'
scheme: taxonomy
scheme_settings:
  vocabularies:
    - editorial_section
  fields:
    -
      entity_type: node
      bundle: article
      field: field_workbench_access`,
      ts: `# user.role.govcms_content_author.yml -- shipped in the profile's config/install
id: govcms_content_author
label: 'Content Author'
is_admin: null
permissions:
  - 'edit any govcms_standard_page content'
  - 'edit any govcms_news_and_media content'
  - 'delete any govcms_standard_page content'
  - 'use editorial transition create_new_draft'
  - 'use editorial transition needs_review'
  - 'view any unpublished content'
  - 'view latest version'
  - 'setup own tfa'
# No section scoping anywhere: 'edit any', across every division.`,
      note:
        "The shipped roles separate authoring from approval, not division from division. Scoping by section needs workbench_access, which is bundled but not on the allowlist.",
    },
    {
      label: "When an embargoed announcement actually goes live",
      intro:
        "Communications sets a media release to publish at 9:00am on budget day. What determines the moment it appears is not the timestamp on the scheduled transition -- it is the cron schedule.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla: your own crontab, as tight as you want it.
* * * * * drush --root=/var/www/html scheduled-transitions:queue-jobs
* * * * * drush --root=/var/www/html queue:run scheduled_transition_job

# Verify from the shell whenever you like.
drush --root=/var/www/html sctr-jobs
drush --root=/var/www/html queue:list`,
      ts: `# .lagoon.yml in govCMS/scaffold -- the whole cron declaration.
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli

# M = a minute Lagoon picks and reuses every hour. Default timezone UTC.
# Declared under master only: branch environments get no cron at all.
# .lagoon.yml is on the SaaS locked-files list, so this is not yours to change.`,
      note:
        "Hourly granularity in UTC, at an unknown minute. Tell comms the release lands inside the 9 o'clock hour, and never demo an embargo on a dev branch environment.",
    },
    {
      label: "Putting a protective marker on an email",
      intro:
        "A webform submission notification about a sensitive FOI request needs a dissemination limiting marker in the subject line. Vanilla Drupal: write the hook. GovCMS: read what the bundled module actually does before you promise anything.",
      php: `<?php
// my_agency.module on a site you control -- marker derived per message.
function my_agency_mail_alter(&$message) {
  // EmailWebformHandler builds its key as "<webform_id>_<handler_id>" and mails
  // it through the 'webform' module, so $message['id'] is 'webform_' . that key
  // -- never a single fixed string.
  if (!str_starts_with($message['id'], 'webform_')) {
    return;
  }
  // The handler puts the submission itself in the params, not a node.
  $submission = $message['params']['webform_submission'] ?? NULL;
  $node = $submission instanceof \\Drupal\\webform\\WebformSubmissionInterface
    ? $submission->getSourceEntity()
    : NULL;
  $marker = '[SEC=UNOFFICIAL]';
  if ($node instanceof \\Drupal\\node\\NodeInterface
    && !$node->get('field_dlm')->isEmpty()) {
    $marker = '[SEC=' . $node->get('field_dlm')->value . ']';
  }
  $message['subject'] = $message['subject'] . ' ' . $marker;
}`,
      ts: `<?php
// govcms_dlm.module, 3.0.0, in full. This is the entire mechanism.
function govcms_dlm_mail_alter(&$message) {
  $message['subject'] = t('@subject @dlm', [
    '@subject' => $message['subject'],
    '@dlm' => \\Drupal::config('govcms_dlm.settings')->get('suffix'),
  ]);
}

// GovcmsDlmForm at /admin/config/system/dlm writes govcms_dlm.settings:suffix,
// one of three literals, for the whole site:
//   '[SEC=UNOFFICIAL]'  '[SEC=OFFICIAL]'  '[SEC=OFFICIAL:Sensitive]'
// Default from config/install: '[SEC=UNOFFICIAL]'. No per-message branch.`,
      note:
        "One suffix, every outgoing mail, subject line only. On SaaS the custom module on the left is not an option either, so 'we will vary the marker per message' is a promise you cannot keep.",
    },
  ],
  playground: {
    intro:
      "A pure-PHP editorial simulator: five nodes with a section, a moderation state, a marker field and a scheduled transition, evaluated against three editors and a fixed clock. Change a node's section or an editor's grants and watch the DENY reason move between the three gates.",
    lang: "php",
    code: `<?php

// GovCMS editorial simulator. Fixed clock, literal data, no Drupal.
$now = 1771495200;              // 2026-02-19 10:00:00 UTC
$dlm_suffix = '[SEC=OFFICIAL]'; // govcms_dlm.settings:suffix -- ONE site-wide value.

// workflows.workflow.editorial as shipped by the profile: all seven
// transitions, each mapped to the states it may be applied from.
$workflow = [
  'create_new_draft'   => ['draft', 'published'],
  'needs_review'       => ['draft'],
  'send_back_to_draft' => ['needs_review'],
  'publish'            => ['needs_review', 'published'],
  'archive'            => ['published'],
  'archived_draft'     => ['archived'],   // label 'Restore to Draft'
  'archived_published' => ['archived'],   // label 'Restore'
];

// Each node: division, current state, the agency's own marker field, the
// transition someone is attempting, a scheduled transition, a revision diff.
$nodes = [
  ['id' => 'n41', 'section' => 'health',  'state' => 'draft',        'marker' => 'OFFICIAL',            'want' => 'needs_review', 'due' => 0,          'add' => 3, 'del' => 1],
  ['id' => 'n42', 'section' => 'health',  'state' => 'needs_review', 'marker' => 'OFFICIAL: Sensitive', 'want' => 'publish',      'due' => 1771491600, 'add' => 0, 'del' => 2],
  ['id' => 'n43', 'section' => 'revenue', 'state' => 'needs_review', 'marker' => 'OFFICIAL',            'want' => 'publish',      'due' => 1771498800, 'add' => 5, 'del' => 0],
  ['id' => 'n44', 'section' => 'revenue', 'state' => 'published',    'marker' => 'UNOFFICIAL',          'want' => 'archive',      'due' => 0,          'add' => 1, 'del' => 4],
  ['id' => 'n45', 'section' => 'legal',   'state' => 'archived',     'marker' => 'OFFICIAL: Sensitive', 'want' => 'archived_draft', 'due' => 1771488000, 'add' => 2, 'del' => 2],
];

// The roles the profile ships, plus a section assignment that only exists at
// all if workbench_access is enabled.
$all = ['create_new_draft', 'needs_review', 'send_back_to_draft', 'publish', 'archive', 'archived_draft', 'archived_published'];
$editors = [
  ['name' => 'nadia', 'sections' => ['health'],            'bypass' => false, 'grants' => ['create_new_draft', 'needs_review']],
  ['name' => 'omar',  'sections' => ['health', 'revenue'], 'bypass' => false, 'grants' => $all],
  ['name' => 'pia',   'sections' => [],                    'bypass' => true,  'grants' => $all],
];

function decide(array $node, array $editor, array $workflow): array {
  $want = $node['want'];
  if (!in_array($node['state'], $workflow[$want], true)) {
    return ['DENY', 'workflow: no ' . $want . ' from ' . $node['state']];
  }
  if (!in_array($want, $editor['grants'], true)) {
    return ['DENY', 'perm: use editorial transition ' . $want];
  }
  if (!$editor['bypass'] && !in_array($node['section'], $editor['sections'], true)) {
    return ['DENY', 'section: ' . $node['section'] . ' not assigned'];
  }
  return ['ALLOW', $editor['bypass'] ? 'bypass workbench access' : 'section ' . $node['section']];
}

printf("EDITORIAL SIMULATION   clock %s UTC\\n", gmdate('Y-m-d H:i', $now));

printf("\\n1. ACCESS MATRIX\\n");
printf("%-4s %-8s %-17s %-6s %-6s %s\\n", 'node', 'section', 'attempt', 'who', 'result', 'reason');
foreach ($nodes as $n) {
  foreach ($editors as $e) {
    [$verdict, $why] = decide($n, $e, $workflow);
    printf("%-4s %-8s %-17s %-6s %-6s %s\\n", $n['id'], $n['section'], $n['want'], $e['name'], $verdict, $why);
  }
}

printf("\\n2. SCHEDULED TRANSITIONS (queued by hook_cron, drained by the queue worker)\\n");
foreach ($nodes as $n) {
  if ($n['due'] === 0) {
    continue;
  }
  printf("%-4s due %s UTC   %s\\n", $n['id'], gmdate('Y-m-d H:i', $n['due']), $n['due'] <= $now ? 'DUE NEXT CRON' : 'waiting');
}

printf("\\n3. MARKERS\\n");
foreach ($nodes as $n) {
  printf("%-4s node field %-20s mail subject suffix %s\\n", $n['id'], $n['marker'], $dlm_suffix);
}
printf("govcms_dlm reads none of those fields; the suffix is one config value.\\n");

printf("\\n4. REVISION DIFF SUMMARY\\n");
$added = 0;
$removed = 0;
foreach ($nodes as $n) {
  printf("%-4s +%d field change(s)  -%d field change(s)\\n", $n['id'], $n['add'], $n['del']);
  $added += $n['add'];
  $removed += $n['del'];
}
printf("total +%d / -%d across %d node(s)\\n", $added, $removed, count($nodes));`,
    output: `EDITORIAL SIMULATION   clock 2026-02-19 10:00 UTC

1. ACCESS MATRIX
node section  attempt           who    result reason
n41  health   needs_review      nadia  ALLOW  section health
n41  health   needs_review      omar   ALLOW  section health
n41  health   needs_review      pia    ALLOW  bypass workbench access
n42  health   publish           nadia  DENY   perm: use editorial transition publish
n42  health   publish           omar   ALLOW  section health
n42  health   publish           pia    ALLOW  bypass workbench access
n43  revenue  publish           nadia  DENY   perm: use editorial transition publish
n43  revenue  publish           omar   ALLOW  section revenue
n43  revenue  publish           pia    ALLOW  bypass workbench access
n44  revenue  archive           nadia  DENY   perm: use editorial transition archive
n44  revenue  archive           omar   ALLOW  section revenue
n44  revenue  archive           pia    ALLOW  bypass workbench access
n45  legal    archived_draft    nadia  DENY   perm: use editorial transition archived_draft
n45  legal    archived_draft    omar   DENY   section: legal not assigned
n45  legal    archived_draft    pia    ALLOW  bypass workbench access

2. SCHEDULED TRANSITIONS (queued by hook_cron, drained by the queue worker)
n42  due 2026-02-19 09:00 UTC   DUE NEXT CRON
n43  due 2026-02-19 11:00 UTC   waiting
n45  due 2026-02-19 08:00 UTC   DUE NEXT CRON

3. MARKERS
n41  node field OFFICIAL             mail subject suffix [SEC=OFFICIAL]
n42  node field OFFICIAL: Sensitive  mail subject suffix [SEC=OFFICIAL]
n43  node field OFFICIAL             mail subject suffix [SEC=OFFICIAL]
n44  node field UNOFFICIAL           mail subject suffix [SEC=OFFICIAL]
n45  node field OFFICIAL: Sensitive  mail subject suffix [SEC=OFFICIAL]
govcms_dlm reads none of those fields; the suffix is one config value.

4. REVISION DIFF SUMMARY
n41  +3 field change(s)  -1 field change(s)
n42  +0 field change(s)  -2 field change(s)
n43  +5 field change(s)  -0 field change(s)
n44  +1 field change(s)  -4 field change(s)
n45  +2 field change(s)  -2 field change(s)
total +11 / -9 across 5 node(s)
`,
  },
  keyPoints: [
    "The profile installs content_moderation and workflows and ships workflows.workflow.editorial (draft, needs_review, published, archived; seven transitions) plus the govcms_content_author, govcms_content_approver and govcms_site_administrator roles.",
    "Authors get create_new_draft and needs_review; approvers add publish and archive. The separation is by action, never by section -- the author role holds 'edit any' on every shipped content type.",
    "workbench_access 2.0.4, diff 1.10.0 and consultation 1.1.0 are pinned in the distribution's composer.json but are neither in the profile's install list nor on the managed_modules allowlist. scheduled_transitions 2.8.4 is on the allowlist, and so is dynamic_entity_reference, its one contrib dependency.",
    "Scheduled transitions fire on Drupal cron, and the scaffold's .lagoon.yml declares cron once, under environments.master, as schedule: \"M * * * *\" -- hourly, at a platform-chosen minute, UTC by default, and absent entirely from branch environments.",
    "govcms_dlm 3.0.0 is a single hook_mail_alter() that appends govcms_dlm.settings:suffix to every outgoing mail subject. One of three literals, site-wide, configured at /admin/config/system/dlm. It classifies no node, field or file.",
    "Consultation ships the Have Your Say pattern as a consultation node type, paragraph types, a vocabulary and a consultation_default webform you duplicate -- and webform.webform.* sits in the GovCMS config_ignore defaults, so the duplicate never travels in config/default.",
  ],
  interview: [
    {
      q: "A department wants each of its six divisions to only edit its own pages. How do you deliver that on GovCMS SaaS?",
      a: "The honest first move is to check reachability, not capability. `workbench_access` 2.0.4 is pinned in the distribution's `composer.json`, so the code is sitting in `web/modules/contrib`, but it is not in the profile's install list and it is not on the `managed_modules` allowlist in `security.settings.php` — so a delegated site role cannot switch it on, and I would not commit to a date for changing that. What the profile does give me is `govcms_content_author` versus `govcms_content_approver`, which separates *authoring* from *publishing* but not division from division: the author role literally holds `edit any govcms_standard_page content`. So I would scope the conversation to what is deliverable — per-action separation now, plus a design that uses content types and menus per division so the eventual scheme has something to hang off — and raise the section-scoping requirement with GovCMS as a platform question rather than quietly shipping a workaround.",
    },
    {
      q: "Comms need a media release live at exactly 9:00am on budget day. What do you tell them?",
      a: "That the platform gives them the hour, not the minute. Scheduled Transitions is allowlisted and its `hook_cron()` queues the job, which the `scheduled_transition_job` queue worker drains inside cron's 900-second budget — but cron on GovCMS is declared in `.lagoon.yml` as `schedule: \"M * * * *\"`, and Lagoon's `M` means a minute the platform picked and reuses every hour, in UTC. So a 9am transition lands somewhere inside the 9 o'clock hour. `.lagoon.yml` is on the SaaS locked-files list, so I cannot tighten it. So I never schedule an embargoed item *earlier* than its release time — that publishes it inside the previous hour and breaks the embargo. I set the transition at the start of the embargo window and tell comms it lands somewhere inside that hour; if a hard minute is genuinely required, a person publishes manually at the moment of release rather than trusting cron. I also make sure nobody rehearses it on a branch environment, because the cronjobs block sits under `environments: master:` only — dev environments have no cron at all, and that is the single most common \"scheduled publishing is broken\" ticket.",
    },
    {
      q: "The client asks for OFFICIAL: Sensitive markers on their content. Does govcms_dlm do that?",
      a: "No, and being precise here matters because the name invites the misunderstanding. `govcms_dlm` 3.0.0 is `Add optional DLM to emails sent from drupal mail.` Its entire implementation is one `hook_mail_alter()` that rewrites `$message['subject']` to `'@subject @dlm'`, where `@dlm` is the single `suffix` value in `govcms_dlm.settings` — `[SEC=UNOFFICIAL]`, `[SEC=OFFICIAL]` or `[SEC=OFFICIAL:Sensitive]`, picked at `/admin/config/system/dlm`. It is site-wide and it never looks at a node. Its own settings form even warns that setting a marker does not make the mail transmission secure — the email gateway has to be configured for that. If the client wants markers on *content*, that is a field plus theme output that they build; and separately I would remind them the platform is certified up to OFFICIAL: Sensitive, so content above that classification does not belong on GovCMS at all.",
    },
    {
      q: "How do you handle the Have Your Say / public consultation pattern, and what breaks in deployment?",
      a: "The Consultation module is the ready-made answer — drupal.org describes it as previously known as Have Your Say — and the distribution pins `drupal/consultation-consultation` 1.1.0, so the code ships. It is not in the install list and not on the allowlist, so getting it enabled is a platform conversation, not a `drush en`. The deployment trap is the webform: the module's own README tells you to duplicate `consultation_default` at `/admin/structure/webform/manage/consultation_default/duplicate`, and GovCMS's `config_ignore` defaults include `webform.webform.*` and `webform.webform_options.*`. That is deliberate — editors own webforms — but it means the consultation form you built in the dev environment will not appear in production through `config/default`, and you rebuild or hand-migrate it. I would also flag it early rather than late: a consultation collects personal information, which is one of the triggers GovCMS explicitly asks you to talk to them about up front.",
    },
  ],
  quiz: [
    {
      question: "What does govcms_dlm actually do when enabled?",
      options: [
        "Adds a classification field to every content type and renders the marker in the page header.",
        "Appends one site-wide suffix from govcms_dlm.settings to the subject line of every outgoing Drupal mail.",
        "Blocks file uploads whose classification exceeds the site's configured marker.",
        "Stamps the marker on generated PDFs and on webform submission exports.",
      ],
      answerIndex: 1,
      explain:
        "The module is a single hook_mail_alter() that rewrites $message['subject'] to '@subject @dlm', with @dlm read from govcms_dlm.settings:suffix -- one of [SEC=UNOFFICIAL], [SEC=OFFICIAL] or [SEC=OFFICIAL:Sensitive], set at /admin/config/system/dlm. It touches no node, field or file.",
    },
    {
      question: "Which of these editorial modules is on the GovCMS managed_modules allowlist?",
      options: [
        "workbench_access",
        "diff",
        "scheduled_transitions",
        "consultation",
      ],
      answerIndex: 2,
      explain:
        "All four are pinned in the distribution's composer.json, but only scheduled_transitions appears in $config['module_permissions.settings']['managed_modules'] in scaffold-tooling's security.settings.php. Its contrib dependency dynamic_entity_reference is on the same list, and content_moderation is installed by the profile, so the whole chain is reachable. workbench_access, diff and consultation are bundled, not installed and not allowlisted.",
    },
    {
      question: "An editor schedules a transition for 09:00 and reports at 09:20 that nothing published. On a production GovCMS environment, what is the most likely explanation?",
      options: [
        "The scheduled transition entity was never saved, because config_ignore excludes it from deployment.",
        "The site's cache had not been rebuilt, so the published revision was not yet visible.",
        "Scheduled Transitions was uninstalled by govcms-enable_modules on the last deploy.",
        "Drupal cron has not run yet: .lagoon.yml declares it as \"M * * * *\", an hourly job at a platform-chosen minute.",
      ],
      answerIndex: 3,
      explain:
        "hook_cron() queues the job and the scheduled_transition_job queue worker drains it. The scaffold's .lagoon.yml has one cronjob, schedule: \"M * * * *\", which Lagoon reads as once per hour at a minute it picks and reuses -- UTC by default. Nothing happens between cron runs. (On a branch environment the answer is worse: the cronjobs block is declared under environments.master only.)",
    },
    {
      question: "What separation does the profile's shipped govcms_content_author / govcms_content_approver pair actually provide?",
      options: [
        "Approvers can publish and archive; authors can only create drafts and send them for review -- with no scoping by section.",
        "Authors are confined to the content types assigned to their editorial section; approvers see everything.",
        "Authors edit only their own content; approvers edit any content.",
        "Authors work in the default workspace; approvers can publish a workspace to live.",
      ],
      answerIndex: 0,
      explain:
        "user.role.govcms_content_author.yml grants 'use editorial transition create_new_draft' and 'needs_review'; the approver role adds publish, archive and the archived_* restores. But the author role also holds 'edit any govcms_standard_page content' and its siblings, so the split is by action, not by ownership or by section. Section scoping would need workbench_access, which is not allowlisted.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "content-moderation-workflows",
  title: "Content Moderation: Editorial Workflows in Config",
  part: "Users, Config & Handoff",
  estMinutes: 13,
  summary:
    "Core's Workflows + Content Moderation modules give you a permission-gated state machine (draft/review/published/archived) as ONE exportable config entity, plus safe forward revisions of live pages — replacing the Symfony Workflow component, guard listeners, and hand-rolled revision juggling.",

  concept: `
## The state machine you already know

You have almost certainly used the **Symfony Workflow component**: define
places and transitions in \`framework.workflows\`, inject
\`WorkflowInterface\`, call \`can()\` / \`apply()\`, and write guard event
listeners to gate transitions by role. Drupal ships the same idea as two core
modules — and the whole machine is clicked together, not coded.

- **Workflows** is the generic engine: a *workflow* config entity holding
  states and transitions. It does nothing by itself.
- **Content Moderation** is the plugin that binds a workflow to revisionable
  content entities — nodes get a \`moderation_state\` field, and saving becomes
  "apply a transition".

Enable both with \`drush pm:enable content_moderation\` (it pulls in
\`workflows\` as a dependency).

## Building the Editorial workflow

**Configuration > Workflow > Workflows > Add workflow**
(\`/admin/config/workflow/workflows\`). Pick the *Content moderation* type,
then add states: **Draft, Review, Published, Archived**. Each state carries two
checkboxes that do all the heavy lifting:

- **Published** — does content in this state count as published to visitors?
- **Default revision** — does *entering* this state overwrite the live copy?

Draft and Review: neither. Published: both. Archived: *unpublished but default
revision* — entering it takes the page offline.

Then add **transitions**, each with from-states and one to-state: *Create New
Draft* (draft, published → draft), *Submit for review* (draft → review),
*Publish* (review, published → published), *Archive* (published → archived).
Finally, under **This workflow applies to**, tick the content types. All of it
exports as a single config entity: \`workflows.workflow.editorial\`.

## Guards are permission checkboxes

For every transition, Content Moderation mints a permission named
\`use editorial transition publish\` (pattern: *use {workflow} transition
{transition}*). Grant them per role at **People > Permissions** — that is your
Symfony guard listener, reduced to a checkbox and exported inside
\`user.role.*.yml\`. Reviewers also want \`view latest version\` and
\`view any unpublished content\`.

## Forward revisions: the payoff

The split that makes this safe is **default revision vs latest revision**. When
an author edits a *live* page and picks "Change to: Draft", Drupal saves a new
revision but does **not** make it the default: visitors keep seeing the
published revision, while the pending draft — a *forward revision* — appears on
the node's **Latest version** tab (\`/node/{id}/latest\`). A reviewer applies
*Publish* and the new revision becomes the default. Nobody wrote a line of
revision-handling code, and the live site never showed a half-finished rewrite.

## The review queue

**Content > Moderated content** (\`/admin/content/moderated\`) lists latest
revisions awaiting action — and it is just a core View
(\`views.view.moderated_content\`), so you can add filters or columns like any
other View.

One last config-vs-content check: the workflow, its transitions, the
permissions, and the queue View are all **config** — they deploy with
\`drush cex\` / \`cim\`. Which state each node is *currently in*, and its
revisions, are **content** — database rows that stay put per environment.
`,

  comparisons: [
    {
      label: "Defining the state machine",
      intro:
        "Draft → review → published → archived. In Symfony you configure the Workflow component and then still owe controllers, forms, and screens. In Drupal the whole machine is one config entity built in the UI.",
      leftLang: "yaml",
      php: `# config/packages/workflow.yaml — and after this you still
# write the apply-transition controller, the form buttons,
# guard listeners, and a review-queue screen yourself.
framework:
  workflows:
    editorial:
      type: state_machine
      marking_store:
        type: method
        property: marking
      supports:
        - App\\Entity\\Article
      initial_marking: draft
      places: [draft, review, published, archived]
      transitions:
        submit_for_review:
          from: draft
          to: review
        publish:
          from: review
          to: published
        archive:
          from: published
          to: archived`,
      ts: `# Configuration > Workflow > Workflows > Add workflow
#   (/admin/config/workflow/workflows) — type: Content
#   moderation. Add states + transitions in the same form.
# drush cex -> workflows.workflow.editorial.yml:
id: editorial
label: Editorial
type: content_moderation
type_settings:
  states:
    draft:
      label: Draft
      weight: -5
      published: false
      default_revision: false
    review:
      label: Review
      weight: -4
      published: false
      default_revision: false
    published:
      label: Published
      weight: 0
      published: true
      default_revision: true
    archived:
      label: Archived
      weight: 5
      published: false
      default_revision: true   # entering it unpublishes LIVE
  transitions:
    create_new_draft:
      label: 'Create New Draft'
      from: [draft, published]
      to: draft
      weight: 0
    submit_for_review:
      label: 'Submit for review'
      from: [draft]
      to: review
      weight: 1
    publish:
      label: Publish
      from: [review, published]
      to: published
      weight: 2
    archive:
      label: Archive
      from: [published]
      to: archived
      weight: 3
  default_moderation_state: draft`,
      note:
        "Each state's two flags — published + default_revision — encode what Symfony leaves to your code: visibility AND whether entering the state replaces the live copy. The node form's save button becomes a 'Change to:' transition select.",
    },
    {
      label: "Gating who may publish",
      intro:
        "Only reviewers may run the publish transition. Symfony: a guard event subscriber per rule. Drupal: every transition automatically mints a permission you grant per role.",
      php: `// Symfony: one guard listener per gated transition.
use Symfony\\Bundle\\SecurityBundle\\Security;
use Symfony\\Component\\EventDispatcher\\EventSubscriberInterface;
use Symfony\\Component\\Workflow\\Event\\GuardEvent;

class PublishGuard implements EventSubscriberInterface
{
    public function __construct(private Security $security) {}

    public function guardPublish(GuardEvent $event): void
    {
        if (!$this->security->isGranted('ROLE_REVIEWER')) {
            $event->setBlocked(true, 'Reviewers only.');
        }
    }

    public static function getSubscribedEvents(): array
    {
        return [
            'workflow.editorial.guard.publish' => 'guardPublish',
        ];
    }
}`,
      ts: `# People > Permissions (/admin/people/permissions)
#   Content Moderation mints one row per transition:
#   "Editorial workflow: Use Publish transition."
#   Tick the Reviewer column, save. No guard code.
# drush cex -> user.role.reviewer.yml:
id: reviewer
label: Reviewer
permissions:
  - 'use editorial transition archive'
  - 'use editorial transition publish'
  - 'view any unpublished content'
  - 'view latest version'

# Authors get the drafting half only:
# user.role.author.yml
#   - 'use editorial transition create_new_draft'
#   - 'use editorial transition submit_for_review'`,
      note:
        "Permission pattern: 'use {workflow_id} transition {transition_id}'. The transition select on the node form only offers transitions the current user may use from the node's current state — the guard logic is resolved for you.",
    },
    {
      label: "Drafting v2 of a live page (forward revisions)",
      intro:
        "An editor must rewrite a published page without the half-done version going live. The coder's instinct is revision juggling in a custom module; Content Moderation does exactly this on every save once the workflow is attached.",
      php: `// Hand-rolled 'pending draft' of a live node:
$node = Node::load(1);             // vid 7, live
$node->setNewRevision(TRUE);
$node->isDefaultRevision(FALSE);   // keep vid 7 as the live copy
$node->setUnpublished();           // the draft itself isn't live
$node->set('body', $rewrite);
$node->save();                     // vid 8 = pending revision

// ...and you still owe: an approve action that loads vid 8
// and flips it to default, access checks for every step,
// and a queue screen listing all pending revisions.
$storage = \\Drupal::entityTypeManager()->getStorage('node');
$pending = $storage->loadRevision(
    $storage->getLatestRevisionId(1)
);`,
      ts: `# Configuration > Workflow > Workflows > Editorial > Edit
#   "This workflow applies to" > Content types > tick Page.
# The workflow export gains the attachment:
type_settings:
  entity_types:
    node:
      - page

# Done. On a LIVE Page an editor edits, picks
# "Change to: Draft", saves. Drupal stores a forward
# revision automatically:
#   - visitors keep seeing the published default revision
#   - the draft appears on the "Latest version" tab
#     (/node/{id}/latest)
#   - a reviewer's Publish flips it to the new default
# Review queue: Content > Moderated content
#   (/admin/content/moderated) — views.view.moderated_content,
#   an ordinary View you can extend like any other.`,
      note:
        "Content Moderation's handler runs setNewRevision(TRUE) and computes isDefaultRevision() from the target state's flags on every save — the exact code on the left, applied consistently, with zero custom module.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate what the node form resolves on every load: which transition buttons each role sees from each state (permission pattern included), then the default-vs-latest revision split when an author drafts v2 of a live page. Predict the output first.",
    code: `<?php
// The state machine Workflows + Content Moderation resolve on
// every node form: which transitions does THIS role get?

$workflow = [
  'transitions' => [
    'create_new_draft'  => ['from' => ['draft', 'published'], 'to' => 'draft'],
    'submit_for_review' => ['from' => ['draft'],              'to' => 'review'],
    'publish'           => ['from' => ['review', 'published'], 'to' => 'published'],
    'archive'           => ['from' => ['published'],          'to' => 'archived'],
  ],
];

// Content Moderation mints one permission per transition:
// "use {workflow_id} transition {transition_id}".
$roles = [
  'author'   => [
    'use editorial transition create_new_draft',
    'use editorial transition submit_for_review',
  ],
  'reviewer' => [
    'use editorial transition publish',
    'use editorial transition archive',
  ],
];

function buttons(array $workflow, array $perms, string $state): array {
  $out = [];
  foreach ($workflow['transitions'] as $id => $t) {
    $allowed = in_array($state, $t['from'], true)
      && in_array("use editorial transition $id", $perms, true);
    if ($allowed) {
      $out[] = $id . ' -> ' . $t['to'];
    }
  }
  return $out;
}

foreach (['draft', 'review', 'published'] as $state) {
  foreach ($roles as $role => $perms) {
    $list = buttons($workflow, $perms, $state);
    echo str_pad($role, 8) . " on $state: "
      . ($list ? implode(', ', $list) : '(no transitions)') . "\\n";
  }
}

// Forward revision: the author drafts v2 of a LIVE page.
$page = [
  'default' => ['vid' => 7, 'state' => 'published'], // visitors
  'latest'  => ['vid' => 7, 'state' => 'published'],
];
$page['latest'] = ['vid' => 8, 'state' => 'draft'];  // create_new_draft

echo "\\nVisitors still see:   vid {$page['default']['vid']}"
  . " ({$page['default']['state']})\\n";
echo "/node/1/latest shows: vid {$page['latest']['vid']}"
  . " ({$page['latest']['state']})\\n";`,
    output: `author   on draft: create_new_draft -> draft, submit_for_review -> review
reviewer on draft: (no transitions)
author   on review: (no transitions)
reviewer on review: publish -> published
author   on published: create_new_draft -> draft
reviewer on published: publish -> published, archive -> archived

Visitors still see:   vid 7 (published)
/node/1/latest shows: vid 8 (draft)`,
  },

  keyPoints: [
    "Workflows (core) is the generic state-machine engine — Drupal's answer to the Symfony Workflow component; Content Moderation (core) binds a workflow to revisionable content entities. drush pm:enable content_moderation pulls both in.",
    "A workflow is ONE config entity — workflows.workflow.editorial.yml — holding states, transitions, attached entity types, and default_moderation_state. It deploys with drush cex/cim like any other config.",
    "Each state has two flags: 'published' (visible to visitors?) and 'default revision' (does entering this state overwrite the live copy?). Archived is unpublished + default revision, which is how it takes a page offline.",
    "Every transition mints a permission — 'use editorial transition publish' — so guards are checkboxes at People > Permissions, exported in user.role.*.yml, not event subscribers.",
    "Forward revisions: saving a Draft of a published node keeps the published default revision live while the pending draft sits at /node/{id}/latest; a permitted Publish transition flips it to the new default. Zero revision-juggling code.",
    "Config vs content: the workflow, permissions, and the Moderated content review queue (views.view.moderated_content at /admin/content/moderated) are config; each node's current moderation state and its revisions are content.",
  ],

  interview: [
    {
      q: "You know the Symfony Workflow component. How does Drupal's Content Moderation compare?",
      a: "They're the same concept at different altitudes. Symfony's component gives you places, transitions, a marking store, and guard events — but the definition lives in `framework.workflows` YAML you write, and everything user-facing (transition buttons, review screens, role gating) is code you add. Drupal splits it into two core modules: Workflows is the engine, storing states and transitions as a *config entity* built in the admin UI, and Content Moderation binds that machine to revisionable entities so the node form itself becomes the `apply()` call. Guards become auto-generated permissions ('use editorial transition publish') granted per role with checkboxes, and the review queue ships as a View. The whole machine exports as `workflows.workflow.editorial.yml` and deploys through config import — no state-machine code in the repo at all.",
    },
    {
      q: "Explain the difference between a node's default revision and its latest revision, and why Content Moderation depends on it.",
      a: "The *default* revision is the one Drupal serves — what anonymous visitors see at the node's URL. The *latest* revision is simply the newest one saved, which may or may not be the default. Content Moderation exploits the gap: when an editor saves a Draft of an already-published node, the handler creates a new revision but leaves `isDefaultRevision` false, producing a *forward (pending) revision* — the live page is untouched while the rewrite-in-progress sits on the node's Latest version tab at `/node/{id}/latest`. When a reviewer applies the Publish transition, that revision becomes the new default because the Published state is flagged as both 'published' and 'default revision'. Without moderation you'd hand-write exactly that with `setNewRevision(TRUE)` and `isDefaultRevision(FALSE)`, plus your own approve action and queue.",
    },
    {
      q: "In a moderation setup, what deploys through config export and what doesn't?",
      a: "The machinery is config: the workflow definition (`workflows.workflow.editorial` with its states, transitions, and attached content types), the per-transition permissions inside `user.role.*.yml`, and the Moderated content View (`views.view.moderated_content`). All of that goes through `drush cex`, git review of the YAML diff, and `drush cim` on production. What does *not* export is the moderation state of individual nodes — which article is currently in Review, and every revision behind it — because that's content: database rows unique to each environment. So you can ship a whole new editorial process to production without touching a single piece of editor-created data, which is exactly the config/content split working as designed.",
    },
  ],

  quiz: [
    {
      question:
        "Only the Reviewer role should be able to run the 'Publish' transition. Where does that rule live in Drupal?",
      options: [
        "A guard event subscriber registered for workflow.editorial.guard.publish",
        "A hook_node_access() implementation in a custom module",
        "The per-transition permission 'use editorial transition publish', granted to Reviewer at People > Permissions and exported in user.role.reviewer.yml",
        "A 'roles' key on the transition inside workflows.workflow.editorial.yml",
      ],
      answerIndex: 2,
      explain:
        "Content Moderation generates one permission per transition using the pattern 'use {workflow} transition {transition}'. Granting it per role on the Permissions page is Drupal's equivalent of a Symfony guard listener — and it exports inside the role's config, not the workflow's. The node form then only offers transitions the current user may use from the node's current state.",
    },
    {
      question:
        "An author edits a published page and saves it with 'Change to: Draft'. What do anonymous visitors see immediately afterwards?",
      options: [
        "The new draft — the latest save always wins",
        "A 403, because the node is now unpublished",
        "The unchanged published version: the draft is a forward revision, visible to reviewers at /node/{id}/latest until someone applies Publish",
        "A cached copy that clears on the next cron run",
      ],
      answerIndex: 2,
      explain:
        "The Draft state has default_revision: false, so the save creates a new revision without replacing the default one. Visitors keep seeing the published default revision; the pending draft appears on the Latest version tab and in the Moderated content queue. Applying Publish — a state flagged published + default revision — makes the new revision live.",
    },
    {
      question:
        "After building the Editorial workflow and moving 30 articles into the Review state, you run drush cex. What lands in config/sync?",
      options: [
        "workflows.workflow.editorial.yml plus 30 files recording each article's Review state",
        "workflows.workflow.editorial.yml (and any changed role exports) — the articles' moderation states are content and never export",
        "Nothing: workflows are stored only in the database",
        "One moderation_state.node.yml file summarising all pending revisions",
      ],
      answerIndex: 1,
      explain:
        "The workflow — states, transitions, attached content types — is a config entity, and transition permissions ride along in user.role.*.yml. But which state each node is in, and its revisions, are content: database rows that cex deliberately ignores. Structure deploys via git; editorial work stays where it was created.",
    },
  ],
};

export default lesson;

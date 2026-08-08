import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "roles-permissions",
  title: "Roles & Permissions: The Access Matrix in the UI",
  part: "Users, Config & Handoff",
  estMinutes: 13,
  summary:
    "People > Roles and the Permissions grid replace security.yaml hierarchies and most Voters: per-bundle CRUD access is a checkbox matrix that exports as user.role.* config, while user accounts stay content — and the grid itself is your security review artifact.",

  concept: `
## The access matrix you keep trying to code

In Symfony, access lives in three places: \`security.yaml\` (a \`role_hierarchy\`
plus \`access_control\` URL rules), \`#[IsGranted]\` attributes on controllers,
and Voter classes for anything ownership-shaped. All of it is code; all of it
deploys. Drupal collapses the common 90% into two admin screens:
**People > Roles** (\`/admin/people/roles\`) and **People > Permissions**
(\`/admin/people/permissions\`).

### Roles are flat, not hierarchical

Two roles ship with every site: **Anonymous user** and **Authenticated user**.
Every visitor implicitly holds exactly one of them; custom roles — add one at
People > Roles > *Add role*, label "Editor", machine name \`editor\` — stack on
top for logged-in users. Two rules replace \`role_hierarchy\`:

- A user's access is the **flat union** of every permission across all their
  roles. There is no inheritance to model, and nothing to forget to inherit.
- Anything ticked in the *Authenticated user* column is held by **every**
  logged-in user regardless of other roles — so keep that column minimal.

The **Administrator** role is special: it exports with \`is_admin: true\`,
which means "skip permission checks entirely" — including permissions added by
modules you install next year.

### The grid: every module declares its rows

The Permissions page is a matrix — one row per permission, one column per role.
Rows come from modules: each declares its own permissions (a
\`MODULE.permissions.yml\` under the hood), so installing a module grows the
grid. The node module generates a CRUD block **per bundle** automatically:
*Article: Create new content*, *Edit own content*, *Edit any content*,
*Delete own content*, *Delete any content*, plus per-bundle revision
permissions (view / revert / delete *article* revisions).

That \`own\` vs \`any\` split is the Voter you no longer write: core compares
the node's author uid to the current user before granting an \`own\`
permission. Only genuinely custom rules — "editors may edit articles only
until the publish date" — still need code, via \`hook_ENTITY_TYPE_access()\`
or an entity access handler.

### 'Administer X' is site-owning

Rows flagged *"Warning: Give to trusted roles only; this permission has
security implications"* deserve paranoia: **Administer site configuration**,
**Administer modules**, **Administer users**, **Administer permissions**,
**Bypass content access control**, and the *Full HTML* text format.
*Administer permissions* is the quiet one — a role holding it can grant itself
everything else. Treat all of these as root.

### Roles are config; people are content

Assign roles on a user's edit form (People > *Edit*), in bulk with the action
dropdown on the People page, or with \`drush user:role:add editor maya\`. Note
the split: the role and its permission list export as \`user.role.editor.yml\`
— reviewable, diffable, deployable via \`drush config:export\` — while user
accounts are content entities that stay in each environment's database. Access
*shape* deploys; *membership* does not.

That export is also your audit habit: the Permissions page, or a \`git diff\`
on \`user.role.*.yml\` in a pull request, **is** the security review artifact.
When a stakeholder asks "who can delete news posts?", you read a grid, not a
codebase.
`,

  comparisons: [
    {
      label: "security.yaml + hierarchy vs Roles + the permission grid",
      intro:
        "The role model and its grants stop being deployed code. A role is a config entity; its permission list is checkboxes on the grid — and the export is the whole story.",
      leftLang: "yaml",
      php: `# config/packages/security.yaml — access rules live in code,
# reviewed and deployed like code.
security:
    role_hierarchy:
        ROLE_EDITOR: ROLE_USER
        ROLE_ADMIN:  [ROLE_EDITOR, ROLE_ALLOWED_TO_SWITCH]
    access_control:
        - { path: ^/admin,       roles: ROLE_ADMIN }
        - { path: ^/article/new, roles: ROLE_EDITOR }
# ...plus PHP for anything finer than a URL prefix:
# Voters, #[IsGranted('ROLE_EDITOR')] on controllers.`,
      ts: `# Click: People > Roles > Add role
#   Role name: Editor          (machine name: editor)
# Click: People > Permissions  (rows = permissions, columns = roles)
#   Tick in the Editor column:
#     Article: Create new content
#     Article: Edit own content
#     Article: Delete own content
#     Access the Content overview page
# Then: drush config:export
#
# config/sync/user.role.editor.yml
langcode: en
status: true
dependencies:
  config:
    - node.type.article
  module:
    - node
id: editor
label: Editor
weight: 3
is_admin: false
permissions:
  - 'access content overview'
  - 'create article content'
  - 'delete own article content'
  - 'edit own article content'`,
      note:
        "No hierarchy exists to export: access is the flat union of a user's roles, and anything granted to Authenticated user applies to every logged-in user. The per-bundle permissions make the role depend on node.type.article — delete the bundle and Drupal knows this config is affected.",
    },
    {
      label: "The ownership Voter vs 'edit own' / 'edit any'",
      intro:
        "The most common Voter in any Symfony app — 'users may edit their own things' — ships as a pair of checkboxes for every bundle you create.",
      php: `<?php
// Symfony: "editors may edit their own articles" = a Voter.
class ArticleVoter extends Voter
{
    protected function supports(string $attribute, mixed $subject): bool
    {
        return $attribute === 'EDIT' && $subject instanceof Article;
    }

    protected function voteOnAttribute(
        string $attribute, mixed $subject, TokenInterface $token
    ): bool {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }
        if ($this->security->isGranted('ROLE_ADMIN')) {
            return true;
        }
        return $subject->getAuthor() === $user; // ownership check
    }
}
// ...one of these per entity, per operation nuance.`,
      ts: `# Click: People > Permissions — filter the grid on 'Article'.
# Every bundle ships this matrix automatically (no code ran):
#
#   Article: Create new content   -> 'create article content'
#   Article: Edit own content     -> 'edit own article content'
#   Article: Edit any content     -> 'edit any article content'
#   Article: Delete own content   -> 'delete own article content'
#   Article: Delete any content   -> 'delete any article content'
#   + View / Revert / Delete article revisions
#
# 'own' vs 'any' IS the Voter: node access compares the node's
# author uid to the current user before granting an 'own' perm.
# Tick two boxes for Editor; the export says the rest:
permissions:
  - 'create article content'
  - 'edit own article content'
# Only rules BEYOND own/any need code — e.g. "lock editing after
# publish": hook_node_access() / an entity access handler.`,
      note:
        "Per-bundle CRUD with an ownership check comes free with every content type. Reach for hook_ENTITY_TYPE_access() only when the rule cannot be expressed as own/any — that is the 'when to code' line for access control.",
    },
    {
      label: "Deploying access: roles travel, users don't",
      intro:
        "In Symfony, what a role means and who holds it both live in the database or in code. Drupal splits them: the role deploys as config; membership is an environment-local act.",
      php: `<?php
// Symfony: roles are strings in a JSON column; keeping
// environments in sync means fixtures run per database.
final class RoleFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        $user = new User();
        $user->setEmail('maya@example.com');
        $user->setRoles(['ROLE_EDITOR']); // meaning + membership
        $manager->persist($user);         // in the same rows
        $manager->flush();
    }
}
// What ROLE_EDITOR can DO still hides in security.yaml,
// attributes, and Voters spread across the codebase.`,
      rightLang: "bash",
      ts: `# The role + its grants are CONFIG — they deploy.
drush config:export -y
git add config/sync/user.role.editor.yml
git commit -m "Editor role: per-bundle article permissions"

# On production, after the code deploy:
drush config:import -y
# [notice] Synchronized configuration: create user.role.editor

# WHO holds the role is CONTENT — set it per environment:
drush user:role:add editor maya
# ...or People > edit the account > tick 'Editor',
# ...or the bulk action dropdown on the People page.

# Granting later permissions is also just config:
drush role:perm:add editor 'delete own article content'
drush config:export -y   # commit the diff for review`,
      note:
        "user.role.editor.yml reaches production without touching any account. User entities never appear in config/sync — they are content, like nodes. Access shape deploys; membership doesn't.",
    },
    {
      label: "The security audit: script it vs read it",
      intro:
        "Answering 'who can do what?' in a framework app means archaeology across the DB, security.yaml, and every Voter. In Drupal the answer is already a page and a YAML file.",
      php: `<?php
// The framework instinct: write an audit script, then
// cross-reference what each role string actually MEANS.
$pdo  = new PDO('mysql:host=db;dbname=app', 'app', 'secret');
$rows = $pdo->query('SELECT email, roles FROM user ORDER BY email');
foreach ($rows as $row) {
    printf("%-28s %s\\n", $row['email'], $row['roles']);
}
// Now grep security.yaml, every #[IsGranted] attribute,
// and every Voter to learn what ROLE_EDITOR unlocks...`,
      rightLang: "bash",
      ts: `# Drupal: the review artifact already exists — read it.

# 1. The grid: People > Permissions (/admin/people/permissions).
#    Risky rows are flagged inline:
#    "Warning: Give to trusted roles only; this permission has
#     security implications."
#    Scan the Administer* rows and Bypass content access control:
#    any tick outside Administrator needs a justification.

# 2. The same facts as reviewable YAML in every pull request:
git diff -- 'config/sync/user.role.*.yml'

# 3. Spot checks from the CLI:
drush role:list --format=yaml   # every role + permission list
drush user:information maya     # roles held by one account`,
      note:
        "Because grants are config, an access change shows up as a YAML diff in code review — 'why does Editor suddenly have administer users?' gets caught in the PR, not in production.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A pure-PHP model of Drupal's access decision: roles are config arrays, users point at roles, and access is the flat union of permissions — plus the is_admin bypass and the own/any ownership compare. Predict every line, then reveal.",
    code: `<?php
declare(strict_types=1);

// user.role.* config entities, as they'd sit in config/sync.
$roles = [
    'anonymous'     => ['is_admin' => false, 'permissions' => ['access content']],
    'authenticated' => ['is_admin' => false, 'permissions' => ['access content']],
    'editor'        => ['is_admin' => false, 'permissions' => [
        'access content overview',
        'create article content',
        'edit own article content',
        'delete own article content',
    ]],
    'administrator' => ['is_admin' => true, 'permissions' => []],
];

// Users are CONTENT: database rows, never in config/sync.
$users = [
    ['name' => 'maya', 'uid' => 12, 'roles' => ['authenticated', 'editor']],
    ['name' => 'root', 'uid' => 1,  'roles' => ['authenticated', 'administrator']],
];

// Drupal's model: flat UNION across roles — no hierarchy.
function hasPermission(array $account, string $perm, array $roles): bool {
    foreach ($account['roles'] as $rid) {
        if ($roles[$rid]['is_admin']) {
            return true; // administrator: skip checks entirely
        }
        if (in_array($perm, $roles[$rid]['permissions'], true)) {
            return true;
        }
    }
    return false;
}

// The per-bundle check you'd write a Voter for in Symfony.
function canEdit(array $account, array $node, array $roles): bool {
    if (hasPermission($account, "edit any {$node['type']} content", $roles)) {
        return true;
    }
    return $node['uid'] === $account['uid']
        && hasPermission($account, "edit own {$node['type']} content", $roles);
}

$own   = ['type' => 'article', 'uid' => 12]; // authored by maya
$other = ['type' => 'article', 'uid' => 99]; // a colleague's

foreach ($users as $account) {
    $n = $account['name'];
    echo $n . ": create article   = " . var_export(hasPermission($account, 'create article content', $roles), true) . "\\n";
    echo $n . ": edit own draft   = " . var_export(canEdit($account, $own, $roles), true) . "\\n";
    echo $n . ": edit colleague's = " . var_export(canEdit($account, $other, $roles), true) . "\\n";
}

echo "\\nDeploys (config): "
   . implode(', ', array_map(fn($id) => "user.role.$id", array_keys($roles))) . "\\n";
echo "Stays in DB (content): "
   . implode(', ', array_map(fn($u) => $u['name'], $users))
   . " — user accounts never export\\n";`,
    output: `maya: create article   = true
maya: edit own draft   = true
maya: edit colleague's = false
root: create article   = true
root: edit own draft   = true
root: edit colleague's = true

Deploys (config): user.role.anonymous, user.role.authenticated, user.role.editor, user.role.administrator
Stays in DB (content): maya, root — user accounts never export`,
  },

  keyPoints: [
    "**People > Roles** creates `user.role.X` config entities; Anonymous and Authenticated ship built-in, and access is the **flat union** of a user's roles — no hierarchy, and anything granted to Authenticated applies to *every* logged-in user.",
    "Every module declares its own permission rows (`MODULE.permissions.yml`); the node module auto-generates per-bundle CRUD — create / edit own / edit any / delete own / delete any (+ per-bundle revision permissions) — so the ownership Voter comes free with every content type.",
    "`Administer X` permissions are site-owning: the grid flags them with a security warning, *administer permissions* lets a role grant itself anything, and the Administrator role's `is_admin: true` bypasses permission checks entirely.",
    "Roles and their grants are **config**: `user.role.editor.yml` exports with an alphabetized permissions list and calculated dependencies (e.g. on `node.type.article`) — deployable and diffable in pull requests.",
    "User accounts are **content**: role *membership* is set per environment via the user edit form, the People page bulk action, or `drush user:role:add editor maya`, and never appears in `config/sync`.",
    "Only access logic beyond own/any needs code (`hook_ENTITY_TYPE_access()` or an entity access handler); for everything else, the Permissions page and the `user.role.*` YAML diffs *are* the security review artifact.",
  ],

  interview: [
    {
      q: "How does Drupal's role and permission system map to Symfony's security component, and where does code come back into the picture?",
      a: "Symfony's `role_hierarchy` and `access_control` become two admin screens: **People > Roles** defines roles as config entities, and the **Permissions** grid assigns fine-grained permissions per role. The semantics differ in one important way: Drupal has no hierarchy — a user's access is the flat union of their roles' permissions, and anything granted to Authenticated user is held by all logged-in users. The most common Voter case, ownership, is built in as the per-bundle 'edit own' vs 'edit any' split, where core compares the node's author uid to the current user. Code only returns for rules that can't be expressed as own/any — then you implement `hook_ENTITY_TYPE_access()` or an entity access handler, which is a small fraction of what you'd write Voters for in Symfony.",
    },
    {
      q: "Which permissions would you refuse to give a client's Editor role, and why?",
      a: "Anything in the *Administer* family — site configuration, modules, users, and especially *administer permissions*, because a role holding that can grant itself every other permission, making it root by another name. I'd also withhold *Bypass content access control* (it skips all node access checks) and the *Full HTML* text format (an XSS vector). Drupal flags these rows on the grid with 'Give to trusted roles only; this permission has security implications', which makes the audit mechanical: scan for ticks in flagged rows outside Administrator. An Editor gets the per-bundle content permissions, content overview access, and little else — and because the role exports as `user.role.editor.yml`, any later widening shows up as a diff in code review.",
    },
    {
      q: "Your release manager asks why the new Editor role appeared on production but no one has it yet. What's the explanation?",
      a: "That's the config/content split working as designed. The role — its label, weight, and full permissions list — is a config entity, so `user.role.editor.yml` was exported, committed, and imported with `drush config:import` during the deploy. User accounts, though, are content entities like nodes: they live in each environment's database and never pass through `config/sync`. So membership is a deliberate per-environment action — tick the role on the account's edit form, use the People page bulk action, or run `drush user:role:add editor maya`. That's a feature: the access *shape* is code-reviewed and identical everywhere, while *who* holds power on production isn't accidentally overwritten by a config deploy.",
    },
  ],

  quiz: [
    {
      question:
        "A permission is ticked in the 'Authenticated user' column. Maya has the Editor role. What is her access?",
      options: [
        "She lacks it — Editor overrides the Authenticated defaults",
        "She has it — every logged-in user holds the Authenticated role's permissions, and roles union flatly",
        "It depends on whether Editor inherits from Authenticated in the hierarchy",
        "Only if the Editor role has a higher weight than Authenticated",
      ],
      answerIndex: 1,
      explain:
        "There is no hierarchy and no override: access is the flat union of all a user's roles, and every logged-in user implicitly carries Authenticated user. That's why the Authenticated column should stay minimal — a tick there grants the permission site-wide to all accounts.",
    },
    {
      question:
        "After building an Editor role and assigning it to three users, you run drush config:export. What lands in config/sync?",
      options: [
        "user.role.editor.yml plus three user account files",
        "Nothing — roles and users are both content",
        "user.role.editor.yml with its permissions list; the three user accounts stay in the database",
        "Only a permissions.yml file — roles themselves are code",
      ],
      answerIndex: 2,
      explain:
        "Roles are config entities, so the role and its full permission list export as user.role.editor.yml (with dependencies like node.type.article). User accounts are content entities — they never export, which is why role assignment is a per-environment act (UI or drush user:role:add).",
    },
    {
      question:
        "Editors have 'edit own article content' but not 'edit any article content'. Can Maya edit a colleague's article, and what code made that decision?",
      options: [
        "Yes — 'own' is just a label; any article permission covers all articles",
        "No — core's node access compares the article's author uid to Maya's before granting an 'own' permission; no custom code exists",
        "No — but only because a hook_node_access() implementation must be written first",
        "Yes — unless a Voter service is registered to block it",
      ],
      answerIndex: 1,
      explain:
        "The own/any split is the built-in ownership check — the Voter you'd write in Symfony. Core grants 'edit own' only when the node's author uid matches the current user. Custom code (hook_ENTITY_TYPE_access or an access handler) is needed only for rules beyond own/any.",
    },
    {
      question:
        "Which single permission most directly lets a role escalate itself to full site control?",
      options: [
        "Access the Content overview page",
        "Administer permissions",
        "Edit any article content",
        "View published content",
      ],
      answerIndex: 1,
      explain:
        "A role with 'administer permissions' can open the grid and grant itself anything else — administer modules, administer users, and so on — making it root by another name. It's one of the rows Drupal flags with the 'security implications' warning; treat every Administer-class permission as site-owning.",
    },
  ],
};

export default lesson;

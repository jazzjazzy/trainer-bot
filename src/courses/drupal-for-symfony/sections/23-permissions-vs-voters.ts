import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "permissions-vs-voters",
  title: "Access Control: Permissions & Hooks vs Security/Voters",
  part: "Extending Drupal",
  estMinutes: 12,
  summary:
    "Symfony guards access with firewalls, roles and voters plus #[IsGranted]; Drupal replaces all of that with permission strings declared in *.permissions.yml, the _permission route requirement, and per-object access handlers and hook_ENTITY_access checks that return a cacheable AccessResult.",

  concept: `
In Symfony you think in **firewalls, roles and voters**. A firewall authenticates
the request, the user carries \`ROLE_*\` strings, and fine-grained \"can this user
edit *this* object?\" logic lives in a **Voter** you register in the container,
invoked via \`#[IsGranted]\`, \`isGranted()\`, or \`denyAccessUnlessGranted()\`.

Drupal keeps the same two-layer idea — coarse capability checks and per-object
checks — but almost none of the vocabulary carries over.

### There is no firewall

Drupal has exactly one authentication/session stack, always on; you don't
configure \`access_control\` regexes or multiple firewalls. Authorization is built
from **permission strings**, not roles. Roles still exist, but a role is just a
bundle of permissions, and — importantly — roles are **config entities** while the
user-to-role assignment is **content**. You almost never check a role in code;
you check a permission.

### Coarse checks: permissions

You declare permissions in \`MODULE.permissions.yml\`, then protect a route with the
\`_permission\` requirement (Drupal's rough analogue of \`#[IsGranted('ROLE_X')]\`):

\`\`\`yaml
# in MODULE.routing.yml
requirements:
  _permission: 'administer widgets'
\`\`\`

In imperative code you ask the account object directly:
\`\$account->hasPermission('administer widgets')\`, where \`\$account\` comes from the
\`current_user\` service (\`\\Drupal::currentUser()\`). That is the direct parallel to
\`\$this->isGranted('ROLE_X')\`.

### Per-object checks: access handlers and hooks

This is where a Symfony **Voter** maps over. Every entity type names an **access
control handler** (a class extending \`EntityAccessControlHandler\`) in its entity
annotation/attribute. You override \`checkAccess()\` for view/update/delete and
\`checkCreateAccess()\` for create — exactly the role a voter's
\`voteOnAttribute()\` plays. On top of the handler, **every** module can influence
the decision by implementing \`hook_entity_access()\` (all entity types) or the
type-specific \`hook_ENTITY_TYPE_access()\` such as \`hook_node_access()\`. Think of
these hooks as *additional voters* that every module gets to register for free.

### AccessResult, not a boolean

A voter returns \`true\`/\`false\`/\`ACCESS_ABSTAIN\`. Drupal instead returns an
\`AccessResultInterface\`: \`AccessResult::allowed()\`, \`::forbidden()\`, or
\`::neutral()\`. The combination rules matter: any **forbidden wins outright**, and
otherwise you need at least one **allowed** and no forbidden — neutral alone means
denied. This is a superset of Symfony's affirmative/veto strategies baked into the
API.

Crucially, the result also carries **cacheability metadata**. Because Drupal's
render cache stores rendered output keyed by context, an access result must
declare what it varied on: \`->cachePerPermissions()\`, \`->cachePerUser()\`, or
\`->addCacheableDependency(\$entity)\`. Forget it and users can see each other's
cached, access-checked markup. Symfony voters have no equivalent obligation — this
is the one genuinely new discipline to internalise.
`,

  comparisons: [
    {
      label: "Declaring the capability",
      intro:
        "Symfony defines roles in security.yaml (and a hierarchy); Drupal defines granular permission strings in a per-module YAML file, and roles are assembled from them in config/UI.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/security.yaml — Symfony
security:
  role_hierarchy:
    ROLE_EDITOR: [ROLE_USER]
    ROLE_ADMIN:  [ROLE_EDITOR]
  # Roles are the unit of authorization; you grant
  # ROLE_ADMIN to a user and check for it directly.`,
      ts: `# mymodule.permissions.yml — Drupal
administer widgets:
  title: 'Administer widgets'
  description: 'Create, edit and delete any widget.'
  restrict access: true   # flags it as security-sensitive in the UI

edit own widgets:
  title: 'Edit own widgets'
# Roles (config entities) bundle these strings; code checks
# the PERMISSION, almost never the role.`,
      note: "Symfony's unit is the role; Drupal's unit is the fine-grained permission. 'restrict access: true' just warns admins the permission is dangerous.",
    },
    {
      label: "Protecting a route",
      intro:
        "The coarse gate. #[IsGranted] on a controller maps to the _permission requirement on a Drupal route.",
      leftLang: "php",
      rightLang: "yaml",
      php: `// Symfony 6.4/7 controller
use Symfony\\Component\\Security\\Http\\Attribute\\IsGranted;

#[Route('/widgets', name: 'widget_admin')]
#[IsGranted('ROLE_ADMIN')]
public function admin(): Response
{
    // reached only if the token has ROLE_ADMIN
}`,
      ts: `# mymodule.routing.yml — Drupal
mymodule.widget_admin:
  path: '/widgets'
  defaults:
    _controller: '\\Drupal\\mymodule\\Controller\\WidgetController::admin'
  requirements:
    _permission: 'administer widgets'
    # 'perm a+perm b' = OR, 'perm a,perm b' = AND
    # _role and _custom_access exist too, but _permission is idiomatic.`,
      note: "Route access runs BEFORE the controller, like the #[IsGranted] attribute firing before the action. No permission check code lives in the controller body.",
    },
    {
      label: "Per-object logic: voter vs access handler/hook",
      intro:
        "\"Can this user edit THIS widget?\" In Symfony that's a Voter; in Drupal it's the entity's access handler (or a hook_ENTITY_access), returning a cacheable AccessResult instead of a bool.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony Voter
final class WidgetVoter extends Voter
{
    protected function supports(string $attr, mixed $subject): bool
    {
        return $attr === 'EDIT' && $subject instanceof Widget;
    }

    protected function voteOnAttribute(
        string $attr, mixed $subject, TokenInterface $token
    ): bool {
        $user = $token->getUser();
        return $subject->getOwner() === $user
            || in_array('ROLE_ADMIN', $token->getRoleNames());
    }
}
// checked via #[IsGranted('EDIT', subject: 'widget')]`,
      ts: `// Drupal access handler (named in the entity annotation:
//   handlers => access => Drupal\\mymodule\\WidgetAccessControlHandler)
use Drupal\\Core\\Access\\AccessResult;
use Drupal\\Core\\Entity\\EntityAccessControlHandler;
use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\Core\\Session\\AccountInterface;

class WidgetAccessControlHandler extends EntityAccessControlHandler {

  protected function checkAccess(
    EntityInterface $entity, $operation, AccountInterface $account
  ) {
    if ($operation === 'update') {
      if ($account->hasPermission('administer widgets')) {
        return AccessResult::allowed()->cachePerPermissions();
      }
      $owner = $entity->getOwnerId() === $account->id();
      return AccessResult::allowedIf(
          $owner && $account->hasPermission('edit own widgets')
        )->cachePerPermissions()->addCacheableDependency($entity);
    }
    return AccessResult::neutral();
  }
}`,
      note: "The handler IS the voter. Return AccessResult (allowed/forbidden/neutral), never a bare bool, and attach cache metadata so cached markup can't leak across users.",
    },
    {
      label: "Every module gets a vote: hook_ENTITY_access",
      intro:
        "Beyond the single handler, ANY module can add a voter for free via hook_entity_access / hook_node_access — there is no Symfony equivalent to this open extensibility.",
      leftLang: "php",
      rightLang: "php",
      php: `// Symfony: to add another opinion you must register
// another Voter service in the container.
final class LegalHoldVoter extends Voter { /* ... */ }
// services.yaml (autoconfigure tags it as security.voter)`,
      ts: `// mymodule.module — any module can veto node access.
use Drupal\\Core\\Access\\AccessResult;
use Drupal\\Core\\Entity\\EntityInterface;
use Drupal\\Core\\Session\\AccountInterface;

function mymodule_node_access(
  EntityInterface $node, $op, AccountInterface $account
) {
  if ($op === 'update' && $node->bundle() === 'locked_page') {
    // A single forbidden() overrides every allowed() elsewhere.
    return AccessResult::forbidden('Node is under legal hold.')
      ->addCacheableDependency($node);
  }
  return AccessResult::neutral();
}`,
      note: "hook_node_access is hook_ENTITY_TYPE_access for the node entity. forbidden() is a hard veto; returning neutral means 'no opinion' and lets other modules/handler decide.",
    },
  ],

  playground: {
    intro:
      "This pure-PHP snippet models Drupal's access decision: the entity access handler plus every module's hook each return an AccessResult, then Drupal combines them with the rule 'any forbidden wins; otherwise you need an allowed and no forbidden; neutral-only = denied'.",
    lang: "php",
    code: `<?php

// Model of Drupal\\Core\\Access\\AccessResult.
class AccessResult {
  public function __construct(public string $value) {}         // allowed|forbidden|neutral
  public static function allowed(): self  { return new self('allowed'); }
  public static function forbidden(): self { return new self('forbidden'); }
  public static function neutral(): self  { return new self('neutral'); }
  public static function allowedIf(bool $c): self {
    return $c ? self::allowed() : self::neutral();
  }
}

// Combine like Drupal: forbidden overrides all; else need >=1 allowed
// and no forbidden; neutral-only means denied.
function combine(array $results): string {
  $hasAllowed = false;
  foreach ($results as $r) {
    if ($r->value === 'forbidden') return 'DENIED (forbidden veto)';
    if ($r->value === 'allowed')   $hasAllowed = true;
  }
  return $hasAllowed ? 'ALLOWED' : 'DENIED (no allowed vote)';
}

// A fake account + entity.
$account = ['perms' => ['edit own widgets'], 'uid' => 7];
$widget  = ['owner' => 7, 'bundle' => 'widget'];

function hasPerm(array $a, string $p): bool { return in_array($p, $a['perms']); }

// 1) The entity access handler's checkAccess() for 'update'.
$handler = hasPerm($account, 'administer widgets')
  ? AccessResult::allowed()
  : AccessResult::allowedIf($widget['owner'] === $account['uid']
      && hasPerm($account, 'edit own widgets'));

// 2) A module's hook_node_access() — legal hold veto.
$hook = $widget['bundle'] === 'locked_page'
  ? AccessResult::forbidden()
  : AccessResult::neutral();

echo "handler: {$handler->value}\\n";
echo "hook:    {$hook->value}\\n";
echo "result:  " . combine([$handler, $hook]) . "\\n";`,
    output: `handler: allowed
hook:    neutral
result:  ALLOWED`,
  },

  keyPoints: [
    "Drupal has no firewall config: one always-on auth stack, and authorization is built from granular permission STRINGS, not ROLE_* strings.",
    "Coarse gate: declare permissions in MODULE.permissions.yml, guard routes with the _permission requirement, and check \\Drupal::currentUser()->hasPermission() in code.",
    "Per-object gate: an entity's access control handler (checkAccess / checkCreateAccess) is the direct analogue of a Symfony Voter's voteOnAttribute.",
    "hook_entity_access / hook_ENTITY_TYPE_access (e.g. hook_node_access) let EVERY module add a vote for free — no equivalent open extensibility in Symfony.",
    "Return AccessResult (allowed/forbidden/neutral), never a bool: any forbidden is a hard veto, and neutral-only means denied.",
    "Access results must carry cache metadata (cachePerPermissions / cachePerUser / addCacheableDependency) or access-checked markup can leak across users.",
  ],

  interview: [
    {
      q: "A Symfony developer asks: 'Where are Drupal's voters?' How do you answer?",
      a: "There is no single 'voter' class registered by a tag, but the *concept* is split across two mechanisms. Each entity type declares an **access control handler** extending \`EntityAccessControlHandler\`; you override \`checkAccess()\` and \`checkCreateAccess()\`, which play exactly the role of a voter's \`voteOnAttribute()\`. On top of that, any module can implement \`hook_entity_access()\` or \`hook_ENTITY_TYPE_access()\` (like \`hook_node_access()\`) to add its own opinion — effectively free, distributed voters. The big difference is the return value: Drupal returns an \`AccessResultInterface\` (\`allowed\`/\`forbidden\`/\`neutral\`) with cache metadata, not a boolean.",
    },
    {
      q: "Why do you return AccessResult objects instead of true/false, and what's the combination rule?",
      a: "Two reasons. First, combination: multiple handlers and hooks each contribute a result, and Drupal merges them with a veto rule — **any \`forbidden()\` wins outright**, otherwise you need at least one \`allowed()\` and no forbidden; a screen full of \`neutral()\` means denied. A bare bool can't express 'I abstain'. Second, **cacheability**: the render cache stores access-checked output, so each result declares what it varied on via \`cachePerPermissions()\`, \`cachePerUser()\`, or \`addCacheableDependency(\$entity)\`. Omit that metadata and one user can be served another user's cached markup — the classic Drupal access-caching bug.",
    },
    {
      q: "How do you protect a route in Drupal, and how does that compare to #[IsGranted]?",
      a: "You add a \`requirements\` key to the route in \`MODULE.routing.yml\`. The idiomatic one is \`_permission: 'administer widgets'\`, which runs before the controller — just like \`#[IsGranted('ROLE_ADMIN')]\` fires before the action. You can OR permissions with \`+\` and AND them with \`,\`. Drupal also offers \`_role\` (rarely used — prefer permissions), \`_entity_access: 'node.update'\` to defer to the entity access handler, and \`_custom_access\` pointing at a method that returns an \`AccessResult\` for arbitrary logic. The controller body stays free of access code, exactly as with the attribute.",
    },
  ],

  quiz: [
    {
      question:
        "In Drupal, what is the idiomatic unit you check for authorization in code?",
      options: [
        "A ROLE_* string, like in Symfony",
        "A granular permission string via $account->hasPermission('...')",
        "The firewall name that matched the request",
        "The user's numeric ID against an ACL table",
      ],
      answerIndex: 1,
      explain:
        "Drupal authorizes on fine-grained permission strings. Roles exist only as bundles of permissions (config entities); you almost never check a role directly — you check the permission with hasPermission().",
    },
    {
      question:
        "An entity access handler returns AccessResult::neutral() and one module's hook_entity_access() returns AccessResult::forbidden(). What is the final decision?",
      options: [
        "Allowed — neutral plus forbidden cancel out",
        "Denied — a single forbidden() is a hard veto over everything",
        "Allowed — the handler outranks any hook",
        "Undefined — Drupal throws an exception on conflicting results",
      ],
      answerIndex: 1,
      explain:
        "The combination rule is: any forbidden() wins outright. Otherwise you need at least one allowed() and no forbidden; neutral-only means denied. So the forbidden hook denies access regardless of the handler.",
    },
    {
      question:
        "Why must a Drupal AccessResult carry cache metadata (e.g. cachePerPermissions)?",
      options: [
        "To speed up the entityQuery that loads the object",
        "Because Symfony voters require it too",
        "Because access-checked output is render-cached, so the result must declare what it varied on to avoid leaking cached markup across users",
        "It is optional sugar with no functional effect",
      ],
      answerIndex: 2,
      explain:
        "Drupal caches rendered, access-checked output. If a result doesn't declare that it varied per permission/user or on a specific entity, one user can be served another user's cached, access-gated markup. Symfony voters have no such obligation.",
    },
  ],
};

export default lesson;

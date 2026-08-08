import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "permissions-and-access",
  title: "Declaring Permissions & Guarding Routes",
  part: "Module Anatomy & Scaffolding",
  estMinutes: 12,
  summary:
    "Declare flat named permissions in incident_tracker.permissions.yml, wire them into routes via requirements._permission (',' = AND, '+' = OR, _access: 'TRUE' for open pages), check them in code, and write _custom_access callbacks that return cacheable AccessResults.",

  concept: `
In Symfony, access control is role-shaped: you invent \`ROLE_*\` strings, arrange
them in \`role_hierarchy\`, gate URL patterns in \`security.yaml\`'s
\`access_control\`, drop \`#[IsGranted]\` on actions, and reach for a voter when
the rule needs logic. Drupal flattens all of that into one primitive: the
**permission** — a plain named string your module declares, a site builder grants
to roles in the UI, and code checks by name. Your module never asks "is this user
an editor?" — it asks "can this account \`view incident reports\`?". This works
identically in Drupal 10 and 11.

### Declaring: incident_tracker.permissions.yml

\`\`\`yaml
view incident reports:
  title: 'View incident reports'
  description: 'See the incident list and individual incident detail pages.'

administer incident tracker:
  title: 'Administer the incident tracker'
  description: 'Configure retention and manage severity levels.'
  restrict access: true
\`\`\`

The YAML key **is** the machine name (lowercase, verb-first by convention).
\`title\` shows up on \`/admin/people/permissions\` after a \`drush cr\`;
\`restrict access: true\` prints a *"Warning: Give to trusted roles only"* flag
beside it — it doesn't change runtime behavior, it marks the permission as
security-sensitive so site builders grant it carefully.

### Guarding routes

Access rides on the route in \`incident_tracker.routing.yml\` under
\`requirements\`:

- \`_permission: 'view incident reports'\` — must hold the permission.
- Comma = **AND**: \`'view incident reports,administer incident tracker'\`.
- Plus = **OR**: \`'view incident reports+administer incident tracker'\`
  (don't mix \`,\` and \`+\` in one string).
- \`_access: 'TRUE'\` — explicitly open. Drupal denies by default: a route with
  *no* access requirement isn't public, it's a broken route. Opting out is
  always explicit.

### Checking in code

Inside a \`ControllerBase\` subclass, \`$this->currentUser()\` returns the
account proxy — \`hasPermission('administer incident tracker')\` answers the flat
question. Whenever rendered output varies by permission, also add the
\`user.permissions\` **cache context**, or one role's page gets served to
another from the render cache.

### Dynamic permissions

If the permission list depends on data — the way node module generates
"edit own article content" per bundle — add a callback:

\`\`\`yaml
permission_callbacks:
  - \\Drupal\\incident_tracker\\IncidentPermissions::permissions
\`\`\`

The method returns an array of permission definitions (same keys as the YAML)
built at runtime — one \`escalate SEVERITY incidents\` permission per configured
severity, for example.

### Logic-based access: _custom_access

When a static string isn't enough — Drupal's answer to a voter — point the route
at a method:
\`_custom_access: '\\Drupal\\incident_tracker\\Controller\\WallboardController::access'\`.
It receives the \`AccountInterface\` (plus route parameters by name) and returns
an \`AccessResult\`: \`allowed()\`, \`neutral()\`, or \`forbidden()\` — **with
cacheability**. \`allowedIfHasPermission()\` attaches the \`user.permissions\`
context for you; add \`addCacheableDependency($config)\` when the verdict reads
config. Forget that metadata and your access verdict gets cached for the wrong
users.

### Grants deploy as config

Role grants aren't code — each role is a \`user.role.*\` config entity whose
\`permissions:\` list you export with \`drush config:export\` and commit, the way
you'd commit \`security.yaml\`. Script grants with
\`drush role:perm:add responder 'view incident reports'\`.
`,

  comparisons: [
    {
      label: "Declaring named permissions",
      intro:
        "Naming the access concepts your feature needs. Symfony invents ROLE_ strings and maps them to URL patterns in security.yaml; a Drupal module declares permissions in its permissions.yml, and which roles hold them is decided later in the UI.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony — config/packages/security.yaml
# Roles are invented here and wired to URLs in the same file,
# deployed as part of the codebase.
security:
  role_hierarchy:
    ROLE_INCIDENT_ADMIN: [ROLE_INCIDENT_VIEWER]

  access_control:
    - { path: ^/incidents/settings, roles: ROLE_INCIDENT_ADMIN }
    - { path: ^/incidents, roles: ROLE_INCIDENT_VIEWER }`,
      ts: `# Drupal — incident_tracker.permissions.yml
# The YAML key IS the permission machine name. Which roles get it
# is granted at /admin/people/permissions, not here.
view incident reports:
  title: 'View incident reports'
  description: 'See the incident list and individual incident detail pages.'

administer incident tracker:
  title: 'Administer the incident tracker'
  description: 'Configure retention and manage severity levels.'
  restrict access: true

# Dynamic permissions built at runtime (per severity, per bundle...):
permission_callbacks:
  - \\Drupal\\incident_tracker\\IncidentPermissions::permissions`,
      note:
        "restrict access: true shows a 'Give to trusted roles only' warning on the permissions page — a flag for security-sensitive permissions, not a runtime behavior change.",
    },
    {
      label: "Guarding routes",
      intro:
        "Requiring a permission to reach a page. Symfony stacks #[IsGranted] on the action; Drupal puts the check in the route's requirements — and a Drupal route with no access requirement at all is broken, not public.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php
// Symfony — the guard rides on the action
namespace App\\Controller;

use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\Routing\\Attribute\\Route;
use Symfony\\Component\\Security\\Http\\Attribute\\IsGranted;

final class IncidentController
{
    #[Route('/incidents', name: 'incident_list')]
    #[IsGranted('ROLE_INCIDENT_VIEWER')]
    public function list(): Response { /* ... */ }

    // Deliberately outside the guarded prefix: access_control paths are
    // regexes, so ^/incidents would also swallow '/incidents/status'.
    #[Route('/status', name: 'incident_status')]
    public function status(): Response
    {
        // Public: no access_control rule matches /status.
        return new Response('OK');
    }
}`,
      ts: `# Drupal — incident_tracker.routing.yml
incident_tracker.list:
  path: '/incidents'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentController::list'
    _title: 'Incidents'
  requirements:
    _permission: 'view incident reports'

incident_tracker.export:
  path: '/incidents/export'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentController::export'
  requirements:
    # comma = AND (must hold both); '+' would mean OR
    _permission: 'view incident reports,administer incident tracker'

# Nesting under /incidents changes nothing: Drupal routes never inherit
# access from a path prefix, so this one is judged on its own requirements.
incident_tracker.status:
  path: '/incidents/status'
  defaults:
    _controller: '\\Drupal\\incident_tracker\\Controller\\IncidentController::status'
  requirements:
    _access: 'TRUE'  # explicitly open — omitting requirements = broken route`,
      note:
        "In _permission, ',' ANDs permissions and '+' ORs them (never mix both in one string). _access: 'TRUE' is the only way to make a route public — deny-by-default means opting out is explicit.",
    },
    {
      label: "Checking access in code",
      intro:
        "Varying page output by what the viewer may do. The route check already ran — these in-code checks tailor the response, and in Drupal that obliges you to declare a cache context.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — AbstractController helpers
public function list(): Response
{
    $this->denyAccessUnlessGranted('ROLE_INCIDENT_VIEWER');

    return $this->render('incident/list.html.twig', [
        'show_purge' => $this->isGranted('ROLE_INCIDENT_ADMIN'),
    ]);
}`,
      ts: `<?php
// Drupal — in IncidentController extends ControllerBase
public function list(): array {
  $build['table'] = $this->buildIncidentTable();

  // Only admins see the purge link.
  if ($this->currentUser()->hasPermission('administer incident tracker')) {
    $build['purge'] = [
      '#type' => 'link',
      '#title' => $this->t('Purge resolved incidents'),
      '#url' => Url::fromRoute('incident_tracker.purge'),
    ];
  }

  // Output varies by permission — declare it, or the render
  // cache serves the admin version to everyone.
  $build['#cache']['contexts'][] = 'user.permissions';
  return $build;
}`,
      note:
        "$this->currentUser() (an AccountProxyInterface) is the Drupal counterpart of Security/isGranted(). The extra discipline: any permission-dependent output needs the user.permissions cache context.",
    },
    {
      label: "Logic-based access: voter vs _custom_access",
      intro:
        "A rule too smart for a flat string: the incident wallboard is open when kiosk mode is enabled in config, otherwise viewers only. Symfony writes a voter; Drupal points the route at a method returning an AccessResult.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony — a Voter answers the custom attribute
namespace App\\Security;

use Symfony\\Component\\Security\\Core\\Authentication\\Token\\TokenInterface;
use Symfony\\Component\\Security\\Core\\Authorization\\Voter\\Voter;

final class WallboardVoter extends Voter
{
    public function __construct(private bool $kioskMode) {}

    protected function supports(string $attribute, mixed $subject): bool
    {
        return $attribute === 'WALLBOARD_VIEW';
    }

    protected function voteOnAttribute(
        string $attribute,
        mixed $subject,
        TokenInterface $token,
    ): bool {
        return $this->kioskMode
            || in_array('ROLE_INCIDENT_VIEWER', $token->getRoleNames(), true);
    }
}`,
      ts: `<?php
// Drupal — routing.yml points at this method:
//   requirements:
//     _custom_access: '\\Drupal\\incident_tracker\\Controller\\WallboardController::access'
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Access\\AccessResult;
use Drupal\\Core\\Access\\AccessResultInterface;
use Drupal\\Core\\Controller\\ControllerBase;
use Drupal\\Core\\Session\\AccountInterface;

final class WallboardController extends ControllerBase {

  public function access(AccountInterface $account): AccessResultInterface {
    $config = $this->config('incident_tracker.settings');

    // allowedIf(TRUE) => allowed; allowedIf(FALSE) => neutral,
    // so the orIf() branch can still grant access.
    return AccessResult::allowedIf((bool) $config->get('kiosk_mode'))
      ->addCacheableDependency($config)
      ->orIf(AccessResult::allowedIfHasPermission($account, 'view incident reports'));
  }

}`,
      note:
        "AccessResult is a verdict PLUS cache metadata: allowedIfHasPermission() attaches the user.permissions context automatically, and addCacheableDependency($config) invalidates the verdict when settings are saved.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A pure-PHP model of Drupal's permission layer: roles hold flat permission strings (as user.role.* config would), and the requirement parser applies core's _permission rules — comma means AND, plus means OR. Predict which routes 403 for each account before running.",
    code: `<?php
declare(strict_types=1);

// Mini model of Drupal's access layer. Permissions are flat strings that
// roles hold (user.role.* config); accounts just carry roles. Route access
// is a requirement string: ',' means AND, '+' means OR (core's _permission).

$rolePermissions = [
  'responder' => ['view incident reports'],
  'manager'   => ['view incident reports', 'administer incident tracker'],
];

function hasPermission(array $account, string $permission, array $rolePermissions): bool {
  foreach ($account['roles'] as $role) {
    if (in_array($permission, $rolePermissions[$role] ?? [], true)) {
      return true;
    }
  }
  return false;
}

function checkRequirement(string $requirement, array $account, array $rolePermissions): bool {
  if (str_contains($requirement, '+')) {          // '+' = ANY may match (OR)
    foreach (explode('+', $requirement) as $perm) {
      if (hasPermission($account, $perm, $rolePermissions)) {
        return true;
      }
    }
    return false;
  }
  foreach (explode(',', $requirement) as $perm) { // ',' = ALL must match (AND)
    if (!hasPermission($account, $perm, $rolePermissions)) {
      return false;
    }
  }
  return true;
}

// Parsed view of incident_tracker.routing.yml requirements.
$routes = [
  '/incidents'                            => 'view incident reports',
  '/admin/config/system/incident-tracker' => 'administer incident tracker',
  '/incidents/export'                     => 'view incident reports,administer incident tracker',
  '/incidents/wallboard'                  => 'view incident reports+administer incident tracker',
];

$accounts = [
  'responder' => ['roles' => ['responder']],
  'manager'   => ['roles' => ['responder', 'manager']],
];

$lines = [];
foreach ($accounts as $name => $account) {
  $lines[] = strtoupper($name);
  foreach ($routes as $path => $requirement) {
    $verdict = checkRequirement($requirement, $account, $rolePermissions) ? 'allowed' : '403';
    $lines[] = sprintf('  %-38s %s', $path, $verdict);
  }
}
echo implode("\\n", $lines);`,
    output: `RESPONDER
  /incidents                             allowed
  /admin/config/system/incident-tracker  403
  /incidents/export                      403
  /incidents/wallboard                   allowed
MANAGER
  /incidents                             allowed
  /admin/config/system/incident-tracker  allowed
  /incidents/export                      allowed
  /incidents/wallboard                   allowed`,
  },

  keyPoints: [
    "Permissions are flat named strings declared in `incident_tracker.permissions.yml` — YAML key = machine name, with `title`, optional `description`, and `restrict access: true` to flag security-sensitive ones.",
    "Routes opt in via `requirements._permission`; `,` ANDs permissions, `+` ORs them (never mixed), and open routes must say `_access: 'TRUE'` because Drupal denies by default.",
    "Check in code with `$this->currentUser()->hasPermission(...)` — and add the `user.permissions` cache context whenever output varies by permission.",
    "`permission_callbacks` in permissions.yml points at a method that builds permission definitions at runtime — how node generates per-bundle permissions.",
    "`_custom_access` is Drupal's voter: a method receiving the account (and route parameters) that returns an `AccessResult` carrying cache metadata, not a bare bool.",
    "Role grants are `user.role.*` config entities — export with `drush config:export` (or script with `drush role:perm:add`) so grants deploy with the code like security.yaml would.",
  ],

  interview: [
    {
      q: "Coming from Symfony's roles and voters, how does Drupal's permission system differ?",
      a: "Drupal inverts the ownership: a module declares flat permission strings in `MODULE.permissions.yml`, and *site builders* decide which roles hold them at `/admin/people/permissions` — code never checks roles, only `hasPermission('view incident reports')`. There's no `role_hierarchy` or firewall; the route itself carries the check via `requirements._permission`, with `,` for AND and `+` for OR. The closest voter analogue is `_custom_access`, a callback returning an `AccessResult`. The grants themselves are `user.role.*` config entities, so they're exported and deployed like any other config rather than living in `security.yaml`.",
    },
    {
      q: "What does a _custom_access callback return, and why is that more than a boolean?",
      a: "It returns an `AccessResultInterface` — `allowed()`, `neutral()`, or `forbidden()` — and the three-state distinction matters because results combine: `allowedIf(FALSE)` is *neutral*, so an `orIf()` chain can still grant access, while `forbidden()` vetoes outright. Just as important, an AccessResult carries cacheability: `allowedIfHasPermission()` adds the `user.permissions` cache context automatically, and you attach `addCacheableDependency($config)` when the verdict reads config. Skip that metadata and Drupal may cache one user's access verdict and serve it to another — a classic production bug that a plain bool can't even express.",
    },
    {
      q: "How do you make a Drupal route public, and what happens if you just omit the requirements?",
      a: "You must state it explicitly with `_access: 'TRUE'` under `requirements`. Drupal is deny-by-default: a route with no access requirement at all isn't public like an unmatched Symfony `access_control` path — it's a broken route that won't grant access to anyone. That design forces every endpoint to document its access story in the routing file. It's a favorite interview probe because Symfony developers assume 'no rule = open'.",
    },
    {
      q: "When would you use permission_callbacks instead of static entries in permissions.yml?",
      a: "When the set of permissions depends on data or config rather than being fixed at code-time — the canonical example is node module generating 'edit own article content' for every content type. You add a `permission_callbacks` entry pointing at a `Class::method` that returns permission definition arrays (same keys as the YAML: title, description) built at runtime. For incident_tracker, that's one `escalate SEVERITY incidents` permission per configured severity level. It's the same declaration format, just produced by PHP instead of parsed from YAML.",
    },
  ],

  quiz: [
    {
      question:
        "A route declares _permission: 'view incident reports,administer incident tracker'. Who gets in?",
      options: [
        "Anyone holding at least one of the two permissions",
        "Only accounts holding BOTH permissions",
        "Nobody — multiple permissions need multiple requirement lines",
        "Only the administrator role, which always bypasses checks",
      ],
      answerIndex: 1,
      explain:
        "In _permission, a comma means AND — every listed permission is required. '+' is the OR separator ('a+b' = either grants access), and the two must not be mixed in one string. (User 1 and roles flagged is_admin do bypass permission checks, but that's not what the requirement expresses.)",
    },
    {
      question:
        "What does 'restrict access: true' in incident_tracker.permissions.yml actually do?",
      options: [
        "Hides the permission from the permissions UI entirely",
        "Denies the permission to all roles until an update hook grants it",
        "Shows a 'give to trusted roles only' security warning next to it in the UI",
        "Restricts the permission to the administrator role",
      ],
      answerIndex: 2,
      explain:
        "restrict access: true is a flag for security-sensitive permissions: the permissions page renders a warning telling site builders to grant it only to trusted roles. Runtime checking is unchanged — it's documentation enforced by the UI, not an access rule.",
    },
    {
      question:
        "Your controller shows an extra 'Purge' link only to users with 'administer incident tracker'. What must the render array include?",
      options: [
        "Nothing extra — hasPermission() handles it",
        "The 'user.permissions' cache context",
        "'#cache' => ['max-age' => 0] to disable caching entirely",
        "A second route with _custom_access",
      ],
      answerIndex: 1,
      explain:
        "Output that varies by permission must declare the user.permissions cache context so the render cache keeps one variant per permission set. Without it, whichever variant renders first gets cached and served to everyone; max-age 0 would 'work' but throws away caching instead of varying it.",
    },
    {
      question:
        "How do the actual role-to-permission grants travel from your local site to production?",
      options: [
        "They're code — permissions.yml already assigns them to roles",
        "They don't; grants must be re-clicked in the production UI",
        "As user.role.* config entities exported with drush config:export",
        "Via an entry in settings.php",
      ],
      answerIndex: 2,
      explain:
        "permissions.yml only declares permissions; which roles hold them lives on each role's config entity (user.role.responder etc.). Export those with the rest of your config and the grants deploy with the code — the Drupal equivalent of committing security.yaml.",
    },
  ],
};

export default lesson;

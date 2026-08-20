import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "sso-apis-and-integrations",
  title: "SSO and APIs: Identity You Do Not Own",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "How a SAML assertion from an agency identity provider becomes a Drupal account and roles, how OAuth scopes gate machine access, and why every one of those modules is vendored, off and out of your reach on GovCMS.",
  concept: `## The identity provider is somebody else's system

On a Drupal site you control, "add SSO" is a decision you make: pick an IdP, require a module, enable it. On GovCMS the agency already has an identity provider — an Entra ID tenant, an Okta org, a departmental SAML federation — and your Drupal site is only ever the service provider. You do not choose the IdP, you do not own the attribute names it emits, and you cannot change either by patching Drupal.

That is why authentication sits on the platform's short list of things to raise before you start:

> If your website uses authentication, collects personal information or payments, talk to us early.

### What is actually in the box

The 4.x distribution pins the whole integration surface as hard requirements in its \`composer.json\`:

- \`drupal/simplesamlphp_auth\` 4.1.0 **and** \`simplesamlphp/simplesamlphp\` 2.5.2 — the Drupal glue and the SP library itself
- \`drupal/externalauth\` 2.0.12 — the authmap
- \`drupal/simple_oauth\` 6.1.1 with \`drupal/consumers\` 1.24.0
- \`drupal/jsonapi_extras\` 3.28.0, sitting on top of core \`jsonapi\`

None of them appear in the profile's \`install:\` list, and none of them appear in the 73-name \`managed_modules\` allowlist in scaffold-tooling's \`security.settings.php\`. Present, off, and not self-serve. (\`jsonapi_extras\` is new in the 4.x line — it is absent from the \`3.x-develop\` composer.json, which pins Drupal 10.)

### Assertion to account

\`simplesamlphp_auth\` never keys on the email address. \`externalauth\` stores an **authname** against the provider string \`simplesamlphp_auth\` and maps that pair to a uid. Which assertion attribute becomes the authname is the \`unique_id\` setting, defaulting to \`eduPersonPrincipalName\`; \`user_name\` and \`mail_attr\` are separate settings; \`register_users\` decides whether an unknown authname provisions an account or is turned away.

Group-to-role mapping is one config string, \`role.population\`:

\`\`\`text
role_id:key,op,value;key,op,value|role_id:key,op,value
\`\`\`

Three operators: \`=\` matches an exact value of the attribute, \`@=\` compares the part after the \`@\` in the first value, \`~=\` matches a substring of any value. Rules joined by \`;\` are OR-ed into the same role; rules joined by \`|\` start a new role. Because each rule is comma-delimited, a value cannot itself contain a comma — you cannot match a full LDAP DN, only a fragment of one via \`~=\`.

### Machine access and the public surface

\`simple_oauth\` 6.x models scopes as \`simple_oauth.oauth2_scope.*\` config entities whose \`granularity_id\` is \`permission\` or \`role\`. A scope is a named bundle of Drupal permissions, not a free-form label — so an OAuth conversation is really a permissions conversation, and the validator's nine-permission denylist still applies to whatever role you point a scope at. Its \`public_key\` and \`private_key\` settings are filesystem **paths** carried in exported config, which is exactly the sort of detail that stalls a SaaS design: the entire SaaS image body is \`themes/\`, \`config\` and \`favicon.ico\`.

Core \`jsonapi\` ships \`read_only: true\`. \`jsonapi_extras\` adds \`path_prefix\`, \`default_disabled\` (deny-by-default) and per-resource configs that rename the route, rename each public field and disable the rest. All of it is config, so it rides \`config/default\` like everything else — but only lands once the platform has enabled the modules for you.`,
  comparisons: [
    {
      label: "Turning SSO on",
      intro:
        "The agency has an IdP and wants staff logging in with departmental credentials. On your own site that is a composer require away; on GovCMS the code is already installed and still unavailable.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# A Drupal site you control: pick the integration, require it, enable it.
composer require drupal/simplesamlphp_auth:^4.1
vendor/bin/drush en -y simplesamlphp_auth

# Point the SP at the auth source you configured in simplesamlphp itself.
vendor/bin/drush config:set simplesamlphp_auth.settings activate 1 -y
vendor/bin/drush config:set simplesamlphp_auth.settings auth_source agency-sp -y
vendor/bin/drush config:set simplesamlphp_auth.settings register_users 1 -y
vendor/bin/drush cex -y

# You also own the SP metadata, the certificate rotation and the
# simplesamlphp config directory on disk.
ls -l /var/simplesamlphp/config/authsources.php
ls -l /var/simplesamlphp/cert/sp.crt`,
      ts: `# GovCMS 4.x: nothing to require. The distribution already pins all of it.
composer show drupal/simplesamlphp_auth      # 4.1.0
composer show simplesamlphp/simplesamlphp    # 2.5.2  -- the SP library itself
composer show drupal/externalauth            # 2.0.12

# It is not in the profile's install list, so it is not enabled.
grep -c simplesamlphp web/profiles/contrib/govcms/govcms.info.yml

# And it is not on the module allowlist, so the module UI will not offer it.
grep -c "'simplesamlphp_auth'" \\
  vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php

# Both print 0. 'administer modules' is also on the module_permissions
# permission denylist, so no delegated role can reach the page anyway.
ahoy drush role:list --format=json | grep -c 'administer modules'

# The first step is therefore a conversation, not a command:
#   "If your website uses authentication, collects personal information
#    or payments, talk to us early."`,
      note: "The code being vendored is not the same as the feature being available: simplesamlphp_auth 4.1.0 and the SP library ship in the image, but the module is absent from both the profile install list and the 73-name managed_modules allowlist.",
    },
    {
      label: "Mapping IdP groups to Drupal roles",
      intro:
        "The IdP emits a memberOf attribute full of LDAP DNs and you need those to become Drupal roles. On a site you own you write the mapping in PHP; on GovCMS it has to be expressible as configuration.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php

/**
 * @file
 * web/modules/custom/agency_sso/agency_sso.module
 */

/**
 * Implements hook_simplesamlphp_auth_user_roles_alter().
 *
 * Arbitrary PHP: full DNs, negative rules, an entitlement service call.
 */
function agency_sso_simplesamlphp_auth_user_roles_alter(array &$roles, array $attributes) {
  $groups = $attributes['memberOf'] ?? [];

  foreach ($groups as $group) {
    // Commas in a DN are no obstacle here.
    if ($group === 'CN=Web-Authors,OU=Groups,DC=agency,DC=gov,DC=au') {
      $roles['content_author'] = 'content_author';
    }
    if (str_contains($group, 'Web-Approvers')) {
      $roles['approver'] = 'approver';
    }
    // A rule you simply cannot express in configuration: a denial.
    if ($group === 'CN=Contractors,OU=Groups,DC=agency,DC=gov,DC=au') {
      unset($roles['approver']);
    }
  }

  $mail = $attributes['mail'][0] ?? '';
  if (str_ends_with($mail, '@agency.gov.au')) {
    $roles['staff'] = 'staff';
  }
}`,
      ts: `# config/default/simplesamlphp_auth.settings.yml
#
# No custom module is possible, so the entire mapping is one string:
#   role_id:key,op,value;key,op,value|role_id:key,op,value
# Each rule is comma-delimited, so a value may not contain a comma --
# a full DN is unmatchable and you fall back to '~=' on a fragment.
activate: true
auth_source: agency-sp
unique_id: eduPersonPrincipalName
user_name: eduPersonPrincipalName
mail_attr: mail
register_users: true
login_link_show: true
login_link_display_name: 'Log in with your agency account'
role:
  population: 'content_author:memberOf,~=,Web-Authors|approver:memberOf,~=,Web-Approvers|staff:mail,@=,agency.gov.au'
  eval_every_time: true
allow:
  set_drupal_pwd: false
  default_login: true
  default_login_roles: {  }
  default_login_users: '1'
sync:
  mail: true
  user_name: true
autoenablesaml: false
debug: false`,
      note: "No operator in role.population subtracts a role, so the contractor exclusion on the left has to move into the IdP's group membership instead. But eval_every_time: true is not just \"re-run the map\": roleMatchSync() reconciles the whole account on every login, removing every non-locked role the map did not produce — including roles an administrator granted by hand in Drupal.",
    },
    {
      label: "OAuth for machine access",
      intro:
        "A downstream search indexer needs a token to read content over the API. The key material is where this gets awkward on a platform whose image you do not build.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# A site you own: keys live wherever you decide, outside the web root.
composer require drupal/simple_oauth:^6.1
vendor/bin/drush en -y simple_oauth consumers

mkdir -p /var/secrets/oauth
openssl genrsa -out /var/secrets/oauth/private.key 2048
openssl rsa -in /var/secrets/oauth/private.key -pubout \\
  -out /var/secrets/oauth/public.key
chmod 600 /var/secrets/oauth/private.key

vendor/bin/drush config:set simple_oauth.settings private_key \\
  /var/secrets/oauth/private.key -y
vendor/bin/drush config:set simple_oauth.settings public_key \\
  /var/secrets/oauth/public.key -y
vendor/bin/drush config:set simple_oauth.settings scope_provider dynamic -y
vendor/bin/drush cex -y

# Then a consumer, and scopes as oauth2_scope config entities.
vendor/bin/drush php:eval "echo 'create consumer via /admin/config/services/consumer/add';"`,
      ts: `# GovCMS: simple_oauth 6.1.1 and consumers 1.24.0 are already vendored.
composer show drupal/simple_oauth   # 6.1.1
composer show drupal/consumers      # 1.24.0

# Not enabled, and not on the allowlist -- the same two checks as SSO.
ahoy drush pm:list --status=enabled --filter=simple_oauth --format=list
grep -c "'simple_oauth'" \\
  vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php

# The design problem to raise early is where the key pair lives.
# simple_oauth.settings stores PATHS, and they get exported into config:
#   public_key:  <path>
#   private_key: <path>
# The whole SaaS image body is three COPY lines:
#   COPY themes/ /app/web/themes/custom
#   COPY config /app/config
#   COPY favicon.ico /app/web
# so /var/secrets is never created by anything you push.

# The only persistent writable tree is the Lagoon volume:
ahoy drush status --field=files
ahoy drush status --field=private
ahoy drush php:eval "echo \\Drupal\\Core\\Site\\Settings::get('file_private_path');"

# Bring the key-storage question to the platform team before you design
# a token flow around it. Do not assume you can drop a file next to config.`,
      note: "A scope in simple_oauth 6.x is an oauth2_scope config entity with granularity_id of permission or role — so scoping an API client is really assigning Drupal permissions, and the validator's nine-permission denylist plus the is_admin check still apply to whatever role a scope points at.",
    },
    {
      label: "Shaping a public JSON:API surface",
      intro:
        "You want a small, stable, read-only feed of publications for another agency's site — not the whole entity graph. Same modules, very different defaults.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# A site you control. config/sync/core.extension.yml (excerpt):
module:
  jsonapi: 0
  serialization: 0
  basic_auth: 0

---
# config/sync/jsonapi.settings.yml
# Flip core's default so the same endpoint takes writes too.
read_only: false
maintenance_header_retry_seconds:
  min: 5
  max: 10

---
# config/sync/user.role.api_client.yml
# A role you invented, with exactly the permissions the client needs.
id: api_client
label: 'API client'
is_admin: false
permissions:
  - 'access content'
  - 'create publication content'
  - 'edit any publication content'`,
      ts: `# GovCMS. Both modules are in the codebase already -- jsonapi is core
# and jsonapi_extras 3.28.0 is a hard require of the distribution -- but
# neither is in the profile's install list nor on the 73-name
# managed_modules allowlist, so no delegated role can switch them on from
# the module UI. Getting them enabled is a platform conversation.

---
# config/default/jsonapi.settings.yml
# Leave core's default alone. Read-only is the posture you want to defend.
read_only: true
maintenance_header_retry_seconds:
  min: 5
  max: 10

---
# config/default/jsonapi_extras.settings.yml
# default_disabled flips the surface to deny-by-default: nothing is
# exposed unless a resource config turns it on.
path_prefix: api/v1
include_count: false
default_disabled: true
validate_configuration_integrity: true

---
# config/default/jsonapi_extras.jsonapi_resource_config.node--publication.yml
id: node--publication
disabled: false
path: publications
resourceType: publication
resourceFields:
  field_publication_date:
    fieldName: field_publication_date
    publicName: publishedOn
    enhancer: {  }
    disabled: false
  body:
    fieldName: body
    publicName: body
    enhancer: {  }
    disabled: true`,
      note: "jsonapi_extras 3.28.0 is bundled in 4.x and absent from the 3.x line, so a GovCMS 3.x / Drupal 10 site has no path_prefix or default_disabled to reach for. On either line this config only does anything once the platform has enabled the modules for you.",
    },
  ],
  playground: {
    intro:
      "A two-stage resolver: an assertion turned into an account and roles, then a token's scopes measured against four requests. Both stages are pure rule evaluation over literal arrays — read the rules, then predict the table.",
    lang: "php",
    code: `<?php

// Stage 1: a SAML assertion resolved to a Drupal account. Stage 2: an OAuth
// token's scopes evaluated against a jsonapi_extras-shaped API surface.

function eval_rule(array $attrs, $part) {
  $bits = explode(',', $part);
  if (count($bits) !== 3 || !array_key_exists($bits[0], $attrs)) {
    return FALSE;
  }
  list($key, $op, $value) = $bits;
  $attribute = $attrs[$key];
  if ($op === '=') {
    return in_array($value, $attribute, TRUE);
  }
  if ($op === '@=') {
    $halves = explode('@', $attribute[0]);
    return count($halves) === 2 && $halves[1] === $value;
  }
  foreach ($attribute as $item) {
    if ($op === '~=' && strpos($item, $value) !== FALSE) {
      return TRUE;
    }
  }
  return FALSE;
}

function matching_roles($rolemap, array $attrs) {
  $roles = ['authenticated' => 'authenticated'];
  foreach (explode('|', $rolemap) as $rule) {
    list($role_id, $evals) = explode(':', $rule, 2);
    foreach (explode(';', $evals) as $part) {
      if (eval_rule($attrs, $part)) {
        $roles[$role_id] = $role_id;
      }
    }
  }
  return array_values($roles);
}

// role.population: one comma-delimited string, so no DN can be a value.
$rolemap = 'content_author:memberOf,~=,Web-Authors;memberOf,=,CN=Editors'
  . '|approver:memberOf,~=,Web-Approvers'
  . '|staff:mail,@=,agency.gov.au';
// externalauth keys on authname + provider, never on the email address.
$authmap = ['jo.smith@agency.gov.au' => ['uid' => 42, 'name' => 'jo.smith']];
$next_uid = 77;

echo "== Stage 1: SAML assertion -> Drupal account\\n";
printf("%-24s %-12s %-4s %-24s %s\\n", 'AUTHNAME', 'ACTION', 'UID', 'USERNAME', 'ROLES');
foreach ([
  ['eduPersonPrincipalName' => ['jo.smith@agency.gov.au'], 'mail' => ['jo.smith@agency.gov.au'], 'memberOf' => ['CN=Web-Authors', 'CN=All-Staff']],
  ['eduPersonPrincipalName' => ['ravi.n@agency.gov.au'], 'mail' => ['ravi.n@contractor.example'], 'memberOf' => ['CN=Web-Approvers', 'CN=Editors']],
] as $attrs) {
  $authname = $attrs['eduPersonPrincipalName'][0];
  $action = 'linked';
  if (!isset($authmap[$authname])) {
    $action = 'provisioned';
    $authmap[$authname] = ['uid' => $next_uid, 'name' => $authname];
    $next_uid = $next_uid + 1;
  }
  $row = $authmap[$authname];
  printf("%-24s %-12s %-4d %-24s %s\\n", $authname, $action, $row['uid'], $row['name'], implode(', ', matching_roles($rolemap, $attrs)));
}

$scopes = ['content:read', 'media:read'];
printf("\\n== Stage 2: token agency-search-indexer, scopes [%s]\\n", implode(' ', $scopes));
printf("%-6s %-22s %-14s %s\\n", 'METHOD', 'PATH', 'NEEDS', 'RESULT');
foreach ([
  ['GET', '/api/v1/publications', 'content:read'],
  ['POST', '/api/v1/publications', 'content:write'],
  ['GET', '/api/v1/users', 'user:read'],
  ['GET', '/api/v1/media', 'media:read'],
] as $req) {
  list($method, $path, $need) = $req;
  printf("%-6s %-22s %-14s %s\\n", $method, $path, $need, in_array($need, $scopes, TRUE) ? 'ALLOW' : 'DENY');
}

echo "\\n== jsonapi_extras shaping on the collection that token may read\\n";
printf("%-13s %s\\n", 'core route', '/jsonapi/node/publication');
printf("%-13s %s\\n", 'extras route', '/api/v1/publications');
foreach ([['field_publication_date', 'publishedOn', FALSE], ['body', 'body', TRUE]] as $f) {
  printf("%-13s %-24s -> %s\\n", 'field', $f[0], $f[2] ? 'disabled' : $f[1]);
}`,
    output: `== Stage 1: SAML assertion -> Drupal account
AUTHNAME                 ACTION       UID  USERNAME                 ROLES
jo.smith@agency.gov.au   linked       42   jo.smith                 authenticated, content_author, staff
ravi.n@agency.gov.au     provisioned  77   ravi.n@agency.gov.au     authenticated, content_author, approver

== Stage 2: token agency-search-indexer, scopes [content:read media:read]
METHOD PATH                   NEEDS          RESULT
GET    /api/v1/publications   content:read   ALLOW
POST   /api/v1/publications   content:write  DENY
GET    /api/v1/users          user:read      DENY
GET    /api/v1/media          media:read     ALLOW

== jsonapi_extras shaping on the collection that token may read
core route    /jsonapi/node/publication
extras route  /api/v1/publications
field         field_publication_date   -> publishedOn
field         body                     -> disabled
`,
  },
  keyPoints: [
    "On GovCMS the identity provider belongs to the agency and Drupal is only ever the service provider; authentication is one of the three triggers behind \"If your website uses authentication, collects personal information or payments, talk to us early.\"",
    "The 4.x distribution requires simplesamlphp_auth 4.1.0, simplesamlphp/simplesamlphp 2.5.2, externalauth 2.0.12, simple_oauth 6.1.1, consumers 1.24.0 and jsonapi_extras 3.28.0 — none in the profile's install list, none on the 73-name managed_modules allowlist.",
    "externalauth keys an account on an authname plus the provider string simplesamlphp_auth, not on the email; unique_id (default eduPersonPrincipalName) chooses the authname and register_users decides whether an unknown one provisions an account.",
    "role.population is a single comma-delimited string with three operators — = for an exact attribute value, @= for the part after the @ in the first value, ~= for a substring — and no operator subtracts a role; removal comes from eval_every_time: true instead, which has roleMatchSync() strip every non-locked role the map did not produce, manual grants included.",
    "simple_oauth 6.x scopes are oauth2_scope config entities with granularity_id of permission or role, and public_key/private_key are filesystem paths carried in exported config — raise key storage before designing the token flow.",
    "Core jsonapi ships read_only: true; jsonapi_extras adds path_prefix, default_disabled and per-resource path and field renames, and is new in the 4.x line — the 3.x-develop composer.json does not pin it at all.",
  ],
  interview: [
    {
      q: "An agency wants staff signing in with their departmental credentials on a new GovCMS SaaS site. Walk me through how you'd start.",
      a: "I'd start by saying it isn't a build task yet. GovCMS's own guidance is that if a site uses authentication, collects personal information or takes payments you talk to the platform team early, and SSO is squarely in that bucket. The pieces are already in the image — `drupal/simplesamlphp_auth` 4.1.0, the `simplesamlphp/simplesamlphp` SP library and `drupal/externalauth` are hard requirements of the 4.x distribution — but the module is not in the profile's `install:` list and not on the `managed_modules` allowlist, so nobody on my side can enable it. In parallel I'd get the concrete things the IdP owners must supply: the auth source name, the exact attribute that will be stable enough to be the authname, and the group attribute and its values. That last one is where projects lose weeks, because the agency's directory team often has to create new groups just for the website.",
    },
    {
      q: "How does a SAML group become a Drupal role on this platform, and where does that mapping live?",
      a: "Through `simplesamlphp_auth`'s `role.population` setting, which is a single string in the format `role_id:key,op,value;key,op,value|role_id:...`. The operators are `=` for an exact match against any value of the attribute, `@=` for the portion after the `@` in the first value, and `~=` for a substring of any value. Because each rule is comma-delimited you can't put a full LDAP DN in the value, so in practice you match a fragment of the CN with `~=`. On a site I controlled I'd reach for `hook_simplesamlphp_auth_user_roles_alter()` instead, but GovCMS has no custom-module surface, so the whole mapping has to survive as configuration in `config/default`. Two things I'd flag in review. No operator in the map subtracts a role, so an exclusion rule has to live in the IdP's group membership rather than in Drupal. And `eval_every_time` needs to be on or a revoked group leaves the Drupal role behind — but turning it on means `roleMatchSync()` reconciles the account on every login: it removes every non-locked role the map didn't produce, including any an administrator assigned by hand. That's the surprising one, so I'd say it out loud before anyone starts hand-granting roles to SSO users.",
    },
    {
      q: "A partner team wants to publish content into the site over an API. What do you tell them?",
      a: "First that write access over the API is a much bigger ask than read access on GovCMS: core `jsonapi` ships `read_only: true` and neither `jsonapi` nor `simple_oauth` is enabled or on the allowlist, so it's a platform conversation before it's a design. Second, that a `simple_oauth` scope in 6.x is an `oauth2_scope` config entity whose granularity is a Drupal permission or role, so what they're really asking for is a role with content-creation permissions — and that role still has to survive the permission validators and the `is_admin` check. Third, the practical blocker: `simple_oauth.settings` stores `public_key` and `private_key` as filesystem paths, and the SaaS image body is only `themes/`, `config` and `favicon.ico`, so there's no obvious place for me to put a key pair. I'd raise key storage with the platform team in the same email as the module request rather than discovering it at deploy time.",
    },
    {
      q: "If you did get JSON:API turned on, how would you keep the public surface small?",
      a: "`jsonapi_extras` is bundled in 4.x at 3.28.0, and its `default_disabled: true` is the setting that matters — it flips the whole surface to deny-by-default, so nothing is exposed until a `jsonapi_resource_config` entity enables it. Then per resource I set `path` and `resourceType` so consumers bind to a stable contract rather than to `node--publication`, set `path_prefix` to something like `api/v1`, and disable every field the consumer doesn't need instead of relying on sparse fieldsets that a caller can just ignore. I'd leave `jsonapi.settings.read_only` at `true` and treat any request to flip it as a separate risk conversation. Worth knowing for a 3.x site: `jsonapi_extras` isn't in the `3.x-develop` composer.json at all, so on the Drupal 10 line you don't have those controls.",
    },
  ],
  quiz: [
    {
      question:
        "What is the status of drupal/simplesamlphp_auth on a GovCMS 4.x site?",
      options: [
        "It is not shipped at all; the agency's integrator adds it through the project's custom composer.json.",
        "It is installed and enabled by the govcms profile, with role.population left empty.",
        "It is a hard requirement of the distribution's composer.json, but absent from both the profile install list and the managed_modules allowlist.",
        "It is force-enabled on every deploy by govcms-enable_modules, alongside redis and httpav.",
      ],
      answerIndex: 2,
      explain:
        "The 4.x distribution requires drupal/simplesamlphp_auth 4.1.0 and simplesamlphp/simplesamlphp 2.5.2 outright, so the code is in the image. It does not appear in govcms.info.yml's install list, and it is not one of the 73 names in the managed_modules allowlist, so it is present, off and not self-serve. PLATFORM_MODULES in govcms-enable_modules is a different list entirely.",
    },
    {
      question:
        "What does the externalauth authmap actually key a Drupal account on?",
      options: [
        "An authname string plus a provider string, where simplesamlphp_auth passes 'simplesamlphp_auth' as the provider.",
        "The mail attribute from the assertion, matched case-insensitively against the user's email.",
        "The Drupal username, which must be kept identical to the IdP's sAMAccountName.",
        "The SAML NameID, which externalauth stores as the account's init value and matches on login.",
      ],
      answerIndex: 0,
      explain:
        "externalauth maps (authname, provider) to a uid. simplesamlphp_auth passes the literal provider string 'simplesamlphp_auth' and takes the authname from whichever assertion attribute unique_id names, defaulting to eduPersonPrincipalName. Email and username are synced separately via mail_attr and user_name and are not the linkage key — which is exactly why changing someone's email does not break their login.",
    },
    {
      question:
        "In a role.population rule, which operator tests the portion of the first attribute value that follows an '@'?",
      options: ["=", "~=", "=@", "@="],
      answerIndex: 3,
      explain:
        "The three operators are '=' (the value must match one of the attribute's values exactly), '~=' (the value must appear as a substring of any of them), and '@=' (the first value is split on '@' and the part after it is compared). '@=' is what you use for a rule like mail,@=,agency.gov.au. '=@' is not an operator.",
    },
    {
      question:
        "What does setting default_disabled: true in jsonapi_extras.settings do?",
      options: [
        "It disables the jsonapi_extras module's own admin UI, leaving core JSON:API's routes untouched.",
        "It turns the API into deny-by-default: any resource type without a matching enabled resource config is disabled.",
        "It sets jsonapi.settings.read_only to true, blocking POST, PATCH and DELETE across all resources.",
        "It disables every field on every resource, so each resource config must re-enable the fields it wants to expose.",
      ],
      answerIndex: 1,
      explain:
        "default_disabled means resource types that don't have a matching enabled jsonapi_resource_config are disabled, which is the deny-by-default posture you want on a government site. Read-only is a separate core setting (jsonapi.settings.read_only, true by default), and field-level exposure is controlled per field by the disabled flag inside a resource config's resourceFields.",
    },
  ],
};

export default lesson;

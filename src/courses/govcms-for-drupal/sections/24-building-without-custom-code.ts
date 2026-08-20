import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "building-without-custom-code",
  title: "The Site-Builder Toolkit: Solving It Without a Module",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "The positive answer to the no-custom-code constraint: an ordered search across three lists — the profile install list, the 73-name module allowlist, and the distribution's pinned packages — before anyone is allowed to propose a module.",
  concept: `## Search before you build

The reflex that separates a GovCMS developer from a Drupal developer working on a GovCMS project is an ordered search. Before anyone writes a line of PHP, three lists get checked, in this order.

1. **The profile install list** in \`govcms.info.yml\` — 25 \`drupal:*\` core modules plus \`config_ignore\`, \`media_file_delete\` and \`pathauto\`. If it is here, it is already on.
2. **\`$config['module_permissions.settings']['managed_modules']\`** — 73 names in scaffold-tooling's \`drupal/settings/security.settings.php\`. This list, not the validators, is what governs which modules a site may turn on.
3. **The distribution's pinned \`drupal/*\` packages** — present in the image, but a name that is not on list 2 is not yours to enable.

Only when all three miss is custom code the answer, and on SaaS custom code means PaaS.

### What list 1 already gave you

The profile installs five content types (\`govcms_standard_page\`, \`govcms_blog_article\`, \`govcms_news_and_media\`, \`govcms_event\`, \`govcms_foi\`), a view for most of them, five media types, the \`editorial\` workflow, and three roles: \`govcms_site_administrator\`, \`govcms_content_approver\`, \`govcms_content_author\`. \`layout_builder\`, \`content_moderation\`, \`media_library\` and \`views_ui\` are on out of the box. \`config_split\`, \`jsonapi\` and \`simple_oauth\` are not.

### What list 2 puts within reach

The site-builder kit is genuinely good: \`paragraphs\`, \`field_group\`, \`entity_browser\`, \`inline_entity_form\`, \`entity_reference_revisions\`, \`webform\` and \`webform_ui\`, \`scheduled_transitions\`, \`linkit\`, \`metatag\`, \`redirect\`, \`token\`, \`facets\`, \`search_api\`, \`focal_point\`, \`context\`, \`menu_block\`, \`minisite\`, \`recaptcha\` and \`role_delegation\`.

The allowlist is a ceiling, and the distribution also settles who may work inside it. The shipped \`user.role.govcms_site_administrator.yml\` carries no module permission — but the distribution's \`src/Modules/DefaultPermissions.php\` grants that role \`administer managed modules\` and \`administer managed modules permissions\` the moment \`module_permissions\` is installed, and upstream defines \`administer managed modules\` as "install and uninstall modules from the managed module list". So a Site Administrator can switch an allowlisted module on. What nobody on the site can do is change the list itself: \`administer modules\` is one of the four names in \`permission_blacklist\`, and \`module_permissions_ui\` — the submodule that exposes those settings screens — is both a \`protected_modules\` entry and on the validator's disallowed list.

### The trap in list 3

This is where interviews are lost. \`ds\` 3.37.0, \`layout_builder_restrictions\` 3.0.4, \`layout_builder_modal\` 2.0.0, \`better_exposed_filters\` 7.1.2, \`diff\`, \`twig_tweak\`, \`simple_sitemap\`, \`admin_toolbar\`, \`workbench_access\` and \`simplesamlphp_auth\` are all pinned by the distribution and all absent from the 73-name allowlist. "It ships with GovCMS" is not the same sentence as "we can switch it on". What is verifiable is exactly this: bundled, not installed, not allowlisted. Whether GovCMS will enable one for a given site, and on what timeline, is not publicly documented — so do not promise it to a client.

### The honest boundary

The theme is the code extension point and it is a real one: hooks, preprocess functions, autoloaded classes under \`themes/mytheme/src\`, and — because core's \`LayoutPluginManager\` runs its YAML discovery over theme directories as well as module directories — your own layouts in \`mytheme.layouts.yml\`. What a theme cannot do is join the container:

- No \`mytheme.services.yml\`, no routes, no service overrides.
- A new route or controller, a REST resource, a custom entity type, a queue worker, an event subscriber — none of these has a SaaS shape. They buy PaaS.
- Authentication, personal information and payments have their own escalation: *"If your website uses authentication, collects personal information or payments, talk to us early."*

One asymmetry to carry into the interview: \`webform.webform.*\` and \`webform.webform_options.*\` are in the shipped \`config_ignore\` defaults. Webforms are deliberately excluded from config deployment, so a form built in a lower environment does not ride the pipeline up.`,
  comparisons: [
    {
      label: "Adding Paragraphs to the site",
      intro:
        "The requirement is nestable, reusable page components. Both sides end up on drupal/paragraphs — what differs is who installs it and what you commit.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla Drupal: you own composer.json and the container image.
composer require 'drupal/paragraphs:^1.23' 'drupal/entity_reference_revisions:^1.14'
drush -y en paragraphs
drush -y config:export
git add composer.json composer.lock config/
git commit -m 'Add Paragraphs for the campaign landing pages'`,
      ts: `# GovCMS SaaS: nothing to require. The distribution already pins
# drupal/paragraphs 1.23.0 and drupal/entity_reference_revisions 1.14.0,
# and 'paragraphs' is one of the 73 names in managed_modules.
# The only artefact you commit is config/default/core.extension.yml.
module:
  block: 0
  content_moderation: 0
  entity_reference_revisions: 0
  field_group: 0
  govcms_security: 0
  httpav: 0
  lagoon_logs: 0
  layout_builder: 0
  node: 0
  paragraphs: 0
  pathauto: 0
  tfa: 0
  views: 0
profile: govcms
theme:
  claro: 0
  olivero: 0`,
      note: "A SaaS project has no composer.json to change, so enabling a module is a config change and nothing else — and core.extension.yml must still list httpav, govcms_security, lagoon_logs and tfa or govcms-validate-modules fails on the exported config.",
    },
    {
      label: "Constraining what authors do in Layout Builder",
      intro:
        "The client wants authors to choose from three approved section layouts and nothing else. Vanilla reaches for a custom layouts module plus layout_builder_restrictions; GovCMS has to get there with a theme and a permission.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Vanilla: a custom module supplies the layouts, and
# composer require drupal/layout_builder_restrictions removes the rest.
# web/modules/custom/agency_layouts/agency_layouts.info.yml
name: 'Agency Layouts'
type: module
core_version_requirement: ^11
dependencies:
  - drupal:layout_discovery

# web/modules/custom/agency_layouts/agency_layouts.layouts.yml
agency_hero:
  label: 'Hero and intro'
  path: layouts/hero
  template: layout--hero
  category: 'Agency'
  default_region: intro
  regions:
    banner:
      label: Banner
    intro:
      label: Intro`,
      ts: `# GovCMS SaaS: layout_builder_restrictions 3.0.4 is pinned by the
# distribution but is not one of the 73 managed_modules, so it is not
# yours to enable. The theme supplies the layouts instead --
# LayoutPluginManager runs its 'layouts' YAML discovery over theme
# directories as well as module directories.
# themes/govcms_agency/govcms_agency.layouts.yml
agency_hero:
  label: 'Hero and intro'
  path: layouts/hero
  template: layout--hero
  category: 'Agency'
  default_region: intro
  regions:
    banner:
      label: Banner
    intro:
      label: Intro

# config/default/core.entity_view_display.node.govcms_standard_page.default.yml
third_party_settings:
  layout_builder:
    enabled: true
    allow_custom: false`,
      note: "allow_custom: false is the config-only restriction: authors get the default layout you configured and no per-node override. It does not hide core's own one/two/three-column layouts from a site administrator the way layout_builder_restrictions would — say that out loud rather than overselling the workaround.",
    },
    {
      label: "A public enquiry form with an attachment",
      intro:
        "Both sides use Webform. The GovCMS difference is not the module, it is that the platform rewrites the file field behind you and then refuses to deploy the form as configuration.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla: a webform is configuration like anything else.
drush -y en webform webform_ui
# build the form at /admin/structure/webform, then ship it:
drush -y config:export
git add config/sync/webform.webform.enquiry.yml
git commit -m 'Add the enquiry form'
# on production, the deploy imports it:
drush -y config:import`,
      ts: `# GovCMS: 'webform' and 'webform_ui' are both on the managed_modules
# allowlist, so they are within reach for a site (who is permitted to
# switch them on is not publicly documented). Two things then change.
#
# 1. govcms_security forces every webform upload onto the private stream
#    ($properties['uri_scheme'] = 'private') and blocks the extensions
#    ['doc', 'xls', 'ppt', 'rtf'] outright.
#
# 2. The shipped config_ignore defaults exclude webforms from config
#    deployment entirely -- config/install/config_ignore.settings.yml:
mode: simple
ignored_config_entities:
  - 'clamav.settings'
  - 'login_security.settings'
  - 'password_policy.*'
  - 'seckit.settings'
  - 'system.menu.*'
  - 'webform.webform.*'
  - 'webform.webform_options.*'`,
      note: "Plan the build around it: webforms and menus are authored in the environment that needs them and never travel in config/default, so 'we will build it in dev and push it up' is the wrong answer in a GovCMS interview.",
    },
    {
      label: "When nothing on the lists fits",
      intro:
        "The requirement is one JSON endpoint merging news, events and FOI disclosures into a bespoke response shape. This is the boundary — and the point is the search you run before you admit it.",
      leftLang: "php",
      rightLang: "bash",
      php: `<?php

// Vanilla: a module, a route, a controller. Twenty minutes' work.
namespace Drupal\\agency_feed\\Controller;

use Drupal\\Core\\Cache\\CacheableJsonResponse;
use Drupal\\Core\\Cache\\CacheableMetadata;
use Drupal\\Core\\Controller\\ControllerBase;

class FeedController extends ControllerBase {

  public function feed(): CacheableJsonResponse {
    $storage = $this->entityTypeManager()->getStorage('node');
    $ids = $storage->getQuery()
      ->accessCheck(TRUE)
      ->condition('status', 1)
      ->condition('type', ['govcms_news_and_media', 'govcms_event', 'govcms_foi'], 'IN')
      ->sort('created', 'DESC')
      ->range(0, 50)
      ->execute();

    $items = [];
    foreach ($storage->loadMultiple($ids) as $node) {
      $items[] = [
        'bundle' => $node->bundle(),
        'title' => $node->label(),
        'url' => $node->toUrl('canonical', ['absolute' => TRUE])->toString(),
      ];
    }

    $response = new CacheableJsonResponse(['items' => $items]);
    $response->addCacheableDependency(CacheableMetadata::createFromRenderArray([
      '#cache' => ['tags' => ['node_list']],
    ]));
    return $response;
  }

}`,
      ts: `# GovCMS SaaS: run the three-list search before you concede anything.
ahoy drush pm:list --status=enabled --format=list | grep -E 'rest|jsonapi'
# (no rows -- neither is enabled)

grep -n '"drupal/' /app/web/profiles/contrib/govcms/composer.json | grep -E 'jsonapi|rest'
#   "drupal/jsonapi_extras": "3.28.0",   <- bundled, so list 3 hits

grep -nE "'(rest|serialization|jsonapi|jsonapi_extras)'" /app/vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php
# (no match) -- none of them is one of the 73 managed_modules

# Views cannot expose a REST export display without core's rest and
# serialization modules, and a module cannot be shipped: the SaaS image
# is built from three COPY lines -- themes, config, favicon.ico.
# This requirement is the one that buys PaaS. Say so early, in writing.`,
      note: "The value of the search is not the outcome, it is the paper trail: you can tell the agency exactly which list each candidate failed on, which turns 'we need PaaS' from an opinion into a finding.",
    },
  ],
  playground: {
    intro:
      "Ten real requirements run through the GovCMS decision function. The three lists are checked in order; the tally at the bottom is the argument.",
    lang: "php",
    code: `<?php

// Three lists decide every "can we do this without code?" question on GovCMS.
// They are checked in this order, and the first hit wins.

// List 1: a slice of the profile install list in govcms.info.yml.
$installedByProfile = [
  'layout_builder', 'views', 'content_moderation', 'media_library', 'field_ui',
];

// List 2: a slice of the 73 names in
// $config['module_permissions.settings']['managed_modules'].
$managedModules = [
  'paragraphs', 'field_group', 'entity_browser', 'webform', 'webform_ui',
  'scheduled_transitions', 'linkit', 'metatag', 'search_api', 'token',
];

// List 3: pinned by the distribution's composer.json, on neither list above.
$bundledOnly = [
  'ds', 'layout_builder_restrictions', 'layout_builder_modal',
  'better_exposed_filters', 'simplesamlphp_auth', 'diff', 'twig_tweak',
];

function decide(?string $module, array $installed, array $managed, array $bundled): array {
  if ($module === null) {
    return ['no module does it', 'CUSTOM CODE -> PaaS'];
  }
  if (in_array($module, $installed, true)) {
    return ['1: profile install', 'SaaS: already on'];
  }
  if (in_array($module, $managed, true)) {
    return ['2: managed_modules', 'SaaS: allowlisted'];
  }
  if (in_array($module, $bundled, true)) {
    return ['3: bundled only', 'SaaS: not allowlisted'];
  }
  return ['nowhere', 'CUSTOM CODE -> PaaS'];
}

$requirements = [
  ['Nested reusable page components', 'paragraphs'],
  ['Collapsible tabs on a long node form', 'field_group'],
  ['Reuse an existing media item inline', 'entity_browser'],
  ['Per-node layout chosen by the author', 'layout_builder'],
  ['Publish a page on a future date', 'scheduled_transitions'],
  ['Enquiry form, upload, email notice', 'webform'],
  ['Limit which blocks authors may place', 'layout_builder_restrictions'],
  ['Two-column field output, no Twig', 'ds'],
  ['Sign in against the agency IdP', 'simplesamlphp_auth'],
  ['Bespoke JSON feed over three types', null],
];

printf("%-38s %-28s %-20s %s\\n", 'REQUIREMENT', 'CANDIDATE MODULE', 'FOUND ON', 'VERDICT');
printf("%s\\n", str_repeat('-', 108));

$tally = [];
foreach ($requirements as [$need, $module]) {
  [$found, $verdict] = decide($module, $installedByProfile, $managedModules, $bundledOnly);
  $tally[$verdict] = ($tally[$verdict] ?? 0) + 1;
  printf("%-38s %-28s %-20s %s\\n", $need, $module ?? '(none)', $found, $verdict);
}

printf("%s\\n", str_repeat('-', 108));
foreach ($tally as $verdict => $count) {
  printf("  %-24s %d\\n", $verdict, $count);
}

$noCode = ($tally['SaaS: already on'] ?? 0) + ($tally['SaaS: allowlisted'] ?? 0);
printf("Solvable on SaaS with no code: %d of %d\\n", $noCode, count($requirements));`,
    output: `REQUIREMENT                            CANDIDATE MODULE             FOUND ON             VERDICT
------------------------------------------------------------------------------------------------------------
Nested reusable page components        paragraphs                   2: managed_modules   SaaS: allowlisted
Collapsible tabs on a long node form   field_group                  2: managed_modules   SaaS: allowlisted
Reuse an existing media item inline    entity_browser               2: managed_modules   SaaS: allowlisted
Per-node layout chosen by the author   layout_builder               1: profile install   SaaS: already on
Publish a page on a future date        scheduled_transitions        2: managed_modules   SaaS: allowlisted
Enquiry form, upload, email notice     webform                      2: managed_modules   SaaS: allowlisted
Limit which blocks authors may place   layout_builder_restrictions  3: bundled only      SaaS: not allowlisted
Two-column field output, no Twig       ds                           3: bundled only      SaaS: not allowlisted
Sign in against the agency IdP         simplesamlphp_auth           3: bundled only      SaaS: not allowlisted
Bespoke JSON feed over three types     (none)                       no module does it    CUSTOM CODE -> PaaS
------------------------------------------------------------------------------------------------------------
  SaaS: allowlisted        5
  SaaS: already on         1
  SaaS: not allowlisted    3
  CUSTOM CODE -> PaaS      1
Solvable on SaaS with no code: 6 of 10
`,
  },
  keyPoints: [
    "Check three lists in order before proposing code: the profile install list in govcms.info.yml, the 73-name managed_modules allowlist in scaffold-tooling's security.settings.php, and the distribution's pinned drupal/* packages.",
    "The profile already gives you five content types (govcms_standard_page, govcms_blog_article, govcms_news_and_media, govcms_event, govcms_foi), five media types, the editorial workflow and three roles — with layout_builder and content_moderation on by default.",
    "The site-builder kit is on the allowlist — paragraphs, field_group, entity_browser, inline_entity_form, entity_reference_revisions, webform and webform_ui, scheduled_transitions, linkit, metatag, redirect, token, facets and search_api — and the allowlist is actionable, not decorative: the distribution's DefaultPermissions grants govcms_site_administrator 'administer managed modules' when module_permissions is installed, so that role can enable an allowlisted module — but not change the list, since 'administer modules' is on module_permissions' four-name permission_blacklist.",
    "Bundled is not the same as enableable — ds, layout_builder_restrictions, layout_builder_modal, better_exposed_filters, diff, twig_tweak, simple_sitemap, admin_toolbar, workbench_access and simplesamlphp_auth are all pinned by the distribution and none of them is on the allowlist.",
    "A theme can supply layouts: core's LayoutPluginManager runs its 'layouts' YAML discovery over theme directories as well as module directories, so mytheme.layouts.yml works where a custom module would not.",
    "webform.webform.* and webform.webform_options.* are in the shipped config_ignore defaults, so webforms are deliberately excluded from config deployment and are authored in the environment that needs them.",
  ],
  interview: [
    {
      q: "A client asks for a landing-page builder on GovCMS SaaS. Walk me through how you scope it.",
      a: "I scope it against the three lists before I scope it against the design. \`paragraphs\` is pinned by the distribution at 1.23.0 and is one of the 73 names in \`managed_modules\`, so nested reusable components are a config exercise: paragraph types, \`entity_reference_revisions\` fields, \`field_group\` for the author experience, and the whole thing exported to \`config/default\`. \`layout_builder\` is in the profile install list, so per-node layouts are already available if we want them instead. The part I flag early is restriction — \`layout_builder_restrictions\` is bundled but not on the allowlist, so I plan to constrain authors with \`allow_custom: false\` on the view display and layouts declared in the theme's \`.layouts.yml\`, and I say plainly that this is a coarser control than the contrib module would give.",
    },
    {
      q: "Someone on your team says 'it's fine, that module ships with GovCMS'. What do you say?",
      a: "That shipping and enabling are two different facts, and only one of them is in our control. The distribution pins around a hundred \`drupal/*\` packages; the thing that decides what a site may turn on is \`$config['module_permissions.settings']['managed_modules']\` in scaffold-tooling's \`security.settings.php\`, which is 73 names. \`ds\`, \`layout_builder_modal\`, \`better_exposed_filters\` and \`simple_sitemap\` are all bundled and all absent from that list. I would not tell a client we can enable one of those, because whether GovCMS will do it on request — and how long that takes — is not something I can point at a public source for. Bundled, not installed, not allowlisted is the whole of what I can verify, and that is exactly how I write it in the estimate.",
    },
    {
      q: "How do you deploy a Webform on GovCMS?",
      a: "You do not deploy it — you build it where it needs to live. \`webform\` and \`webform_ui\` are on the allowlist, so they are available to the site — though I would not claim we can flip them on ourselves, because the shipped site-administrator role carries no module-installation permission and \`administer modules\` is on the \`permission_blacklist\`. What matters for deployment is that \`webform.webform.*\` and \`webform.webform_options.*\` are in the config_ignore defaults the profile installs, so forms are deliberately excluded from config deployment. That means a form built in dev will not arrive in production with a config import, and it also means production form changes will not be blown away by the next deploy. Two platform behaviours come along with it: \`govcms_security\` forces webform file uploads onto the private stream and blocks \`doc\`, \`xls\`, \`ppt\` and \`rtf\` uploads. I plan the build so form authoring is an editorial task in each environment, not a release task.",
    },
    {
      q: "When do you stop looking for a site-building answer and say the project needs PaaS?",
      a: "When the requirement needs something discovered from a module namespace or registered in the container — a route, a controller, a REST resource, an event subscriber, a custom entity type, a service override. The theme is a genuine extension point for hooks, preprocess and autoloaded classes under \`themes/mytheme/src\`, and it can even supply layouts, but it cannot ship \`mytheme.services.yml\` or a route. I also treat the platform's own trigger as a stop sign: GovCMS says that if the site uses authentication, collects personal information or takes payments, talk to us early. The useful habit is to record which of the three lists each candidate module failed on, so the recommendation reads as a finding rather than a preference.",
    },
  ],
  quiz: [
    {
      question:
        "Which mechanism actually decides whether a GovCMS site may enable a given module?",
      options: [
        "The GOVCMS_DISALLOWED_MODULES array in govcms-validate-modules",
        "The Shipshape [DATABASE] Active modules audit check",
        "$config['module_permissions.settings']['managed_modules'] in scaffold-tooling's security.settings.php",
        "The dependencies list in govcms.info.yml",
      ],
      answerIndex: 2,
      explain:
        "The validators and Shipshape only assert that four or five specific modules are present and a handful are absent. The 73-name managed_modules list, backed by the contrib module_permissions module, is what restricts the general case.",
    },
    {
      question:
        "layout_builder_restrictions 3.0.4 is pinned in the distribution's composer.json. What can you safely tell a client about it?",
      options: [
        "That it is bundled but is not in the profile install list and is not on the managed_modules allowlist",
        "That it can be enabled self-serve because it is bundled",
        "That GovCMS will enable it on request within a standard support window",
        "That it is banned outright and appears on the validator's disallowed-modules list",
      ],
      answerIndex: 0,
      explain:
        "Bundled, not installed, not allowlisted is exactly what the sources support. The validator's disallowed list is dblog, module_permissions_ui, statistics and update — layout_builder_restrictions is not on it, and nothing public documents an enable-on-request process.",
    },
    {
      question:
        "You need three bespoke section layouts for Layout Builder on a SaaS site. What is the supported route?",
      options: [
        "Ship a small custom module with agency_layouts.layouts.yml",
        "Enable ds and build the layouts as DS field templates",
        "Patch layout_discovery through custom/composer/patches.json",
        "Declare them in themes/mytheme/mytheme.layouts.yml",
      ],
      answerIndex: 3,
      explain:
        "Core's LayoutPluginManager decorates its discovery with a YamlDiscoveryDecorator over module directories plus theme directories, so a theme's .layouts.yml is discovered. A custom module never reaches the SaaS image, ds is not on the allowlist, and a SaaS project has no composer files.",
    },
    {
      question:
        "A webform built and tested in a lower environment does not appear in production after a deploy. Why?",
      options: [
        "govcms-config-import runs with --partial and skips new config entities",
        "webform.webform.* is in the shipped config_ignore defaults, so webforms are excluded from config deployment",
        "The webform module is not on the managed_modules allowlist, so it is uninstalled on rollout",
        "govcms-validate-modules strips webform config that references the private file stream",
      ],
      answerIndex: 1,
      explain:
        "The profile installs config_ignore with mode: simple and an ignored list that includes webform.webform.* and webform.webform_options.*. That is deliberate — forms are editorial content in practice, so they are authored per environment rather than deployed.",
    },
  ],
};

export default lesson;

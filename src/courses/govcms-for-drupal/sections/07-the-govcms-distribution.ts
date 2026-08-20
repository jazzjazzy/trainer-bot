import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "the-govcms-distribution",
  title: "govcms/govcms: A Drupal Profile Shipped as a Product",
  part: "The Distribution & Your Codebase",
  estMinutes: 13,
  summary:
    "How to read a GovCMS version, what pinning ~102 packages into an install profile does to your dependency graph, and why the distribution's release cadence — not drupal.org's — sets your upgrade calendar.",
  concept: `
## A distribution is a Composer package, not a starter kit

\`govcms/govcms\` declares \`"type": "drupal-profile"\`. Its \`composer.json\` on the
\`4.x-develop\` branch requires \`"php": "^8.3.0"\` and roughly 102 \`drupal/*\` packages —
and every one of them is an **exact version**, not a range: \`drupal/webform 6.3.0\`,
\`drupal/tfa 1.12.0\`, \`drupal/module_permissions 4.0.0\`. It also carries seven patches
across six packages under \`cweagans/composer-patches\`, with
\`composer-exit-on-patch-failure: true\`. There is no \`composer.lock\` in the package —
the exact pins *are* the lock.

The profile itself is small. \`govcms.info.yml\` reads:

\`\`\`yaml
core_version_requirement: ^11
project: 'govcms'
version: '4.5.0.1'
dependencies:
  - govcms_security
\`\`\`

One custom module, \`govcms_security\`. Everything else is contrib, pinned.

### Reading a version

\`VERSIONS.md\` says exactly one thing about the scheme:
*"The three parts of our versioning system are MAJOR.FEATURE.SPRINT."* Three parts.
Yet the current tag is \`4.5.0.1\`. A fourth segment occasionally appears for an
out-of-band hotfix — \`4.5.0.1\` landed three days after \`4.5.0\` with a one-line release
note — but the versioning doc has never been updated to describe it. Do not name that
segment "PATCH" in an interview; say what the evidence supports.

**Branch and tag differ, so say which you mean.** \`4.x-develop\` pins
\`drupal/core-recommended 11.4.5\`. The released \`4.5.0.1\` tag pins \`11.3.14\`.
"GovCMS 4.5.0.1 ships Drupal 11.4.5" is simply false.

### There are two version lines, and only one is on your Dockerfile

The distribution tags are \`4.5.0.1\`. The **image** tags, cut from \`govCMS/lagoon\`, are
\`11.3.8.1\` — leading segment tracking the Drupal major. The lagoon \`11.3.8.1\` release
note reads, in full, "GovCMS release 4.5.0.1". That is the join.

Your scaffold's Dockerfile does not name either number:

\`\`\`
ARG GOVCMS_IMAGE_VERSION=11.x-latest
FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}
\`\`\`

A floating tag, reached through a build arg. In the raw scaffold that default is
written \`{{ GOVCMS_VERSION }}.x-latest\` and \`scaffold-init.sh\` seds the \`11\` in.
Because \`FROM\` interpolates the \`ARG\`, \`docker-compose.yml\` can override the tag by
passing \`GOVCMS_IMAGE_VERSION\` as a build arg, resolved from your \`.env\`.
On SaaS, \`scaffold-init.sh\` then runs \`rm composer.*\` — a SaaS repo has
no \`composer.json\` at all, and the only things copied into the image are
\`themes/\`, \`config\` and \`favicon.ico\`. On PaaS, \`composer.11.json\` is moved into place
and requires \`govcms/govcms: 4.x-master-dev\` under \`minimum-stability: dev\` — a branch
constraint, frozen only by the \`composer.lock\` you commit.

### What bundling actually implies

- **Bundled is not enabled — but "three contrib" undersells what comes up.** The
  \`install:\` key lists 25 core modules plus three contrib: \`config_ignore\`,
  \`media_file_delete\`, \`pathauto\`. Core's \`install_profile_info()\` then merges the
  profile's \`dependencies:\` into that same install list, and \`dependencies:\` is
  \`govcms_security\` — whose own \`.info.yml\` requires the entire GovCMS Security Kit
  (encrypt, event_log_track and its submodules, honeypot, key, login_security,
  password_policy and its submodules, real_aes, seckit, securitytxt, tfa,
  username_enumeration_prevention). So a fresh install has far more than three contrib
  modules on. Packages like
  \`search_api\`, \`config_split\`, \`simple_oauth\` and \`simplesamlphp_auth\` are on disk and
  off. What a site may additionally enable is governed by
  \`$config['module_permissions.settings']['managed_modules']\`, not by what Composer
  installed.
- **You cannot bump one package.** The pins move together, on their release.
- **The calendar is theirs.** 4.x has been cutting a FEATURE or SPRINT release roughly
  monthly, and the 3.x line (Drupal 10, \`core_version_requirement: ^10\`) is still
  releasing in parallel. Your upgrade planning is a diff of two GovCMS tags, not a
  drupal.org security advisory feed.
`.trim(),
  comparisons: [
    {
      label: "Getting a contrib module into the build",
      intro:
        "You need Paragraphs on the site. On a site you own that is a Composer operation; on GovCMS the package is already there and the question is whether you are allowed to switch it on.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal 11 site you control end to end.
composer require drupal/paragraphs:^1.23 drupal/entity_reference_revisions:^1.14
composer update --lock

drush pm:install paragraphs -y
drush config:export -y

git add composer.json composer.lock config/
git commit -m "Add Paragraphs"`,
      ts: `# GovCMS: paragraphs is already pinned in the distribution's composer.json
# (drupal/paragraphs 1.23.0), so it is on disk in the image before you start.
# On SaaS, scaffold-init.sh has already run \`rm composer.*\` - there is no
# composer.json in this repo to add a require to.
ahoy drush pm:list --type=module --status=disabled --filter=paragraphs

# Enabling is gated by module_permissions.settings.managed_modules, not by
# whether the code is present. That list is a settings.php override written by
# scaffold-tooling (drupal/settings/security.settings.php), not exported config,
# and drush config:get reads editable config unless you ask for overrides - so
# without the flag it prints nothing. Check before you promise a client a date.
ahoy drush config:get module_permissions.settings managed_modules --include-overridden

ahoy drush pm:install paragraphs -y
ahoy drush config:export -y
git add config/
git commit -m "Enable Paragraphs"`,
      note: "On GovCMS the Composer step does not exist and the enable step is a policy question. `ahoy drush` is `docker compose exec -T cli drush` — Drush never runs on your host.",
    },
    {
      label: "Where your Drupal core version comes from",
      intro:
        "Same goal on both sides: know and control which Drupal core the site runs. One side is a Composer constraint you own; the other is a Docker tag that moves under you.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# You decide the core version, and you decide when it changes.
composer require \\
  drupal/core-recommended:11.3.14 \\
  drupal/core-composer-scaffold:11.3.14 \\
  --update-with-dependencies

composer update --lock
drush updatedb -y
drush cache:rebuild
drush status --field=drupal-version

git add composer.json composer.lock`,
      ts: `# Nothing in a GovCMS SaaS repo names a core version.
# .docker/Dockerfile.cli, renamed from Dockerfile.saas by scaffold-init.sh:
#   ARG CLI_IMAGE
#   ARG GOVCMS_IMAGE_VERSION=11.x-latest
#   FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}
# docker-compose.yml passes that ARG as a build arg, resolved from .env, which
# is the only reason a local pin can move the tag at all.
grep GOVCMS_IMAGE_VERSION .env
# GOVCMS_IMAGE_VERSION=11.x-latest

# 11.x-latest currently resolves to the govcms/govcms image cut from
# govCMS/lagoon tag 11.3.8.1, whose release note reads "GovCMS release 4.5.0.1".
ahoy drush status --field=drupal-version
cat .version.yml

# Your only lever is when you redeploy. The tag is re-pulled on rollout.
git push`,
      note: "Pin the tag locally in `.env` if you want a reproducible dev box; the platform still rolls forward on `11.x-latest` when it redeploys.",
    },
    {
      label: "Coding against a module the distribution ships but does not enable",
      intro:
        "A service class that wants Search API. `drupal/search_api 1.41.0` is bundled in the distribution, but it is not in the profile's install list — so on GovCMS its services may not exist in the container.",
      php: `// Vanilla: you required search_api yourself, so it is enabled and its
// services are guaranteed present. Type-hint the interface and move on.
namespace Drupal\\my_feature\\Service;

use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\search_api\\Utility\\QueryHelperInterface;

class RelatedContent {

  public function __construct(
    protected QueryHelperInterface $queryHelper,
    protected EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public function find(string $term, int $limit): array {
    // createQuery() takes an IndexInterface, never an index ID string.
    $index = $this->entityTypeManager
      ->getStorage('search_api_index')
      ->load('content_index');
    if (!$index) {
      return [];
    }
    $query = $this->queryHelper->createQuery($index);
    $query->keys($term)->range(0, $limit);
    return $query->execute()->getResultItems();
  }

}`,
      ts: `// GovCMS: ~102 packages sit on disk, but the profile's install: key names
// only 25 core modules plus config_ignore, media_file_delete and pathauto
// (plus whatever govcms_security drags in). search_api is bundled and off. A constructor type-hint on a service from a
// disabled module makes the container unbuildable on that site.
namespace Drupal\\my_feature\\Service;

use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Drupal\\Core\\Extension\\ModuleHandlerInterface;

class RelatedContent {

  public function __construct(
    protected ModuleHandlerInterface $moduleHandler,
    protected EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public function find(string $term, int $limit): array {
    if (!$this->moduleHandler->moduleExists('search_api')) {
      return [];
    }
    // Same signature applies here: load the index entity first.
    $index = $this->entityTypeManager
      ->getStorage('search_api_index')
      ->load('content_index');
    if (!$index) {
      return [];
    }
    $query = \\Drupal::service('search_api.query_helper')
      ->createQuery($index);
    $query->keys($term)->range(0, $limit);
    return $query->execute()->getResultItems();
  }

}`,
      note: "Write the guard even when the module is bundled — and remember a SaaS project cannot ship a custom module at all, so this pattern belongs to PaaS. On SaaS you may autoload classes from `themes/mytheme/src`, but you cannot register them as services: Drupal's kernel only collects `*.services.yml` from modules, so there is no `mytheme.services.yml`. Call the guard from a preprocess hook and instantiate the class yourself.",
    },
    {
      label: "Declaring the dependency graph",
      intro:
        "An install profile is where a Drupal site states what it is made of. On your own site you write that list; on GovCMS the distribution has already written it, verbatim, and your repo does not get a vote.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# my_agency.info.yml - your own profile on a site you control.
# You choose every entry, and composer.json next to it chooses the versions.
name: My Agency
type: profile
description: 'Baseline for agency sites.'
core_version_requirement: ^10 || ^11
version: '2.4.0'

install:
  - drupal:node
  - drupal:views
  - drupal:views_ui
  - drupal:field_ui
  - drupal:content_moderation
  - drupal:workflows
  - drupal:media_library
  - paragraphs:paragraphs
  - pathauto:pathauto
  - webform:webform
  - search_api:search_api
  - metatag:metatag

themes:
  - claro
  - olivero`,
      ts: `# govcms.info.yml, govCMS/GovCMS @ 4.x-develop. The install: key below is
# 25 core modules and three contrib - but core's install_profile_info()
# merges dependencies: into the install list, so govcms_security and every
# module its own .info.yml requires are enabled on a fresh site too.
name: GovCMS
type: profile
core_version_requirement: ^11
project: 'govcms'
version: '4.5.0.1'

install:
  - drupal:block
  - drupal:block_content
  - drupal:ckeditor5
  - drupal:config
  - drupal:content_moderation
  - drupal:contextual
  - drupal:datetime_range
  - drupal:dynamic_page_cache
  - drupal:field_ui
  - drupal:help
  - drupal:layout_builder
  - drupal:media_library
  - drupal:menu_ui
  - drupal:node
  - drupal:options
  - drupal:page_cache
  - drupal:path
  - drupal:settings_tray
  - drupal:shortcut
  - drupal:taxonomy
  - drupal:telephone
  - drupal:toolbar
  - drupal:views
  - drupal:views_ui
  - drupal:workflows
  - config_ignore:config_ignore
  - media_file_delete:media_file_delete
  - pathauto:pathauto

dependencies:
  - govcms_security

themes:
  - claro
  - olivero`,
      note: "`layout_builder` and `config_ignore` are on by default; `config_split`, `jsonapi`, `simple_oauth` and `simplesamlphp_auth` are bundled by Composer but absent from this list.",
    },
  ],
  playground: {
    intro:
      "A pure-PHP model of the two things you must be able to do on sight: segment a GovCMS release string under the documented MAJOR.FEATURE.SPRINT rule, and see the shape of what the distribution bundles.",
    lang: "php",
    code: `<?php

// Part A: segment a GovCMS distribution release string.
// VERSIONS.md documents three parts: MAJOR.FEATURE.SPRINT. A fourth segment
// turns up occasionally (4.5.0.1) and is not described anywhere.

$names = ['MAJOR', 'FEATURE', 'SPRINT', '4th segment'];
$releases = ['3.29.2', '4.4.0', '4.5.0', '4.5.0.1'];

function segments(string $tag): array {
  return array_map('intval', explode('.', $tag));
}

function padded(string $tag): array {
  // Absent segments read as 0, so 4.5.0 and 4.5.0.1 compare cleanly.
  return array_pad(segments($tag), 4, 0);
}

function newer(string $a, string $b, array $names): array {
  $x = padded($a);
  $y = padded($b);
  for ($i = 0; $i < 4; $i++) {
    if ($x[$i] !== $y[$i]) {
      return [$x[$i] > $y[$i] ? $a : $b, $names[$i]];
    }
  }
  return [$a, 'identical'];
}

echo "GovCMS distribution tags -- MAJOR.FEATURE.SPRINT (VERSIONS.md)\\n";
printf("%-10s %-6s %-8s %-7s %-6s %s\\n",
  'tag', 'MAJOR', 'FEATURE', 'SPRINT', '4th', 'reads as');
echo str_repeat('-', 68) . "\\n";

foreach ($releases as $tag) {
  $s = padded($tag);
  $four = count(segments($tag)) === 4;
  printf("%-10s %-6d %-8d %-7d %-6s %s\\n",
    $tag, $s[0], $s[1], $s[2],
    $four ? (string) $s[3] : '-',
    $four ? 'undocumented out-of-band hot fix' : 'documented three-part tag');
}

echo "\\nWhich is newest, and on which segment was it decided?\\n";
$best = $releases[0];
foreach (array_slice($releases, 1) as $tag) {
  [$win, $why] = newer($best, $tag, $names);
  printf("  %-8s vs %-8s -> %-8s (decided on %s)\\n", $best, $tag, $win, $why);
  $best = $win;
}
printf("  newest = %s\\n", $best);

// Part B: what the 4.x-develop composer.json actually bundles.
$census = [
  'Site building & UI' => 29,
  'Security & access' => 23,
  'Content & editorial' => 18,
  'Media & files' => 12,
  'SEO & analytics' => 8,
  'Search' => 6,
  'Migration' => 3,
  'Drupal core' => 2,
  'Dev & QA' => 1,
];
$total = array_sum($census);

echo "\\nBundled drupal/* packages on 4.x-develop, by role\\n";
echo str_repeat('-', 68) . "\\n";
foreach ($census as $label => $n) {
  $pct = (int) round($n * 100 / $total);
  printf("  %-20s %3d  %-14s %2d%%\\n",
    $label, $n, str_repeat('#', (int) round($pct / 2)), $pct);
}
printf("  %-20s %3d\\n", 'TOTAL', $total);

echo "\\nBundled is not enabled: the install: key turns on 25 core modules plus\\n";
echo "3 of the above (config_ignore, media_file_delete, pathauto) -- but core\\n";
echo "merges dependencies: into that list, so govcms_security and the security\\n";
echo "contrib its .info.yml requires come up enabled as well.\\n";`,
    output: `GovCMS distribution tags -- MAJOR.FEATURE.SPRINT (VERSIONS.md)
tag        MAJOR  FEATURE  SPRINT  4th    reads as
--------------------------------------------------------------------
3.29.2     3      29       2       -      documented three-part tag
4.4.0      4      4        0       -      documented three-part tag
4.5.0      4      5        0       -      documented three-part tag
4.5.0.1    4      5        0       1      undocumented out-of-band hot fix

Which is newest, and on which segment was it decided?
  3.29.2   vs 4.4.0    -> 4.4.0    (decided on MAJOR)
  4.4.0    vs 4.5.0    -> 4.5.0    (decided on FEATURE)
  4.5.0    vs 4.5.0.1  -> 4.5.0.1  (decided on 4th segment)
  newest = 4.5.0.1

Bundled drupal/* packages on 4.x-develop, by role
--------------------------------------------------------------------
  Site building & UI    29  ############## 28%
  Security & access     23  ############   23%
  Content & editorial   18  #########      18%
  Media & files         12  ######         12%
  SEO & analytics        8  ####            8%
  Search                 6  ###             6%
  Migration              3  ##              3%
  Drupal core            2  #               2%
  Dev & QA               1  #               1%
  TOTAL                102

Bundled is not enabled: the install: key turns on 25 core modules plus
3 of the above (config_ignore, media_file_delete, pathauto) -- but core
merges dependencies: into that list, so govcms_security and the security
contrib its .info.yml requires come up enabled as well.
`,
  },
  keyPoints: [
    "`govcms/govcms` is a Composer package of `\"type\": \"drupal-profile\"`. On `4.x-develop` it requires `\"php\": \"^8.3.0\"` and about 102 `drupal/*` packages, every one at an exact version — there is no `composer.lock` in the package because the pins are the lock.",
    "`VERSIONS.md` documents three parts and stops: \"The three parts of our versioning system are MAJOR.FEATURE.SPRINT.\" The fourth segment on `4.5.0.1` is evidenced only by an out-of-band hot fix release three days after `4.5.0`; it has no documented name.",
    "Branch and tag pin different cores. `4.x-develop` pins `drupal/core-recommended 11.4.5`; the released `4.5.0.1` tag pins `11.3.14`. Always say which you mean.",
    "Two version lines exist: distribution tags (`4.5.0.1`) and the image tags cut from `govCMS/lagoon` (`11.3.8.1`, whose release note reads \"GovCMS release 4.5.0.1\"). Your Dockerfile names neither — it says `FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}`, defaulting to the floating `11.x-latest`.",
    "A SaaS project repo has no `composer.json`: `scripts/scaffold-init.sh` runs `rm composer.*` for non-PaaS types. PaaS gets `composer.11.json` copied into place, requiring `govcms/govcms: 4.x-master-dev` under `minimum-stability: dev`.",
    "Bundled is not enabled — but the `install:` key is not the whole install list. It names 25 core modules plus `config_ignore`, `media_file_delete` and `pathauto`; core's `install_profile_info()` then merges `dependencies:` in, so `govcms_security` and the security contrib it requires are enabled on a fresh site too. What else a site may switch on is governed by `$config['module_permissions.settings']['managed_modules']`, a settings.php override from scaffold-tooling rather than exported config.",
  ],
  interview: [
    {
      q: "Read me the version `4.5.0.1`. What does each segment mean, and what does it tell you about the site?",
      a: "`VERSIONS.md` in `govCMS/GovCMS` defines exactly three parts — MAJOR.FEATURE.SPRINT — so `4` is the major line (Drupal 11), `5` the feature release and `0` the sprint. The fourth segment is undocumented; the only evidence for reading it as a hotfix is that `4.5.0.1` was published three days after `4.5.0` with a one-line release note. I would not put a name on it in a design document. The other thing I would say out loud is that a distribution version does not by itself tell me the core version: `4.x-develop` pins `drupal/core-recommended 11.4.5` while the `4.5.0.1` tag pins `11.3.14`, so I check `composer.json` at the ref I actually mean rather than quoting a number from memory.",
    },
    {
      q: "A client on SaaS wants Paragraphs added. Walk me through what actually happens.",
      a: "Nothing Composer-shaped happens, because a SaaS repo has no `composer.json` — `scripts/scaffold-init.sh` deletes it during provisioning, and `drupal/paragraphs 1.23.0` is already pinned inside the distribution and baked into the `govcms/govcms` image. So the code is on disk before the conversation starts. The real question is enablement: that is governed by `module_permissions.settings.managed_modules`, not by whether the package is installed, so I check what the site's delegated role can actually reach before I give anyone a date. If it is reachable, it is `ahoy drush pm:install paragraphs`, then `ahoy drush config:export` and a commit of `config/` — because on SaaS `config` and `themes/` are two of the only three things the Dockerfile copies into the image.",
    },
    {
      q: "Who controls when the Drupal core version under a GovCMS site changes?",
      a: "The platform does, and the mechanism is a floating Docker tag. The scaffold writes `ARG GOVCMS_IMAGE_VERSION=11.x-latest` and then `FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}`, so the tag defaults to the floating `11.x-latest`, the image is re-pulled on every rollout and core can move without a single line changing in the repo. The chain upstream is: `govCMS/GovCMS` cuts a distribution tag, `govCMS/lagoon` cuts a matching image tag — its `11.3.8.1` release note literally reads \"GovCMS release 4.5.0.1\" — and `11.x-latest` then points at it. Practically that means my only lever is redeploy timing and my regression testing, so I keep a pinned `GOVCMS_IMAGE_VERSION` locally for reproducible debugging and treat the diff between two GovCMS tags, not a drupal.org advisory feed, as my upgrade planning input.",
    },
    {
      q: "The distribution pins about 102 packages. Is that a good thing?",
      a: "It is good for the platform and constraining for me, and I would answer it in those terms rather than as a preference. Exact pins plus seven patches across six packages, with `composer-exit-on-patch-failure: true`, mean every GovCMS site is running a known, tested, uniformly patched set — which is what lets Finance make security assurances across hundreds of sites. The cost is that I cannot bump one module for one client; the pins move together on the distribution's release, which has been roughly monthly on the 4.x line while 3.x keeps releasing for Drupal 10 sites. So my architecture rule is to check whether the answer is already in the bundle before designing anything custom, and my delivery rule is that a module being present in `web/modules/contrib` tells me nothing about whether the site is allowed to enable it.",
    },
  ],
  quiz: [
    {
      question: "Where does a GovCMS SaaS project repository pin its Drupal core version?",
      options: [
        "In a committed `composer.lock` at the repository root",
        "In `core_version_requirement` in the project's own `.info.yml`",
        "Nowhere — the Dockerfile floats on the `11.x-latest` image tag, and `scaffold-init.sh` runs `rm composer.*` for SaaS",
        "In the `.lagoon.yml` post-rollout task list",
      ],
      answerIndex: 2,
      explain:
        "A SaaS repo has no `composer.json` at all — `scripts/scaffold-init.sh` deletes it for non-PaaS types. Core arrives inside the `govcms/govcms` image, and the tag `11.x-latest` is re-pulled on every rollout. PaaS is different: it gets `composer.11.json` copied to `composer.json` and commits a lock.",
    },
    {
      question: "What versioning scheme does `VERSIONS.md` in `govCMS/GovCMS` document?",
      options: [
        "MAJOR.FEATURE.SPRINT — three parts, and nothing else",
        "MAJOR.MINOR.PATCH.HOTFIX — four parts",
        "Drupal core's own MAJOR.MINOR.PATCH, mirrored",
        "MAJOR.FEATURE.SPRINT.PATCH — three parts plus an optional patch segment",
      ],
      answerIndex: 0,
      explain:
        "The file contains one sentence about the scheme: \"The three parts of our versioning system are MAJOR.FEATURE.SPRINT.\" The fourth segment seen on `4.5.0.1` is real but undescribed — the only evidence is that it shipped three days after `4.5.0` as a one-line hot fix. Naming it \"PATCH\" or \"HOTFIX\" in an interview is inventing documentation.",
    },
    {
      question: "Which statement about the distribution's Drupal core pin is correct?",
      options: [
        "GovCMS 4.5.0.1 ships Drupal core 11.4.5",
        "Both `4.x-develop` and the `4.5.0.1` tag pin `drupal/core-recommended 11.4.5`",
        "The distribution does not pin core at all; the project's `composer.json` does",
        "`4.x-develop` pins `drupal/core-recommended 11.4.5`, while the `4.5.0.1` tag pins `11.3.14`",
      ],
      answerIndex: 3,
      explain:
        "Branch and tag genuinely differ, which is why the sentence has to name the ref. The development branch has already moved to `11.4.5`; the released `4.5.0.1` tag still pins `11.3.14`. Saying \"4.5.0.1 ships 11.4.5\" is the classic mistake, and an interviewer who has read the repo will catch it.",
    },
    {
      question: "The distribution bundles roughly 102 `drupal/*` packages. How many contrib modules does the profile's `install:` key itself name?",
      options: [
        "All 102 — that is what bundling into a profile means",
        "Three — `config_ignore`, `media_file_delete` and `pathauto` — alongside 25 core modules",
        "Seventy-three, matching the `managed_modules` allowlist",
        "None; the install list contains only core modules and the two themes",
      ],
      answerIndex: 1,
      explain:
        "`govcms.info.yml` lists 25 `drupal:*` core modules plus exactly `config_ignore:config_ignore`, `media_file_delete:media_file_delete` and `pathauto:pathauto`, with `claro` and `olivero` as themes. That is the `install:` key alone, though: core's `install_profile_info()` merges `dependencies:` into the install list, so `govcms_security` and the security contrib its `.info.yml` requires come up enabled as well. Named packages like `search_api`, `config_split`, `simple_oauth` and `simplesamlphp_auth` really are on disk and off, and the `managed_modules` list is a separate mechanism governing what a site may additionally enable.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 9,
  slug: "composer-topology-and-updates",
  title: "Your composer.json Is a Delta, Not a Manifest",
  part: "The Distribution & Your Codebase",
  estMinutes: 13,
  summary:
    "The distribution pins 102 drupal/* packages at exact versions, so a GovCMS project's job is to declare the difference — and a habitual root-level composer require is what breaks the next distribution release.",
  concept: `## The distribution owns the dependency graph

The \`govCMS/GovCMS\` \`composer.json\` requires 109 packages, 102 of them \`drupal/*\`, and every one of those 102 is an **exact** version — \`"drupal/webform": "6.3.0"\`, not \`^6.3\`. Core is pinned the same way: \`drupal/core-recommended\` is \`11.4.5\` on the \`4.x-develop\` branch, while the released \`4.5.0.1\` tag pins \`11.3.14\`. There is not one caret on a \`drupal/*\` package in that require block — the few carets there sit on non-Drupal tooling like \`php\`, \`composer/installers\` and \`cweagans/composer-patches\` — and that single fact governs everything below.

Your project — the repo an agency gets from \`govCMS/scaffold\` — requires six things:

\`\`\`json
"require": {
  "php": "^8.3",
  "govcms/govcms-custom": "*",
  "govcms/govcms": "4.x-master-dev",
  "govcms/scaffold-tooling": "11.x-master-dev",
  "drush/drush": "^13",
  "composer/installers": "^2.0"
}
\`\`\`

GovCMS 3.x on Drupal 10 ships \`composer.10.json\` alongside it: \`php ^8.1\`, \`govcms/govcms 3.x-master-dev\`, \`scaffold-tooling 10.x-master-dev\`, \`drush ^12\`. \`ahoy init <name> <type> <version>\` copies one or the other into place as \`composer.json\` — but only when the type is \`paas\`; on \`saas\` and \`saasplus\` the same script runs \`rm composer.*\` and no root \`composer.json\` survives.

### custom/composer is the delta

\`govcms/govcms-custom\` is a **path repository** at \`custom/composer\`, and the file it points at ships with an empty require block:

\`\`\`json
{
  "name": "govcms/govcms-custom",
  "description": "Provides additional packages over the GovCMS base distribution.",
  "repositories": [],
  "require": {}
}
\`\`\`

That empty object is your entire dependency budget. Everything else in the graph moves on someone else's release cycle.

### What each offering actually gets

- **SaaS** — \`scripts/scaffold-init.sh\` runs \`rm composer.*\` and \`rm -r custom/composer\` at provisioning. There is no dependency management. \`.docker/Dockerfile.saas\` copies \`themes/\`, \`config\` and \`favicon.ico\` into a prebuilt \`govcms/govcms\` image and nothing else from your repo enters it.
- **SaaS+** — \`custom/\` survives, is copied into the image, and Composer re-runs at build time.
- **PaaS** — a full \`composer install\` from your repo during the image build; \`composer.lock\` is committed (it is not in \`.gitignore\`).

### The failure you will walk into

\`composer require drupal/paragraphs:1.23.0\` in the project root resolves cleanly. Nothing objects. Then the distribution's next release moves that pin, \`composer update govcms/govcms\` cannot satisfy both constraints at once, and you are wedged between a security release and your own line. The rule: if a package is one of the 102, do not name it in your files at all — not to pin it, not to widen it.

### Patches

\`extra.enable-patching\` is \`true\` and \`extra.patches-file\` points at \`custom/composer/patches.json\`. The distribution declares seven patches over six packages inline in its own \`extra.patches\`, so you inherit those for free. Your own are another matter: \`govcms-vet\` compares your \`patches.json\` \`.patches\` against the scaffold's empty one and reports \`[vet-005]\`. It also compares \`.repositories\` (\`vet-001\`), \`enable-patching\` (\`vet-002\`), \`.scripts\` (\`vet-003\`), \`patches-file\` (\`vet-004\`) and the *keys* of \`custom/composer/composer.json\` (\`vet-006\`) — so you may add to \`require\`, but not add a key beside it. The seventh finding is not a Composer check at all: \`vet-007\` searches the filesystem for any \`*.info.yml\` under a \`web\` modules path (section 10). The script's error code is \`1\` on \`saas\` and \`saasplus\`, \`0\` on \`paas\`. Either way, a patch you write is a hunk against one exact upstream version that the distribution will move without asking you.`,
  comparisons: [
    {
      label: "Where a new contrib package goes",
      intro:
        "You need Views Bulk Operations and Webform. On a site you control, both are one command. On GovCMS, one of them is already in the image and the other belongs in a different file.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: the project root composer.json IS the manifest.
composer require 'drupal/views_bulk_operations:^4.3'
composer require 'drupal/webform:^6.3'

git add composer.json composer.lock
git commit -m "Add VBO and Webform."

vendor/bin/drush pm:install views_bulk_operations webform -y`,
      ts: `# GovCMS: ask the distribution first. It owns 102 drupal/* pins.
ahoy run "composer show drupal/webform"
# name     : drupal/webform
# versions : * 6.3.0
# Already shipped. Adding it to your files can only cause harm.

# Only a genuinely new package goes in the delta package.
cat > custom/composer/composer.json <<'JSON'
{
    "name": "govcms/govcms-custom",
    "description": "Provides additional packages over the GovCMS base distribution.",
    "repositories": [],
    "require": {
        "drupal/views_bulk_operations": "^4.3"
    }
}
JSON

ahoy run "composer update govcms/govcms-custom -W"
git add custom/composer/composer.json composer.lock`,
      note: "govcms-vet compares only the *keys* of custom/composer/composer.json against the scaffold's, so adding to require is fine while adding a sibling key (require-dev, extra, conflict) trips [vet-006]. On saas, provisioning deleted both composer.* and custom/composer — there is no delta package to edit, and enabling an already-shipped module is an allowlist question, not a Composer one.",
    },
    {
      label: "Pinning a package the distribution already owns",
      intro:
        "Pinning contrib to the exact version you tested is good hygiene on a normal Drupal site. On GovCMS the same line is a time bomb, and nothing warns you when you plant it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: exact pins in the root are the responsible default.
composer require 'drupal/paragraphs:1.23.0'
composer update drupal/paragraphs --with-dependencies
vendor/bin/drush updatedb -y

# Later, on your own schedule, you move it yourself.
composer require 'drupal/paragraphs:1.24.0'`,
      ts: `# GovCMS PaaS: this resolves today, exactly as it would anywhere.
ahoy run "composer require drupal/paragraphs:1.23.0"
# Nothing objects. composer validate passes. govcms-vet passes.

# One distribution release later, the pin has moved:
ahoy run "composer update govcms/govcms -W"
#   Problem 1
#     - govcms/govcms 4.x-master-dev requires drupal/paragraphs 1.24.0
#       -> found drupal/paragraphs[1.24.0] but it conflicts with your
#          root composer.json require (1.23.0).

# The only fix is to remove the line you should never have written.
ahoy run "composer remove drupal/paragraphs --no-update"
ahoy run "composer update govcms/govcms -W"`,
      note: "govcms-vet never inspects the root require block, so no validator catches this. The resolver does, one release later, at the moment you are trying to take a security update — which is why the reflex to 'pin what we tested' is the single most expensive habit a Drupal developer brings to GovCMS.",
    },
    {
      label: "Patching a contrib module",
      intro:
        "A contrib bug needs a patch. On a site you own, patches are a normal part of the root composer.json. On GovCMS, check what the distribution already patches, and understand what your own patch costs.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: you own extra.enable-patching and extra.patches.
composer require cweagans/composer-patches:^1.7
composer config extra.enable-patching true
composer config --json extra.patches '{
  "drupal/facets": {
    "Creating requests causes failures on Drupal 10.3 - 3466281":
      "https://www.drupal.org/files/issues/2024-11-21/3466281-7.patch"
  }
}'
composer install`,
      ts: `# GovCMS: the distribution already declares its own patches inline.
ahoy run "jq -c '.extra.patches | keys' web/profiles/contrib/govcms/composer.json"
# ["drupal/entity_embed","drupal/entity_reference_revisions","drupal/facets",
#  "drupal/jsonapi_extras","drupal/password_policy","drupal/tfa"]
# Seven patches over six packages. The facets one is already applied.

# Yours may only go where extra.patches-file points.
ahoy run "composer config extra.patches-file"
# custom/composer/patches.json

cat > custom/composer/patches.json <<'JSON'
{
  "patches": {
    "drupal/menu_block": {
      "Menu level off by one - GOV-4821": "custom/patches/menu_block-level.patch"
    }
  }
}
JSON

ahoy run "./vendor/bin/govcms-vet"
# Problem: There are custom composer patches. [vet-005]
#   Ideal value:
#     --{}--
#   Found value:
#     --{"drupal/menu_block":{"Menu level off by one - GOV-4821":"custom/patches/menu_block-level.patch"}}--`,
      note: "vet-005 diffs your .patches against the scaffold's empty object, so any patch at all is a finding. govcms-vet exits 1 on saas and saasplus and 0 on paas, so on PaaS it is a permanent warning rather than a blocker — and because every distribution package is pinned exactly, your hunks are written against one release and will fail to apply on the next one.",
    },
    {
      label: "Taking a Drupal core security release",
      intro:
        "Core 11.4.5 ships a security fix on a Wednesday. What you do next is completely different on a site you own, on PaaS, and on SaaS.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: core is a direct dependency and the window is yours.
composer update drupal/core-recommended \\
  drupal/core-composer-scaffold drupal/core-project-message -W

vendor/bin/drush updatedb -y
vendor/bin/drush cache:rebuild
git commit -am "Core security release."`,
      ts: `# GovCMS PaaS: core is transitive. You never name it.
ahoy run "composer why drupal/core-recommended"
# govcms/govcms 4.x-master-dev requires drupal/core-recommended (11.3.14)

ahoy run "composer update govcms/govcms -W"
git add composer.lock
git commit -m "Take the current GovCMS distribution release."

# GovCMS SaaS: there is no composer.json at all. Core arrives
# with the base image, on the platform's schedule.
grep GOVCMS_IMAGE_VERSION .docker/Dockerfile.cli
# ARG GOVCMS_IMAGE_VERSION=11.x-latest
# FROM govcms/govcms:\${GOVCMS_IMAGE_VERSION}`,
      note: "The 4.x-develop branch pins drupal/core-recommended 11.4.5; the 4.5.0.1 release tag pins 11.3.14 — always say which you mean. On SaaS the whole .docker/ directory is in the locked-files list, so the image tag is not yours to move; core lands when GovCMS rebuilds and you redeploy.",
    },
  ],
  playground: {
    intro:
      "A dependency-topology resolver. It runs the same four project requires against the distribution's pins for two offerings, classifies each one, and prints the require block you should actually have committed.",
    lang: "php",
    code: `<?php

// A slice of the 102 exact drupal/* pins the distribution owns.
$distro = [
  'drupal/webform' => '6.3.0',
  'drupal/paragraphs' => '1.23.0',
  'drupal/metatag' => '2.2.0',
  'drupal/config_split' => '2.0.2',
];

// What a Drupal developer typed out of habit, in the project root.
$wanted = [
  'drupal/webform' => '^6.3',
  'drupal/paragraphs' => '1.23.0',
  'drupal/metatag' => '^2.4',
  'drupal/views_bulk_operations' => '^4.3',
];

function lower_bound(string $constraint): string {
  return ltrim($constraint, '^~>=< ');
}

function classify(string $offering, string $package, string $constraint, array $distro): array {
  // SaaS has no composer.json and no custom/composer: nothing to declare.
  if ($offering === 'saas') {
    return ['BLOCKED ON SAAS', 'scaffold-init removed composer.*'];
  }
  // Not the distribution's package, so it is genuinely yours to add.
  if (!array_key_exists($package, $distro)) {
    return ['ALLOWED ADD', 'goes in custom/composer/composer.json'];
  }
  $pin = $distro[$package];
  $floor = lower_bound($constraint);
  // You demand a floor the distribution's exact pin cannot reach.
  if (version_compare($floor, $pin, '>')) {
    return ['CONFLICT', 'distro pins ' . $pin . ', you demand >= ' . $floor];
  }
  return ['ALREADY IN DISTRO', 'pinned ' . $pin . ' - delete the line'];
}

function report(string $offering, array $wanted, array $distro): void {
  printf("offering: %s\\n", $offering);
  printf("%-31s %-7s %-7s %-18s %s\\n", 'PACKAGE', 'WANTED', 'DISTRO', 'VERDICT', 'WHY');
  $keep = [];
  foreach ($wanted as $package => $constraint) {
    [$verdict, $why] = classify($offering, $package, $constraint, $distro);
    printf("%-31s %-7s %-7s %-18s %s\\n", $package, $constraint, $distro[$package] ?? '-', $verdict, $why);
    if ($verdict === 'ALLOWED ADD') {
      $keep[$package] = $constraint;
    }
  }
  if ($offering === 'saas') {
    printf("=> no composer file exists on saas; enablement is an allowlist question\\n");
    return;
  }
  $lines = [];
  foreach ($keep as $package => $constraint) {
    $lines[] = sprintf('    "%s": "%s"', $package, $constraint);
  }
  printf("=> custom/composer/composer.json\\n");
  printf("  \\"require\\": {\\n");
  printf("%s\\n", implode(",\\n", $lines));
  printf("  }\\n");
}

report('paas', $wanted, $distro);
printf("\\n");
report('saas', $wanted, $distro);`,
    output: `offering: paas
PACKAGE                         WANTED  DISTRO  VERDICT            WHY
drupal/webform                  ^6.3    6.3.0   ALREADY IN DISTRO  pinned 6.3.0 - delete the line
drupal/paragraphs               1.23.0  1.23.0  ALREADY IN DISTRO  pinned 1.23.0 - delete the line
drupal/metatag                  ^2.4    2.2.0   CONFLICT           distro pins 2.2.0, you demand >= 2.4
drupal/views_bulk_operations    ^4.3    -       ALLOWED ADD        goes in custom/composer/composer.json
=> custom/composer/composer.json
  "require": {
    "drupal/views_bulk_operations": "^4.3"
  }

offering: saas
PACKAGE                         WANTED  DISTRO  VERDICT            WHY
drupal/webform                  ^6.3    6.3.0   BLOCKED ON SAAS    scaffold-init removed composer.*
drupal/paragraphs               1.23.0  1.23.0  BLOCKED ON SAAS    scaffold-init removed composer.*
drupal/metatag                  ^2.4    2.2.0   BLOCKED ON SAAS    scaffold-init removed composer.*
drupal/views_bulk_operations    ^4.3    -       BLOCKED ON SAAS    scaffold-init removed composer.*
=> no composer file exists on saas; enablement is an allowlist question
`,
  },
  keyPoints: [
    "The distribution requires 109 packages, 102 of them drupal/*, and every one of those 102 is an exact version with no caret — so any constraint you write for one of them can only fight it.",
    "A scaffold project requires six packages: php, govcms/govcms-custom, govcms/govcms, govcms/scaffold-tooling, drush/drush and composer/installers. GovCMS 3.x on Drupal 10 uses composer.10.json with php ^8.1, drush ^12 and the 3.x/10.x branches.",
    "govcms/govcms-custom is a path repository at custom/composer with an empty require block. That is the only place a PaaS or SaaS+ project adds a package.",
    "On SaaS, scripts/scaffold-init.sh deletes composer.* and custom/composer at provisioning, and Dockerfile.saas copies only themes/, config and favicon.ico into a prebuilt image — dependency management does not exist on that offering.",
    "A root-level require of a distribution-owned package resolves today and blocks the next distribution release; no validator catches it, only the resolver does, at the worst possible moment.",
    "Patches belong in custom/composer/patches.json (extra.patches-file); the distribution already applies seven of its own over six packages, and any project patch is reported as [vet-005] — fatal on saas/saasplus, a standing warning on paas.",
  ],
  interview: [
    {
      q: "A client asks for Webform on a GovCMS site. Walk me through what you do.",
      a: "First I check whether the distribution already ships it, because it does — `drupal/webform` is pinned at an exact version in the distribution's `composer.json`, along with 101 other `drupal/*` packages. So this is never a Composer task; it is a question about whether the site may *enable* it, which is governed by the `managed_modules` allowlist in `module_permissions.settings`, not by what is on disk. On SaaS I would not even have a `composer.json` to edit — provisioning removes `composer.*` and `custom/composer` outright. The habit I try to build in teams is: run `composer show <package>` inside the cli container before you reach for `composer require`, because on GovCMS the answer is usually 'it is already there'.",
    },
    {
      q: "Why is `composer require drupal/paragraphs:1.23.0` in the project root a problem on PaaS, when it resolves fine?",
      a: "Because the distribution pins that package exactly too, and your root require now outranks it. Today both constraints agree, so Composer installs and CI stays green — `composer validate` passes and `govcms-vet` never reads the root `require` block. The bill arrives on the next distribution release: `composer update govcms/govcms` reports that `govcms/govcms` requires the new exact version but it conflicts with your root `composer.json` require, and you cannot take a core or security update until you delete your line. I treat a root require of any of the distribution's packages as a review blocker, and the fix is `composer remove <package> --no-update` followed by re-updating the distribution.",
    },
    {
      q: "Where do patches live on a GovCMS project, and why would you push back on patching a distribution package?",
      a: "`extra.patches-file` in the project root points at `custom/composer/patches.json`, and `extra.enable-patching` is `true`, which is also what lets the distribution's own inline `extra.patches` apply — seven patches over six packages including `tfa`, `password_policy` and `jsonapi_extras`. Your own patch goes in that file and nowhere else. The push-back is twofold: `govcms-vet` diffs `.patches` against the scaffold's empty object and reports `[vet-005]`, which is fatal on `saas`/`saasplus` and a permanent warning on `paas`; and because every distribution package is pinned to one exact version, your hunks are written against that release and will fail to apply the moment GovCMS bumps it. I would rather carry a documented workaround in the theme or a config change than own a patch against something I do not control the version of.",
    },
    {
      q: "How does a Drupal core security release actually reach a GovCMS site?",
      a: "Core is never a direct dependency of the project — `drupal/core-recommended` comes in transitively through `govcms/govcms`, which pins it exactly. On PaaS I run `composer update govcms/govcms -W` inside the cli container, commit the lock, and let the Lagoon rollout run `govcms-db-update` and `govcms-config-import`; I choose the window but not the core version. On SaaS there is no `composer.json` at all — the Dockerfile builds `FROM govcms/govcms:<major>.x-latest` and the whole `.docker/` directory is in the locked-files list, so core lands when GovCMS publishes an image and I redeploy. Worth being precise in an interview: the `4.x-develop` branch pins `drupal/core-recommended` 11.4.5 while the `4.5.0.1` tag pins 11.3.14, so say which one you mean.",
    },
  ],
  quiz: [
    {
      question:
        "You run `composer require drupal/paragraphs:1.23.0` in the root of a GovCMS PaaS project, matching the version the distribution already pins. What happens?",
      options: [
        "`govcms-vet` fails with `[vet-006]` because the root require block no longer matches the scaffold's.",
        "Composer refuses immediately, because `govcms/govcms` declares a conflict on every `drupal/*` package.",
        "It resolves and installs cleanly, and nothing objects until a later distribution release moves that pin.",
        "The package is installed into `custom/composer/vendor` instead of `web/modules/contrib`.",
      ],
      answerIndex: 2,
      explain:
        "Both constraints agree today, so Composer is happy, `composer validate` passes, and `govcms-vet` never inspects the root require block at all — the composer-facing comparisons it makes are `.repositories`, `enable-patching`, `.scripts`, `patches-file`, `custom/composer/patches.json` and the keys of `custom/composer/composer.json`, plus one filesystem check, `vet-007`, for custom module `*.info.yml` files under `web`. The conflict surfaces the next time the distribution moves that exact pin, which is when you are trying to take a security update.",
    },
    {
      question:
        "On a GovCMS PaaS project you need a contrib module the distribution does not ship. Where does it belong?",
      options: [
        "In the `require` block of `custom/composer/composer.json`, the `govcms/govcms-custom` path package.",
        "In the `require` block of the project root `composer.json`, next to `govcms/govcms`.",
        "In `custom/composer/patches.json`, which Composer reads as an overlay on the distribution.",
        "In a new `repositories` entry in the root `composer.json` pointing at your agency's private VCS host.",
      ],
      answerIndex: 0,
      explain:
        "`govcms/govcms-custom` is a path repository at `custom/composer` whose require block ships empty — that emptiness is the delta you are meant to fill. Option 4 is doubly wrong: `govcms-vet` compares `.repositories` against the scaffold's and reports `[vet-001]` if it differs. `patches.json` holds patches, not requires.",
    },
    {
      question:
        "A GovCMS SaaS site needs a contrib module that is not in the distribution. What is the Composer path forward?",
      options: [
        "Add it to `custom/composer/composer.json` and redeploy; the SaaS image merges that file at build.",
        "There is none — `scripts/scaffold-init.sh` removes `composer.*` and `custom/composer` when the type is `saas`, and `Dockerfile.saas` copies only `themes/`, `config` and `favicon.ico` into a prebuilt image.",
        "Commit it under `web/modules/contrib` so the Dockerfile picks it up with the rest of the repository.",
        "Add it to the root `composer.json`; the SaaS build runs `composer install --no-dev` like PaaS does.",
      ],
      answerIndex: 1,
      explain:
        "SaaS has no dependency management at all. Option 1 describes SaaS+, where `custom/` does survive provisioning and is copied into the image; option 4 describes PaaS, whose Dockerfile really does `COPY composer.* /app/` and run `composer install --no-dev`. On SaaS the only code that enters the image is your theme, your exported config and a favicon.",
    },
    {
      question:
        "You add one entry to `custom/composer/patches.json` on a PaaS project and push. What does the `vet` CI job do?",
      options: [
        "Nothing — `govcms-vet` only inspects `composer.json`, so a change to `patches.json` is invisible to it.",
        "It reports `[vet-005]` and still exits 0, because `govcms-vet` sets its error code to 0 for `paas`; the same finding exits 1 on `saas` and `saasplus`.",
        "It reports `[vet-004]`, because the patches-file location is what changed relative to the scaffold.",
        "It fails the pipeline on every offering, because the `vet` job is declared `allow_failure: false`.",
      ],
      answerIndex: 1,
      explain:
        "`govcms-vet` diffs your `.patches` against the scaffold's empty object and prints the `[vet-005]` problem, but its `ON_ERROR` variable is 0 for `paas` and 1 for `saas`/`saasplus`, so PaaS teams see the warning in a green job. Option 4 is the good distractor: the job genuinely is `allow_failure: false`, but that only matters if the script exits non-zero. `[vet-004]` is the separate check on `extra.patches-file`, which you did not touch.",
    },
  ],
};

export default lesson;

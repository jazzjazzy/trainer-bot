import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "composer-workflow",
  title: "Composer as the Source of Truth",
  part: "Team Workflow",
  estMinutes: 12,
  summary:
    "A Drupal site is a Composer project with a relocated docroot: composer.json and composer.lock are the only dependency truth a team ships, contrib code and vendor/ are build output, and every modification to somebody else's module belongs in a committed patch file rather than in the directory Composer owns.",

  concept: `
You already treat \`composer.lock\` as the contract between your laptop and
production. Drupal works exactly the same way — with one extra plugin and one
extra directory layout to learn.

## The four packages that make a Drupal project

\`composer create-project drupal/recommended-project\` gives you a
\`composer.json\` requiring:

- **\`drupal/core-recommended\`** — a metapackage that pins core *and* its
  transitive dependencies (Symfony components, Guzzle, Twig) to the exact
  versions core was tested against. Requiring \`drupal/core\` instead gives you
  looser constraints and a resolver free to pick a Symfony patch release core
  never saw. Prefer \`core-recommended\` on a production site.
- **\`drupal/core-composer-scaffold\`** — a Composer plugin that copies files out
  of core into your docroot on every \`install\` and \`update\`: \`index.php\`,
  \`.htaccess\`, \`update.php\`, \`robots.txt\`, \`.ht.router.php\`, and the
  *templates* \`sites/default/default.settings.php\` and \`default.services.yml\`.
  Note the word template — your real \`settings.php\` is never scaffolded and never
  overwritten.
- **\`composer/installers\`** — reads \`extra.installer-paths\` and puts a package
  of type \`drupal-module\` in \`web/modules/contrib/\`, a theme in
  \`web/themes/contrib/\`, core in \`web/core\`, Drush commands in
  \`drush/Commands/contrib/\`.
- **\`drupal/core-project-message\`** — prints the post-create-project banner. It
  does nothing else; \`composer remove\` it whenever you like.

Drupal 11's template adds \`drupal/core-recipe-unpack\` and an installer path
mapping \`type:drupal-recipe\` to \`recipes/\`. The Drupal 10 template has neither.

## What belongs in git

Commit \`composer.json\`, \`composer.lock\`, your own patches, and your custom
code. Ignore everything Composer writes: \`/vendor/\`, \`/web/core\`,
\`/web/modules/contrib\`, \`/web/themes/contrib\`, \`/web/libraries\`,
\`/drush/Commands/contrib\`. Core ships an \`example.gitignore\` via scaffold that
does exactly this — copy it to \`.gitignore\` and adjust.

The scaffolded files are the one genuine judgement call. They are regenerated
from core, so committing them creates noise on every core update; not committing
them means your deploy artefact only exists after \`composer install\` runs. Pick
one, write it down, and never let half the team do the other.

## Code is Composer's job, enabling is config's job

Two steps, two artefacts:

\`\`\`bash
composer require drupal/token   # writes composer.json + composer.lock
drush pm:install token          # writes core.extension in the active store
drush config:export             # moves that into config/sync
\`\`\`

A pull request that adds the module to \`composer.json\` but forgets
\`core.extension\` deploys dead code. One that adds \`core.extension\` but not
\`composer.json\` fatals on \`drush config:import\` in production, because the
module directory does not exist. Both halves or neither.

## Never hack contrib

Editing \`web/modules/contrib/paragraphs\` works until the next
\`composer install\`, which deletes and re-downloads the directory. Use
\`cweagans/composer-patches\`, and prefer a \`.patch\` file committed to
\`patches/\` over a drupal.org URL — issue attachments get re-rolled and the file
under a stable-looking URL can change. Set
\`composer-exit-on-patch-failure: true\` so a patch that stops applying fails the
build instead of silently deploying unpatched code.

## Updates and advisories

Constrain, do not pin: \`^10.3\` for core, \`^1.13\` for contrib. Run
\`composer update\` deliberately — scoped with \`-W\` — never in CI, and put the
\`composer.lock\` diff in the pull request where a human reads it.
\`packages.drupal.org\` publishes security advisories in Composer's format, so
\`composer audit\` covers contrib and core alongside your Symfony packages.
`,

  comparisons: [
    {
      label: "The project skeleton",
      intro:
        "Both are ordinary Composer projects. Compare what each one has to declare before a single line of application code exists — the Drupal side carries three plugins and a path map that Symfony gets for free from convention.",
      leftLang: "json",
      rightLang: "json",
      php: `// Symfony: composer create-project symfony/skeleton my-app
{
  "name": "acme/my-app",
  "type": "project",
  "require": {
    "php": ">=8.2",
    "symfony/console": "7.1.*",
    "symfony/dotenv": "7.1.*",
    "symfony/flex": "^2",
    "symfony/framework-bundle": "7.1.*",
    "symfony/runtime": "7.1.*",
    "symfony/yaml": "7.1.*"
  },
  "config": {
    "allow-plugins": {
      "php-http/discovery": true,
      "symfony/flex": true,
      "symfony/runtime": true
    },
    "sort-packages": true
  },
  "extra": {
    "symfony": {
      "allow-contrib": false,
      "require": "7.1.*"
    }
  }
}

// Docroot is public/, by convention. Nothing declares it.
// Bundles land in vendor/ and are activated by
// config/bundles.php, which Flex edits for you.`,
      ts: `// Drupal: composer create-project drupal/recommended-project my-site
{
  "name": "acme/my-site",
  "type": "project",
  "repositories": [
    { "type": "composer", "url": "https://packages.drupal.org/8" }
  ],
  "require": {
    "composer/installers": "^2.3",
    "drupal/core-composer-scaffold": "^11",
    "drupal/core-project-message": "^11",
    "drupal/core-recipe-unpack": "^11",
    "drupal/core-recommended": "^11"
  },
  "require-dev": { "drupal/core-dev": "^11" },
  "minimum-stability": "dev",
  "prefer-stable": true,
  "config": {
    "allow-plugins": {
      "composer/installers": true,
      "drupal/core-composer-scaffold": true,
      "drupal/core-project-message": true,
      "drupal/core-recipe-unpack": true,
      "dealerdirect/phpcodesniffer-composer-installer": true,
      "phpstan/extension-installer": true,
      "php-http/discovery": true
    },
    "sort-packages": true
  },
  "extra": {
    "drupal-scaffold": { "locations": { "web-root": "web/" } },
    "installer-paths": {
      "web/core": ["type:drupal-core"],
      "web/libraries/{$name}": ["type:drupal-library"],
      "web/modules/contrib/{$name}": ["type:drupal-module"],
      "web/themes/contrib/{$name}": ["type:drupal-theme"],
      "web/profiles/contrib/{$name}": ["type:drupal-profile"],
      "drush/Commands/contrib/{$name}": ["type:drupal-drush"],
      "web/modules/custom/{$name}": ["type:drupal-custom-module"],
      "web/themes/custom/{$name}": ["type:drupal-custom-theme"],
      "recipes/{$name}": ["type:drupal-recipe"]
    }
  }
}`,
      note:
        "minimum-stability: dev with prefer-stable: true is deliberate, not sloppiness — many contrib modules only ever publish alpha/beta/rc releases, so a strict stable-only project cannot install them. The Drupal 10 template is the same file minus drupal/core-recipe-unpack and the recipes path; everything else is identical.",
    },
    {
      label: "What the repository actually contains",
      intro:
        "The instinct transfers unchanged: commit the manifest and the lock, ignore the build output. Drupal just has more directories that are build output, and one category Symfony has no equivalent for.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony .gitignore (the Flex-generated one)
/vendor/
/var/
/.env.local
/.env.*.local
/public/bundles/

# Committed: composer.json, composer.lock, symfony.lock,
# config/**, src/**, migrations/**, .env (defaults only).
#
# symfony.lock records which Flex recipes were applied,
# so a teammate's composer install reproduces the same
# config/packages/*.yaml scaffolding you got.

git status --short
#  M composer.json
#  M composer.lock
#  M symfony.lock
#  A config/packages/messenger.yaml`,
      ts: `# Drupal .gitignore (start from core's example.gitignore)
/vendor/
/web/core/
/web/modules/contrib/
/web/themes/contrib/
/web/profiles/contrib/
/web/libraries/
/drush/Commands/contrib/
/web/sites/*/settings.php
/web/sites/*/settings.local.php
/web/sites/*/files/
/web/sites/*/private/

# Committed: composer.json, composer.lock, patches/**,
# config/sync/**, web/modules/custom/**, web/themes/custom/**.
#
# Judgement call: the scaffolded files (web/index.php,
# web/.htaccess, web/robots.txt, web/update.php). Commit
# them for a self-contained artefact, or ignore them and
# rely on composer install. Decide once, as a team.

git status --short
#  M composer.json
#  M composer.lock
#  M config/sync/core.extension.yml
#  A config/sync/token.settings.yml`,
      note:
        "The Drupal-only trap: config/sync is versioned application state, not build output, and it must move in the same commit as the composer.json change that made it valid. Also note settings.php is git-ignored while default.settings.php is scaffolded — the scaffold plugin will never clobber a settings.php you wrote.",
    },
    {
      label: "Changing code you do not own",
      intro:
        "Someone's module has a bug, the fix is in an unmerged issue, and you need it live on Friday. Both ecosystems refuse to let you edit vendor/ — the question is what you commit instead.",
      leftLang: "json",
      rightLang: "json",
      php: `// Symfony option A: fork and point Composer at the fork.
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/acme/some-bundle"
    }
  ],
  "require": {
    "acme/some-bundle": "dev-fix-null-deref as 3.4.2"
  }
}

// Cost: you now own a fork. Rebasing it onto each
// upstream release is a standing chore, and the diff
// that matters is invisible in your repository.

// Symfony option B: the same patches plugin. Nothing
// about cweagans/composer-patches is Drupal-specific.
{
  "require": { "cweagans/composer-patches": "^1.7" },
  "extra": {
    "patches": {
      "acme/some-bundle": {
        "Fix null deref in the retry middleware":
          "patches/some-bundle-null-deref.patch"
      }
    }
  }
}`,
      ts: `// Drupal: patches are the default answer, not the fallback.
{
  "require": {
    "cweagans/composer-patches": "^1.7",
    "drupal/paragraphs": "^1.17"
  },
  "extra": {
    "composer-exit-on-patch-failure": true,
    "patchLevel": { "drupal/core": "-p2" },
    "patches": {
      "drupal/paragraphs": {
        "3090200: widget summary ignores field overrides":
          "patches/paragraphs-3090200-widget-summary.patch"
      },
      "drupal/core": {
        "3312754: config import fails on missing dependency":
          "patches/core-3312754-config-import.patch"
      }
    }
  }
}

// Rules the team enforces in review:
//   1. Local file under patches/, never a drupal.org URL.
//      Issue attachments get re-rolled; your build is not
//      allowed to change because someone updated a ticket.
//   2. The key is the issue number and a summary, so the
//      next person can check whether it landed upstream.
//   3. composer-exit-on-patch-failure: true. Without it a
//      patch that stops applying is merely a warning, and
//      you deploy unpatched code that passed CI.`,
      note:
        "cweagans/composer-patches 2.0 went stable in late 2025 and moves patch definitions into an optional patches.json with a patches.lock.json plus composer patches-relock / patches-repatch commands. Most Drupal projects are still on 1.x with extra.patches — check which major you are on before copying a snippet off the internet.",
    },
    {
      label: "Adding, updating, auditing",
      intro:
        "The weekly maintenance loop for the four-person team. The commands rhyme; the difference is that Drupal splits 'the code is present' from 'the feature is switched on', and the second half lives in config.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Add a dependency. Flex writes config/packages/*.yaml
# for you and records the recipe in symfony.lock.
composer require symfony/messenger
git add composer.json composer.lock symfony.lock config/
git commit -m "Add Messenger"

# Update deliberately, scoped, on a branch.
composer update "symfony/*" --with-all-dependencies
git diff --stat composer.lock
bin/console lint:container
vendor/bin/phpunit

# Security.
composer audit
composer audit --format=json | jq '.advisories | keys'
# CI gate:
composer audit --no-dev || exit 1

# CI never resolves; it installs what the lock says.
composer install --no-dev --optimize-autoloader`,
      ts: `# Add a dependency: two artefacts, one pull request.
composer require drupal/token           # code
drush pm:install token                  # 'en' is the alias
drush config:export                     # core.extension + settings
git add composer.json composer.lock config/sync
git commit -m "Add Token module"

# Update deliberately, scoped, on a branch.
composer update drupal/core-* -W        # -W = --with-all-dependencies
git diff --stat composer.lock
drush updatedb --yes                    # hook_update_N from the new code
drush config:export                     # did an update rewrite config?
git diff --stat config/sync

# Security. packages.drupal.org publishes advisories in
# Composer's format, so contrib is covered here too.
composer audit
composer outdated "drupal/*" --direct

# CI never resolves; it installs what the lock says.
composer install --no-dev --optimize-autoloader`,
      note:
        "The step with no Symfony analogue is 'drush config:export' after 'drush updatedb': a core or contrib update can run an update hook that rewrites active config, and if you do not export it, the next person's export picks up your upgrade as if it were their change. Note also that recent Drush releases dropped the old pm:security command — composer audit is the supported check.",
    },
  ],

  playground: {
    intro:
      "The reviewer's job on a dependency pull request, in code: read the lock diff, notice which patched packages moved, and check the result against known advisories. Predict which line blocks the merge before you run it.",
    lang: "php",
    code: `<?php
declare(strict_types=1);

// A composer.lock diff, reduced to what a reviewer actually reads.
// No Composer, no Drupal - just two name => version maps.

$before = [
  'drupal/core-recommended' => '10.3.6',
  'drupal/devel'            => '5.3.0',
  'drupal/paragraphs'       => '1.17.0',
  'drupal/pathauto'         => '1.12.0',
  'drupal/redirect'         => '1.9.0',
  'drupal/token'            => '1.13.0',
  'guzzlehttp/guzzle'       => '7.8.1',
  'symfony/http-kernel'     => 'v6.4.11',
];

$after = [
  'drupal/config_split'     => '2.0.1',
  'drupal/core-recommended' => '10.3.10',
  'drupal/paragraphs'       => '1.17.0',
  'drupal/pathauto'         => '1.13.0',
  'drupal/redirect'         => '1.9.0',
  'drupal/token'            => '1.15.0',
  'guzzlehttp/guzzle'       => '7.9.2',
  'symfony/http-kernel'     => 'v6.4.13',
];

// extra.patches in composer.json: package => local patch file.
$patches = [
  'drupal/paragraphs' => 'patches/paragraphs-3090200-widget-summary.patch',
  'drupal/token'      => 'patches/token-3312754-node-author.patch',
];

// What "composer audit" knows: package => [first fixed version, advisory id].
$advisories = [
  'drupal/pathauto' => ['1.13.0', 'SA-CONTRIB-2025-014'],
  'drupal/redirect' => ['1.10.0', 'SA-CONTRIB-2025-021'],
];

/** Turn "v6.4.11" into [6, 4, 11] so versions compare numerically. */
function parts(string $v): array {
  $nums = array_map('intval', explode('.', ltrim($v, 'v')));
  return array_pad(array_slice($nums, 0, 3), 3, 0);
}

function bumpKind(string $from, string $to): string {
  [$a, $b, $c] = parts($from);
  [$x, $y, $z] = parts($to);
  if ($a !== $x) {
    return 'MAJOR';
  }
  if ($b !== $y) {
    return 'minor';
  }
  return ($c !== $z) ? 'patch' : 'same';
}

function isOlderThan(string $v, string $fixed): bool {
  return parts($v) < parts($fixed);
}

echo "=== composer.lock diff ===\\n";
$churn = 0;
foreach (array_unique(array_merge(array_keys($before), array_keys($after))) as $name) {
  $from = $before[$name] ?? NULL;
  $to = $after[$name] ?? NULL;
  if ($from === NULL) {
    printf("  + %-26s %s\\n", $name, $to);
    $churn += 1;
  }
  elseif ($to === NULL) {
    printf("  - %-26s %s (removed)\\n", $name, $from);
  }
  elseif ($from !== $to) {
    $kind = bumpKind($from, $to);
    printf("  ~ %-26s %-8s -> %-8s [%s]\\n", $name, $from, $to, $kind);
    $churn += ($kind === 'MAJOR') ? 5 : (($kind === 'minor') ? 2 : 1);
  }
}

echo "\\n=== patches to re-verify ===\\n";
$touched = FALSE;
foreach ($patches as $name => $file) {
  if (!isset($after[$name])) {
    printf("  DROP  %s is gone - delete %s and its extra.patches entry\\n", $name, $file);
    $touched = TRUE;
    continue;
  }
  if (($before[$name] ?? NULL) !== $after[$name]) {
    printf("  CHECK %s moved to %s - confirm %s still applies\\n",
      $name, $after[$name], $file);
    $touched = TRUE;
  }
}
if (!$touched) {
  echo "  none\\n";
}

echo "\\n=== composer audit (after) ===\\n";
$open = 0;
foreach ($advisories as $name => [$fixed, $id]) {
  if (!isset($after[$name])) {
    continue;
  }
  if (isOlderThan($after[$name], $fixed)) {
    printf("  VULNERABLE %-20s %-8s <  %-8s %s\\n", $name, $after[$name], $fixed, $id);
    $open++;
  }
  else {
    printf("  ok         %-20s %-8s >= %-8s %s resolved\\n", $name, $after[$name], $fixed, $id);
  }
}
printf("  %d unresolved advisor%s\\n", $open, $open === 1 ? 'y' : 'ies');

echo "\\n=== review verdict ===\\n";
printf("  churn score %d -> %s\\n", $churn,
  $churn >= 12 ? 'split this PR' : 'reviewable in one sitting');
printf("  merge blocked: %s\\n", $open > 0 ? 'yes (open advisory)' : 'no');
`,
    output: `=== composer.lock diff ===
  ~ drupal/core-recommended    10.3.6   -> 10.3.10  [patch]
  - drupal/devel               5.3.0 (removed)
  ~ drupal/pathauto            1.12.0   -> 1.13.0   [minor]
  ~ drupal/token               1.13.0   -> 1.15.0   [minor]
  ~ guzzlehttp/guzzle          7.8.1    -> 7.9.2    [minor]
  ~ symfony/http-kernel        v6.4.11  -> v6.4.13  [patch]
  + drupal/config_split        2.0.1

=== patches to re-verify ===
  CHECK drupal/token moved to 1.15.0 - confirm patches/token-3312754-node-author.patch still applies

=== composer audit (after) ===
  ok         drupal/pathauto      1.13.0   >= 1.13.0   SA-CONTRIB-2025-014 resolved
  VULNERABLE drupal/redirect      1.9.0    <  1.10.0   SA-CONTRIB-2025-021
  1 unresolved advisory

=== review verdict ===
  churn score 9 -> reviewable in one sitting
  merge blocked: yes (open advisory)
`,
  },

  keyPoints: [
    "A Drupal site is an ordinary Composer project plus three plugins: drupal/core-composer-scaffold (writes index.php, .htaccess, update.php, robots.txt and default.settings.php into the docroot), composer/installers (reads extra.installer-paths to place contrib under web/modules/contrib), and drupal/core-project-message (a banner you can remove).",
    "Require drupal/core-recommended rather than drupal/core on a production site: it pins core's transitive dependencies to the exact versions core was tested against, instead of leaving the resolver free to pick a Symfony or Guzzle release core never saw.",
    "Commit composer.json, composer.lock, patches/ and config/sync; git-ignore /vendor, /web/core, /web/modules/contrib, /web/themes/contrib, /web/libraries and /drush/Commands/contrib. Whether the scaffolded files are committed is a team decision — make it once, in writing.",
    "Adding a module is two artefacts: composer require puts the code on disk, drush pm:install plus drush config:export records that it is enabled in core.extension. A pull request with only one half either deploys dead code or fatals on config import.",
    "Never edit web/modules/contrib in place — the next composer install deletes it. Use cweagans/composer-patches with a .patch file committed under patches/ rather than a drupal.org URL, and set composer-exit-on-patch-failure so a stale patch fails the build.",
    "Constrain with carets (^10.3, ^1.13) and run composer update deliberately with -W on a branch, never in CI; put the composer.lock diff in the pull request, and gate merges on composer audit, which covers Drupal packages because packages.drupal.org publishes advisories in Composer's format.",
  ],

  interview: [
    {
      q: "What does drupal/core-composer-scaffold actually do, and why does it matter for deployment?",
      a: `It is a Composer plugin that runs on every \`install\` and \`update\` and copies a set of files out of \`drupal/core\` into your document root — \`index.php\`, \`.htaccess\`, \`update.php\`, \`robots.txt\`, \`.ht.router.php\`, and the templates \`sites/default/default.settings.php\` and \`default.services.yml\`. Those files are generated output, not source: if you edit \`web/index.php\` by hand, the next \`composer install\` overwrites it. Your actual \`settings.php\` is safe because only \`default.settings.php\` is scaffolded. The deployment consequence is that a build artefact is only complete after \`composer install\` has run, so a pipeline that restores a cached \`vendor/\` directory and skips the install ends up with a docroot missing its front controller. If you genuinely need a customised \`robots.txt\` or \`.htaccess\`, override it through \`extra.drupal-scaffold.file-mapping\` rather than editing the generated file.`,
    },
    {
      q: "A teammate fixed a bug by editing web/modules/contrib/paragraphs directly. Walk me through what you would say and what you would do instead.",
      a: `The change is already gone the next time anyone runs \`composer install\`, because \`composer/installers\` deletes and re-downloads that directory — so it will work on their laptop and silently vanish in CI and production. The fix is \`cweagans/composer-patches\`: generate a \`.patch\` from their diff, commit it under \`patches/\`, and reference it from \`extra.patches\` keyed by \`drupal/paragraphs\` with the drupal.org issue number and a one-line summary as the description. I would insist on a local file rather than a drupal.org issue URL, because attachments get re-rolled and a build whose contents change when someone updates a ticket is not reproducible. I would also set \`composer-exit-on-patch-failure: true\` — by default a patch that no longer applies is just a warning, which means you can ship unpatched code that passed CI. Finally, the patch description should point at the upstream issue so we can drop it when the fix lands in a release.`,
    },
    {
      q: "Why is 'composer require drupal/token' not enough to add a module to a site?",
      a: `Because Composer only puts the code on disk. Whether a module is *enabled* is configuration — it lives in the \`module\` list inside \`core.extension\`, in the active config store — so you also need \`drush pm:install token\` (\`en\` is the alias) and then \`drush config:export\` to move that into \`config/sync\`. This is Drupal's version of Symfony's \`config/bundles.php\`, except Flex edits that file for you and Drupal makes you export it. The failure modes are symmetrical: a pull request with the \`composer.json\` change but no \`core.extension\` change ships code nobody runs, and one with the \`core.extension\` change but no \`composer.json\` change fatals during \`drush config:import\` on production because the module directory does not exist. Reviewers should treat the two files as a pair.`,
    },
    {
      q: "How does your team handle Drupal security releases in a Composer workflow?",
      a: `\`composer audit\` is the primary gate, and it covers contrib as well as core because \`packages.drupal.org\` publishes security advisories in Composer's advisory format alongside \`packagist.org\`. We run it in CI on every pull request and on a nightly scheduled job, so a new advisory turns a green branch red without anyone pushing. For the actual update we branch, run a scoped \`composer update drupal/core-* -W\` or \`composer update drupal/somemodule\`, read the \`composer.lock\` diff, then \`drush updatedb\` and \`drush config:export\` in case an update hook rewrote config. Note that recent Drush releases removed the old \`pm:security\` command, so do not build tooling around it — \`composer audit\` plus the Update Status data on drupal.org is the supported path. Patches are the thing to watch: any package whose version moved needs its patch re-verified, which is exactly why \`composer-exit-on-patch-failure\` should be on.`,
    },
  ],

  quiz: [
    {
      question:
        "You require drupal/core instead of drupal/core-recommended in a production project. What is the practical risk?",
      options: [
        "Core will not install at all without the core-recommended metapackage",
        "Composer resolves core's transitive dependencies (Symfony, Guzzle, Twig) freely, so you can end up on component versions core was never tested against",
        "The scaffold plugin stops writing index.php and .htaccess",
        "Contrib modules are placed in web/modules instead of web/modules/contrib",
      ],
      answerIndex: 1,
      explain:
        "drupal/core-recommended is a metapackage whose only job is to pin core's dependencies to the exact versions core's own test runs used. Requiring drupal/core works fine, but leaves those constraints loose, so a resolver satisfying some other package can pull a Symfony or Guzzle release core has never been tested with. Scaffolding and installer paths are controlled by drupal/core-composer-scaffold and composer/installers, which are separate requirements.",
    },
    {
      question:
        "Which of these should be committed to git in a standard drupal/recommended-project layout?",
      options: [
        "web/modules/contrib/token — so the deploy does not depend on the network",
        "vendor/ — so composer install can be skipped in production",
        "composer.lock and patches/*.patch",
        "web/sites/default/settings.php, including the database credentials",
      ],
      answerIndex: 2,
      explain:
        "composer.lock is the dependency contract — it is the whole point of the workflow — and patch files are your own source, not build output, so both are committed. Contrib code and vendor/ are regenerated by composer install and are deleted and re-downloaded whenever versions change. settings.php is git-ignored because it carries per-environment credentials; only core's scaffolded default.settings.php template lives in the codebase.",
    },
    {
      question:
        "A patch listed in extra.patches no longer applies after a contrib update. With a default cweagans/composer-patches 1.x configuration, what happens?",
      options: [
        "composer install aborts with a non-zero exit code",
        "The failure is reported as a warning and the install continues, so unpatched code gets deployed",
        "Composer automatically falls back to the previous package version",
        "The patch is re-rolled against the new version automatically",
      ],
      answerIndex: 1,
      explain:
        "By default failed patches are skipped with a warning, which is exactly how teams end up deploying code they believe is patched. Setting \"composer-exit-on-patch-failure\": true in the extra section (or exporting COMPOSER_EXIT_ON_PATCH_FAILURE=1) turns that warning into a hard failure, so CI stops instead of building a subtly wrong artefact.",
    },
    {
      question:
        "A pull request adds 'drupal/token' to composer.json and composer.lock but leaves config/sync untouched. What happens when it deploys?",
      options: [
        "drush config:import fails because core.extension references a missing module",
        "The module code is installed but never enabled, so nothing changes on the site",
        "Drupal auto-enables any module found in web/modules/contrib",
        "composer install fails because the module is not listed in core.extension",
      ],
      answerIndex: 1,
      explain:
        "Composer's job ends at putting the code on disk. Whether a module is enabled is recorded in core.extension in the config store, so without a matching config export the module sits in web/modules/contrib doing nothing. The mirror-image mistake — exporting core.extension with the module enabled but forgetting the composer.json change — is the one that fatals on drush config:import in production, because the module directory does not exist.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "security-updates",
  title: "Security Updates & Patch Cadence",
  part: "Safety & Operations",
  estMinutes: 13,
  summary:
    "How Drupal's advisory machinery works — coverage rules, the Wednesday windows, risk scores — and how a team of four turns patching into a boring monthly habit that can still compress into a same-day hotfix when a 25/25 lands.",

  concept: `
Symfony taught you that "keeping up with security" means \`composer audit\` in CI and
a monthly patch bump. Drupal needs the same reflex, but the surface is different:
your \`composer.lock\` has forty contributed projects in it, each maintained by
someone with a day job, and the rules about which of them are even *eligible* for a
security advisory are not obvious.

## Coverage is a property of a release, not a project

The security team issues advisories only for **stable releases** of projects that
are opted into coverage. No advisory is ever issued for an alpha, beta, RC, dev
snapshot or sandbox project. So \`drupal/some_module:1.0.0-beta3\` is not "no known
vulnerabilities" — it is outside the system entirely. Projects created before March
2017 are opted in automatically; newer ones need a vetted maintainer, which is why
the "not covered by Drupal's security advisory policy" banner exists on some project
pages. Treat that banner as a procurement decision, not a detail.

Core has its own version of the rule: a minor keeps security coverage until two
further minors ship. When 11.4.0 was released, 11.2.x lost coverage. Sitting two
minors back is the same as running unpatched.

## The calendar you can plan around

Core security releases land in a window on the **third Wednesday** of the month
(opening 1200 America/New_York); bugfix-only patch releases use the first-Wednesday
window. Contributed advisories go out on Wednesdays too. Occasionally the security
team publishes a **PSA on the Monday before**, warning that Wednesday's release is
highly critical — that is your cue to clear the pipeline, verify a deploy still
works end to end, and put two people on standby.

## Risk scores tell you the SLA

Every advisory carries a vector like
\`AC:None/A:None/CI:All/II:All/E:Exploit/TD:All\` — access complexity,
authentication, confidentiality impact, integrity impact, known exploit, target
distribution. They sum to a score out of 25: 0–4 Not critical, 5–9 Less critical,
10–14 Moderately critical, 15–19 Critical, 20–25 Highly critical. Map the bands to
response times **once**, in writing, so nobody argues about urgency at 5pm.

## What you actually run

\`packages.drupal.org/8\` implements Composer's security-advisories API, so
\`composer audit\` covers core *and* contrib with one command. Drush is not the tool
here — current Drush ships only \`pm:install\`, \`pm:list\` and \`pm:uninstall\`; the old
\`pm:security\` command is gone.

In-site, the core **Update Status** module (machine name \`update\`) renders
\`/admin/reports/updates\` behind \`administer site configuration\`, and its
\`update.settings\` config is exportable like anything else:

\`\`\`yaml
check:
  disabled_extensions: true
  interval_days: 1
notification:
  emails:
    - dev-team@example.com
  threshold: security
\`\`\`

\`disabled_extensions: true\` matters — an uninstalled module is still code on disk
and still reachable if someone finds a route into it. Core's Package Manager module
is experimental and hidden, and \`authorize.php\` (the old update-over-FTP path) is
deprecated in 11.2 for removal in 12: build the process around Composer, not the UI.
`,

  comparisons: [
    {
      label: "Finding out you are exposed",
      intro:
        "Both ecosystems answer 'does my lock file contain something with a published advisory?' with the same command. The difference is where the advisory data comes from, and how much of your dependency tree is community-maintained.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: advisories come from the FriendsOfPHP/security-advisories
# database, which Packagist exposes through Composer's audit API.
composer audit --locked --no-dev

# The Symfony CLI wraps the same data set.
symfony check:security

# Most of your tree is symfony/*, doctrine/* and a handful of vendors
# with paid maintainers. A dozen advisories a year, mostly core.
composer audit --locked --format=json > audit.json`,
      ts: `# packages.drupal.org/8 implements Composer's security-advisories API
# (packages.json advertises: "security-advisories": { "metadata": true,
# "api-url": ".../security-advisories" }), so ONE command covers
# drupal/core and all 40 contrib projects.
composer audit --locked --no-dev

# Abandonment is a policy knob, not just a warning line.
composer audit --locked --abandoned=fail

# Different question: what is merely out of date, advisory or not?
composer outdated --direct "drupal/*"

# Do NOT reach for Drush: pm:security no longer exists.
# Current Drush pm: commands are install, list, uninstall.`,
      note: "Same command, far bigger blast radius: in Drupal most of the audited surface is contributed code, so 'no advisories' and 'well maintained' are two separate checks.",
    },
    {
      label: "Making the check routine instead of heroic",
      intro:
        "Nobody remembers to audit. Both sides solve it by putting the check on a timer and routing the result to a human — Symfony via a scheduled pipeline, Drupal via the same pipeline plus the site's own Update Status notifications.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .gitlab-ci.yml — Symfony: one scheduled job, one owner.
security:audit:
  stage: test
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
    - if: '$CI_COMMIT_BRANCH == "main"'
  script:
    - composer audit --locked --no-dev
  # Non-zero exit on any advisory. The schedule runs 07:00 daily;
  # a red pipeline in the morning is the whole notification system.`,
      ts: `# Same scheduled job, PLUS the site tells you itself.
# config/sync/update.settings.yml — exported, reviewed, deployed.
check:
  disabled_extensions: true   # uninstalled modules are still code on disk
  interval_days: 1
fetch:
  url: ''
  max_attempts: 2
  timeout: 30
notification:
  emails:
    - dev-team@example.com
  threshold: security         # 'all' or 'security'; 'all' trains people to ignore it

# Report: /admin/reports/updates  (administer site configuration)
# Manual refresh: /admin/reports/updates/check`,
      note: "threshold: security is the important line — with 'all', the weekly mail is noise and the team stops reading it, which is worse than no mail at all.",
    },
    {
      label: "Emergency: a 25/25 core advisory drops on Wednesday",
      intro:
        "The highly-critical path is the normal pipeline with the slow, optional parts removed. Write down in advance which stages you are allowed to skip, because deciding under pressure is how people skip the wrong one.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony hotfix: branch off the tag that is in production,
# not off main (main may contain half-finished work).
git checkout -b hotfix/sa-2025-001 v2.14.3
composer update symfony/http-kernel --with-dependencies
git commit -am "Security: symfony/http-kernel 6.4.11"

# Skip: full E2E suite, staging soak, changelog.
# Do NOT skip: unit+functional tests, the deploy, the rollback plan.
vendor/bin/phpunit --testsuite=unit,functional
bin/deploy prod && git tag v2.14.4`,
      ts: `# Drupal hotfix: same shape. Branch off the deployed tag.
git checkout -b hotfix/sa-core-2025-001 v2.14.3
composer update "drupal/core-*" --with-all-dependencies
composer audit --locked            # confirm the advisory is cleared

# Patch releases (10.3.9 -> 10.3.14) carry no API breaks and no new
# config, so the risk here is small and the pipeline can be short.
drush --yes deploy                 # updatedb, cim, cache:rebuild, deploy:hook

# Skip: staging soak, visual regression, the release notes.
# Do NOT skip: the database backup, config:status after import,
# and a smoke test of login + one authenticated write.
drush config:status --format=list  # must print nothing`,
      note: "A core PATCH bump is safe to rush; a core MINOR bump (10.3 -> 10.4) can drop deprecated APIs and add config, so it never belongs in an emergency window.",
    },
    {
      label: "The module nobody maintains any more",
      intro:
        "Abandonment is the failure mode you can see coming. Symfony usually offers a maintained replacement bundle; in Drupal you more often keep the module and take on the maintenance yourself, which composer.json has to record.",
      leftLang: "js",
      rightLang: "js",
      php: `// Symfony: composer flags it, you replace it.
// $ composer audit --locked --abandoned=fail
// Package acme/legacy-bundle is abandoned, use symfony/mailer instead
{
  "config": {
    "audit": {
      "abandoned": "fail"
    }
  }
}
// Options are usually: swap the bundle, or inline the ~200 lines
// you actually used. The framework rarely leaves you stranded.`,
      ts: `// Drupal: four options — adopt, patch, replace, fork.
// (2) Patch: keep the release, carry the fix from the issue queue.
{
  "require": {
    "cweagans/composer-patches": "^1.7",
    "drupal/orphaned_module": "^2.1"
  },
  "extra": {
    "patches": {
      "drupal/orphaned_module": {
        "Issue #3401234: PHP 8.3 compatibility":
          "https://www.drupal.org/files/issues/3401234-7.patch"
      }
    }
  }
}
// (4) Fork: your own repo, resolved BEFORE packages.drupal.org.
{
  "repositories": [
    { "type": "vcs", "url": "git@github.com:acme/orphaned_module.git" },
    { "type": "composer", "url": "https://packages.drupal.org/8" }
  ]
}`,
      note: "Patches are cheap until the module dies for real: every core minor re-rolls them. Decide adopt-vs-replace while it is still a chore, not while it is an outage.",
    },
  ],

  playground: {
    intro:
      "Advisory triage without the guesswork: score each advisory from its published vector, map the score to a response SLA, flag anything running on a release that can never receive an advisory, then print the work order. This is the spreadsheet your team argues about, made deterministic.",
    lang: "php",
    code: `<?php

// Drupal's risk score = the sum of six vector metrics, max 25.
$points = [
  'AC' => ['None' => 4, 'Basic' => 2, 'Complex' => 1],
  'A'  => ['None' => 4, 'User' => 2, 'Admin' => 1],
  'CI' => ['All' => 5, 'Some' => 3, 'None' => 0],
  'II' => ['All' => 5, 'Some' => 3, 'None' => 0],
  'E'  => ['Exploit' => 4, 'Proof' => 2, 'Theoretical' => 1],
  'TD' => ['All' => 3, 'Default' => 2, 'Uncommon' => 1],
];

function riskScore(string $vector, array $points): int {
    $total = 0;
    foreach (explode('/', $vector) as $part) {
        [$metric, $value] = explode(':', $part);
        $total += $points[$metric][$value];
    }
    return $total;
}

function riskLevel(int $score): string {
    return match (true) {
        $score >= 20 => 'Highly critical',
        $score >= 15 => 'Critical',
        $score >= 10 => 'Moderately critical',
        $score >= 5  => 'Less critical',
        default      => 'Not critical',
    };
}

// The team's written policy, in code so nobody relitigates it at 5pm.
function slaFor(int $score): string {
    return match (true) {
        $score >= 20 => 'EMERGENCY - hotfix off the prod tag, deploy today',
        $score >= 15 => 'within 24h - normal pipeline, expedited review',
        $score >= 10 => 'this week - next scheduled deploy window',
        default      => 'routine - fold into the monthly update batch',
    };
}

$installed = [
  'drupal/core' => '10.3.9',
  'drupal/webform' => '6.2.2',
  'drupal/pathauto' => '1.12',
  'drupal/legacy_gallery' => '1.0.0-beta3',
];

$advisories = [
  ['id' => 'SA-CORE-2025-001', 'package' => 'drupal/core', 'fixed' => '10.3.14',
   'vector' => 'AC:None/A:None/CI:All/II:All/E:Exploit/TD:All'],
  ['id' => 'SA-CONTRIB-2025-042', 'package' => 'drupal/webform', 'fixed' => '6.2.9',
   'vector' => 'AC:Basic/A:User/CI:Some/II:None/E:Theoretical/TD:Default'],
  ['id' => 'SA-CONTRIB-2025-043', 'package' => 'drupal/pathauto', 'fixed' => '1.13',
   'vector' => 'AC:Complex/A:Admin/CI:None/II:Some/E:Proof/TD:Uncommon'],
];

echo "composer audit (simulated): 3 advisories match this lock file\\n";
echo str_repeat('=', 66), "\\n";

$plan = [];
foreach ($advisories as $sa) {
    $score = riskScore($sa['vector'], $points);
    $plan[] = ['id' => $sa['id'], 'score' => $score, 'sla' => slaFor($score)];
    printf("%-20s %-16s %s -> %s\\n", $sa['id'], $sa['package'], $installed[$sa['package']], $sa['fixed']);
    printf("  vector %s\\n", $sa['vector']);
    printf("  score  %2d/25  (%s)\\n", $score, riskLevel($score));
    printf("  action %s\\n", slaFor($score));
}

echo str_repeat('-', 66), "\\n";

// Only stable releases are covered by the advisory policy at all.
foreach ($installed as $package => $version) {
    if (preg_match('/-(alpha|beta|rc|dev)/', $version) === 1) {
        printf("WARNING %s is on %s: alpha/beta/rc/dev releases are\\n", $package, $version);
        echo "        NOT covered by the security advisory policy - no SA is ever issued.\\n";
    }
}

usort($plan, fn(array $a, array $b): int => $b['score'] <=> $a['score']);
echo "\\nWork order:\\n";
foreach ($plan as $i => $item) {
    printf("  %d. %s (%d) %s\\n", $i + 1, $item['id'], $item['score'], $item['sla']);
}
`,
    output: `composer audit (simulated): 3 advisories match this lock file
==================================================================
SA-CORE-2025-001     drupal/core      10.3.9 -> 10.3.14
  vector AC:None/A:None/CI:All/II:All/E:Exploit/TD:All
  score  25/25  (Highly critical)
  action EMERGENCY - hotfix off the prod tag, deploy today
SA-CONTRIB-2025-042  drupal/webform   6.2.2 -> 6.2.9
  vector AC:Basic/A:User/CI:Some/II:None/E:Theoretical/TD:Default
  score  10/25  (Moderately critical)
  action this week - next scheduled deploy window
SA-CONTRIB-2025-043  drupal/pathauto  1.12 -> 1.13
  vector AC:Complex/A:Admin/CI:None/II:Some/E:Proof/TD:Uncommon
  score   8/25  (Less critical)
  action routine - fold into the monthly update batch
------------------------------------------------------------------
WARNING drupal/legacy_gallery is on 1.0.0-beta3: alpha/beta/rc/dev releases are
        NOT covered by the security advisory policy - no SA is ever issued.

Work order:
  1. SA-CORE-2025-001 (25) EMERGENCY - hotfix off the prod tag, deploy today
  2. SA-CONTRIB-2025-042 (10) this week - next scheduled deploy window
  3. SA-CONTRIB-2025-043 (8) routine - fold into the monthly update batch
`,
  },

  keyPoints: [
    "Advisories only exist for stable releases of covered projects — an alpha/beta/RC/dev version or an uncovered project will never produce one, so 'composer audit is clean' says nothing about it.",
    "Core security releases use the third-Wednesday window (bugfix releases use the first Wednesday), a minor loses coverage once two further minors ship, and a Monday PSA is the warning to clear your pipeline.",
    "Risk vectors (AC/A/CI/II/E/TD) sum to a score out of 25 across five bands; map the bands to response times in writing so urgency is a lookup, not an argument.",
    "composer audit is the CLI tool — packages.drupal.org serves Composer's security-advisories API, and Drush's old pm:security command no longer exists.",
    "Update Status (module `update`) reports at /admin/reports/updates; export update.settings with notification.threshold: security so the mail stays signal.",
    "Core patch bumps are emergency-safe; core minor bumps and contrib major bumps are not — and spot module abandonment early, while adopt/patch/replace/fork is still a planning decision.",
  ],

  interview: [
    {
      q: "How do you keep a Drupal site patched, and how is that different from what you did on Symfony?",
      a: "The daily mechanic is identical: a scheduled CI job runs `composer audit --locked --no-dev` and a red pipeline is the alert. What differs is the surface area — a Symfony tree is mostly vendor-maintained packages, while a Drupal tree is core plus thirty or forty contributed projects with volunteer maintainers, so I also audit *maintenance health*, not just advisories. Drupal helps by publishing on a schedule: core security releases go out in a third-Wednesday window, so patching is a booked monthly slot rather than a reaction. I also enable the core Update Status module with `notification.threshold: security` and export that config, so the site itself nags us if CI ever stops running. And I'd note that Drush no longer has `pm:security` — `composer audit` is the answer now.",
    },
    {
      q: "A highly critical core advisory drops at 5pm. Walk me through the next two hours, and what you allow yourself to skip.",
      a: "Branch off the tag that is actually in production, not off main, because main may contain half-finished work. Then `composer update \"drupal/core-*\" --with-all-dependencies`, re-run `composer audit` to confirm the advisory clears, and read the release notes to check it is a patch bump and not a minor. Take a fresh database backup, run the pipeline, deploy, and finish with `drush deploy` followed by `drush config:status` — which must print nothing. What I skip is the slow, optional stuff: the staging soak, visual regression, release notes, the changelog. What I never skip is the backup, the automated tests, a smoke test of login plus one authenticated write, and a rehearsed rollback. Skipping the backup to save four minutes is how a two-hour incident becomes a two-day one.",
    },
    {
      q: "How do you spot a contributed module that is about to become a liability, and what are the options once it is?",
      a: "The signals are visible before it hurts: no release in 18 months, a `composer audit --abandoned=fail` hit, unanswered criticals in the issue queue, a missing next-major branch when core's next minor is close, or the 'not covered by Drupal's security advisory policy' banner on the project page. Once it is dead, there are four moves. Adopt it — become co-maintainer, best when you are the biggest user. Patch it via `cweagans/composer-patches` — cheapest short term, but every core minor makes you re-roll. Replace it with a maintained alternative, which usually means a migration. Or fork it into your own VCS repository listed ahead of packages.drupal.org in `composer.json`, which makes you the maintainer without pretending otherwise. The mistake is drifting: accumulating patches until an emergency forces the decision on someone else's schedule.",
    },
    {
      q: "What is the difference between a core patch update and a core minor update from a deployment perspective?",
      a: "A patch update (10.3.9 to 10.3.14) contains bug and security fixes only — no API removals and no new configuration — so it can go through a compressed pipeline on the same day an advisory drops. A minor update (10.3 to 10.4) can remove previously deprecated APIs, add new configuration, change default behaviour and shift dependency constraints, so it needs a real cycle: run deprecation checks with `phpstan-drupal`, verify every contrib module declares compatibility, install a fresh site from your exported config, and check `drush config:status` is clean afterwards. The trap is that you cannot postpone minors forever: coverage for a minor ends once two further minors ship, so staying two behind is functionally the same as running unpatched. I schedule minors as their own planned piece of work, well ahead of that cliff.",
    },
  ],

  quiz: [
    {
      question:
        "Your site runs drupal/some_module 2.0.0-beta4 and `composer audit` reports no advisories for it. What does that tell you?",
      options: [
        "The module has been reviewed and has no known vulnerabilities",
        "Almost nothing — advisories are only issued for stable releases, so a beta can never produce one",
        "The module is covered because the 2.x branch has a stable release elsewhere",
        "Composer only audits drupal/core, so contrib is never reported",
      ],
      answerIndex: 1,
      explain:
        "The security team issues advisories only for stable releases of covered projects; alphas, betas, RCs, dev snapshots and sandbox projects are outside the policy entirely. A clean audit on a beta means the release is not eligible for advisories, not that it is safe. (Composer does audit contrib — packages.drupal.org serves Composer's security-advisories API.)",
    },
    {
      question:
        "An advisory carries the vector AC:None/A:None/CI:All/II:All/E:Exploit/TD:All. What is its score and level?",
      options: [
        "15/25 — Critical",
        "20/25 — Highly critical",
        "25/25 — Highly critical",
        "18/25 — Critical",
      ],
      answerIndex: 2,
      explain:
        "AC:None 4 + A:None 4 + CI:All 5 + II:All 5 + E:Exploit 4 + TD:All 3 = 25, the maximum. Scores of 20–25 are Highly critical: an anonymous attacker, no special conditions, total confidentiality and integrity impact, a known exploit in the wild, and every configuration affected. That combination is what justifies a same-day hotfix.",
    },
    {
      question:
        "The team wants a CLI check for security updates on a Drupal 10/11 site in CI. Which is the current approach?",
      options: [
        "drush pm:security, which reads the Update Status data",
        "composer audit --locked, backed by the security-advisories API on packages.drupal.org",
        "drush updatedb --security, run after every deploy",
        "curl the /admin/reports/updates page and grep the HTML",
      ],
      answerIndex: 1,
      explain:
        "`composer audit` is the tool: packages.drupal.org advertises Composer's security-advisories API, so one command covers core and every contributed project, and it exits non-zero when something matches. Drush's `pm:security` no longer exists — current Drush ships only pm:install, pm:list and pm:uninstall. `drush updatedb` runs database updates; it has nothing to do with advisories.",
    },
    {
      question:
        "Which change is the WRONG one to push through a compressed emergency window?",
      options: [
        "drupal/core 10.3.9 to 10.3.14 to fix a highly critical advisory",
        "A contrib patch release, 6.2.2 to 6.2.9, named in an advisory",
        "drupal/core 10.3.x to 10.4.0 because the fix 'is in the new minor anyway'",
        "A cweagans/composer-patches entry carrying the official fix while awaiting a release",
      ],
      answerIndex: 2,
      explain:
        "A minor version bump can remove deprecated APIs, add configuration, change defaults and shift contrib compatibility — none of which you can validate in a rushed window. Patch releases within the same minor carry fixes only, which is exactly why the security team ships them that way. If a fix is genuinely only in the next minor, take the interim patch or an official backport, then schedule the minor as its own planned piece of work.",
    },
  ],
};

export default lesson;

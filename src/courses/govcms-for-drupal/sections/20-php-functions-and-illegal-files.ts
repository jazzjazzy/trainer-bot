import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "php-functions-and-illegal-files",
  title: "Banned Functions and Illegal Files: The Static Gate",
  part: "The Compliance Gates",
  estMinutes: 13,
  summary:
    "The three static checks GovCMS runs over your theme code -- a 34-name PHPStan function denylist, an illegal-file regex and a YAML lint -- and, more importantly, which of them actually stops a deploy.",
  concept: `## The gate is the point

On a Drupal site you own, PHPStan is advice. You pick a level, you baseline the noise, and a red pipeline is the start of a conversation. On GovCMS the same tool is a door. Your project pulls in \`govcms/scaffold-tooling\`, whose \`phpstan.neon\` sits at \`vendor/govcms/scaffold-tooling/phpstan.neon\`, and its very first parameter is \`customRulesetUsed: true\` -- every ordinary PHPStan rule is switched off. That file is not a type checker. It is a denylist with a linter attached.

### What is banned

\`disallowedFunctionCalls\` holds 34 entries, each carrying the identical \`message: 'please change the code'\`:

\`\`\`
curl_exec() curl_init() curl_multi_exec() db_*() dd() debug_backtrace()
dump() escapeshellcmd() eval() exec() ftp_*() mysql_*() mysqli_*()
passthru() pcntl_*() phpinfo() popen() posix_getpwuid() posix_kill()
posix_mkfifo() posix_setpgid() posix_setsid() posix_setuid() posix_uname()
print_r() proc_open() proc_get_status() proc_terminate() proc_close()
proc_nice() shell_exec() sleep() system() var_dump()
\`\`\`

Three clusters: process execution, direct database access, debug output. The wildcards expand, so \`ftp_nb_fput()\` is caught without ever being listed.

The scan target is deliberately narrow -- \`./web/themes/custom\`, falling back to \`./themes\` when there is no \`web/\`, over extensions \`php\`, \`theme\`, \`inc\`. Nothing scans \`web/modules/custom\`, because on SaaS nothing ships from there. A sibling config, \`phpstan-extra.neon\`, adds \`Drupal::httpClient()\`, the \`GuzzleHttp\\Client\` namespace and \`Drupal::service('page_cache_kill_switch')\`. Both files hard-code the same two path-scoped waivers, for \`debug_backtrace()\` and \`print_r()\` in \`web/themes/custom/bootstrap/src/Bootstrap.php\`; \`phpstan-extra.neon\` adds a third ignore, for \`Cannot access constant\`.

### Which check actually fails a deploy

This is what interviewers probe. Severities in \`shipshape.yml\`:

- \`[FILE] Illegal files\` -- \`severity: high\`, \`path: web\`, \`disallowed-pattern: '^(adminer|phpmyadmin|bigdump)?\\.php$'\`.
- \`[FILE] Yaml lint platform files\` plus the two theme-YAML checks -- \`severity: high\`.
- \`[FILE] Banned PHP function list\` -- **no severity declared**, so it defaults below the \`--fail-severity\` threshold of \`high\`. It lands in the report, not in the exit code.
- \`[FILE] Banned PHP methods and classes\` -- \`severity: low\`.

So a \`shell_exec()\` in a \`.theme\` file is reported and not, on its own, fatal; a file called \`adminer.php\` is fatal. The standalone \`govcms-validate-php-functions\` script is stricter -- it exits \`1\` on any hit -- and still ships as a composer bin you can run by hand.

### Illegal files and YAML

\`govcms-validate-illegal-files\` is a bash **regex**, not a glob: \`[[ "$1" =~ $GOVCMS_ILLEGAL_FILE_PATTERN(.+)?\\.php ]]\` over \`find . -name "*.php"\`, with the default pattern \`(adminer|phpmyadmin|bigdump)\`. It is unanchored, so \`web/libs/phpmyadmin-export.php\` matches. Shipshape's twin is anchored and scoped to \`web\`.

There are two YAML linters and they are not the same tool. scaffold-tooling ships \`govcms-yaml_lint\`, a composer bin wrapping Symfony's \`lint:yaml\` command, which you can run by hand. Separately, Shipshape's own \`yamllint\` checks -- which simply unmarshal each file and record a breach if it will not parse -- cover \`.lagoon.yml\`, \`docker-compose.yml\` and every theme \`.yml\` at \`severity: high\`, inside the post-rollout task that runs *before* \`Perform config import\`. Broken indentation stops the rollout before configuration reaches the database. That ordering is deliberate.`,
  comparisons: [
    {
      label: "Debugging a preprocess hook",
      intro:
        "You need to see what is in $variables while building a node template. On your own site that is a two-minute job; on GovCMS three of the obvious tools are on the denylist and a fourth is a disallowed module.",
      php: `<?php

/**
 * Implements hook_preprocess_HOOK() for node.html.twig.
 */
function mytheme_preprocess_node(array &$variables) {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];

  // devel is in require-dev on this project, so this is ordinary practice.
  if (\\Drupal::currentUser()->hasPermission('access devel information')) {
    dpm($node->toArray());
    print_r($variables['view_mode']);
    error_log(print_r(array_keys($variables), TRUE));
  }

  $variables['byline'] = $node->getOwner()->getDisplayName();
}`,
      ts: `<?php

/**
 * Implements hook_preprocess_HOOK() for node.html.twig.
 */
function mytheme_preprocess_node(array &$variables) {
  /** @var \\Drupal\\node\\NodeInterface $node */
  $node = $variables['node'];

  // print_r(), var_dump(), dump(), dd() and debug_backtrace() are five of the
  // 34 names in disallowedFunctionCalls, and devel is on the Shipshape
  // disallowed-module list. Log instead: lagoon_logs ships it off the pod.
  \\Drupal::logger('mytheme')->debug('Rendering node @id as @vm', [
    '@id' => $node->id(),
    '@vm' => $variables['view_mode'],
  ]);

  $variables['byline'] = $node->getOwner()->getDisplayName();
}`,
      note: "The denylist is enforced over web/themes/custom only -- but on SaaS the theme is the only place your PHP can live, so 'only' is the whole surface.",
    },
    {
      label: "Pulling a JSON feed into a region",
      intro:
        "An agency wants an alerts banner fed by a remote API. The vanilla answer is a module service with an injected HTTP client; on GovCMS SaaS there is no module and the HTTP client itself is flagged.",
      php: `<?php

namespace Drupal\\my_alerts;

use Drupal\\Component\\Serialization\\Json;
use Drupal\\Core\\Cache\\CacheBackendInterface;
use GuzzleHttp\\ClientInterface;

/**
 * Fetches and caches the whole-of-government alerts feed.
 */
class AlertFetcher {

  public function __construct(
    protected ClientInterface $httpClient,
    protected CacheBackendInterface $cache,
  ) {}

  public function fetch(): array {
    $cid = 'my_alerts:feed';
    if ($hit = $this->cache->get($cid)) {
      return $hit->data;
    }
    $body = $this->httpClient
      ->request('GET', 'https://api.example.gov.au/alerts.json', ['timeout' => 5])
      ->getBody()
      ->getContents();
    $data = Json::decode($body) ?: [];
    $this->cache->set($cid, $data, time() + 300, ['my_alerts']);
    return $data;
  }

}`,
      ts: `<?php

/**
 * Implements hook_preprocess_HOOK() for block.html.twig.
 *
 * A theme cannot register a service, a route or a controller, so there is
 * nowhere legal for a server-side fetch to live. curl_init(), curl_exec()
 * and curl_multi_exec() are on the 34-name list; \\Drupal::httpClient() and
 * the GuzzleHttp\\Client namespace are caught by phpstan-extra.neon as
 * '[FILE] Banned PHP methods and classes' (severity: low).
 *
 * So the fetch moves to the visitor's browser.
 */
function mytheme_preprocess_block(array &$variables) {
  if (($variables['plugin_id'] ?? '') !== 'system_branding_block') {
    return;
  }

  $variables['#attached']['library'][] = 'mytheme/alerts';
  $variables['#attached']['drupalSettings']['mytheme']['alertsUrl']
    = 'https://api.example.gov.au/alerts.json';
  $variables['#cache']['contexts'][] = 'url.path';
  $variables['#cache']['max-age'] = 300;
}`,
      note: "Read the severities before you panic: the methods-and-classes check is `low`, so it reports rather than blocks -- but the architecture it pushes you toward is the one GovCMS support will expect to see.",
    },
    {
      label: "A database tool in the web root",
      intro:
        "Every long-lived Drupal site has had an adminer.php dropped into the docroot at 3am at least once. Compare the vanilla workflow with the check that greps for it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `#!/usr/bin/env bash
# Vanilla Drupal: you own the web root, so a one-off DB tool is just a file.
set -euo pipefail

cd web
wget -q -O adminer.php \\
  https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1.php

# Keep it out of git and put a password in front of it.
printf 'web/adminer.php\\n' >> ../.gitignore
htpasswd -bc .htpasswd ops "$DBTOOL_PASS"
printf 'AuthType Basic\\nAuthName "ops"\\nRequire valid-user\\n' > .htaccess

cd ..
drush sql:query 'SELECT COUNT(*) FROM node_field_data'
echo "Adminer available at https://example.gov.au/adminer.php"`,
      ts: `#!/usr/bin/env bash
# GovCMS: scaffold-tooling/scripts/validate/govcms-validate-illegal-files
set -euo pipefail

GOVCMS_ILLEGAL_FILE_PATTERN=\${GOVCMS_ILLEGAL_FILE_PATTERN:-"(adminer|phpmyadmin|bigdump)"}

function illegal_file {
  # A bash regex, not a glob -- and it is not anchored.
  if [[ "$1" =~ $GOVCMS_ILLEGAL_FILE_PATTERN(.+)?\\.php ]]; then
    return 0
  fi
  return 1
}

while read -rd $'\\0' file; do
  if illegal_file "$file"; then
    echo "[fail]: Illegal file found [$file]"
    FAILURES="\${FAILURES},\${file}"
  fi
done < <(find . -name "*.php" -print0)

# Shipshape runs the anchored twin, scoped to web/, at severity: high:
#   disallowed-pattern: '^(adminer|phpmyadmin|bigdump)?\\.php\$'`,
      note: "Because the script's regex is unanchored and runs from the repo root, a vendored library directory called phpmyadmin/ is enough to fail it -- rename before you argue.",
    },
    {
      label: "Linting YAML before it can break a deploy",
      intro:
        "Both sides lint YAML. The difference is what happens when the lint fails, and at what point in the lifecycle it runs.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# .github/workflows/lint.yml -- a Drupal site you control.
name: Lint
on: [pull_request]

jobs:
  yaml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: composer install --no-interaction --no-progress
      - name: Lint YAML
        # Advisory: reviewers see the annotation, the merge button stays green.
        continue-on-error: true
        run: ./vendor/bin/yaml-lint config/default web/themes/custom
      - name: Config import smoke test
        run: drush config:import -y --no-interaction`,
      ts: `# vendor/govcms/scaffold-tooling/shipshape.yml -- you do not edit this file.
yamllint:
  - name: '[FILE] Yaml lint platform files'
    severity: high
    files:
      - .lagoon.yml
      - docker-compose.yml
    ignore-missing: true
  - name: '[FILE] Yaml lint theme files'
    severity: high
    path: web/themes
    pattern: ".*.yml"
    exclude-pattern: node_modules
    ignore-missing: true

# .lagoon.yml -- task 2 of 8, wrapped in ## START/END SaaS-only.
# It runs three tasks BEFORE 'Perform config import'.
#   - run:
#       name: Perform GovCMS platform validations
#       command: 'shipshape run -f /app/vendor/govcms/scaffold-tooling/shipshape.yml --exclude-db --error-code .'
#       service: cli`,
      note: "severity: high means a breach makes shipshape exit 2, which fails the post-rollout task -- so malformed theme YAML halts the rollout before drush config:import is ever reached.",
    },
  ],
  playground: {
    intro:
      "Three passes over one commit, modelled as pure string scanning. Read each rule before you read the verdict -- the interesting part is which pass owns the exit code.",
    lang: "php",
    code: `<?php
// A model of the GovCMS static gate. Three independent passes, one commit.

$banned = ['shell_exec', 'print_r', 'phpinfo', 'eval', 'dd', 'debug_backtrace'];

$theme_file = <<<'CODE'
<?php
function mytheme_preprocess_page(array &$vars) {
  $rev = shell_exec('git rev-parse --short HEAD');
  $vars['build'] = trim($rev);
  print_r($vars['node']);
  $vars['menu'] = mytheme_primary_menu($vars);
  if (!empty($vars['diagnostics'])) {
    phpinfo();
  }
}
CODE;

$paths = [
  './web/themes/custom/mytheme/mytheme.theme',
  './web/themes/custom/mytheme/src/Alerts.php',
  './web/adminer.php',
  './web/libs/phpmyadmin-export.php',
  './config/default/core.extension.yml',
];
$illegal_words = ['adminer', 'phpmyadmin', 'bigdump'];

$lagoon_yml = <<<'YML'
tasks:
  post-rollout:
    - run:
        name: Perform config import
        command: /app/vendor/bin/govcms-config-import
       service: cli
        shell: bash
YML;

function calls_on_line($line) {
  $found = [];
  $len = strlen($line);
  for ($i = 0; $i < $len; $i++) {
    if ($line[$i] !== '(') {
      continue;
    }
    $name = '';
    for ($j = $i - 1; $j >= 0; $j--) {
      $c = $line[$j];
      if (ctype_alnum($c) || $c === '_') {
        $name = $c . $name;
        continue;
      }
      break;
    }
    if ($name !== '' && !ctype_digit($name[0])) {
      $found[] = $name;
    }
  }
  return $found;
}

printf("GovCMS static gate -- one commit, three passes\\n");
printf("=============================================\\n\\n");

printf("[1] Banned PHP function list   scope web/themes/custom  severity: (none)\\n");
$fail1 = 0;
foreach (explode("\\n", $theme_file) as $i => $line) {
  foreach (calls_on_line($line) as $call) {
    $bad = in_array($call, $banned, TRUE);
    $fail1 += $bad ? 1 : 0;
    printf("    line %2d  %-24s %s\\n", $i + 1, $call . '()',
      $bad ? 'FORBIDDEN please change the code' : 'not on the list');
  }
}

printf("\\n[2] Illegal files              two different patterns, one commit\\n");
printf("    left   standalone script: unanchored, repo root, exit 1, no severity\\n");
printf("    right  Shipshape check:   anchored, path: web, severity: high\\n");
$fail_script = 0;
$fail_ship = 0;
$anchored = ['adminer.php', 'phpmyadmin.php', 'bigdump.php'];
foreach ($paths as $path) {
  $is_php = substr($path, -4) === '.php';
  $word = '';
  foreach ($illegal_words as $w) {
    if ($is_php && strpos($path, $w) !== FALSE) {
      $word = $w;
      break;
    }
  }
  $ship = strpos($path, './web/') === 0
    && in_array(basename($path), $anchored, TRUE);
  $fail_script += ($word === '') ? 0 : 1;
  $fail_ship += $ship ? 1 : 0;
  printf("    %-45s %-16s %s\\n", $path,
    $word === '' ? 'ok' : 'MATCH ' . $word,
    $ship ? 'BREACH high' : 'no match');
}

printf("\\n[3] Yaml lint platform files   even-space indent only   severity: high\\n");
$fail3 = 0;
foreach (explode("\\n", $lagoon_yml) as $i => $line) {
  $indent = strlen($line) - strlen(ltrim($line, ' '));
  $bad = ($indent % 2) !== 0;
  $fail3 += $bad ? 1 : 0;
  printf("    line %2d  indent %2d  %-30s %s\\n", $i + 1, $indent,
    trim($line), $bad ? 'MAPPING VALUES NOT ALLOWED' : 'ok');
}

$blocking = $fail_ship + $fail3;
printf("\\nbanned functions %d (reported)   illegal files: script %d / shipshape %d   yaml errors %d\\n",
  $fail1, $fail_script, $fail_ship, $fail3);
printf("breaches at or above --fail-severity high: %d\\n", $blocking);
printf("the script's %d hits are its own exit 1, not a Shipshape severity\\n", $fail_script);
printf("%s\\n", $blocking > 0 ? 'BUILD FAILED' : 'BUILD PASSED');`,
    output: `GovCMS static gate -- one commit, three passes
=============================================

[1] Banned PHP function list   scope web/themes/custom  severity: (none)
    line  2  mytheme_preprocess_page() not on the list
    line  3  shell_exec()             FORBIDDEN please change the code
    line  4  trim()                   not on the list
    line  5  print_r()                FORBIDDEN please change the code
    line  6  mytheme_primary_menu()   not on the list
    line  7  empty()                  not on the list
    line  8  phpinfo()                FORBIDDEN please change the code

[2] Illegal files              two different patterns, one commit
    left   standalone script: unanchored, repo root, exit 1, no severity
    right  Shipshape check:   anchored, path: web, severity: high
    ./web/themes/custom/mytheme/mytheme.theme     ok               no match
    ./web/themes/custom/mytheme/src/Alerts.php    ok               no match
    ./web/adminer.php                             MATCH adminer    BREACH high
    ./web/libs/phpmyadmin-export.php              MATCH phpmyadmin no match
    ./config/default/core.extension.yml           ok               no match

[3] Yaml lint platform files   even-space indent only   severity: high
    line  1  indent  0  tasks:                         ok
    line  2  indent  2  post-rollout:                  ok
    line  3  indent  4  - run:                         ok
    line  4  indent  8  name: Perform config import    ok
    line  5  indent  8  command: /app/vendor/bin/govcms-config-import ok
    line  6  indent  7  service: cli                   MAPPING VALUES NOT ALLOWED
    line  7  indent  8  shell: bash                    ok

banned functions 3 (reported)   illegal files: script 2 / shipshape 1   yaml errors 1
breaches at or above --fail-severity high: 2
the script's 2 hits are its own exit 1, not a Shipshape severity
BUILD FAILED
`,
  },
  keyPoints: [
    "phpstan.neon sets `customRulesetUsed: true` -- every normal PHPStan rule is off. The file exists solely to carry 34 `disallowedFunctionCalls` entries, all with the message `please change the code`.",
    "The function scan covers `./web/themes/custom` (falling back to `./themes`) over `php`, `theme` and `inc` files. Modules are not scanned because on SaaS no module ships.",
    "`[FILE] Banned PHP function list` declares no severity in shipshape.yml, so it sits below the default `--fail-severity high` and only populates the report. The standalone `govcms-validate-php-functions` script does exit 1.",
    "`[FILE] Illegal files` is `severity: high` -- that one genuinely fails the SaaS rollout. The script's own regex `(adminer|phpmyadmin|bigdump)(.+)?\\.php` is unanchored and runs from the repo root; Shipshape's twin is anchored and scoped to `web`.",
    "All three YAML lint checks are `severity: high`, covering `.lagoon.yml`, `docker-compose.yml` and every theme `.yml`, and they run in a post-rollout task that precedes `Perform config import`.",
    "Shipshape does not short-circuit: every check runs, then it exits 2 only if the result list is Fail and at least one breach is at or above the fail severity. Stage-level stopping is a GitLab behaviour, not a Shipshape one.",
  ],
  interview: [
    {
      q: "Walk me through what happens to a `shell_exec()` call you accidentally left in a .theme file.",
      a: "PHPStan flags it through `disallowedFunctionCalls` in `vendor/govcms/scaffold-tooling/phpstan.neon` with the message `please change the code`, because `shell_exec()` is one of the 34 names on that list and the scan covers `web/themes/custom` over `php`, `theme` and `inc` extensions. Where it surfaces depends on the runner. Under Shipshape the check is `[FILE] Banned PHP function list`, which declares **no** severity, so it defaults below the `high` fail threshold -- it shows in the report and in the JUnit artefact but does not by itself make shipshape exit 2. The standalone `govcms-validate-php-functions` composer bin is stricter and exits 1 on any hit. The practical answer I give a client is: fix it anyway, because the report is visible to GovCMS and 'the severity was unset' is not a defence at a review.",
    },
    {
      q: "A build is failing on the illegal-files check but the developer swears there is no adminer in the repo. Where do you look?",
      a: "At the exact pattern, because it is a bash regex and not a glob. The script does `[[ \"$1\" =~ $GOVCMS_ILLEGAL_FILE_PATTERN(.+)?\\.php ]]` with the default `(adminer|phpmyadmin|bigdump)` over `find . -name \"*.php\"`, and nothing anchors it -- so any path containing one of those three words and ending in `.php` matches. I have seen it fire on a vendored export library under a `phpmyadmin/` directory and on a documentation fixture named `bigdump-example.php`. Shipshape's version is different again: `'^(adminer|phpmyadmin|bigdump)?\\.php$'`, anchored and scoped to `web`, at `severity: high`. So the first question is which of the two ran, and the second is `find . -name '*.php' | grep -E '(adminer|phpmyadmin|bigdump)'` to see the real path.",
    },
    {
      q: "Your theme needs to call a third-party API. How do you architect that on GovCMS SaaS?",
      a: "You do not do it server-side, because there is nowhere legal to put it. A theme cannot declare services, routes or controllers, and the direct options are all flagged -- `curl_init()`, `curl_exec()` and `curl_multi_exec()` sit on the 34-name function list, while `\\Drupal::httpClient()` and the `GuzzleHttp\\Client` namespace are caught by `phpstan-extra.neon` under `[FILE] Banned PHP methods and classes`. In practice I attach a library and pass the endpoint through `drupalSettings` so the visitor's browser makes the call, with sensible cache metadata on the render array. If the integration genuinely has to be server-side -- signed requests, secrets, an internal-only endpoint -- that is a PaaS conversation or a talk-to-GovCMS-early conversation, not something to smuggle into a preprocess hook.",
    },
    {
      q: "Why does the YAML lint run where it does in the rollout?",
      a: "Because it is cheaper to fail before you touch the database than after. In `.lagoon.yml` the shipshape task is number two of eight post-rollout tasks -- after `Prepare the site for deployment` and before `Synchronise the database`, `Perform database updates` and `Perform config import`. All three yamllint checks are `severity: high`, so a broken `.lagoon.yml`, `docker-compose.yml` or theme `.yml` makes shipshape exit 2 and stops the rollout while the site is still serving the previous release. It is worth noting that the whole task is wrapped in the `## START SaaS-only` / `## END SaaS-only` markers that `scaffold-init.sh` strips for PaaS, and that the command passes `--exclude-db`, so only the file-based checks run there.",
    },
  ],
  quiz: [
    {
      question:
        "Which single Shipshape check in this group will, on its own, fail a SaaS rollout?",
      options: [
        "`[FILE] Illegal files`",
        "`[FILE] Banned PHP function list`",
        "`[FILE] Banned PHP methods and classes`",
        "`[FILE] Detect module files in theme folder`",
      ],
      answerIndex: 0,
      explain:
        "`[FILE] Illegal files` declares `severity: high`, which is at the default `--fail-severity`, so a breach makes shipshape exit 2. The banned-function check declares no severity at all, the methods-and-classes check is explicitly `low`, and the theme-module detector omits severity too -- all three report without blocking.",
    },
    {
      question:
        "What does `customRulesetUsed: true` at the top of GovCMS's phpstan.neon do?",
      options: [
        "It raises the analysis to PHPStan level 9 for theme code.",
        "It tells PHPStan the project supplies its own extensions, so a custom Drupal ruleset is loaded on top.",
        "It disables PHPStan's ordinary rules, leaving the file to act purely as a call denylist.",
        "It makes PHPStan write a baseline file so existing violations are grandfathered in.",
      ],
      answerIndex: 2,
      explain:
        "The parameter switches off PHPStan's built-in rules -- the config file's comment says exactly that. Everything the gate enforces comes from `disallowedFunctionCalls` (and, in phpstan-extra.neon, `disallowedStaticCalls` and `disallowedNamespaces`). GovCMS is not type-checking your theme; it is scanning for a fixed list of calls.",
    },
    {
      question:
        "Where does the banned-PHP-function scan look for code, by default?",
      options: [
        "`web/modules/custom` and `web/themes/custom`, over `php`, `module` and `theme` files.",
        "`./web/themes/custom`, falling back to `./themes` when there is no `web/`, over `php`, `theme` and `inc` files.",
        "The whole repository except `vendor/` and `web/core/`.",
        "`config/default`, because the scan reads exported configuration rather than the filesystem.",
      ],
      answerIndex: 1,
      explain:
        "`govcms-validate-php-functions` sets `GOVCMS_THEME_DIR=./web/themes/custom` and switches to `./themes` only when `./web` is absent; `phpstan.neon` sets `fileExtensions: php, theme, inc`. Custom modules are not scanned because on SaaS the Dockerfile copies only `themes/`, `config` and `favicon.ico` into the image. Reading exported configuration is what the module and profile validators do, not this one.",
    },
    {
      question:
        "A vendored library lives at `web/libs/phpmyadmin-export/Writer.php`. What happens?",
      options: [
        "Nothing -- the pattern only matches a file literally named `phpmyadmin.php`.",
        "Nothing -- the scan skips anything under `web/libs`.",
        "It is reported at `severity: low` alongside the banned methods and classes.",
        "The standalone illegal-files script matches it, because its regex is unanchored and only needs the word somewhere in a path ending in `.php`.",
      ],
      answerIndex: 3,
      explain:
        "The script's test is `[[ \"$1\" =~ $GOVCMS_ILLEGAL_FILE_PATTERN(.+)?\\.php ]]` over `find . -name \"*.php\"` -- no anchors, so the word can appear anywhere in the path. Shipshape's twin uses the anchored `'^(adminer|phpmyadmin|bigdump)?\\.php$'` scoped to `web`, and would not match this path, which is exactly why you need to know which runner produced the failure before you start deleting files.",
    },
  ],
};

export default lesson;

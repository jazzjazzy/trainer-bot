import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "platform-services-solr-av-cron",
  title: "The Other Containers: Solr, Antivirus, MariaDB and Cron",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "GovCMS is a service graph, not a site: every container carries a lagoon.type label that decides whether Lagoon deploys it and whether you can read its log, so the first debugging move is naming the container before naming the bug.",

  concept: `
## GovCMS is not one container

You already know Drupal needs a web server and a database. On GovCMS that expands into a
service graph declared in \`docker-compose.yml\`, where every service carries a
\`lagoon.type\` label telling Lagoon what to build it as. \`ahoy up\` gives you \`cli\`,
\`nginx\`, \`php\`, \`mariadb\`, \`av\`, \`test\` and \`chrome\`; \`solr\` ships commented out. The
images are GovCMS's own — \`govcms/govcms\` (the cli image), \`govcms/nginx-drupal\`,
\`govcms/php\`, \`govcms/mariadb-drupal\`, \`govcms/solr\`, \`govcms/redis\`,
\`govcms/varnish-drupal\` — built in the \`govCMS/lagoon\` repository rather than pulled from
upstream.

Two labels change how you debug:

\`\`\`yaml
nginx:
  labels:
    lagoon.type: nginx-php-persistent
    lagoon.persistent: /app/web/sites/default/files/
php:
  labels:
    lagoon.type: nginx-php-persistent
    lagoon.name: nginx
av:
  labels:
    lagoon.type: none
\`\`\`

\`lagoon.name: nginx\` on \`php\` merges those two into **one pod**, and \`cli\` is a separate
\`cli-persistent\` service sharing the same files volume. \`lagoon.type: none\` on \`av\` means
Lagoon does **not** deploy that service from your file at all: locally it is a container you
can \`ahoy logs av\`; on the platform the scanner sits behind \`HTTPAV_ENDPOINT\` and you have
no log of your own to read.

### The reflex: name the container before you name the bug

- Static file 404, redirect map not firing → \`nginx\`
- White screen, memory exhaustion, uncaught exception → \`php\`
- Slow list view, deadlock, "server has gone away" → \`mariadb\`
- "The anti-virus scanner could not check the file" → the AV endpoint
- Every page suddenly slow but correct → Redis
- A job that simply did not run → \`cli\`

Redis is the trap. \`lagoon.settings.php\` connects and \`ping()\`s Redis inside a \`try\`; the
\`catch\` sets \`$settings['cache']['default'] = 'cache.backend.null'\`. Lose Redis and the site
keeps serving with **no** cache backend — not the database cache, none.

### Antivirus is mandatory; Solr is opt-in

\`httpav\` is re-enabled by \`govcms-enable_modules\` on every rollout and required at
\`severity: high\` by Shipshape. Drupal scans nothing itself: it POSTs the file to
\`HTTPAV_ENDPOINT\` and reads back three states — clean, infected, or *unchecked*. Because
\`allow_unchecked\` defaults to \`false\`, an unreachable scanner blocks **every** upload.
Empty files, and files that are not new, are treated as clean without a request.

Solr is the mirror image: \`Dockerfile.solr.saas\`, \`.saasplus\` and \`.paas\` all exist, so it
is available on every scaffold type — but the service ships commented out, and since
\`docker-compose.yml\` is one of the SaaS locked files, opting in there is a conversation, not
a commit. No post-rollout task reindexes.

### Cron belongs to \`cli\`

Cron is declared per environment in \`.lagoon.yml\` and runs in the \`cli\` service through
\`govcms-drush\`, a wrapper that traps a failing drush command and reports it. Lagoon expands
\`M\` to one fixed minute per project; a job runs in-pod only when the gap between its runs
is **strictly under** 30 minutes, so \`M/15\` stays in the pod while \`M/30\` and anything
wider becomes a native Kubernetes CronJob. The clock is UTC. \`automated_cron\` is not in the profile's install list, so no page request ever runs
cron for you.
`,

  comparisons: [
    {
      label: "Turning on virus scanning for uploads",
      intro:
        "Editors upload documents and you need them scanned. On your own site that is a daemon you install and a module you enable; on GovCMS it is already on and you cannot turn it off.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla Drupal: the scanner is your responsibility, end to end.
apt-get install -y clamav-daemon clamav-freshclam
systemctl enable --now clamav-daemon clamav-freshclam

composer require drupal/clamav
drush -y en clamav
# Configure the connection mode and the "what if the daemon is down" policy
# in the module's settings form, then export it like any other config.
drush -y config:export

# It is ordinary contrib, so it is also ordinary to remove.
drush -y pm:uninstall clamav
composer remove drupal/clamav`,
      ts: `# docker-compose.yml - platform-managed, and a locked file on SaaS.
x-environment: &default-environment
  HTTPAV_ENDPOINT: http://av:3993/scan
  HTTPAV_RETURN_KEY: comodo
  HTTP_PAYLOAD_KEY: malware

services:
  av:
    image: govcms/av:latest
    labels:
      lagoon.type: none

# There is no "turn it on" step, and no "turn it off" step either:
#   - govcms-enable_modules re-enables httpav on every single rollout, and
#   - Shipshape's '[FILE] Verify enabled modules' lists httpav as required
#     at severity: high, which is at the default --fail-severity.
# Drupal never runs a scanner. It POSTs the file to HTTPAV_ENDPOINT and reads
# back clean / infected / unchecked. allow_unchecked defaults to false.`,
      note:
        "The scanning engine is not yours to configure or name: the verifiable surface is the drupal/httpav module, the av service and the HTTPAV_ENDPOINT variable. clamav.settings survives on GovCMS only as a config_ignore entry.",
    },
    {
      label: "Standing up Solr search",
      intro:
        "The client wants faceted Search API search. On a site you control that is a container plus a server config entity; on GovCMS the container already has a Dockerfile and the question is who is allowed to uncomment it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# docker-compose.yml - you own the file, so you add the container.
services:
  solr:
    image: solr:9
    ports:
      - "8983:8983"
    command: ["solr-precreate", "drupal", "/opt/solr/server/solr/configsets/drupal"]
    volumes:
      - ./.docker/solr/conf:/opt/solr/server/solr/configsets/drupal/conf

# config/sync/search_api.server.mysite_solr.yml - exported and imported like
# any other config entity, host and core included.
id: mysite_solr
backend: search_api_solr
backend_config:
  connector: standard
  connector_config:
    host: solr
    port: 8983
    path: /
    core: drupal`,
      ts: `# docker-compose.yml exactly as the scaffold ships it.
  # Uncomment to enable solr.
  # solr:
  #   build:
  #     context: .
  #     dockerfile: .docker/Dockerfile.solr
  #     args:
  #       GOVCMS_IMAGE_VERSION: *govcms-image-version
  #   labels:
  #     lagoon.type: solr
  #   ports:
  #     - "8983"

# .docker/Dockerfile.solr.saas, .solr.saasplus and .solr.paas all exist, so the
# capability is not offering-specific. What differs is who may commit the
# change: docker-compose.yml and .docker/* are SaaS locked files.
#
# The connector is pinned for you in scaffold-tooling's all.settings.php, on a
# server whose machine name is fixed:
#   $config['search_api.server.lagoon_solr']['backend_config']['connector_config']['path'] = '/';
#   $config['search_api.server.lagoon_solr']['backend_config']['connector_config']['core'] = 'drupal';
#
# search_api, search_api_solr and search_api_attachments are on the 73-name
# managed_modules allowlist - but 'administer search_api' is one of the four
# entries on module_permissions' permission_blacklist.`,
      note:
        "Solr is opt-in on every scaffold type rather than missing from SaaS, and nothing in the eight post-rollout tasks reindexes — the first deploy after you enable it serves an empty index until someone runs the index.",
    },
    {
      label: "What happens when the cache server dies",
      intro:
        "Redis goes away mid-morning. The interesting question is not whether the site survives but what it degrades to, because that determines the symptom you will be handed.",
      php: `<?php
// settings.php on a site you control. You wrote the fallback, so you
// chose it: keep serving from the database cache.
$settings['redis.connection']['interface'] = 'PhpRedis';
$settings['redis.connection']['host'] = '127.0.0.1';
$settings['redis.connection']['port'] = 6379;
$settings['cache']['default'] = 'cache.backend.redis';
$settings['container_yamls'][] = 'modules/contrib/redis/example.services.yml';

try {
  $probe = new \\Redis();
  $probe->connect('127.0.0.1', 6379, 1);
  if (!$probe->ping()) {
    throw new \\Exception('Redis is not answering.');
  }
}
catch (\\Exception $e) {
  // Drop back to Drupal's default database-backed cache. Slower, but the
  // caches still fill and the site still behaves like a cached site.
  unset($settings['cache']['default']);
  unset($settings['container_yamls']);
}`,
      ts: `<?php
// scaffold-tooling drupal/settings/lagoon.settings.php - included for you,
// not editable, and it does NOT fall back to the database.
if (getenv('ENABLE_REDIS')) {
  $redis = new \\Redis();
  $redis_host = getenv('REDIS_HOST') ?: 'redis';
  $redis_port = getenv('REDIS_SERVICE_PORT') ?: 6379;
  $redis_timeout = getenv('REDIS_CONNECT_TIMEOUT') ?: 2;

  try {
    if (InstallerKernel::installationAttempted()) {
      throw new \\Exception('Drupal installation underway.');
    }
    $redis->connect($redis_host, $redis_port, $redis_timeout);
    $response = $redis->ping();
    if (!$response) {
      throw new \\Exception('Redis could be reached but is not responding correctly.');
    }
    $settings['cache']['default'] = 'cache.backend.redis';
  }
  catch (\\Exception $e) {
    $settings['container_yamls'][] = "$govcms_includes/redis-unavailable.services.yml";
    $settings['cache']['default'] = 'cache.backend.null';
  }
}`,
      note:
        "redis-unavailable.services.yml defines cache.backend.null as Drupal\\Core\\Cache\\NullBackendFactory, so a Redis outage leaves the site with no cache backend at all — correct output, uniformly awful response times, and not one error in the log.",
    },
    {
      label: "Finding out that cron stopped",
      intro:
        "Scheduled work silently stops. On a site you control you go and read dblog; on GovCMS dblog is a disallowed module, so the notification has to come to you.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: cron is a crontab line and dblog is your black box recorder.
# /etc/cron.d/drupal
0,30 * * * * www-data /var/www/app/vendor/bin/drush --root=/var/www/app/web cron

# When someone says "the newsletter did not go out":
drush watchdog:show --type=cron --count=20
drush watchdog:show --severity=Error --count=50
tail -n 200 /var/log/drupal-cron.log

# Alerting is whatever you bolted on yourself.
grep -q 'Cron run completed' /var/log/drupal-cron.log \\
  || mailx -s "Drupal cron stalled" ops@example.org < /var/log/drupal-cron.log`,
      ts: `# .lagoon.yml does not run drush. It runs a wrapper, in the cli service:
#   command: '/app/vendor/bin/govcms-drush cron --root=/app'
#   service: cli

# vendor/bin/govcms-drush, abridged - the failure trap is the whole point.
TO='govcms.devops@salsadigital.com.au'
GOVCMS_DRUSH_RECIPIENTS=\${GOVCMS_DRUSH_RECIPIENTS:-}
GOVCMS_DRUSH_NOTIFICATION_ENABLE=\${GOVCMS_DRUSH_NOTIFICATION_ENABLE:-false}
COMMAND="drush $*"

if $COMMAND 2> >(tee $TMP); then
  echo "[success]: Command completed successfully"
  exit
fi

if [ "$GOVCMS_DRUSH_NOTIFICATION_ENABLE" != "true" ]; then
  echo "[fail]: Command failed, notifications not enabled. Skipping."
  exit 1
fi
send_errors   # sendmail to $TO, plus a Slack post when SLACK_TOKEN is set

# There is no dblog to fall back on: it is on the validators' disallowed list
# and on Shipshape's. Drupal's log leaves the pod through lagoon_logs.`,
      note:
        "Notification is opt-in per environment via GOVCMS_DRUSH_NOTIFICATION_ENABLE and GOVCMS_DRUSH_RECIPIENTS — set them at handover, because drush watchdog:show is not available to you as a backstop.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the three rules in this section: who owns a failure and whose log you may read, what the upload gate decides, and when each declared cron job next fires.",
    lang: "php",
    code: `<?php
// 1. Ownership. [operation, container, does Lagoon deploy it from your compose?]
$ops = [
  ['GET /sites/default/files/report.pdf', 'nginx', TRUE],
  ['Render an uncached /node/12', 'php', TRUE],
  ['Views listing over 5000 nodes', 'mariadb', TRUE],
  ['Hourly drush cron', 'cli', TRUE],
  ['Scan a webform file upload', 'av', FALSE],
  ['Search API keyword query', 'solr', FALSE],
];

// RULE: read a container's own log only when Lagoon actually deploys it. av is
// lagoon.type: none and solr ships commented out, so for those two the only
// trace you can reach is the Drupal log written by the php container.
printf("%-38s %-8s %-8s\\n", 'OPERATION', 'RUNS IN', 'READ LOG');
foreach ($ops as $op) {
  printf("%-38s %-8s %-8s\\n", $op[0], $op[1], $op[2] ? $op[1] : 'php');
}

// 2. The upload gate. govcms_security's extension list is checked first, then
// the httpav result: 0 clean, 1 infected, -1 could not be scanned.
$blocked = ['doc', 'xls', 'ppt', 'rtf'];
$allow_unchecked = FALSE;
function verdict(array $f, array $blocked, bool $allow_unchecked): array {
  $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
  if (in_array($ext, $blocked, TRUE)) return ['REJECT', 'blocked extension .' . $ext . ', never reaches av'];
  if ($f['bytes'] === 0) return ['ACCEPT', 'empty file, no scan request sent'];
  if ($f['scan'] === 1) return ['REJECT', 'av reported infected, file is deleted'];
  if ($f['scan'] === -1 && !$allow_unchecked) return ['REJECT', 'av unreachable and allow_unchecked is FALSE'];
  if ($f['scan'] === -1) return ['ACCEPT', 'unchecked, but allow_unchecked is TRUE'];
  return ['ACCEPT', 'av reported clean'];
}
$uploads = [
  ['name' => 'budget-2026.docx', 'bytes' => 40960, 'scan' => 0],
  ['name' => 'minutes.doc', 'bytes' => 12288, 'scan' => 0],
  ['name' => 'headshot.jpg', 'bytes' => 88064, 'scan' => -1],
  ['name' => 'invoice.pdf', 'bytes' => 20480, 'scan' => 1],
];

printf("\\n%-18s %-7s %s\\n", 'UPLOAD', 'RESULT', 'REASON');
foreach ($uploads as $f) {
  $v = verdict($f, $blocked, $allow_unchecked);
  printf("%-18s %-7s %s\\n", $f['name'], $v[0], $v[1]);
}

// 3. Cron. Lagoon expands M to one fixed minute per project, the same minute
// every hour. A job runs in the pod only when the gap between its runs is
// strictly under 30 minutes, so M/15 is in-pod and M/30 is a k8s CronJob.
$m = 23;
$now = 9 * 60 + 47;
function next_run(int $step, int $offset, int $now): int {
  return $offset + (intdiv($now - $offset, $step) + 1) * $step;
}

function clock(int $minutes): string {
  $rem = $minutes % 1440;
  return sprintf('%02d:%02d%s', intdiv($rem, 60), $rem % 60, $minutes >= 1440 ? ' +1d' : '');
}
$jobs = [
  ['Drupal cron with notifications', 'M * * * *', 60],
  ['Queue worker', 'M/15 * * * *', 15],
  ['Feeds import', 'M/30 * * * *', 30],
  ['Nightly reindex', 'M 0 * * *', 1440],
];

printf("\\n%-32s %-14s %-9s %s\\n", 'CRONJOB (now 09:47 UTC)', 'SCHEDULE', 'NEXT', 'RUNS AS');
foreach ($jobs as $j) {
  $next = next_run($j[2], $m % $j[2], $now);
  printf("%-32s %-14s %-9s %s\\n", $j[0], $j[1], clock($next), $j[2] < 30 ? 'in-pod cli' : 'k8s CronJob');
}`,
    output: `OPERATION                              RUNS IN  READ LOG
GET /sites/default/files/report.pdf    nginx    nginx   
Render an uncached /node/12            php      php     
Views listing over 5000 nodes          mariadb  mariadb 
Hourly drush cron                      cli      cli     
Scan a webform file upload             av       php     
Search API keyword query               solr     php     

UPLOAD             RESULT  REASON
budget-2026.docx   ACCEPT  av reported clean
minutes.doc        REJECT  blocked extension .doc, never reaches av
headshot.jpg       REJECT  av unreachable and allow_unchecked is FALSE
invoice.pdf        REJECT  av reported infected, file is deleted

CRONJOB (now 09:47 UTC)          SCHEDULE       NEXT      RUNS AS
Drupal cron with notifications   M * * * *      10:23     k8s CronJob
Queue worker                     M/15 * * * *   09:53     in-pod cli
Feeds import                     M/30 * * * *   09:53     k8s CronJob
Nightly reindex                  M 0 * * *      00:23 +1d k8s CronJob
`,
  },

  keyPoints: [
    "Every service in docker-compose.yml carries a lagoon.type label; av is labelled lagoon.type: none, so Lagoon never deploys it from your file — locally it is a container you can read, on the platform it is only an endpoint.",
    "php carries lagoon.name: nginx, so nginx and PHP-FPM are one pod, while cli is a separate cli-persistent service sharing the nginx persistent volume at /app/web/sites/default/files/.",
    "httpav returns clean, infected or unchecked; allow_unchecked defaults to false, so an AV outage rejects every upload with a scanner message rather than a Drupal error, and govcms-enable_modules puts httpav back on every rollout.",
    "Lose Redis and lagoon.settings.php catches the failure and sets cache.backend.null — no cache backend at all, so the symptom is uniform site-wide slowness with nothing in the log.",
    "Solr has a Dockerfile for saas, saasplus and paas but ships commented out in docker-compose.yml; on SaaS that file is locked, and no post-rollout task reindexes after you enable it.",
    "Cron lives in .lagoon.yml environments.<branch>.cronjobs, runs govcms-drush cron --root=/app in cli, expands M to one fixed minute per project in UTC, and runs in-pod only when the gap between runs is strictly under 30 minutes — M/15 in-pod, M/30 and anything wider as a native Kubernetes CronJob.",
  ],

  interview: [
    {
      q: "An author says they cannot upload anything to a webform this morning. Walk me through your first five minutes.",
      a: `I read the error text before I read any code, because on GovCMS the two upload failures say different things. \`A virus has been detected in the file\` means the scanner answered and flagged it; \`The anti-virus scanner could not check the file\` means \`httpav\` got no usable answer at all and, because \`allow_unchecked\` defaults to \`false\`, every upload is now blocked — that is an endpoint problem, not a Drupal problem. If it is only certain files, I check the extension against \`govcms_security\`'s blocked list (\`doc\`, \`xls\`, \`ppt\`, \`rtf\`), which rejects with an access-denied *before* anything is scanned, so \`.doc\` fails while \`.docx\` sails through. Operationally the thing I would not do is try to disable \`httpav\` to unblock editors: \`govcms-enable_modules\` re-enables it on the next rollout and Shipshape requires it at \`severity: high\`, so I would raise it with the service desk as a platform incident and hold the content deadline rather than trying to route around the gate.`,
    },
    {
      q: "A SaaS client wants Solr-backed faceted search. What do you tell them?",
      a: `That it is available, but it is not a commit they can make. The \`solr\` service ships commented out in \`docker-compose.yml\`, and \`docker-compose.yml\` is one of the SaaS locked files — a push that changes it is declined. It is not a PaaS-only capability either: \`Dockerfile.solr.saas\`, \`.solr.saasplus\` and \`.solr.paas\` all exist in the scaffold, so what differs between offerings is who may enable it, not whether the platform can. On the Drupal side \`search_api\`, \`search_api_solr\` and \`search_api_attachments\` are on the managed_modules allowlist, but \`administer search_api\` is one of the four entries on module_permissions' permission_blacklist, so day-to-day server administration is not self-serve. The detail I would raise at estimation time is that none of the eight post-rollout tasks reindexes, so the cutover plan needs an explicit index run or the first production hit serves an empty result set.`,
    },
    {
      q: "How does cron work on GovCMS, and how would you find out it had stopped?",
      a: `It is declared, not scheduled by you: \`environments.<branch>.cronjobs\` in \`.lagoon.yml\`, running \`/app/vendor/bin/govcms-drush cron --root=/app\` in the \`cli\` service. \`M\` expands to one fixed minute per project so sites do not all fire on the hour, the clock is UTC, and Lagoon keeps a job inside the pod only when the gap between its runs is strictly under 30 minutes — \`M/15\` in-pod, \`M/30\` and anything wider as a native Kubernetes CronJob. The catch that bites teams is that cron is per environment — a branch environment with no \`cronjobs\` stanza runs no Drupal cron at all, which is why scheduled transitions "work in prod and not in staging". For detection I rely on the wrapper: \`govcms-drush\` traps a failing command and mails it, gated by \`GOVCMS_DRUSH_NOTIFICATION_ENABLE\` and \`GOVCMS_DRUSH_RECIPIENTS\`, and I set those at handover precisely because \`dblog\` is a disallowed module, so \`drush watchdog:show\` is not there as a fallback.`,
    },
    {
      q: "The whole site has gone slow. No 500s, no errors in the Drupal log, content is correct. Where do you look?",
      a: `I work outward through the layers rather than opening Drupal: Akamai and the purge module in front, then Varnish, then Redis, then php, then mariadb. The GovCMS-specific answer is Redis, because \`lagoon.settings.php\` wraps the connect-and-ping in a \`try\` and the \`catch\` sets \`$settings['cache']['default'] = 'cache.backend.null'\` — you do not degrade to the database cache the way a hand-rolled site would, you degrade to no cache at all. The signature is telling: it is uniform, it includes the admin UI and authenticated traffic, nothing is logged as an error, and it clears without a deploy once Redis answers again. A mariadb problem looks different — specific views and specific queries, usually with slow-query evidence — and an nginx problem does not slow rendered pages at all. Naming the container first is what stops you spending an afternoon profiling PHP that is behaving perfectly.`,
    },
  ],

  quiz: [
    {
      question:
        "The av service in the GovCMS scaffold's docker-compose.yml is labelled lagoon.type: none. What does that mean?",
      options: [
        "Lagoon deploys the container but routes no traffic to it",
        "The service exists only in production and is stubbed out locally",
        "Lagoon does not deploy that service from your compose file at all",
        "The service runs without any persistent volume attached",
      ],
      answerIndex: 2,
      explain:
        "lagoon.type: none tells Lagoon to ignore the service when it builds the environment. Locally it is a real container you can read logs from; on the platform your only handle on the scanner is the HTTPAV_ENDPOINT variable and whatever Drupal logs about it. The same label is on test and chrome.",
    },
    {
      question:
        "The AV endpoint stops responding. With GovCMS defaults, what happens to a file upload?",
      options: [
        "It is rejected — the scan returns 'unchecked' and allow_unchecked defaults to false",
        "It succeeds and the file is queued for scanning on the next cron run",
        "It succeeds, because an unreachable scanner is treated as a clean result",
        "It is rejected with the message 'A virus has been detected in the file'",
      ],
      answerIndex: 0,
      explain:
        "httpav has three outcomes: clean, infected and unchecked. A connection failure produces unchecked, and because allow_unchecked defaults to false the validation subscriber adds a violation and the upload fails. The message is 'The anti-virus scanner could not check the file' — the virus-detected wording is a different branch entirely.",
    },
    {
      question: "Which statement about Solr on GovCMS is correct?",
      options: [
        "It is provisioned by default and only on PaaS",
        "It is unavailable on SaaS; Dockerfile.solr exists only for paas and saasplus",
        "It is provisioned automatically as soon as search_api_solr is enabled",
        "It is available on all three scaffold types but ships commented out in docker-compose.yml",
      ],
      answerIndex: 3,
      explain:
        "Dockerfile.solr.saas, .solr.saasplus and .solr.paas all exist, so the capability is not offering-specific — but the solr service is commented out with '# Uncomment to enable solr.' Enabling a Drupal module never provisions a container, and on SaaS docker-compose.yml is a locked file, so the change has to come from the platform side.",
    },
    {
      question:
        "Redis becomes unreachable on a GovCMS environment. What does the platform's settings code do?",
      options: [
        "Falls back to Drupal's database cache backend",
        "Falls back to cache.backend.null, leaving the site with no cache backend",
        "Aborts the bootstrap so the failure is visible as a 500",
        "Keeps serving from the last known Redis connection via APCu",
      ],
      answerIndex: 1,
      explain:
        "lagoon.settings.php connects and pings inside a try; the catch loads redis-unavailable.services.yml, which defines cache.backend.null, and sets it as the default cache backend. The site stays up and stays correct, but nothing is cached — which is why the symptom is uniform slowness with an empty error log rather than a visible failure.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "lagoon-mental-model",
  title: "Lagoon: Your Branch Is the Environment",
  part: "Lagoon: Deploy & Run",
  estMinutes: 13,
  summary:
    "On GovCMS there is no deploy command: Lagoon watches a Finance-run GitLab repo, matches your branch against a regex held in its own API, and rebuilds an entire Kubernetes environment from Git — which is why an SSH edit is never a fix.",

  concept: `
## Where the deploy button went

Lagoon is not something you run. It is a set of services on Kubernetes — GovCMS runs them on AWS EKS — watching a Git repository. Your project repo lives in the Department of Finance's own GitLab instance at \`projects.govcms.gov.au\`; the Lagoon API and SSH endpoint are on \`govcms.amazee.io\`, and the dashboard is \`dashboard.govcms.gov.au\`. There is no rsync target, no \`drush @prod deploy\` from your laptop, no build server you own.

The routing rule is not in your repo. A Lagoon project holds a \`branches\` value — a **regular expression** — and a \`productionEnvironment\` name, both stored in the Lagoon API. On a push webhook Lagoon tests the branch name against that regex. Match, and it checks out that SHA and builds. No match, and *nothing happens at all* — no build, no error, no notification. That silence is the most common "why hasn't my site updated" support ticket.

An environment takes its name from the branch. The scaffold ships a wildcard Drush alias at \`drush/sites/feature.site.yml\` whose host is \`ssh-lagoon.govcms.amazee.io\` on port \`30831\`, built on exactly that convention: branch \`feature/search-facets\` becomes environment \`feature-search-facets\`.

### Two environment types, and what they actually switch

Lagoon itself sets exactly two: \`production\` and \`development\`. Whichever environment name matches \`productionEnvironment\` gets the first; every other gets the second. It arrives in every container as \`LAGOON_ENVIRONMENT_TYPE\`. There is a third value the platform never emits: \`.env.default\` seeds \`LAGOON_ENVIRONMENT_TYPE=local\` for your own Docker Compose stack, and \`govcms-config-import\` string-matches it exactly to decide whether \`config/local\` is imported (section 11). Lagoon itself treats the two platform values nearly identically — but the GovCMS deploy scripts branch hard on them:

- \`govcms-db-backup\` exits with \`[skip]: Non-production environment.\`, and \`govcms-config-backup\` with \`[skip]: Configuration backup can only be done on production.\`
- \`govcms-db-sync\` refuses on production, and off production pulls the database down through the \`@govcms.prod\` alias — but only when the environment is a canary, the branch matches \`internal-govcms-update*\`, the site cannot bootstrap (a first deploy), or \`GOVCMS_DEPLOY_WORKFLOW_CONTENT\` is \`import\`; the default is \`retain\` (section 15)
- \`govcms-enable_modules\` enables \`stage_file_proxy\` off production and uninstalls \`google_tag\`

### What a rollout replaces

Lagoon *parses* \`docker-compose.yml\`; it never runs it. The \`lagoon.type\` labels decide what becomes a Kubernetes workload, and \`lagoon.type: none\` (the scaffold's \`test\`, \`chrome\` and \`av\` services) means "ignore this service completely". Build produces new images; Kubernetes then starts new pods and terminates the old ones.

Anything in a pod's filesystem that did not come from the image and does not sit on a declared volume dies with that pod. GovCMS declares one:

\`\`\`yaml
labels:
  lagoon.type: nginx-php-persistent
  lagoon.persistent: /app/web/sites/default/files/
\`\`\`

Shared by \`cli\`, \`nginx\` and \`php\` — which is why \`file_private_path\` is \`sites/default/files/private\`, inside the public tree. There is only the one volume to put it on.

So yes, where you have SSH access to the environment — PaaS, or the platform team acting on your behalf; on SaaS you do not (section 17) — you can get a shell and patch a Twig template. The site is fixed until the next rollout, an idle wake-up, a node drain or a platform patch — then the fix vanishes and was never in Git. Treat every container as read-only outside \`sites/default/files\`.

One ordering trap: pre-rollout tasks run on the **currently running** pods, so they cannot use code from the commit being deployed, and they do not run at all on an environment's first deploy. Post-rollout tasks run on the new pods.

### GovCMS 3.x / Drupal 10

The model is identical: same Lagoon, same \`.lagoon.yml\` shape, same branch-is-the-environment rule. What differs is which \`scaffold-tooling\` branch you read the scripts from — \`10.x-develop\` rather than \`11.x-develop\` — and the image tags the compose file resolves.
`,

  comparisons: [
    {
      label: "Standing up a second environment",
      intro:
        "You need a shareable environment for a feature branch so a content team can review it. On your own infrastructure you provision it; on GovCMS you push and the platform decides.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: you own the box, so you build the environment by hand
# (or with the Ansible/deployer role that encodes these steps).
ssh deploy@stage.example.gov.au

cd /var/www/example
sudo -u www-data git fetch --all --prune
sudo -u www-data git checkout feature/search-facets
sudo -u www-data composer install --no-dev --optimize-autoloader

sudo -u www-data drush -r web sql:sync @prod @self -y
sudo -u www-data drush -r web rsync @prod:%files @self:%files -y
sudo -u www-data drush -r web deploy -y

sudo ln -sf /etc/nginx/sites-available/stage.example.gov.au \\
  /etc/nginx/sites-enabled/stage.example.gov.au
sudo systemctl reload nginx`,
      ts: `# GovCMS: pushing the branch IS the deploy. There is no other action.
git push origin feature/search-facets

# You watch it; you do not drive it.
lagoon config add --lagoon govcms \\
  --hostname ssh-lagoon.govcms.amazee.io \\
  --graphql https://api-lagoon.govcms.amazee.io/graphql \\
  --port 30831 \\
  --ui https://dashboard.govcms.gov.au
lagoon config default -l govcms

lagoon list projects
lagoon list environments --project agency-site

# If the branch name does not match the project's "branches" regex held
# in the Lagoon API, this push builds nothing and reports no error.
# Getting that regex changed is a request to GovCMS, not a commit.`,
      note: "The environment name is derived from the branch (feature/search-facets -> feature-search-facets); the DB copy you did by hand is done for you by the post-rollout govcms-db-sync task, which skips production entirely.",
    },
    {
      label: "Per-environment settings",
      intro:
        "Every Drupal site needs different settings in staging and production. The difference is who chooses the switch and who owns the file that reads it.",
      php: `// Vanilla web/sites/default/settings.php -- your file, your convention.
$settings['config_sync_directory'] = '../config/sync';
$settings['hash_salt'] = trim(file_get_contents('/etc/example/hash_salt'));

// You invent the environment variable AND you set it, in systemd or nginx.
$env = getenv('APP_ENV') ?: 'prod';

if (file_exists(__DIR__ . "/settings.$env.php")) {
  include __DIR__ . "/settings.$env.php";
}

if ($env !== 'prod') {
  $config['system.logging']['error_level'] = 'verbose';
  $config['stage_file_proxy.settings']['origin'] = 'https://www.example.gov.au';
  $settings['cache']['bins']['render'] = 'cache.backend.null';
}`,
      ts: `// scaffold-tooling drupal/settings/settings.php -- vendored, and on SaaS
// not a file you can edit. Lagoon SETS the variable; you only read it.
if (getenv('LAGOON_ENVIRONMENT_TYPE') && getenv('LAGOON_ENVIRONMENT_TYPE') == 'production') {
  // production.settings.php is included from here.
}

// drupal/settings/development.settings.php -- loaded off production only.
switch (getenv('GOVCMS_PROJECT_TYPE')) {
  case 'paas':
    $cluster = 'govcms6';
    break;

  default:
    $cluster = 'govcms5';
    break;
}

$config['environment_indicator.indicator']['name'] = 'Non-production';

if (getenv('STAGE_FILE_PROXY_URL')) {
  $config['stage_file_proxy.settings']['origin'] = getenv('STAGE_FILE_PROXY_URL');
}
elseif (getenv('LAGOON_PROJECT')) {
  $config['stage_file_proxy.settings']['origin'] =
    'https://nginx-master-' . getenv('LAGOON_PROJECT') . ".{$cluster}.amazee.io";
}`,
      note: "On the platform LAGOON_ENVIRONMENT_TYPE is production or development and nothing else -- there is no 'uat' type. Locally .env.default seeds a third value, local, which govcms-config-import matches exactly before importing config/local. That default origin string also tells you the shape of an autogenerated Lagoon route: nginx-<environment>-<project>.<cluster>.amazee.io.",
    },
    {
      label: "Hotfixing a live site",
      intro:
        "A template is emitting broken markup on production at 4pm. Both columns get you a shell. Only one of them is a fix.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla: the disk is the source of truth until someone overwrites it.
ssh deploy@www.example.gov.au

sudo -u www-data vi \\
  /var/www/example/web/themes/custom/agency/templates/node--alert.html.twig
sudo -u www-data drush -r /var/www/example/web cr

# It stays. Bad practice, drifts from git, but it genuinely holds
# until the next release overwrites the file.`,
      ts: `# GovCMS PaaS: you can get a shell into the running pod.
lagoon ssh -p agency-site -e master -s cli
# equivalently, without the CLI:
#   ssh -p 30831 -t agency-site-master@ssh-lagoon.govcms.amazee.io service=cli

vi /app/web/themes/custom/agency/templates/node--alert.html.twig
drush cr

# The edit is real -- and it lives exactly as long as this pod does.
# Next push, an idle wake-up, a node drain or a platform patch replaces
# the pod from the image, and the change is gone with no trace in git.

# The only fix that survives a rollout:
git checkout -b hotfix/alert-template master
git commit -am "Fix alert template markup"
git push origin hotfix/alert-template
# ...then merge to master, because master is the production environment.`,
      note: "The pod filesystem outside /app/web/sites/default/files is effectively read-only: it is rebuilt from the image on every rollout, so an SSH edit is a diagnostic, never a remediation.",
    },
    {
      label: "State that has to outlive a container",
      intro:
        "Cron and private files are host concerns on a server you own. On Lagoon both have to be declared in files the platform reads at build time.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `# Vanilla: create the private directory anywhere off the docroot.
sudo mkdir -p /var/www/private/example
sudo chown www-data:www-data /var/www/private/example
sudo chmod 750 /var/www/private/example
# settings.php: $settings['file_private_path'] = '/var/www/private/example';

# Vanilla: cron is a crontab on the host.
sudo crontab -u www-data -e
# 0 * * * * /usr/local/bin/drush -r /var/www/example/web cron
# 15 2 * * * /usr/local/bin/drush -r /var/www/example/web sql:dump \\
#   --result-file=/var/backups/example-$(date +%F).sql`,
      ts: `# .lagoon.yml -- cron is declared per environment. On SaaS this file is
# one of the locked files: a push that changes it is declined.
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli

# docker-compose.yml -- Lagoon parses these labels, it never runs the file.
services:
  cli:
    labels:
      lagoon.type: cli-persistent
      lagoon.persistent.name: nginx
      lagoon.persistent: /app/web/sites/default/files/
  nginx:
    labels:
      lagoon.type: nginx-php-persistent
      lagoon.persistent: /app/web/sites/default/files/
  av:
    labels:
      lagoon.type: none`,
      note: "There is one persistent volume, so file_private_path is sites/default/files/private -- inside the public tree, protected by Drupal's private stream rather than by being off-docroot. The 'M' in the schedule tells Lagoon to pick a random minute so sites do not stampede the hour.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of the branch router: match each branch against the project's regex, derive the environment, then trace a rollout and see which files survive it.",
    lang: "php",
    code: `<?php

// These four values live in the Lagoon API, NOT in your repository.
$project = [
  'name' => 'agency-site',
  'branches' => '#^(master|develop|feature/.+)$#',
  'productionEnvironment' => 'master',
  'cluster' => 'govcms5',
];

// These come from docker-compose.yml labels, which Lagoon parses (never runs).
$services = [
  ['cli', 'cli-persistent', '/app/web/sites/default/files/'],
  ['nginx', 'nginx-php-persistent', '/app/web/sites/default/files/'],
  ['php', 'nginx-php-persistent', '/app/web/sites/default/files/'],
  ['mariadb', 'mariadb', '/var/lib/mysql'],
  ['av', 'none', '-'],
  ['test', 'none', '-'],
];

function route(array $p, string $branch): array {
  if (!preg_match($p['branches'], $branch)) {
    return ['no', '-', '-', 'nothing built, no error reported'];
  }
  $env = strtolower(str_replace('/', '-', $branch));
  $type = ($branch === $p['productionEnvironment']) ? 'production' : 'development';
  $url = 'nginx-' . $env . '-' . $p['name'] . '.' . $p['cluster'] . '.amazee.io';
  return ['yes', $env, $type, $url];
}

echo "BRANCH ROUTER  project=" . $project['name'] . "  regex=" . $project['branches'] . "\\n";
printf("%-22s %-8s %-22s %-12s %s\\n", 'BRANCH', 'DEPLOY', 'ENVIRONMENT', 'TYPE', 'ROUTE');

foreach (['master', 'develop', 'feature/search-facets', 'hotfix/csp', 'jason-wip'] as $b) {
  list($deploy, $env, $type, $url) = route($project, $b);
  printf("%-22s %-8s %-22s %-12s %s\\n", $b, $deploy, $env, $type, $url);
}

echo "\\nSERVICES  (lagoon.type decides what becomes a Kubernetes workload)\\n";
printf("%-10s %-22s %-9s %s\\n", 'SERVICE', 'LAGOON.TYPE', 'DEPLOYED', 'PERSISTENT PATH');

foreach ($services as $s) {
  printf("%-10s %-22s %-9s %s\\n", $s[0], $s[1], $s[1] === 'none' ? 'no' : 'yes', $s[2]);
}

// A rollout starts new pods from the freshly built image and kills the old ones.
$files = [
  ['web/themes/custom/agency/agency.info.yml', 'image (git)'],
  ['web/sites/default/files/2026/report.pdf', 'declared volume'],
  ['web/themes/custom/agency/templates/node--alert.html.twig', 'ssh edit'],
  ['app/hotfix-notes.txt', 'ssh edit'],
];

echo "\\nROLLOUT  feature-search-facets: pod-7f4c terminated, pod-9ab1 started\\n";
printf("%-58s %-17s %s\\n", 'PATH', 'ORIGIN', 'AFTER ROLLOUT');

foreach ($files as $f) {
  $survives = ($f[1] === 'ssh edit') ? 'GONE' : 'present';
  printf("%-58s %-17s %s\\n", $f[0], $f[1], $survives);
}

echo "\\nRULE: a file survives only if the image rebuilt it or a declared volume held it.\\n";`,
    output: `BRANCH ROUTER  project=agency-site  regex=#^(master|develop|feature/.+)$#
BRANCH                 DEPLOY   ENVIRONMENT            TYPE         ROUTE
master                 yes      master                 production   nginx-master-agency-site.govcms5.amazee.io
develop                yes      develop                development  nginx-develop-agency-site.govcms5.amazee.io
feature/search-facets  yes      feature-search-facets  development  nginx-feature-search-facets-agency-site.govcms5.amazee.io
hotfix/csp             no       -                      -            nothing built, no error reported
jason-wip              no       -                      -            nothing built, no error reported

SERVICES  (lagoon.type decides what becomes a Kubernetes workload)
SERVICE    LAGOON.TYPE            DEPLOYED  PERSISTENT PATH
cli        cli-persistent         yes       /app/web/sites/default/files/
nginx      nginx-php-persistent   yes       /app/web/sites/default/files/
php        nginx-php-persistent   yes       /app/web/sites/default/files/
mariadb    mariadb                yes       /var/lib/mysql
av         none                   no        -
test       none                   no        -

ROLLOUT  feature-search-facets: pod-7f4c terminated, pod-9ab1 started
PATH                                                       ORIGIN            AFTER ROLLOUT
web/themes/custom/agency/agency.info.yml                   image (git)       present
web/sites/default/files/2026/report.pdf                    declared volume   present
web/themes/custom/agency/templates/node--alert.html.twig   ssh edit          GONE
app/hotfix-notes.txt                                       ssh edit          GONE

RULE: a file survives only if the image rebuilt it or a declared volume held it.
`,
  },

  keyPoints: [
    "The branch-to-environment rule lives in the Lagoon API as a `branches` regex plus a `productionEnvironment` name — not in your repo — so a push to a non-matching branch builds nothing and reports no error at all.",
    "An environment is named after its branch (`feature/search-facets` becomes `feature-search-facets`), and the scaffold's wildcard Drush alias at `drush/sites/feature.site.yml` is built on exactly that convention.",
    "Lagoon sets only two environment types on the platform, `production` and `development`, exposed as `LAGOON_ENVIRONMENT_TYPE` — locally `.env.default` seeds a third, `local`, which gates the `config/local` partial import; GovCMS's deploy scripts branch on it — backups only on production, `govcms-db-sync` only off it.",
    "Lagoon parses `docker-compose.yml` without running it: `lagoon.type` labels choose the Kubernetes workload, and `lagoon.type: none` (the scaffold's `test`, `chrome`, `av`) makes Lagoon ignore a service entirely.",
    "Pods are ephemeral. GovCMS declares a single persistent volume, `lagoon.persistent: /app/web/sites/default/files/`, which is why `file_private_path` sits inside the public tree — so an SSH edit anywhere else disappears at the next rollout, idle wake-up or node drain.",
    "Pre-rollout tasks execute on the pods still running the old code and are skipped entirely on an environment's first deploy; post-rollout tasks run on the new pods.",
  ],

  interview: [
    {
      q: "A client says their staging site hasn't picked up a change they pushed two hours ago. Walk me through your diagnosis.",
      a: "My first question is whether Lagoon ever saw the push, not whether the build failed. The project's `branches` setting in the Lagoon API is a regular expression, and a branch that doesn't match produces no build, no failure and no notification — so I'd check the Lagoon dashboard for a deployment against that environment before I looked at a single log line. If there's no deployment record, the branch name is the bug and getting the regex widened is a request to GovCMS, not a commit I can make. If there *is* a deployment, I read the task output at both ends of it. A pre-rollout task that fails stops Lagoon before the rollout ever starts, so the old pods keep serving and the site is genuinely unchanged — that's the one that looks like \"nothing happened\". A post-rollout failure is the more dangerous one, because Lagoon only runs those after the new pods are live and their health checks have passed: the code is already new while the database update or config import may never have run, so you're half-deployed rather than not deployed.",
    },
    {
      q: "Someone on your team SSHed into the production cli pod and patched a Twig file to stop an error. What do you tell them?",
      a: "That it isn't a fix, it's a diagnostic, and the clock is already running on it. The pod's filesystem outside `/app/web/sites/default/files/` is rebuilt from the image on every rollout, and pods also get replaced by node drains and platform patching that nobody on our side schedules — so the change will vanish, silently, at a time we don't control and with no record in Git. Practically I'd have them capture the diff immediately, open a hotfix branch off `master`, and let the normal rollout carry it. The reason it feels safe to people coming from single-server Drupal is that on a VM the disk *is* the source of truth; on Lagoon the Git branch is, and the container is a disposable rendering of it.",
    },
    {
      q: "What does `LAGOON_ENVIRONMENT_TYPE` actually change on a GovCMS site?",
      a: "On the platform it's only ever `production` or `development` — whichever environment name matches the project's `productionEnvironment` gets the first; locally `.env.default` seeds a third value, `local`, which is what gates the `config/local` partial import. Lagoon itself does very little with it, but the GovCMS deploy scripts do a lot: `govcms-db-backup` bails out with `[skip]: Non-production environment.` and `govcms-config-backup` with `[skip]: Configuration backup can only be done on production.`, `govcms-db-sync` refuses to run on production and otherwise pulls the production database down through the `@govcms.prod` alias, and `govcms-enable_modules` turns on `stage_file_proxy` off production while uninstalling `google_tag`. The practical consequence people trip over is that a brand-new environment gets production's database on its first deploy and then nothing after that: `govcms-db-sync` prints `[skip]: Site can be bootstrapped and the content workflow is not set to \"import\".` unless the environment is a canary, an `internal-govcms-update*` branch, or `GOVCMS_DEPLOY_WORKFLOW_CONTENT` is `import` — the default is `retain`.",
    },
    {
      q: "How do you get a scheduled job or a writable directory onto a GovCMS site?",
      a: "Both are declared, not created. Cron goes in `.lagoon.yml` under `environments.<name>.cronjobs` with a `name`, `schedule`, `command` and `service` — and Lagoon's extended crontab syntax lets you write `M * * * *` so it picks a random minute and sites don't all fire on the hour. Writable storage comes from the `lagoon.persistent` labels in `docker-compose.yml`, and GovCMS declares exactly one volume at `/app/web/sites/default/files/`, shared by `cli`, `nginx` and `php`. That's why the private file path lives *inside* the public tree at `sites/default/files/private` — there's nowhere else durable to put it. On SaaS both files are locked, so anything new there is a support request; on PaaS `.lagoon.yml` is yours to edit, and its own comment names PaaS users and the support team as its editors.",
    },
  ],

  quiz: [
    {
      question:
        "You push to a branch named `jason-wip`. The project's Lagoon `branches` setting is `^(master|develop|feature/.+)$`. What happens?",
      options: [
        "Lagoon builds the environment but marks the deployment as failed",
        "Lagoon creates the environment and applies the `development` type by default",
        "Nothing at all — no build is triggered and no error is reported",
        "The build starts and stops at the pre-rollout tasks, since no environment exists yet",
      ],
      answerIndex: 2,
      explain:
        "Lagoon only processes a push if the branch matches the project's branch regex. A non-matching branch produces no build, no failure and no notification — which is why \"my push did nothing\" is almost always a branch-name problem rather than a build problem.",
    },
    {
      question:
        "Which statement about pre-rollout tasks in `.lagoon.yml` is correct?",
      options: [
        "They run on the pods currently serving traffic, so they cannot use code from the commit being deployed, and they are skipped on a first deploy",
        "They run on the newly built pods before traffic is switched to them",
        "They run on the build container, which has the new code but no database access",
        "They run after the images are pushed but before any post-rollout task, on whichever pod Kubernetes schedules first",
      ],
      answerIndex: 0,
      explain:
        "Lagoon executes pre-rollout tasks in the already-running pods, which is why they need existence checks for their own binaries and why they don't run on a first deployment — there is nothing running yet. Post-rollout tasks are the ones that get the new code.",
    },
    {
      question:
        "The scaffold's `docker-compose.yml` labels the `av`, `test` and `chrome` services with `lagoon.type: none`. What does that mean on the platform?",
      options: [
        "They are deployed but with no persistent storage attached",
        "They are deployed only to development environments, never production",
        "They are deployed as init containers that exit after the rollout completes",
        "Lagoon ignores those services completely — they exist for local Docker Compose only",
      ],
      answerIndex: 3,
      explain:
        "`lagoon.type: none` tells Lagoon to skip the service entirely; Lagoon parses the compose file to learn what to deploy and simply passes over anything typed `none`. Those services still start locally under Docker Compose, which is exactly why the label exists.",
    },
    {
      question:
        "Why does a GovCMS site set `file_private_path` to `sites/default/files/private`, inside the public files tree, rather than somewhere off the web root?",
      options: [
        "Because Drupal 11 removed support for private paths outside the configured public path",
        "Because the environment has one declared persistent volume, mounted at `/app/web/sites/default/files/` — anything written elsewhere in the pod dies with the pod",
        "Because the nginx container has no read access to paths above `/app/web`",
        "Because Shipshape fails any site whose private path is not a subdirectory of the public path",
      ],
      answerIndex: 1,
      explain:
        "The compose labels declare a single persistent volume at `/app/web/sites/default/files/`, shared by `cli`, `nginx` and `php`. Private files have to live on that volume to survive a rollout, so they go underneath it and rely on Drupal's private stream wrapper for protection rather than on being outside the web root.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "php-runtime-tuning",
  title: "PHP Runtime: OPcache, APCu & FPM",
  part: "Data, Queries & Runtime",
  estMinutes: 12,
  summary:
    "Tune the PHP runtime under Drupal — OPcache sized for a huge codebase, APCu for the class loader and fast cache bins, the realpath cache, and a PHP-FPM pool sized on measured memory rather than guesswork.",

  concept: `
## The cheapest performance work you will ever do

Everything else in this course changes what Drupal *does*. This section
changes how fast PHP *runs it*, and it is almost entirely transferable: the
knobs are identical to the ones you would set under Symfony. The difference is
scale. A Drupal 10/11 site with a normal contrib stack is 25,000–40,000 PHP
files, and the shipped defaults are sized for something far smaller.

## OPcache: give it room, then stop stat-ing

Two defaults are actively wrong for Drupal.

\`opcache.memory_consumption\` defaults to 128 MB. Core plus a real contrib
stack will not fit; when the arena fills, OPcache evicts and recompiles.
Give it 256–512 MB.

\`opcache.max_accelerated_files\` defaults to 10000 — fewer slots than you have
files. Worse, PHP silently rounds the value up to the next entry in a fixed
list of primes (…7963, 16229, 32531, 65407…), so "10000" really means 16229.
Count your files and set a value whose rounded size clears it comfortably.

Then turn off revalidation. \`opcache.validate_timestamps=0\` stops PHP calling
\`stat()\` on every included file on every request — tens of thousands of
syscalls saved. The catch is that PHP will now never notice new code, so a
deploy **must** reset OPcache or reload FPM.

This is safe in Drupal specifically because core does not rely on timestamps
for the PHP it generates at runtime (compiled Twig templates, the compiled
service container). \`Drupal\\Component\\Utility\\OpCodeCache::invalidate()\` calls
\`opcache_invalidate(\$pathname, TRUE)\` — the forced form, which works regardless
of \`validate_timestamps\`.

One setting you must **not** change: \`opcache.save_comments\` has to stay at its
default of 1, because annotation-based plugin discovery reads doc comments.

## The realpath cache is not a rounding error

Drupal resolves an enormous number of paths per request. \`realpath_cache_size\`
defaults to 4096K and \`realpath_cache_ttl\` to 120 seconds. On a large site that
buffer overflows mid-request and paths get re-resolved. Push it to 4096k–8192k
with a TTL of 3600 in production — deploys reload FPM anyway, so a long TTL
costs you nothing.

## APCu: the class loader and the fast bins

Two independent uses, both worth having:

- **Class loader.** \`\$settings['class_loader_auto_detect']\` defaults to TRUE:
  if APCu is loaded, Composer's ClassLoader gets an APCu-backed classmap.
- **Fast cache bins.** \`ChainedFastBackendFactory\` automatically selects
  \`cache.backend.apcu\` as its fast tier whenever \`apcu_fetch()\` exists, which
  is what makes the bootstrap, config and discovery bins cheap even with Redis
  as the consistent backend behind them.

Keys are namespaced by \`Settings::getApcuPrefix()\`. The related setting
\`\$settings['apcu_ensure_unique_prefix']\` defaults to TRUE, deriving a per-site
prefix from the hash salt and site path so two sites on one box cannot read
each other's entries. Set it to FALSE only for a multisite that shares one
codebase and *should* share APCu items.

## FPM: size on measured private memory, not on memory_limit

\`memory_limit\` is a per-request ceiling, not the memory a worker uses. Sizing
\`pm.max_children\` by dividing RAM by \`memory_limit\` throws away most of your
capacity. Subtract the *shared* allocations from total RAM (OPcache and APCu
are allocated once, not per child), then divide by the average **private**
memory of a real child. Measure private memory specifically — the RSS column
counts each child's share of those same shared segments, so dividing by RSS
double-counts them and hands you back a pool that is too small. \`smem -P
php-fpm -k\` (the USS column) or the \`Private_*\` lines in
\`/proc/<pid>/smaps_rollup\` give you the honest number.
Then set \`pm.max_requests\` to recycle children, and turn on
\`slowlog\` with \`request_slowlog_timeout\` — it dumps a PHP backtrace of whatever
is slow, which finds a pathological View faster than any profiler.
`,

  comparisons: [
    {
      label: "php.ini for production",
      intro:
        "The same file, the same directives, different magnitudes. Symfony's defaults-plus-preload approach does not port to Drupal, and one Drupal-specific directive must be left alone.",
      php: `; php.ini - Symfony 6/7 production
opcache.enable=1
opcache.memory_consumption=256
opcache.max_accelerated_files=20000
opcache.interned_strings_buffer=16

; Symfony's docs recommend disabling timestamp checks in prod.
opcache.validate_timestamps=0

; Symfony ships a generated preload script (symfony/runtime writes
; var/cache/prod/App_KernelProdContainer.preload.php). Preloading
; links classes into shared memory once, at FPM start.
opcache.preload=/var/www/app/config/preload.php
opcache.preload_user=www-data

; Defaults are fine here for a few thousand files.
realpath_cache_size=4096K
realpath_cache_ttl=120

memory_limit=256M`,
      ts: `; php.ini - Drupal 10/11 production
; (Drupal 10 needs PHP 8.1+, Drupal 11 needs PHP 8.3+)
opcache.enable=1

; 128M default will not hold core + contrib. Watch opcache_get_status()
; for wasted_memory / oom_restarts and raise until they stay at zero.
opcache.memory_consumption=512
opcache.interned_strings_buffer=32

; Default 10000 rounds up to only 16229 slots. A D10 site with contrib
; is commonly 30k+ files, so ask for 50000 -> 65407 real slots.
opcache.max_accelerated_files=50000

; Safe here: core calls opcache_invalidate(\$file, TRUE) via
; OpCodeCache::invalidate() for the PHP it generates at runtime.
; NON-NEGOTIABLE: your deploy must now reset OPcache.
opcache.validate_timestamps=0
opcache.revalidate_freq=0   ; only consulted when validate_timestamps=1

; REQUIRED by Drupal: annotation-based plugin discovery reads doc
; comments. Leave this at its default of 1 or the site will not boot.
opcache.save_comments=1

; Drupal resolves a LOT of paths. This one genuinely matters.
realpath_cache_size=8192k
realpath_cache_ttl=3600

; Per-request ceiling. 128M-256M; do NOT size the pool from this number.
memory_limit=256M

; No opcache.preload: Drupal core ships no preload script, and preloading
; a codebase that writes PHP at runtime is a known foot-gun.`,
      note: "opcache.save_comments is the one directive that is a Drupal correctness requirement rather than a tuning choice — stripping comments breaks annotation discovery.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "APCu: who owns the key prefix",
      intro:
        "Both frameworks use APCu for a class map and for a hot local cache tier. Symfony makes you name and version the namespace; Drupal derives one for you and lets you opt out.",
      php: `<?php
// Symfony: APCu is explicit, and the namespace is YOUR problem.
//
//   composer install --apcu-autoloader
//     -> Composer\\Autoload\\ClassLoader::setApcuPrefix() with a random hash
//
// config/packages/framework.yaml:
//   framework:
//     cache:
//       app: cache.adapter.apcu

use Symfony\\Component\\Cache\\Adapter\\ApcuAdapter;

$pool = new ApcuAdapter(
  namespace: 'incidents',
  defaultLifetime: 3600,
  // The third argument is the real deploy knob: change $version and
  // every key in the namespace is logically discarded at once.
  version: $_SERVER['GIT_SHA'] ?? 'dev',
);

// Multiple sites on one box sharing an APCu segment? You must give them
// different namespaces yourself, or they will read each other's data.`,
      ts: `<?php
// sites/default/settings.php

// 1. Class loader. Default is TRUE: when the APCu extension is detected,
//    Composer's ClassLoader is optimised to use it.
//    Set FALSE if you deploy with --classmap-authoritative, because the
//    classmap is already complete and APCu only adds lookup overhead.
$settings['class_loader_auto_detect'] = FALSE;

// 2. Key namespacing. Default TRUE. Settings::getApcuPrefix() builds a
//    per-site prefix from the hash salt, app root and site path, so two
//    sites on one server can never see each other's APCu entries.
//    Set FALSE only for a multisite that shares one codebase and SHOULD
//    share APCu items.
$settings['apcu_ensure_unique_prefix'] = TRUE;

// 3. The prefix also folds in the deployment identifier. Bump it every
//    release so stale discovery data cannot survive a code change.
$settings['deployment_identifier'] = getenv('GIT_SHA') ?: 'dev';

// 4. You do NOT wire APCu into the fast cache tier by hand.
//    ChainedFastBackendFactory defaults its fast backend to
//    cache.backend.apcu whenever apcu_fetch() exists, and core already
//    tags the bootstrap/config/discovery bins with cache.backend.chainedfast.
//    So you only declare the CONSISTENT backend:
$settings['cache']['default'] = 'cache.backend.redis';
// -> APCu in front (per-web-head, microsecond reads),
//    Redis behind (shared, authoritative). Nothing else to configure.`,
      note: "The chained-fast pattern is why APCu is safe on multi-server Drupal: the APCu tier is only a local read cache, with a shared consistent backend as the source of truth.",
    },
    {
      label: "The deploy script that makes validate_timestamps=0 survivable",
      intro:
        "With timestamp checks off, deploying new code is a no-op until something resets OPcache. The critical trap is identical in both stacks: your CLI tool runs in a different process with a different OPcache.",
      php: `#!/usr/bin/env bash
set -euo pipefail

# Symfony production deploy
composer install --no-dev --optimize-autoloader --classmap-authoritative

APP_ENV=prod php bin/console cache:clear
APP_ENV=prod php bin/console cache:warmup

# bin/console ran under the CLI SAPI: its own OPcache, its own APCu
# segment. FPM has not noticed a single byte of the new code.
cachetool opcache:reset --fcgi=/run/php/php8.3-fpm.sock

# Or, more bluntly (and atomically enough for most setups):
systemctl reload php8.3-fpm`,
      ts: `#!/usr/bin/env bash
set -euo pipefail

# Drupal 10/11 production deploy.
# --optimize-autoloader        : build a full classmap (no filesystem probing)
# --classmap-authoritative     : never fall back to PSR-4 scanning at all
# --no-dev                     : leave phpunit/drupal-dev out of the classmap
composer install --no-dev --optimize-autoloader --classmap-authoritative

# drush deploy runs, in order:
#   updatedb -> config:import -> cache:rebuild -> deploy:hook
#   (plus cache:warm on Drupal 11.2+)
drush deploy

# drush is a CLI process. Its opcache_reset() would clear the CLI cache
# that is about to be thrown away, and touch nothing in FPM.
# There is no drush command that can reset the FPM opcode cache.
cachetool opcache:reset      --fcgi=/run/php/php8.3-fpm.sock
cachetool apcu:cache:clear   --fcgi=/run/php/php8.3-fpm.sock

# Belt and braces: reload drops stale children gracefully.
systemctl reload php8.3-fpm

# Sanity check that the pool really is warm again.
drush status --field=drupal-version`,
      note: "Forgetting the OPcache reset with validate_timestamps=0 is the classic 'I deployed and nothing changed' outage — and it fails silently, so put it in the pipeline, not in a runbook.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Sizing the FPM pool",
      intro:
        "Identical directives, but Drupal's heavier per-request profile and long tail of slow admin/View requests change which ones you actually care about.",
      php: `; /etc/php/8.3/fpm/pool.d/symfony.conf
[symfony]
user = www-data
listen = /run/php/php8.3-fpm.sock

pm = dynamic
pm.max_children = 40
pm.start_servers = 8
pm.min_spare_servers = 4
pm.max_spare_servers = 12
pm.max_requests = 500

php_admin_value[memory_limit] = 256M`,
      ts: `; /etc/php/8.3/fpm/pool.d/drupal.conf
[drupal]
user = www-data
listen = /run/php/php8.3-fpm.sock

; A busy news site is never idle, and forking under a traffic spike is
; exactly when you cannot afford it. static keeps the workers resident.
pm = static

; (RAM - OS - opcache.memory_consumption - apc.shm_size) / MEASURED PRIVATE mem.
; NOT RAM / memory_limit - that under-provisions by 2-3x.
;
; Measure PRIVATE memory, not the RSS column: RSS includes each child's
; share of the OPcache/APCu segments you just subtracted, so dividing by
; it double-counts shared memory and under-provisions the pool.
;   smem -P php-fpm -k                       # read USS (or PSS), not RSS
;   awk '/^Private/ {s+=$2} END {print s/1024" MB"}' /proc/<pid>/smaps_rollup
pm.max_children = 56

; Recycle children so a leak in one contrib module cannot accumulate.
pm.max_requests = 1000

; Real-time pool depth. Alert on 'listen queue' > 0 - that is requests
; waiting for a free child, and it is the number that predicts an outage.
pm.status_path = /fpm-status

; Kill runaway requests; must be >= any legitimate batch/cron request.
request_terminate_timeout = 120s

; The single most useful debugging line in this file: dumps a full PHP
; backtrace for any request over the threshold. Finds the bad View.
slowlog = /var/log/php-fpm/drupal-slow.log
request_slowlog_timeout = 5s

; memory_limit is PHP_INI_ALL, so php_admin_value locks it against ini_set.
php_admin_value[memory_limit] = 256M

; realpath_cache_* are PHP_INI_SYSTEM - php_value CANNOT set them here,
; it must be php_admin_value (or php.ini).
php_admin_value[realpath_cache_size] = 8192k
php_admin_value[realpath_cache_ttl] = 3600`,
      note: "php_value only accepts PHP_INI_USER/PHP_INI_ALL directives; realpath_cache_size and realpath_cache_ttl are PHP_INI_SYSTEM so a pool must set them with php_admin_value. The opcache.* sizes cannot be set per pool at all — the SHM segment is allocated once by the FPM master at startup, so they belong in php.ini.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    intro:
      "The three sums you should do before touching a production PHP config: how many workers actually fit, what throughput that buys, and whether OPcache has a slot for every file. Predict the numbers before you run it.",
    lang: "php",
    code: `<?php
// Sizing PHP-FPM and OPcache for the incident site. Pure arithmetic -
// no Drupal, no server. This is the maths to do BEFORE you edit a pool.

// --- 1. How many php-fpm children actually fit? ----------------------
$totalMb     = 8192;  // app server RAM
$reservedMb  = 2048;  // OS, nginx, agents, headroom for spikes
$opcacheMb   = 512;   // opcache.memory_consumption - shared, allocated ONCE
$apcuMb      = 256;   // apc.shm_size - shared, allocated ONCE
$privateMb   = 96;    // MEASURED private memory (USS) of one child, NOT ps RSS
$memoryLimit = 256;   // php memory_limit - a per-request CEILING, not a size

$forWorkers = $totalMb - $reservedMb - $opcacheMb - $apcuMb;

$measured = intdiv($forWorkers, $privateMb);
$naive    = intdiv($forWorkers, $memoryLimit);

echo "== pm.max_children ==\\n";
printf("RAM available to workers : %d MB\\n", $forWorkers);
printf("sized on private mem     : %d children  (%d MB each)\\n", $measured, $privateMb);
printf("sized on memory_limit    : %d children  (%d MB each)\\n", $naive, $memoryLimit);
printf("difference               : %.1fx the capacity, same hardware\\n", $measured / $naive);

// --- 2. Turn children into throughput (Little's law) -----------------
echo "\\n== capacity at pm.max_children = $measured ==\\n";
$profiles = [
  'anon, page cache HIT'    => 0.008,
  'anon, dynamic page'      => 0.120,
  'authenticated, uncached' => 0.450,
];
foreach ($profiles as $name => $seconds) {
  printf("%-24s %6.3f s/req -> %7.1f req/s\\n", $name, $seconds, $measured / $seconds);
}
echo "Every request Varnish answers is a child you did not have to buy.\\n";

// --- 3. Does OPcache have room for the whole codebase? ---------------
// PHP rounds opcache.max_accelerated_files UP to the next value in this
// fixed set of primes - the hash table size it will really use.
$primes = [223, 463, 983, 1979, 3907, 7963, 16229, 32531, 65407,
           130987, 262237, 524521, 1048793];

function actual_slots(int $requested, array $primes): int {
  foreach ($primes as $p) {
    if ($p >= $requested) {
      return $p;
    }
  }
  return end($primes);
}

echo "\\n== opcache.max_accelerated_files ==\\n";
$phpFiles = 34120; // find . -name '*.php' | wc -l   on a real D10 site + contrib
printf("PHP files in the codebase: %d\\n", $phpFiles);
foreach ([10000, 20000, 50000] as $requested) {
  $slots = actual_slots($requested, $primes);
  printf(
    "  set %-6d -> %6d slots  %s\\n",
    $requested,
    $slots,
    $slots >= $phpFiles
      ? 'OK'
      : 'THRASHING: ' . ($phpFiles - $slots) . ' files evicted and recompiled'
  );
}
`,
    output: `== pm.max_children ==
RAM available to workers : 5376 MB
sized on private mem     : 56 children  (96 MB each)
sized on memory_limit    : 21 children  (256 MB each)
difference               : 2.7x the capacity, same hardware

== capacity at pm.max_children = 56 ==
anon, page cache HIT      0.008 s/req ->  7000.0 req/s
anon, dynamic page        0.120 s/req ->   466.7 req/s
authenticated, uncached   0.450 s/req ->   124.4 req/s
Every request Varnish answers is a child you did not have to buy.

== opcache.max_accelerated_files ==
PHP files in the codebase: 34120
  set 10000  ->  16229 slots  THRASHING: 17891 files evicted and recompiled
  set 20000  ->  32531 slots  THRASHING: 1589 files evicted and recompiled
  set 50000  ->  65407 slots  OK
`,
  },

  keyPoints: [
    "OPcache defaults are sized for small apps: raise opcache.memory_consumption from 128M to 256–512M and set max_accelerated_files above your real file count, remembering PHP rounds it up to the next prime in a fixed list (…16229, 32531, 65407…).",
    "opcache.validate_timestamps=0 removes a stat() per included file per request and is safe in Drupal because OpCodeCache::invalidate() calls opcache_invalidate($file, TRUE) for runtime-generated PHP — but the deploy must then reset OPcache or reload FPM, and no drush command can do it (drush runs under the CLI SAPI with its own cache).",
    "Never change opcache.save_comments from its default of 1: annotation-based plugin discovery reads doc comments, so stripping them breaks the site.",
    "realpath_cache_size (default 4096K) and realpath_cache_ttl (default 120) genuinely matter for Drupal's file count — 8192k / 3600 in production. They are PHP_INI_SYSTEM, so in an FPM pool they need php_admin_value, not php_value.",
    "APCu serves two roles: $settings['class_loader_auto_detect'] (default TRUE) gives Composer's ClassLoader an APCu classmap, and ChainedFastBackendFactory automatically picks cache.backend.apcu as the fast tier for the bootstrap/config/discovery bins. $settings['apcu_ensure_unique_prefix'] defaults to TRUE so co-hosted sites cannot collide.",
    "Size pm.max_children by subtracting the shared OPcache and APCu segments from RAM, then dividing by a child's measured private memory (USS via smem, or the Private_* lines in /proc/<pid>/smaps_rollup) — not the ps RSS column, which re-counts those shared segments. Dividing RAM by memory_limit under-provisions by 2–3x. Add pm.max_requests, pm.status_path and slowlog with request_slowlog_timeout.",
  ],

  interview: [
    {
      q: "You set opcache.validate_timestamps=0 on a Drupal site. What breaks, and what do you have to add to the deploy?",
      a: "Nothing breaks at runtime — that is the point. PHP stops calling `stat()` on every included file on every request, which on a 30,000-file Drupal codebase is a large syscall saving. What breaks is *deployment*: PHP will never notice that the files on disk changed, so new code simply does not take effect. The deploy pipeline has to explicitly reset OPcache — via `cachetool opcache:reset --fcgi=...`, an FPM reload, or a protected endpoint calling `opcache_reset()`. The trap is assuming `drush` can do it: drush runs under the CLI SAPI, so it has a completely separate OPcache from your FPM pool and clearing its own cache achieves nothing. It is also worth knowing *why* this is safe in Drupal — core generates PHP at runtime (compiled Twig templates, the compiled service container) and invalidates those files explicitly through `OpCodeCache::invalidate()`, which calls `opcache_invalidate($pathname, TRUE)`; the forced form works regardless of the `validate_timestamps` setting.",
    },
    {
      q: "How do you decide pm.max_children for a Drupal PHP-FPM pool?",
      a: "Not from `memory_limit` — that is a per-request ceiling that almost no request reaches, and sizing from it typically costs you two-thirds of your capacity. Start from total RAM, subtract what the OS and nginx need plus real headroom, and subtract the *shared* segments: `opcache.memory_consumption` and `apc.shm_size` are allocated once for the whole pool, not per child. Then divide the remainder by the measured average *private* memory of a real php-fpm child under production traffic — `smem -P php-fpm -k` and average the USS column, or sum the `Private_*` lines in `/proc/<pid>/smaps_rollup`. The detail people get wrong is reaching for `ps` and averaging RSS: RSS includes each child's share of the OPcache and APCu segments you already subtracted, so you double-count shared memory and end up with a pool that is too small — the same under-provisioning mistake as sizing from `memory_limit`, just less obvious. On a busy site I would also set `pm = static` so there is no fork latency exactly when a traffic spike arrives, cap `pm.max_requests` to bound leaks in contrib code, and expose `pm.status_path` so I can alert on the listen queue — a non-zero listen queue means requests are waiting for a worker, and it is the metric that actually predicts an outage.",
    },
    {
      q: "Where does APCu fit in a Drupal caching stack, and is it safe on a multi-server setup?",
      a: "It fits in two places. First the class loader: `$settings['class_loader_auto_detect']` defaults to TRUE, so if APCu is present Composer's `ClassLoader` gets an APCu-backed classmap. Second, and more interestingly, the fast cache tier — `ChainedFastBackendFactory` automatically selects `cache.backend.apcu` as its fast backend whenever `apcu_fetch()` exists, and core tags the bootstrap, config and discovery bins with the chained-fast backend. That chained design is exactly what makes it multi-server safe: APCu is only a per-web-head read cache in front of a shared consistent backend like Redis, with a last-write timestamp used to detect staleness, so it is never the source of truth. What you should *not* do is set APCu as `$settings['cache']['default']` on a multi-server site, because then each web head has its own divergent authoritative cache. Keys are namespaced by `Settings::getApcuPrefix()`, and `$settings['apcu_ensure_unique_prefix']` defaults to TRUE so co-hosted sites cannot read each other's entries.",
    },
    {
      q: "Why do you run composer install with --optimize-autoloader --classmap-authoritative at deploy, and what should you change alongside it?",
      a: "By default Composer resolves PSR-4 classes by converting the namespace to a path and hitting the filesystem, which means a `file_exists()` probe per candidate directory for every class that has not been loaded yet. `--optimize-autoloader` (`-o`) pre-builds a complete classmap so each class is one array lookup. `--classmap-authoritative` (`-a`) goes further and tells the autoloader that if a class is not in the map it does not exist, removing the PSR-4 filesystem fallback entirely. Both are safe in Drupal as long as you rebuild on every deploy and nothing generates classes at runtime outside the map. Alongside it, consider setting `$settings['class_loader_auto_detect'] = FALSE`, because an authoritative classmap is already a complete in-memory lookup and the APCu class-loader layer just adds a round trip. Never use `-a` in development, where new files appear constantly.",
    },
  ],

  quiz: [
    {
      question:
        "You set opcache.max_accelerated_files = 20000 on a site with 34,000 PHP files. What actually happens?",
      options: [
        "PHP allocates exactly 20000 slots and refuses to start if more files are requested",
        "PHP rounds the value up to the next prime in a fixed list (32531 slots), which is still short — so files are evicted and recompiled under load",
        "The value is ignored because OPcache sizes itself from opcache.memory_consumption",
        "PHP rounds down to 16229 slots and logs a warning at startup",
      ],
      answerIndex: 1,
      explain:
        "OPcache's script hash table can only be one of a fixed set of prime sizes (…7963, 16229, 32531, 65407…), and PHP rounds the requested value up to the next one. 20000 becomes 32531 slots — silently, with no warning — leaving ~1,500 files without a slot, so they are evicted and recompiled repeatedly. Check opcache_get_status() for num_cached_scripts against max_cached_keys rather than trusting the number you typed.",
    },
    {
      question:
        "With opcache.validate_timestamps=0 in production, which command resets the OPcache that PHP-FPM is actually using?",
      options: [
        "drush cache:rebuild",
        "drush php:eval 'opcache_reset();'",
        "cachetool opcache:reset --fcgi=/run/php/php8.3-fpm.sock (or systemctl reload php8.3-fpm)",
        "composer dump-autoload --optimize",
      ],
      answerIndex: 2,
      explain:
        "drush runs under the CLI SAPI, which has its own separate OPcache — clearing that has no effect on the FPM pool serving web traffic, and drush cache:rebuild clears Drupal's caches, not PHP's opcode cache. You need something that talks to the FPM process itself: cachetool over the FastCGI socket, an FPM reload, or a locked-down web endpoint calling opcache_reset().",
    },
    {
      question:
        "In a PHP-FPM pool file, why does `php_value[realpath_cache_size] = 8192k` silently fail to take effect?",
      options: [
        "realpath_cache_size can only be set in .user.ini files",
        "realpath_cache_size is PHP_INI_SYSTEM, and php_value can only set PHP_INI_USER / PHP_INI_ALL directives — it needs php_admin_value",
        "The value must be given in bytes, not with a 'k' suffix",
        "FPM pools cannot override any INI directive; only php.ini can",
      ],
      answerIndex: 1,
      explain:
        "PHP-FPM's php_value is limited to directives with PHP_INI_USER or PHP_INI_ALL changeability. realpath_cache_size and realpath_cache_ttl are PHP_INI_SYSTEM, so they must be set with php_admin_value in the pool (or directly in php.ini). Using php_value produces no error and no effect, which is why this one is so easy to miss.",
    },
    {
      question:
        "Which OPcache directive must be left at its default value for Drupal to work correctly?",
      options: [
        "opcache.save_comments — annotation-based plugin discovery reads doc comments",
        "opcache.revalidate_freq — Drupal requires the default of 2 seconds",
        "opcache.interned_strings_buffer — raising it corrupts the render cache",
        "opcache.enable_cli — Drupal requires it enabled for drush",
      ],
      answerIndex: 0,
      explain:
        "Drupal's plugin system can discover plugins from doc-comment annotations, so opcache.save_comments must stay at its default of 1. Stripping comments makes annotation-based plugin definitions invisible and the site will not boot. The other three are ordinary tuning knobs with no correctness requirement attached.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "matrix-and-caching",
  title: "Matrix Builds & Dependency Caching",
  part: "CI with GitHub Actions",
  estMinutes: 11,
  summary:
    "strategy.matrix fans one job definition out across Node versions and runners, and dependency caching (setup-node's cache: npm, or explicit actions/cache) stops every run from re-downloading the world.",

  concept: `
Two problems show up as soon as CI is doing real work. First: you need to test
against more than one runtime version — and you remember exactly how that went
in the PHP days: a second vhost on the staging box running PHP 7.4, SSH in, run
the test suite by hand, forget to do it for three months. Second: every CI run
starts on a **fresh virtual machine**, so \`npm ci\` re-downloads every package
every single time. GitHub Actions has one tool for each.

### strategy.matrix: one job definition, many jobs

A **matrix** turns a single job into a grid of jobs, one per combination:

\`\`\`yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci && npm test
\`\`\`

Each key under \`matrix:\` is a variable; each value in its list spawns a job.
Inside the job you read the current value with \`\${{ matrix.node-version }}\`.
Two keys multiply: \`node-version: [20, 22]\` × \`os: [ubuntu-latest,
ubuntu-22.04]\` is a **2×2 grid = 4 jobs**, all running in parallel on separate
runners. It's the "test on every PHP version" chore turned into four lines of
YAML that run on every push.

Two knobs worth knowing at mention level:

- **\`fail-fast\`** defaults to \`true\`: the moment one matrix job fails, the
  others are cancelled. Set \`fail-fast: false\` when you want the full picture
  ("passes on Node 22, fails on 20") instead of the fastest red light.
- **\`exclude\`** removes specific combinations from the grid (and \`include\`
  adds extras) — useful when one pairing is meaningless or unsupported.

### Caching: the fresh-VM tax

On your old server, \`vendor/\` and \`node_modules/\` just *stayed there*
between deploys. A CI runner is a brand-new machine every run — nothing
persists. Without caching, a decent-sized app spends minutes of every run
re-downloading identical packages.

The easy path for Node is built into setup-node:

\`\`\`yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm        # also accepts yarn / pnpm
\`\`\`

Under the hood this is **actions/cache@v5** with sensible defaults: it caches
npm's global download cache (\`~/.npm\` — *not* \`node_modules\`), keyed on a
**hash of your lockfile**. Same \`package-lock.json\` → cache hit → \`npm ci\`
installs from local disk in seconds. Change the lockfile → new key → one slow
run repopulates the cache.

### Explicit actions/cache for everything else

For anything setup-* actions don't cover (pip, composer, build artefacts), use
\`actions/cache@v5\` directly:

\`\`\`yaml
- uses: actions/cache@v5
  with:
    path: ~/.cache/pip
    key: pip-\${{ runner.os }}-\${{ hashFiles('requirements.txt') }}
    restore-keys: |
      pip-\${{ runner.os }}-
\`\`\`

\`key\` is the exact-match lookup. \`restore-keys\` are prefix fallbacks: if no
cache matches the exact key (you just changed \`requirements.txt\`), the most
recent cache starting with \`pip-Linux-\` is restored instead — a *stale but
mostly-right* cache, so pip only downloads the packages that changed. The job
then saves a fresh cache under the new exact key for next time.

Matrix and cache interact nicely: each matrix job resolves its own key, so the
Node 20 and Node 22 jobs can share or split caches depending on whether the
version is part of the key.
`,

  comparisons: [
    {
      label: "Testing against multiple runtime versions",
      intro:
        "The app must work on Node 20 and Node 22. The old way was a second server kept on the old version and a human remembering to test there.",
      php: `# The 2010s ritual: a vhost frozen on the old PHP
$ ssh deploy@legacy-staging.example.com
$ php -v
PHP 7.4.33 (cli)
$ cd /var/www/app && git pull && ./vendor/bin/phpunit
# ...run again next quarter, maybe.
# The PHP 8.1 box is a DIFFERENT server with
# different extensions and a different php.ini.`,
      ts: `# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test`,
      note: "The matrix spawns one isolated job per version on every push — no long-lived 'old PHP box' to maintain, and fail-fast: false shows results for both versions even if one fails.",
    },
    {
      label: "Cold npm ci vs cached npm ci",
      intro:
        "Identical workflow, one line different. The runner is a fresh VM either way — the cache is what carries state between runs.",
      php: `# no cache: every run downloads everything
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: npm ci
    # added 812 packages in 3m 58s
    # ...on EVERY push, forever`,
      ts: `# cache: npm — one extra line
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v4
    with:
      node-version: 22
      cache: npm
  - run: npm ci
    # cache restored from key:
    #   node-cache-Linux-x64-npm-9f3b2a…
    # added 812 packages in 9s`,
      note: "cache: npm is actions/cache@v5 preconfigured: it stores ~/.npm keyed on the lockfile hash — roughly 4 minutes down to seconds on a hit, and the key changes automatically when package-lock.json does.",
      leftLang: "yaml",
    },
    {
      label: "Keeping dependencies around between runs",
      intro:
        "On the old server, vendor/ survived because the machine survived. In CI you declare what to keep, and where the fallback comes from.",
      php: `# the server IS the cache — vendor/ persists
$ ssh deploy@prod.example.com
$ cd /var/www/app
$ composer install
# 'Nothing to install, update or remove'
# ...because it ran on this box in 2019.
# Fast, but nobody knows if a fresh
# install would even succeed.`,
      ts: `# .github/workflows/test.yml (python job)
- uses: actions/cache@v5
  with:
    path: ~/.cache/pip
    key: pip-\${{ runner.os }}-\${{ hashFiles('requirements.txt') }}
    restore-keys: |
      pip-\${{ runner.os }}-
- run: pip install -r requirements.txt`,
      note: "key is the exact match; restore-keys is the prefix fallback that restores the newest near-miss cache when requirements.txt changed — a warm start instead of a cold one, then a fresh save under the new key.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A 2×2 matrix: two Node versions across two runner images, with dependency caching on. Before checking the output, predict: how many jobs run, and for a push where package-lock.json did NOT change, which cache key hits — the exact key or a restore-key?",
    code: `# .github/workflows/test.yml
name: test
on: push

jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        node-version: [20, 22]
        os: [ubuntu-latest, ubuntu-22.04]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm test`,
    output: `$ gh run watch
✓ test (20, ubuntu-latest)   1m04s
✓ test (20, ubuntu-22.04)    1m07s
✓ test (22, ubuntu-latest)   58s
✓ test (22, ubuntu-22.04)    1m02s

4 jobs — one per cell of the 2×2 matrix (2 node versions × 2 runners),
all spawned from a single job definition and run in parallel.

Log excerpt from "test (22, ubuntu-latest)":
  Run actions/setup-node@v4
    Found in cache @ /opt/hostedtoolcache/node/22.17.0/x64
    Cache restored successfully
    Cache restored from key: node-cache-Linux-x64-npm-9f3b2ac41d…
  Run npm ci
    added 812 packages in 8s

The lockfile is unchanged, so its hash is unchanged, so the EXACT key
(node-cache-{platform}-{arch}-npm-{lockfileHash}) matches. No restore-key
is involved at all: prefix fallbacks are a feature you configure on an
explicit actions/cache step — setup-node's built-in cache is an
exact-key lookup that reports hit or miss via its cache-hit output.`,
  },

  keyPoints: [
    "`strategy.matrix` fans one job definition into one job per combination; read the current value with `${{ matrix.node-version }}`. Two axes multiply: 2 versions × 2 OSes = 4 parallel jobs.",
    "`fail-fast` defaults to true (first failure cancels the rest of the matrix); `exclude`/`include` prune or extend the grid.",
    "CI runners are fresh VMs — nothing persists between runs. Caching is how you opt specific paths back into persistence.",
    "For Node, prefer `cache: npm` on actions/setup-node@v4 — it's actions/cache@v5 preconfigured to store `~/.npm` (not node_modules), keyed on the lockfile hash.",
    "With explicit actions/cache@v5, `key` is the exact lookup and `restore-keys` are prefix fallbacks that restore the newest near-miss cache for a warm start.",
    "A changed lockfile means a changed hash, one slow cache-miss run, then fast hits again — the cache invalidates itself off your dependency files.",
  ],

  interview: [
    {
      q: "How would you test a Node app against multiple Node versions in GitHub Actions?",
      a: "With a build matrix. I declare `strategy.matrix.node-version: [20, 22]` on the job and pass `${{ matrix.node-version }}` into actions/setup-node — GitHub spawns one isolated job per version, in parallel, on every push. If I also need multiple OSes I add a second axis and the matrix takes the cross product. I usually set `fail-fast: false` on test matrices because I want to know *which* versions fail, not just that one did; and `exclude` lets me drop combinations that don't make sense. It replaces the old practice of keeping a second server pinned to the old runtime and testing there by hand.",
    },
    {
      q: "CI runs are slow because npm ci takes four minutes every time. What do you do?",
      a: "Cache the dependency downloads. Runners are fresh VMs, so by default every run re-downloads every package. For Node the fix is one line: `cache: npm` on actions/setup-node@v4. Under the hood that's actions/cache@v5 caching npm's global cache directory, keyed on a hash of package-lock.json — identical lockfile means a cache hit and npm ci completes in seconds; a changed lockfile means one slow run that saves the new cache. For ecosystems without a setup action I use actions/cache directly with a `hashFiles()` key and `restore-keys` prefix fallbacks so even a changed lockfile starts warm. Important nuance: we cache the download cache, not node_modules — npm ci still does a clean install, just from local disk.",
    },
    {
      q: "What's the difference between key and restore-keys in actions/cache?",
      a: "`key` must match exactly for a hit, and it's also the name the job saves the new cache under. `restore-keys` are ordered prefix matches used only when the exact key misses — the action restores the most recent cache whose key starts with that prefix. The pattern is: exact key includes the lockfile hash, restore-key is everything up to the hash. So when dependencies change, you don't fall off a cliff to a fully cold install — you restore the previous, mostly-correct cache, install just the delta, and save a fresh cache under the new exact key.",
    },
  ],

  quiz: [
    {
      question:
        "A job has matrix: { node-version: [20, 22], os: [ubuntu-latest, ubuntu-22.04] }. How many jobs run?",
      options: [
        "2 — one per node version",
        "4 — the cross product of both axes",
        "1 — the matrix values are passed as arrays to one job",
        "8 — each combination runs twice for reliability",
      ],
      answerIndex: 1,
      explain:
        "Matrix axes multiply: every node-version is paired with every os, so 2 × 2 = 4 jobs, each on its own runner in parallel. exclude: can remove specific cells from that grid.",
    },
    {
      question: "What does `cache: npm` on actions/setup-node@v4 actually cache?",
      options: [
        "The node_modules directory, restored as-is",
        "The built application output",
        "npm's global download cache (~/.npm), keyed on a hash of the lockfile",
        "The Node.js binary itself",
      ],
      answerIndex: 2,
      explain:
        "It's actions/cache@v5 preconfigured to store npm's download cache keyed on package-lock.json's hash. npm ci still performs a clean install — it's just installing from local disk instead of the network, which is also why it's safer than caching node_modules.",
    },
    {
      question:
        "You changed package-lock.json and pushed. What happens to the dependency cache on that run (assuming restore-keys are configured)?",
      options: [
        "The exact key misses, a restore-key restores the newest previous cache, and a new cache is saved under the new key",
        "The run fails until someone manually clears the cache",
        "The old cache is used as-is and the new packages are ignored",
        "Nothing is restored — caches are deleted whenever any file changes",
      ],
      answerIndex: 0,
      explain:
        "The key embeds the lockfile hash, so it changes with the file. restore-keys prefix-match the newest older cache for a warm start, the install fetches only the delta, and the post-job save writes a cache under the new exact key — self-invalidating and self-healing.",
    },
  ],
};

export default lesson;

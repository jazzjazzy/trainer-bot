import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "rollbacks",
  title: "Rollbacks: Undo in Under a Minute",
  part: "Deploy & Operate",
  estMinutes: 12,
  summary:
    "Immutable, tagged images make rollback a redeploy of the previous tag — one command, under a minute — but database migrations need expand/contract discipline to survive it.",

  concept: `
Every deploy system is really judged on one moment: **the bad release**. The
new version is up, errors are spiking, and the clock is running. In the FTP
era this moment meant archaeology — "who has a copy of the old files?" —
followed by re-uploading whatever you could reconstruct, over the top of the
broken version, live.

Immutable images delete that entire genre of panic. Every release you ever
deployed still exists, byte-for-byte, as a tagged image in the registry — and
usually on the server's own disk too. **Rolling back is redeploying the
previous tag.** Nothing is rebuilt, nothing is reconstructed.

### The mechanics

Three prerequisites, all cheap:

1. **Deploy pinned tags, never bare \`:latest\`.** Tag images with the commit
   (\`sha-9f8e7d1\`) or a semver (\`v2.4.1\`) so "the previous version" is a
   precise, unambiguous name. \`:latest\` is whatever won the last push race —
   you cannot roll back to "the previous latest".
2. **Keep N previous images around.** The registry keeps every pushed tag;
   your image-prune policy on the server should spare the last week or so.
   A rollback to an image already on disk skips the pull entirely.
3. **Make the tag a parameter.** The production compose file reads
   \`image: ghcr.io/acme/api:\${TAG}\` — so which version runs is a variable,
   not an edit.

Then rollback is literally:

\`\`\`bash
TAG=sha-9f8e7d1 docker compose up -d
\`\`\`

For a team, wrap it in a \`workflow_dispatch\` workflow that takes a tag input —
rollback becomes a button in the GitHub UI with an audit trail of who pressed
it and when, instead of a 3am SSH session.

### The hard part: the database

Here is the truth interviewers probe for: **your database does not roll back
with your code.** Rolling back the image does not un-run the migration the bad
release applied. If v2's migration dropped or renamed a column that v1 reads,
redeploying v1 lands on a schema it cannot use — the rollback itself breaks
production.

The discipline that fixes this is **expand/contract** (backwards-compatible
migrations). Never make a schema change and the code that requires it in one
step. Instead:

- **Expand**: add the new column/table alongside the old. Old code ignores it,
  new code writes both. Deploy this first — v1 and v2 both work.
- **Migrate**: backfill data, switch reads to the new column.
- **Contract**: only after the new code has been stable for a while, ship a
  later release that drops the old column.

At every step, the current release *and the previous one* work against the
live schema — so a code rollback is always safe. It costs you patience: a
rename becomes three deploys instead of one. What it buys is the ability to
say "roll back" without checking a migrations folder first.

### What a rollback does not fix

Be precise in interviews: rollback reverts *code*. Bad data written by the bad
release, emails it sent, external side effects — those need forward fixes.
That is why fast rollback matters: the shorter the bad release lives, the less
mess it makes.
`,

  comparisons: [
    {
      label: "The bad release, two eras",
      intro:
        "Release day went wrong and errors are spiking. Both teams need the previous version back — one has to find it first.",
      php: `# 11pm, production is broken
# Where is the old code? Nobody tagged anything.
cd /backups
ls -lt site-backup-*.tar.gz | head -3
# site-backup-2011-06-30.tar.gz   <- last night, probably ok?
tar -xzf site-backup-2011-06-30.tar.gz -C /tmp/restore
# diff it against prod to see what last night even WAS
diff -rq /tmp/restore /var/www/html | head
# copy files back over the broken release, live, by hand
cp -r /tmp/restore/* /var/www/html/
# ...and the schema change? mysql, by memory, at 11pm.`,
      ts: `# 11pm, production is broken
# Every release still exists as an immutable tagged image.
docker images ghcr.io/acme/api --format 'table {{.Tag}}\\t{{.CreatedSince}}'
# sha-3e5f9c2   5 minutes ago    <- the bad one
# sha-9f8e7d1   2 days ago       <- known good
# sha-4c2b8aa   9 days ago

TAG=sha-9f8e7d1 docker compose up -d
# Image is already on disk: no pull, no build, no
# reconstruction. Old version serving in seconds.`,
      rightLang: "bash",
      note:
        "The rollback target isn't 'whatever the backup script caught' — it's the exact bytes that were running two days ago, still present and still named. Undo becomes a redeploy, not a restoration project.",
    },
    {
      label: "Rollback as an audited button",
      intro:
        "Making rollback something any on-call teammate can do safely: a manually-triggered workflow that takes the target tag as input.",
      php: `# The old 'process': find the person with the files
# 03:12 <ops> site is down after the deploy
# 03:14 <ops> anyone still have the old build??
# 03:20 <dave> i think i have it on my laptop
# 03:31 <dave> uploading over ftp now, slow hotel wifi
# 03:55 <dave> ok most files are up, check now?
# No record of what was restored, or whether it
# matched what was running before.`,
      ts: `# .github/workflows/rollback.yml
name: Rollback
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Image tag to roll back to (e.g. sha-9f8e7d1)"
        required: true
jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Redeploy previous tag
        env:
          SSH_KEY: \${{ secrets.DEPLOY_SSH_KEY }}
        run: |
          install -m 600 /dev/null key && echo "\$SSH_KEY" > key
          ssh -i key -o StrictHostKeyChecking=accept-new \\
            deploy@\${{ secrets.DEPLOY_HOST }} \\
            "cd /srv/app && TAG=\${{ github.event.inputs.tag }} \\
             docker compose pull && \\
             TAG=\${{ github.event.inputs.tag }} docker compose up -d"`,
      note:
        "workflow_dispatch gives rollback a UI button, an input for the exact tag, and an audit log of who rolled back to what and when — instead of Dave's laptop and hotel wifi.",
    },
    {
      label: "Schema changes that survive a rollback",
      intro:
        "The app needs users.name split into first/last. One approach makes rollback impossible; expand/contract keeps both the new and previous release working at every step.",
      php: `# One-shot migration, applied with the deploy
mysql -u root -p app <<'SQL'
ALTER TABLE users ADD first_name VARCHAR(80);
ALTER TABLE users ADD last_name  VARCHAR(80);
UPDATE users SET first_name = SUBSTRING_INDEX(name,' ',1),
                 last_name  = SUBSTRING_INDEX(name,' ',-1);
ALTER TABLE users DROP COLUMN name;   -- point of no return
SQL
# Now the previous release CRASHES on this schema
# (it selects 'name'). Rolling back the code is no
# longer enough — you'd be hand-reverting DDL at 3am.`,
      ts: `-- Expand/contract: three releases, each rollback-safe
-- Release 1 (EXPAND): add columns, old code unaffected
ALTER TABLE users ADD COLUMN first_name VARCHAR(80);
ALTER TABLE users ADD COLUMN last_name  VARCHAR(80);
-- new code writes BOTH old and new columns

-- Release 2 (MIGRATE): backfill, switch reads
UPDATE users SET first_name = split_part(name, ' ', 1),
                 last_name  = split_part(name, ' ', 2)
WHERE first_name IS NULL;
-- new code now reads first/last, still writes both

-- Release 3 (CONTRACT): days later, once stable
ALTER TABLE users DROP COLUMN name;
-- by now no deployable release reads 'name'`,
      rightLang: "sql",
      note:
        "At every step the current AND previous release work against the live schema, so `TAG=<old> docker compose up -d` is always safe. The rename costs three deploys — that's the price of a one-minute rollback.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The bad-release transcript. sha-3e5f9c2 just shipped and its healthcheck is failing. Follow the timestamps on the health log lines and predict the total user-facing downtime before you read the answer at the bottom.",
    code: `# On the VPS. Three releases are on disk:
docker images ghcr.io/acme/api

# The deploy that just happened (14:02:04):
# TAG=sha-3e5f9c2 docker compose up -d
docker compose ps api
docker inspect --format '{{json .State.Health.Log}}' app-api-1 | head -c 400

# The one-line rollback:
TAG=sha-9f8e7d1 docker compose up -d

docker compose ps api`,
    output: `$ docker images ghcr.io/acme/api
REPOSITORY         TAG           IMAGE ID       CREATED          SIZE
ghcr.io/acme/api   sha-3e5f9c2   b41c2f9d80aa   8 minutes ago    142MB
ghcr.io/acme/api   sha-9f8e7d1   77aa31c04b2e   2 days ago       141MB
ghcr.io/acme/api   sha-4c2b8aa   d0e19a7c55f3   9 days ago       141MB

$ docker compose ps api
NAME        IMAGE                          STATUS
app-api-1   ghcr.io/acme/api:sha-3e5f9c2   Up 55 seconds (unhealthy)

$ docker inspect --format '{{json .State.Health.Log}}' app-api-1 | head -c 400
[{"Start":"2026-07-07T14:02:11Z","ExitCode":1,"Output":"connect ECONNREFUSED"},
 {"Start":"2026-07-07T14:02:26Z","ExitCode":1,"Output":"connect ECONNREFUSED"},
 {"Start":"2026-07-07T14:02:41Z","ExitCode":1,"Output":"connect ECONNREFUSED"},
 {"Start":"2026-07-07T14:02:56Z","ExitCode":1,"Output":"connect ECONNREFUSED"}]

$ TAG=sha-9f8e7d1 docker compose up -d
[+] Running 2/2
 ✔ Container app-db-1   Running                        0.0s
 ✔ Container app-api-1  Started                        1.2s

$ docker compose ps api
NAME        IMAGE                          STATUS
app-api-1   ghcr.io/acme/api:sha-9f8e7d1   Up 9 seconds (healthy)

# Downtime: first failed check 14:02:11, rollback issued ~14:03:00,
# old image already on disk so no pull — healthy again by 14:03:10.
# Total: roughly ONE MINUTE, most of it a human noticing.
# The FTP-era equivalent started with "who has the old files?"`,
  },

  keyPoints: [
    "Rollback with immutable images = redeploy the previous tag: `TAG=sha-9f8e7d1 docker compose up -d`. No rebuilds, no backup archaeology.",
    "Deploy pinned tags (commit SHA or semver), never bare `:latest` — you cannot roll back to 'the previous latest'.",
    "Keep the last week or so of images on the server (tune your prune filter) so rollbacks skip even the pull.",
    "A `workflow_dispatch` workflow with a tag input turns rollback into an audited button any on-call teammate can press.",
    "Databases do not roll back with code: use expand/contract migrations so the current and previous release both work against the live schema at every step.",
    "Rollback reverts code, not consequences — bad data written by the bad release still needs a forward fix, which is why speed matters.",
  ],

  interview: [
    {
      q: "How do you roll back a bad deployment?",
      a: "With immutable images, rollback is redeploying the previous tag. We deploy pinned tags — commit SHAs or semver, never bare `:latest` — through a compose file that reads the tag from a variable, so rollback is `TAG=sha-9f8e7d1 docker compose up -d`, and since we keep recent images on the server there's usually not even a pull. For team use I'd wrap that in a `workflow_dispatch` GitHub Actions workflow taking the tag as input, so rollback is a button with an audit trail. The critical caveat is the database: the image rolls back, the schema doesn't, which is why we write backwards-compatible migrations. In practice a bad release is fully reverted in under a minute, most of which is a human deciding to do it.",
    },
    {
      q: "You rolled back the app, but the bad release had already run a migration. What happens, and how do you design around it?",
      a: "If that migration was destructive — dropped or renamed a column the old code reads — the rollback itself breaks, because v1 is now running against a schema it doesn't understand. The design answer is expand/contract: schema changes are split so that each deploy is additive first. Expand adds the new column while old code ignores it and new code writes both; then we backfill and switch reads; and only releases later, once nothing deployable reads the old column, does a contract migration drop it. The invariant is that the current and previous release always work against the live schema, so code rollbacks never depend on un-running DDL. It turns a rename into three deploys — that's the deliberate price of one-minute rollbacks.",
    },
    {
      q: "Why is deploying `:latest` to production considered an anti-pattern?",
      a: "Because `:latest` is a moving pointer, not a version. You lose the ability to say precisely what's running — two servers can pull `:latest` minutes apart and get different images — and you lose rollback, because there's no 'previous latest' to name. It also fights caching and reproducibility: the same compose file gives different results on different days. Pinned tags like `sha-9f8e7d1` make every deploy an exact, immutable, auditable artifact, which is the entire foundation of fast rollbacks. `:latest` is fine on a laptop for a quick experiment; in production the tag should be a fact, not a hope.",
    },
  ],

  quiz: [
    {
      question:
        "What makes rollback nearly instant in an image-based deploy system?",
      options: [
        "Docker containers restart faster than Apache",
        "The previous release still exists as an immutable tagged image — rollback is redeploying that tag",
        "The registry automatically reverts to the previous push",
        "Compose keeps a snapshot of the old container's filesystem",
      ],
      answerIndex: 1,
      explain:
        "Every deployed version remains in the registry (and usually on the server's disk) under a precise tag. Rolling back is pointing the compose file at the old tag and running up -d — no rebuild, no restore, often no pull.",
    },
    {
      question:
        "Why can't you deploy bare `:latest` and still have reliable rollbacks?",
      options: [
        "latest images are deleted when a new one is pushed",
        "latest is a moving pointer — there is no addressable 'previous latest' to roll back to",
        "Compose refuses to restart a service already on latest",
        "Registries only keep one tag per image",
      ],
      answerIndex: 1,
      explain:
        "Rollback requires naming the previous version exactly. A pinned tag (commit SHA, semver) is a permanent address; :latest is overwritten by every push, so the previous version has no name.",
    },
    {
      question:
        "In the expand/contract pattern, when is it safe to drop the old column?",
      options: [
        "In the same migration that adds the new column, to keep changes atomic",
        "Immediately after the backfill completes",
        "Only in a later release, once no deployable version (current or rollback target) still reads it",
        "Never — old columns must be kept forever",
      ],
      answerIndex: 2,
      explain:
        "The contract step waits until both the current release and any realistic rollback target ignore the old column. Dropping it earlier means a code rollback lands on a schema the old code can't read — the rollback itself would break production.",
    },
  ],
};

export default lesson;

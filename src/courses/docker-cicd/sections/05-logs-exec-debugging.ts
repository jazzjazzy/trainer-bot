import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "logs-exec-debugging",
  title: "Logs, Exec & Debugging Containers",
  part: "From FTP to Containers",
  estMinutes: 12,
  summary:
    "Seeing inside a running container: docker logs replaces tail -f on log files, exec gives you a shell, inspect dumps the full state as JSON, and stats shows resource use — with one iron rule: fixes go in the image, not the container.",

  concept: `
Your debugging reflexes are twenty-five years of SSH: \`tail -f
/var/log/apache2/error.log\`, poke around the box, edit a file, restart.
Every one of those reflexes has a container equivalent — and one of them
needs deliberate unlearning.

### \`docker logs\`: the new tail -f

Containerised apps don't write log *files*. They write to **stdout and
stderr**, and Docker captures both streams per container:

\`\`\`bash
docker logs api               # everything so far
docker logs -f api            # follow live — your old tail -f
docker logs --tail 100 api    # last 100 lines
docker logs -t --since 15m api  # timestamps, last 15 minutes
\`\`\`

Why stdout instead of \`/var/log/app.log\`? Because the container is
disposable — a file inside it dies with it — and because the *platform*
should own log routing, not the app. When the app just prints, the same
image works everywhere: locally Docker shows it to you; in production the
engine's logging driver ships the same stream to CloudWatch, Loki, or
syslog with zero app changes. Log files inside containers also grow until
they fill the writable layer, invisibly. If you're containerising an old
app that insists on files, the standard trick is symlinking the log path to
\`/dev/stdout\` — the official nginx image does exactly that.

### \`docker exec\`: a shell inside, on demand

\`exec\` starts an *additional* process inside a running container —
usually a shell:

\`\`\`bash
docker exec -it api sh          # alpine images: sh (no bash installed)
docker exec -it api bash        # debian/ubuntu-based images
docker exec api env             # or run a single command, no shell
docker exec api cat /app/config.json
\`\`\`

\`-i\` keeps stdin open, \`-t\` allocates a terminal — together they make the
shell interactive, so \`-it\` is muscle memory. This is your SSH-into-the-box
replacement for *diagnosis*: check that a file made it into the image, test
DNS from inside the container's network, inspect what the process actually
sees.

**The iron rule:** exec is for looking, not fixing. Any file you edit inside
a container lives in the disposable writable layer — the next redeploy
recreates the container from the image and your hotfix evaporates. Worse,
nothing records that you made it. The old habit of patching a live server
over SSH is precisely what containers exist to end: **the fix goes in the
image**, gets committed, built, and redeployed.

### \`docker inspect\`: everything Docker knows, as JSON

\`\`\`bash
docker inspect api                    # the full JSON document
docker inspect --format '{{.State.ExitCode}}' api
docker inspect --format '{{.RestartCount}}' api
\`\`\`

\`inspect\` dumps a container's complete state: config, env vars, mounts,
network addresses, restart count, and — crucial for crash forensics — the
exit code of PID 1. \`--format\` takes a **Go template** (those are Go's
\`{{ }}\` braces, not shell syntax) to pluck a single field. Exit codes read
like process exit codes because that's what they are: \`0\` clean, \`1\`
app error, \`137\` = killed by SIGKILL (often the OOM killer — the
container blew its memory limit), \`139\` segfault.

### \`docker stats\`: top, per container

\`\`\`bash
docker stats            # live CPU / memory / network / IO per container
docker stats --no-stream api   # one snapshot, script-friendly
\`\`\`

The debugging flow, in your old vocabulary: \`docker logs\` is the error
log, \`docker exec\` is the SSH session, \`docker inspect\` is reading the
config + \`ps\` output in one JSON blob, \`docker stats\` is \`top\` — and
"edit it live and restart apache" is the one reflex to retire.
`,

  comparisons: [
    {
      label: "Watching an app fail in real time",
      intro:
        "The site is erroring right now. Old world: SSH to the right box and tail the right log file. New world: ask Docker for the container's output stream.",
      php: `# Which box? Which file? Better remember.
ssh admin@prod-01
$ cd /var/log/apache2
$ ls -la
error.log  error.log.1  error.log.2.gz ...
$ tail -f error.log
# ...nothing? Maybe it logs to the vhost's own file:
$ tail -f /var/log/apache2/shop-error.log
# or the app's homegrown log:
$ tail -f /var/www/shop/logs/app.log`,
      ts: `# One stream per container, wherever it runs:
docker logs -f api

# Recent history with timestamps:
docker logs -t --tail 100 api

# The stream survives the crash — an Exited
# container's logs are still readable:
docker logs api

# Same command locally and in prod; in prod the
# logging driver ALSO ships it to your aggregator.`,
      note: "The app writes to stdout/stderr and never names a log file — so there's exactly one place to look, it works identically on every host, and the platform (not the app) decides where logs are shipped.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Getting inside to diagnose",
      intro:
        "You need to see what the app sees: is the config file there, can it resolve the database host? SSH-into-the-box becomes exec-into-the-container — with one crucial behavioural change.",
      php: `# SSH in, poke around... and 'fix' it live
ssh admin@prod-01
$ cat /var/www/shop/config.php
$ php -i | grep memory_limit
$ nano /var/www/shop/lib/checkout.php   # hotfix!
$ sudo service apache2 restart
# The fix lives only on prod-01. It's not in git.
# Next deploy overwrites it. Nobody will know why
# checkout breaks again in three weeks.`,
      ts: `# Exec in — for DIAGNOSIS:
docker exec -it api sh
/app # cat config.json
/app # env | grep DB_
/app # nslookup db.internal
/app # exit

# Do NOT hotfix in there: the writable layer dies
# with the container. The real fix goes in the
# image — code change, commit, build, redeploy:
docker run -d --name api shop-api:2.4.2`,
      note: "exec -it is the SSH session; the difference is that live edits are pointless by design — the container is disposable, so the only fix that survives is one built into the next image. That's a feature: every change is forced through git and CI.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Reading the machine's state",
      intro:
        "Why did it die? What env does it actually have? Instead of correlating ps, config files, and syslog, one command dumps the container's entire state as JSON.",
      php: `# Assembling the picture by hand
$ ps aux | grep php          # is it up? since when?
$ cat /etc/php/7.4/fpm/pool.d/www.conf
$ grep -r "memory_limit" /etc/php/
$ dmesg | tail              # did the OOM killer eat it?
[8123.402] Out of memory: Kill process 4127 (php-fpm)`,
      ts: `$ docker inspect api
[
  {
    "Id": "3f8c2d9a1e5b...",
    "State": {
      "Status": "exited",
      "ExitCode": 137,
      "OOMKilled": true,
      "FinishedAt": "2026-07-07T03:12:44Z"
    },
    "Config": {
      "Env": ["DB_HOST=db.internal", "NODE_ENV=production"],
      "Image": "shop-api:2.4.1"
    },
    "RestartCount": 4
  }
]`,
      note: "Everything you used to reconstruct from ps, config greps, and dmesg is one structured document — ExitCode 137 with OOMKilled:true is the OOM-killer verdict, no dmesg archaeology needed.",
      leftLang: "bash",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A container named worker keeps dying. Read the last log lines, then interrogate its state with a Go-template --format (those {{ }} braces are Go's, not shell's). Predict the exit code and what OOMKilled will say.",
    code: `# The worker container keeps stopping. Investigate:

docker logs --tail 5 worker

docker ps -a --filter name=worker

# Pluck single fields from the state JSON (Go templates):
docker inspect --format '{{.State.ExitCode}}' worker

docker inspect --format '{{.State.OOMKilled}}' worker

# Predict: given the last log line, what exit code did PID 1
# return, and is this a memory kill or an app error?`,
    output: `$ docker logs --tail 5 worker
[2026-07-07T03:12:41Z] job 4411 done in 210ms
[2026-07-07T03:12:42Z] job 4412 started
[2026-07-07T03:12:42Z] FATAL: connect ECONNREFUSED 10.0.0.5:5432
[2026-07-07T03:12:42Z] Error: database unreachable, giving up
[2026-07-07T03:12:42Z] process exiting with code 1

$ docker ps -a --filter name=worker
CONTAINER ID   IMAGE          COMMAND                CREATED          STATUS                     PORTS     NAMES
b2e7f4a9c1d3   worker:1.8.0   "node dist/worker.js"  12 minutes ago   Exited (1) 9 minutes ago             worker

$ docker inspect --format '{{.State.ExitCode}}' worker
1

$ docker inspect --format '{{.State.OOMKilled}}' worker
false

# The app logged its own exit: code 1 — an application error
# (database unreachable), matching Exited (1) in the STATUS column.
# OOMKilled is false: a memory kill would show ExitCode 137
# (SIGKILL) with OOMKilled true. The logs survived the crash
# because Docker keeps an exited container's log stream until
# the container is removed.`,
  },

  keyPoints: [
    "Containerised apps log to **stdout/stderr**, not files: the container is disposable, and the platform's logging driver routes the stream — same image logs locally and to CloudWatch/Loki in prod.",
    "`docker logs -f api` is the new `tail -f error.log`; `--tail N`, `-t`, and `--since 15m` scope it. Logs survive a crash — readable on Exited containers until `docker rm`.",
    "`docker exec -it api sh` is the SSH session replacement — for *diagnosis only*. Use `sh` on alpine images (no bash).",
    "Edits made inside a running container die with it and bypass git — the iron rule is: the fix goes in the image, then build and redeploy.",
    "`docker inspect` dumps full container state as JSON; `--format '{{.State.ExitCode}}'` uses Go templates (Go's braces, not shell) to pluck fields. Exit 0 clean, 1 app error, 137 SIGKILL/OOM.",
    "`docker stats` is per-container `top`: live CPU, memory, network, and IO.",
  ],

  interview: [
    {
      q: "Why do containerised applications log to stdout instead of log files?",
      a: "Three reasons. First, containers are disposable — a log file in the writable layer is deleted with the container, so a crash would take its own evidence with it, whereas Docker retains the stdout/stderr stream even for exited containers. Second, it decouples the app from log routing: the app just prints, and the platform's logging driver decides where that stream goes — my terminal locally, CloudWatch or Loki in production — with no app changes between environments. Third, it's operationally safer: files inside containers grow until they silently fill the writable layer. It's the twelve-factor logging principle: treat logs as an event stream, not files you manage. For legacy apps that insist on files, the standard adaptation is symlinking the log path to /dev/stdout, which is exactly what the official nginx image does.",
    },
    {
      q: "A container is crash-looping in production. Walk me through your investigation.",
      a: "Start with the evidence that survives the crash: `docker logs --tail 100 worker` — the log stream persists on exited containers, so I can usually see the dying words. Then `docker ps -a` for the STATUS column and `docker inspect --format '{{.State.ExitCode}}'` for the precise exit code: 1 suggests an application error I'll find in the logs, 137 is SIGKILL — and if inspect shows OOMKilled true, the container blew its memory limit, which is a resource problem, not a code bug. Inspect also gives me RestartCount and the actual env vars, which catches the classic wrong-DB_HOST misconfiguration. If I need the app's-eye view — can it resolve the database hostname, is the config file present — I `docker exec -it` into a running instance to look. And whatever I find, the fix goes into the image or the run configuration and redeploys; I never patch the live container.",
    },
    {
      q: "What's wrong with exec-ing into a container and fixing the bug there, the way you'd hotfix over SSH?",
      a: "It doesn't survive, and it doesn't leave a trace. Anything I change inside a running container lives in its writable layer, which is deleted the moment the container is recreated — and recreating containers is the normal deploy mechanism, so my hotfix silently vanishes on the next release and the bug 'mysteriously' returns. Worse, the change bypassed git, review, and CI, so the running system no longer matches any known artifact — which is exactly the snowflake-server problem containers were adopted to kill. Having spent years hotfixing live servers over SSH, I'd say the discipline is the point: `docker exec` is legitimate and valuable for diagnosis — checking files, env, network from inside — but the fix itself goes in the image or the environment config, gets committed, built, and rolled out, so every environment converges on the same tested artifact.",
    },
  ],

  quiz: [
    {
      question:
        "What is the container-world replacement for `ssh prod && tail -f /var/log/apache2/error.log`?",
      options: [
        "docker exec -it api tail -f /var/log/apache2/error.log",
        "docker logs -f api — the app writes to stdout/stderr and Docker captures the stream",
        "docker inspect api | grep log",
        "docker stats api",
      ],
      answerIndex: 1,
      explain:
        "Containerised apps log to stdout/stderr rather than files, and docker logs -f follows that captured stream. Exec-ing in to tail a file only works for apps that still write files — the pattern containers deliberately move away from, because files die with the container and can't be routed by the platform.",
    },
    {
      question:
        "You exec into a running container, edit a config file, and the app works again. What's the problem?",
      options: [
        "exec sessions are read-only, so the edit didn't happen",
        "The edit lives in the container's disposable writable layer — the next redeploy recreates the container from the image and the fix silently vanishes, and it was never in git",
        "Editing files requires docker attach, not docker exec",
        "Nothing — this is the recommended hotfix procedure",
      ],
      answerIndex: 1,
      explain:
        "Containers are recreated from the image on every deploy, so in-container edits are temporary by design and invisible to version control and CI. exec is for diagnosis; the durable fix goes in the image (or in injected config) and ships through the normal build pipeline.",
    },
    {
      question:
        "docker inspect shows ExitCode 137 and OOMKilled true. What happened?",
      options: [
        "The app returned error code 137 from main()",
        "The container was stopped gracefully with SIGTERM",
        "The kernel killed PID 1 with SIGKILL because the container exceeded its memory limit",
        "Docker removed the container after --rm",
      ],
      answerIndex: 2,
      explain:
        "137 = 128 + 9, the convention for death by signal 9 (SIGKILL), and OOMKilled: true pins it on the out-of-memory killer: the container blew its memory limit. That's a resource problem to fix with limits or app memory use — the logs typically end mid-sentence rather than with an error message.",
    },
    {
      question:
        "In `docker inspect --format '{{.State.ExitCode}}' api`, what are the {{ }} braces?",
      options: [
        "Shell parameter expansion, like ${VAR}",
        "A Go template — inspect's --format plucks fields from the container's JSON state document",
        "JSON syntax that must match the inspect output exactly",
        "Docker's own regex dialect",
      ],
      answerIndex: 1,
      explain:
        "The Docker CLI is written in Go and --format strings are Go templates: {{.State.ExitCode}} walks the inspect JSON to that field. They're unrelated to shell ${ } expansion — which is why the whole template is single-quoted, so the shell passes it through untouched.",
    },
  ],
};

export default lesson;

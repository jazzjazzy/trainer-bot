import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "observability-starter",
  title: "Observability Starter: Logs, Uptime, Alerts",
  part: "Deploy & Operate",
  estMinutes: 12,
  summary:
    "A pragmatic starter kit — structured JSON logs to stdout, rotated docker logs, an external uptime check on /health, and alerts tuned to avoid fatigue — so you know it broke before the client does.",

  concept: `
For years your alerting system was the client: the site broke, they emailed,
you SSHed in and ran \`tail -f /var/log/apache2/error.log\`. The goal of this
section is modest and concrete: know your app is down **before** anyone
emails, with tools that cost roughly nothing. This is a starter kit, not a
platform course — but its vocabulary comes up in interviews constantly.

### Structured logs: one JSON line per event

The old \`error_log("payment failed for user " . \$id)\` produced freeform prose
that only a human with grep could use. The modern convention: log **one JSON
object per line, to stdout**. The container doesn't manage log files at all —
Docker captures stdout, and anything downstream (grep today, Loki next year)
can parse fields instead of prose:

\`\`\`json
{"time":"2026-07-07T14:02:11Z","level":"error","msg":"payment failed","userId":8123,"orderId":"ord_921","err":"card_declined"}
\`\`\`

Machine-parseable means you can filter by field (\`"level":"error"\`), count
occurrences, and — crucially — every log line for one request can share a
request ID. Most runtimes have a standard library for this (pino for Node,
\`logging\` with a JSON formatter in Python). Log to stdout, let the platform
route it: that is the twelve-factor rule, and it is why \`docker logs\` works
at all.

### Rotation: the classic VPS killer

By default Docker's \`json-file\` log driver keeps **everything, forever**. One
chatty container can fill a 25GB VPS disk in weeks, and a full disk takes down
the database with it — the modern version of the access.log that ate your
old server. Cap it per service:

\`\`\`yaml
# compose.yaml
services:
  api:
    image: ghcr.io/acme/api:\${TAG}
    logging:
      driver: json-file
      options:
        max-size: "10m"   # rotate at 10MB
        max-file: "3"     # keep 3 files, delete the oldest
\`\`\`

30MB ceiling per container, no logrotate cron to maintain. Set it on day one;
you will forget by the time it matters.

### Uptime: check from OUTSIDE the box

A check that runs on the server can't tell you the server is down. Point an
external checker at your \`/health\` endpoint every minute — UptimeRobot-class
free services do this with alerting included. The zero-cost DIY option is a
scheduled GitHub Actions workflow (five-minute minimum interval, and GitHub
doesn't guarantee it runs exactly on time — fine for a starter, not a real
monitoring SLA):

\`\`\`yaml
# .github/workflows/uptime.yml
name: Uptime check
on:
  schedule:
    - cron: "*/5 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS --max-time 10 https://api.acme.example/health
\`\`\`

\`curl -f\` exits non-zero on HTTP errors, the job fails, and GitHub emails
you. Red workflow = site down.

### Alerts that don't cry wolf

The failure mode of monitoring is **alert fatigue**: page on everything and
within a month you ignore everything. Starter thresholds: alert when the site
is unreachable for 2+ consecutive checks (not one blip), when disk passes 85%,
and when the error *rate* jumps — not on every individual error. Everything
else is a morning-coffee dashboard, not a notification.

### The next tier (know the names)

When you outgrow this: **Sentry** for error tracking with stack traces,
**Grafana + Loki** for searchable centralised logs, **Prometheus** for metrics
and alerting rules. In interviews, naming the tier above what you run — and
knowing *why* you'd graduate to it — reads better than pretending you run it.
`,

  comparisons: [
    {
      label: "Finding out, then finding the error",
      intro:
        "A payment bug hit production overnight. Compare how each stack discovers it and digs out the relevant lines.",
      php: `# 09:14 — client email: "site is broken??"
ssh admin@203.0.113.10
tail -n 200 /var/log/apache2/error.log
# [Tue Jul 07 03:11:42] PHP Warning:  Undefined index:
#   card in /var/www/html/pay.php on line 88
# [Tue Jul 07 03:11:42] payment failed for user 8123
# Freeform prose. Which request? Which order? grep
# and guesswork — and you found out 6 hours late.`,
      ts: `# compose.yaml — the app logs JSON to stdout; Docker
# captures it and rotation is configured, not hoped for
services:
  api:
    image: ghcr.io/acme/api:\${TAG}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

# querying is field-based, not prose-based:
#   docker logs api | grep '"level":"error"'
#   ...gives every error with userId, orderId, requestId`,
      note:
        "Structured logs make 'find every failed payment for order ord_921' a filter on a field instead of an archaeology session — and the uptime alert (below) means you started 6 hours earlier.",
    },
    {
      label: "Monitoring: the client vs a scheduled check",
      intro:
        "How each setup learns that production is down. One is a human customer; the other is a five-minute cron that costs nothing.",
      php: `# The old monitoring stack, in full:
# (there is no monitoring)
#
# Detection   = client notices checkout is broken
# Alerting    = client writes an email
# Escalation  = client phones you
# Latency     = however long the client was asleep
mail
# > From: client@example.com
# > Subject: URGENT site down since last night!!`,
      ts: `# .github/workflows/uptime.yml — zero-cost external check
name: Uptime check
on:
  schedule:
    - cron: "*/5 * * * *"   # every 5 min (GitHub's minimum;
                            # timing is best-effort)
  workflow_dispatch: {}      # manual "is it up?" button
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Hit /health from outside the box
        run: curl -fsS --max-time 10 https://api.acme.example/health
# curl -f exits non-zero on any HTTP error -> job fails
# -> GitHub emails you a red X. Site down = you know first.`,
      note:
        "The check MUST run outside your server — a monitor on the box dies with the box. A failed scheduled run is a loud, timestamped alert; a dedicated uptime service adds proper thresholds and paging when you need them.",
    },
    {
      label: "Prose logs vs parseable events",
      intro:
        "The same payment failure, logged two ways. Only one of them can answer 'how many card declines this week, for which users?' without a regex safari.",
      php: `# error_log() output — written for a human with grep
tail -n 3 /var/log/apache2/error.log
# [Tue Jul 07 14:02:11 2026] payment failed for user 8123
# [Tue Jul 07 14:02:12 2026] PHP Notice: retrying...
# [Tue Jul 07 14:02:15 2026] payment ok user 8123 (2nd try)
# Timestamps in one format, levels implicit, no request
# correlation, message shape different on every line.`,
      ts: `{"time":"2026-07-07T14:02:11Z","level":"error","msg":"payment failed","requestId":"req_5f2a","userId":8123,"orderId":"ord_921","err":"card_declined"}
{"time":"2026-07-07T14:02:12Z","level":"warn","msg":"payment retry","requestId":"req_5f2a","userId":8123,"attempt":2}
{"time":"2026-07-07T14:02:15Z","level":"info","msg":"payment ok","requestId":"req_5f2a","userId":8123,"attempt":2}`,
      rightLang: "json",
      note:
        "One event per line, consistent fields, a shared requestId tying the story together. Every tool in the next tier (Loki, CloudWatch, Datadog) assumes exactly this shape — adopting it now makes graduating trivial.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Two starter-kit moves on the VPS: filtering structured logs by field, and fixing log rotation before the disk fills. Before running, predict exactly which of api's six log lines the error filter will print — then check the df -h numbers for why max-size matters.",
    code: `# 1. The api container logs one JSON object per line.
docker logs --tail 6 app-api-1

# 2. Filter to errors only — a field query, not a regex safari:
docker logs --tail 6 app-api-1 | grep '"level":"error"'

# 3. The disk, before log rotation was configured...
df -h /var/lib/docker

# ...and after adding max-size/max-file and recreating:
# (logging options: max-size "10m", max-file "3")
df -h /var/lib/docker`,
    output: `$ docker logs --tail 6 app-api-1
{"time":"2026-07-07T14:01:58Z","level":"info","msg":"request","requestId":"req_5f29","path":"/api/orders","status":200}
{"time":"2026-07-07T14:02:11Z","level":"error","msg":"payment failed","requestId":"req_5f2a","userId":8123,"err":"card_declined"}
{"time":"2026-07-07T14:02:12Z","level":"warn","msg":"payment retry","requestId":"req_5f2a","userId":8123,"attempt":2}
{"time":"2026-07-07T14:02:15Z","level":"info","msg":"payment ok","requestId":"req_5f2a","userId":8123,"attempt":2}
{"time":"2026-07-07T14:02:20Z","level":"error","msg":"db pool exhausted","requestId":"req_5f31","waitMs":5003}
{"time":"2026-07-07T14:02:21Z","level":"info","msg":"request","requestId":"req_5f32","path":"/health","status":200}

$ docker logs --tail 6 app-api-1 | grep '"level":"error"'
{"time":"2026-07-07T14:02:11Z","level":"error","msg":"payment failed","requestId":"req_5f2a","userId":8123,"err":"card_declined"}
{"time":"2026-07-07T14:02:20Z","level":"error","msg":"db pool exhausted","requestId":"req_5f31","waitMs":5003}

$ df -h /var/lib/docker
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        25G   22G  1.9G  93% /
# 18GB of that is one container's unrotated json log.

$ df -h /var/lib/docker
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        25G  4.1G   20G  18% /
# max-size 10m / max-file 3 = 30MB ceiling per container.

# The filter matched exactly 2 of 6 lines: the "error" level
# events. The retry (warn) and the eventual success (info) did
# not — level is a field you query, not a word you hope to grep.`,
  },

  keyPoints: [
    "Log one JSON object per event to stdout — Docker captures it, `docker logs` shows it, and every future log tool can parse fields instead of prose.",
    "Docker's default json-file driver keeps logs forever: set `max-size`/`max-file` logging options in compose.yaml on day one, or a chatty container will fill the VPS disk.",
    "Uptime checks must run OUTSIDE the server — a monitor on the box dies with the box. UptimeRobot-class services or a scheduled GitHub Actions curl on /health cost nothing.",
    "A scheduled workflow (`on: schedule`, 5-minute minimum, best-effort timing) with `curl -fsS` fails loudly on any HTTP error — a free, timestamped down-detector.",
    "Tune alerts against fatigue: page on sustained unreachability, disk >85%, and error-rate jumps — not on every single error line.",
    "Next-tier vocabulary for interviews: Sentry (error tracking), Grafana+Loki (centralised logs), Prometheus (metrics/alerting) — know why you'd graduate to each.",
  ],

  interview: [
    {
      q: "How would you set up monitoring for a small containerised app on a single VPS?",
      a: "Three cheap layers. First, structured logging: the app writes one JSON object per event to stdout — no log files in the container — so `docker logs` plus a field filter answers most questions, and I cap the json-file driver with max-size and max-file in compose so logs can't fill the disk. Second, an external uptime check hitting a real `/health` endpoint every few minutes — UptimeRobot or even a scheduled GitHub Actions workflow running `curl -f` — external being the key word, because a monitor on the server dies with the server. Third, alerts with sane thresholds: sustained downtime, disk over 85%, error-rate spikes — not a page per error, which just trains you to ignore pages. When the app outgrows that, the graduation path is Sentry for errors and Grafana/Loki/Prometheus for logs and metrics.",
    },
    {
      q: "Why structured JSON logs to stdout instead of writing log files like error_log?",
      a: "Two separate wins. Stdout first: the container stays stateless and the platform owns log routing — Docker captures the stream, rotation is a driver setting rather than an in-container logrotate, and the same app logs identically on my laptop and in production; that's the twelve-factor approach. JSON second: one machine-parseable event per line with consistent fields means 'level' is something I query, not a word I grep and hope. I can count card declines by field, and a shared requestId ties every line of one request together across services — impossible with freeform prose. It also future-proofs: Loki, CloudWatch and Datadog all ingest that shape natively, so graduating to centralised logging is configuration, not a rewrite.",
    },
    {
      q: "What is alert fatigue and how do you design around it?",
      a: "Alert fatigue is what happens when alerts fire so often that on-call people stop reading them — at which point you effectively have no monitoring, just noise. I design around it with two rules. Every alert must be actionable: if the response is 'ignore it, it self-heals', it should be a dashboard item, not a notification. And thresholds should require persistence: alert after two or three consecutive failed uptime checks rather than one network blip, on error-rate increases rather than individual errors, on disk crossing 85% rather than every write. The old-school version of this was the inbox full of cron emails everyone filtered to a folder — the same lesson: an alert channel only works if a message there is rare and always means something.",
    },
  ],

  quiz: [
    {
      question:
        "Why must an uptime check run outside the server it monitors?",
      options: [
        "External checks are faster than local ones",
        "If the server (or its network) goes down, a check running on it goes down too and can never report the outage",
        "Docker blocks containers from curling their own host",
        "GitHub Actions cannot SSH into private servers",
      ],
      answerIndex: 1,
      explain:
        "The whole point of an uptime check is to detect the box being unreachable — a monitor that shares the box's fate detects nothing. External checkers (or a scheduled workflow on GitHub's infrastructure) observe your app the way users do.",
    },
    {
      question:
        "What problem do the json-file driver's max-size and max-file options solve?",
      options: [
        "They compress logs to make docker logs faster",
        "They stop unrotated container logs from growing forever and filling the VPS disk",
        "They convert freeform logs into JSON automatically",
        "They forward logs to an external service",
      ],
      answerIndex: 1,
      explain:
        "By default Docker keeps every byte a container ever wrote to stdout. max-size rotates at a size limit and max-file caps how many rotated files are kept — e.g. 10m × 3 = a 30MB ceiling per container instead of an eventual full disk.",
    },
    {
      question:
        "Which alerting policy best avoids alert fatigue?",
      options: [
        "Send a notification for every error-level log line",
        "Alert only on sustained conditions: consecutive failed uptime checks, disk over threshold, error-rate spikes",
        "Disable alerts and check dashboards hourly",
        "Route all alerts to a folder for weekly review",
      ],
      answerIndex: 1,
      explain:
        "Alerts stay useful only while they're rare and actionable. Requiring persistence (multiple failed checks, a rate rather than a count of one) filters blips into dashboards and keeps notifications meaning 'act now'.",
    },
  ],
};

export default lesson;

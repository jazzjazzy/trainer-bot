import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "the-docker-cli",
  title: "The Docker CLI: Run, Stop, Remove",
  part: "From FTP to Containers",
  estMinutes: 12,
  summary:
    "The container lifecycle hands-on: run (create + start), foreground vs -d, stop vs kill, rm and --rm, restart policies, and why PID 1 decides when a container lives or dies.",

  concept: `
You spent years managing long-running processes the hard way: \`service
apache2 restart\`, \`ps aux | grep php\`, \`kill -9\` on a PID you hoped was
the right one. The Docker CLI replaces all of that with a small, consistent
lifecycle vocabulary.

### \`docker run\` = create + start

\`docker run IMAGE\` does two things in one: it **creates** a container from
the image (new writable layer, network namespace, name) and **starts** its
main process. Two modes matter:

\`\`\`bash
docker run nginx:1.27           # foreground: your terminal attaches to
                                # the process's output; Ctrl-C stops it
docker run -d nginx:1.27        # detached: prints the container ID and
                                # returns; the container runs in background
\`\`\`

Always name your long-lived containers — otherwise Docker invents names like
\`upbeat_lamarr\` and your commands read like a zoo inventory:

\`\`\`bash
docker run -d --name web nginx:1.27
docker restart web              # every lifecycle command takes the name
\`\`\`

### PID 1 defines the container's lifetime

Inside every container, one process is **PID 1** — the command from the
image's \`CMD\` (nginx, node, python). The container lives exactly as long as
that process: **when PID 1 exits, the container stops**. There is no init
system, no service manager, no "the box stays up even if apache dies". This
is why hello-world exits instantly (it prints and quits) and nginx runs
forever (it's a server that never returns). One container, one main process —
that's the design, and it's why crashed apps are restarted by *policies*, not
by an admin watching \`top\`.

### stop vs kill: the polite and the impolite

\`\`\`bash
docker stop web    # sends SIGTERM to PID 1, waits (10s by default),
                   # then SIGKILL if it hasn't exited
docker kill web    # sends SIGKILL immediately — no cleanup chance
\`\`\`

\`stop\` is the graceful path: the app can finish in-flight requests, flush
buffers, close DB connections. \`kill\` is for processes that ignore SIGTERM.
Exactly your old \`kill PID\` vs \`kill -9 PID\` instinct — formalised, and
addressed by name instead of by hunted-down PID.

### rm, --rm, and housekeeping

Stopped containers stick around (writable layer, logs) until removed:

\`\`\`bash
docker rm web            # delete a stopped container
docker rm -f web         # kill AND delete a running one
docker run --rm ...      # auto-delete when it exits — perfect for
                         # one-off commands and experiments
\`\`\`

Images have their own housekeeping: \`docker rmi nginx:1.27\` removes an
image nothing references, and \`docker system prune\` sweeps up stopped
containers, unused networks, and dangling images in one go (\`-a\` is more
aggressive: it also removes *any* image not used by a container — check
before you free those gigabytes).

### Restart policies: the crontab watchdog, retired

The old world's answer to a crashing service was a cron job curling the
site and restarting apache. Docker builds it in:

\`\`\`bash
docker run -d --name api --restart unless-stopped shop-api:2.4.1
\`\`\`

\`unless-stopped\` restarts the container if its process dies *and* brings it
back after the Docker daemon or host reboots — but respects a deliberate
\`docker stop\`. Other values: \`no\` (default), \`on-failure[:N]\` (only on
non-zero exit, optionally capped at N retries), \`always\`.
`,

  comparisons: [
    {
      label: "A service crashed at 2am",
      intro:
        "The app process died. The manual fix is an SSH session and a service restart; the container fix is one command — or better, a policy so nobody gets paged at all.",
      php: `# The 2am ritual
ssh admin@prod-01
$ ps aux | grep apache2      # is it even running?
$ sudo service apache2 restart
$ tail -f /var/log/apache2/error.log   # did it stay up?

# The 'monitoring' that kept this rare:
$ crontab -l
*/5 * * * * curl -sf http://localhost/ || sudo service apache2 restart`,
      ts: `# One-off fix, from anywhere docker CLI reaches:
docker restart api

# The real fix — declare the policy at run time:
docker run -d --name api \\
  --restart unless-stopped \\
  shop-api:2.4.1

# Process dies -> Docker restarts it. Host reboots ->
# Docker brings it back. 'docker stop api' -> it stays
# stopped, because that was deliberate.`,
      note: "The crontab watchdog polls every 5 minutes and knows nothing about intent; --restart unless-stopped reacts instantly to the process exiting and still respects a deliberate stop.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Killing a stuck process",
      intro:
        "A worker process is wedged and must go. Manual ops means hunting the PID; Docker means addressing the container by name — with a graceful option built in.",
      php: `# Find it, verify it, kill it, hope
$ ps aux | grep queue-worker
www-data  4127  0.0  1.2  php /var/www/queue-worker.php
www-data  4133  0.0  1.2  php /var/www/queue-worker.php
# ...which one is the stuck one?
$ kill 4127          # polite: SIGTERM
$ kill -9 4127       # it ignored you: SIGKILL
# and now restart it by hand, with the right flags,
# as the right user, in the right directory`,
      ts: `# Address by name; graceful first, forceful after:
docker stop worker
# = SIGTERM to PID 1, 10s grace period, then SIGKILL.
# Give a slow-draining app longer to finish jobs:
docker stop -t 30 worker

# Truly wedged? Skip the courtesy:
docker kill worker

# Bring it back exactly as it was configured:
docker start worker`,
      note: "docker stop encodes the SIGTERM-wait-SIGKILL dance you used to do manually, targets the process by container name instead of a hunted PID, and docker start relaunches it with its original configuration intact.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Cleaning up the box",
      intro:
        "Disk is filling. Manual ops means spelunking /var and /tmp; Docker means asking what it's holding and pruning it.",
      php: `# Where did 40GB go?
$ df -h
/dev/sda1  50G  48G  1.1G  98% /
$ du -sh /var/log/* /tmp/* /var/www/backup* | sort -h
# old tarballs, rotated logs, a backup of a backup...
$ rm -rf /var/www/backup-2019-*   # deep breath`,
      ts: `# Ask Docker what it's using:
docker system df

# Sweep stopped containers, dangling images,
# unused networks and build cache:
docker system prune

# More aggressive — also removes ALL images not
# currently used by a container (they'll re-pull):
docker system prune -a`,
      note: "Old images and exited containers are the tarballs-in-/var of the container world — prune reclaims them safely because anything still referenced by a running container is never touched.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "One full lifecycle: create, list, stop, list again, delete. Before revealing, predict each command's output — especially what `docker ps` shows after the stop, and what `docker ps -a` adds.",
    code: `docker run -d --name web nginx:1.27

docker ps

docker stop web

docker ps

docker ps -a

docker rm web

docker ps -a

# Predict: what does 'run -d' print? What STATUS does each
# ps show? Why does the container survive the stop but not the rm?`,
    output: `$ docker run -d --name web nginx:1.27
7d9f3a1c5b2e04a8f6d1c9e3b7a2f5d8c4e6a9b1d3f7c2e5a8b4d6f9c1e3a7b5

$ docker ps
CONTAINER ID   IMAGE        COMMAND                  CREATED         STATUS         PORTS     NAMES
7d9f3a1c5b2e   nginx:1.27   "/docker-entrypoint.…"   5 seconds ago   Up 4 seconds   80/tcp    web

$ docker stop web
web

$ docker ps
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES

$ docker ps -a
CONTAINER ID   IMAGE        COMMAND                  CREATED          STATUS                        PORTS     NAMES
7d9f3a1c5b2e   nginx:1.27   "/docker-entrypoint.…"   45 seconds ago   Exited (0) 10 seconds ago               web

$ docker rm web
web

$ docker ps -a
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES

# run -d prints the new container's full 64-char ID and returns.
# After stop: docker ps is empty (only RUNNING containers), but
# ps -a still shows it — Exited (0), a clean SIGTERM shutdown,
# writable layer and logs intact. Only docker rm deletes it;
# after that even ps -a is empty. The nginx:1.27 IMAGE is still
# cached — rm removes containers, not images.`,
  },

  keyPoints: [
    "`docker run` = create + start in one step; foreground attaches your terminal, `-d` detaches and prints the container ID.",
    "A container lives exactly as long as its PID 1 — the image's main process. When it exits, the container stops; there is no init system keeping the 'box' up.",
    "`docker stop` sends SIGTERM, waits (10s default, `-t` to change), then SIGKILL; `docker kill` goes straight to SIGKILL — the formalised version of `kill` vs `kill -9`.",
    "Stopping is not deleting: exited containers persist until `docker rm` (or use `--rm` on one-off runs to auto-clean).",
    "`--restart unless-stopped` replaces the crontab watchdog: restarts on crash and after reboot, but respects a deliberate stop.",
    "Housekeeping: `docker rmi` removes images, `docker system prune` sweeps stopped containers, dangling images, and unused networks (`-a` also unused images).",
  ],

  interview: [
    {
      q: "What's the difference between docker stop and docker kill?",
      a: "`docker stop` is the graceful path: it sends SIGTERM to the container's PID 1, giving the app a chance to finish in-flight requests, flush buffers, and close connections; if the process hasn't exited after the grace period — 10 seconds by default, tunable with `-t` — Docker follows up with SIGKILL. `docker kill` skips the courtesy and sends SIGKILL immediately. It's the same distinction as `kill` versus `kill -9` from classic Unix ops, formalised. In practice I default to `stop`, raise the timeout for apps that drain work queues, and reserve `kill` for processes that are genuinely wedged. It also matters that your app actually handles SIGTERM — a Node or PHP process that ignores it just eats the full grace period and gets killed anyway.",
    },
    {
      q: "Why does a container exit as soon as its main process ends, and what follows from that design?",
      a: "A container isn't a machine — it's a wrapper around one process. The image's CMD becomes PID 1 inside the container, and the container's lifetime is exactly that process's lifetime: no init system, no service manager, nothing else to keep 'the box' up. Three things follow. First, one container should run one main process — you don't put nginx and PHP-FPM and cron in one container; you run three containers. Second, crash recovery is declarative: a restart policy like `unless-stopped` relaunches the container when PID 1 dies, replacing the hand-rolled watchdog cron jobs I used to write. Third, an image whose command finishes instantly — a script, a migration — produces a container that runs and exits by design; that's normal, not a bug.",
    },
    {
      q: "A colleague complains Docker is 'eating their disk'. What's happening and how do you fix it?",
      a: "Almost certainly accumulated leftovers: every stopped container keeps its writable layer and logs until removed, every pulled or built image stays cached, and iterating on builds leaves dangling layers behind. I'd start with `docker system df` to see the breakdown, then `docker system prune` to sweep stopped containers, dangling images, unused networks, and build cache — it never touches anything a running container uses. If images dominate, `prune -a` also removes images no container references, at the cost of re-pulling later. And to stop the problem recurring: run one-off containers with `--rm` so they self-delete, and configure log rotation for chatty long-running containers.",
    },
  ],

  quiz: [
    {
      question:
        "You run `docker run -d --name web nginx:1.27`. What exactly did `run` do?",
      options: [
        "Started an existing stopped container named web",
        "Created a new container from the image (writable layer, network, name) and started its main process, detached",
        "Built the nginx image from a Dockerfile and cached it",
        "Downloaded nginx:1.27 but deferred starting until docker start",
      ],
      answerIndex: 1,
      explain:
        "run is create + start in one command (pulling the image first if it isn't cached). With -d it detaches and prints the new container's ID. docker start, by contrast, is what re-launches an already-created, stopped container.",
    },
    {
      question:
        "The main process (PID 1) in a container crashes. What happens to the container?",
      options: [
        "The container keeps running; Docker's internal init respawns the process",
        "The container stops — its lifetime is exactly the lifetime of PID 1",
        "The container pauses until docker unpause is called",
        "Docker automatically deletes the container and its logs",
      ],
      answerIndex: 1,
      explain:
        "There is no init system inside a standard container: the container exists to run its one main process, so when PID 1 exits, the container stops (it becomes Exited in docker ps -a, logs preserved). Automatic recovery is opt-in via restart policies like --restart unless-stopped.",
    },
    {
      question: "What does `docker stop web` actually send to the process?",
      options: [
        "SIGKILL immediately",
        "SIGHUP, asking the process to reload its config",
        "SIGTERM, then SIGKILL if the process hasn't exited within the grace period (10s default)",
        "Nothing — it just removes the container from docker ps",
      ],
      answerIndex: 2,
      explain:
        "stop is the graceful shutdown: SIGTERM first so the app can clean up, escalating to SIGKILL only after the timeout (-t adjusts it). docker kill is the immediate-SIGKILL variant. Neither deletes the container — that's docker rm.",
    },
    {
      question:
        "Which restart policy restarts a crashed container and survives host reboots, but stays down after a deliberate `docker stop`?",
      options: ["on-failure", "always", "unless-stopped", "no"],
      answerIndex: 2,
      explain:
        "unless-stopped is the production favourite: it restarts on crash and comes back after daemon/host restarts, but remembers a manual stop and respects it. always restarts even after you deliberately stopped the container (once the daemon restarts); on-failure only reacts to non-zero exits and doesn't persist across reboots the same way.",
    },
  ],
};

export default lesson;

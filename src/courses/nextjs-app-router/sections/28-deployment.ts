import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "deployment",
  title: "Deployment: Vercel & Self-Hosted",
  part: "Production & Interview Prep",
  estMinutes: 11,
  summary:
    "Vercel is git-push-to-deploy with zero config; self-hosting is next build + next start behind Nginx — or output: 'standalone' for a minimal Docker image — and yes, that's a real interview question.",

  concept: `
Deploying classic PHP was gloriously simple: copy files into the Apache
docroot and \`mod_php\` serves them — no build, no process to keep alive.
Next.js has a build step and a long-running Node server, so deployment splits
into two stories. Interviewers genuinely ask "can you self-host Next.js?"
(the answer is **yes**), so know both.

### Story 1: Vercel — the zero-config path

Vercel is the company that makes Next.js, and its platform is the
push-to-deploy experience:

- **git push → build → deploy.** Connect the repo; every push to the
  production branch builds and ships automatically.
- **Preview deployments.** Every pull request gets its own URL running that
  branch — reviewers click a link instead of pulling code.
- **Environment variables in the dashboard**, scoped per environment
  (production / preview / development).
- Static assets go to a CDN, and the platform wires up image optimization and
  caching infrastructure for you.

The trade is the usual managed-platform one: convenience and scale-out for
cost and some lock-in on the infrastructure details.

### Story 2: self-hosting — your LAMP instincts apply

A Next.js app is "just" a Node server. The minimal production recipe:

\`\`\`bash
npm ci
npm run build     # next build — compiles and prerenders
npm run start     # next start — serves on :3000
\`\`\`

Put Nginx (or Apache, or Caddy) in front as a reverse proxy for TLS and
compression, and keep the process alive with systemd or pm2 — structurally
identical to how you'd run any long-lived service next to your PHP boxes.

### \`output: 'standalone'\` — built for containers

By default, running \`next start\` needs the full \`node_modules\` tree. Set
\`output: 'standalone'\` in \`next.config.ts\` and the build traces exactly
which files the server needs, emitting \`.next/standalone/\` with a minimal
\`server.js\` and only the required node_modules — run it with plain
\`node server.js\`, no \`next\` CLI. Two gotchas: \`public/\` and
\`.next/static/\` are **not** copied automatically (your Dockerfile copies
them in, or a CDN serves them). This is the standard shape for a small
multi-stage Docker image: build stage runs \`next build\`, runtime stage
copies only the standalone output.

### What needs care when you self-host

- **Image optimization**: \`next/image\` optimizes via \`sharp\`, which Next
  installs automatically on recent versions — just confirm it made it into
  your container image.
- **ISR / cache persistence**: revalidated pages are cached on the local
  filesystem (\`.next/cache\`) by default. Run **multiple instances** behind a
  load balancer and each keeps its own cache — users can see different
  versions per instance. Fixes: shared storage for the cache directory, a
  custom \`cacheHandler\` in \`next.config.ts\` (e.g. backed by Redis), or a
  single instance until you actually need more.
- **Env vars** come from the real environment (systemd unit, Docker \`-e\`,
  compose file) — \`NEXT_PUBLIC_\` values are still baked at build time, so
  bake them in the image build.

The interview line: *"Vercel for zero-ops and preview deployments; but Next
self-hosts fine — it's a Node process behind a reverse proxy, and
\`output: 'standalone'\` gives you a minimal Docker-friendly bundle. Coming
from LAMP operations, the Nginx-in-front model is home turf."*
`,

  comparisons: [
    {
      label: "Shipping a release",
      intro:
        "Get the new version live. The PHP deploy is a file copy — the runtime interprets source on each request. The Next deploy is build-then-run: compile once, then start a long-lived server process.",
      php: `# Classic PHP deploy — no build step, no process manager.
# mod_php interprets the files on the next request.
rsync -avz --delete \\
  ./src/ deploy@web01:/var/www/example.com/public/

# done. Apache is already running; new code is live.`,
      ts: `# Next.js deploy — build once, run a Node server.
ssh deploy@web01
cd /srv/example.com
git pull
npm ci
npm run build          # next build (Turbopack, prerenders static routes)
sudo systemctl restart nextapp   # runs: next start -p 3000

# Nginx in front proxies :443 -> localhost:3000`,
      note: "The mental shift: PHP's deploy artifact is source code, Next's is a build output plus a process you must keep alive — which is why systemd/pm2/Docker enter the picture.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Fronting the app: Apache vhost vs Nginx reverse proxy",
      intro:
        "The web-server config. Apache hands .php files to the interpreter in-process; Nginx forwards everything to the Node server listening on a port.",
      php: `# /etc/apache2/sites-available/example.conf
<VirtualHost *:443>
  ServerName example.com
  DocumentRoot /var/www/example.com/public

  # mod_php executes .php files in-process;
  # everything else is served as static files.
  <Directory /var/www/example.com/public>
    AllowOverride All   # .htaccess rewrites
  </Directory>
</VirtualHost>`,
      ts: `# /etc/nginx/sites-available/example.conf
server {
  listen 443 ssl;
  server_name example.com;

  # Everything goes to the Node server.
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Optional: let Nginx serve immutable build assets
  location /_next/static/ {
    alias /srv/example.com/.next/static/;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}`,
      note: "Apache IS the PHP runtime's host; Nginx is just a proxy in front of a self-contained app server — redirects and routing live in next.config.ts and the app, not in .htaccess.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Containerizing: PHP image vs multi-stage standalone build",
      intro:
        "A Dockerfile for each stack. The PHP image copies source onto an Apache+PHP base; the Next image builds in one stage and ships only the traced standalone output in another.",
      php: `# Dockerfile — classic PHP
FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql
COPY src/ /var/www/html/
# That's it — source in the docroot,
# Apache+mod_php serve it per request.`,
      ts: `# Dockerfile — Next.js with output: 'standalone'
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # emits .next/standalone

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# standalone bundle: server.js + only the needed node_modules
COPY --from=builder /app/.next/standalone ./
# NOT included automatically — copy them in:
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]`,
      note: "output: 'standalone' file-traces the server so the runtime image skips the full node_modules — but public/ and .next/static/ must be copied in explicitly (or served from a CDN).",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read the app manifest in the comments and predict the build output: which routes get the static circle (○) and which get the dynamic function marker (ƒ)? Then check the transcript.",
    code: `# The app being built:
#   app/page.tsx               — marketing copy, no dynamic APIs, no uncached fetch
#   app/about/page.tsx         — static content only
#   app/blog/[slug]/page.tsx   — awaits params, per-request uncached fetch
#   app/api/health/route.ts    — GET handler reading request headers
npm run build`,
    output: `> next build

   ▲ Next.js 16.1.4 (Turbopack)

   Creating an optimized production build ...
 ✓ Compiled successfully in 3.4s
 ✓ Collecting page data
 ✓ Generating static pages (4/4)
 ✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                    1.05 kB         104 kB
├ ○ /_not-found                          0 B             103 kB
├ ○ /about                               512 B           103 kB
├ ƒ /api/health                          0 B             0 B
└ ƒ /blog/[slug]                         1.42 kB         105 kB
+ First Load JS shared by all            103 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

# / and /about used no request data -> prerendered to HTML at build (○).
# /blog/[slug] reads params + does an uncached fetch -> rendered per request (ƒ).
# The route handler reads headers -> dynamic (ƒ). This table is the first
# thing to check when a page you expected to be static went dynamic.`,
  },

  keyPoints: [
    "Vercel: connect the repo, git push deploys, every PR gets a preview URL, env vars live in the dashboard — zero config because the platform is built by the Next.js team.",
    "Self-hosting works and is a real interview question: `next build` then `next start` behind an Nginx reverse proxy, kept alive with systemd or pm2 — familiar territory after LAMP ops.",
    "`output: 'standalone'` in next.config.ts traces the server's actual file needs into `.next/standalone/` (run with `node server.js`) — the basis of a small multi-stage Dockerfile.",
    "Standalone output does NOT include `public/` or `.next/static/` — copy them into the runtime image or serve them from a CDN.",
    "Self-hosted care points: confirm sharp is present for image optimization, and remember ISR's default filesystem cache is per-instance — multiple instances need shared storage or a custom cacheHandler.",
    "The build output route table (○ static, ƒ dynamic) is your deploy-time audit of what got prerendered versus what renders per request.",
  ],

  interview: [
    {
      q: "Can you self-host Next.js, or does it require Vercel?",
      a: "It self-hosts fine — a built Next app is a Node server. The simple recipe is `next build` then `next start` behind an Nginx reverse proxy, managed by systemd or pm2; my LAMP background maps directly, with Nginx playing the front-door role Apache used to. For containers I'd set `output: 'standalone'`, which traces exactly the files the server needs into a minimal bundle run with `node server.js` — ideal for a two-stage Dockerfile, remembering that `public/` and `.next/static/` must be copied in separately. The things Vercel otherwise handles for you: sharp for image optimization needs to be in the image, and ISR's cache is on the local filesystem by default, so multiple instances need shared storage or a custom cacheHandler.",
    },
    {
      q: "What do you get from deploying on Vercel that you'd have to build yourself otherwise?",
      a: "The workflow, mostly: push-to-deploy from git, automatic preview deployments per pull request so every branch has a clickable URL, environment variables scoped per environment in a dashboard, and instant rollbacks. On the infrastructure side it puts static assets and the image optimizer on a CDN and scales the serving layer without me running servers. Self-hosting can replicate all of it — CI pipeline, ephemeral review apps, a CDN in front — but that's real ops work. My answer in practice: Vercel when iteration speed and previews matter most, self-hosted when cost control, data locality, or existing infrastructure win.",
    },
    {
      q: "What breaks if you run three self-hosted Next.js instances behind a load balancer and use ISR?",
      a: "Cache inconsistency. By default ISR writes revalidated pages to the local filesystem under `.next/cache`, so each instance maintains its own copy. After a revalidation, instance A may serve the fresh page while B and C still serve the stale one — users refresh and see content flip-flop depending on which instance the balancer picks. The fixes are to share the cache: mount shared storage for the cache directory, or configure a custom `cacheHandler` in next.config.ts backed by something central like Redis, which is what larger self-hosted setups do. It's the same class of problem as PHP sessions in files across multiple web heads — same solution shape, too: centralize the state.",
    },
  ],

  quiz: [
    {
      question: "What does `output: 'standalone'` in next.config.ts produce?",
      options: [
        "A fully static HTML export with no server",
        "A .next/standalone folder with server.js and only the traced node_modules the server needs",
        "A single bundled .js file with all assets inlined",
        "A Vercel-specific deployment artifact",
      ],
      answerIndex: 1,
      explain:
        "Standalone output file-traces the server's dependencies into a minimal runnable tree started with plain `node server.js` — perfect for Docker. Note public/ and .next/static/ are not copied automatically. A no-server static export is a different option (output: 'export').",
    },
    {
      question:
        "In the next build route table, what do ○ and ƒ mean next to a route?",
      options: [
        "○ = cached by the CDN, ƒ = cached in memory",
        "○ = client component route, ƒ = server component route",
        "○ = prerendered as static content at build time, ƒ = server-rendered on demand per request",
        "○ = passing build checks, ƒ = failed prerendering",
      ],
      answerIndex: 2,
      explain:
        "The markers are the build's verdict on each route: static circles were rendered to HTML during the build; ƒ routes depend on request data (params, headers, uncached fetches) and run on every request.",
    },
    {
      question:
        "Why does ISR need special attention when self-hosting multiple instances?",
      options: [
        "ISR only works on Vercel's infrastructure",
        "The revalidation cache is on each instance's local filesystem by default, so instances can serve different versions",
        "next start refuses to run more than one instance",
        "Revalidation requires the edge runtime, which self-hosting lacks",
      ],
      answerIndex: 1,
      explain:
        "ISR works self-hosted, but its default cache is per-instance (.next/cache on disk). Behind a load balancer that means inconsistent responses until you centralize the cache — shared storage or a custom cacheHandler (e.g. Redis).",
    },
  ],
};

export default lesson;

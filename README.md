# DevCourses

An interactive, multi-course platform for learning to code, built for one
specific reader: a long-time PHP developer retraining for the current job
market. **20 courses · 600 sections**, every one of them hands-on — live code
playgrounds, side-by-side "the way you know it / the way it's done now" code
comparisons, quizzes, interview prep, and a course-aware AI tutor.

Every course is 30 sections, grouped into 5 parts, following the same six-part
lesson shape. Nothing is a video and nothing is a slide deck: the content is
data, the app renders it, and the code samples run.

## The catalog

### Switching language

| Course | Level | What it covers |
|---|---|---|
| **TypeScript for PHP Veterans** | Intermediate | The type system taught through PHP: structural vs nominal typing, unions, generics, narrowing, `satisfies`, decorators, tsconfig, the npm ecosystem. Live TS playground throughout. |
| **Python for PHP Veterans** | Beginner | Ground-up Python for someone with decades of PHP and zero Python. Arrays become lists and dicts, `foreach` becomes `for … in`, Composer becomes pip and venvs. |
| **PHP 5.5 → 8.2: The Upgrade** | Intermediate | Everything that landed across PHP 7 and 8 — scalar types, enums, `readonly`, `match`, named arguments, attributes, fibers — each shown as the old way beside the modern way, with the breaking changes called out. |

### Frontend

| Course | Level | What it covers |
|---|---|---|
| **React Fundamentals for PHP Developers** | Beginner | React 19 with function components and hooks only. JSX as a template that's really code, props as function parameters, a re-render as a fresh request. Typed props, state, effects, context, data fetching, Server Components preview. |
| **Next.js App Router with TypeScript** | Intermediate | The Next.js 16 App Router as the closest thing JavaScript has to the PHP request model: Server Components by default, Server Actions for mutations, file-convention routing, and caching you can actually explain. |
| **TypeScript-First SvelteKit** | Intermediate | Svelte 5 runes and SvelteKit's generated `$types`: typed load functions, form actions, endpoints, hooks — from `<script lang="ts">` upward. |

### Backend & data

| Course | Level | What it covers |
|---|---|---|
| **Node.js Backend for PHP Veterans** | Intermediate | The runtime shift: one long-running process instead of one request at a time. Typed Express 5 APIs, validation, Postgres, pino logging, graceful shutdown, deployment. |
| **FastAPI: Production Python APIs** | Intermediate | Type hints that drive validation, Pydantic v2 models, `Depends` injection, SQLAlchemy 2.0, JWT auth, automatic OpenAPI docs. |
| **SQL & Modern ORMs: Prisma and Drizzle** | Intermediate | Decades of Postgres and PDO instinct wired into a typed TypeScript data layer. Schemas, migrations, and queries in both Prisma 7 and Drizzle — always showing the SQL underneath. |
| **REST & API Design in TypeScript** | Intermediate | Resource modelling, correct HTTP semantics, zod-validated contracts, Problem Details errors, cursor pagination, versioning, sessions vs JWT vs OAuth2/OIDC, rate limiting, OpenAPI, webhooks. |

### Quality & delivery

| Course | Level | What it covers |
|---|---|---|
| **Testing Across the Stack** | Intermediate | Vitest 4 unit tests, Testing Library component tests, API and database integration tests, Playwright end-to-end, pytest 9 for the Python track — plus the judgment calls about what to test and what to mock. |
| **Docker, CI/CD & Deployment** | Intermediate | From FTP uploads to small images, Compose for local dev, GitHub Actions pipelines, and healthcheck-gated zero-downtime deploys of one artifact from laptop to production. |
| **Building with LLM APIs** | Intermediate | Real product features on the Anthropic API in both TS and Python: the stateless mental model, streaming UX, reliable JSON, the tool-use loop, embeddings and RAG, plus cost, safety and evals. |

### The Drupal track

Six courses that go from "I know Symfony" to "I can take a Drupal build to
production". Roughly in order:

| # | Course | Level | What it covers |
|---|---|---|---|
| 1 | **Drupal for Symfony Developers** | Intermediate | Drupal 10 & 11 mapped concept-by-concept from Symfony: controllers, services, routing, entities, plugins, hooks, render arrays, caching, config — and exactly where the two diverge. |
| 2 | **Drupal Site Building Without Code** | Intermediate | The half of Drupal framework developers keep missing: content modeling, Views, blocks, menus, moderation and multilingual, built by clicking and exported as reviewable YAML. |
| 3 | **Drupal Custom Module Development** | Intermediate | One running example — an incident-tracker module — built end to end: `info.yml` and routing, services and DI, hooks and events, Form API and config schema, install/update hooks, queues and cron, block plugins, libraries, mail, logging, coding standards. |
| 4 | **Drupal Forms, Render Arrays & the Theme Layer** | Advanced | The output half of Drupal. Form API beyond `buildForm()` — element plugins, `#states`, AJAX, wizards. Render arrays and the pipeline that turns them into markup. Theme hooks, template suggestions, preprocess, Drupal's Twig dialect, libraries, behaviors, Single Directory Components. |
| 5 | **Drupal Caching & Performance** | Advanced | Cache tags, contexts and max-age as one contract, then every layer built on it: render cache, page caches, placeholders, BigPipe, Varnish and CDN purging. Plus N+1 entity loads, Views tuning, Redis, OPcache/FPM, profiling and CI regression gates. |
| 6 | **Drupal Config Management & Deployment** | Advanced | The configuration system from the inside, then everything on top: `cex`/`cim` as review discipline, config_split and config_ignore, update hooks in deploy order, CI that gates a config import, recipes, multi-environment workflow, rollback, and auditing an inherited project. |

### Career

| Course | Level | What it covers |
|---|---|---|
| **The Full-Stack Interview** | Advanced | The exam itself, not a technology: how hiring pipelines really work, the coding patterns covering 80% of screens, system design from requirements to scale, and turning a 25-year PHP career into senior signal instead of legacy baggage. |

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>). You land on the
catalog — pick a course to begin.

Scripts:

```bash
npm run dev         # dev server + AI-tutor proxy
npm run build       # type-check (tsc --noEmit) + production build
npm start           # serve the built dist/ + AI tutor (production server)
npm run typecheck   # type-check only
npm run verify      # validate every lesson across every course
npm run preview     # preview the production build
```

`npm start` runs `server/index.mjs` and expects `dist/` to exist, so
`npm run build` first. It listens on `PORT` (default `3000`).

## How it works

The catalog (`/`) lists courses; click one to enter it
(`#/<course-id>/<lesson-slug>`). Every lesson in every course has the same six
parts:

| Part | What it does |
|---|---|
| 📘 **Concept** | A clear, concise explanation |
| 🔀 **Side-by-side** | The familiar code beside the modern equivalent, differences flagged |
| 🧪 **Playground** | Editable code — see the **Playgrounds** note below |
| 🎯 **Key Points** | Quick recap bullets |
| 💼 **Interview Prep** | Real Q&A for the topic |
| ✅ **Quiz** | Scored multiple-choice with explanations |

Progress and quiz scores are saved per course in the browser
(`localStorage`), so the courses are independent of each other.

### Playgrounds

The playground is **language-aware**:

- **TypeScript** runs live — a real Monaco editor type-checks as you type, and
  **Run** transpiles and executes the code in the browser, capturing output
  (including async output from `setTimeout` / promises).
- **Every other language** is read-and-predict: an editable, syntax-highlighted
  snippet where **Show output** reveals the precomputed result. Predict it
  first, then check yourself.

Languages in use across the courses today:

| Language | Sections | Mode |
|---|---|---|
| `php` | 210 | read-and-predict |
| `typescript` | 208 | **runs live** |
| `python` | 64 | read-and-predict |
| `bash` | 39 | read-and-predict |
| `tsx` | 18 | read-and-predict |
| `yaml` | 15 | read-and-predict |
| `svelte` | 9 | read-and-predict |
| `sql` | 7 | read-and-predict |

Syntax highlighting additionally covers `js`, `jsx`, `json`, `html`/`xml` and
`twig` (used by the Drupal theming course).

### AI tutor

Inside a course, an **✨ Ask AI** button sits on every code example (plus a
floating button). It opens a docked tutor column that explains the code or
answers follow-ups, **framed for that specific course** — the tutor's audience
and persona come from the course definition, so the React course explains
things to an ex-PHP developer learning React, and the Drupal courses explain
things to a Symfony developer.

It's powered by **Claude Haiku 4.5** (`claude-haiku-4-5`) through a server-side
handler, so your API key never reaches the browser. To enable it, give the
server credentials before starting it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or:  ant auth login
```

Without credentials the courses work fully — the tutor just shows a "set a key"
message.

The handler lives in `server/tutor.mjs` and is mounted in **three** places from
that one file, so dev and production can't drift:

| Where | How it's mounted |
|---|---|
| `npm run dev` | Vite middleware (`configureServer`) |
| `npm run preview` | Vite middleware (`configurePreviewServer`) |
| `npm start` | `server/index.mjs`, the production server |

The browser always talks to the same endpoint: `POST /api/ask`, which streams
back `text/plain`.

## Project structure

```
src/
  types.ts                  # Course + Lesson contracts — read this first
  courses/
    index.ts                # the course registry (all 20 courses)
    <course-id>/
      course.ts             # course metadata + tutor framing
      sections/
        index.ts            # ordered lesson list
        01-….ts … 30-….ts   # one Lesson per file
  components/               # Catalog, CourseView, Sidebar, LessonView,
                            # PhpVsTs, Playground, Quiz, InterviewPrep,
                            # Highlight, Markdown, ThemeToggle
  ai/                       # course-aware AI tutor (AIContext + aiClient)
  lib/                      # runner (TS playground), progress, routing, theme
  styles.css
server/
  tutor.mjs                 # AI tutor handler — shared by dev, preview, prod
  tutor.d.mts               # its types, for vite.config.ts
  index.mjs                 # production server: serves dist/ + POST /api/ask
scripts/
  verify-content.mjs        # content gate — see below
vite.config.ts              # dev server; mounts the tutor handler
.github/
  workflows/ci-deploy.yml   # gates on every push; deploys main to Coolify
  secret_scanning.yml       # excludes src/courses/** (see note below)
```

## Adding a course

The platform is generic over the `Course` shape — adding a course is data, not
framework changes:

1. Create `src/courses/<id>/course.ts` exporting a `Course`:
   - `id`, `title`, `subtitle`, `description`, `tags`, `level`, `accent`, `badge`
   - `parts` — the five sidebar groupings
   - `comparison` — labels + highlight languages for the two columns
     (e.g. `{ leftLabel: "PHP 5.5", leftLang: "php", rightLabel: "Modern PHP", rightLang: "php" }`)
   - `tutor` — `{ audience, persona }` framing for the AI tutor
   - `lessons` — imported from `./sections`
2. Add lesson modules under `src/courses/<id>/sections/` (one per file,
   default-exporting a `Lesson`) and list them in `sections/index.ts`. Each
   lesson follows the `Lesson` interface in `src/types.ts`.
3. Register the course in `src/courses/index.ts`.
4. Run the gates: `npm run typecheck` **and**
   `node scripts/verify-content.mjs`.

> **Playground rules.** TypeScript playground code must be self-contained: no
> `import`/`export`, no top-level `return`, output via `console.log`. It is
> transpiled and *actually executed* by the verification script, so it has to
> run. For every other language, set `playground.lang` and provide the
> precomputed `playground.output` — and make sure the output is what that code
> really produces.

### The content gate

`node scripts/verify-content.mjs` walks every section of every course, extracts
the lesson object, runs each playground through the same transpile-and-execute
pipeline the browser uses, and checks quiz/data integrity (option counts, that
`answerIndex` is in range, required fields present). PHP and Python snippets are
executed too when `php` / `python3` are on `PATH`; otherwise those checks are
skipped with a warning.

A healthy run ends with:

```
600 sections across 20 course(s) · 0 failure(s) · 0 warning(s)
```

### Content accuracy

Course material is checked against the *current* official documentation for
each library rather than from memory — version-gated claims ("added in x.y"),
API signatures, CLI flags, config keys and model IDs all drift, and a course
that teaches a removed flag is worse than one that omits it. When you touch a
section, re-verify the specifics against upstream docs and fix the whole lesson
together: a corrected `concept` that leaves the `quiz`, `keyPoints` and
`interview` answers contradicting it is a half-fix.

### A note on secret scanning

`.github/secret_scanning.yml` excludes `src/courses/**`. Course content
deliberately contains credential-*shaped* example strings — Stripe key
prefixes, AWS-style access key IDs, bearer tokens — so learners can recognise
the real thing. Without the exclusion, push protection blocks every section
that teaches API keys or secrets management. The trade-off is stated in that
file: a real secret committed under `src/courses/` would not be caught, so
nothing under that path should ever contain a working credential.

## How it's built

- **Vite + React + TypeScript** — the app is itself TypeScript you can read.
- **Monaco editor** powers the playground (live type-checking for TS).
- **highlight.js** renders every other language, plus fenced code inside
  markdown via `react-markdown` + `rehype-highlight` + `remark-gfm`.
- The `typescript` package transpiles TS snippets to JS in the browser and runs
  them; async output is drained so `setTimeout`/`Promise` demos show results.
- The tutor calls Claude via `@anthropic-ai/sdk`, keeping the key server-side.
- **Production** is a dependency-free Node server (`server/index.mjs`, Node
  builtins only) that serves `dist/` and hosts the tutor endpoint.

## Deployment

Pushes to `main` deploy to Coolify. `.github/workflows/ci-deploy.yml` runs the
gates (typecheck → content verification → build → production-server smoke test)
on a GitHub-hosted runner; only if they pass does a second job trigger the
Coolify deployment.

That second job runs on a **self-hosted runner on the Coolify host**, because
the Coolify API listens on the LAN and is deliberately not exposed to the
internet — the runner reaches it over `localhost` and only ever connects
*outbound* to GitHub. Pushes to `develop` and pull requests run the gates only.

The deployed app runs `npm start`, so the AI tutor is live in production
provided `ANTHROPIC_API_KEY` is set in the Coolify app's environment.

## License

See [LICENSE](LICENSE).

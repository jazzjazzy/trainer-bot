# DevCourses

An interactive, multi-course platform for learning to code. A searchable catalog
of self-contained courses; each course is hands-on — live code playgrounds,
PHP-style side-by-side comparisons, quizzes, interview prep, and an AI tutor.

**Courses included:**

- **TypeScript for PHP Veterans** — 30 sections teaching TypeScript through the
  lens of PHP, with a live TypeScript playground.
- **PHP 5.5 → 8.2: The Upgrade** — 30 sections bringing a PHP 5.5 developer
  current (types, enums, readonly, match, named args, attributes, …), each shown
  as the old way beside the modern way.

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). You land on the catalog
— pick a course to begin.

Scripts:

```bash
npm run build       # type-check (tsc --strict) + production build
npm run typecheck   # type-check only
npm run preview     # preview the production build
node scripts/verify-content.mjs   # validate every lesson across every course
```

## How it works

The catalog (`/`) lists courses; click one to enter it (`#/<course>/<lesson>`).
Each lesson has the same six parts:

| Part | What it does |
|---|---|
| 📘 **Concept** | A clear, concise explanation |
| 🔀 **Side-by-side** | The familiar code beside the modern equivalent, differences flagged |
| 🧪 **Playground** | Editable code — see the **Playgrounds** note below |
| 🎯 **Key Points** | Quick recap bullets |
| 💼 **Interview Prep** | Real Q&A for the topic |
| ✅ **Quiz** | Scored multiple-choice with explanations |

Progress and quiz scores are saved per course in the browser (`localStorage`).

### Playgrounds

The playground is **language-aware**:

- **TypeScript** runs live — a real Monaco editor type-checks as you type, and
  **Run** transpiles and executes the code in the browser, capturing output.
- **PHP** (and any other non-browser language) is read-and-predict: an editable,
  syntax-highlighted snippet where **Show output** reveals the precomputed
  result — predict it, then check yourself.

### AI tutor

Inside a course, an **✨ Ask AI** button sits on every code example (plus a
floating button). It opens a docked tutor column that explains the code or
answers follow-ups, **framed for that specific course** (the tutor's audience
and persona come from the course definition). It's powered by **Claude (Haiku
4.5)** via a server-side proxy, so your API key never reaches the browser. To
enable it, give the dev server credentials before `npm run dev`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or:  ant auth login
```

Without credentials the courses work fully — the tutor just shows a "set a key"
message.

## Project structure

```
src/
  types.ts                 # Course + Lesson contracts
  courses/
    index.ts               # the course registry
    ts-for-php/
      course.ts            # course metadata
      sections/            # 30 lesson modules + index.ts
    php-5-5-to-8-2/
      course.ts
      sections/
  components/               # Catalog, CourseView, Sidebar, LessonView,
                            # PhpVsTs, Playground, Quiz, InterviewPrep, …
  ai/                      # course-aware AI tutor (provider + client)
  lib/                     # runner (TS playground), progress, routing
vite.config.ts             # dev server + AI tutor proxy
```

## Adding a course

The platform is generic over the `Course` shape — adding a course is data, not
framework changes:

1. Create `src/courses/<id>/course.ts` exporting a `Course`:
   - `id`, `title`, `subtitle`, `description`, `tags`, `level`, `accent`, `badge`
   - `parts` — the sidebar groupings
   - `comparison` — labels + highlight languages for the two columns
     (e.g. `{ leftLabel: "PHP 5.5", leftLang: "php", rightLabel: "Modern PHP", rightLang: "php" }`)
   - `tutor` — `{ audience, persona }` for the AI tutor
   - `lessons` — imported from `./sections`
2. Add lesson modules under `src/courses/<id>/sections/` (one per file,
   default-exporting a `Lesson`) and list them in `sections/index.ts`. Each
   lesson follows the `Lesson` interface in `src/types.ts`.
3. Register the course in `src/courses/index.ts`.
4. Run `node scripts/verify-content.mjs` (validates playgrounds + quiz data
   across all courses) and `npm run typecheck`.

> TypeScript playground code must be self-contained (no `import`/`export`, no
> top-level `return`, `console.log` for output). For other languages, set
> `playground.lang` and provide the precomputed `playground.output`.

## How it's built

- **Vite + React + TypeScript** — the app is itself TypeScript you can read.
- **Monaco editor** powers the playground (live type-checking for TS).
- The `typescript` package transpiles TS snippets to JS in the browser and runs
  them (async output is drained so `setTimeout`/`Promise` demos show results).
- A small Vite dev-server proxy calls Claude for the tutor, keeping the key
  server-side. The proxy runs only under `npm run dev` / `npm run preview`.

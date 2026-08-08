import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "project-setup",
  title: "Project Setup: sv create & tsconfig",
  part: "Foundations",
  estMinutes: 11,
  summary:
    "Scaffold a TypeScript SvelteKit project with sv create, learn what each generated file does, and understand why your tsconfig extends a file the framework writes.",

  concept: `
### Scaffolding with \`sv create\`

One command creates a working, typed project:

\`\`\`bash
npx sv create my-app
\`\`\`

The CLI walks you through a few prompts: a template (the minimal skeleton is
fine for learning), **how you want type checking — pick "TypeScript syntax"** —
and optional add-ons (prettier, eslint, vitest, and more, installable later via
\`npx sv add\`). Then \`npm install\` and \`npm run dev\` and you're serving on
\`localhost:5173\`. Think \`composer create-project\`, but the scaffold is tiny.

### Anatomy of the generated project

- \`src/routes/\` — your pages and endpoints. The folder structure **is** the
  router (like a PHP framework where the routes file and the controllers merged).
- \`src/lib/\` — shared code, importable anywhere as \`$lib/...\`. Server-only
  code goes in \`src/lib/server/\`, which SvelteKit refuses to bundle into the client.
- \`src/app.d.ts\` — ambient declarations for the \`App\` namespace (\`Locals\`,
  \`PageData\`, ...). Covered in depth in its own section.
- \`src/app.html\` — the page shell with \`%sveltekit.head%\` / \`%sveltekit.body%\`
  placeholders. Roughly your old \`layout.php\` outermost template.
- \`svelte.config.js\` — framework config: preprocessors, the deployment
  **adapter**, and \`kit\` options like \`alias\`.
- \`vite.config.ts\` — build tool config; the SvelteKit plugin does the heavy
  lifting. Yes, even the config file is type-checked.
- \`tsconfig.json\` — three lines of interest, and the star of this section.

### The tsconfig that extends a generated file

Open \`tsconfig.json\` and the first line is the important one:

\`\`\`ts
{
  "extends": "./.svelte-kit/tsconfig.json"
}
\`\`\`

\`.svelte-kit/\` is a **generated, git-ignored** directory the framework
maintains. The tsconfig inside it is written *for your specific project* and
provides three things you must not lose:

- \`compilerOptions.paths\` — mappings for \`$lib\` (and any aliases you define),
  so imports resolve for the type checker exactly as they do for Vite.
- \`rootDirs\` — the trick that makes \`./$types\` work: it overlays
  \`.svelte-kit/types\` onto your source tree, so each route folder appears to
  contain its own generated \`$types.d.ts\`.
- \`include\`/\`exclude\` lists covering your \`src\` and the generated declarations.

The docs are explicit: **for generated types to work, your tsconfig must extend
\`.svelte-kit/tsconfig.json\`**. Delete that line and every \`./$types\` import
and \`$lib\` path goes red.

### Don't set \`paths\` or \`baseUrl\` yourself

If you want an extra alias, the reflex from other stacks is to add
\`compilerOptions.paths\`. Don't — you'd only be telling *TypeScript*, not Vite,
and since SvelteKit 2 the generated config **warns when it sees your own
\`paths\` or \`baseUrl\`**. The supported route is \`kit.alias\` in
\`svelte.config.js\`: one declaration that configures the bundler *and* is
written into the generated tsconfig for you. (If you genuinely need to tweak
other generated compiler options, \`typescript.config\` in \`svelte.config.js\`
lets you modify the generated file itself.)

### \`svelte-kit sync\`

Who writes \`.svelte-kit/tsconfig.json\` and all the \`$types\`? The
\`svelte-kit sync\` command. You rarely run it by hand: \`sv create\` wires it
into the \`prepare\` npm script (so it runs after \`npm install\`), and the dev
server keeps everything in sync continuously while it runs. The one place you'll
type it yourself is fresh-clone situations or CI steps that type-check without
starting a server.
`,

  comparisons: [
    {
      label: "Importing shared code",
      intro:
        "A settings page needs a date helper from src/lib. Both imports resolve at runtime — one of them survives you moving the file.",
      php: `// src/routes/dashboard/settings/+page.js
// Relative path counting — breaks the moment this file moves
import { formatDate } from '../../../lib/utils/dates.js';

export async function load() {
  return { today: formatDate(new Date()) };
}`,
      ts: `// src/routes/dashboard/settings/+page.ts
// $lib is pre-wired: Vite resolves it, and the generated
// .svelte-kit/tsconfig.json teaches TypeScript the same mapping
import { formatDate } from '$lib/utils/dates';

export const load = async () => {
  return { today: formatDate(new Date()) };
};`,
      note: "$lib works in both editors and builds only because tsconfig.json extends the generated .svelte-kit/tsconfig.json, which contains the matching paths entry.",
      leftLang: "js",
      rightLang: "ts",
    },
    {
      label: "Adding your own alias",
      intro:
        "You want $components to point at src/lib/components. The left teaches only the type checker; the right teaches the bundler and the type checker with one declaration.",
      php: `// tsconfig.json — the reflex from other stacks. DON'T.
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "$components/*": ["src/lib/components/*"]
    }
  }
}
// TypeScript is happy; Vite has no idea what $components is,
// and SvelteKit 2 warns that paths/baseUrl should not be set here.`,
      ts: `// svelte.config.js — the supported way
import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    alias: {
      $components: 'src/lib/components'
    }
  }
};

export default config;
// svelte-kit sync writes the matching paths entry into
// .svelte-kit/tsconfig.json — bundler and checker agree.`,
      note: "kit.alias is the single source of truth: sync propagates it into the generated tsconfig, so you never hand-maintain paths/baseUrl (which SvelteKit 2 explicitly warns against).",
      leftLang: "js",
      rightLang: "js",
    },
    {
      label: "What `extends` actually buys you",
      intro:
        "The same project with and without the extends line. Nothing changes at runtime — but the whole generated-types system hinges on it.",
      php: `// tsconfig.json — extends removed
{
  "compilerOptions": {
    "strict": true
  }
}

// Immediate fallout in every route file:
//   import type { PageLoad } from './$types';
//   -> Cannot find module './$types'
//   import { formatDate } from '$lib/utils/dates';
//   -> Cannot find module '$lib/utils/dates'`,
      ts: `// tsconfig.json — the scaffolded version
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}

// Inherited from the generated file:
//   paths     -> $lib and every kit.alias entry
//   rootDirs  -> overlays .svelte-kit/types so each route
//                folder "contains" its own $types.d.ts
//   include   -> your src plus the generated declarations`,
      note: "rootDirs is the magic: it merges .svelte-kit/types with src at type-check time, which is why './$types' resolves as if the file sat beside your route.",
      leftLang: "js",
      rightLang: "js",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "What actually lives inside .svelte-kit/types? Types like this. Here's a simplified version of how a params type can be derived from a route id string — run it, then hover BlogParams and try assigning a misspelled key.",
    code: `// A simplified take on what svelte-kit sync derives for each route:
// pull every [param] out of a route id, at the TYPE level.
type ExtractParams<T extends string> =
  T extends \`\${infer _Prefix}[\${infer Param}]\${infer Rest}\`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : {};

// For the folder src/routes/blog/[slug]/[page]:
type BlogParams = ExtractParams<"/blog/[slug]/[page]">;
// -> { slug: string; page: string }

const params: BlogParams = { slug: "hello-sveltekit", page: "2" };
// Try: params.pge = "3"  -> the editor rejects the typo instantly

// The runtime mirror of the same idea:
function listParams(routeId: string): string[] {
  return [...routeId.matchAll(/\\[(\\w+)\\]/g)].map((m) => m[1]);
}

console.log("typed params:", JSON.stringify(params));
console.log(
  "params found in /blog/[slug]/[page]:",
  listParams("/blog/[slug]/[page]").join(", ")
);
console.log("params found in /about:", listParams("/about").length);`,
  },

  keyPoints: [
    "`npx sv create my-app` scaffolds the project — choose **TypeScript syntax** at the type-checking prompt; add-ons can come later via `npx sv add`.",
    "Know the anatomy: `src/routes` (the filesystem router), `src/lib` (shared code as `$lib`), `src/app.d.ts`, `src/app.html`, `svelte.config.js`, `vite.config.ts`.",
    "Your `tsconfig.json` must `extends: \"./.svelte-kit/tsconfig.json\"` — the generated file supplies `paths`, `rootDirs` (which makes `./$types` resolve), and the include lists.",
    "Never set `paths`/`baseUrl` in your own tsconfig — SvelteKit 2 warns about it; declare aliases once in `kit.alias` in `svelte.config.js` and sync propagates them everywhere.",
    "`svelte-kit sync` writes the generated tsconfig and all `$types`; it runs automatically via the `prepare` script and continuously under `npm run dev`.",
  ],

  interview: [
    {
      q: "Why does a SvelteKit tsconfig.json extend ./.svelte-kit/tsconfig.json instead of being self-contained?",
      a: "Because a chunk of the TypeScript configuration is *project-derived* and maintained by the framework. The generated file contains the `paths` mappings for `$lib` and any `kit.alias` entries, `rootDirs` that overlay `.svelte-kit/types` onto the source tree — which is what makes per-route `./$types` imports resolve — and the correct `include`/`exclude` lists. The docs state plainly that generated types only work if your config extends the generated one. Your own tsconfig then just layers project preferences like `strict` on top.",
    },
    {
      q: "How do you add a path alias in SvelteKit, and why not via tsconfig paths?",
      a: "Declare it in `kit.alias` in `svelte.config.js`, e.g. `alias: { $components: 'src/lib/components' }`. That's the single source of truth: SvelteKit configures Vite's resolver from it *and* writes the matching `paths` entry into the generated tsconfig on the next `svelte-kit sync`. Hand-editing `paths`/`baseUrl` in your own tsconfig only informs the type checker — builds would still fail — and SvelteKit 2's generated config explicitly warns when it detects you've done that.",
    },
    {
      q: "What does svelte-kit sync do and when does it run?",
      a: "It's the codegen step: it writes `.svelte-kit/tsconfig.json` and generates the `$types.d.ts` files for every route, plus modules like `$app/types`. You almost never invoke it manually because `sv create` puts it in the `prepare` npm script — so it runs right after `npm install` — and the dev server regenerates continuously as you add or rename routes. The main manual use is CI or a fresh clone where you want to run `svelte-check` without starting a dev server.",
    },
  ],

  quiz: [
    {
      question: "What breaks if you remove `\"extends\": \"./.svelte-kit/tsconfig.json\"` from your tsconfig?",
      options: [
        "The dev server won't start",
        "Imports of ./$types and $lib stop resolving for the type checker",
        "Svelte components can no longer use lang=\"ts\"",
        "Nothing — the file is optional boilerplate",
      ],
      answerIndex: 1,
      explain:
        "The generated file carries the paths mappings and the rootDirs overlay that make $lib and per-route ./$types resolve. Runtime and dev server still work (Vite resolves independently), but type checking loses the whole generated-types system.",
    },
    {
      question: "The correct way to add a `$components` alias to a SvelteKit project is…",
      options: [
        "Add paths + baseUrl to tsconfig.json",
        "Add resolve.alias to vite.config.ts",
        "Add it to kit.alias in svelte.config.js",
        "Edit .svelte-kit/tsconfig.json directly",
      ],
      answerIndex: 2,
      explain:
        "kit.alias configures the bundler and is propagated into the generated tsconfig by svelte-kit sync, keeping checker and build in agreement. tsconfig paths alone don't affect the build (and trigger a SvelteKit 2 warning); editing .svelte-kit files is futile since sync rewrites them.",
    },
    {
      question: "Why does `svelte-kit sync` run as the npm `prepare` script?",
      options: [
        "To compile all Svelte components ahead of time",
        "So the generated tsconfig and $types exist right after npm install, before any type checking",
        "To download the deployment adapter",
        "To start the dev server in watch mode",
      ],
      answerIndex: 1,
      explain:
        "prepare runs automatically after install, so a fresh clone immediately has .svelte-kit/tsconfig.json and the generated types — meaning editors and svelte-check work before you've ever started the dev server.",
    },
  ],
};

export default lesson;

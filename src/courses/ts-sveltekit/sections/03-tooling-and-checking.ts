import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "tooling-and-checking",
  title: "Tooling: svelte-check, IDE & CI",
  part: "Foundations",
  estMinutes: 9,
  summary:
    "tsc can't read .svelte files — svelte-check can. Wire up the checker, the VS Code extension, and a CI gate so type errors fail the pipeline, not the user.",

  concept: `
### The problem: \`tsc\` can't see your components

Run \`tsc --noEmit\` over a SvelteKit project and it checks your \`.ts\` files —
and silently ignores every \`.svelte\` file, because \`tsc\` has no idea what a
Svelte component is. Since most of your type errors will live in components
(props, markup expressions, event handlers), \`tsc\` alone gives you a green
build with red code.

### \`svelte-check\`: the real type gate

**\`svelte-check\`** is the CLI that understands \`.svelte\`. It drives the same
machinery as the editor tooling (the Svelte language server), so it checks:

- \`<script lang="ts">\` blocks, with full TypeScript semantics,
- **markup expressions** — \`{post.titel}\` in your template is caught,
- your plain \`.ts\`/\`.js\` files too, plus a11y and unused-CSS diagnostics.

The scaffold wires it up for you in \`package.json\`:

\`\`\`ts
{
  "scripts": {
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch"
  }
}
\`\`\`

Note the \`svelte-kit sync &&\` prefix: the generated \`./$types\` must exist
*before* checking, so sync always runs first. \`npm run check\` is your
equivalent of running PHPStan — a whole-project static pass with a non-zero exit
code on failure.

### The editor: Svelte for VS Code

Install the **Svelte for VS Code** extension (\`svelte.svelte-vscode\`). It runs
the **svelte-language-server**, which is what gives you red squiggles, hover
types, autocompletion, and rename refactoring *inside* \`.svelte\` files —
including markup. Because \`svelte-check\` and the extension share the same
language-server internals, what your editor flags and what CI flags agree.
Other editors (WebStorm, Neovim, Zed) have equivalents built on the same server.

### When do generated types refresh?

Types under \`.svelte-kit/types\` are regenerated:

- **continuously while \`npm run dev\` runs** — add a route folder and its
  \`./$types\` appears within moments;
- whenever **\`svelte-kit sync\`** runs — after \`npm install\` (the \`prepare\`
  script) and at the start of \`npm run check\`.

Rule of thumb: if \`./$types\` imports go red on a fresh clone or a new branch,
you haven't synced — start the dev server or run \`npm run check\` once.

### CI: make the checker a gate

Type errors should fail the pipeline, not reach a reviewer. A minimal GitHub
Actions job is: checkout, \`npm ci\` (which triggers \`prepare\` → sync), then
\`npm run check\`, then \`npm run build\`. Because \`svelte-check\` exits non-zero
on any error, that one script line is the entire gate.

### Linting is a separate lane

**eslint-plugin-svelte** parses \`.svelte\` files and catches Svelte-specific
mistakes; pair it with **typescript-eslint** for type-aware lint rules in your
TS. Linting complements checking — style and correctness *patterns* — while
\`svelte-check\` owns type errors. The \`sv create\` eslint add-on configures
both together; \`npm run lint\` sits beside \`npm run check\` in CI.
`,

  comparisons: [
    {
      label: "A prop bug tsc will never see",
      intro:
        "A price tag component renders an amount. In the JS version the bug ships and explodes in the browser; in the TS version svelte-check fails before anything deploys.",
      php: `<!-- src/lib/PriceTag.svelte — plain JS -->
<script>
  let { amount, currency = 'AUD' } = $props();
</script>

<!-- Caller forgot to pass amount?
     TypeError: Cannot read properties of undefined
     ...discovered in the browser console, in production -->
<p>{currency} {amount.toFixed(2)}</p>`,
      ts: `<!-- src/lib/PriceTag.svelte — lang="ts" -->
<script lang="ts">
  interface Props {
    amount: number;
    currency?: string;
  }

  let { amount, currency = 'AUD' }: Props = $props();
</script>

<!-- A caller that omits amount now fails 'npm run check':
     Error: Property 'amount' is missing in type ... -->
<p>{currency} {amount.toFixed(2)}</p>`,
      note: "tsc --noEmit passes on both projects because it never opens .svelte files — only svelte-check (and the editor's language server) type-checks components, callers included.",
    },
    {
      label: "Wiring the gate into scripts and CI",
      intro:
        "Two package.json script blocks. On the left, the only quality gate is 'does it build'; on the right, the scaffolded check script makes type errors fail any pipeline that runs it.",
      php: `// package.json — no type gate
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview"
  }
}
// CI runs 'npm run build' — Vite happily strips the
// broken types and ships the bug.`,
      ts: `// package.json — as scaffolded by sv create
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "prepare": "svelte-kit sync || echo ''"
  }
}
// CI: npm ci && npm run check && npm run build
// svelte-check exits non-zero on errors -> pipeline fails.`,
      note: "sync runs before svelte-check so ./$types exist; prepare runs sync after install so a fresh CI checkout is ready to check with no extra steps.",
      leftLang: "js",
      rightLang: "js",
    },
  ],

  playground: {
    lang: "svelte",
    intro:
      "Everything in this file — script AND markup — is territory only svelte-check and the language server can type-check. Predict what renders and what typing into the input does.",
    code: `<!-- src/lib/components/ToolFilter.svelte -->
<script lang="ts">
  const tools: string[] = [
    "svelte-check",
    "svelte-kit sync",
    "typescript-eslint",
    "vite"
  ];

  let query = $state("");
  let matches = $derived(
    tools.filter((t) => t.includes(query.toLowerCase()))
  );
</script>

<input bind:value={query} placeholder="filter tools" />

<ul>
  {#each matches as tool}
    <li>{tool}</li>
  {/each}
</ul>

<!-- svelte-check checks this expression too: change .length to
     .lenght and 'npm run check' fails — tsc would never notice. -->
<p>{matches.length} of {tools.length} tools match</p>`,
    output: `Renders a text input, a list of all four tools, and "4 of 4 tools match".
Typing "svelte" filters the list to svelte-check and svelte-kit sync — "2 of 4 tools match".
Typing "zzz" empties the list — "0 of 4 tools match".
Changing matches.length to matches.lenght fails npm run check with:
  Property 'lenght' does not exist on type 'string[]'.
tsc --noEmit would report nothing, because it never parses .svelte files.`,
  },

  keyPoints: [
    "`tsc` cannot parse `.svelte` files — `svelte-check` is the CLI that type-checks components (script blocks *and* markup expressions) plus your `.ts` files.",
    "The scaffolded scripts are `check` and `check:watch`, both prefixed with `svelte-kit sync` so generated `./$types` exist before checking.",
    "The **Svelte for VS Code** extension runs the svelte-language-server — the same engine as svelte-check, so editor squiggles and CI failures agree.",
    "Generated types refresh continuously under `npm run dev`, and on any `svelte-kit sync` (including the `prepare` script after `npm install`).",
    "In CI, `npm ci && npm run check && npm run build` is the whole gate — svelte-check exits non-zero on errors.",
    "Linting is a separate lane: `eslint-plugin-svelte` + `typescript-eslint` catch pattern-level mistakes that aren't type errors.",
  ],

  interview: [
    {
      q: "Why isn't `tsc --noEmit` enough to type-check a SvelteKit project?",
      a: "Because `tsc` only understands `.ts`/`.js` files — it skips `.svelte` files entirely, and that's where most of the interesting types live: component props, rune-based state, and markup expressions. `svelte-check` fills the gap: it uses the Svelte language-server machinery to compile each component's view of the world and type-check the script block *and* the template, alongside regular TS files. So the standard project gate is `npm run check`, which runs `svelte-kit sync` (so generated types exist) followed by `svelte-check --tsconfig ./tsconfig.json`.",
    },
    {
      q: "Your teammate clones the repo and every `./$types` import is an error. What's wrong?",
      a: "Nothing is 'wrong' with the code — the generated files just don't exist yet. `./$types` modules live under the git-ignored `.svelte-kit` directory and are written by `svelte-kit sync`. Normally the `prepare` script runs sync right after `npm install`; if that was skipped (or install failed), the fix is to run `npx svelte-kit sync`, start `npm run dev`, or run `npm run check` — all of which regenerate the types.",
    },
    {
      q: "How would you set up type safety guardrails for a SvelteKit team?",
      a: "Three layers. Editor: everyone installs Svelte for VS Code (the svelte-language-server), so errors appear as you type, in markup as well as script. Local: `npm run check:watch` during bigger refactors, and strict mode on in tsconfig. CI: a job that runs `npm ci` then `npm run check` — sync runs via prepare, and svelte-check's non-zero exit fails the pipeline before build or deploy. I'd add `eslint-plugin-svelte` with `typescript-eslint` as a parallel lint step, since it catches Svelte-specific misuse that isn't a type error. It's the same philosophy as PHPStan plus php-cs-fixer in a PHP pipeline: checker for correctness, linter for patterns.",
    },
  ],

  quiz: [
    {
      question: "Which tool type-checks the expressions inside a .svelte file's markup?",
      options: [
        "tsc --noEmit",
        "svelte-check (and the svelte-language-server in your editor)",
        "vite build",
        "eslint-plugin-svelte",
      ],
      answerIndex: 1,
      explain:
        "svelte-check and the editor extension share the language-server machinery that understands .svelte files, including template expressions. tsc skips .svelte files, vite strips types without checking them, and eslint lints patterns rather than performing full type checking.",
    },
    {
      question: "Why does the scaffolded `check` script run `svelte-kit sync` before `svelte-check`?",
      options: [
        "sync installs svelte-check on demand",
        "sync clears the Vite cache so checks are deterministic",
        "sync generates .svelte-kit/tsconfig.json and the ./$types modules the checker needs",
        "sync compiles components so svelte-check runs faster",
      ],
      answerIndex: 2,
      explain:
        "svelte-check resolves imports through your tsconfig, which extends the generated one, and route files import from generated ./$types. Both artifacts are written by svelte-kit sync — without it, a fresh checkout would fail the check for missing modules, not real bugs.",
    },
    {
      question: "When do the types under .svelte-kit/types get regenerated?",
      options: [
        "Only when you run npm run build",
        "Continuously while the dev server runs, and whenever svelte-kit sync runs",
        "Only when you restart VS Code",
        "Every time a .svelte file is saved, even with no tooling running",
      ],
      answerIndex: 1,
      explain:
        "The dev server keeps generated types in sync as you create and rename routes; otherwise svelte-kit sync regenerates them — which happens automatically after npm install (prepare) and at the start of npm run check.",
    },
  ],
};

export default lesson;

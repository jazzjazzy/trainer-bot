import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "config-and-env",
  title: "Config and Environment Variables",
  part: "Production Hardening",
  estMinutes: 11,
  summary:
    "process.env is Node's getenv() — always string | undefined — so validate it once at startup with a zod schema and export a typed config singleton that crashes the boot, not a 3am request.",

  concept: `
Config sounds mundane until you remember the process model. In PHP, a bad
environment variable failed **one request** — annoying, visible in the next
error log, self-limiting. In a Node process that boots once and serves
traffic for weeks, a bad env var read lazily inside a handler is a landmine:
the deploy looks green, and the explosion happens at 3am when that code path
finally runs. The fix is a habit: **read and validate the entire environment
at startup, and crash the boot if anything is wrong.**

### process.env, and the built-in .env loader

\`process.env\` is Node's \`getenv()\`/\`$_ENV\`. Since Node 20.6 the runtime
loads dotfiles natively — the \`dotenv\` package is now optional:

\`\`\`bash
node --env-file=.env server.ts
# --env-file-if-exists=.env if the file is optional
\`\`\`

The \`.env\` file itself works exactly as in Laravel: KEY=value lines, kept out
of git (\`.gitignore\`), with real values injected by the platform in
production.

### The gotcha PHP never had at this scale: everything is string | undefined

\`\`\`ts
process.env.PORT;         // string | undefined — never a number
process.env.DATABASE_URL; // string | undefined — maybe missing entirely
\`\`\`

TypeScript is telling the truth: env vars are untyped text from outside your
program. Sprinkling \`process.env.PORT ?? "3000"\` and \`Number(...)\` through
the codebase means every call site re-solves (or forgets) the same problem.

### Validate once, at startup, with zod

\`\`\`ts
// src/config.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url(),                 // required — no default
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("FATAL: invalid environment");
  for (const issue of parsed.error.issues) {
    console.error(\`  \${issue.path.join(".")}: \${issue.message}\`);
  }
  process.exit(1); // crash the BOOT — the deploy fails, not a 3am request
}

export const config = parsed.data;
// { NODE_ENV: ..., PORT: number, DATABASE_URL: string, LOG_LEVEL: ... } — typed
\`\`\`

A missing \`DATABASE_URL\` now kills the process before it ever listens. Your
orchestrator (Docker, systemd, Kubernetes) sees the non-zero exit, the deploy
rolls back, and the on-call phone stays quiet. Crash-early is a *virtue* in a
long-running process.

### Config as a module singleton

Note what \`src/config.ts\` is: a module evaluated **once** (modules are cached
on first import), doing its validation at load time, exporting a
fully-typed object. Every file that needs config just imports it:

\`\`\`ts
import { config } from "./config.js";
pool = new Pool({ connectionString: config.DATABASE_URL });
app.listen(config.PORT);
\`\`\`

That's Laravel's \`config/*.php\` + \`config()\` helper collapsed into a plain
import — no service container, no cache:clear, and \`config.DATABSE_URL\` is a
compile error instead of a silent \`null\`.

### NODE_ENV conventions

\`NODE_ENV\` is the ecosystem's \`APP_ENV\`: libraries check it, and Express
enables production behaviours (like view caching) when it's \`"production"\`.
Convention: exactly \`development\` | \`production\` | \`test\` — resist inventing
\`staging\` here (Express and many libraries only special-case
\`"production"\`; put deployment-tier logic in your own variable like
\`APP_STAGE\`). Always set \`NODE_ENV=production\` in prod: some libraries skip
expensive dev-only checks based on it.
`,

  comparisons: [
    {
      label: "From .env to usable config",
      intro:
        "Both apps read DATABASE_URL and a port from the environment. Laravel routes it through config/*.php files and the config() helper; Node validates once in a config module and exports a typed object.",
      php: `<?php
// .env            DB_URL=pgsql://app:s3cret@db:5432/shop
// config/database.php — Laravel reads env ONCE (config:cache),
// handlers call config(), never env()
return [
    'url'  => env('DB_URL'),          // null if missing — no complaint
    'port' => (int) env('APP_PORT', 3000),
];

// somewhere in a controller:
$url = config('database.url');
// typo? config('databse.url') returns null, request limps on;
// a missing DB_URL surfaces when THIS request hits the DB`,
      ts: `// src/config.ts — .env loaded by: node --env-file=.env server.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),                              // required
  PORT: z.coerce.number().int().default(3000),        // string -> number
  NODE_ENV: z.enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.issues);
  process.exit(1); // missing DATABASE_URL fails the DEPLOY, not a request
}
export const config = parsed.data;

// in a handler file:
// import { config } from "./config.js";
// config.DATABSE_URL -> compile error (property does not exist)`,
      note:
        "Same .env file, opposite failure modes: Laravel's env()/config() return null and let the request discover the problem; the zod module makes a bad environment un-bootable and a typo un-compilable.",
    },
    {
      label: "Reading one variable with a fallback",
      intro:
        "Grab a port number with a default of 3000. The PHP one-liner hides two problems the typed version can't have: the value is a string, and every call site repeats the fallback.",
      php: `<?php
// scattered wherever it's needed:
$port = getenv('APP_PORT') ?: 3000;
// getenv returns string|false — so $port is
// '8080' (string) or 3000 (int), and PHP's
// type juggling quietly papers over it.

// another file, another fallback — they can drift:
$port = (int) (getenv('APP_PORT') ?: 8080);`,
      ts: `// the raw read — TypeScript refuses to let you forget:
const raw = process.env.APP_PORT;   // string | undefined
// raw * 1  -> compile error until you handle undefined

// so nobody reads process.env in handlers. They import:
import { config } from "./config.js";

const port: number = config.PORT;   // coerced + defaulted ONCE
// every consumer sees the same number, from one schema`,
      note:
        "process.env values are ALWAYS string | undefined — the zod schema is where coercion (z.coerce.number()) and defaults live, exactly once, instead of per call site.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "loadConfig() — the startup validator, hand-rolled zod-style so it runs here. Predict the typed config the good env produces, and which THREE errors the bad env reports, then run it.",
    code: `// A zod-style env validator, hand-rolled: parse process.env ONCE at
// startup, coerce strings to real types, and fail loudly with EVERY
// problem listed — not just the first.

interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: "development" | "production" | "test";
  logLevel: "debug" | "info" | "warn" | "error";
}

type RawEnv = Record<string, string | undefined>;

function loadConfig(raw: RawEnv): AppConfig {
  const errors: string[] = [];

  const databaseUrl = raw.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgres://")) {
    errors.push("DATABASE_URL: required, must start with postgres://");
  }

  const port = Number(raw.PORT ?? "3000"); // default, like zod .default()
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(\`PORT: expected integer 1-65535, got "\${raw.PORT}"\`);
  }

  const nodeEnvs = ["development", "production", "test"] as const;
  const nodeEnv = raw.NODE_ENV as AppConfig["nodeEnv"];
  if (!nodeEnvs.includes(nodeEnv)) {
    errors.push(\`NODE_ENV: expected one of \${nodeEnvs.join(" | ")}, got "\${raw.NODE_ENV}"\`);
  }

  const logLevels = ["debug", "info", "warn", "error"] as const;
  const logLevel = (raw.LOG_LEVEL ?? "info") as AppConfig["logLevel"];
  if (!logLevels.includes(logLevel)) {
    errors.push(\`LOG_LEVEL: expected one of \${logLevels.join(" | ")}, got "\${raw.LOG_LEVEL}"\`);
  }

  if (errors.length > 0) {
    throw new Error("Invalid environment:\\n  - " + errors.join("\\n  - "));
  }
  return { databaseUrl: databaseUrl!, port, nodeEnv, logLevel };
}

// Good env: everything present or defaulted — boots fine.
const good = loadConfig({
  DATABASE_URL: "postgres://app:secret@db:5432/shop",
  NODE_ENV: "production",
  PORT: "8080",
});
console.log("booted with:", JSON.stringify(good));

// Bad env: THREE problems, all reported at once — the deploy fails
// with a checklist instead of a 3am runtime surprise.
try {
  loadConfig({ PORT: "banana", NODE_ENV: "prod" });
} catch (err) {
  console.log((err as Error).message);
}`,
  },

  keyPoints: [
    "`node --env-file=.env` loads dotfiles natively (Node 20.6+) — the `dotenv` package is optional now. `.env` stays gitignored, same discipline as Laravel.",
    "Every `process.env` value is `string | undefined` — `PORT` is never a number and `DATABASE_URL` may be missing; TypeScript makes you face both.",
    "Validate the whole environment ONCE at startup with a zod schema (`z.coerce.number()`, `.default()`, `z.enum`) and `process.exit(1)` on failure — a bad env should fail the deploy, not a 3am request.",
    "In PHP a bad env var failed one request; in a long-running process, lazily-read config is a landmine — crash-early is the production-hardening move.",
    "Export the parsed result from `src/config.ts`: modules are cached, so it's evaluated once and imported everywhere — Laravel's `config()` helper collapsed into a typed import where typos are compile errors.",
    "`NODE_ENV` is convention-bound to `development` | `production` | `test` — Express and many libraries only special-case `\"production\"`, so put tier logic (staging etc.) in your own variable.",
  ],

  interview: [
    {
      q: "How do you manage configuration in a Node service, coming from Laravel's .env + config files?",
      a: "The .env file itself is identical — KEY=value, gitignored, real values injected in production — and since Node 20.6 the runtime loads it natively with `node --env-file=.env`, no dotenv package needed. The difference is what happens next: instead of Laravel's config() helper resolving values lazily per call, I build a config module that parses `process.env` through a zod schema at startup — coercing strings to numbers, applying defaults, enum-checking NODE_ENV — and calls `process.exit(1)` listing every problem if validation fails. That module exports a plain typed object; because ES modules are cached, it's evaluated once and imported everywhere. So a missing DATABASE_URL fails the deploy immediately rather than surfacing when some handler first touches the pool, and a typo like `config.DATABSE_URL` is a compile error rather than a silent null.",
    },
    {
      q: "Why is crashing on invalid config MORE appropriate in Node than it was in PHP?",
      a: "Because of what a crash costs in each model. In PHP-FPM, a fatal during one request killed one short-lived process; config was effectively re-read per request, so a fixed .env applied on the next hit — errors were self-limiting and crashing added little. A Node process boots once and serves every user for weeks, so the boot is the one moment you can verify the entire environment cheaply, and refusing to start turns a bad config into a failed deploy — visible in CI/CD, caught by the orchestrator's restart policy, rolled back before traffic hits it. The alternative is a green deploy that throws at 3am when a rarely-used code path finally reads the broken value, and now it's an incident affecting every user of that shared process.",
    },
    {
      q: "What's the type-level problem with process.env, and how do you solve it?",
      a: "Everything in `process.env` is `string | undefined` — the environment is untyped text from outside the program, and TypeScript refuses to pretend otherwise. So `PORT` is never a number, booleans are the string `\"true\"`, and any key might be absent. Handling that inline (`Number(process.env.PORT ?? 3000)`) scattered across the codebase means every call site re-solves coercion and defaults, and they drift. The solution is one schema: `z.coerce.number()` for ports, `.default()` for optionals, `z.enum` for NODE_ENV, parsed once at startup. Downstream code imports a config object whose types are real — validated at the boundary, trusted everywhere else, the same boundary-validation principle as validating request bodies.",
    },
  ],

  quiz: [
    {
      question: "What is the type of process.env.PORT in TypeScript?",
      options: [
        "number, because ports are numeric",
        "string, guaranteed present via .env",
        "string | undefined — env values are untyped text and may be missing",
        "unknown, requiring a cast before any use",
      ],
      answerIndex: 2,
      explain:
        "The environment is text from outside your program: every value is a string, and any key can be absent. That's why the config module exists — z.coerce.number() and .default() turn string | undefined into a real, guaranteed number exactly once.",
    },
    {
      question:
        "Your zod env schema fails to parse at startup because DATABASE_URL is missing. What SHOULD happen?",
      options: [
        "Log a warning and continue — the DB might not be needed",
        "Fall back to a sensible default connection string",
        "Print the issues and process.exit(1) so the deploy itself fails",
        "Retry parsing every 5 seconds until the variable appears",
      ],
      answerIndex: 2,
      explain:
        "Crash-early: a long-running process should refuse to boot with a broken environment, so the orchestrator sees the failure and the deploy rolls back. Continuing means the failure moves to whichever 3am request first needs the database — in one shared process, that's everyone's problem.",
    },
    {
      question: "Why does importing src/config.ts from twenty files not re-run the validation twenty times?",
      options: [
        "zod caches safeParse results globally",
        "ES modules are evaluated once and cached — every import gets the same singleton",
        "TypeScript inlines the config values at compile time",
        "Node re-runs it but process.env is memoized",
      ],
      answerIndex: 1,
      explain:
        "Module caching is the mechanism behind config-as-singleton (and the pg Pool, and everything else you want shared): first import runs the module body — the validation — and every later import receives the cached exports. That's Laravel's config cache behaviour, built into the module system.",
    },
  ],
};

export default lesson;

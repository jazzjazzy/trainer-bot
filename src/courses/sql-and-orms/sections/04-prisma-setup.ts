import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "prisma-setup",
  title: "Prisma 7 Setup: Schema, Generator, Adapter",
  part: "Foundations",
  estMinutes: 12,
  summary:
    "Prisma 7 bootstraps with three moving parts — prisma.config.ts, a schema with the new prisma-client generator, and a driver adapter — and most tutorials online still show the old way.",

  concept: `
Prisma 7 is a major rewrite, and the setup is where you feel it. Search
results and older tutorials overwhelmingly show Prisma 5/6 patterns that
now throw errors — knowing the current bootstrap is an instant credibility
marker.

### The three files that matter

A Prisma 7 project has a clear division of labour:

- **\`prisma.config.ts\`** — project configuration: where the schema lives,
  where migrations go, and the datasource URL via a typed \`env()\` helper.
  This replaces the old magic where \`.env\` was read implicitly through
  \`env("DATABASE_URL")\` inside the schema file.
- **\`prisma/schema.prisma\`** — your models and the generator. The
  datasource block now only declares the \`provider\`; the URL lives in
  config.
- **Your db module** — constructs the client with a **driver adapter**.

\`\`\`ts
// prisma.config.ts
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
\`\`\`

\`env()\` reads \`process.env\` and *throws* if the variable is missing —
fail-fast config, the thing you bolted onto PHP apps by hand. (Add
\`import 'dotenv/config'\` at the top if you load a \`.env\` file.)

### The new generator

\`\`\`ts
// prisma/schema.prisma
generator client {
  provider = "prisma-client"        // NEW in v7 (not prisma-client-js)
  output   = "../generated/prisma"  // REQUIRED — no more default location
}

datasource db {
  provider = "postgresql"
}
\`\`\`

The \`prisma-client\` generator emits plain TypeScript into a path **you
own** — it's your code, imported like any other module, not something
hidden in \`node_modules/.prisma\`. The old \`prisma-client-js\` still runs
but is legacy. \`binaryTargets\` is gone; the generator instead takes a
\`runtime\` option (\`nodejs\`, \`bun\`, \`workerd\`, \`vercel-edge\`, ...)
because there are no native binaries to target anymore.

### No Rust engine — adapters are mandatory

Through v6, every query passed through a bundled Rust query engine binary.
Prisma 7 replaces it with a TypeScript **query compiler**, and the actual
wire protocol is handled by a JS driver you provide via an adapter:

\`\`\`ts
// src/db.ts
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
\`\`\`

A bare \`new PrismaClient()\` — the line every pre-7 tutorial shows — now
throws a **PrismaClientInitializationError** at construction: the client
requires a driver adapter to connect to your database. For Postgres the adapter is \`@prisma/adapter-pg\`, which
wraps the same \`pg\` driver you'd use raw. Think of the adapter like PDO's
driver layer: PDO defines the interface, \`pdo_pgsql\` does the talking —
here Prisma defines the interface and \`pg\` does the talking.

### Why the rewrite matters (interview angle)

Smaller installs and cold starts (no per-platform binary), one less process
boundary to debug, and first-class serverless/edge support. If an
interviewer's codebase is on Prisma 5/6, you can name the migration items:
swap the generator and add \`output\`, add \`prisma.config.ts\`, install an
adapter, and update client construction.
`,

  comparisons: [
    {
      label: "App database config: config/database.php vs prisma.config.ts",
      intro:
        "Both files answer 'where is the database and how do I reach it?'. One is a convention-driven array; the other is a typed module that fails fast on missing env vars.",
      php: `<?php
// config/database.php — read by your bootstrap code
return [
    'driver'   => 'pgsql',
    'host'     => getenv('DB_HOST') ?: 'localhost',
    'port'     => getenv('DB_PORT') ?: '5432',
    'database' => getenv('DB_NAME'),   // false if unset —
    'username' => getenv('DB_USER'),   // discovered at
    'password' => getenv('DB_PASS'),   // connect time
];`,
      ts: `// prisma.config.ts — read by the CLI and tooling
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // env() THROWS at load time if DATABASE_URL is unset —
    // not a false that surfaces as a weird connect error.
    url: env('DATABASE_URL'),
  },
});`,
      note: "Same job, but defineConfig gives you a typed, editor-checked config, and env() makes missing configuration a loud startup failure instead of a silent false.",
    },
    {
      label: "What old tutorials show vs Prisma 7",
      intro:
        "The pre-7 bootstrap you'll find all over the internet, next to what actually works today. If you paste the left side into a Prisma 7 project, the client constructor throws.",
      php: `// ⚠️ Prisma 5/6 style — LEGACY
// prisma/schema.prisma
//   generator client {
//     provider = "prisma-client-js"   // legacy generator
//   }
//   datasource db {
//     provider = "postgresql"
//     url      = env("DATABASE_URL")  // .env magic in schema
//   }

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
// In v7 this line throws at construction: PrismaClient
// requires a driver adapter to connect to your database`,
      ts: `// ✅ Prisma 7
// prisma/schema.prisma
//   generator client {
//     provider = "prisma-client"        // new generator
//     output   = "../generated/prisma"  // required
//   }
//   datasource db { provider = "postgresql" }
// (URL lives in prisma.config.ts, not the schema.)

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });`,
      note: "Three v7 shifts in one view: prisma-client generator with a required output path, the datasource URL moved to prisma.config.ts, and a mandatory driver adapter because the Rust engine is gone.",
      leftLang: "ts",
    },
    {
      label: "Constructing the connection: PDO vs PrismaClient + adapter",
      intro:
        "The runtime object your queries flow through. The adapter plays the role of PDO's database-specific driver.",
      php: `<?php
// src/Db.php
$dsn = sprintf(
    'pgsql:host=%s;port=%s;dbname=%s',
    $config['host'], $config['port'], $config['database']
);

// PDO = interface, pdo_pgsql = the driver doing the talking
$pdo = new PDO($dsn, $config['username'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);`,
      ts: `// src/db.ts
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// PrismaClient = interface, PrismaPg (wrapping pg) = the
// driver doing the talking. No adapter? Throws at startup.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });`,
      note: "Structurally identical layering: generic client on top, database-specific driver underneath. The difference is that every query through prisma comes back typed against your schema.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "Read and predict: the full Prisma 7 bootstrap from empty project to generated client. What files does prisma init create, and where does the client code land after generate?",
    code: `# 1. CLI as a dev dependency; runtime client + Postgres adapter
npm install --save-dev prisma
npm install @prisma/client @prisma/adapter-pg

# 2. Scaffold the project files
npx prisma init --datasource-provider postgresql

# 3. Add a model to prisma/schema.prisma, set DATABASE_URL
#    in .env, then generate the typed client:
npx prisma generate`,
    output: `$ npm install --save-dev prisma
added 1 package in 4s

$ npm install @prisma/client @prisma/adapter-pg
added 12 packages in 6s

$ npx prisma init --datasource-provider postgresql

✔ Your Prisma schema was created at prisma/schema.prisma
✔ A prisma.config.ts file was created with your project configuration
✔ A .env file was created with a DATABASE_URL placeholder

Next steps:
1. Set the DATABASE_URL in the .env file to point to your database
2. Define your models in prisma/schema.prisma
3. Run npx prisma migrate dev to create your first migration

$ npx prisma generate
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client (v7.8.0) to ./generated/prisma in 92ms

Start by importing your Prisma Client:
import { PrismaClient } from './generated/prisma/client'`,
  },

  keyPoints: [
    "Prisma 7 splits setup across three files: `prisma.config.ts` (paths + datasource URL via the throwing `env()` helper), `prisma/schema.prisma` (models + generator), and your db module (client + adapter).",
    "The current generator is `provider = \"prisma-client\"` with a REQUIRED explicit `output` path — generated code lives in your project, not node_modules; `prisma-client-js` is legacy.",
    "The Rust query engine is gone: a TypeScript query compiler plans queries and a JS driver adapter (`@prisma/adapter-pg` wrapping `pg`) executes them.",
    "Bare `new PrismaClient()` throws in v7 — construction is `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.",
    "`binaryTargets` no longer exists; the generator takes a `runtime` option (nodejs, bun, workerd, vercel-edge, ...) instead.",
    "The adapter layer mirrors PDO's architecture: generic client interface on top, database-specific driver underneath.",
  ],

  interview: [
    {
      q: "What changed in Prisma 7 that breaks older setup tutorials?",
      a: "Four things. First, the generator: it's now `provider = \"prisma-client\"` emitting plain TypeScript to a required, explicit `output` path in your project — `prisma-client-js` with its hidden node_modules output is legacy. Second, the Rust query engine is gone, replaced by a TypeScript query compiler, so the client must be given a JS driver adapter — `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`; the bare `new PrismaClient()` every old tutorial shows throws. Third, configuration moved to `prisma.config.ts` with a typed `env()` helper — the datasource block in the schema now only declares the provider, no more `.env` magic in the schema file. Fourth, `binaryTargets` is replaced by a `runtime` generator option, since there are no native binaries to ship anymore.",
    },
    {
      q: "Why did Prisma drop the Rust engine, and what are the practical consequences?",
      a: "The Rust engine was a separate binary sitting between your JS code and the database — powerful, but it meant per-platform binaries (hence `binaryTargets`), bigger deployments, slower cold starts, and an extra process boundary when debugging. The v7 query compiler does the query planning in TypeScript, and actual database I/O goes through standard JS drivers via adapters — for Postgres that's `pg` under `@prisma/adapter-pg`. Consequences: leaner installs, better serverless and edge fit (the `runtime` option targets workerd or vercel-edge directly), and you control the driver — its pooling options, its TLS settings — the same way you did with PDO. The trade is that adapter configuration is now mandatory rather than implicit.",
    },
    {
      q: "Coming from PDO, how would you explain Prisma's driver adapter architecture?",
      a: "It's the same layering PDO uses. PDO gives you one interface — prepare, execute, fetch — and delegates the wire protocol to a driver like pdo_pgsql or pdo_mysql chosen by the DSN. PrismaClient is the interface: findMany, create, transactions. The adapter — PrismaPg wrapping the pg driver — is pdo_pgsql: it owns the connection, the protocol, and pooling. The differences are that Prisma's interface is generated from your schema, so results are typed per-model instead of being generic rows, and that in v7 the adapter is explicit in the constructor rather than inferred from a DSN string — which I'd argue is better, because the driver and its configuration are visible in code review.",
    },
  ],

  quiz: [
    {
      question:
        "What happens in Prisma 7 if you construct `new PrismaClient()` with no arguments?",
      options: [
        "It connects using DATABASE_URL from .env automatically",
        "It throws — a driver adapter (or accelerateUrl) is required",
        "It falls back to the bundled Rust query engine",
        "It works but logs a deprecation warning",
      ],
      answerIndex: 1,
      explain:
        "With the Rust engine removed, the client has no built-in way to reach the database. It requires a JS driver adapter — e.g. new PrismaClient({ adapter: new PrismaPg({ connectionString }) }) — and throws a PrismaClientInitializationError without one.",
    },
    {
      question:
        "Which generator block is correct for a new Prisma 7 project?",
      options: [
        'provider = "prisma-client-js" with binaryTargets = ["native"]',
        'provider = "prisma-client" with a required explicit output path',
        'provider = "prisma-client" with no output (it defaults to node_modules)',
        'provider = "typescript-client" with engine = "rust"',
      ],
      answerIndex: 1,
      explain:
        "Prisma 7's generator is prisma-client, and output is mandatory — generated code is plain TypeScript living in your project (e.g. ../generated/prisma). prisma-client-js and binaryTargets are the legacy v5/v6 pattern; binaryTargets was removed in favour of a runtime option.",
    },
    {
      question:
        "Where does the database connection URL live in a Prisma 7 project?",
      options: [
        "In the datasource block of schema.prisma via env(\"DATABASE_URL\")",
        "Hard-coded in the generated client",
        "In prisma.config.ts via the env() helper (and in the adapter's connectionString at runtime)",
        "In package.json under the prisma key",
      ],
      answerIndex: 2,
      explain:
        "The schema's datasource block now only declares the provider. Tooling reads the URL from prisma.config.ts — defineConfig({ datasource: { url: env('DATABASE_URL') } }) — and at runtime your adapter (new PrismaPg({ connectionString })) carries it. The in-schema env() call is the pre-7 pattern.",
    },
  ],
};

export default lesson;

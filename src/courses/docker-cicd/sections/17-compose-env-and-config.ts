import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "compose-env-and-config",
  title: "Env Files & Config in Compose",
  part: "Compose & Local Dev",
  estMinutes: 10,
  summary:
    "Compose has three env mechanisms people constantly confuse — the auto-loaded .env that fills ${VAR} placeholders in the YAML, env_file: which injects variables into a container, and environment: inline.",

  concept: `
Every PHP shop had a \`config.php\` with the production database password in
it, committed to the repo, plus a \`config.staging.php\` nobody kept in sync.
Compose replaces that with **one committed compose.yaml containing zero
secrets**, and per-environment values supplied from outside. The catch: there
are three mechanisms with confusingly similar names, and they do three
different jobs.

### 1. The \`.env\` file — interpolation INTO the YAML

If a file named \`.env\` sits in your project directory, Compose auto-loads it
and uses it to fill \`\${VAR}\` placeholders **inside compose.yaml itself**,
before anything runs:

\`\`\`yaml
# compose.yaml (committed — no secrets in it)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}   # filled from .env
\`\`\`

\`\`\`bash
# .env (gitignored)
DB_PASSWORD=s3cret-local
\`\`\`

Crucial nuance: \`.env\` feeds the **YAML template**, not the containers. A
variable in \`.env\` reaches a container only if the YAML passes it through
(as above). Also, a variable already set in your shell **wins over** the
\`.env\` value — handy for one-off overrides like \`PORT=8080 docker compose up\`.

### 2. \`env_file:\` — inject a whole file INTO one container

\`\`\`yaml
services:
  api:
    env_file:
      - .env.api    # every VAR=value line becomes container env
\`\`\`

This is a service-level attribute: the file's variables land in that
container's environment (what your app reads via \`process.env\` /
\`getenv()\`). It plays no part in \`\${VAR}\` interpolation of the YAML.
Same filename convention, completely different plumbing — this is the
confusion that bites everyone once.

### 3. \`environment:\` — inline variables for one container

\`\`\`yaml
services:
  api:
    environment:
      NODE_ENV: production
      DB_HOST: db
\`\`\`

Explicit, visible, committed — right for non-secret values. When the same
variable appears in both, \`environment:\` beats \`env_file:\`.

### Defaults, required values, and debugging

Interpolation supports fallbacks and guards:

- \`\${PORT:-3000}\` — use 3000 when PORT is unset or empty.
- \`\${DB_PASSWORD:?set DB_PASSWORD in .env}\` — abort with that message if missing.

Keep secrets out of git the same way you (should have) treated
\`config.php\`: put \`.env\` in \`.gitignore\` and commit a \`.env.example\`
listing the keys with blank or dummy values. For multiple environments,
keep one compose.yaml and pick the values per run:
\`docker compose --env-file .env.staging up -d\`.

When you're not sure what Compose will actually run, don't guess:
\`docker compose config\` prints the fully **resolved** file — every
\`\${VAR}\` substituted, defaults applied, normalised to canonical form.
It's the \`php -r "var_dump(include 'config.php');"\` of the container world.
`,

  comparisons: [
    {
      label: "Where the credentials live",
      intro:
        "Both apps need the production DB password at run time. One bakes it into a file in version control forever; the other keeps the committed file generic and supplies the secret from outside.",
      php: `<?php
// config.php - committed to the repo since 2009
define('DB_HOST', 'localhost');
define('DB_USER', 'shopuser');
define('DB_PASS', 'Pr0d-Passw0rd!');  // prod secret, in git history, forever
define('DB_NAME', 'shopdb');
// Staging? A second config.staging.php nobody keeps in sync.`,
      ts: `# .env (gitignored)             .env.example (committed, no values)
# DB_PASSWORD=s3cret-local       DB_PASSWORD=

# compose.yaml - committed; secret interpolated at run time
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD:?set DB_PASSWORD in .env}`,
      note:
        "The :? guard makes a missing secret a loud startup error instead of a silently empty password — and rotating the secret never touches git history.",
      leftLang: "php",
    },
    {
      label: "One stack, many environments",
      intro:
        "Point the same application at staging vs production settings. The manual version edits files on each server by hand; Compose keeps one definition and swaps the value files.",
      php: `# One hand-edited config per server, changed over SSH
$ ssh deploy@staging-box
$ vi /var/www/shop/config.php    # tweak DB host, save, hope
$ ssh deploy@prod-box
$ vi /var/www/shop/config.php    # same edit, different values,
                                 # no record of what changed`,
      ts: `# One committed compose.yaml + one env file per environment
$ docker compose --env-file .env.staging up -d
$ docker compose --env-file .env.prod up -d

# Not sure what will run? Print the resolved YAML first:
$ docker compose --env-file .env.prod config`,
      note:
        "The definition is identical everywhere; only the injected values differ. The hand-edited servers drift apart because every edit is invisible and unversioned.",
      rightLang: "bash",
    },
    {
      label: "Getting variables INTO the running app",
      intro:
        "The app reads its settings from environment variables. The old way wires them into Apache config or a shell profile on the server; Compose declares them per service.",
      php: `# Server-side env vars, the hand-rolled ways
$ vi /etc/apache2/sites-available/shop.conf
    SetEnv DB_PASSWORD "Pr0d-Passw0rd!"
$ service apache2 restart
# ...or export lines in ~/.bashrc that only exist
# in YOUR login shell, not in cron or Apache`,
      ts: `# compose.yaml - two ways to put vars INTO a container
services:
  api:
    image: shop-api:1.0
    env_file:
      - .env.api             # whole file injected into the container
    environment:
      NODE_ENV: production   # inline; wins over env_file on conflicts`,
      note:
        "env_file: and environment: populate the container's environment (what process.env sees); neither has anything to do with the auto-loaded .env that fills ${VAR} in the YAML.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "The .env file (shown in the comment) defines DB_PASSWORD but NOT PORT. Predict the resolved values `docker compose config` prints — including which side of the :- default wins — then check the transcript.",
    code: `# .env  (next to compose.yaml — auto-loaded by Compose)
#   DB_PASSWORD=s3cret-local
#   (PORT is deliberately not set)

# compose.yaml
services:
  api:
    image: shop-api:1.0
    ports:
      - "\${PORT:-3000}:3000"
    environment:
      DB_HOST: db
      DB_PASSWORD: \${DB_PASSWORD}
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:`,
    output: `$ docker compose config
name: shop
services:
  api:
    environment:
      DB_HOST: db
      DB_PASSWORD: s3cret-local
    image: shop-api:1.0
    networks:
      default: null
    ports:
      - mode: ingress
        target: 3000
        published: "3000"
        protocol: tcp
  db:
    environment:
      POSTGRES_PASSWORD: s3cret-local
    image: postgres:16
    networks:
      default: null
    volumes:
      - type: volume
        source: pgdata
        target: /var/lib/postgresql/data
        volume: {}
networks:
  default:
    name: shop_default
volumes:
  pgdata:
    name: shop_pgdata`,
  },

  keyPoints: [
    "Three different things: `.env` fills `${VAR}` placeholders IN the YAML; `env_file:` injects a file's variables INTO one container; `environment:` sets them inline per service.",
    "A variable from `.env` only reaches a container if the YAML passes it through — the auto-loaded `.env` is a template input, not container config.",
    "Shell environment variables override `.env` values during interpolation, so `PORT=8080 docker compose up` works as a one-off.",
    "`${PORT:-3000}` supplies a default when unset or empty; `${DB_PASSWORD:?message}` fails fast with that message when missing.",
    "Secrets stay out of git: `.env` in `.gitignore`, a committed `.env.example` documenting the keys — the lesson config.php taught the hard way.",
    "`docker compose config` prints the fully resolved, interpolated, normalised file — the first move when env layering behaves strangely.",
  ],

  interview: [
    {
      q: "In Docker Compose, what's the difference between the .env file, env_file:, and environment:?",
      a: "They operate at two different layers. The `.env` file in the project directory is read by the Compose CLI itself and used to substitute `${VAR}` placeholders inside compose.yaml before anything starts — it configures the YAML, not the containers. The other two are service-level attributes that populate a container's actual environment: `env_file:` injects every line of a named file, and `environment:` declares variables inline, winning on conflicts. The classic confusion is assuming `.env` variables automatically appear inside containers — they don't, unless the YAML explicitly passes them through. When I'm debugging a layering surprise, I run `docker compose config` and read the resolved output rather than reasoning about precedence in my head.",
    },
    {
      q: "How do you keep secrets out of the repository while keeping the Compose setup reproducible for teammates?",
      a: "The compose.yaml is committed and contains no secret values — only `${VAR}` references, ideally with `:?` guards like `${DB_PASSWORD:?set DB_PASSWORD}` so a missing secret fails loudly at startup instead of running with an empty password. The actual values live in `.env`, which is gitignored, and I commit a `.env.example` listing every required key with blank or dummy values so a new teammate copies it to `.env` and fills it in. It's the fix for the twenty-year-old PHP habit of committing config.php with production credentials — once a password is in git history, rotating it doesn't un-leak it.",
    },
    {
      q: "You run the same compose file in dev, staging, and production. How do you vary the configuration per environment?",
      a: "One committed compose.yaml, parameterised with `${VAR}` interpolation and sensible defaults like `${PORT:-3000}`, plus one env file per environment: `.env` locally, and `docker compose --env-file .env.staging up -d` elsewhere. For larger differences than values — say an extra debugging service in dev — Compose also supports override files merged with -f, but I reach for env files first because value-only differences cover most cases. Before deploying I run `docker compose --env-file .env.prod config` to see exactly what will run. The contrast with per-server hand-edited configs is that every environment difference is now a reviewable file in the repo, not drift on a box.",
    },
  ],

  quiz: [
    {
      question:
        "DB_PASSWORD=abc is in .env, and compose.yaml has no reference to it anywhere. What does the api container see in its environment?",
      options: [
        "DB_PASSWORD=abc — .env is injected into every container",
        "Nothing — .env only fills ${VAR} placeholders in the YAML, and nothing referenced it",
        "DB_PASSWORD with an empty value",
        "It depends on the image's ENV instructions",
      ],
      answerIndex: 1,
      explain:
        "The auto-loaded .env is input to YAML interpolation only. A value reaches a container solely through environment:, env_file:, or an interpolated placeholder that the YAML passes through. This is the single most common Compose env misconception.",
    },
    {
      question:
        "compose.yaml has ports: \"${PORT:-3000}:3000\". PORT is not in .env, but you run PORT=8080 docker compose up. Which host port is published?",
      options: [
        "3000 — the default always wins",
        "8080 — shell environment variables take precedence during interpolation",
        "Neither — Compose errors because PORT is not in .env",
        "Both 3000 and 8080",
      ],
      answerIndex: 1,
      explain:
        "Interpolation checks the shell environment first, then .env, then the :- default. The shell's PORT=8080 wins; the default 3000 only applies when the variable is unset (or empty) in both.",
    },
    {
      question:
        "Which command shows you the compose file exactly as Compose will run it, with all ${VAR} placeholders substituted?",
      options: [
        "docker compose ps",
        "docker compose inspect",
        "docker compose config",
        "docker compose env",
      ],
      answerIndex: 2,
      explain:
        "docker compose config resolves interpolation, applies defaults, merges any override files, and prints the normalised result — the canonical way to debug env layering before starting anything.",
    },
  ],
};

export default lesson;

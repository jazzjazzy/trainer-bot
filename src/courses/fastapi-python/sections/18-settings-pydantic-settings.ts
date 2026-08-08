import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "settings-pydantic-settings",
  title: "Configuration with pydantic-settings",
  part: "Dependencies & Architecture",
  estMinutes: 11,
  summary:
    "pydantic-settings turns environment variables into one typed, validated Settings object that fails loudly at startup — instead of env() calls scattered through the codebase failing quietly at request time.",

  concept: `
Every production app needs configuration: database URLs, secret keys, debug
flags. In PHP land that's \`vlucas/phpdotenv\` loading \`.env\`, \`config/*.php\`
arrays reading \`env()\`, and — in practice — raw \`env()\` calls sprinkled
wherever someone was in a hurry. The failure mode is familiar: a missing or
mistyped variable returns \`null\`, and you find out three layers deep in a
request, in production, at 2am.

FastAPI's answer is a Pydantic model for your environment.

### BaseSettings lives in its own package now

First, the gotcha that catches everyone migrating from older tutorials:
in Pydantic v2, \`BaseSettings\` moved **out** of pydantic into a separate
\`pydantic-settings\` package. \`from pydantic import BaseSettings\` is v1 code
and fails on v2.

\`\`\`bash
pip install pydantic-settings
\`\`\`

\`\`\`python
# app/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    app_name: str = "Shop API"
    debug: bool = False
    port: int = 8000
    database_url: str          # no default -> REQUIRED
\`\`\`

Instantiating \`Settings()\` reads each field from the environment (matching
case-insensitively: \`DATABASE_URL\` fills \`database_url\`), falls back to the
\`.env\` file, applies defaults, **coerces types** (\`"8000"\` → \`8000\`,
\`"true"\` → \`True\`), and validates. Precedence is sensible: real environment
variables beat \`.env\` values, which beat defaults.

### Fail at boot, not at request time

\`database_url\` has no default, so if it's unset — or set to something that
fails validation — \`Settings()\` raises a \`ValidationError\` listing **every**
problem at once, and the process refuses to start. Your orchestrator sees the
crash immediately. Compare that to \`env('DB_URL')\` silently returning
\`null\` until the first query runs. Malformed config becomes a deploy-time
failure instead of a runtime incident, and secrets stay in the environment,
never in code.

### The lru_cache dependency pattern

You could import a module-level \`settings = Settings()\` singleton, but the
idiomatic FastAPI move is a cached factory used as a dependency:

\`\`\`python
# app/dependencies.py
from functools import lru_cache
from app.settings import Settings

@lru_cache
def get_settings() -> Settings:
    return Settings()
\`\`\`

\`\`\`python
from typing import Annotated
from fastapi import Depends

SettingsDep = Annotated[Settings, Depends(get_settings)]

@app.get("/info")
def info(settings: SettingsDep):
    return {"app_name": settings.app_name}
\`\`\`

\`@lru_cache\` on a zero-argument function means \`Settings()\` is constructed
exactly once — the environment isn't re-read per request. But because handlers
receive it through \`Depends\`, tests can swap in fake settings with
\`app.dependency_overrides[get_settings] = lambda: Settings(database_url="sqlite://")\`
— no monkeypatching, no editing global state. That's the whole reason to
prefer the dependency over a bare module-level singleton.
`,

  comparisons: [
    {
      label: "Scattered env() vs one typed object",
      intro:
        "Both apps need an app name, a debug flag, a port, and a database URL from the environment. One validates everything up front; the other hopes.",
      php: `<?php
// config/database.php
return [
    'url' => env('DATABASE_URL'),   // null if missing!
];

// config/app.php
return [
    'name'  => env('APP_NAME', 'Shop API'),
    'debug' => env('APP_DEBUG', false),
];

// Somewhere deep in a request, much later:
$url = config('database.url');
// $url === null -> PDOException mid-request,
// long after deploy looked green.`,
      ts: `# app/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    app_name: str = "Shop API"
    debug: bool = False
    port: int = 8000
    database_url: str   # required: no default

settings = Settings()
# Missing DATABASE_URL? ValidationError at import,
# process exits, deploy goes red immediately.`,
      note:
        "Same .env file, opposite failure modes: env() returns null and defers the explosion; Settings() validates every field at boot and refuses to start with a malformed environment.",
    },
    {
      label: "Types come out, not just strings",
      intro:
        "Environment variables are always strings. Read a port number and a feature flag on both sides.",
      php: `<?php
// .env: APP_DEBUG=true  PORT=8000
$debug = env('APP_DEBUG');
// "true" (string) unless the dotenv layer
// special-cases it - classic gotcha:
if ($debug === true) { /* may never run */ }

$port = env('PORT');        // "8000" (string)
$next = $port + 1;          // works via type juggling
// ...until PORT="80,00" silently becomes 80`,
      ts: `# .env: DEBUG=true  PORT=8000
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    debug: bool = False
    port: int = 8000

s = Settings()
type(s.debug)   # <class 'bool'>  - real True
type(s.port)    # <class 'int'>   - real 8000

# PORT="80,00" -> ValidationError at startup:
# "Input should be a valid integer"`,
      note:
        "Pydantic coerces the env's strings into the declared types and rejects what it can't coerce — no type juggling, no string 'true' vs boolean true ambiguity.",
    },
    {
      label: "Global config() helper vs injected dependency",
      intro:
        "Handlers need config values. Laravel reaches out to a global helper; FastAPI injects a cached Settings object the handler declares.",
      php: `<?php
class InfoController extends Controller
{
    public function show()
    {
        // Hidden dependency: reaches into global state.
        // Tests must mutate shared config:
        // config(['app.name' => 'Test']);
        return response()->json([
            'app_name' => config('app.name'),
        ]);
    }
}`,
      ts: `from functools import lru_cache
from typing import Annotated
from fastapi import Depends, FastAPI
from app.settings import Settings

@lru_cache
def get_settings() -> Settings:
    return Settings()      # built once, cached

app = FastAPI()
SettingsDep = Annotated[Settings, Depends(get_settings)]

@app.get("/info")
def info(settings: SettingsDep):
    return {"app_name": settings.app_name}

# In tests - no globals touched:
# app.dependency_overrides[get_settings] = \\
#     lambda: Settings(app_name="Test")`,
      note:
        "The dependency is visible in the signature and swappable per-test via dependency_overrides; @lru_cache keeps it a singleton in production so the environment is read once.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "pydantic-settings in miniature: typed fields with defaults, type coercion from environment strings, and one aggregate error when required keys are missing or malformed. Predict both runs — the happy boot and the crash.",
    code: `# Simulating pydantic-settings with stdlib only.
# Fields: (type, default). REQUIRED means no default - like a
# field with no default on a BaseSettings class.

REQUIRED = object()

FIELDS = {
    "app_name": (str, "Shop API"),
    "debug": (bool, False),
    "port": (int, 8000),
    "database_url": (str, REQUIRED),
}

def coerce(typ, raw):
    if typ is bool:  # env vars are strings; "true"/"1" -> True
        if raw.lower() in ("1", "true", "yes", "on"):
            return True
        if raw.lower() in ("0", "false", "no", "off"):
            return False
        raise ValueError(f"could not parse {raw!r} as bool")
    return typ(raw)  # int("8000") -> 8000, etc.

def load_settings(env):
    values, errors = {}, []
    for name, (typ, default) in FIELDS.items():
        raw = env.get(name.upper())  # DATABASE_URL -> database_url
        if raw is None:
            if default is REQUIRED:
                errors.append(f"{name}: field required")
            else:
                values[name] = default
        else:
            try:
                values[name] = coerce(typ, raw)
            except ValueError as e:
                errors.append(f"{name}: {e}")
    if errors:
        raise ValueError(
            f"{len(errors)} validation error(s) for Settings\\n"
            + "\\n".join("  " + e for e in errors)
        )
    return values

# Boot 1: a healthy environment (strings, as env vars always are)
good_env = {
    "DEBUG": "true",
    "PORT": "8001",
    "DATABASE_URL": "postgresql://app:secret@db:5432/shop",
}
print("boot 1:", load_settings(good_env))

# Boot 2: PORT is garbage and DATABASE_URL is missing entirely.
# ALL problems are reported together, and the app never starts.
bad_env = {"PORT": "eight thousand"}
try:
    load_settings(bad_env)
except ValueError as e:
    print("boot 2 refused:")
    print(e)`,
    output: `boot 1: {'app_name': 'Shop API', 'debug': True, 'port': 8001, 'database_url': 'postgresql://app:secret@db:5432/shop'}
boot 2 refused:
2 validation error(s) for Settings
  port: invalid literal for int() with base 10: 'eight thousand'
  database_url: field required`,
  },

  keyPoints: [
    "`BaseSettings` moved to the separate `pydantic-settings` package in Pydantic v2 — `from pydantic_settings import BaseSettings, SettingsConfigDict`. Importing it from `pydantic` is v1 code.",
    "Fields load from environment variables (case-insensitive), then the `env_file` from `SettingsConfigDict(env_file=\".env\")`, then defaults — real env vars win over `.env`.",
    "Values are coerced to the declared types: `\"8000\"` → `int`, `\"true\"` → `bool`. What can't be coerced raises a `ValidationError`.",
    "A field with no default is required — a missing `DATABASE_URL` crashes the process at startup with every problem listed, instead of `env()` returning null mid-request.",
    "The idiomatic access pattern is `@lru_cache def get_settings()` used via `Depends`: built once in production, swappable per-test with `app.dependency_overrides`.",
    "Secrets stay in the environment, never in code — the Settings class documents *what* config exists without containing any of it.",
  ],

  interview: [
    {
      q: "How do you manage configuration in a FastAPI application?",
      a: "With `pydantic-settings`: a `Settings(BaseSettings)` class where each field is a typed attribute — `database_url: str`, `debug: bool = False` — and `model_config = SettingsConfigDict(env_file=\".env\")` for local development. Instantiating it reads the environment, coerces the string values into real types, and validates; a required field that's missing or malformed raises a ValidationError and the process refuses to boot, which is exactly what you want — config failures at deploy time, not mid-request. I expose it through an `@lru_cache`-decorated `get_settings()` dependency so it's constructed once but tests can override it via `app.dependency_overrides` without touching globals. Compared to the PHP pattern of phpdotenv plus `env()` calls, the big wins are types, a single documented inventory of all config, and fail-fast validation.",
    },
    {
      q: "A teammate writes `from pydantic import BaseSettings` and gets an error. What's wrong?",
      a: "That's the Pydantic v1 import. In v2, settings management was split out into its own package, so it's `pip install pydantic-settings` and `from pydantic_settings import BaseSettings, SettingsConfigDict`. The config style changed with it: v1's inner `class Config` with `env_file = \".env\"` becomes `model_config = SettingsConfigDict(env_file=\".env\")`. It's one of the most common migration trip-ups because nearly every pre-2023 tutorial shows the old import.",
    },
    {
      q: "Why wrap get_settings() in @lru_cache instead of just creating a module-level Settings() singleton?",
      a: "Both give you a single instance, but the cached dependency keeps testability. `@lru_cache` on a zero-argument function memoises the first `Settings()` call, so the environment and `.env` file are read once per process — same performance as a singleton. The difference shows in tests: because handlers receive settings via `Depends(get_settings)`, I can register `app.dependency_overrides[get_settings]` to return a test configuration for one test and remove it after, with no global mutation and no import-order surprises. A module-level singleton is also constructed at import time, which makes importing any module that touches it fail in environments where config isn't set — like a CI job that only wants to import the app to inspect routes.",
    },
  ],

  quiz: [
    {
      question: "In Pydantic v2, where does BaseSettings come from?",
      options: [
        "from pydantic import BaseSettings",
        "from fastapi import BaseSettings",
        "from pydantic_settings import BaseSettings",
        "from pydantic.v2 import BaseSettings",
      ],
      answerIndex: 2,
      explain:
        "Settings management was split into the separate pydantic-settings package in v2. The old `from pydantic import BaseSettings` is v1 code — spotting that import instantly dates a codebase.",
    },
    {
      question:
        "A Settings class declares `database_url: str` with no default, and DATABASE_URL isn't set anywhere. What happens?",
      options: [
        "settings.database_url is None",
        "settings.database_url is an empty string",
        "Settings() raises a ValidationError and the app never starts",
        "FastAPI returns 500 on the first request that uses it",
      ],
      answerIndex: 2,
      explain:
        "A field without a default is required. Instantiation fails immediately with a ValidationError listing every missing/invalid field — the fail-fast behaviour that's the whole point over env() returning null and exploding later.",
    },
    {
      question:
        "With SettingsConfigDict(env_file=\".env\"), the .env file says PORT=8000 but the real environment has PORT=9000. What does settings.port equal?",
      options: [
        "8000 — the .env file wins",
        "9000 — actual environment variables override the .env file",
        "It raises a conflict error",
        "Whichever was loaded first",
      ],
      answerIndex: 1,
      explain:
        "Precedence is init arguments, then real environment variables, then .env values, then field defaults. That ordering is what lets production inject real values while .env serves local development.",
    },
    {
      question: "What does @lru_cache add to the get_settings() dependency?",
      options: [
        "It re-reads .env on every request to pick up changes",
        "It makes Settings() run exactly once per process while staying overridable in tests",
        "It caches HTTP responses of endpoints that use settings",
        "It's required for Depends() to accept the function",
      ],
      answerIndex: 1,
      explain:
        "lru_cache memoises the zero-argument factory, so the environment is parsed once. Because access still goes through Depends(get_settings), tests can substitute a different factory via app.dependency_overrides — the best of singleton performance and injectable design.",
    },
  ],
};

export default lesson;

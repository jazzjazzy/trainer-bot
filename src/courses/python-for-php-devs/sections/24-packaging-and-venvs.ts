import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "packaging-and-venvs",
  title: "pip, venv & pyproject.toml — Composer, Translated",
  part: "Batteries Included",
  estMinutes: 12,
  summary:
    "Python's dependency workflow mapped onto Composer: venvs replace vendor/'s free isolation, pip replaces composer require, and pyproject.toml is your composer.json.",

  concept: `
Composer quietly gave you something you never had to think about: **isolation**.
Every project's dependencies land in its own \`vendor/\` directory, and the
autoloader only sees that project's packages. Python's \`pip\` does **not** work
that way by default — \`pip install\` puts packages into a shared, often
system-wide location. Two projects needing different versions of the same
library will fight. This is the #1 wound Python inflicts on newcomers.

### Rule zero: never pip install globally

The fix is a **virtual environment** — a per-project directory holding its own
interpreter link and its own site-packages, i.e. your \`vendor/\`, opt-in:

\`\`\`bash
python3 -m venv .venv            # create it (once per project)
source .venv/bin/activate        # enter it (per shell session)
pip install httpx                # now installs INTO .venv
\`\`\`

Activation just puts \`.venv/bin\` first on your PATH; \`deactivate\` leaves.
Your prompt shows \`(.venv)\` so you know where installs will land.

### The pip ↔ composer phrasebook

- \`pip install httpx\` ≈ \`composer require guzzlehttp/guzzle\`
- \`pip uninstall httpx\` ≈ \`composer remove ...\`
- \`pip list\` ≈ \`composer show\`
- \`pip freeze > requirements.txt\` — snapshot exact versions
- packages come from **PyPI** ≈ Packagist

\`requirements.txt\` is the traditional pin file — closer to \`composer.lock\`
than \`composer.json\`, but flat and dumb: just \`name==version\` lines, no
separation of "what I asked for" from "what got resolved".

### pyproject.toml — the composer.json

Modern Python declares the project in one file, \`pyproject.toml\`: metadata,
dependencies with constraints, dev dependencies, and tool configuration
(pytest, ruff, mypy) — the roles composer.json plus a slice of phpunit.xml
play in PHP:

\`\`\`toml
[project]
name = "acme-shop"
requires-python = ">=3.12"
dependencies = ["httpx>=0.27", "rich>=13.7"]

[dependency-groups]
dev = ["pytest>=8.2"]
\`\`\`

Packages can declare **entry points** (console scripts) that install real
executables onto your PATH — the equivalent of Composer's \`bin\` entries
putting \`vendor/bin/phpunit\` in reach.

### The tooling generation shift: uv

The pip+venv two-step is being replaced by **uv** — a fast Rust-built manager
that handles the venv, resolution, and a real lockfile (\`uv.lock\`) in one
tool: \`uv add httpx\`, \`uv sync\`, \`uv run pytest\`. It's the closest Python has
come to the Composer experience and is rapidly becoming the modern default.
**Poetry** is the older alternative in the same niche; you'll meet it in
existing codebases.

### One sharp edge: python3 -m pip

Prefer \`python3 -m pip install ...\` over bare \`pip\`. The \`-m\` form runs the
pip belonging to *that exact interpreter*, so package and interpreter can't
mismatch — bare \`pip\` on PATH may belong to a different Python than the one
you'll run. (Inside an activated venv the two agree, which is one more reason
to always be in one.)
`,

  comparisons: [
    {
      label: "Starting a project: isolation is opt-in",
      intro:
        "Set up a new project and install its first dependency. PHP gets isolation for free from vendor/; Python must create it explicitly first.",
      php: `# shell (PHP) — isolation is automatic
composer init
composer require guzzlehttp/guzzle

# deps land in ./vendor, autoloaded per-project.
# Another project's Guzzle 6 can't touch this one.
ls vendor/guzzlehttp/`,
      ts: `# shell (Python) — create the isolation yourself
python3 -m venv .venv
source .venv/bin/activate     # prompt shows (.venv)

pip install httpx             # lands in .venv only
pip freeze > requirements.txt # pin what you got

# forgot to activate? pip installs system-wide —
# the classic beginner wound. Never install globally.`,
      note:
        "vendor/ made per-project deps the default; a venv is the same idea but you must create and activate it — skipping that step pollutes the shared interpreter.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "composer.json vs pyproject.toml",
      intro:
        "The project manifest: name, platform constraint, runtime deps, dev deps. Same shape, different syntax.",
      php: `{
    "name": "acme/shop",
    "require": {
        "php": ">=8.2",
        "guzzlehttp/guzzle": "^7.8"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.0"
    },
    "scripts": {
        "test": "phpunit"
    }
}`,
      ts: `# pyproject.toml
[project]
name = "acme-shop"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.27",
    "rich>=13.7",
]

[dependency-groups]
dev = ["pytest>=8.2"]

# tool config lives here too (phpunit.xml's job):
[tool.pytest.ini_options]
testpaths = ["tests"]`,
      note:
        "pyproject.toml is composer.json plus tool config in one file; note >= constraints are spelled out — there's no ^ caret operator in Python version specifiers.",
      leftLang: "json",
      rightLang: "toml",
    },
    {
      label: "Day-to-day: composer vs uv",
      intro:
        "The modern workflow side by side: add a dependency, install from lock, run a tool. uv gives Python the Composer ergonomics pip never had.",
      php: `# shell (PHP)
composer require guzzlehttp/guzzle
composer install        # from composer.lock
vendor/bin/phpunit

# lockfile: composer.lock — exact resolved
# versions, committed to git`,
      ts: `# shell (Python, with uv)
uv add httpx            # updates pyproject + uv.lock
uv sync                 # install exactly from uv.lock
uv run pytest           # run inside the env, no
                        # activate step needed

# uv manages the .venv for you; poetry is the
# older tool in this niche. Plain pip has no
# lockfile — only pip freeze snapshots.`,
      note:
        "uv.lock is a true composer.lock equivalent (resolved graph, committed); requirements.txt from pip freeze is only a flat snapshot with no asked-for/resolved separation.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Python 3.11+ can parse pyproject.toml with the stdlib tomllib. This script reads a composer.json and a pyproject.toml side by side and prints the matching pieces — predict the dependency lines.",
    code: `import json
import tomllib  # stdlib TOML parser, Python 3.11+

composer_json = """{
    "name": "acme/shop",
    "require": {"php": ">=8.2", "guzzlehttp/guzzle": "^7.8"},
    "require-dev": {"phpunit/phpunit": "^11.0"}
}"""

pyproject_toml = """
[project]
name = "acme-shop"
requires-python = ">=3.12"
dependencies = ["httpx>=0.27", "rich>=13.7"]

[dependency-groups]
dev = ["pytest>=8.2"]
"""

composer = json.loads(composer_json)
project = tomllib.loads(pyproject_toml)["project"]

print(f"composer package: {composer['name']}")
print(f"pyproject package: {project['name']}")
print(f"needs python: {project['requires-python']}")

print("runtime deps:")
for dep in project["dependencies"]:
    print(f"  - {dep}")

dev = tomllib.loads(pyproject_toml)["dependency-groups"]["dev"]
print(f"dev deps: {dev}")

# same shape as composer.json: platform constraint + versioned deps
print(f"composer's php constraint: {composer['require']['php']}")
print(f"composer dev deps: {list(composer['require-dev'])}")`,
    output: `composer package: acme/shop
pyproject package: acme-shop
needs python: >=3.12
runtime deps:
  - httpx>=0.27
  - rich>=13.7
dev deps: ['pytest>=8.2']
composer's php constraint: >=8.2
composer dev deps: ['phpunit/phpunit']`,
  },

  keyPoints: [
    "Composer gave you per-project isolation for free via `vendor/`; Python's pip installs are shared unless you create a venv — never `pip install` outside one.",
    "The ritual: `python3 -m venv .venv` then `source .venv/bin/activate` — activation just prepends `.venv/bin` to PATH.",
    "`pip install/uninstall/list` ≈ `composer require/remove/show`; PyPI ≈ Packagist; `pip freeze > requirements.txt` pins exact versions (a flat, lock-ish snapshot).",
    "`pyproject.toml` ≈ composer.json: project metadata, dependencies, dev dependency groups, and tool config (pytest/ruff/mypy) in one file; entry points ≈ Composer bin scripts.",
    "`uv` is the modern default — one fast tool for venv + install + a real lockfile (`uv add`, `uv sync`, `uv run`); Poetry is its older sibling.",
    "Prefer `python3 -m pip` over bare `pip` so the package always lands in the interpreter you'll actually run.",
  ],

  interview: [
    {
      q: "Coming from Composer, what surprised you about Python dependency management?",
      a: "That isolation is opt-in. Composer drops everything into the project's `vendor/` automatically, so two apps can hold conflicting versions without ceremony. Bare `pip install` targets a shared site-packages — effectively installing every library globally — so the first thing you learn is to create a virtual environment per project (`python3 -m venv .venv`, then activate) and only install inside it. Once you internalise 'a venv is my vendor/ directory', the rest of the workflow maps cleanly: pip ≈ composer, PyPI ≈ Packagist, pyproject.toml ≈ composer.json.",
    },
    {
      q: "requirements.txt vs pyproject.toml — what goes where?",
      a: "pyproject.toml is the declaration of intent, like composer.json: name, `requires-python`, dependency constraints such as `httpx>=0.27`, dev groups, plus tool configuration. requirements.txt, usually generated with `pip freeze`, is a flat snapshot of exactly what's installed — closer to composer.lock in purpose, but weaker: it doesn't separate direct dependencies from transitive ones or record a resolved graph. Modern tools close that gap properly — uv keeps pyproject.toml as the manifest and writes `uv.lock` as a genuine lockfile you commit.",
    },
    {
      q: "What is uv and why is it displacing the pip+venv workflow?",
      a: "uv is a Rust-built package and project manager that collapses the whole toolchain: it creates and manages the venv itself, resolves dependencies extremely fast, maintains a real lockfile, and runs commands in the environment without a manual activate (`uv add httpx`, `uv sync`, `uv run pytest`). For a Composer user it's the first Python tool that feels familiar — manifest plus lockfile plus one CLI. Poetry pioneered this shape earlier and is still common in existing codebases, but uv's speed and pip compatibility have made it the emerging default.",
    },
    {
      q: "Why is `python3 -m pip install` recommended over plain `pip install`?",
      a: "Because `pip` on PATH is just whichever pip shim shells find first, and on machines with several Pythons it can belong to a different interpreter than the `python3` you'll run — you install a package and then 'module not found' anyway. `python3 -m pip` executes the pip module of that specific interpreter, so the target can't be ambiguous. Inside an activated venv both point to the same place, which is one more argument for always working in one.",
    },
  ],

  quiz: [
    {
      question: "You run `pip install requests` with no venv active. Where does it go?",
      options: [
        "Into a ./vendor directory like Composer",
        "Into the shared site-packages of that Python — visible to every project",
        "Into a hidden per-project cache pip creates automatically",
        "Nowhere; pip refuses to run outside a venv",
      ],
      answerIndex: 1,
      explain:
        "Unlike Composer, pip has no per-project default: without a venv, packages land in the interpreter's shared site-packages, where version conflicts between projects become inevitable. The venv is the vendor/ you must create yourself.",
    },
    {
      question: "Which pairing is correct?",
      options: [
        "pyproject.toml ≈ composer.lock, requirements.txt ≈ composer.json",
        "pyproject.toml ≈ composer.json, uv.lock ≈ composer.lock",
        "requirements.txt ≈ composer.json, uv.lock ≈ vendor/",
        "PyPI ≈ vendor/, Packagist ≈ site-packages",
      ],
      answerIndex: 1,
      explain:
        "pyproject.toml declares constraints and metadata (composer.json's job); uv.lock records the exact resolved graph (composer.lock's job). requirements.txt is a flat freeze snapshot, and PyPI is the registry, like Packagist.",
    },
    {
      question: "What does `source .venv/bin/activate` actually do?",
      options: [
        "Compiles the venv's packages for the current CPU",
        "Starts a sandboxed subprocess that blocks global installs",
        "Prepends .venv/bin to PATH so python/pip resolve to the venv's copies",
        "Copies system site-packages into the project",
      ],
      answerIndex: 2,
      explain:
        "Activation is just environment-variable surgery: .venv/bin goes first on PATH (and the prompt gains a marker), so python and pip now mean the venv's versions. That's why forgetting it silently sends installs to the shared interpreter.",
    },
    {
      question: "Why prefer `python3 -m pip install x` to `pip install x`?",
      options: [
        "The -m form downloads wheels in parallel",
        "It guarantees pip installs into the interpreter you invoked, avoiding PATH mismatch",
        "Plain pip cannot install from PyPI",
        "The -m form skips dependency resolution",
      ],
      answerIndex: 1,
      explain:
        "Bare pip is whichever shim PATH finds and may belong to a different Python installation. python3 -m pip runs that exact interpreter's pip module, so the package lands where your code will actually import it.",
    },
  ],
};

export default lesson;

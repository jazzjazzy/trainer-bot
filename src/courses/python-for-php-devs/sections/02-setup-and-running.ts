import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "setup-and-running",
  title: "Install, Run & the REPL",
  part: "First Contact",
  estMinutes: 10,
  summary:
    "Getting Python 3 onto your machine, running scripts, living in the REPL, and mapping venv + pip onto the Composer world you know.",

  concept: `
Running Python feels instantly familiar: it's a CLI interpreter you point at a
file, exactly like \`php script.php\`. The differences are in the tooling around
it — and in one tool PHP barely has: a real REPL.

### Installing and invoking

On Linux and macOS the binary is \`python3\` (a bare \`python\` may be missing, or
on old systems may even mean Python 2 — always type the 3). Debian/Ubuntu:
\`apt install python3 python3-venv python3-pip\`; macOS: \`brew install python\`.
Then:

\`\`\`bash
php script.php        # your muscle memory
python3 script.py     # the same muscle, new file extension
python3 --version     # e.g. Python 3.12.3
\`\`\`

### The REPL — a first-class tool

PHP has \`php -a\`, which technically exists. Python's REPL is where developers
actually *live*: you try an expression, poke an object, read \`help(str)\` — all
interactively. Just run \`python3\` with no arguments:

\`\`\`text
$ python3
>>> 3 * 7
21
>>> "abc".upper()
'ABC'
>>> exit()
\`\`\`

(Python 3.13 shipped a much nicer REPL with colour and multiline editing.)
For one-liners there's \`python3 -c\`, the twin of \`php -r\`:

\`\`\`bash
php -r 'echo 2 ** 10;'
python3 -c 'print(2 ** 10)'
\`\`\`

### Virtual environments ≈ per-project vendor/

Composer trained you well: dependencies live in the project (\`vendor/\`), never
globally. Python needs one extra step to get the same isolation — a **virtual
environment**, a private copy of the interpreter + packages inside your
project:

\`\`\`bash
python3 -m venv .venv            # create it (once), like the first composer install
source .venv/bin/activate        # activate for this shell session
pip install requests             # ≈ composer require guzzlehttp/guzzle
deactivate                       # leave the venv
\`\`\`

While a venv is active, \`python\` and \`pip\` refer to *that project's* copies.
Forgetting to activate — and polluting the global interpreter — is the classic
newcomer mistake; Composer never let you make it because \`vendor/\` was always
local.

### The ecosystem map

| PHP | Python |
| --- | --- |
| Composer | pip (+ venv) |
| Packagist | **PyPI** (pypi.org) |
| composer.json | **pyproject.toml** (modern) / requirements.txt (classic) |
| composer.lock | requirements.txt with pinned versions (or a lock file from newer tools) |
| vendor/ | .venv/ |

\`requirements.txt\` is the traditional flat list (\`pip install -r
requirements.txt\` ≈ \`composer install\`); \`pyproject.toml\` is the modern
manifest. A later section goes deep on packaging — for now, venv + pip is all
you need.

### uv — where the ecosystem is heading

**uv** (from Astral) is a Rust-based drop-in replacement for pip/venv that the
community is adopting fast — \`uv venv\` and \`uv pip install\` mirror the
commands above but run 10–100× faster, and \`uv run script.py\` handles the
environment for you. Learn the standard tools first; reach for uv the moment
they feel slow.
`,

  comparisons: [
    {
      label: "Running a script",
      intro:
        "Hello-world executed from the shell in both worlds. Same shape: interpreter binary, then the file. Both print one line and exit.",
      php: `<?php
// hello.php — run with: php hello.php
$name = 'world';
echo "Hello, {$name}!\\n";`,
      ts: `# hello.py — run with: python3 hello.py
name = "world"
print(f"Hello, {name}!")`,
      note:
        "print() appends the newline for you — no \\n needed. On most systems the binary is python3, not python.",
    },
    {
      label: "Per-project dependencies",
      intro:
        "Setting up a fresh project with one HTTP-client dependency. Composer gives you isolation automatically via vendor/; Python asks you to create and activate a venv first.",
      php: `# PHP — Composer
composer init
composer require guzzlehttp/guzzle

# deps land in ./vendor, autoloaded via
# require 'vendor/autoload.php';`,
      ts: `# Python — venv + pip
python3 -m venv .venv
source .venv/bin/activate

pip install requests
pip freeze > requirements.txt   # pin what you got

# teammates then run:
#   python3 -m venv .venv && source .venv/bin/activate
#   pip install -r requirements.txt`,
      note:
        "venv + pip ≈ vendor/ + composer, but activation is manual — install without an active venv and you've polluted the global interpreter. Packages come from PyPI, Python's Packagist.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "One-liners and the REPL",
      intro:
        "Quickly evaluating an expression without creating a file — first as a shell one-liner, then interactively.",
      php: `# php -r for one-liners
php -r 'echo strtoupper("abc"), PHP_EOL;'

# php -a exists, but few PHP devs live in it
php -a
# Interactive shell
# php > echo 2 ** 10;
# 1024`,
      ts: `# python3 -c for one-liners
python3 -c 'print("abc".upper())'

# The REPL is a daily tool, not a curiosity
python3
# >>> 2 ** 10
# 1024
# >>> help(str.upper)   # docs, right there
# >>> exit()`,
      note:
        "The REPL echoes bare expression values without print() — that's REPL behaviour only, scripts must print explicitly. Python 3.13 upgraded the REPL with colour and multiline editing.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A script showing the standard entry-point idiom — Python's explicit version of PHP's 'is this file being run or required?'. Predict what running `python3 greet.py` (no arguments) prints.",
    code: `# greet.py — run with: python3 greet.py
# In PHP this file would be greet.php and every request would re-run it.
# Here it runs once, top to bottom, when YOU invoke it.
import sys


def greet(name):
    return f"Hello, {name}!"


def main():
    args = sys.argv[1:]          # like $argv in PHP CLI, minus the script name
    name = args[0] if args else "world"
    print(greet(name))
    print(f"extra arguments passed: {len(args)}")


# Only runs when executed directly, not when imported —
# roughly PHP's "require vs run" distinction, made explicit.
if __name__ == "__main__":
    main()`,
    output: `Hello, world!
extra arguments passed: 0`,
  },

  keyPoints: [
    "Run scripts with `python3 script.py` — the direct analogue of `php script.php`. Always type the 3.",
    "The REPL (`python3` with no args) is a daily tool for trying expressions and reading `help(...)` — far beyond `php -a`. `python3 -c` ≈ `php -r`.",
    "`python3 -m venv .venv` + `source .venv/bin/activate` gives you Composer-style per-project isolation; forgetting to activate installs globally.",
    "pip ≈ Composer, PyPI ≈ Packagist, requirements.txt / pyproject.toml ≈ composer.json.",
    "`if __name__ == \"__main__\":` guards code so it runs when executed directly but not when imported.",
    "uv is the fast modern replacement for pip/venv (`uv venv`, `uv pip install`) that the ecosystem is rapidly adopting.",
  ],

  interview: [
    {
      q: "Coming from Composer, how do you manage dependencies in a Python project?",
      a: "The mapping is close: PyPI is Packagist, pip is Composer, and a virtual environment is my `vendor/` — a per-project interpreter created with `python3 -m venv .venv` and activated per shell. Dependencies are declared in `pyproject.toml` on modern projects or a `requirements.txt` on older ones, and `pip install -r requirements.txt` is the `composer install` equivalent. The one habit to build is activation: unlike Composer, pip will happily install into the global interpreter if no venv is active. On newer projects I'd reach for uv, which wraps the same workflow but resolves and installs dramatically faster.",
    },
    {
      q: "What is a virtual environment actually doing, and why does Python need one when PHP doesn't?",
      a: "A venv is a directory containing a private `python` executable plus its own `site-packages`, and activating it just puts that directory first on your PATH. Python needs it because packages install *into the interpreter*, which is global by default — two projects needing different versions of the same library would collide. PHP sidesteps this because Composer always installs into the project's `vendor/` and the autoloader is file-local. So venv isn't extra complexity for its own sake; it's how Python gets the per-project isolation Composer gave you for free.",
    },
    {
      q: "When would you use the Python REPL in real work?",
      a: "Constantly — it's the fastest feedback loop in the language. I'd use it to poke at an unfamiliar API (`help(obj)`, `dir(obj)`), check what a stdlib function actually returns, or prototype a transformation on sample data before it goes into a script. It's the same itch `php -a` or a tinker session scratches in PHP land, except it's a polished, universal habit in Python — and since 3.13 the REPL has colour, multiline editing and history that make it genuinely pleasant.",
    },
  ],

  quiz: [
    {
      question: "What is the closest Python equivalent of Composer's per-project `vendor/` directory?",
      options: [
        "The global site-packages directory",
        "A virtual environment (`python3 -m venv .venv`) with packages installed via pip",
        "The `__pycache__` folder",
        "PyPI itself",
      ],
      answerIndex: 1,
      explain:
        "A venv holds a private interpreter and its own installed packages for one project, giving the isolation vendor/ gives PHP — but you must activate it, or pip installs globally.",
    },
    {
      question: "Which command evaluates a Python one-liner from the shell, like PHP's `php -r`?",
      options: ["python3 -a", "python3 -e", "python3 -c", "python3 -m"],
      answerIndex: 2,
      explain:
        "`python3 -c 'print(...)'` runs the given string as a program. `-m` runs a module (as in `python3 -m venv`), and `-a`/`-e` don't exist.",
    },
    {
      question: "What does the `if __name__ == \"__main__\":` block do?",
      options: [
        "Declares the script's entry point, which Python requires in every file",
        "Runs its body only when the file is executed directly, not when imported",
        "Marks the code as private to the module",
        "Ensures the script runs on every web request, like PHP",
      ],
      answerIndex: 1,
      explain:
        "When a file is executed directly, Python sets __name__ to \"__main__\"; when imported, __name__ is the module's name. The guard is optional but idiomatic — it makes a file safe to both run and import.",
    },
  ],
};

export default lesson;

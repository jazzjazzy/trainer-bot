import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "cli-scripts",
  title: "CLI Scripts & Automation",
  part: "Real-World Python",
  estMinutes: 12,
  summary:
    "Ops scripts, cron jobs and glue code are where Python eats PHP's lunch: argparse, subprocess and pathlib make proper command-line tools out of the box.",

  concept: `
PHP *can* do CLI work — \`php script.php\`, \`$argv\`, \`exec()\` — but almost nobody
reaches for it outside a framework's \`artisan\`/\`bin/console\`. Python is the
default language of ops scripts, cron jobs and automation glue on every Linux
box, and the stdlib is why: argument parsing, process control and file
manipulation are batteries included.

### Arguments: $argv → sys.argv → argparse

\`sys.argv\` is exactly \`$argv\`: a list, script name at index 0. But you skip
straight past the \`getopt()\` tier to **argparse** — declarative flags with
types, defaults, choices and validation, and it generates \`--help\` for free:

\`\`\`python
import argparse

parser = argparse.ArgumentParser(description="Resize images")
parser.add_argument("src", help="source directory")
parser.add_argument("--width", type=int, default=800)
parser.add_argument("--force", action="store_true")
args = parser.parse_args()          # reads sys.argv, exits with usage on bad input
print(args.src, args.width, args.force)
\`\`\`

That's the job symfony/console does in PHP — except argparse needs no
framework and no Composer install. Interactive prompts are \`input("Continue? ")\`
(≈ \`readline()\`), and \`sys.exit(1)\` sets the exit code your shell and CI check
(≈ \`exit(1)\`).

### Shelling out: subprocess, without the injection

PHP's \`exec()\`/\`shell_exec()\` take a *string*, so building commands means
escaping games with \`escapeshellarg()\`. \`subprocess.run()\` takes an **argument
list** — each element arrives at the child process verbatim, no shell involved,
so injection-by-concatenation simply can't happen:

\`\`\`python
import subprocess

result = subprocess.run(
    ["ls", "-la", user_supplied_dir],   # a LIST, not a string
    capture_output=True, text=True, check=True,
)
print(result.stdout)
\`\`\`

\`capture_output=True\` grabs stdout/stderr, \`text=True\` decodes them to \`str\`,
and \`check=True\` raises \`CalledProcessError\` on a non-zero exit — errors become
exceptions instead of silently ignored return codes.

### The rest of the toolbox

- **Shebang**: \`#!/usr/bin/env python3\` at the top + \`chmod +x\` makes
  \`./deploy.py\` runnable — the same trick that works for PHP CLI scripts and
  that nobody ever used.
- **Environment**: \`os.environ.get("API_KEY", "dev-key")\` ≈ \`getenv()\` with a
  default; \`os.environ\` is a dict-like of the whole environment.
- **Pipes**: read \`sys.stdin\` (iterate it line by line) to sit in a pipeline —
  \`cat access.log | ./summarise.py\` — the same role as \`php://stdin\`.
- **File ops**: \`pathlib.Path\` for paths/globbing and \`shutil\` for the heavy
  lifting — \`shutil.copy2()\`, \`shutil.move()\`, \`shutil.rmtree()\` — replace the
  \`copy()\`/\`rename()\`/recursive-\`unlink()\` dance.

### Ecosystem upgrades

When a script grows up: **click** (decorator-based commands), **typer** (build
the CLI from type hints — argparse what FastAPI is to Flask), and **rich**
(tables, colours, progress bars in the terminal). For 50-line glue, argparse
alone is usually plenty.
`,

  comparisons: [
    {
      label: "Parsing flags: getopt() vs argparse",
      intro:
        "A script taking a required source directory, an optional --width integer and a --force switch — with usage/help output when called wrongly.",
      php: `<?php
#!/usr/bin/env php
// resize.php — getopt(): terse, no validation, no help
$opts = getopt('', ['width::', 'force']);
$src = $argv[count($argv) - 1] ?? null;

if ($src === null) {
    fwrite(STDERR, "usage: resize.php [--width=N] [--force] <src>\\n");
    exit(1);
}
$width = (int) ($opts['width'] ?? 800);
$force = isset($opts['force']);
echo "resizing {$src} to {$width}px\\n";`,
      ts: `#!/usr/bin/env python3
# resize.py — argparse: types, defaults, and --help for free
import argparse

parser = argparse.ArgumentParser(description="Resize images")
parser.add_argument("src", help="source directory")
parser.add_argument("--width", type=int, default=800)
parser.add_argument("--force", action="store_true")
args = parser.parse_args()

print(f"resizing {args.src} to {args.width}px")
# ./resize.py --help   -> full usage text, generated
# ./resize.py --width=abc -> error + usage, exit code 2`,
      note:
        "argparse validates types, applies defaults, writes the usage/--help text and exits non-zero on bad input — everything getopt() leaves as your problem, without needing symfony/console.",
    },
    {
      label: "Running a shell command safely",
      intro:
        "Run git log for a branch name that came from user input, capture the output, and fail loudly if the command fails.",
      php: `<?php
// exec() takes a STRING — you must escape or be injected
$branch = $argv[1];
$cmd = 'git log --oneline -5 ' . escapeshellarg($branch);
exec($cmd, $lines, $code);

if ($code !== 0) {
    fwrite(STDERR, "git failed with code {$code}\\n");
    exit($code);
}
echo implode("\\n", $lines), "\\n";`,
      ts: `# subprocess.run() takes a LIST — no shell, nothing to escape
import subprocess
import sys

branch = sys.argv[1]
result = subprocess.run(
    ["git", "log", "--oneline", "-5", branch],
    capture_output=True, text=True, check=True,
)   # check=True -> raises CalledProcessError on non-zero exit
print(result.stdout, end="")`,
      note:
        "The argument list bypasses the shell entirely, so '; rm -rf /' in branch is just a weird branch name — and check=True turns exit codes into exceptions instead of forgotten ints.",
    },
    {
      label: "Reading stdin in a pipeline",
      intro:
        "A filter script that counts non-empty lines piped into it, e.g. `cat access.log | ./count.py`.",
      php: `<?php
#!/usr/bin/env php
// count.php — php://stdin
$in = fopen('php://stdin', 'r');
$count = 0;
while (($line = fgets($in)) !== false) {
    if (trim($line) !== '') {
        $count++;
    }
}
echo "{$count} non-empty lines\\n";`,
      ts: `#!/usr/bin/env python3
# count.py — sys.stdin is iterable, line by line
import sys

count = sum(1 for line in sys.stdin if line.strip())
print(f"{count} non-empty lines")`,
      note:
        "sys.stdin iterates lazily line by line (fine for huge inputs); an empty-after-strip() string is falsy, so the generator expression does the trim-and-test in one pass.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A miniature deploy tool showing argparse (fed a simulated argv list), an env-var default, and a safe subprocess call. Predict every line — including what --dry-run and the missing DEPLOY_REGION variable produce.",
    code: `# deploy_tool.py — the shape of a real ops script: argparse, env vars, subprocess.
import argparse
import os
import subprocess

parser = argparse.ArgumentParser(description="Fake deploy tool")
parser.add_argument("service", help="service to deploy")
parser.add_argument("--env", default="staging", choices=["staging", "prod"])
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--replicas", type=int, default=2)

# Normally argparse reads sys.argv; here we pass a list to simulate:
#   ./deploy_tool.py api --env prod --dry-run
args = parser.parse_args(["api", "--env", "prod", "--dry-run"])

print(f"service={args.service} env={args.env} replicas={args.replicas}")
print("dry run!" if args.dry_run else "deploying for real")

# os.environ.get ≈ getenv() with a default
region = os.environ.get("DEPLOY_REGION", "ap-southeast-2")
print(f"region={region}")

# subprocess.run with an argument LIST — no shell, no injection risk
result = subprocess.run(["echo", "deploy", args.service],
                        capture_output=True, text=True, check=True)
print(f"child said: {result.stdout.strip()} (exit {result.returncode})")`,
    output: `service=api env=prod replicas=2
dry run!
region=ap-southeast-2
child said: deploy api (exit 0)`,
  },

  keyPoints: [
    "`sys.argv` ≈ `$argv`, but real scripts use `argparse`: declared flags with types, defaults and `choices`, plus auto-generated `--help` — symfony/console power with zero dependencies.",
    "`subprocess.run([\"cmd\", \"arg\"], capture_output=True, text=True, check=True)` replaces `exec()`: argument *lists* kill shell injection, and `check=True` turns bad exit codes into exceptions.",
    "`sys.exit(1)` sets the exit code; `input()` ≈ `readline()`; `os.environ.get(\"KEY\", default)` ≈ `getenv()` with a fallback.",
    "`#!/usr/bin/env python3` + `chmod +x` makes scripts directly runnable; iterate `sys.stdin` to sit in a shell pipeline (≈ `php://stdin`).",
    "`pathlib` + `shutil` (`copy2`, `move`, `rmtree`) cover file-wrangling scripts without hand-rolled recursion.",
    "Ecosystem upgrades when scripts grow: `click`, `typer` (type-hint-driven CLIs — argparse what FastAPI is to Flask) and `rich` for terminal UI.",
  ],

  interview: [
    {
      q: "How would you write a small command-line tool in Python, coming from PHP?",
      a: "The skeleton is: shebang `#!/usr/bin/env python3`, an `argparse.ArgumentParser` declaring positionals and flags with types and defaults, a main function, and `sys.exit()` with a meaningful code. argparse is the key upgrade over PHP's `$argv`/`getopt()` — it validates input, applies types, and generates the `--help` output automatically, which in PHP-land I'd have pulled in symfony/console for. Config comes from `os.environ.get()` with defaults, shelling out goes through `subprocess.run()` with argument lists, and file work uses `pathlib`/`shutil`. If the tool grows subcommands or needs polish, I'd graduate to typer or click plus rich, but the stdlib covers most ops scripts.",
    },
    {
      q: "What's safer about subprocess.run compared to PHP's exec()/shell_exec()?",
      a: "`exec()` takes a single command *string* that a shell interprets, so any interpolated user input must be wrapped in `escapeshellarg()` — forget once and you've got command injection. `subprocess.run([\"git\", \"log\", branch])` takes a list: each element is passed to the child process as a literal argument with no shell in between, so metacharacters like `;` or backticks are inert data. It also gives structured results — `result.stdout`, `result.stderr`, `result.returncode` (with `capture_output=True, text=True`) — and `check=True` raises `CalledProcessError` on failure, so a broken command becomes an exception rather than an ignored return code. You *can* opt into `shell=True` for pipes and globs, at which point you're back to PHP-style string risks.",
    },
    {
      q: "How does a Python script behave well in a Unix pipeline?",
      a: "Read `sys.stdin` — it's iterable line by line, so `for line in sys.stdin:` streams input of any size, the same job as `php://stdin`. Write results to stdout with `print()` and diagnostics to `sys.stderr` so they don't pollute the pipe, and exit with `sys.exit(0)` on success or non-zero on failure so `&&`, `set -e` and CI steps can react. Add the shebang and `chmod +x` and the script slots into `cat log | ./filter.py | sort` like any other Unix tool. That discipline — stdin/stdout/stderr/exit codes — is exactly why Python became the default glue language on servers.",
    },
  ],

  quiz: [
    {
      question: "Why does `subprocess.run([\"ls\", \"-la\", user_dir])` avoid shell injection?",
      options: [
        "subprocess automatically escapes special characters in each argument",
        "The argument list is passed to the child directly — no shell ever parses it",
        "subprocess refuses to run when arguments contain metacharacters",
        "It doesn't — you still need shlex.quote() on every argument",
      ],
      answerIndex: 1,
      explain:
        "With a list (and the default shell=False), Python executes the program directly and hands each list element to it as a literal argument — there is no shell to interpret ';', '|' or backticks. PHP's exec() always builds a shell string, hence escapeshellarg().",
    },
    {
      question: "What does argparse give you over reading sys.argv manually, PHP-getopt() style?",
      options: [
        "Nothing — it's just a different syntax for the same thing",
        "Faster startup time for the script",
        "Declared, typed, defaulted flags plus auto-generated --help and usage errors",
        "It lets the script run without a Python interpreter installed",
      ],
      answerIndex: 2,
      explain:
        "You declare each argument once (name, type, default, choices, help text) and argparse handles parsing, validation, defaults, error messages with usage, and a full --help screen — the boilerplate getopt()/$argv leaves you to write, or that PHP devs install symfony/console for.",
    },
    {
      question: "What does check=True do in subprocess.run(...)?",
      options: [
        "Verifies the executable exists before running it",
        "Runs the command in a sandbox and checks its output",
        "Raises CalledProcessError if the command exits non-zero",
        "Retries the command once if it fails",
      ],
      answerIndex: 2,
      explain:
        "check=True converts a non-zero exit status into a CalledProcessError exception, so failures surface like any other Python error instead of being an easily-forgotten $code integer, as with PHP's exec().",
    },
    {
      question: "Which is the idiomatic way to read piped input in a Python filter script?",
      options: [
        "open('/dev/tty').read()",
        "Iterating sys.stdin line by line",
        "input() in a loop until it returns None",
        "os.environ['STDIN']",
      ],
      answerIndex: 1,
      explain:
        "sys.stdin is a file object you can iterate lazily — `for line in sys.stdin:` — the equivalent of reading php://stdin. input() raises EOFError at end of input (it never returns None), and /dev/tty is the terminal, not the pipe.",
    },
  ],
};

export default lesson;

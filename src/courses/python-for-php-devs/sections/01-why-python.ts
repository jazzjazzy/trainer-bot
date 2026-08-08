import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "why-python",
  title: "Why Python, Coming from PHP",
  part: "First Contact",
  estMinutes: 10,
  summary:
    "What Python is for, how its philosophy and execution model differ from PHP's, and how to read the rest of this course.",

  concept: `
After 25 years of PHP you already know how to program — you're learning a new
**spelling** and a different **worldview**. PHP grew up as *the* language of the
web request; Python grew up as a general-purpose scripting language and now
dominates **data work, AI/ML, automation, and tooling**, while also doing web
perfectly well (Django, FastAPI, Flask).

### Where each language lives

- **PHP**: web-first. Nearly every PHP file you've ever written ran inside a
  request/response cycle.
- **Python**: scripts and CLIs, data pipelines, scientific computing (NumPy,
  pandas), machine learning (PyTorch, scikit-learn), DevOps glue, test
  automation — *and* web apps via **Django** (batteries-included, think
  Laravel) or **FastAPI** (lean, typed, think Slim/API Platform).

### The philosophy gap

PHP is pragmatic and permissive: there are usually five ways to do a thing.
Python's culture is the opposite, summed up by a line from the Zen of Python:
*"There should be one — and preferably only one — obvious way to do it."*
Readability is treated as a feature. The most visible consequence — and the
single biggest visual shock after decades of braces — is that **indentation IS
the syntax**. There are no \`{ }\` around blocks and no \`;\` at line ends; the
structure you'd express with braces, Python expresses with the indentation
you were already writing anyway:

\`\`\`python
def greet(name):
    if name:
        return f"Hello, {name}"
    return "Hello, stranger"
\`\`\`

Mis-indent a line and you haven't written ugly code — you've written
*different* code (or a syntax error).

### Small shocks up front

- **No \`$\` sigils.** Variables are bare names: \`total\`, not \`$total\`.
- **No semicolons.** The end of the line ends the statement.
- **snake_case everywhere** for functions and variables (\`send_email\`, not
  \`sendEmail\`). Classes are PascalCase, same as PHP.
- **\`None\`, \`True\`, \`False\`** — capitalised.

### Which Python?

**Python 3.12/3.13** is the modern era and what this course targets. Python 2
died on 1 January 2020 — if you ever meet \`print "hello"\` without parentheses,
you're looking at a corpse; never write it, never install it.

### The execution-model headline

This is the deepest difference, and it will bite you later if you skip it now.
A PHP script is born when a request arrives and **dies when the response is
sent** — every request starts from a blank slate (opcache caches compiled code,
not your variables). A Python web app is typically a **long-running process**:
it boots once, then serves thousands of requests from the same living
interpreter. Module-level state persists between requests. That makes some
things cheap (connection pools, warm caches) and some things dangerous
(accidentally sharing mutable state between users) — the "fresh start per
request" safety net you've leaned on for 25 years is gone.

### How to read this course

Every lesson puts **PHP on the left and Python on the right**, doing the same
job, with the mismatch called out. You already own the concepts; you're
learning where the mapping holds and where it lies to you.
`,

  comparisons: [
    {
      label: "The same function, two worlds",
      intro:
        "A trivial greeter in both languages. Same logic, same result — look at what surrounds the logic: sigils, braces, semicolons on the left; bare names and indentation on the right.",
      php: `<?php
// greet.php
declare(strict_types=1);

function greet(string $name): string {
    if ($name === '') {
        return 'Hello, stranger';
    }
    return "Hello, {$name}";
}

echo greet('Ada'), "\\n";`,
      ts: `# greet.py
def greet(name):
    if name == "":
        return "Hello, stranger"
    return f"Hello, {name}"


print(greet("Ada"))`,
      note:
        "No $, no braces, no semicolons — the colon opens a block and the indentation closes it. Type hints exist in Python too (covered later) but are optional.",
    },
    {
      label: "Request-scoped vs long-running",
      intro:
        "A naive per-process counter. In PHP the counter can never climb because each request is a fresh process; in a long-running Python app server the module-level counter survives across requests.",
      php: `<?php
// counter.php — classic PHP-FPM
$counter = 0;      // recreated on EVERY request

$counter++;
echo $counter;     // always prints 1
// script ends -> process state discarded`,
      ts: `# app.py — running under a long-lived server
counter = 0        # module loads ONCE at boot

def handle_request():
    global counter
    counter += 1
    return counter  # 1, 2, 3, ... across requests`,
      note:
        "Python web processes keep state between requests — great for pools and caches, dangerous for anything user-specific. PHP's die-after-response model was silently protecting you.",
    },
    {
      label: "Naming conventions",
      intro:
        "The same small service written with each community's idiomatic naming. Both are just conventions, but Python's are near-universal and linters enforce them.",
      php: `<?php
// PHP (PSR-12): camelCase methods
class InvoiceMailer {
    public function sendReminder(int $invoiceId): void {
        $dueDate = $this->findDueDate($invoiceId);
        // ...
    }
}`,
      ts: `# Python (PEP 8): snake_case functions/variables
class InvoiceMailer:
    def send_reminder(self, invoice_id):
        due_date = self.find_due_date(invoice_id)
        ...`,
      note:
        "snake_case for functions, methods and variables; PascalCase for classes (same as PHP); UPPER_CASE for constants. PEP 8 is Python's PSR-12.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Your first real Python. Read it top to bottom, predict the four printed lines, then reveal. Notice: not one $, brace or semicolon anywhere.",
    code: `# first_taste.py — what everyday Python looks like
def describe(user):
    if user["active"]:
        status = "active"
    else:
        status = "inactive"
    return f"{user['name']} ({user['role']}) is {status}"

team = [
    {"name": "Ada", "role": "admin", "active": True},
    {"name": "Linus", "role": "dev", "active": False},
]

for member in team:
    print(describe(member))

# No $, no semicolons, no braces — the indentation IS the block.
admin_count = sum(1 for m in team if m["role"] == "admin")
print(f"admins: {admin_count}")
print(f"python is dynamically typed: {type(team).__name__} of {type(team[0]).__name__}")`,
    output: `Ada (admin) is active
Linus (dev) is inactive
admins: 1
python is dynamically typed: list of dict`,
  },

  keyPoints: [
    "Python is general-purpose: scripting, data/AI, automation, and web (Django ≈ Laravel, FastAPI ≈ a typed Slim) — PHP is web-first.",
    "Indentation replaces braces and there are no semicolons — block structure IS whitespace.",
    "No `$` sigils; snake_case for functions/variables, PascalCase for classes, UPPER_CASE for constants (PEP 8).",
    "Target Python 3.12/3.13. Python 2 has been dead since 1 January 2020 — never touch it.",
    "The big model shift: PHP dies after every request; Python app servers are long-running processes where module state persists.",
    "Every lesson here pairs the PHP you know (left) with the Python spelling (right) and flags where the mapping breaks.",
  ],

  interview: [
    {
      q: "You've done PHP for two decades — why learn Python, and where would you reach for each?",
      a: "PHP is still excellent at what it was built for: request-scoped web applications. Python earns its place everywhere else I work — automation scripts, data processing, anything touching ML — and it's also a first-class web language via Django and FastAPI. Practically, the ecosystems decide: if the job needs pandas, PyTorch or serious scripting, it's Python; if it's a classic web product on a LAMP-ish team, PHP remains a fine choice. Knowing both means picking the tool instead of bending one to do the other's job.",
    },
    {
      q: "What's the most important runtime difference between PHP and Python for a web developer?",
      a: "Lifecycle. A PHP script starts fresh on every request and is torn down when the response goes out — shared-nothing by default. A Python web app under gunicorn/uvicorn boots once and serves many requests from the same long-running process, so module-level and global state **persists between requests**. That's a feature (connection pools, warm caches, loaded ML models) and a hazard (mutable globals leak between users). Coming from PHP you have to consciously replace the 'everything resets' assumption.",
    },
    {
      q: "Python 2 vs Python 3 — does it matter in 2026?",
      a: "Only as history. Python 2 reached end-of-life on 1 January 2020; no supported library targets it and modern tooling won't install on it. Everything today is Python 3 — realistically 3.10+ in production and 3.12/3.13 for new work. If a codebase or tutorial shows `print \"hello\"` without parentheses, it's Python 2 material and should be treated the way you'd treat a PHP 4 tutorial: closed immediately.",
    },
  ],

  quiz: [
    {
      question: "In Python, what marks the beginning and end of an `if` block?",
      options: [
        "Curly braces, like PHP",
        "A colon after the condition, then consistent indentation; dedenting ends the block",
        "The keywords `begin` and `end`",
        "A semicolon after the last statement",
      ],
      answerIndex: 1,
      explain:
        "A colon opens the block and every statement inside is indented one level; returning to the previous indentation ends the block. There are no braces and no statement semicolons.",
    },
    {
      question: "What happens to module-level state in a typical Python web application between two requests?",
      options: [
        "It's discarded, exactly like PHP",
        "It persists, because the process is long-running and serves many requests",
        "It's serialised into the session automatically",
        "It's copied into each request's superglobals",
      ],
      answerIndex: 1,
      explain:
        "Python app servers boot the interpreter once and keep it alive across requests, so module/global state persists — the opposite of PHP's die-after-response model.",
    },
    {
      question: "Which naming style does idiomatic Python (PEP 8) use for functions and variables?",
      options: [
        "camelCase, like PSR-12 methods",
        "PascalCase for everything",
        "snake_case",
        "Hungarian notation with type prefixes",
      ],
      answerIndex: 2,
      explain:
        "PEP 8 mandates snake_case for functions, methods and variables. Classes stay PascalCase (as in PHP) and constants are UPPER_CASE by convention.",
    },
  ],
};

export default lesson;

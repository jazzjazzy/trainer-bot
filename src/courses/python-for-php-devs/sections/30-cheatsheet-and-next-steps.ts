import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "cheatsheet-and-next-steps",
  title: "Cheatsheet & Next Steps",
  part: "Real-World Python",
  estMinutes: 10,
  summary:
    "The whole PHP-to-Python translation on three cards — syntax, functions, ecosystem — plus the interview answers and what to build next.",

  concept: `
Everything in this course, compressed into the three lookup tables you'll
actually use in week one.

### Syntax map

| PHP | Python |
| --- | --- |
| \`foreach ($items as $item)\` | \`for item in items:\` |
| \`foreach ($map as $k => $v)\` | \`for k, v in map.items():\` |
| \`$arr[] = $x\` | \`items.append(x)\` |
| \`count($arr)\` | \`len(items)\` |
| \`isset($a['k'])\` | \`'k' in a\` |
| \`$a['k'] ?? $default\` | \`a.get('k', default)\` (or \`x or default\` for falsy fallback) |
| \`$s .= $more\` | \`s += more\` (or better: build a list, then \`join\`) |
| \`===\` | \`==\` (no type juggling; \`is\` only for \`None\`/identity) |
| \`try { } catch (E $e) { }\` | \`try: ... except E as e:\` |
| \`use App\\Models\\User;\` | \`from app.models import User\` |

### Function map

| PHP | Python |
| --- | --- |
| \`strtoupper($s)\` / \`strtolower($s)\` | \`s.upper()\` / \`s.lower()\` |
| \`implode(', ', $parts)\` | \`', '.join(parts)\` |
| \`explode(',', $s)\` | \`s.split(',')\` |
| \`array_map($fn, $xs)\` | \`[fn(x) for x in xs]\` |
| \`array_filter($xs, $fn)\` | \`[x for x in xs if fn(x)]\` |
| \`array_keys($map)\` | \`map.keys()\` (or \`list(map)\`) |
| \`in_array($x, $xs)\` | \`x in xs\` |
| \`sprintf('%s: %d', $k, $n)\` | \`f"{k}: {n}"\` |
| \`json_encode($data)\` / \`json_decode($s, true)\` | \`json.dumps(data)\` / \`json.loads(s)\` |
| \`preg_match('/\\d+/', $s, $m)\` | \`m = re.search(r"\\d+", s)\` |

### Ecosystem map

| PHP world | Python world |
| --- | --- |
| Composer | pip / uv, always inside a venv |
| Packagist | PyPI |
| PHPUnit | pytest |
| Laravel | Django |
| Slim / Lumen | Flask (FastAPI ≈ the typed, async upgrade) |
| php-fpm behind nginx | gunicorn / uvicorn behind nginx |
| Xdebug | pdb — just call \`breakpoint()\` (3.7+) |
| PHPStan / Psalm | mypy / pyright |

### Where to go from here

Fluency comes from shipping, not from more syntax: rebuild something you've
already written in PHP — a small API, a scraper, a cron job — so all your
attention goes on the Python, not the problem. Read real stdlib docs
(\`pathlib\`, \`collections\`, \`itertools\`, \`json\`) rather than blog posts; the
standard library *is* the curriculum. And trust the 25 years: architecture,
data modelling, HTTP, SQL, testing discipline and debugging instinct transfer
completely. You're not a junior again — you're a senior engineer with an
accent, and the accent fades in weeks.
`,

  comparisons: [
    {
      label: "Full circle: one small feature in both languages",
      intro:
        "Filter active users, index them by id, and emit JSON — the everyday shape of backend code, written natively in each language.",
      php: `<?php
declare(strict_types=1);

class User {
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly bool $active,
    ) {}
}

$users = [new User(1, 'Ada', true), new User(2, 'Bob', false)];

$active = array_filter($users, fn(User $u) => $u->active);
$byId = [];
foreach ($active as $u) {
    $byId[$u->id] = strtoupper($u->name);
}
echo json_encode($byId), "\\n";   // {"1":"ADA"}`,
      ts: `from dataclasses import dataclass
import json

@dataclass(frozen=True)
class User:
    id: int
    name: str
    active: bool

users = [User(1, "Ada", True), User(2, "Bob", False)]

by_id = {u.id: u.name.upper() for u in users if u.active}
print(json.dumps(by_id))   # {"1": "ADA"}`,
      note:
        "Readonly-promoted class → frozen dataclass; array_filter + foreach build-up → one dict comprehension; json_encode → json.dumps (note dict keys become JSON strings in both).",
    },
    {
      label: "The fallback chain: ?? and isset → .get, in, or",
      intro:
        "Pull an optional setting out of nested config with a default — the pattern you write ten times a day.",
      php: `<?php
$config = ['db' => ['host' => 'localhost']];

// null coalescing handles missing keys silently
$host = $config['db']['host'] ?? '127.0.0.1';
$port = $config['db']['port'] ?? 5432;

if (isset($config['cache'])) {
    echo "cache configured\\n";
}
echo "{$host}:{$port}\\n";   // localhost:5432`,
      ts: `config = {"db": {"host": "localhost"}}

# .get() with a default is the ?? of dicts
db = config.get("db", {})
host = db.get("host", "127.0.0.1")
port = db.get("port", 5432)

if "cache" in config:          # isset() ≈ in
    print("cache configured")
print(f"{host}:{port}")        # localhost:5432`,
      note:
        "dict.get(key, default) never raises and maps to ?? on a single level; chain .get() (or try/except KeyError) for nesting. Beware `x or default` — it also replaces 0, '' and [] like PHP's ?: would.",
    },
    {
      label: "New project, day one: Composer vs venv + pip",
      intro:
        "Bootstrap a project, add a dependency, lock it, run the tests — the workflow ritual in both ecosystems, as annotated shell history.",
      php: `<?php
// shell history — PHP project setup
//   composer init
//   composer require guzzlehttp/guzzle
//   composer require --dev phpunit/phpunit
//   # deps -> ./vendor, locked in composer.lock
//   # autoload: require 'vendor/autoload.php';
//   ./vendor/bin/phpunit --filter UserTest
// One global PHP; isolation comes from vendor/`,
      ts: `# shell history — Python project setup
#   python3 -m venv .venv
#   source .venv/bin/activate       # per-project interpreter!
#   pip install httpx pytest
#   pip freeze > requirements.txt   # the lock-ish file
#   pytest -k user
# Or the modern one-tool path (uv):
#   uv init && uv add httpx && uv add --dev pytest
#   uv run pytest                   # venv managed for you`,
      note:
        "Composer isolates per-project by default via vendor/; Python needs an explicit venv (or uv, which manages venv + lockfile and plays the role of a modern Composer).",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A self-marking translation quiz: an answer key of PHP→Python idioms and a filled-in attempt with two deliberate slips. Before running, mark each answer yourself — do you catch both misses?",
    code: `# translation_quiz.py — cover the right column, translate each PHP idiom,
# then run to mark yourself. Edit my_answers and re-check your score.

answer_key = {
    "count($items)":            "len(items)",
    "$items[] = $x":            "items.append(x)",
    "isset($user['role'])":     "'role' in user",
    "$user['role'] ?? 'guest'": "user.get('role', 'guest')",
    "implode(', ', $names)":    "', '.join(names)",
    "strtoupper($s)":           "s.upper()",
    "json_encode($data)":       "json.dumps(data)",
    "array_map($fn, $xs)":      "[fn(x) for x in xs]",
}

my_answers = {
    "count($items)":            "len(items)",
    "$items[] = $x":            "items.append(x)",
    "isset($user['role'])":     "'role' in user",
    "$user['role'] ?? 'guest'": "user['role'] or 'guest'",   # close — but not quite
    "implode(', ', $names)":    "', '.join(names)",
    "strtoupper($s)":           "s.upper()",
    "json_encode($data)":       "json.dumps(data)",
    "array_map($fn, $xs)":      "map(fn, xs)",               # works, but not idiomatic
}

score = 0
for php, expected in answer_key.items():
    got = my_answers.get(php, "")
    mark = "OK  " if got == expected else "MISS"
    if got == expected:
        score += 1
    print(f"[{mark}] {php:28} -> {expected}")

print(f"score: {score}/{len(answer_key)}")`,
    output: `[OK  ] count($items)                -> len(items)
[OK  ] $items[] = $x                -> items.append(x)
[OK  ] isset($user['role'])         -> 'role' in user
[MISS] $user['role'] ?? 'guest'     -> user.get('role', 'guest')
[OK  ] implode(', ', $names)        -> ', '.join(names)
[OK  ] strtoupper($s)               -> s.upper()
[OK  ] json_encode($data)           -> json.dumps(data)
[MISS] array_map($fn, $xs)          -> [fn(x) for x in xs]
score: 6/8`,
  },

  keyPoints: [
    "Syntax core: `foreach`→`for ... in`, `count()`→`len()`, `$arr[] =`→`.append()`, `isset()`→`in`, `??`→`.get(key, default)`, `===`→plain `==` (no juggling) with `is` reserved for `None`.",
    "Function core: `.upper()`, `', '.join()`, `.split()`, comprehensions for `array_map`/`array_filter`, `x in xs` for `in_array`, f-strings for `sprintf`, `json.dumps`/`json.loads`, `re.search`.",
    "Ecosystem: Composer/Packagist → pip (or uv)/PyPI inside a venv; PHPUnit → pytest; Laravel/Slim → Django/Flask (FastAPI for typed async APIs); php-fpm → gunicorn/uvicorn; Xdebug → `breakpoint()`; PHPStan → mypy/pyright.",
    "The three habits to unlearn: assignment copies (it aliases), `\"0\"` is falsy (it's truthy), and per-call default arguments (they evaluate once).",
    "The execution model is the deep difference: PHP processes die per request; Python processes live — state persists, memory leaks matter, and asyncio becomes possible.",
    "Next steps: rebuild a real PHP project in Python, read stdlib docs over tutorials, and trust that 25 years of engineering judgement transfers intact.",
  ],

  interview: [
    {
      q: "What were the biggest mindset shifts moving from PHP to Python?",
      a: "Three stand out. First, the execution model: PHP builds the world per request and throws it away, while Python services are long-lived processes — so state persists between requests, startup cost matters once, and things like connection pools and asyncio exist. Second, the object model: assignment binds names to shared objects instead of copying, which changes how you think about passing lists and dicts around — PHP arrays copy, Python lists alias. Third, culture: Python favours EAFP (try it, catch the exception), significant indentation, and a strong idiom of comprehensions, `with` blocks and duck typing over the interface-heavy style I'd write in modern PHP. The syntax took days; those three took deliberate practice.",
    },
    {
      q: "How does Python handle types compared to PHP?",
      a: "Both are dynamically typed with optional annotations, but they enforce in opposite places. PHP checks declared parameter and return types *at runtime* — pass a string where an int is declared under strict_types and you get a TypeError at the call. Python type hints are ignored at runtime entirely; they're checked *statically* by external tools like mypy or pyright, which play the PHPStan/Psalm role except the annotations are real syntax the language stores, not docblocks. Python is also strongly typed at the value level — `\"1\" + 1` raises instead of juggling — so plain `==` behaves like PHP's `===`. Modern hints look familiar: `def find(uid: int) -> User | None:` reads like a PHP 8 signature, with `list[str]`, `dict[str, int]` and generics on top.",
    },
    {
      q: "What's different about the deployment and execution model?",
      a: "PHP deploys as code behind php-fpm: each request gets a fresh worker state, opcache makes it fast, and 'restart' barely means anything. Python deploys as a *server process* — gunicorn or uvicorn workers importing your app once and serving thousands of requests — so deploys require restarting processes, globals persist (which is both a cache opportunity and a leak risk), and you must think about worker counts versus async concurrency within a worker. Dependencies also ship differently: instead of a vendor/ directory, you build a virtualenv or container image from a lockfile (requirements.txt / uv.lock), pinning the interpreter version too. The container story is the great equaliser — a Dockerfile for a FastAPI app and a Laravel app differ mostly in the base image and the process you exec.",
    },
    {
      q: "How do you manage dependencies and environments in Python?",
      a: "The Composer equivalent is pip plus PyPI, with one crucial difference: pip installs into the active *environment*, not into the project, so the non-negotiable habit is a virtualenv per project — `python3 -m venv .venv`, activate it, then install. Declared dependencies live in pyproject.toml (or a requirements.txt), and reproducibility comes from a lock/freeze file the way composer.lock does. In practice I'd reach for uv, the modern all-in-one tool: `uv init`, `uv add httpx`, `uv run pytest` — it creates and manages the venv, resolves fast, and writes a proper lockfile, which makes the workflow feel almost exactly like Composer. The mistake to avoid is installing into the system Python: that's the equivalent of one global vendor/ shared by every project on the machine.",
    },
  ],

  quiz: [
    {
      question: "What is the Python equivalent of `$user['role'] ?? 'guest'`?",
      options: [
        "user['role'] or 'guest'",
        "user.get('role', 'guest')",
        "isset(user['role']) ? user['role'] : 'guest'",
        "user['role'] ?? 'guest'",
      ],
      answerIndex: 1,
      explain:
        "dict.get(key, default) returns the default when the key is missing, without raising — the direct ?? analogue. `or` is close but also replaces present-but-falsy values like '' or 0, which ?? would keep.",
    },
    {
      question: "Which Python replaces `array_filter($xs, fn($x) => $x > 0)`?",
      options: [
        "xs.filter(lambda x: x > 0)",
        "[x for x in xs if x > 0]",
        "array_filter(xs, lambda x: x > 0)",
        "xs.where(x > 0)",
      ],
      answerIndex: 1,
      explain:
        "A comprehension with an if-clause is the idiomatic filter (and adding an expression before `for` makes it array_map too). Lists have no .filter() method; the builtin filter() exists but a comprehension is preferred.",
    },
    {
      question: "Your Laravel app moves to Python. Which stack is the closest ecosystem translation?",
      options: [
        "Flask + PHPStan + php-fpm",
        "Django + pytest + gunicorn behind nginx",
        "FastAPI + Xdebug + Apache mod_php",
        "Django + PHPUnit + uvicorn",
      ],
      answerIndex: 1,
      explain:
        "Django is the batteries-included Laravel analogue (ORM, migrations, admin, auth), pytest replaces PHPUnit, and gunicorn behind nginx plays php-fpm's role — except the workers are long-lived processes serving many requests each.",
    },
    {
      question: "Which statement about Python type hints is TRUE?",
      options: [
        "Like PHP's declared types, they raise TypeError at runtime when violated",
        "They only work inside classes, like PHP property types",
        "They're ignored at runtime and checked by external tools like mypy/pyright",
        "They require a special interpreter flag to enable",
      ],
      answerIndex: 2,
      explain:
        "Annotations are stored but not enforced by CPython — passing the 'wrong' type just runs. Static checkers (mypy, pyright) verify them, filling the PHPStan/Psalm role; PHP by contrast enforces its declared types at call time.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "files-and-context-managers",
  title: "Files, with Blocks & pathlib",
  part: "Batteries Included",
  estMinutes: 11,
  summary:
    "Python replaces fopen/fclose discipline with `with` blocks that guarantee cleanup, and PHP's file-function soup with pathlib's object-oriented paths.",

  concept: `
In PHP, file handling is a pile of global functions — \`fopen\`, \`fgets\`,
\`fclose\`, \`file_get_contents\`, \`file_exists\`, \`glob\` — and *you* carry the
responsibility of closing handles, usually via a \`try/finally\` you had to
remember to write. Python bakes that discipline into syntax.

### with: the close you can't forget

\`\`\`python
with open("orders.csv", encoding="utf-8") as f:
    for line in f:
        process(line)
# f is closed HERE — even if process() raised
\`\`\`

\`with\` drives the **context manager protocol**: on entry Python calls the
object's \`__enter__\`, on exit — normal or exceptional — it calls \`__exit__\`.
It is the \`try { ... } finally { fclose($fh); }\` PHP makes you hand-write,
promoted to a language feature. File objects, locks, database transactions and
temp directories all support it.

Note the loop: **a file object is iterable, line by line**, reading lazily.
That's the memory-safe default — unlike PHP's \`file()\`, which slurps the whole
file into an array. When you *do* want everything: \`f.read()\` is your
\`file_get_contents\`, and \`f.readlines()\` is \`file()\`.

### Modes and the str/bytes split

\`open(path, "w")\` truncates-and-writes, \`"a"\` appends, \`"rb"\` reads binary —
the same letters as \`fopen\`. But here's a headline difference from PHP: **PHP
strings are byte arrays; Python 3 splits them into \`str\` (Unicode text) and
\`bytes\` (raw octets)**. Text mode decodes for you — so pass
\`encoding="utf-8"\` explicitly rather than trusting the platform default.
Binary mode (\`"rb"\`/\`"wb"\`) hands you \`bytes\`, and mixing the two types is a
\`TypeError\`, not a silent mojibake.

### pathlib: paths as objects

PHP spells filesystem work as unrelated functions: \`file_exists\`, \`mkdir\`,
\`glob\`, \`basename\`, \`pathinfo\`. Python's \`pathlib.Path\` makes the path itself
the object:

\`\`\`python
from pathlib import Path

log = Path("var") / "logs" / "app.log"   # "/" joins segments
log.parent.mkdir(parents=True, exist_ok=True)
if log.exists():
    text = log.read_text(encoding="utf-8")
for p in Path("var/logs").glob("*.log"):
    print(p.name, p.suffix)
\`\`\`

\`.read_text()\` / \`.write_text()\` cover the \`file_get_contents\` /
\`file_put_contents\` quick cases without an explicit \`open\` at all.

### Writing your own context manager

PHP has no equivalent of this. Any before/after pairing — open/close,
lock/unlock, begin/commit — becomes reusable with \`contextlib\`:

\`\`\`python
from contextlib import contextmanager

@contextmanager
def transaction(conn):
    conn.begin()
    try:
        yield conn        # the with-body runs here
        conn.commit()
    except Exception:
        conn.rollback()
        raise
\`\`\`

Everything before \`yield\` is \`__enter__\`, everything after is \`__exit__\`.
For scratch files there's \`tempfile\` (\`TemporaryDirectory\`,
\`NamedTemporaryFile\`) — self-cleaning via the same protocol. And the everyday
JSON pattern is just \`json.load(f)\` / \`json.dump(data, f)\` inside a \`with\`.
`,

  comparisons: [
    {
      label: "Read a file safely, line by line",
      intro:
        "Stream a log file one line at a time and guarantee the handle is closed even if processing throws. Both versions print each trimmed line.",
      php: `<?php
// tail.php — manual open/iterate/close discipline
$fh = fopen('/var/log/app.log', 'r');
if ($fh === false) {
    throw new RuntimeException('cannot open');
}
try {
    while (($line = fgets($fh)) !== false) {
        echo rtrim($line), PHP_EOL;
    }
} finally {
    fclose($fh);   // you must remember this
}`,
      ts: `# tail.py — with guarantees the close
with open("/var/log/app.log", encoding="utf-8") as f:
    for line in f:              # lazy: one line in memory
        print(line.rstrip())
# closed here, even if the body raised

# missing file? open() raises FileNotFoundError
# instead of returning false + a warning`,
      note:
        "with is the try/finally you used to hand-write: __exit__ closes the file on any exit path, and errors are exceptions, not false-plus-warning.",
    },
    {
      label: "Filesystem work: function soup vs pathlib",
      intro:
        "Ensure a directory exists, write a file into it, then list matching files. PHP calls five unrelated global functions; Python asks one Path object.",
      php: `<?php
// export.php
$dir = __DIR__ . '/exports';
if (!file_exists($dir)) {
    mkdir($dir, 0777, true);
}
file_put_contents($dir . '/report.csv', "id,total\\n");

foreach (glob($dir . '/*.csv') as $file) {
    echo basename($file), ' ',
         filesize($file), " bytes\\n";
}`,
      ts: `# export.py
from pathlib import Path

out = Path(__file__).parent / "exports"
out.mkdir(parents=True, exist_ok=True)
(out / "report.csv").write_text("id,total\\n")

for file in out.glob("*.csv"):
    print(file.name, file.stat().st_size, "bytes")`,
      note:
        "Path bundles file_exists/mkdir/glob/basename into methods on one object, and the / operator replaces string concatenation of segments.",
    },
    {
      label: "JSON file round-trip",
      intro:
        "Persist a settings dict to disk and read it back. The Python version leans on with + json's file-object variants.",
      php: `<?php
// settings.php
$settings = ['debug' => true, 'retries' => 3];

file_put_contents(
    'settings.json',
    json_encode($settings, JSON_PRETTY_PRINT)
);

$loaded = json_decode(
    file_get_contents('settings.json'),
    true   // as array, not stdClass
);
echo $loaded['retries'];`,
      ts: `# settings.py
import json

settings = {"debug": True, "retries": 3}

with open("settings.json", "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=2)

with open("settings.json", encoding="utf-8") as f:
    loaded = json.load(f)   # dicts by default

print(loaded["retries"])`,
      note:
        "json.dump/json.load talk to file objects directly (dumps/loads are the string variants), and you always get dicts — no stdClass-vs-array choice.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A self-cleaning temp directory, pathlib path building, lazy line iteration, a JSON round-trip, and a hand-rolled @contextmanager. Predict the print order — especially where the banner lines land.",
    code: `import json
import tempfile
from contextlib import contextmanager
from pathlib import Path

@contextmanager
def banner(title):
    print(f"=== {title} ===")
    yield
    print("=== done ===")

with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp)                       # pathlib: OO paths
    log = base / "app.log"                 # "/" joins path segments

    with open(log, "w", encoding="utf-8") as f:
        f.write("line one\\n")
        f.write("line two\\n")

    print(f"exists: {log.exists()}, name: {log.name}, suffix: {log.suffix}")

    with open(log, encoding="utf-8") as f:
        for n, line in enumerate(f, start=1):   # streams line by line
            print(f"{n}: {line.rstrip()}")

    cfg = base / "config.json"
    cfg.write_text(json.dumps({"debug": True, "retries": 3}))
    settings = json.loads(cfg.read_text())
    print(f"retries: {settings['retries']}")

    with banner("custom context manager"):
        print("body runs between enter and exit")`,
    output: `exists: True, name: app.log, suffix: .log
1: line one
2: line two
retries: 3
=== custom context manager ===
body runs between enter and exit
=== done ===`,
  },

  keyPoints: [
    "`with open(...) as f:` is fopen + a guaranteed fclose: `__enter__`/`__exit__` run the try/finally PHP makes you write yourself.",
    "Iterate the file object directly for lazy, line-by-line reading; `f.read()` ≈ `file_get_contents`, `f.readlines()` ≈ `file()`.",
    "Modes mirror fopen (`\"w\"`, `\"a\"`, `\"rb\"`), but Python 3 splits PHP's byte-strings into `str` (Unicode) and `bytes` — pass `encoding=\"utf-8\"` explicitly in text mode.",
    "`pathlib.Path` replaces the file_exists/mkdir/glob function soup with methods on a path object, and `/` joins segments.",
    "`@contextlib.contextmanager` turns any before/yield/after function into a `with`-able resource — a pattern PHP simply doesn't have.",
    "`tempfile.TemporaryDirectory()` and friends self-clean via the same protocol; JSON files are `json.dump(data, f)` / `json.load(f)` inside a `with`.",
  ],

  interview: [
    {
      q: "What problem does the with statement solve, and how does it work?",
      a: "It guarantees resource cleanup on every exit path. `with expr as x:` calls `expr.__enter__()` to get `x`, runs the block, then calls `__exit__` whether the block finished normally or raised — the exact `try/finally { fclose(...) }` discipline PHP leaves to you, made into syntax. Anything pairing setup with teardown implements the protocol: files, locks, DB transactions, temp dirs. Coming from PHP, I read `with` as 'scoped destructor, but deterministic and explicit'.",
    },
    {
      q: "How does Python 3's string model differ from PHP's when reading files?",
      a: "PHP strings are byte arrays — encoding is your problem, and it usually surfaces as mojibake in production. Python 3 has two types: `str` is Unicode text, `bytes` is raw octets, and mixing them raises `TypeError`. Opening a file in text mode decodes bytes into `str` using an encoding (pass `encoding=\"utf-8\"` explicitly; the platform default can vary), while `\"rb\"` gives you `bytes` untouched. It's stricter than PHP but the failure is loud and early instead of silent and downstream.",
    },
    {
      q: "Why prefer pathlib over os.path and string concatenation?",
      a: "For the same reason you'd prefer an object over a bag of global functions in PHP. `Path` carries the operations with the data: `p.exists()`, `p.mkdir(parents=True, exist_ok=True)`, `p.glob(\"*.csv\")`, `p.read_text()`, `p.name`, `p.suffix` — versus `file_exists`, `mkdir`, `glob`, `file_get_contents`, `basename`, `pathinfo`. The `/` operator joins segments portably (no separator bugs), and paths compose through function boundaries as typed objects rather than strings you must re-parse.",
    },
    {
      q: "How would you write your own context manager?",
      a: "Two ways. The quick one: a generator function decorated with `@contextlib.contextmanager` — code before `yield` is setup, `yield` hands a value to the `with` body, code after is teardown, and you wrap the yield in try/except if you need rollback semantics. The explicit one: a class with `__enter__` and `__exit__`, which gives finer control over exception handling since `__exit__` receives the exception details and can suppress it by returning True. I reach for the decorator form for transactions, timers and temporary state changes.",
    },
  ],

  quiz: [
    {
      question: "What does `with open(p) as f:` guarantee that a bare `f = open(p)` does not?",
      options: [
        "The file is created if missing",
        "f.close() runs on every exit path, including exceptions",
        "The file's contents are loaded fully into memory",
        "The file is locked against other processes",
      ],
      answerIndex: 1,
      explain:
        "with drives __enter__/__exit__: exit runs whether the block completes or raises, closing the handle — the try/finally you'd hand-write around fclose() in PHP. It doesn't change modes, buffering or locking.",
    },
    {
      question: "You loop `for line in f:` over an opened file. What is the memory behaviour?",
      options: [
        "The whole file loads first, like PHP's file()",
        "Lines are read lazily, one at a time",
        "Only the first 8 KB are ever readable",
        "It fails unless you called f.readlines() first",
      ],
      answerIndex: 1,
      explain:
        "File objects are lazy iterators over lines — the memory-safe default for large files. f.readlines() is the eager equivalent of PHP's file(); f.read() is the file_get_contents-style slurp.",
    },
    {
      question: "In Python 3, what happens when you concatenate a str with bytes read from a \"rb\" file?",
      options: [
        "Silent conversion using the platform encoding",
        "The bytes are interpreted as latin-1, like PHP",
        "A TypeError — str and bytes are distinct types",
        "It works because both are byte arrays internally",
      ],
      answerIndex: 2,
      explain:
        "Unlike PHP, where strings are bytes and encoding errors surface as mojibake, Python 3 separates Unicode text (str) from raw bytes and refuses to mix them implicitly — you must .decode()/.encode() explicitly.",
    },
    {
      question: "Inside an @contextmanager-decorated generator, what does the code after `yield` correspond to?",
      options: [
        "__enter__ — it runs before the with body",
        "__exit__ — it runs when the with block ends",
        "A second iteration of the with body",
        "Dead code; execution stops at yield",
      ],
      answerIndex: 1,
      explain:
        "contextlib.contextmanager maps the generator onto the protocol: pre-yield is __enter__, the yielded value binds to `as`, and post-yield runs as __exit__ when the block finishes (wrap the yield in try/finally to survive exceptions).",
    },
  ],
};

export default lesson;

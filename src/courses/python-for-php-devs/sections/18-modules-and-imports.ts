import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "modules-and-imports",
  title: "Modules, Packages & Imports",
  part: "OOP the Python Way",
  estMinutes: 12,
  summary:
    "Every .py file is a module and the file system is the namespace — imports actually execute code, there is no autoloader, and __name__ == \"__main__\" has no PHP equivalent.",

  concept: `
In PHP, namespaces are declarations (\`namespace App\\Billing;\`) that Composer's
PSR-4 autoloader maps onto directories, and classes load lazily the first time
they're referenced. Python removes the indirection entirely: **every \`.py\` file
IS a module**, the file system **is** the namespace, and there is no
autoloading — you import what you use, explicitly, at the top of the file.

### import spells use — mostly

\`\`\`python
import billing                    # whole module: billing.charge(...)
from billing import charge       # one name:     charge(...)
import billing as b              # alias:        b.charge(...)
from billing import charge as ch # use Foo\\Bar as Baz
\`\`\`

The idiomatic default is \`import module\` and qualified calls
(\`billing.charge(...)\`) — the opposite of PHP, where \`use\` pulls in short class
names. Qualified names keep provenance obvious and avoid name collisions.

### Imports EXECUTE the module — once

This is the mental shift. \`use App\\Billing\\Invoice;\` is a compile-time alias;
nothing runs. \`import billing\` **runs billing.py top to bottom** — every
\`def\`/\`class\` statement executes (creating the objects), and so does any loose
top-level code. Side effects at module level (opening connections, printing)
fire on import. The result is cached in \`sys.modules\`, so a second import
anywhere in the process is a cheap dictionary lookup returning the **same
module object** — module-level state is effectively a singleton.

### Packages are just directories

A package is a directory of modules, optionally with an \`__init__.py\` that runs
when the package is imported. Inside a package you can use **relative imports**:
\`from . import tax\` or \`from .models import Invoice\` — the dot means "this
package", like a relative \`use\` would if PHP had one.

### if __name__ == "__main__"

Every module sees its own name in \`__name__\` — except the file you *ran*, which
gets \`"__main__"\`. Hence the idiom:

\`\`\`python
if __name__ == "__main__":
    main()   # runs when executed, NOT when imported
\`\`\`

PHP has nothing like it, because PHP files aren't dual-use: a file is either an
entry script or a class definition. In Python one file can be both a library
and a CLI tool.

### Where imports look: sys.path

The import system searches \`sys.path\`: the script's directory, then the
active environment's \`site-packages\`. That is *why your virtualenv matters* —
activating a venv changes which \`site-packages\` is on the path, playing the
role of the project-local \`vendor/\` directory that \`require 'vendor/autoload.php'\`
wires up.

### Circular imports: a new failure mode

PHP's lazy autoloader means two classes can happily reference each other.
Python imports eagerly at module load, so if \`a.py\` imports \`b.py\` which
imports \`a.py\`, the second import gets a **half-initialised module** and
typically dies with an \`ImportError\`/\`AttributeError\`. Fixes: restructure so
shared code lives in a third module, or defer the import into the function that
needs it.

### Convention

All imports at the top of the file, grouped stdlib → third-party → local, each
group alphabetised (formatters like ruff/isort enforce this).
`,

  comparisons: [
    {
      label: "Namespaces vs the file system",
      intro:
        "Making a class in one file usable from another. PHP declares a namespace and lets the autoloader map it; Python just imports the file.",
      php: `<?php
// src/Billing/Invoice.php
namespace App\\Billing;

class Invoice {
    public function __construct(public int $cents) {}
}

// elsewhere — autoloader finds the file lazily
use App\\Billing\\Invoice;
$inv = new Invoice(500);`,
      ts: `# billing/invoice.py  — the path IS the namespace
class Invoice:
    def __init__(self, cents: int):
        self.cents = cents

# elsewhere — explicit, executes billing/invoice.py once
from billing.invoice import Invoice

inv = Invoice(500)`,
      note:
        "No namespace declaration, no composer.json autoload mapping, no autoloader: the directory/file path is the module path, and you must import explicitly before use.",
    },
    {
      label: "use is passive; import runs code",
      intro:
        "A module with a loose top-level statement. Watch when that line executes in each language.",
      php: `<?php
// config.php
namespace App;
echo "loading config\\n";     // runs only if the FILE is included
const RATE = 0.1;

// elsewhere:
use App\\Invoice;   // pure alias — nothing executes here;
                    // the class file loads lazily on first use`,
      ts: `# config.py
print("loading config")   # runs the moment anyone imports config
RATE = 0.1

# elsewhere:
import config             # executes config.py top to bottom, ONCE
import config             # cached in sys.modules — no second print
print(config.RATE)`,
      note:
        "import is eager execution with a cache; use is a lazy compile-time alias. Module-level side effects fire on first import — keep module top level to defs, classes and constants.",
    },
    {
      label: "Entry point vs library: __main__",
      intro:
        "One file that defines reusable functions but can also be run directly as a tool. PHP needs two files; Python has an idiom for one.",
      php: `<?php
// PHP: separate entry script from library code
// src/Report.php        (class definition, autoloaded)
// bin/report.php:
require __DIR__ . '/../vendor/autoload.php';

use App\\Report;
(new Report())->run();`,
      ts: `# report.py — library AND script in one file
def run() -> None:
    print("report generated")

if __name__ == "__main__":
    run()

# python report.py        -> __name__ == "__main__" -> runs
# import report           -> __name__ == "report"   -> doesn't`,
      note:
        "__name__ is \"__main__\" only in the file handed to the interpreter; when imported it's the module's own name. Nothing in PHP corresponds — files there are either entry points or definitions.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Import forms, the sys.modules cache, and __name__ in action. Predict what __name__ prints when run as a script, whether the second import creates a new module object, and what type a module actually is.",
    code: `import sys
import json
from json import dumps as to_json

print(__name__)

print(json.dumps({"lang": "python", "autoload": False}))
print(to_json([1, 2, 3]))

# Modules are objects, cached after the first import:
print("json" in sys.modules)
import json as j2
print(j2 is json)
print(type(json).__name__)

if __name__ == "__main__":
    print("running as a script")`,
    output: `__main__
{"lang": "python", "autoload": false}
[1, 2, 3]
True
True
module
running as a script`,
  },

  keyPoints: [
    "Every `.py` file is a module; the file system is the namespace. No `namespace` declaration, no PSR-4 mapping, no autoloader.",
    "`import module` / `from module import name` / `import module as alias` cover PHP's `use` forms — but importing *executes* the module top to bottom, once, cached in `sys.modules`.",
    "Module-level code runs on import — side effects included — so keep top level to `def`, `class` and constants.",
    "Packages are directories (optionally with `__init__.py`); inside one, relative imports like `from . import tax` reach siblings.",
    "`if __name__ == \"__main__\":` makes one file both library and script — the executed file sees `\"__main__\"`, imported copies see their module name.",
    "Imports resolve via `sys.path`, which the active venv controls (its `site-packages` ≈ `vendor/`). Circular imports fail eagerly — restructure or defer the import.",
  ],

  interview: [
    {
      q: "Coming from Composer and PSR-4, what surprised you about Python's import system?",
      a: "Two things. First, there's no autoloader: imports are explicit and **eager** — `import billing` executes billing.py top to bottom right then, whereas a PHP class file only loads when the class is first touched. That execution model means module-level side effects fire on import, and it makes circular imports a real failure mode PHP's lazy loading never exposed. Second, there's no namespace declaration at all — the file path is the namespace, so there's nothing like composer.json's autoload map to keep in sync. The venv's site-packages plays the role of vendor/, selected via sys.path instead of require-ing an autoloader.",
    },
    {
      q: "Explain if __name__ == \"__main__\": to a PHP developer.",
      a: "Every Python module has a `__name__` attribute set to its import path — except the one file you actually handed to the interpreter, which gets the string `\"__main__\"`. So the guard means 'only run this when executed directly, not when imported'. PHP has no equivalent because its files aren't dual-use: you'd have a class under src/ and a separate bin/ entry script that requires the autoloader and calls it. In Python one report.py can expose `run()` for importers *and* act as a CLI tool, and the guard also stops test runners and importers from accidentally triggering the script body.",
    },
    {
      q: "How do you avoid or fix a circular import in Python?",
      a: "First recognise why it happens: imports execute eagerly, so if a.py imports b.py, and b.py imports a.py mid-way through a's execution, b receives a half-initialised module and blows up with ImportError or AttributeError — a problem PHP's autoloader sidesteps by loading classes lazily. The clean fix is structural: extract the shared names into a third module both import, so the dependency graph is a tree again. The pragmatic fix is to defer — move the import inside the function that needs it, so it runs at call time when both modules are fully loaded. Type-hint-only cycles can also be handled with `if TYPE_CHECKING:` imports.",
    },
  ],

  quiz: [
    {
      question: "What happens the first time a module is imported?",
      options: [
        "Its symbols are registered lazily, like a PHP autoloader",
        "Only def and class statements are parsed; other code is skipped",
        "The whole file executes top to bottom, and the module object is cached in sys.modules",
        "Nothing until a name from it is first used",
      ],
      answerIndex: 2,
      explain:
        "import runs the module's code once — including any loose top-level statements — and stores the resulting module object in sys.modules. Later imports anywhere in the process return that same cached object.",
    },
    {
      question: "In a file run as `python report.py`, what is __name__?",
      options: ["\"report\"", "\"__main__\"", "\"report.py\"", "None"],
      answerIndex: 1,
      explain:
        "The file passed to the interpreter runs under the name \"__main__\"; only when report.py is imported does __name__ equal \"report\". That's exactly what the if __name__ == \"__main__\": guard tests.",
    },
    {
      question: "Why do circular imports bite in Python when PHP never seemed to care?",
      options: [
        "Python forbids two modules referencing each other's classes",
        "PHP loads classes lazily on first use; Python executes imports eagerly, so a cycle hands you a half-initialised module",
        "Composer detects cycles at install time",
        "They don't — Python resolves cycles automatically",
      ],
      answerIndex: 1,
      explain:
        "PHP's autoloader defers loading until a class is actually used, so mutual references usually resolve. Python runs imports immediately during module execution; in a cycle the second module imports a module that hasn't finished executing, and missing attributes raise errors.",
    },
  ],
};

export default lesson;

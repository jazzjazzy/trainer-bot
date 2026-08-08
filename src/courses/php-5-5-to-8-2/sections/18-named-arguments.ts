import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 18,
  slug: "named-arguments",
  title: "Named Arguments: Calling by Name, Not by Position",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 12,

  summary:
    "PHP 8.0 lets you pass arguments by parameter name — so you can skip optional params, ignore order, and stop padding calls with null, null, null.",

  concept: `
In PHP 5.5 a function call is purely **positional**: the engine matches your
arguments to parameters left-to-right. If you want to set the *fifth* optional
parameter, you must spell out the four before it — usually as a wall of
\`null, false, true\` whose meaning is impossible to read at the call site.

PHP **8.0** added **named arguments**: you label each argument with the
parameter name it targets, using \`name: value\` syntax.

### The syntax

\`\`\`php
htmlspecialchars($string, double_encode: false);
array_fill(start_index: 0, count: 3, value: 'x');
\`\`\`

The name is the **parameter name from the function's signature** (not a string —
no quotes), followed by a colon.

### What it buys you

- **Skip optional parameters.** Set only the ones you care about; every other
  optional parameter keeps its default.
- **Order independence.** Once you're naming, the order you list named arguments
  in doesn't matter — \`f(b: 2, a: 1)\` is fine.
- **Self-documenting calls.** \`setCookie(secure: true, httponly: true)\` reads
  far better than \`setcookie($n, $v, 0, '', '', true, true)\`.

### Mixing positional and named

You can combine the two, but **positional arguments must come first**:

\`\`\`php
// OK: positional, then named
array_slice($items, 2, preserve_keys: true);

// Fatal error: named argument before positional
array_slice(offset: 2, $items);
\`\`\`

Once a parameter has been filled positionally, naming it again is an error
("named argument overwrites previous argument").

### Gotchas when upgrading

- The name must match the parameter name **exactly**. That means parameter names
  are now part of your public API — renaming a parameter is a **breaking change**
  for callers who use named arguments.
- Many **internal** functions only gained reliable parameter names in 8.0/8.1;
  a handful still differ from the docs, so test calls to built-ins.
- Named arguments compose with the spread operator: \`f(...['a' => 1, 'b' => 2])\`
  unpacks a string-keyed array as named arguments (also 8.1+ friendly).
`,

  comparisons: [
    {
      label: "Skipping to one optional flag",
      intro:
        "We're escaping some HTML and the only setting we want to change is turning off double-encoding, which is the last parameter. Both versions produce the same escaped string; the question is how much we have to type to reach that one flag.",
      php: `<?php
// PHP 5.5 — must pad every earlier optional arg
// signature: htmlspecialchars($str, $flags, $encoding, $double_encode)
$out = htmlspecialchars(
    $html,
    ENT_QUOTES | ENT_HTML5,
    'UTF-8',
    false   // the only value we actually care about
);`,
      ts: `<?php
// PHP 8.0 — name just the one you need
$out = htmlspecialchars($html, double_encode: false);`,
      note:
        "Named arguments (PHP 8.0) let you set a single optional parameter without restating the defaults of the ones before it.",
    },
    {
      label: "A self-documenting call",
      intro:
        "Here we set a session cookie and want it to be both secure and HTTP-only. The resulting cookie is identical either way; the goal is making the call readable so a reviewer can tell which trailing booleans are being switched on.",
      php: `<?php
// PHP 5.5 — what do these booleans mean?
setcookie('session', $id, 0, '/', '', true, true);`,
      ts: `<?php
// PHP 8.0 — intent is visible at the call site
setcookie('session', $id, secure: true, httponly: true);`,
      note:
        "Naming arguments (PHP 8.0) turns mystery positional booleans into readable key: value pairs; positional args still come first.",
    },
    {
      label: "Order independence",
      intro:
        "We're creating a user named Ada who is an admin and active. Both calls build the same user object; the example shows that once you name the arguments you no longer have to memorise the order the function declares them in.",
      php: `<?php
// PHP 5.5 — order is fixed by the signature
// function makeUser($name, $role, $active) {...}
$u = makeUser('Ada', 'admin', true);`,
      ts: `<?php
// PHP 8.0 — list named args in any order
$u = makeUser(active: true, name: 'Ada', role: 'admin');`,
      note:
        "With named arguments (PHP 8.0) the parameter name binds the value, so the listing order no longer matters.",
    },
    {
      label: "The 'options array' pattern, retired",
      intro:
        "We want a connect function that takes a few configurable settings with sensible defaults, and we only want to override the port and ssl options. Both versions let the caller set just those two, but they differ in whether the parameters are real and type-checked or just keys in a loose array.",
      php: `<?php
// PHP 5.5 — fake named args via an options array
function connect(array $opts = []) {
    $opts += ['host' => 'localhost', 'port' => 5432, 'ssl' => false];
    // ...use $opts['host'], $opts['port'], $opts['ssl']
}
connect(['port' => 6432, 'ssl' => true]);`,
      ts: `<?php
// PHP 8.0 — real, typed parameters + named call
function connect(string $host = 'localhost', int $port = 5432, bool $ssl = false) {
    // ...use $host, $port, $ssl
}
connect(port: 6432, ssl: true);`,
      note:
        "Named arguments (PHP 8.0) replace the untyped options-array idiom with real typed parameters you can still call selectively.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Named arguments in action — skipping, reordering, and mixing with positional. Predict the output, then reveal it.",
    code: `<?php
declare(strict_types=1);

function box(string $label, int $width = 10, string $fill = '.', bool $upper = false): string {
    $text = $upper ? strtoupper($label) : $label;
    return str_pad($text, $width, $fill);
}

// Positional only:
echo box('hi') . "|\\n";

// Skip $width and $fill, set only $upper by name:
echo box('hi', upper: true) . "|\\n";

// Positional first, then named (order independent):
echo box('go', 6, upper: true, fill: '*') . "|\\n";

// All named, listed out of order:
echo box(width: 8, label: 'ok', fill: '-') . "|\\n";`,
    output: `hi........|
HI........|
GO****|
ok------|`,
  },

  keyPoints: [
    "Named arguments (**PHP 8.0**) pass values by parameter name: `foo(verbose: true)` — the name is bare, not a string.",
    "They let you **skip optional parameters** instead of padding a call with `null, false, ''`.",
    "Among named arguments, **order doesn't matter**; you can mix with positional but **positional must come first**.",
    "Filling the same parameter both positionally and by name is a fatal error.",
    "Parameter names become part of your **public API** — renaming one breaks callers that use named arguments.",
    "They retire the old **options-array** idiom in favour of real, typed parameters.",
  ],

  interview: [
    {
      q: "In PHP 5.5, how did you set just the last optional parameter of a function, and how does PHP 8.0 improve it?",
      a: "In 5.5 you had no choice but to pass **every** earlier argument explicitly, re-supplying each default just to reach the one you wanted — e.g. `htmlspecialchars($s, ENT_QUOTES, 'UTF-8', false)` to flip `$double_encode`. PHP 8.0 **named arguments** let you write `htmlspecialchars($s, double_encode: false)` and leave the rest at their defaults. It removes both the boilerplate and the bug risk of mistyping a default you didn't actually want to change.",
    },
    {
      q: "Can you mix positional and named arguments? What are the rules?",
      a: "Yes. **All positional arguments must come before any named ones.** Within the named arguments, order is irrelevant. You cannot fill the same parameter both ways — `f($x, a: 1)` where `$x` already landed in `$a` is a fatal *'named argument overwrites previous argument'* error. So the typical pattern is the required positional args up front, then named arguments to cherry-pick optional ones.",
    },
    {
      q: "Why are named arguments considered a backward-compatibility concern for library authors?",
      a: "Because they make **parameter names part of your public contract**. Before 8.0, a parameter name was an internal detail — callers only cared about position, so you could rename `$len` to `$length` freely. Once callers can write `substr_thing(length: 3)`, renaming that parameter **breaks them**. The practical advice: treat parameter names as API, keep them stable, and choose clear names up front.",
    },
    {
      q: "Do named arguments work with PHP's built-in functions?",
      a: "Mostly, from **PHP 8.0** onward. Internal functions were given proper parameter names so calls like `array_fill(start_index: 0, count: 3, value: 'x')` work. A few built-ins had inconsistent or renamed parameters early in 8.0/8.1, so when you rely on named arguments against a built-in it's worth a quick test or a check of the manual's signature rather than assuming the name from memory.",
    },
  ],

  quiz: [
    {
      question: "Which PHP version introduced named arguments?",
      options: ["PHP 5.6", "PHP 7.1", "PHP 8.0", "PHP 8.1"],
      answerIndex: 2,
      explain:
        "Named arguments were added in PHP 8.0, alongside union types, constructor promotion, and match.",
    },
    {
      question: "Which call is valid in PHP 8.0?",
      options: [
        "makeUser(name: 'Ada', 'admin')",
        "makeUser('Ada', role: 'admin', active: true)",
        "makeUser(name: 'Ada', name: 'Bob')",
        "makeUser('Ada', 'admin', name: 'Ada')",
      ],
      answerIndex: 1,
      explain:
        "Positional arguments must precede named ones, so 'Ada' (positional) followed by named role/active is valid. Option 1 puts a positional after a named argument; option 3 names the same parameter twice; option 4 fills `name` positionally and then by name — all errors.",
    },
    {
      question:
        "Why can renaming a function parameter become a breaking change in PHP 8.0+?",
      options: [
        "Parameter names are now type-checked at compile time",
        "Callers may pass that argument by name, so the old name no longer matches",
        "PHP caches parameter names and refuses changes",
        "Renaming changes the function's position in the call stack",
      ],
      answerIndex: 1,
      explain:
        "Named arguments make the parameter name part of the public API; any caller using `oldName: value` will fail if you rename the parameter.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "php73-improvements",
  title: "PHP 7.3 Quality-of-Life: Heredocs, Trailing Commas & Array Keys",
  part: "PHP 7.1–7.4: Refinements",
  estMinutes: 11,
  summary:
    "PHP 7.3 sands down a dozen daily annoyances: indentable heredocs, trailing commas in calls, first/last array-key helpers, is_countable(), and JSON that throws.",

  concept: `
PHP 7.3 (2018) isn't a headline release — it's the one that fixes the small
things you bumped into every day in 5.5. None of these change how you architect
code; they just delete friction.

### Flexible heredoc/nowdoc

In 5.5 the closing marker of a heredoc had to sit in **column 1** — you couldn't
indent it to match your code, and the whitespace in front of it ended up in the
string. PHP 7.3 lets you indent the closing marker, and **strips that exact
indentation** from every line of the body.

\`\`\`php
$sql = <<<SQL
    SELECT *
    FROM users
    WHERE id = 1
    SQL;   // 7.3: marker can be indented; the 4-space indent is removed
\`\`\`

The same applies to nowdoc (\`<<<'SQL'\`). Gotcha: the body must not be indented
*less* than the closing marker, or you get a parse error.

### Trailing commas in calls

5.5 already allowed a trailing comma in array literals. 7.3 extends it to
**function and method calls** — handy for variadics and long argument lists,
because adding an argument is a one-line diff:

\`\`\`php
$result = array_merge(
    $a,
    $b,
    $c,   // legal in 7.3+
);
\`\`\`

(Trailing commas in *parameter* declarations came later, in 8.0.)

### array_key_first() / array_key_last()

Getting the first or last **key** of an array used to mean \`reset()\`/\`end()\`
(which move the internal pointer) plus \`key()\`, or a \`foreach\` that breaks
immediately. 7.3 gives you two pointer-safe functions:

\`\`\`php
$first = array_key_first($arr);
$last  = array_key_last($arr);
\`\`\`

### is_countable()

Before \`count()\` on something that might not be countable would emit a warning
in 7.2+ and a \`TypeError\` in 8.0. \`is_countable($x)\` (7.3) returns true for
arrays and any \`Countable\` — cleaner than \`is_array($x) || $x instanceof Countable\`.

### JSON that throws

\`json_decode()\` returned \`null\` on bad input and you had to call
\`json_last_error()\` to find out. Pass the new \`JSON_THROW_ON_ERROR\` flag (7.3)
and you get a \`JsonException\` instead — error handling you can wrap in
\`try/catch\` like everything else.
`,

  comparisons: [
    {
      label: "Indenting a heredoc",
      intro:
        "A build() function returns a small HTML block written as a heredoc. The goal is to nest the heredoc neatly inside the function body while still producing clean, un-indented HTML output.",
      php: `<?php
// PHP 5.5 — closing marker MUST be in column 1,
// which breaks your indentation flow
function build() {
    $html = <<<HTML
<div>
  <span>Hi</span>
</div>
HTML;
    return $html;
}`,
      ts: `<?php
// PHP 7.3 — indent the marker; that indent is stripped
function build() {
    $html = <<<HTML
        <div>
          <span>Hi</span>
        </div>
        HTML;
    return $html;
}`,
      note:
        "Flexible heredoc/nowdoc (7.3) lets the closing marker be indented and removes that leading whitespace from every body line.",
    },
    {
      label: "First/last key of an array",
      intro:
        "Given an associative array of prices, we want to grab the first key ('a') and the last key ('c') without otherwise messing with the array. The result should be those two keys, leaving the array untouched for later use.",
      php: `<?php
// PHP 5.5 — reset()/end() move the internal pointer
$prices = ['a' => 10, 'b' => 20, 'c' => 30];

reset($prices);
$firstKey = key($prices);   // 'a'
end($prices);
$lastKey = key($prices);    // 'c' — pointer now at end`,
      ts: `<?php
// PHP 7.3 — pointer-safe, no side effects
$prices = ['a' => 10, 'b' => 20, 'c' => 30];

$firstKey = array_key_first($prices); // 'a'
$lastKey  = array_key_last($prices);  // 'c'`,
      note:
        "array_key_first()/array_key_last() (7.3) read the keys without disturbing the array's internal pointer.",
    },
    {
      label: "Trailing comma in a call",
      intro:
        "Here a sprintf() call is spread across multiple lines so each argument sits on its own row. We want to leave a comma after the final argument so adding another later is a clean one-line change.",
      php: `<?php
// PHP 5.5 — trailing comma in a CALL is a parse error
$line = sprintf(
    '%s = %d',
    $name,
    $value
);`,
      ts: `<?php
// PHP 7.3 — trailing comma allowed in calls
$line = sprintf(
    '%s = %d',
    $name,
    $value,
);`,
      note:
        "Trailing commas in function/method calls arrived in 7.3 (parameter-list trailing commas came in 8.0).",
    },
    {
      label: "Decoding JSON safely",
      intro:
        "We are decoding a raw JSON string into a PHP array and want to react when the input is malformed. The aim is to turn a parsing failure into a thrown exception rather than a silent null we have to inspect afterward.",
      php: `<?php
// PHP 5.5 — check the error code by hand
$data = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    throw new RuntimeException(json_last_error_msg());
}`,
      ts: `<?php
// PHP 7.3 — opt into exceptions
try {
    $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    throw new RuntimeException($e->getMessage(), 0, $e);
}`,
      note:
        "JSON_THROW_ON_ERROR (7.3) makes json_decode()/json_encode() throw JsonException instead of returning null and stashing an error code.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Heredoc indentation plus the new array-key helpers. Predict the output, then reveal it.",
    code: `<?php
$users = [
    'u1' => 'Ada',
    'u2' => 'Linus',
    'u3' => 'Grace',
];

$firstKey = array_key_first($users); // 'u1'
$lastKey  = array_key_last($users);  // 'u3'

// 7.3: indented closing marker; the 4-space indent is stripped
$report = <<<TXT
    first key: {$firstKey}
    last key: {$lastKey}
    first user: {$users[$firstKey]}
    TXT;

echo $report, "\\n";

// trailing comma in a call is fine in 7.3+
echo implode(
    ', ',
    [$users[$firstKey], $users[$lastKey]],
), "\\n";

var_dump(is_countable($users));`,
    output: `first key: u1
last key: u3
first user: Ada
Ada, Grace
bool(true)`,
  },

  keyPoints: [
    "**Flexible heredoc/nowdoc (7.3)**: indent the closing marker to match your code; that indentation is stripped from the body.",
    "**Trailing commas in calls (7.3)** make adding an argument a one-line diff; trailing commas in *parameter lists* only came in 8.0.",
    "**`array_key_first()` / `array_key_last()` (7.3)** read the first/last key without moving the array's internal pointer.",
    "**`is_countable()` (7.3)** replaces `is_array($x) || $x instanceof Countable` — useful before `count()`, which `TypeError`s on non-countables in 8.0.",
    "**`JSON_THROW_ON_ERROR` (7.3)** turns `json_decode()`/`json_encode()` failures into a catchable `JsonException`.",
    "These are pure quality-of-life wins: they change spelling, not architecture, and adopting them is low-risk.",
  ],

  interview: [
    {
      q: "Coming from 5.5, what does flexible heredoc actually change?",
      a: "In 5.5 the heredoc/nowdoc closing marker had to start in **column 1**, so you couldn't indent it to match surrounding code, and any leading whitespace on body lines stayed in the string. **PHP 7.3** lets you indent the closing marker, and strips *that exact amount* of leading whitespace from every line of the body. The practical win is that multi-line SQL/HTML/templates can be indented naturally inside a function. The one gotcha: no body line may be indented *less* than the closing marker, or it's a parse error.",
    },
    {
      q: "Why use `array_key_first()` instead of `reset()` + `key()`?",
      a: "`reset()`/`end()` **move the array's internal pointer** as a side effect, so reading the first/last key the old way mutates state other code might rely on. `array_key_first()` and `array_key_last()` (7.3) return the key with **no side effects** and read more clearly. They also return `null` for an empty array rather than `false`-ish pointer behaviour.",
    },
    {
      q: "How does `JSON_THROW_ON_ERROR` improve error handling over the 5.5 approach?",
      a: "In 5.5 a failed `json_decode()` returns `null` — which is ambiguous, since valid JSON `null` also decodes to `null` — so you had to call `json_last_error()` separately to know if it actually failed. Passing the `JSON_THROW_ON_ERROR` flag (7.3) makes it throw a **`JsonException`** instead, so JSON errors flow through your normal `try/catch` and can't be silently ignored. `JsonException` extends `Exception`, so it integrates with existing handlers.",
    },
    {
      q: "Trailing comma support has expanded over several versions — what's the timeline?",
      a: "Array literals allowed a trailing comma all the way back (including 5.5). **PHP 7.3** added trailing commas in **function and method calls**. **PHP 8.0** added them in **parameter list declarations** and in closure `use` lists. So if you put a trailing comma in a function *definition* it'll parse on 8.0+ but fail on 7.3.",
    },
  ],

  quiz: [
    {
      question:
        "With flexible heredoc in PHP 7.3, what determines how much leading whitespace is stripped from the body?",
      options: [
        "The indentation of the opening `<<<` marker",
        "The indentation of the closing marker",
        "Nothing — whitespace is never stripped",
        "The shortest-indented line in the body",
      ],
      answerIndex: 1,
      explain:
        "PHP 7.3 strips leading whitespace equal to the indentation of the closing marker from every line of the body. A body line indented less than the closing marker is a parse error.",
    },
    {
      question:
        "Why is `array_key_first($arr)` preferable to `reset($arr); key($arr);`?",
      options: [
        "It is faster on small arrays only",
        "It works on objects as well as arrays",
        "It does not move the array's internal pointer (no side effects)",
        "It was available in PHP 5.5",
      ],
      answerIndex: 2,
      explain:
        "reset()/end() mutate the internal pointer as a side effect. array_key_first()/array_key_last() (7.3) read the key without touching the pointer.",
    },
    {
      question: "Which trailing comma is a parse error on PHP 7.3?",
      options: [
        "A trailing comma in an array literal",
        "A trailing comma in a function call's argument list",
        "A trailing comma in a function's parameter declaration",
        "A trailing comma after the last array element with keys",
      ],
      answerIndex: 2,
      explain:
        "Trailing commas in array literals (long-standing) and in calls (7.3) are fine on 7.3. Trailing commas in parameter-list declarations only became legal in PHP 8.0.",
    },
  ],
};

export default lesson;

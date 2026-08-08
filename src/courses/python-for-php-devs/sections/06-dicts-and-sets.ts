import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "dicts-and-sets",
  title: "Dicts & Sets: The Other Half of PHP's array",
  part: "First Contact",
  estMinutes: 12,
  summary:
    "PHP's array is two Python types in a trench coat — dict for key/value data, set for unique membership — and both are sharper tools.",

  concept: `
PHP's \`array\` is famously two data structures at once: an ordered list *and* a
hash map. Python splits it in half. The list half is \`list\`; the key/value half
is **\`dict\`** — and Python adds a third structure PHP never had natively:
**\`set\`**, a bag of unique values with O(1) membership tests.

### dict — the associative array, done honestly

\`\`\`python
user = {"name": "Ada", "role": "admin"}
user["email"] = "ada@example.com"   # add / overwrite a key
\`\`\`

That's \`['name' => 'Ada', 'role' => 'admin']\` with \`{}\` and \`:\` instead of
\`[]\` and \`=>\`. Keys are usually strings, but any *immutable* value works —
ints, tuples, even \`True\`. Since Python 3.7 dicts **preserve insertion order**
as a language guarantee, exactly like PHP arrays always have, so your mental
model of "keys stay in the order I added them" carries straight over.

### Missing keys are errors, not warnings

Here the mapping breaks, and it matters. \`$arr['missing']\` in PHP emits a
warning and hands you \`null\`; Python's \`d["missing"]\` raises **\`KeyError\`**
and stops your program. That strictness is deliberate — a typo'd key fails
loudly at the line that's wrong. When "missing is fine" is what you mean, say
so with \`.get()\`:

\`\`\`python
plan = user.get("plan", "free")   # ≈ $user['plan'] ?? 'free'
\`\`\`

To test for a key, use \`in\` — Python's \`array_key_exists()\`:

\`\`\`python
if "role" in user: ...            # checks KEYS, not values
if "admin" in user.values(): ...  # value check is explicit
\`\`\`

### Walking a dict

- \`user.keys()\` ≈ \`array_keys($user)\`
- \`user.values()\` ≈ \`array_values($user)\`
- \`for k, v in user.items():\` ≈ \`foreach ($user as $k => $v)\`

Looping a dict directly (\`for k in user:\`) gives you the **keys** — reach for
\`.items()\` whenever you want both.

### Merging

Python 3.9 gave dicts a merge operator: \`d1 | d2\` builds a new dict where the
**right side wins** on duplicate keys — the same later-wins rule as
\`array_merge()\` (and the opposite of PHP's \`+\` operator, where the left side
wins). In-place, \`d1 |= d2\` ≈ \`$d1 = array_merge($d1, $d2)\`. You can also
build dicts in one expression with a *dict comprehension* —
\`{u["id"]: u for u in users}\` — a preview of a whole family of syntax covered
in the comprehensions section.

### set — array_unique as a real type

A \`set\` is unordered, holds each value once, and answers "is X in here?" in
O(1). In PHP you fake this with \`array_unique()\` or value-as-key tricks, and
\`in_array()\` scans the whole array — O(n).

\`\`\`python
tags = {"php", "python", "sql"}       # literal
unique = set(raw_tags)                # dedupe any iterable
"php" in tags                         # O(1) membership
\`\`\`

Sets support algebra as operators: \`a & b\` (intersection ≈
\`array_intersect\`), \`a - b\` (difference ≈ \`array_diff\`), \`a | b\` (union),
\`a ^ b\` (symmetric difference). \`frozenset\` is the immutable flavour — usable
as a dict key precisely *because* it can't change.

### The hashability rule

Dict keys and set members must be **hashable**, which in practice means
immutable: strings, numbers, tuples ✔; lists and dicts ✘ (\`TypeError:
unhashable type: 'list'\`). Need a compound key? Use a tuple:
\`grid[(3, 4)] = "treasure"\`.

One gotcha before you go: \`{}\` is an **empty dict**, not an empty set. An
empty set is spelled \`set()\`.
`,

  comparisons: [
    {
      label: "Reading a key that might be missing",
      intro:
        "Pull a user's plan out of a map, defaulting to 'free' when the key isn't there. Both versions end with plan = 'free' and no error output.",
      php: `<?php
// config lookup, PHP 8.2
$user = ['name' => 'Ada', 'role' => 'admin'];

// ?? swallows the missing key silently
$plan = $user['plan'] ?? 'free';

// bare access would only warn and give null:
// $plan = $user['plan'];  // Warning: Undefined array key`,
      ts: `# config lookup
user = {"name": "Ada", "role": "admin"}

# .get() is the ?? equivalent
plan = user.get("plan", "free")

# bare access is a hard stop, not a warning:
# plan = user["plan"]   # KeyError: 'plan'`,
      note:
        "PHP degrades gracefully (warning + null); Python raises KeyError and halts — use .get(key, default) when a missing key is a legitimate case, and let [] raise when it's a bug.",
    },
    {
      label: "Iterating keys and values",
      intro:
        "Print every setting as 'key => value'. Same loop, same output, different spelling — and note what a bare loop over the dict gives you.",
      php: `<?php
$settings = ['theme' => 'dark', 'lang' => 'en'];

foreach ($settings as $key => $value) {
    echo "{$key} => {$value}\\n";
}

$keys = array_keys($settings);   // ['theme', 'lang']`,
      ts: `settings = {"theme": "dark", "lang": "en"}

for key, value in settings.items():
    print(f"{key} => {value}")

keys = list(settings.keys())     # ['theme', 'lang']

# careful: a bare loop yields KEYS only
for key in settings:
    print(key)`,
      note:
        "foreach $k => $v becomes for k, v in d.items() — forget .items() and you silently loop over keys alone, the #1 dict slip for PHP hands.",
    },
    {
      label: "Merging two maps",
      intro:
        "Overlay user preferences on top of defaults so the user's theme wins. Both produce {'theme': 'dark', 'lang': 'en'}.",
      php: `<?php
$defaults = ['theme' => 'light', 'lang' => 'en'];
$prefs    = ['theme' => 'dark'];

// later array wins on duplicate keys
$settings = array_merge($defaults, $prefs);

// beware: $defaults + $prefs keeps the LEFT side,
// so 'light' would win — a classic PHP trap`,
      ts: `defaults = {"theme": "light", "lang": "en"}
prefs    = {"theme": "dark"}

# | (3.9+): right side wins, like array_merge
settings = defaults | prefs

# in place:
defaults |= prefs`,
      note:
        "dict | dict (Python 3.9) follows array_merge's later-wins rule; it is NOT like PHP's + operator, where the left operand keeps its keys.",
    },
    {
      label: "Unique values and fast membership",
      intro:
        "Dedupe a tag list, then check whether 'php' is present. Python gets a dedicated type; PHP simulates one with array functions.",
      php: `<?php
$tags = ['php', 'sql', 'php', 'python', 'sql'];

$unique = array_unique($tags);        // re-indexed-ish array
$hasPhp = in_array('php', $unique);   // O(n) scan

$common = array_intersect($unique, ['php', 'go']);`,
      ts: `tags = ["php", "sql", "php", "python", "sql"]

unique  = set(tags)          # dedupe in one step
has_php = "php" in unique    # O(1) hash lookup

common = unique & {"php", "go"}   # intersection
extra  = unique - {"php"}         # difference`,
      note:
        "in_array() walks the array; set membership is a hash lookup. Set operators (&, -, |, ^) replace array_intersect/array_diff — but sets are unordered and members must be immutable.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A dict and two sets. Predict every line — especially what 'in' checks on a dict, which side wins the | merge, and what the set operators return.",
    code: `user = {"name": "Ada", "role": "admin"}

# Missing key: .get() with a default = $user['plan'] ?? 'free'
print(user.get("plan", "free"))

# 'in' tests KEYS (like array_key_exists, not in_array)
print("role" in user)
print("admin" in user)

# .items() is your foreach ($user as $k => $v)
for key, value in user.items():
    print(f"{key} => {value}")

# Merge with | (3.9+): right side wins, like array_merge
defaults = {"theme": "light", "lang": "en"}
settings = defaults | {"theme": "dark"}
print(settings)

# Sets: dedupe + fast membership
tags = ["php", "sql", "php", "python", "sql"]
unique = set(tags)
print(len(unique))

a = {1, 2, 3, 4}
b = {3, 4, 5}
print(a & b)          # intersection, like array_intersect
print(a - b)          # difference, like array_diff
print(sorted(a | b))  # union, sorted into a list`,
    output: `free
True
False
name => Ada
role => admin
{'theme': 'dark', 'lang': 'en'}
3
{3, 4}
{1, 2}
[1, 2, 3, 4, 5]`,
  },

  keyPoints: [
    "PHP's array splits into two Python types: `dict` for key => value, `set` for unique membership.",
    "`d[\"missing\"]` raises `KeyError` (PHP warns and returns null); `d.get(\"k\", default)` is your `?? $default`.",
    "`\"k\" in d` checks **keys** (≈ `array_key_exists`); `.keys()`/`.values()`/`.items()` map to `array_keys`/`array_values`/`foreach $k => $v`.",
    "Dicts preserve insertion order (guaranteed since 3.7), and `d1 | d2` (3.9) merges with right-side-wins — `array_merge` semantics, not PHP `+`.",
    "Set membership is O(1) vs `in_array`'s O(n); `&`/`-`/`|`/`^` replace `array_intersect`/`array_diff` and friends.",
    "Dict keys and set members must be hashable (immutable): tuples yes, lists no — and `{}` is an empty dict, `set()` is an empty set.",
  ],

  interview: [
    {
      q: "How does PHP's array map onto Python's built-in collections?",
      a: "PHP's array is really two structures fused together, and Python separates them: a `list` for the sequential half and a `dict` for the associative half. A dict is what you get when you write `['name' => 'Ada']` — key/value pairs, insertion-ordered (guaranteed since Python 3.7), with `.keys()`, `.values()` and `.items()` standing in for `array_keys`, `array_values` and `foreach $k => $v`. Python also adds `set`, a type PHP lacks: unique values with O(1) membership and operator-based intersection/difference, which replaces the `array_unique` + `in_array` + `array_intersect` toolkit. Choosing the right one of the three is itself a signal you've made the jump from PHP.",
    },
    {
      q: "What happens when you read a missing dict key, and how do you handle optional keys idiomatically?",
      a: "Unlike PHP — which emits a warning and returns null — Python raises a `KeyError` and stops. The idiomatic tools depend on intent: `d.get(\"key\", default)` when absence is normal (it's the direct equivalent of `$arr['key'] ?? $default`), `\"key\" in d` when you just need to test (like `array_key_exists`), and plain `d[\"key\"]` when the key *should* exist, so a typo fails loudly at the right line. There's also `d.setdefault()` and `collections.defaultdict` for accumulate-into-a-key patterns, but get/in/[] cover the everyday cases.",
    },
    {
      q: "Why are Python sets faster than in_array(), and what's the catch with what you can put in them?",
      a: "A set is a hash table of its members, so `x in my_set` is an O(1) hash lookup, while `in_array()` scans the array linearly — on a large collection inside a loop that's the difference between milliseconds and seconds. The catch is that members must be *hashable*, which effectively means immutable: strings, numbers and tuples work; lists and dicts raise `TypeError: unhashable type`. The same rule governs dict keys, which is why a compound key is spelled as a tuple like `(user_id, year)`, and why `frozenset` exists — an immutable set you can nest inside another set or use as a key.",
    },
  ],

  quiz: [
    {
      question: "What does `user[\"plan\"]` do when the dict has no 'plan' key?",
      options: [
        "Returns None with no message",
        "Returns None and emits a warning, like PHP",
        "Raises a KeyError exception",
        "Auto-creates the key with a None value",
      ],
      answerIndex: 2,
      explain:
        "Python treats a missing key as a hard error: `[]` access raises `KeyError`. PHP's warn-and-return-null behaviour maps to `user.get(\"plan\")` (None) or `user.get(\"plan\", default)` — the `??` equivalent.",
    },
    {
      question: "Given `d1 = {\"a\": 1}` and `d2 = {\"a\": 2}`, what is `d1 | d2`?",
      options: [
        "{'a': 1} — the left side wins, like PHP's + operator",
        "{'a': 2} — the right side wins, like array_merge",
        "{'a': 3} — values are combined",
        "A TypeError: dicts don't support |",
      ],
      answerIndex: 1,
      explain:
        "The dict merge operator (Python 3.9, PEP 584) builds a new dict where later values overwrite earlier ones on duplicate keys — array_merge semantics. PHP's `+` keeps the left operand's keys, which is the opposite rule.",
    },
    {
      question: "Which of these can be a dict key or set member?",
      options: [
        "A list: [1, 2]",
        "A dict: {\"x\": 1}",
        "A tuple: (1, 2)",
        "A set: {1, 2}",
      ],
      answerIndex: 2,
      explain:
        "Keys and set members must be hashable, i.e. immutable. Tuples qualify (if their contents do); lists, dicts and sets are mutable and raise `TypeError: unhashable type`. An immutable set — `frozenset` — would also qualify.",
    },
    {
      question: "What does `\"admin\" in user` test when `user` is a dict?",
      options: [
        "Whether any value equals 'admin'",
        "Whether the key 'admin' exists",
        "Whether the string 'admin' appears in any key or value",
        "It raises a TypeError on dicts",
      ],
      answerIndex: 1,
      explain:
        "On a dict, `in` checks keys — it's `array_key_exists()`, not `in_array()`. To search values, be explicit: `\"admin\" in user.values()`.",
    },
  ],
};

export default lesson;

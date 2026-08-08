import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "stdlib-essentials",
  title: "The Standard Library You'll Use Daily",
  part: "Batteries Included",
  estMinutes: 13,
  summary:
    "The everyday stdlib toolkit — json, re, datetime, collections — mapped onto the PHP functions your fingers already know.",

  concept: `
PHP puts its everyday tools in the global namespace: \`json_encode\`,
\`preg_match\`, \`date\`, \`array_count_values\`. Python's philosophy is
**"batteries included"** — the same power ships in the box, but organised into
focused modules you \`import\`. Once you know which module maps to which PHP
function family, you're productive immediately.

### json — json_encode/json_decode

\`\`\`python
import json
s = json.dumps({"ok": True})     # ≈ json_encode
data = json.loads(s)             # ≈ json_decode($s, true)
\`\`\`

\`loads\` always gives you dicts and lists — Python has no stdClass split, so
it behaves like \`json_decode($s, true)\` with no second argument to remember.
The \`s\` suffix means *string*; \`json.dump\`/\`json.load\` (no \`s\`) work on
file objects.

### re — the preg_* family

- \`re.search(pat, s)\` ≈ \`preg_match\` (finds the first match anywhere)
- \`re.match(pat, s)\` anchors at the **start of the string** — a classic gotcha
- \`re.findall\` ≈ \`preg_match_all\`, \`re.sub\` ≈ \`preg_replace\`

Two spelling changes: patterns are **raw strings** — \`r"\\d+"\` — so you stop
double-escaping backslashes, and there are **no delimiters**: no \`/pat/i\`,
just the pattern plus flags like \`re.IGNORECASE\`. A successful search returns
a **match object**: \`m.group(0)\` is the whole match, \`m.group(1)\` the first
capture; no match returns \`None\` (hence \`if m :=\` walrus patterns).

### datetime — DateTime, DateInterval, DateTimeZone

\`\`\`python
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo            # stdlib since 3.9

due = datetime.now() + timedelta(days=7)         # DateInterval arithmetic
print(due.strftime("%Y-%m-%d"))                  # ->format(...)
parsed = datetime.strptime("2026-07-01", "%Y-%m-%d")  # createFromFormat
aware = datetime.now(ZoneInfo("Australia/Sydney"))    # DateTimeZone
\`\`\`

Mind the **naive vs aware** split: a plain \`datetime.now()\` carries no
timezone at all (PHP's DateTime always has one), and comparing naive with
aware datetimes raises. For anything crossing timezones, attach a
\`ZoneInfo\`.

### collections — the array-helper replacements

- \`Counter(items)\` ≈ \`array_count_values\`, but with \`.most_common(n)\`,
  arithmetic between counters, and any hashable keys.
- \`defaultdict(list)\` kills the \`isset\`-before-append dance: appending to a
  missing key just materialises the default first.
- \`namedtuple\` gives you a quick immutable record with named fields — the
  step before a full \`dataclass\`.

### The rest of the daily kit

\`random\` (\`choice\`, \`shuffle\`, \`randint\` ≈ \`array_rand\`/\`shuffle\`/\`rand\`),
\`math\` (\`floor\`, \`ceil\`, \`sqrt\` live here, not as globals), and
\`os.environ["APP_ENV"]\` ≈ \`getenv('APP_ENV')\` — a real dict, so
\`os.environ.get("APP_ENV", "prod")\` gives you the \`?: 'prod'\` fallback.
`,

  comparisons: [
    {
      label: "JSON round-trip",
      intro:
        "Encode a payload, decode it back, and pull a field out. Watch what decode returns on each side.",
      php: `<?php
// api.php
$payload = json_encode([
    'user'   => 'ada',
    'active' => true,
]);

// forget the second arg and you get stdClass:
$obj  = json_decode($payload);        // stdClass
$data = json_decode($payload, true);  // array

echo $data['user'];   // ada`,
      ts: `# api.py
import json

payload = json.dumps({
    "user": "ada",
    "active": True,
})

data = json.loads(payload)   # always dicts/lists
print(data["user"])          # ada

# note the casing in the JSON itself:
print(payload)  # {"user": "ada", "active": true}`,
      note:
        "json.loads has no stdClass-vs-array fork — you always get dicts. Python spells booleans True/False in code but emits true/false in the JSON.",
    },
    {
      label: "Regex: preg_match vs re.search",
      intro:
        "Extract the order id and amount from a log line. Compare where the results land and how the pattern is quoted.",
      php: `<?php
// parse.php — delimiters + matches by reference
$line = 'order 1042 charged 19.95 EUR';

if (preg_match('/order (\\d+) charged ([\\d.]+)/',
               $line, $m)) {
    echo "id={$m[1]} amount={$m[2]}\\n";
}

echo preg_replace('/\\d+\\.\\d+/', 'X.XX', $line);`,
      ts: `# parse.py — raw string pattern, match object back
import re

line = "order 1042 charged 19.95 EUR"

m = re.search(r"order (\\d+) charged ([\\d.]+)", line)
if m:
    print(f"id={m.group(1)} amount={m.group(2)}")

print(re.sub(r"\\d+\\.\\d+", "X.XX", line))`,
      note:
        "No delimiters, raw strings end the backslash doubling, and the match comes back as an object (or None) instead of filling an array by reference. Beware: re.match anchors at the start — re.search is the preg_match equivalent.",
    },
    {
      label: "Dates: DateTime/DateInterval vs datetime/timedelta",
      intro:
        "Add 7 days to a date, format it, and parse a string back into a date object.",
      php: `<?php
// dates.php
$launch = new DateTimeImmutable(
    '2026-07-01',
    new DateTimeZone('Australia/Sydney')
);
$due = $launch->add(new DateInterval('P7D'));
echo $due->format('Y-m-d'), "\\n";

$parsed = DateTimeImmutable::createFromFormat(
    'Y-m-d', '2026-12-25'
);`,
      ts: `# dates.py
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo   # stdlib since 3.9

launch = datetime(2026, 7, 1,
                  tzinfo=ZoneInfo("Australia/Sydney"))
due = launch + timedelta(days=7)
print(due.strftime("%Y-%m-%d"))

parsed = datetime.strptime("2026-12-25", "%Y-%m-%d")
# parsed is NAIVE — no timezone unless you attach one`,
      note:
        "timedelta arithmetic uses plain + instead of DateInterval objects, but Python datetimes are timezone-naive by default — the opposite of PHP, where DateTime always carries a zone.",
    },
    {
      label: "Counting and grouping without isset()",
      intro:
        "Tally votes and group people by team — the two loops every PHP dev has written with isset() guards.",
      php: `<?php
// tally.php
$votes = ['php', 'python', 'python', 'go'];
$counts = array_count_values($votes);
arsort($counts);
print_r($counts);

$byTeam = [];
foreach ($people as $p) {
    if (!isset($byTeam[$p['team']])) {
        $byTeam[$p['team']] = [];   // the dance
    }
    $byTeam[$p['team']][] = $p['name'];
}`,
      ts: `# tally.py
from collections import Counter, defaultdict

votes = ["php", "python", "python", "go"]
counts = Counter(votes)
print(counts.most_common())   # sorted, built in

by_team = defaultdict(list)   # missing key -> []
for p in people:
    by_team[p["team"]].append(p["name"])
# no isset() guard anywhere`,
      note:
        "Counter is array_count_values with sorting and arithmetic built in; defaultdict materialises the default on first touch, deleting the isset-then-initialise idiom.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "One tour: json casing, regex capture groups with raw strings, timedelta arithmetic, Counter and defaultdict. Predict every line — especially the JSON booleans and what most_common(2) returns.",
    code: `import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta

# json: dumps/loads ~ json_encode/json_decode($s, true)
payload = json.dumps({"user": "ada", "active": True, "score": None})
print(payload)
print(json.loads(payload)["user"])

# re: raw strings mean no double-escaping
log = "GET /orders/42 took 187ms; GET /users/7 took 9ms"
for m in re.finditer(r"/(\\w+)/(\\d+) took (\\d+)ms", log):
    print(f"route={m.group(1)} id={m.group(2)} ms={m.group(3)}")
print(re.sub(r"\\d+ms", "<t>", log))

# datetime: timedelta arithmetic + strftime
launch = datetime(2026, 7, 1, 9, 30)
review = launch + timedelta(days=14, hours=2)
print(review.strftime("%Y-%m-%d %H:%M"))
print(f"gap is {(review - launch).days} days")

# collections: Counter and defaultdict
votes = ["php", "python", "python", "go", "python", "php"]
print(Counter(votes).most_common(2))

by_team = defaultdict(list)          # no isset() dance before append
for name, team in [("ada", "core"), ("bob", "web"), ("cy", "core")]:
    by_team[team].append(name)
print(dict(by_team))`,
    output: `{"user": "ada", "active": true, "score": null}
ada
route=orders id=42 ms=187
route=users id=7 ms=9
GET /orders/42 took <t>; GET /users/7 took <t>
2026-07-15 11:30
gap is 14 days
[('python', 3), ('php', 2)]
{'core': ['ada', 'cy'], 'web': ['bob']}`,
  },

  keyPoints: [
    "`json.dumps`/`json.loads` ≈ `json_encode`/`json_decode($s, true)` — decoding always yields dicts, no stdClass fork; `dump`/`load` (no s) work on files.",
    "`re.search` is your `preg_match` (`re.match` anchors at the string start!); `re.findall` ≈ `preg_match_all`, `re.sub` ≈ `preg_replace`; write patterns as raw strings `r\"\\d+\"` with no delimiters.",
    "`datetime` + `timedelta` replace DateTime/DateInterval with plain arithmetic; `.strftime`/`.strptime` are format/createFromFormat — but datetimes are timezone-naive unless you attach `ZoneInfo` (stdlib since 3.9).",
    "`collections.Counter` outclasses `array_count_values` (`.most_common`, counter arithmetic); `defaultdict(list)` deletes the isset-before-append dance; `namedtuple` is a quick immutable record.",
    "`os.environ` is a real dict (≈ `getenv`), and `math`/`random` house what PHP scatters as globals.",
    "The philosophy shift: PHP's flat global function space becomes small, focused, importable modules — batteries included, but organised.",
  ],

  interview: [
    {
      q: "You're parsing JSON from an API in Python. How does it differ from PHP's json_decode?",
      a: "Mechanically it's `json.loads(body)` and there's only one shape of result: dicts, lists, str, int/float, bool, None. PHP forces the stdClass-versus-array decision via the second argument; Python doesn't have that fork — it behaves like `json_decode($s, true)` always. The naming convention matters too: `loads`/`dumps` operate on strings, while `load`/`dump` stream to and from file objects, which is what you want inside a `with open(...)` block. Errors raise `json.JSONDecodeError` rather than returning null, so you catch rather than check.",
    },
    {
      q: "What are the traps for a preg_* veteran picking up Python's re module?",
      a: "Three. First, `re.match` is not `preg_match` — it anchors at the start of the string; `re.search` is the drop-in equivalent. Second, no delimiters or trailing flags: the pattern is just a string, ideally a raw string like `r\"\\d+\"` so backslashes aren't double-escaped, with flags passed as arguments (`re.IGNORECASE`). Third, results come back as a match object (or `None`) with `.group(n)` accessors, instead of preg_match filling a `$matches` array by reference — so the idiomatic guard is `if m := re.search(...):`.",
    },
    {
      q: "Explain naive vs aware datetimes and how that compares to PHP.",
      a: "A naive datetime has no timezone attached; an aware one carries a `tzinfo`. That's a real difference from PHP, where a DateTime always has a zone (defaulting to date.timezone config). In Python, `datetime.now()` is naive, and mixing naive with aware in comparisons or subtraction raises `TypeError`. The fix since 3.9 is the stdlib `zoneinfo` module: `datetime.now(ZoneInfo(\"Australia/Sydney\"))` gives an aware value, the analogue of passing a DateTimeZone. House rule on most teams: store and compute in UTC-aware datetimes, convert at the edges.",
    },
    {
      q: "What in collections would you reach for instead of hand-rolled array logic?",
      a: "`Counter` replaces `array_count_values` plus the arsort you always do next — `Counter(items).most_common(5)` is the whole 'top five' report, and counters support arithmetic like subtracting one tally from another. `defaultdict(list)` removes the isset-guard idiom when grouping: touching a missing key creates the empty list. And `namedtuple` (or nowadays a `@dataclass`) turns positional tuples into named records, the way you'd promote a PHP array shape into a small value object.",
    },
  ],

  quiz: [
    {
      question: "What does json.loads('{\"a\": 1}') return?",
      options: [
        "An object with attribute access, like stdClass",
        "A dict — the equivalent of json_decode($s, true)",
        "A JSON document object you query with methods",
        "A string until you call .parse()",
      ],
      answerIndex: 1,
      explain:
        "Python's json module always decodes objects to dicts and arrays to lists — there is no stdClass equivalent and no second argument to remember.",
    },
    {
      question: "Which re function is the drop-in equivalent of preg_match's find-anywhere behaviour?",
      options: ["re.match", "re.search", "re.fullmatch", "re.split"],
      answerIndex: 1,
      explain:
        "re.search scans the whole string for the first match, like preg_match. re.match anchors at position 0 and re.fullmatch must consume the entire string — both classic surprises for PHP devs.",
    },
    {
      question: "Why write Python regex patterns as r\"\\d+\" rather than \"\\\\d+\"?",
      options: [
        "Raw strings compile to faster automata",
        "Raw strings disable backslash escapes, so the pattern reads as written",
        "The re module rejects non-raw strings",
        "r\"...\" adds implicit delimiters like /.../",
      ],
      answerIndex: 1,
      explain:
        "In a raw string backslashes are literal, so \\d reaches the regex engine as-is — ending the double-escaping PHP needs inside '/\\d+/'. Non-raw strings still work; they're just error-prone. There are no delimiters in Python patterns at all.",
    },
    {
      question: "You need to group rows by a key, appending to a list per key. The Pythonic tool?",
      options: [
        "A try/except KeyError around every append",
        "collections.defaultdict(list)",
        "collections.Counter",
        "Pre-initialising every possible key first",
      ],
      answerIndex: 1,
      explain:
        "defaultdict(list) creates the empty list the first time a key is touched, so by_key[k].append(v) just works — the direct replacement for PHP's if (!isset($a[$k])) $a[$k] = []; dance. Counter is for tallying, not grouping.",
    },
  ],
};

export default lesson;

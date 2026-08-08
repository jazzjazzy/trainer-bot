import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "query-parameters",
  title: "Query Parameters, Defaults & Annotated",
  part: "Foundations",
  estMinutes: 10,
  summary:
    "Function parameters that aren't in the path become query parameters — typed, defaulted, coerced, and validated by the same signature-is-the-contract rule.",

  concept: `
### Not in the path? It's a query parameter

\`\`\`python
@app.get("/items")
def list_items(q: str | None = None, page: int = 1, short: bool = False):
    return {"q": q, "page": page, "short": short}
\`\`\`

The rule is positional: \`q\`, \`page\`, and \`short\` don't appear in
\`"/items"\`, so FastAPI reads them from the query string. That's also the
interview answer to "how does FastAPI know path vs query vs body?" — **by
where the parameter appears and what its type is**: names matching a path
segment are path params, Pydantic models come from the body, everything else
is a query param.

The defaults encode three different contracts:

- \`q: str | None = None\` — optional and nullable: absent means \`None\`.
- \`page: int = 1\` — optional with a fallback, coerced from the string \`"3"\` to the int \`3\`.
- \`needle: str\` (no default) — **required**: omit it and the client gets a 422 with \`"type": "missing"\`.

Booleans are coerced generously: \`?short=1\`, \`?short=true\`, \`?short=on\`,
\`?short=yes\` all arrive as \`True\`. Compare that to PHP, where
\`$_GET['short']\` hands you the string \`"false"\` — which is truthy.

### Validation metadata: Annotated + Query()

Types alone can't say "at most 50 characters". Attach constraints the same way
path params do, with \`Annotated\` — the documented style since FastAPI 0.95:

\`\`\`python
from typing import Annotated
from fastapi import Query

@app.get("/items")
def list_items(
    q: Annotated[str | None, Query(max_length=50)] = None,
):
    return {"q": q}
\`\`\`

Read it as: the type is \`str | None\`, and \`Query(max_length=50)\` is
instructions for FastAPI. A 51-character \`q\` is a 422 (\`string_too_long\`),
and the limit is documented in \`/docs\`. \`min_length\`, \`pattern\` (a regex),
and the numeric bounds \`gt/ge/lt/le\` work too. You'll still meet the older
form \`q: str | None = Query(default=None, max_length=50)\` in codebases —
same behaviour, legacy style.

### Repeated parameters

\`?tags=new&tags=sale\` maps to a list — but you must say so explicitly with
\`Query()\`, otherwise FastAPI would assume a list means the request body:

\`\`\`python
@app.get("/items")
def list_items(tags: Annotated[list[str], Query()] = []):
    return {"tags": tags}
\`\`\`

Note the PHP difference: no \`tags[]\` bracket convention. FastAPI (like most
non-PHP stacks) reads repeated bare names.

### Required and validated at the edge

Everything above happens **before your function runs**. By the time you touch
\`page\`, it's an \`int\` that satisfied every constraint — the handler body
contains zero casting or checking code. In PHP terms: imagine every
\`$request->query(...)\` call replaced by a typed, validated, documented
method argument.
`,

  comparisons: [
    {
      label: "Typed, defaulted query params vs the $_GET cast ritual",
      intro:
        "A listing endpoint with optional search text, a page number, and a boolean flag. Every PHP value arrives as a string (or is absent) — the casting is on you.",
      php: `<?php
// Everything in $_GET is a string or missing.
$q     = $_GET['q'] ?? null;
$page  = max(1, (int) ($_GET['page'] ?? 1));
// "?short=false" -> "false" -> truthy! Must
// use filter_var for real bool semantics:
$short = filter_var(
    $_GET['short'] ?? false,
    FILTER_VALIDATE_BOOLEAN
);

// Laravel is nicer but still string-typed:
// $page = (int) $request->query('page', 1);`,
      ts: `# main.py
@app.get("/items")
def list_items(
    q: str | None = None,   # absent -> None
    page: int = 1,          # "3" -> 3; "abc" -> 422
    short: bool = False,    # 1/true/on/yes -> True
):
    return {"q": q, "page": page, "short": short}

# The handler body starts with clean,
# correctly-typed values. No casts.`,
      note: "The signature replaces the whole cast-and-default preamble — and bad input becomes a structured 422 instead of a silently-wrong (int) cast.",
    },
    {
      label: "Constraining a parameter",
      intro:
        "Limit the search term to 50 characters. Laravel states the rule in a validator array; FastAPI attaches it to the parameter's type with Annotated.",
      php: `<?php
public function index(Request $request) {
    $validated = $request->validate([
        'q' => 'nullable|string|max:50',
    ]);
    $q = $validated['q'] ?? null;
    // Rule lives here; the OpenAPI docs (if
    // any) must repeat it by hand.
    return response()->json(['q' => $q]);
}`,
      ts: `# main.py
from typing import Annotated
from fastapi import Query

@app.get("/items")
def list_items(
    q: Annotated[str | None,
                 Query(max_length=50)] = None,
):
    return {"q": q}

# 51 chars -> 422 "string_too_long";
# the limit also appears in /docs.`,
      note: "Same rule, but Annotated puts it on the parameter itself, so validation, editor type, and documentation can't disagree. This is the current style — Query(default=...) as a default value is the legacy form.",
    },
    {
      label: "Repeated parameters: tags[] vs bare repeats",
      intro:
        "Accept multiple tags in one URL. PHP needs the [] naming convention; FastAPI declares list[str] and reads repeated bare names.",
      php: `<?php
// PHP only builds an array with brackets:
// /items?tags[]=new&tags[]=sale
$tags = (array) ($_GET['tags'] ?? []);

// Without []: /items?tags=new&tags=sale
// -> $_GET['tags'] === "sale"
// (the last value silently wins)`,
      ts: `# /items?tags=new&tags=sale
from typing import Annotated
from fastapi import Query

@app.get("/items")
def list_items(
    tags: Annotated[list[str], Query()] = [],
):
    return {"tags": tags}
# -> {"tags": ["new", "sale"]}

# Query() is required here: a bare list
# type would be looked for in the body.`,
      note: "No bracket convention — repeated names accumulate. The explicit Query() marker is what tells FastAPI 'this list comes from the query string, not the request body'.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "FastAPI's query rules on real query strings: urllib.parse.parse_qs splits the URL, then a spec table applies types and defaults exactly as a signature would. Predict all four results — the last URL fails twice.",
    code: `# FastAPI's query-parameter rules, simulated on real query strings.
from urllib.parse import parse_qs

# (type, default) -- REQUIRED means no default, like a param with no "= value".
REQUIRED = object()
SPEC = {
    "q":     (str,  None),      # q: str | None = None
    "page":  (int,  1),         # page: int = 1
    "short": (bool, False),     # short: bool = False
    "tags":  (list, []),        # tags: list[str] = []
}
TRUTHY, FALSY = {"1", "true", "on", "yes"}, {"0", "false", "off", "no"}

def parse_query(url):
    raw = parse_qs(url.split("?", 1)[1] if "?" in url else "")
    out, errors = {}, []
    for name, (typ, default) in SPEC.items():
        if name not in raw:
            if default is REQUIRED:
                errors.append({"type": "missing", "loc": ["query", name],
                               "msg": "Field required"})
            else:
                out[name] = default
            continue
        values = raw[name]                      # parse_qs always gives a list
        if typ is list:
            out[name] = values                  # ?tags=a&tags=b -> ["a", "b"]
        elif typ is bool:
            v = values[0].lower()
            if v in TRUTHY:
                out[name] = True
            elif v in FALSY:
                out[name] = False
            else:
                errors.append({"type": "bool_parsing", "loc": ["query", name],
                               "msg": "Input should be a valid boolean",
                               "input": values[0]})
        elif typ is int:
            try:
                out[name] = int(values[0])
            except ValueError:
                errors.append({"type": "int_parsing", "loc": ["query", name],
                               "msg": "Input should be a valid integer",
                               "input": values[0]})
        else:
            out[name] = values[0]
    return (422, {"detail": errors}) if errors else (200, out)

for url in ["/items",
            "/items?q=lamp&page=3",
            "/items?short=on&tags=new&tags=sale",
            "/items?page=abc&short=maybe"]:
    status, body = parse_query(url)
    print(f"{url}\\n  -> {status} {body}")`,
    output: `/items
  -> 200 {'q': None, 'page': 1, 'short': False, 'tags': []}
/items?q=lamp&page=3
  -> 200 {'q': 'lamp', 'page': 3, 'short': False, 'tags': []}
/items?short=on&tags=new&tags=sale
  -> 200 {'q': None, 'page': 1, 'short': True, 'tags': ['new', 'sale']}
/items?page=abc&short=maybe
  -> 422 {'detail': [{'type': 'int_parsing', 'loc': ['query', 'page'], 'msg': 'Input should be a valid integer', 'input': 'abc'}, {'type': 'bool_parsing', 'loc': ['query', 'short'], 'msg': 'Input should be a valid boolean', 'input': 'maybe'}]}`,
  },

  keyPoints: [
    "Any function parameter not present in the path template is read from the query string — location in the signature decides path vs query vs body.",
    "Defaults define optionality: `q: str | None = None` is optional/nullable, `page: int = 1` has a fallback, and a parameter with no default is required (422 `missing` if absent).",
    "Booleans coerce from `1`, `true`, `on`, `yes` (and their false counterparts) — no PHP-style `\"false\"`-is-truthy trap.",
    "Attach constraints with `Annotated[str | None, Query(max_length=50)]` — the documented style since FastAPI 0.95; `= Query(default=...)` is the legacy form.",
    "Repeated params need an explicit marker: `tags: Annotated[list[str], Query()]` reads `?tags=a&tags=b` as a list — no `tags[]` bracket convention.",
    "All coercion and validation happens before your function runs; the handler body never casts or checks query input.",
  ],

  interview: [
    {
      q: "How does FastAPI decide whether a parameter comes from the path, the query string, or the body?",
      a: "By where the parameter appears and what its type is. If the name matches a segment in the path template, it's a path parameter. If it's a scalar type — int, str, bool, float — and isn't in the path, it's a query parameter. If it's a Pydantic BaseModel, FastAPI expects it in the JSON body. You can override the inference explicitly with markers like Query(), Path(), Body(), or Header() in Annotated metadata — for example `Annotated[list[str], Query()]` forces a list to come from repeated query params instead of the body. It's declarative: the signature fully describes where every input comes from, which is also exactly what the OpenAPI generator reads.",
    },
    {
      q: "How do you make a query parameter required vs optional in FastAPI?",
      a: "With defaults, exactly like Python function arguments. No default means required — FastAPI returns a 422 with a `missing` error entry if the client omits it. A default makes it optional: `page: int = 1` falls back to 1, and the idiomatic nullable form is `q: str | None = None`. Coming from Laravel, it's `$request->query('page', 1)` semantics but enforced and typed at the framework edge: by the time my code runs, page is a real int, not a string I have to cast, and an unparseable value was already rejected with a structured error.",
    },
    {
      q: "What is Annotated doing in `q: Annotated[str | None, Query(max_length=50)] = None`?",
      a: "Annotated is standard Python typing for attaching metadata to a type without changing it. The type checker and my editor see `str | None`; FastAPI additionally reads the `Query(max_length=50)` metadata and enforces the length limit at validation time, returning a 422 with a `string_too_long` error for violations, and publishes the constraint in the OpenAPI schema. It's been the documented default style since FastAPI 0.95 — the older `= Query(default=None, max_length=50)` pattern abused the default-value slot and gets awkward when combined with real defaults, so I'd write Annotated in new code and just recognise the old form in existing codebases.",
    },
  ],

  quiz: [
    {
      question:
        "In `@app.put(\"/items/{item_id}\")` with `def update(item_id: int, filters: ItemFilters, q: str | None = None)` where ItemFilters is a BaseModel — where does each parameter come from?",
      options: [
        "All three from the query string",
        "item_id from the path, q from the query string, filters from the request body",
        "item_id from the path, q and filters from the body",
        "You must add Path()/Query()/Body() markers or FastAPI raises an error",
      ],
      answerIndex: 1,
      explain:
        "The inference rules: names matching a path segment are path params, remaining scalars are query params, and Pydantic models are read from the JSON body. Markers are only needed to override the defaults.",
    },
    {
      question: "Which request values does `short: bool = False` accept as True?",
      options: [
        "Only the exact string \"True\"",
        "Any non-empty string, like PHP truthiness",
        "\"1\", \"true\", \"on\", and \"yes\" (case-insensitive)",
        "Booleans can't be query parameters",
      ],
      answerIndex: 2,
      explain:
        "FastAPI coerces the common truthy spellings to True and their counterparts to False; anything else is a 422 bool_parsing error. That's stricter and safer than PHP, where the string \"false\" is truthy.",
    },
    {
      question:
        "You want `?tags=new&tags=sale` to arrive as a list of strings. What's the correct declaration?",
      options: [
        "tags: list[str] = [] — the type alone is enough",
        "tags: Annotated[list[str], Query()] = [] — the Query() marker is required",
        "tags: str = \"\" and split on commas yourself",
        "Rename the parameter to tags[] to match PHP conventions",
      ],
      answerIndex: 1,
      explain:
        "Without the explicit Query() marker, FastAPI would interpret a list-typed parameter as body content. With it, repeated bare names accumulate into the list — no PHP-style [] bracket naming needed.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 10,
  slug: "response-model",
  title: "response_model & Serialisation Control",
  part: "Pydantic & Responses",
  estMinutes: 12,
  summary:
    "Declare a response model — as the return-type annotation or response_model= — and FastAPI filters, validates, and documents every response: the model is a whitelist, so fields like hashed_password can never leak.",

  concept: `
Validation shapes what comes *in*; a **response model** shapes what goes
*out*. Declare one and FastAPI does three things to every response from that
endpoint: **filters** it down to the model's fields, **validates** it against
the model, and **documents** it in the OpenAPI schema.

### The modern form: annotate the return type

\`\`\`python
class UserPublic(BaseModel):
    id: int
    username: str
    email: str

@app.get("/users/{user_id}")
async def read_user(user_id: int) -> UserPublic:
    return get_user_from_db(user_id)   # a full DB record
\`\`\`

The \`-> UserPublic\` annotation is the response model. The handler can return
a richer object — an ORM row, a \`UserInDB\` with \`hashed_password\` and
\`is_admin\` — and the response contains **only** \`id\`, \`username\`, and
\`email\`. Under the hood the data is validated into the model and serialised
via \`model_dump\`; extra keys simply do not survive the trip.

### This is a security feature

Frame it that way in interviews. In PHP, output shaping is typically a
Laravel API Resource or a Fractal transformer — an *opt-in* whitelist.
Forget to wrap one code path (\`return $user;\` in a quick fix) and the
serialiser happily emits every attribute, remember-tokens and all. Laravel's
\`$hidden\` array on the model is a *blacklist* — protection only for fields
someone thought to list. FastAPI inverts the default: the response model is a
**whitelist bound to the route declaration**. Every value returned as data
goes through it — the one bypass is returning a \`Response\` object directly,
which FastAPI passes through unvalidated and unfiltered — and a new column
added to the users table changes nothing until you consciously add it to
\`UserPublic\`.

### When the annotation fights your type checker

Returning a \`UserInDB\` from a function annotated \`-> UserPublic\` makes
mypy/pyright complain — correctly, by their rules. For that case use the
decorator parameter instead; it overrides any return annotation:

\`\`\`python
@app.post("/users", response_model=UserPublic)
async def create_user(user: UserCreate) -> Any:
    return save_user(user)   # returns UserInDB; FastAPI filters
\`\`\`

Same filtering, but the tooling stays quiet. Rule of thumb: annotation when
the types line up (and you get editor checking for free), \`response_model=\`
when you deliberately return a different shape.

### The standard pattern: input/output model pairs

Production FastAPI code almost always splits models per direction:

- \`UserCreate\` — what clients send: \`username\`, \`email\`, \`password\`
- \`UserPublic\` — what they get back: \`id\`, \`username\`, \`email\`
- \`UserInDB\` — internal: adds \`hashed_password\`

The plaintext password exists only in \`UserCreate\`; the hash exists only in
\`UserInDB\`; neither can appear in a response because \`UserPublic\` doesn't
know them. Shared fields can live on a common base class to avoid
repetition.

### response_model_exclude_unset and friends

A response model normally emits every field, defaults included. For
PATCH-style responses where you want to echo only what was actually set:

\`\`\`python
@app.patch("/items/{item_id}", response_model=Item,
           response_model_exclude_unset=True)
\`\`\`

Fields that were never explicitly assigned are omitted from the JSON.
Related knobs: \`response_model_exclude_none\` (drop \`None\` values) and
\`response_model_exclude_defaults\`. They map directly onto \`model_dump\`'s
\`exclude_unset\`/\`exclude_none\`/\`exclude_defaults\` arguments — a reminder of
what's really happening: every response is a \`model_validate\` +
\`model_dump\` round trip that you configure declaratively.
`,

  comparisons: [
    {
      label: "The leak that can't happen",
      intro:
        "Return a user record from an endpoint. The PHP version leaks everything the moment someone skips the Resource; the FastAPI version has no unwrapped path.",
      php: `<?php
// app/Http/Resources/UserResource.php — opt-in whitelist
class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'       => $this->id,
            'username' => $this->username,
            'email'    => $this->email,
        ];
    }
}

// Route A — someone remembered the wrapper. Safe.
return new UserResource($user);

// Route B — quick bugfix at 5pm. $user serialises with
// EVERY column not in $hidden: password hash? tokens?
return response()->json($user);`,
      ts: `# main.py — the whitelist is bound to the ROUTE
from pydantic import BaseModel

class UserPublic(BaseModel):
    id: int
    username: str
    email: str

@app.get("/users/{user_id}")
async def read_user(user_id: int) -> UserPublic:
    user = get_user_from_db(user_id)
    # user has hashed_password, is_admin, mfa_secret...
    return user
    # Response: {"id": ..., "username": ..., "email": ...}
    # Every value returned as DATA is filtered
    # through UserPublic; returning a Response
    # object directly is the one way around it.`,
      note: "Laravel's Resource is a wrapper you must remember on every return; the response model is part of the route declaration, so filtering applies to every code path that returns data.",
    },
    {
      label: "Input and output as separate models",
      intro:
        "Create a user: accept a password in, never send secrets out. PHP spreads this across a FormRequest, a model's $hidden, and a Resource; FastAPI states it as two model declarations on one route.",
      php: `<?php
// Three files cooperate to keep the secret in:
// 1) StoreUserRequest validates 'password' => 'required|min:8'
// 2) User model: protected $hidden = ['password'];
//    (a BLACKLIST — new sensitive columns start visible)
// 3) UserResource whitelists the output fields

public function store(StoreUserRequest $request): UserResource
{
    $user = User::create([
        ...$request->safe()->except('password'),
        'password' => Hash::make($request->password),
    ]);
    return new UserResource($user);
}`,
      ts: `# One route, two models — direction is explicit
class UserCreate(BaseModel):
    username: str
    email: str
    password: str          # exists ONLY on the input model

class UserPublic(BaseModel):
    id: int
    username: str
    email: str             # no password field can leak

@app.post("/users", response_model=UserPublic, status_code=201)
async def create_user(user: UserCreate) -> Any:
    return save_user(user)  # persists hash, returns UserInDB

# /docs now shows the request schema (with password)
# and the response schema (without) — accurately.`,
      note: "The input model validates and the output model filters — and both appear in the OpenAPI schema, so the docs honestly show that password goes in and never comes back.",
    },
    {
      label: "PATCH responses: only what was set",
      intro:
        "A partial update should echo back the fields that were actually stored, not a wall of defaults. Compare hand-filtering with a declarative flag.",
      php: `<?php
public function update(Request $request, Item $item): JsonResponse
{
    $validated = $request->validate([
        'name'        => 'sometimes|string',
        'description' => 'sometimes|string',
        'price'       => 'sometimes|numeric',
    ]);
    $item->update($validated);

    // Echo only the touched fields — by hand:
    return response()->json(
        array_intersect_key($item->toArray(), $validated)
    );
}`,
      ts: `class Item(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    tax: float = 10.5           # a default

@app.patch("/items/{item_id}", response_model=Item,
           response_model_exclude_unset=True)
async def update_item(item_id: int, item: Item):
    stored = apply_patch(item_id, item)
    return stored
    # Client sent {"price": 9.5}? Response is
    # {"price": 9.5} — no null name, no default tax.`,
      note: "exclude_unset distinguishes 'never provided' from 'explicitly set' (even to the default value) — state Pydantic tracks per instance, which array_intersect_key can only approximate.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "response_model reduced to its essence: filter_response drops every key the declared schema doesn't know. Predict what survives the filter — then notice the direction: the model lists what to KEEP, so new secret fields are excluded by default.",
    code: `# response_model in miniature: the output model is a WHITELIST.
# Whatever the handler returns is filtered through the declared
# fields — keys the model doesn't know about never reach the wire.
import json

# The "UserPublic" response model: these fields and nothing else.
USER_PUBLIC_FIELDS = ("id", "username", "email")

def filter_response(obj, model_fields):
    # FastAPI does this via UserPublic.model_validate + model_dump;
    # the effect is the same: schema-driven key filtering.
    return {k: obj[k] for k in model_fields if k in obj}

# What the handler actually returned: a full DB record.
user_in_db = {
    "id": 7,
    "username": "jason",
    "email": "jason@example.com",
    "hashed_password": "$2b$12$K9x.EXAMPLEHASHONLY",
    "is_admin": True,
}

print("handler returned:")
print(json.dumps(user_in_db, indent=2))
print()

public = filter_response(user_in_db, USER_PUBLIC_FIELDS)
print("response body after response_model=UserPublic:")
print(json.dumps(public, indent=2))
print()
print("hashed_password leaked:", "hashed_password" in public)
print("is_admin leaked:       ", "is_admin" in public)`,
    output: `handler returned:
{
  "id": 7,
  "username": "jason",
  "email": "jason@example.com",
  "hashed_password": "$2b$12$K9x.EXAMPLEHASHONLY",
  "is_admin": true
}

response body after response_model=UserPublic:
{
  "id": 7,
  "username": "jason",
  "email": "jason@example.com"
}

hashed_password leaked: False
is_admin leaked:        False`,
  },

  keyPoints: [
    "A response model filters (whitelist), validates, and documents the endpoint's output — declare it as the return-type annotation (`-> UserPublic`) or with `response_model=`.",
    "It's a security feature: unlike Laravel Resources (an opt-in wrapper) or `$hidden` (a blacklist), the model is bound to the route, so every value returned as data is filtered — the only bypass is returning a Response object directly.",
    "Use `response_model=` with a `-> Any` annotation when the handler deliberately returns a richer type (e.g. `UserInDB`) than the response schema — it overrides the return annotation and keeps type checkers quiet.",
    "The standard pattern is model pairs per direction: `UserCreate` (has `password`) in, `UserPublic` (no secrets) out, `UserInDB` (has `hashed_password`) internal only.",
    "`response_model_exclude_unset=True` omits fields the handler never explicitly set — ideal for PATCH-style responses; `exclude_none` and `exclude_defaults` are siblings.",
    "Under the hood every response runs through `model_validate` + `model_dump` — the decorator flags map directly onto `model_dump`'s arguments.",
  ],

  interview: [
    {
      q: "How do you make sure a FastAPI endpoint never leaks fields like a password hash?",
      a: "I declare a response model on the route — either as the return-type annotation, `-> UserPublic`, or as `response_model=UserPublic` on the decorator. FastAPI then validates and filters whatever the handler returns through that model, so a full `UserInDB` record goes in and only `UserPublic`'s fields come out; serialisation runs through `model_dump` and unknown keys don't survive. The crucial property is that it's a whitelist bound to the route declaration: unlike a Laravel API Resource, which is a wrapper someone can forget on one return statement, the only way to bypass it is to return a Response object directly instead of data — and a new sensitive column added to the table stays private until it's consciously added to the public model.",
    },
    {
      q: "Why do FastAPI codebases define separate UserCreate, UserPublic, and UserInDB models rather than one User model?",
      a: "Because input, output, and storage have genuinely different shapes, and one model would have to lie about at least two of them. `UserCreate` carries the plaintext `password` — that field must never exist on anything returned. `UserPublic` is the response whitelist: `id`, `username`, `email`. `UserInDB` adds `hashed_password` for persistence. With the pair declared on the route (`user: UserCreate` in, `response_model=UserPublic` out), the OpenAPI docs accurately show that a password goes in and never comes back, and the type system enforces it. Shared fields go on a common base class, so it's less duplication than it sounds — it's the FormRequest/Resource split from Laravel, but checked by the framework.",
    },
    {
      q: "When would you use response_model= on the decorator instead of just annotating the return type?",
      a: "When the handler intentionally returns a different type than the response schema. Annotating `-> UserPublic` while returning a `UserInDB` makes mypy or pyright flag a type error — correctly, from their perspective. The idiom is `response_model=UserPublic` with the function annotated `-> Any`: FastAPI documents and filters with `UserPublic` (the decorator parameter takes priority over the annotation), while the static tooling stays quiet. When the returned type and response schema match, I prefer the plain return annotation — it's less ceremony and the editor checks my return statements for free.",
    },
  ],

  quiz: [
    {
      question: "An endpoint annotated -> UserPublic returns a UserInDB object containing hashed_password. What does the client receive?",
      options: [
        "A 500 error — the types don't match",
        "The full UserInDB including hashed_password",
        "Only UserPublic's fields — extra keys like hashed_password are filtered out",
        "UserPublic's fields plus hashed_password under an '_extra' key",
      ],
      answerIndex: 2,
      explain:
        "The response model is a whitelist: FastAPI validates the returned data into UserPublic and serialises via model_dump, so fields the model doesn't declare never reach the response. That filtering is the point — it's a security guarantee, not a convenience.",
    },
    {
      question: "What does response_model_exclude_unset=True do?",
      options: [
        "Removes all fields whose value is None",
        "Omits fields that were never explicitly set, so defaults don't appear in the response",
        "Rejects requests that omit optional fields",
        "Removes the response model from the OpenAPI schema",
      ],
      answerIndex: 1,
      explain:
        "exclude_unset uses Pydantic's per-instance tracking of which fields were actually assigned — untouched defaults are dropped from the JSON. Dropping None values specifically is response_model_exclude_none; both map onto model_dump arguments.",
    },
    {
      question: "Why is FastAPI's response-model filtering safer than Laravel's $hidden array on an Eloquent model?",
      options: [
        "It isn't — both are blacklists with the same failure mode",
        "$hidden only works for JSON, response models work for XML too",
        "Response models encrypt the hidden fields instead of removing them",
        "A response model whitelists what to include, so a newly added sensitive column is excluded by default; $hidden blacklists, so new columns are exposed until someone lists them",
      ],
      answerIndex: 3,
      explain:
        "The failure modes differ: with a blacklist, forgetting to list a new secret field means it leaks; with a whitelist, forgetting means the field is missing from responses — an annoyance, not a breach. Safe-by-default wins for output shaping.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 8,
  slug: "validators-constraints",
  title: "Custom Validators & Constrained Types",
  part: "Pydantic & Responses",
  estMinutes: 12,
  summary:
    "When Field constraints run out, @field_validator handles single-field business rules, @model_validator(mode='after') handles cross-field checks, and Annotated constrained types make rules reusable — all surfacing in the same structured 422 body.",

  concept: `
\`Field(gt=0, min_length=3)\` covers the mechanical rules. Real APIs need more:
"normalise this email", "reject disposable domains", "password and
confirmation must match". Pydantic v2 gives you three tools, in escalating
scope.

### @field_validator — one field, your logic

A classmethod that receives the value and either returns it (possibly
transformed) or raises \`ValueError\`:

\`\`\`python
from pydantic import BaseModel, field_validator

class Signup(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        v = v.strip().lower()          # validators can TRANSFORM
        if v.endswith("@mailinator.com"):
            raise ValueError("disposable email addresses not allowed")
        return v                        # always return the value
\`\`\`

Two things PHP validation rarely gives you in one place: the validator can
*rewrite* the value (normalisation), and it runs as part of construction — an
instance with a non-normalised email simply cannot exist. By default
validators run \`mode="after"\` (after Pydantic's own type coercion, so \`v\` is
already a \`str\`); \`mode="before"\` sees the raw input first. One decorator can
guard several fields: \`@field_validator("email", "backup_email")\`.

### @model_validator(mode="after") — cross-field rules

Field validators see one value; cross-field checks need the whole model.
\`mode="after"\` runs on the constructed instance, so you work with \`self\`:

\`\`\`python
from pydantic import model_validator

class Signup(BaseModel):
    password: str
    password_confirm: str

    @model_validator(mode="after")
    def passwords_match(self) -> "Signup":
        if self.password != self.password_confirm:
            raise ValueError("passwords do not match")
        return self
\`\`\`

**Watch the names**: \`@validator\` and \`@root_validator\` are the deprecated
Pydantic v1 forms. Old tutorials are full of them; in an interview, using the
v2 names — and knowing what they replaced — signals you're current.

### One error format, built-ins and custom alike

A \`ValueError\` raised in a validator doesn't crash the request. FastAPI
catches the resulting \`ValidationError\` and folds your message into the same
structured 422 body as built-in failures — \`loc\` pointing at the field (or
the model for a cross-field rule), \`msg\`, and \`type: value_error\`. Clients
parse **one** error shape no matter who raised it. In Laravel terms: custom
rules and built-in rules share the error bag — but here the shape is a typed
contract, documented in the OpenAPI schema.

### Annotated constrained types — rules you can reuse

When the same rule appears on many models, name it once:

\`\`\`python
from typing import Annotated
from pydantic import Field

Username = Annotated[str, Field(min_length=3, max_length=30,
                                pattern=r"^[a-z0-9_]+$")]
Price = Annotated[float, Field(gt=0)]

class UserCreate(BaseModel):
    username: Username

class UserRename(BaseModel):
    new_username: Username   # same rule, zero duplication
\`\`\`

A constrained type is a *type*, so it composes everywhere types go: model
fields, function parameters, \`list[Username]\`. This is the same \`Annotated\`
pattern FastAPI uses for dependencies — metadata attached to a type, resolved
by the framework.
`,

  comparisons: [
    {
      label: "A single-field business rule",
      intro:
        "Reject disposable email domains and normalise case. Laravel puts the rule in a separate Rule class wired up in a FormRequest; Pydantic puts it on the model that owns the data.",
      php: `<?php
// app/Rules/NotDisposable.php — rule lives apart from the data
class NotDisposable implements ValidationRule
{
    public function validate(string $attr, mixed $value, Closure $fail): void
    {
        if (str_ends_with(strtolower($value), '@mailinator.com')) {
            $fail('Disposable email addresses are not allowed.');
        }
    }
}

// app/Http/Requests/SignupRequest.php — wired up by string key
public function rules(): array
{
    return ['email' => ['required', 'email', new NotDisposable]];
}
// Normalising to lowercase is ANOTHER mechanism again
// (prepareForValidation or a cast) — three places total.`,
      ts: `# schemas.py — rule, normalisation, and data in one class
from pydantic import BaseModel, field_validator

class Signup(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        v = v.strip().lower()
        if v.endswith("@mailinator.com"):
            raise ValueError("disposable email addresses not allowed")
        return v

# Signup(email=" X@Mailinator.COM ", ...) -> ValidationError
# Signup(email=" Jay@Example.COM ", ...).email == "jay@example.com"`,
      note: "The validator both checks AND transforms, and it runs on construction — so no Signup instance with a raw, un-normalised email can exist anywhere in the codebase.",
    },
    {
      label: "Cross-field validation",
      intro:
        "Password and confirmation must match. Laravel expresses it as a string rule referencing another field; Pydantic gives you the whole typed instance to inspect.",
      php: `<?php
// app/Http/Requests/SignupRequest.php
public function rules(): array
{
    return [
        'password' => ['required', 'min:8', 'confirmed'],
        // 'confirmed' magically looks for password_confirmation.
        // For anything less conventional you drop to:
        // 'ends_at' => ['after:starts_at'], or a closure with
        // $this->input('other_field') — stringly-typed access.
    ];
}`,
      ts: `# schemas.py
from pydantic import BaseModel, model_validator

class Signup(BaseModel):
    password: str
    password_confirm: str

    @model_validator(mode="after")
    def passwords_match(self) -> "Signup":
        # self is the fully validated, typed instance —
        # plain Python, no magic strings.
        if self.password != self.password_confirm:
            raise ValueError("passwords do not match")
        return self`,
      note: "mode='after' runs once every field has individually passed, so self.password is guaranteed to exist and be a str. The v1 spelling @root_validator is deprecated.",
    },
    {
      label: "Reusable rules",
      intro:
        "The same username format is enforced on signup and on rename. PHP repeats the rule strings (or centralises them in a helper you must remember to call); Pydantic names the rule as a type.",
      php: `<?php
// Rule strings duplicated across FormRequests...
class SignupRequest extends FormRequest
{
    public function rules(): array
    {
        return ['username' =>
            ['required', 'min:3', 'max:30', 'regex:/^[a-z0-9_]+$/']];
    }
}

class RenameRequest extends FormRequest
{
    public function rules(): array
    {   // ...drift waiting to happen
        return ['new_username' =>
            ['required', 'min:3', 'max:30', 'regex:/^[a-z0-9_]+$/']];
    }
}`,
      ts: `# types.py — the rule IS a type, defined once
from typing import Annotated
from pydantic import BaseModel, Field

Username = Annotated[str, Field(min_length=3, max_length=30,
                                pattern=r"^[a-z0-9_]+$")]

class UserCreate(BaseModel):
    username: Username

class UserRename(BaseModel):
    new_username: Username

# Works anywhere a type works: list[Username],
# function params, other Annotated compositions.`,
      note: "Annotated attaches the Field constraints to the type itself, so every use site gets identical validation and identical OpenAPI schema — no drift between endpoints.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Validators simulated on a dataclass: two field validators (one normalises, one checks length) and one cross-field check, each appending Pydantic-shaped {loc, msg, type} error dicts. Predict the passing run's email and the failing run's three errors.",
    code: `# Pydantic-style validators on a plain dataclass: each validator either
# normalises a value or records an error dict shaped like Pydantic's
# ({loc, msg, type}). Cross-field checks see the whole record — that is
# what @model_validator(mode="after") gives you.
from dataclasses import dataclass

class ValidationError(ValueError):
    def __init__(self, errors):
        super().__init__(f"{len(errors)} validation error(s)")
        self.errors = errors

# --- field validators (like @field_validator) ---
def normalise_email(data, errors):
    email = data["email"].strip().lower()
    if "@" not in email:
        errors.append({"loc": ("email",), "msg": "value is not a valid email",
                       "type": "value_error"})
    data["email"] = email

def password_strength(data, errors):
    if len(data["password"]) < 8:
        errors.append({"loc": ("password",),
                       "msg": "String should have at least 8 characters",
                       "type": "string_too_short"})

# --- cross-field check (like @model_validator(mode="after")) ---
def passwords_match(data, errors):
    if data["password"] != data["password_confirm"]:
        errors.append({"loc": (), "msg": "passwords do not match",
                       "type": "value_error"})

VALIDATORS = [normalise_email, password_strength, passwords_match]

@dataclass
class Signup:
    email: str
    password: str
    password_confirm: str

    def __post_init__(self):
        errors = []
        for validate in VALIDATORS:
            validate(self.__dict__, errors)
        if errors:
            raise ValidationError(errors)

ok = Signup(email="  Jason@Example.COM ", password="s3cret-pw",
            password_confirm="s3cret-pw")
print("normalised email:", ok.email)

try:
    Signup(email="not-an-email", password="short", password_confirm="other")
except ValidationError as e:
    print(e)
    for err in e.errors:
        print(" ", err)`,
    output: `normalised email: jason@example.com
3 validation error(s)
  {'loc': ('email',), 'msg': 'value is not a valid email', 'type': 'value_error'}
  {'loc': ('password',), 'msg': 'String should have at least 8 characters', 'type': 'string_too_short'}
  {'loc': (), 'msg': 'passwords do not match', 'type': 'value_error'}`,
  },

  keyPoints: [
    "`@field_validator('field')` on a classmethod handles single-field rules — it can transform the value (normalise) or raise `ValueError` to reject, and must return the value.",
    "`@model_validator(mode='after')` runs on the constructed instance (`self`) for cross-field rules like password == confirm; return `self`.",
    "The v2 decorator names matter: `@validator` and `@root_validator` are deprecated Pydantic v1 forms you'll still see in old codebases and tutorials.",
    "Validator `ValueError`s surface in the same structured 422 body as built-in failures — one error format (`loc`, `msg`, `type`) for clients regardless of who raised it.",
    "Reusable rules become types: `Username = Annotated[str, Field(min_length=3, pattern=r'^[a-z0-9_]+$')]` — define once, use on any model or parameter, no drift.",
    "Field validators default to `mode='after'` (value already coerced to the field's type); `mode='before'` sees the raw input.",
  ],

  interview: [
    {
      q: "Field constraints can't express a rule you need — say, 'end date must be after start date'. How do you handle that in Pydantic v2?",
      a: "That's a cross-field rule, so it goes in a `@model_validator(mode='after')`. It runs after every field has individually validated, receives the constructed instance as `self`, and I compare `self.ends_at > self.starts_at`, raising `ValueError` if not, and returning `self`. For single-field business rules — normalising an email, rejecting a disposable domain — I'd use `@field_validator('email')` instead, which can also transform the value before it's stored. Both feed FastAPI's standard 422 response, so the client sees my custom message in exactly the same `{loc, msg, type}` structure as a built-in type failure. And I'd flag that `@root_validator`/`@validator` are the deprecated v1 spellings of the same ideas.",
    },
    {
      q: "How do you avoid duplicating validation rules across multiple models — the way rule strings get copy-pasted between Laravel FormRequests?",
      a: "Pydantic v2 lets you name a rule as a type with `Annotated`: `Username = Annotated[str, Field(min_length=3, max_length=30, pattern=r'^[a-z0-9_]+$')]`. Any model field or endpoint parameter annotated as `Username` gets identical validation and identical OpenAPI schema, from one definition. Because it's a real type it composes — `list[Username]`, optional variants, reuse inside other Annotated types. That's structurally better than centralising rule arrays in PHP, because there's no way to 'forget to apply' it: using the type is applying the rule.",
    },
    {
      q: "A client complains your API returns errors in different formats. How does FastAPI/Pydantic prevent that problem?",
      a: "Validation has a single funnel. Whether a failure comes from type coercion, a `Field` constraint, a custom `@field_validator`, or a cross-field `@model_validator`, Pydantic collects it into one `ValidationError` whose entries all have the same shape — `loc` (path to the failing field), `msg`, and `type`. FastAPI's default exception handler converts that into a 422 response with those entries under `detail`. So there's exactly one error contract for anything that fails validation, and it's documented in the OpenAPI schema. The only errors outside it are the ones I raise deliberately, like `HTTPException`, and those I'd keep to a consistent shape by convention.",
    },
  ],

  quiz: [
    {
      question: "What must a @field_validator method do with a value that passes its checks?",
      options: [
        "Return None to signal success",
        "Return the value (possibly transformed)",
        "Set it on cls and return True",
        "Nothing — falling off the end means success",
      ],
      answerIndex: 1,
      explain:
        "A field validator's return value becomes the field's value — that's how validators can normalise (strip, lowercase) as well as check. Returning None would set the field to None.",
    },
    {
      question: "Which is the correct current way to enforce that two fields agree (e.g. password == password_confirm)?",
      options: [
        "@root_validator on the class",
        "@field_validator('password', 'password_confirm') comparing both values in one call",
        "@model_validator(mode='after') on a method that inspects self and returns self",
        "ConfigDict(cross_field=True) with a Field(equals='password') constraint",
      ],
      answerIndex: 2,
      explain:
        "@model_validator(mode='after') runs on the fully constructed instance, so both fields are available as attributes of self. @root_validator is the deprecated v1 form; a field validator only sees one field's value at a time (info.data gives earlier fields, but the model validator is the idiomatic tool); the ConfigDict option doesn't exist.",
    },
    {
      question: "A ValueError raised inside a validator during request handling results in…",
      options: [
        "A 500 Internal Server Error with a traceback",
        "The field silently reverting to its default",
        "A 422 response whose detail entries have the same {loc, msg, type} shape as built-in validation errors",
        "A 400 response with a plain-text message",
      ],
      answerIndex: 2,
      explain:
        "Pydantic wraps validator ValueErrors into its ValidationError alongside any built-in failures, and FastAPI's handler renders them all as one structured 422 body. Clients parse a single error format no matter which rule failed.",
    },
  ],
};

export default lesson;

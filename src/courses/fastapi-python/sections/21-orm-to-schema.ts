import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "orm-to-schema",
  title: "ORM Objects to Pydantic Schemas",
  part: "Data & Auth",
  estMinutes: 12,
  summary:
    "Real FastAPI codebases keep three models per resource — an input schema, a SQLAlchemy model, and an output schema — converted at the boundary with ConfigDict(from_attributes=True).",

  concept: `
You now have two model systems in one app: Pydantic models validating the HTTP
boundary and SQLAlchemy models mapping the database. The pattern that
structures almost every production FastAPI codebase is to keep them separate
and give each resource **three models**:

\`\`\`python
# schemas.py — the API contract (Pydantic)
from pydantic import BaseModel, ConfigDict

class UserCreate(BaseModel):        # INPUT: what clients may send
    email: str
    password: str                   # plaintext arrives here, once

class UserPublic(BaseModel):        # OUTPUT: what clients may see
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_active: bool                 # note: NO password field of any kind
\`\`\`

\`\`\`python
# models.py — the storage shape (SQLAlchemy)
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    hashed_password: Mapped[str]    # never in any Pydantic schema
    is_active: Mapped[bool] = mapped_column(default=True)
\`\`\`

### from_attributes: reading objects, not dicts

By default \`model_validate()\` expects a dict. An ORM row isn't a dict — its
data lives in **attributes** (\`user.email\`, not \`user["email"]\`). Setting
\`model_config = ConfigDict(from_attributes=True)\` tells Pydantic to read each
declared field with \`getattr\`, so \`UserPublic.model_validate(db_user)\` just
works. (Pydantic v1 called this \`orm_mode = True\` — if an interviewer or an
old codebase says "ORM mode", this is the v2 spelling.)

The payoff: combined with \`response_model\`, you can **return the ORM object
directly** from an endpoint:

\`\`\`python
@router.get("/users/{user_id}", response_model=UserPublic)
def read_user(user_id: int, db: SessionDep) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user   # FastAPI runs UserPublic.model_validate(user) for you
\`\`\`

The row has a \`hashed_password\` attribute; the response doesn't, because
\`response_model\` filters to exactly the schema's fields. The schema is a
whitelist at the exit door.

### PATCH: exclude_unset

For partial updates, the input schema makes every field optional, and
\`model_dump(exclude_unset=True)\` returns **only the keys the client actually
sent** — so you can distinguish "field omitted" from "field set to None":

\`\`\`python
@router.patch("/users/{user_id}", response_model=UserPublic)
def update_user(user_id: int, patch: UserUpdate, db: SessionDep):
    user = db.get(User, user_id)
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
\`\`\`

### "But the fields repeat!"

Yes — \`email\` appears in three places, and that's the point. The duplication
is the **decoupling**: the DB schema and the API contract can now evolve
independently. Rename a column without breaking clients; add \`hashed_password\`
to storage without it ever being exposable; version the API without migrating
the database. It's exactly the DTO-vs-entity argument from Doctrine: you don't
serialise entities to the wire, you map them through DTOs — Pydantic just
makes the mapping one method call.

If the repetition genuinely hurts, **SQLModel** (by FastAPI's author) merges
Pydantic and SQLAlchemy into one class hierarchy. Worth knowing it exists, but
the two-library pattern dominates the codebases you'll be hired into — learn
it first.
`,

  comparisons: [
    {
      label: "Entity vs DTO — the same boundary discipline",
      intro:
        "Both sides refuse to serialise the storage object directly: Doctrine entities go through a DTO, SQLAlchemy rows go through a Pydantic schema. The response never learns the password hash exists.",
      php: `<?php
// Doctrine entity + hand-written DTO
#[ORM\\Entity]
class User
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    public int $id;
    #[ORM\\Column(unique: true)]
    public string $email;
    #[ORM\\Column]
    public string $hashedPassword; // never expose
}

final class UserDto implements JsonSerializable
{
    public function __construct(
        public readonly int $id,
        public readonly string $email,
    ) {}

    public static function fromEntity(User $u): self
    {
        return new self($u->id, $u->email); // manual mapping
    }

    public function jsonSerialize(): array
    {
        return ['id' => $this->id, 'email' => $this->email];
    }
}`,
      ts: `# schemas.py + endpoint — mapping is one config flag
from pydantic import BaseModel, ConfigDict

class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    # no hashed_password field -> can never leak

@router.get("/users/{user_id}", response_model=UserPublic)
def read_user(user_id: int, db: SessionDep):
    user = db.get(User, user_id)     # SQLAlchemy row
    if user is None:
        raise HTTPException(404, detail="User not found")
    return user
    # FastAPI: UserPublic.model_validate(user)
    # reads id/email via getattr, drops everything else`,
      note: "from_attributes=True replaces the fromEntity() boilerplate: Pydantic reads the declared fields off the object's attributes, and response_model applies the schema as an output whitelist.",
    },
    {
      label: "Create flow: input schema in, ORM model stored, output schema back",
      intro:
        "POST /users receives a UserCreate, stores a SQLAlchemy User (hashing the password on the way), and returns a UserPublic. Three models, one request.",
      php: `<?php
// Laravel: FormRequest in, Eloquent model stored,
// API Resource out — the same three-layer split
class StoreUserRequest extends FormRequest
{
    public function rules(): array
    {
        return ['email' => 'required|email',
                'password' => 'required|min:8'];
    }
}

public function store(StoreUserRequest $request)
{
    $user = User::create([
        'email' => $request->email,
        'password' => Hash::make($request->password),
    ]);
    return new UserResource($user); // shapes the output
}`,
      ts: `# routers/users.py
@router.post("/users", response_model=UserPublic,
             status_code=201)
def create_user(payload: UserCreate, db: SessionDep):
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)   # load the generated id
    return user        # -> UserPublic on the wire`,
      note: "UserCreate ≈ FormRequest, User ≈ Eloquent model, UserPublic ≈ API Resource. The plaintext password exists only inside this function; storage gets the hash, the response gets neither.",
    },
    {
      label: "Partial update with exclude_unset",
      intro:
        "PATCH sends only the fields to change. Both sides must distinguish 'not sent' from 'sent as null' — Laravel with validated(), Pydantic with exclude_unset.",
      php: `<?php
// Laravel PATCH: only validated, present fields
public function update(UpdateUserRequest $request,
                       User $user)
{
    // validated() returns only fields that were
    // present in the request AND passed rules
    $user->fill($request->validated());
    $user->save();
    return new UserResource($user);
}`,
      ts: `# All fields optional on the update schema
class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None

@router.patch("/users/{user_id}",
              response_model=UserPublic)
def update_user(user_id: int, patch: UserUpdate,
                db: SessionDep):
    user = db.get(User, user_id)
    updates = patch.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user`,
      note: "exclude_unset=True returns only keys the client actually sent — an omitted field is untouched, while an explicit null would come through as None. Without it, every PATCH would overwrite unmentioned fields with defaults.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "from_attributes=True in miniature: a converter that reads schema fields off an ORM-ish object with getattr, drops hashed_password, then applies a PATCH exclude_unset-style. Predict what the response JSON contains before running.",
    code: `# Pydantic's from_attributes=True in miniature: build an API response
# from an ORM row by reading ATTRIBUTES, keeping only the schema's fields.
import json
from dataclasses import dataclass, fields, asdict


class UserRow:
    """Stand-in for a SQLAlchemy model instance (a loaded DB row)."""
    def __init__(self):
        self.id = 7
        self.email = "ada@example.com"
        self.full_name = "Ada Lovelace"
        self.hashed_password = "$argon2id$v=19$m=65536..."  # must NEVER leak
        self.is_active = True


@dataclass
class UserPublic:
    """Stand-in for the Pydantic output schema."""
    id: int
    email: str
    full_name: str
    is_active: bool

    @classmethod
    def model_validate(cls, obj):
        # from_attributes=True: read each SCHEMA field off the object
        # with getattr. Fields the schema doesn't declare simply
        # never make it across the boundary.
        return cls(**{f.name: getattr(obj, f.name) for f in fields(cls)})


row = UserRow()
public = UserPublic.model_validate(row)

print("ORM row attrs :", sorted(vars(row)))
print("schema fields :", [f.name for f in fields(UserPublic)])
print("response JSON :", json.dumps(asdict(public)))
print("password leaked?", "hashed_password" in asdict(public))

# PATCH in miniature: model_dump(exclude_unset=True) means
# "only the keys the client actually sent" — apply just those.
patch = {"full_name": "Ada King"}  # client sent ONE field
for key, value in patch.items():
    setattr(row, key, value)
print("after PATCH   :", json.dumps(asdict(UserPublic.model_validate(row))))`,
    output: `ORM row attrs : ['email', 'full_name', 'hashed_password', 'id', 'is_active']
schema fields : ['id', 'email', 'full_name', 'is_active']
response JSON : {"id": 7, "email": "ada@example.com", "full_name": "Ada Lovelace", "is_active": true}
password leaked? False
after PATCH   : {"id": 7, "email": "ada@example.com", "full_name": "Ada King", "is_active": true}`,
  },

  keyPoints: [
    "The three-model pattern: `UserCreate` (Pydantic input), `User` (SQLAlchemy storage), `UserPublic` (Pydantic output) — the same resource, three contracts.",
    "`model_config = ConfigDict(from_attributes=True)` lets `model_validate()` read object attributes instead of dict keys — it replaced Pydantic v1's `orm_mode = True`.",
    "With `response_model=UserPublic` you return the ORM object directly; FastAPI converts it and the schema acts as an output whitelist — `hashed_password` can't leak because the schema never declares it.",
    "For PATCH, make update-schema fields optional and apply `patch.model_dump(exclude_unset=True)` — only the keys the client actually sent, so omitted fields are untouched.",
    "The field duplication IS the decoupling: DB schema and API contract evolve independently — the same argument as DTOs vs Doctrine entities.",
    "SQLModel merges Pydantic and SQLAlchemy into one class, but the two-library pattern dominates production codebases — know it exists, learn the split first.",
  ],

  interview: [
    {
      q: "Why do FastAPI projects define separate Pydantic and SQLAlchemy models for the same resource? Isn't that duplication?",
      a: "It's deliberate duplication that buys decoupling. The SQLAlchemy model is the storage shape, the Pydantic schemas are the API contract — input and output separately. That lets each evolve independently: I can rename a column without breaking clients, and sensitive columns like hashed_password simply don't exist on the output schema, so they physically cannot leak through a response. It's the same discipline as DTOs versus entities in Doctrine — you never serialise the entity to the wire. Pydantic makes the mapping nearly free: ConfigDict(from_attributes=True) plus response_model means I return the ORM object and FastAPI converts it at the boundary.",
    },
    {
      q: "What does from_attributes=True do, and what was it called in Pydantic v1?",
      a: "By default model_validate() expects a mapping — dict keys. An ORM row carries its data in attributes, so from_attributes=True tells Pydantic to read each declared field with getattr instead. That's what allows UserPublic.model_validate(db_user), and what makes response_model work when an endpoint returns a SQLAlchemy object directly. In Pydantic v1 it was orm_mode = True inside class Config; v2 moved it to model_config = ConfigDict(from_attributes=True). I'd flag the rename in a code review because v1 spellings still run with deprecation warnings, so they linger in old codebases.",
    },
    {
      q: "How do you implement a PATCH endpoint correctly with Pydantic?",
      a: "The update schema makes every field optional with None defaults, and in the endpoint I call patch.model_dump(exclude_unset=True), which returns only the fields the client actually included in the request body. Then I setattr those onto the loaded ORM object and commit. The key subtlety is the three-way distinction: field omitted (don't touch it), field sent with a value (update it), field explicitly sent as null (set it to None). Without exclude_unset, dumping the model would emit every field with its default and a PATCH would silently null out columns the client never mentioned.",
    },
  ],

  quiz: [
    {
      question:
        "An endpoint with response_model=UserPublic returns a SQLAlchemy User object that has a hashed_password attribute. What happens?",
      options: [
        "A 500 error — ORM objects can't be serialised",
        "The full row including hashed_password is serialised",
        "FastAPI validates the object against UserPublic and the response contains only UserPublic's declared fields",
        "It works only if User inherits from BaseModel",
      ],
      answerIndex: 2,
      explain:
        "With from_attributes=True on UserPublic, FastAPI effectively runs UserPublic.model_validate(user), reading declared fields via getattr. The schema is a whitelist: hashed_password isn't declared, so it never reaches the wire.",
    },
    {
      question: "What is the Pydantic v2 equivalent of v1's orm_mode = True?",
      options: [
        "model_config = ConfigDict(from_attributes=True)",
        "model_config = ConfigDict(orm_mode=True)",
        "class Config: from_attributes = True",
        "@model_validator(mode='orm')",
      ],
      answerIndex: 0,
      explain:
        "v2 renamed orm_mode to from_attributes and moved configuration from the inner class Config to model_config = ConfigDict(...). The old spellings run with deprecation warnings, which is why you still see them in legacy code.",
    },
    {
      question:
        "In a PATCH endpoint, why call patch.model_dump(exclude_unset=True) instead of patch.model_dump()?",
      options: [
        "It's faster because it skips validation",
        "It returns only the fields the client actually sent, so omitted fields aren't overwritten with defaults",
        "It excludes fields whose value is None from the response",
        "It prevents SQL injection in the setattr loop",
      ],
      answerIndex: 1,
      explain:
        "exclude_unset filters to keys present in the incoming request. A plain model_dump() would include every optional field with its None default, and the update loop would null out columns the client never mentioned.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "oauth2-password-flow",
  title: "Auth Part 1: OAuth2 Password Flow",
  part: "Data & Auth",
  estMinutes: 12,
  summary:
    "FastAPI's security tutorial arc: OAuth2PasswordBearer extracts the Bearer token as a dependency, a /token endpoint exchanges form-encoded credentials for a token, and passwords are stored only as hashes.",

  concept: `
Strip the OAuth2 jargon away and this is a pattern you already know from
Laravel Sanctum or Passport: **a login endpoint returns a token, and the
client sends it back on every request as \`Authorization: Bearer <token>\`**.
The OAuth2 "password flow" is just that pattern, formalised in a spec —
FastAPI gives you the pieces and wires them into OpenAPI.

### OAuth2PasswordBearer: token extraction as a dependency

\`\`\`python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.get("/items/")
async def read_items(token: Annotated[str, Depends(oauth2_scheme)]):
    return {"token": token}
\`\`\`

\`oauth2_scheme\` is a callable dependency. Per request it reads the
\`Authorization\` header, checks it's \`Bearer <something>\`, and hands you the
token string. If the header is missing or malformed, it **responds 401 for
you**, with a \`WWW-Authenticate: Bearer\` header (the spec-mandated way of
saying "authenticate like this"). \`tokenUrl="token"\` doesn't create anything —
it declares *where clients get tokens* so the OpenAPI schema (and Swagger UI)
know about it.

### The /token endpoint

\`\`\`python
from fastapi.security import OAuth2PasswordRequestForm

@app.post("/token")
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]):
    user = users_db.get(form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401,
                            detail="Incorrect username or password",
                            headers={"WWW-Authenticate": "Bearer"})
    return {"access_token": user.username, "token_type": "bearer"}
\`\`\`

Two things surprise people. First, credentials arrive as **form data**
(\`application/x-www-form-urlencoded\` with \`username\` and \`password\` fields),
not JSON — because the OAuth2 spec says so, and following it is what makes
standard clients and Swagger UI work unmodified. Second, the response must
contain \`access_token\` and \`token_type: "bearer"\` — also spec. (The token here
is a placeholder; the JWT section makes it real.)

Because the scheme is declared in OpenAPI, \`/docs\` grows an **Authorize**
button automatically: Swagger UI posts your credentials to \`tokenUrl\`, stores
the token, and attaches the Bearer header to every "Try it out" request.

### Hashing: never store plaintext

Store only a **hash** of the password, made with a real password-hashing
algorithm — bcrypt or Argon2, via a helper library. Current FastAPI docs use
\`pwdlib\` (\`PasswordHash.recommended()\` → Argon2); many existing codebases use
\`passlib\` with bcrypt — same idea, same two functions:

\`\`\`python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()

def get_password_hash(password: str) -> str:
    return password_hash.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return password_hash.verify(plain, hashed)
\`\`\`

These algorithms are *deliberately slow* and salt every hash randomly — that's
the point; \`sha256\` alone is not a password hash. One production nicety from
the official tutorial: when the username doesn't exist, verify against a dummy
hash anyway, so response timing doesn't reveal which usernames are real. And
return the **same error message** for unknown user and wrong password —
"Incorrect username or password" — for the same reason.
`,

  comparisons: [
    {
      label: "Token extraction: middleware guard vs dependency",
      intro:
        "Both read the Authorization header and reject requests without a valid Bearer token. PHP does it in middleware; FastAPI does it with a declared, OpenAPI-visible dependency.",
      php: `<?php
// PSR-15-style middleware: parse the header by hand
class BearerTokenMiddleware implements MiddlewareInterface
{
    public function process(Request $request,
                            Handler $handler): Response
    {
        $header = $request->getHeaderLine('Authorization');
        if (!str_starts_with($header, 'Bearer ')) {
            return new JsonResponse(
                ['message' => 'Unauthenticated'],
                401,
                ['WWW-Authenticate' => 'Bearer'],
            );
        }
        $token = substr($header, 7);
        return $handler->handle(
            $request->withAttribute('token', $token)
        );
    }
}`,
      ts: `# FastAPI: the extraction IS a dependency
from typing import Annotated
from fastapi import Depends, FastAPI
from fastapi.security import OAuth2PasswordBearer

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.get("/items/")
async def read_items(
    token: Annotated[str, Depends(oauth2_scheme)],
):
    # Missing/malformed header never reaches here:
    # oauth2_scheme already answered 401 with
    # WWW-Authenticate: Bearer.
    return {"token": token}`,
      note: "Same behaviour, but the FastAPI version is declarative: because OAuth2PasswordBearer is a security scheme, it lands in the OpenAPI document and Swagger UI grows an Authorize button — the middleware version is invisible to the docs.",
    },
    {
      label: "The login endpoint",
      intro:
        "Exchange credentials for a token. Laravel Sanctum issues a personal access token from JSON; the OAuth2 password flow takes form-encoded username/password because the spec demands that exact shape.",
      php: `<?php
// Laravel Sanctum-style token login (JSON body)
public function login(Request $request)
{
    $request->validate([
        'email' => 'required|email',
        'password' => 'required',
    ]);

    $user = User::where('email', $request->email)->first();
    if (!$user ||
        !Hash::check($request->password, $user->password)) {
        return response()->json(
            ['message' => 'Invalid credentials'], 401);
    }

    return response()->json([
        'token' => $user->createToken('api')->plainTextToken,
    ]);
}`,
      ts: `# POST /token — form data, spec-shaped response
from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

@app.post("/token")
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm,
                         Depends()],
):
    user = get_user(users_db, form_data.username)
    if not user or not verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": user.username,
            "token_type": "bearer"}`,
      note: "OAuth2PasswordRequestForm reads application/x-www-form-urlencoded fields named exactly username and password, and the response must carry access_token + token_type — that spec compliance is what lets Swagger UI's Authorize dialog log in against your endpoint unmodified.",
    },
    {
      label: "Password hashing helpers",
      intro:
        "Both store only hashes and verify on login. PHP has password_hash/password_verify built in; Python uses a library — pwdlib in the current FastAPI docs, passlib in many existing codebases.",
      php: `<?php
// Built into PHP since 5.5
$hash = password_hash($plain, PASSWORD_BCRYPT);
// => $2y$10$... (random salt embedded in the hash)

if (password_verify($input, $hash)) {
    // logged in
}`,
      ts: `# pip install "pwdlib[argon2]"
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2

hashed = password_hash.hash("correct horse")
# => $argon2id$v=19$m=65536,... (salt embedded)

if password_hash.verify("correct horse", hashed):
    ...  # logged in`,
      note: "Identical model to password_hash()/password_verify(): slow-by-design algorithm, random salt embedded in the output string. Older FastAPI tutorials (and many jobs' codebases) use passlib's CryptContext with bcrypt — same two operations.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "The /token endpoint's core logic with a deterministic stand-in hasher (clearly NOT a real password hash — real ones are slow and randomly salted). Predict all three login outcomes, including which ones share an error message.",
    code: `# The /token endpoint in miniature: verify a password against a stored
# hash, return a token dict on success or a 401 error dict on failure.
import hashlib

# DEMO ONLY: a deterministic stand-in for pwdlib/bcrypt/Argon2.
# Real hashers use a RANDOM per-password salt and are deliberately slow;
# a plain fixed-salt sha256 is NOT a password hash. Never ship this.
SALT = "demo-fixed-salt"


def fake_hash(password: str) -> str:
    return "fake$" + hashlib.sha256((SALT + password).encode()).hexdigest()[:16]


def verify_password(plain: str, hashed: str) -> bool:
    return fake_hash(plain) == hashed


# The "users table": only the HASH is stored, never the password.
users_db = {
    "ada": {"username": "ada", "hashed_password": fake_hash("correct horse"), "disabled": False},
}


def login(username: str, password: str) -> dict:
    user = users_db.get(username)
    if user is None or not verify_password(password, user["hashed_password"]):
        # Same message for both failures: don't reveal which part was wrong.
        return {
            "status": 401,
            "headers": {"WWW-Authenticate": "Bearer"},
            "body": {"detail": "Incorrect username or password"},
        }
    return {
        "status": 200,
        "body": {"access_token": "token-for-" + username, "token_type": "bearer"},
    }


print("stored hash :", users_db["ada"]["hashed_password"])
print("good login  :", login("ada", "correct horse"))
print("bad password:", login("ada", "hunter2"))
print("no such user:", login("mallory", "anything"))`,
    output: `stored hash : fake$cb204519aa42b0ac
good login  : {'status': 200, 'body': {'access_token': 'token-for-ada', 'token_type': 'bearer'}}
bad password: {'status': 401, 'headers': {'WWW-Authenticate': 'Bearer'}, 'body': {'detail': 'Incorrect username or password'}}
no such user: {'status': 401, 'headers': {'WWW-Authenticate': 'Bearer'}, 'body': {'detail': 'Incorrect username or password'}}`,
  },

  keyPoints: [
    "The OAuth2 password flow is the familiar Sanctum pattern formalised: POST credentials to a token endpoint, get a token, send `Authorization: Bearer <token>` thereafter.",
    "`OAuth2PasswordBearer(tokenUrl=\"token\")` is a dependency that extracts the Bearer token and answers 401 with a `WWW-Authenticate: Bearer` header when it's missing or malformed.",
    "The `/token` endpoint takes `OAuth2PasswordRequestForm` — form-encoded `username`/`password`, because the OAuth2 spec requires that shape — and must return `access_token` + `token_type: \"bearer\"`.",
    "Because the scheme is declared in OpenAPI, Swagger UI's Authorize button works automatically against your token endpoint.",
    "Store only password hashes made by a real password hasher — current docs use pwdlib (Argon2 via `PasswordHash.recommended()`); passlib+bcrypt is common in existing codebases. Plain sha256 is not a password hash.",
    "Return the same 'Incorrect username or password' error for unknown users and wrong passwords (and verify against a dummy hash for unknown users) so responses don't reveal which usernames exist.",
  ],

  interview: [
    {
      q: "Walk me through how FastAPI implements the OAuth2 password flow.",
      a: "Two pieces. OAuth2PasswordBearer(tokenUrl='token') is a dependency I attach to protected endpoints: per request it pulls the token from the Authorization: Bearer header and returns it, or short-circuits with a 401 and a WWW-Authenticate: Bearer header if it's absent. Separately, the /token endpoint takes OAuth2PasswordRequestForm — form-encoded username and password, since that's the shape the OAuth2 spec mandates — verifies the password against the stored hash, and returns {access_token, token_type: 'bearer'}. Because OAuth2PasswordBearer is a declared security scheme, it flows into the OpenAPI document, so Swagger UI gets a working Authorize button for free. It's the same token pattern as Laravel Sanctum, just spec-shaped.",
    },
    {
      q: "Why does the login endpoint take form data instead of JSON?",
      a: "Because the OAuth2 specification defines the password grant as an application/x-www-form-urlencoded POST with fields named exactly username and password, and a response containing access_token and token_type. FastAPI's OAuth2PasswordRequestForm just models that contract. Sticking to the spec is what makes generic OAuth2 clients — and Swagger UI's Authorize dialog — work against the endpoint with zero custom code. If I control both ends and don't need spec compliance, I could accept JSON, but then I'd be writing a bespoke login, not the OAuth2 flow.",
    },
    {
      q: "How do you store and verify passwords securely in a Python API?",
      a: "Never plaintext, and never a fast general-purpose hash like plain sha256 — I store the output of a dedicated password-hashing algorithm, bcrypt or preferably Argon2, via a library: pwdlib's PasswordHash.recommended() in current FastAPI docs, or passlib's CryptContext in older codebases. These are deliberately slow and embed a random per-password salt in the hash string, which defeats rainbow tables and brute force at scale — the same guarantees as PHP's password_hash()/password_verify(). On login I verify the submitted password against the stored hash, return an identical 'incorrect username or password' error whether the user exists or not, and run a dummy verification for unknown usernames so timing doesn't leak which accounts are real.",
    },
  ],

  quiz: [
    {
      question:
        "What does OAuth2PasswordBearer(tokenUrl=\"token\") actually do when used as a dependency?",
      options: [
        "It creates the /token endpoint automatically",
        "It extracts the Bearer token from the Authorization header, returning 401 with WWW-Authenticate if it's missing, and declares the scheme in OpenAPI",
        "It validates the JWT signature and expiry",
        "It hashes incoming passwords before they reach the endpoint",
      ],
      answerIndex: 1,
      explain:
        "OAuth2PasswordBearer only extracts and hands you the raw token string (validating it is your job, e.g. JWT decode). tokenUrl declares where clients obtain tokens — it doesn't create that endpoint; you write /token yourself.",
    },
    {
      question: "Why do credentials arrive at /token as form data rather than JSON?",
      options: [
        "Form data is more secure than JSON over HTTPS",
        "FastAPI can't validate JSON on POST endpoints",
        "The OAuth2 spec defines the password grant as form-encoded username/password fields",
        "Swagger UI can only send form data",
      ],
      answerIndex: 2,
      explain:
        "It's pure spec compliance: OAuth2 mandates application/x-www-form-urlencoded with those exact field names, plus an access_token/token_type response. That's what lets standard clients and Swagger UI's Authorize dialog work unmodified.",
    },
    {
      question: "Which of these is an acceptable way to store user passwords?",
      options: [
        "AES-encrypted with the app's SECRET_KEY, so they can be decrypted for support",
        "sha256(password) — it's a one-way hash after all",
        "An Argon2 or bcrypt hash with a random per-password salt, via pwdlib or passlib",
        "Plaintext, as long as the database is access-controlled",
      ],
      answerIndex: 2,
      explain:
        "Only dedicated password hashers qualify: slow by design and randomly salted. Encryption is reversible (anyone with the key gets every password), and plain sha256 is so fast that leaked hashes fall to brute force and rainbow tables.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "jwt-tokens",
  title: "Auth Part 2: JWT Access Tokens",
  part: "Data & Auth",
  estMinutes: 13,
  summary:
    "JWTs make the token real: a signed (not encrypted) header.payload.signature structure carrying sub and exp claims, created with PyJWT and validated in get_current_user — stateless, unlike PHP sessions.",

  concept: `
The password-flow section returned a placeholder token. Production uses a
**JWT** (JSON Web Token): three base64url segments joined by dots —
\`header.payload.signature\`. The header names the algorithm, the payload
carries **claims** (\`sub\` = subject/user id, \`exp\` = expiry timestamp), and
the signature is an HMAC (or RSA signature) over the first two parts.

The one fact interviews always probe: a JWT is **signed, not encrypted**.
Anyone who holds the token can base64-decode the payload and read every claim
— no key required. The signature only proves the token wasn't *modified* and
was issued by someone holding the key. So: never put secrets in claims, and
never trust a claim you haven't verified the signature for.

### Creating tokens (PyJWT)

Current FastAPI docs use **PyJWT** (\`pip install pyjwt\`; older tutorials used
python-jose):

\`\`\`python
from datetime import datetime, timedelta, timezone
import jwt

SECRET_KEY = settings.secret_key   # openssl rand -hex 32
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
\`\`\`

The login endpoint calls
\`create_access_token(data={"sub": user.username}, expires_delta=...)\`. The
\`SECRET_KEY\` comes from your pydantic-settings config, generated once with
\`openssl rand -hex 32\` — never hard-coded, never committed.

**HS256 vs RS256, in one line:** HS256 signs and verifies with one shared
secret (fine when the same app does both); RS256 signs with a private key and
verifies with a public one (for when other services must verify tokens they
can't be trusted to mint).

### Validating in get_current_user

\`\`\`python
from jwt.exceptions import InvalidTokenError

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    user = get_user(fake_users_db, username=username)
    if user is None:
        raise credentials_exception
    return user
\`\`\`

\`jwt.decode\` verifies the signature **and** the \`exp\` claim; a tampered
payload, wrong key, or expired token all raise \`InvalidTokenError\`. Every
failure path raises the *same* 401 — don't tell attackers which check failed.
Note \`algorithms=[ALGORITHM]\` is a list you pin explicitly: never let the
token's own header choose the algorithm.

### Stateless — the big shift from PHP sessions

PHP's default is \`$_SESSION\`: the server stores state, the client holds only a
session id cookie, and logout is trivial (delete the server record). JWTs
invert this: **all state lives in the token**, the server stores nothing. Any
worker — any *server* — holding \`SECRET_KEY\` can validate a request, which is
why JWTs scale horizontally so well. The price is **revocation**: you can't
"delete" a token you never stored. That's why \`exp\` matters — a stolen token
is only valid until expiry — and why the standard follow-up answer is:
short-lived access tokens (minutes) plus refresh tokens, or a denylist of
revoked token ids checked on each request (which quietly reintroduces server
state).
`,

  comparisons: [
    {
      label: "Server-side session vs stateless token",
      intro:
        "Both authenticate request N+1 after a login on request N. PHP stores the state server-side and hands out a pointer; JWT hands out the state itself, signed.",
      php: `<?php
// Classic PHP: state lives ON THE SERVER
session_start();

// login:
$_SESSION['user_id'] = $user->id;
// client gets only PHPSESSID=abc123 (a pointer)

// later request:
session_start();               // loads the stored state
$userId = $_SESSION['user_id'] ?? null;

// logout — trivial, because the server owns the state:
session_destroy();`,
      ts: `# JWT: state lives IN THE TOKEN, server stores nothing
import jwt

# login:
token = jwt.encode(
    {"sub": str(user.id), "exp": expire},
    SECRET_KEY, algorithm="HS256",
)
# client gets the whole (signed) state

# later request — ANY worker/server with the key:
payload = jwt.decode(token, SECRET_KEY,
                     algorithms=["HS256"])
user_id = payload["sub"]

# "logout"? Nothing server-side to delete —
# the token stays valid until exp.`,
      note: "Sessions need sticky storage (files/Redis) shared across PHP-FPM workers; JWTs need only the key, so any instance validates any request — but revocation goes from session_destroy() to a hard problem (short exp + refresh tokens, or a denylist).",
    },
    {
      label: "Minting the token at login",
      intro:
        "The /token endpoint from the password flow, upgraded: instead of a placeholder it returns a signed JWT with sub and exp claims.",
      php: `<?php
// firebase/php-jwt — the same idea in PHP
use Firebase\\JWT\\JWT;

$payload = [
    'sub' => (string) $user->id,
    'exp' => time() + 60 * 30,   // 30 minutes
];
$token = JWT::encode($payload, $secretKey, 'HS256');

return response()->json([
    'access_token' => $token,
    'token_type' => 'bearer',
]);`,
      ts: `# routers/auth.py
from datetime import timedelta

@app.post("/token")
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm,
                         Depends()],
) -> Token:
    user = authenticate_user(
        fake_users_db, form_data.username,
        form_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"})
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token,
                 token_type="bearer")`,
      note: "sub (subject) and exp (expiry) are registered claim names from the JWT spec — use them rather than inventing user_id/expires keys, because jwt.decode enforces exp automatically only if the claim is spelled exp.",
    },
    {
      label: "Validating on every request",
      intro:
        "Decode, verify signature and expiry, load the user — and collapse every failure into one identical 401.",
      php: `<?php
use Firebase\\JWT\\JWT;
use Firebase\\JWT\\Key;

try {
    $payload = JWT::decode(
        $token, new Key($secretKey, 'HS256'));
    // throws on bad signature OR past exp
    $user = $repo->find($payload->sub);
    if ($user === null) {
        throw new UnexpectedValueException('no user');
    }
} catch (Exception $e) {
    return new JsonResponse(
        ['message' => 'Could not validate credentials'],
        401, ['WWW-Authenticate' => 'Bearer']);
}`,
      ts: `# deps.py
from jwt.exceptions import InvalidTokenError

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY,
                             algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception
    user = get_user(fake_users_db, username=username)
    if user is None:
        raise credentials_exception
    return user`,
      note: "One credentials_exception reused for every failure mode (bad signature, expired, missing sub, unknown user) — a distinct message per failure would tell an attacker exactly which hurdle they cleared. Pin algorithms=[...] yourself; never trust the token header's alg.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "A real HS256 JWT built with only the stdlib: encode a fixed payload, decode the payload WITHOUT the key (signed ≠ encrypted!), then tamper with the claims and watch verification fail. Predict which steps need SECRET_KEY.",
    code: `# A real HS256 JWT built from scratch: header.payload.signature,
# each part base64url. Encode, verify, then tamper and watch it fail.
import base64
import hashlib
import hmac
import json

SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sign(signing_input: bytes) -> str:
    return b64url(hmac.new(SECRET_KEY.encode(), signing_input, hashlib.sha256).digest())


def jwt_encode(payload: dict) -> str:
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(payload, separators=(",", ":")).encode())
    return header + "." + body + "." + sign((header + "." + body).encode())


def jwt_decode(token: str) -> dict:
    header, body, signature = token.split(".")
    expected = sign((header + "." + body).encode())
    if not hmac.compare_digest(signature, expected):
        raise ValueError("signature mismatch")
    padded = body + "=" * (-len(body) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


payload = {"sub": "ada", "exp": 1893456000}  # exp fixed: 2030-01-01 UTC
token = jwt_encode(payload)
print("token  :", token)
print("payload:", jwt_decode(token))

# Anyone can READ the payload without the key — it's just base64url:
body = token.split(".")[1]
print("no key :", base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)).decode())

# Tamper: swap sub to "root", keep the original signature.
header, _, signature = token.split(".")
forged_body = b64url(json.dumps({"sub": "root", "exp": 1893456000}, separators=(",", ":")).encode())
try:
    jwt_decode(header + "." + forged_body + "." + signature)
except ValueError as exc:
    print("forged :", exc, "-> 401 credentials_exception")`,
    output: `token  : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZGEiLCJleHAiOjE4OTM0NTYwMDB9.mghpgNXI8yE4lULuBIym-dDRpOq1qAQTeeATQZgrPwg
payload: {'sub': 'ada', 'exp': 1893456000}
no key : {"sub":"ada","exp":1893456000}
forged : signature mismatch -> 401 credentials_exception`,
  },

  keyPoints: [
    "A JWT is `header.payload.signature`, each part base64url — **signed, not encrypted**: anyone can read the claims, only the key-holder can mint or alter them undetected.",
    "Create tokens with PyJWT: `jwt.encode({\"sub\": username, \"exp\": expire}, SECRET_KEY, algorithm=\"HS256\")` — `sub` and `exp` are the spec's registered claim names.",
    "`jwt.decode(token, SECRET_KEY, algorithms=[\"HS256\"])` verifies signature AND expiry, raising `InvalidTokenError` on any failure — map every failure to one identical 401 `credentials_exception`.",
    "HS256 = one shared secret signs and verifies; RS256 = private key signs, public key verifies (for tokens other services must check).",
    "`SECRET_KEY` comes from pydantic-settings, generated with `openssl rand -hex 32` — never hard-coded or committed.",
    "JWTs are stateless (any worker with the key validates any request — no shared session store like PHP's `$_SESSION`), but revocation is hard: mitigate with short `exp` plus refresh tokens or a denylist.",
  ],

  interview: [
    {
      q: "What's inside a JWT, and is it secure to put user data in one?",
      a: "Three base64url segments: a header naming the algorithm, a payload of claims — conventionally sub for the user identity and exp for expiry — and a signature over the first two parts, HMAC for HS256 or an RSA signature for RS256. The crucial nuance is that it's signed, not encrypted: anyone holding the token can base64-decode the payload and read everything, no key needed. So claims are fine for non-secret data like a user id or role, but never passwords, PII you wouldn't show the user, or API keys. The signature's only guarantee is integrity and authenticity — if verification passes, the token was minted by a key-holder and hasn't been altered.",
    },
    {
      q: "How does JWT auth differ from PHP-style server sessions, and what's the trade-off?",
      a: "Sessions keep state on the server — $_SESSION data in files or Redis — and give the client just a session id; JWTs push all state into the signed token and the server stores nothing. That statelessness is the win: any worker or any horizontally-scaled instance holding SECRET_KEY can validate a request, no shared session store, no sticky sessions. The cost is revocation: session_destroy() has no equivalent because there's nothing server-side to delete — a stolen token stays valid until exp. The standard mitigations are short-lived access tokens paired with refresh tokens, or a denylist of revoked token ids — while acknowledging a denylist reintroduces exactly the server state JWTs were meant to avoid.",
    },
    {
      q: "When would you choose RS256 over HS256?",
      a: "HS256 uses a single shared secret for both signing and verifying, so it's right when the same application mints and validates its own tokens — a typical FastAPI monolith. RS256 splits the roles: a private key signs, and anyone with the public key can verify. I'd reach for it when other parties must validate tokens they should never be able to mint — microservices verifying tokens from a central auth service, or third parties validating your tokens. Handing every microservice the HS256 secret would let any of them forge tokens; with RS256 they only ever hold the public key. Either way I pin algorithms=['...'] on decode and never let the token's own header pick the algorithm.",
    },
    {
      q: "Why does the exp claim matter so much for JWTs?",
      a: "Because it's the only expiry a stateless token has. There's no server-side record to delete, so a leaked or stolen token is valid until exp — full stop. Short expiries bound that damage window to minutes instead of forever, and jwt.decode enforces exp automatically, raising on expired tokens with no extra code. In practice you pair a short-lived access token with a longer-lived refresh token, so the user experience stays smooth while any individual bearer token is only briefly dangerous. Shipping a JWT without exp is an interview red flag — that token is a permanent credential.",
    },
  ],

  quiz: [
    {
      question: "A JWT's payload contains {\"sub\": \"ada\", \"role\": \"admin\"}. Who can read those claims?",
      options: [
        "Only servers holding SECRET_KEY",
        "Only the user the token was issued to",
        "Anyone holding the token — the payload is just base64url, not encrypted",
        "No one — the payload is hashed one-way",
      ],
      answerIndex: 2,
      explain:
        "JWTs are signed, not encrypted. The signature stops tampering and forgery, but the payload decodes with any base64 tool. That's why secrets never belong in claims — and why a tampered payload still fails verification.",
    },
    {
      question:
        "In get_current_user, why raise the same credentials_exception for a bad signature, an expired token, a missing sub, and an unknown user?",
      options: [
        "FastAPI only allows one exception per dependency",
        "Distinct errors would tell an attacker exactly which check they passed",
        "The exceptions must match for OpenAPI to document the 401",
        "InvalidTokenError can't be caught separately from other errors",
      ],
      answerIndex: 1,
      explain:
        "It's information-hygiene: 'expired token' confirms the token was once valid; 'unknown user' confirms the signature was fine. One uniform 401 'Could not validate credentials' (with WWW-Authenticate: Bearer) gives nothing away.",
    },
    {
      question: "What is the practical difference between HS256 and RS256?",
      options: [
        "RS256 encrypts the payload; HS256 only signs it",
        "HS256 uses one shared secret to sign and verify; RS256 signs with a private key and verifies with a public key",
        "HS256 is deprecated; RS256 is its replacement",
        "RS256 tokens cannot expire",
      ],
      answerIndex: 1,
      explain:
        "Both only sign — neither encrypts. The difference is key distribution: HS256's verifiers could also mint tokens (they hold the secret), while RS256 verifiers hold only the public key, which is why it suits microservices validating a central auth service's tokens.",
    },
    {
      question: "Your JWT-based API needs 'log out everywhere immediately'. What's the honest answer?",
      options: [
        "Call jwt.invalidate(token) on the server",
        "Delete the token from the database where PyJWT stores it",
        "Pure stateless JWTs can't be revoked early — you need short exp plus refresh tokens, or a server-side denylist, which reintroduces state",
        "Rotate SECRET_KEY per user on logout with no side effects",
      ],
      answerIndex: 2,
      explain:
        "Nothing is stored server-side, so there's nothing to delete — that's the flip side of statelessness. Short expiries bound the damage; a denylist (or rotating the global key, which logs out everyone) trades statelessness back for revocability.",
    },
  ],
};

export default lesson;

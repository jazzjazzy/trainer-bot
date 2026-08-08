import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 7,
  slug: "typing-the-contract",
  title: "Typing the Contract",
  part: "Contracts & Validation",
  estMinutes: 10,
  summary:
    "Request DTOs, response DTOs, and domain types are three different shapes — and a mapper at the edge is what stops your database schema from becoming your public API by accident.",

  concept: `
The quick-and-dirty PHP pattern is one shape for everything: fetch a row into
an associative array, pass that array around, \`json_encode\` it at the end.
It works — until you notice that your **database schema has silently become
your public API**. Every column you add ships to every client; every column
you rename breaks them.

Contract-first design splits that one shape into three:

### Three types, three jobs

- **Request DTO** — what clients are allowed to *send*. \`CreateUserRequest\`
  has \`email\` and \`name\`; it does not have \`id\`, \`role\`, or
  \`created_at\`, because clients don't get to choose those.
- **Domain / storage type** — what your code and database work with.
  \`UserRow\` mirrors the table: \`password_hash\`, \`failed_logins\`,
  \`stripe_customer_id\` — internal business.
- **Response DTO** — what you *promise* to return. \`UserResponse\` is the
  wire contract: \`id\`, \`email\`, \`createdAt\`. Nothing else, ever.

DTO ("data transfer object") is the term interviewers use for the edge shapes.
The point isn't ceremony — it's that these three shapes **change for different
reasons**. Storage changes when engineering needs it to; the response contract
changes only when you deliberately version the API.

### Why you never expose the row

\`SELECT *\` + \`json_encode($row)\` has three failure modes:

1. **Leaks**: \`password_hash\` or an internal flag ships to the client the
   day someone adds the column. This is a real, common breach pattern — the
   contract was implicit, so nobody reviewed the change against it.
2. **Accidental contract**: clients start depending on fields you never meant
   to promise. Now you can't remove them without breaking someone.
3. **Coupled naming**: your API speaks \`snake_case\` forever because the
   database does.

### The mapper: one door between storage and wire

\`\`\`ts
function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at, // rename at the edge
  };
}
\`\`\`

The explicit return type does the enforcement. TypeScript's **excess property
checks** reject \`password_hash: row.password_hash\` inside that object
literal — the field doesn't exist on \`UserResponse\`, so leaking it is a
compile error, not a code-review hope. Add a column to \`UserRow\` and nothing
reaches the wire until someone deliberately adds it to \`UserResponse\` *and*
the mapper. The contract change becomes a visible diff on the contract type.

This is the same discipline as a Laravel API Resource class
(\`UserResource::toArray()\`) — except here the compiler checks the shape
instead of trusting you.

### Where the types stop

Be honest about the limits, because interviewers probe this: these interfaces
are **compile-time only**. \`req.body as CreateUserRequest\` is a promise, not
a check — at runtime the body is whatever the client felt like sending. The
next section adds zod, which validates at runtime *and* generates these static
types from one schema, so the two halves can't drift apart.
`,

  comparisons: [
    {
      label: "PDO row straight to the wire vs a mapped response",
      intro:
        "GET /users/42 in both stacks. The PHP script encodes whatever the row happens to contain; the TS handler can only emit the declared response shape.",
      php: `<?php // user.php
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$_GET['id']]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

header('Content-Type: application/json');
// Ships EVERY column, today's and tomorrow's:
// {"id":42,"email":"ada@example.com",
//  "password_hash":"$2y$10$N9qo...",
//  "failed_logins":3,"stripe_customer_id":"cus_9xK"}
echo json_encode($row);`,
      ts: `// handlers/getUser.ts
interface UserRow {          // storage shape (the table)
  id: number;
  email: string;
  password_hash: string;
  failed_logins: number;
  created_at: string;
}

interface UserResponse {     // wire contract (the promise)
  id: number;
  email: string;
  createdAt: string;
}

function toUserResponse(row: UserRow): UserResponse {
  return { id: row.id, email: row.email, createdAt: row.created_at };
  // adding password_hash here is a COMPILE error
}

const row = await db.getUser(id);
sendJson(res, 200, toUserResponse(row));`,
      note: "The PHP version's contract is 'whatever SELECT * returns this week'. The TS version's contract is a named type — new columns stay private until someone deliberately adds them to UserResponse.",
    },
    {
      label: "An `any`-typed handler vs typed request/response generics",
      intro:
        "The same PUT /users/:id handler twice — both are TypeScript files, but only one of them lets the compiler see the contract.",
      php: `// handlers/updateUser.ts — TypeScript, technically
app.put("/users/:id", (req: any, res: any) => {
  // Wrong param name: undefined at runtime, no warning
  const id = req.params.userId;

  // Typo'd field: undefined at runtime, no warning
  const email = req.body.emial;

  // Response shape: whatever this happens to be
  res.json({ id, email, debug: process.env.NODE_ENV });
});`,
      ts: `// handlers/updateUser.ts — the contract in the signature
interface UserIdParams { id: string }
interface UpdateUserRequest { email: string }
interface UserResponse { id: string; email: string }

app.put<UserIdParams, UserResponse, UpdateUserRequest>(
  "/users/:id",
  (req, res) => {
    const { id } = req.params;   // { id: string } — userId is an error
    const { email } = req.body;  // UpdateUserRequest — emial is an error
    res.json({ id, email });     // must match UserResponse
  },
);`,
      note: "Express's type parameters (params, response body, request body) turn the handler signature into documentation the compiler enforces — but they're still compile-time only; runtime validation comes next section.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "What the client actually receives",
      intro:
        "The two payloads produced above, side by side. One is a leak wearing a 200 status; the other is a deliberate contract.",
      php: `{
  "id": 42,
  "email": "ada@example.com",
  "password_hash": "$2y$10$N9qo8uLOickgx2ZMRZoMye...",
  "failed_logins": 3,
  "stripe_customer_id": "cus_9xK2mQ",
  "created_at": "2026-05-01 09:30:00"
}`,
      ts: `{
  "id": 42,
  "email": "ada@example.com",
  "createdAt": "2026-05-01T09:30:00Z"
}`,
      note: "Beyond the leak: the left payload's snake_case and MySQL datetime format are now API commitments. The right one renamed and normalised at the edge, so storage can change freely.",
      leftLang: "json",
      rightLang: "json",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A storage row, a wire contract, and the mapper between them. Run it to see the naive vs mapped payloads — then uncomment the password_hash line inside toUserResponse and watch the compiler refuse the leak.",
    code: `// Storage shape vs wire shape: the mapper is the only door between them.

// What the database hands you (SELECT * FROM users):
interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  failed_logins: number;
  created_at: string;
}

// What the API promises clients — nothing more:
interface UserResponse {
  id: number;
  email: string;
  createdAt: string;
}

function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    // password_hash: row.password_hash,
    // ^ uncomment that line: the compiler rejects it —
    //   "'password_hash' does not exist in type 'UserResponse'"
  };
}

const row: UserRow = {
  id: 42,
  email: "ada@example.com",
  password_hash: "$2y$10$N9qo8uLOickgx2ZMRZoMye...",
  failed_logins: 3,
  created_at: "2026-05-01T09:30:00Z",
};

// The PHP habit — json_encode($row) — serialises EVERYTHING:
console.log("naive:  " + JSON.stringify(row));

// The mapped response leaks nothing and renames on the way out:
console.log("mapped: " + JSON.stringify(toUserResponse(row)));

// The wire contract is now explicit:
console.log("wire keys: " + Object.keys(toUserResponse(row)).join(", "));`,
  },

  keyPoints: [
    "Request DTO, domain/storage type, and response DTO are three shapes with three jobs — they change for different reasons, so they must be different types.",
    "`json_encode($row)` (or `res.json(row)`) makes your database schema your public API: new columns leak, existing columns become promises, snake_case becomes permanent.",
    "A `toUserResponse(row)` mapper with an explicit return type is the single door to the wire — excess property checks make leaking a field a compile error.",
    "Renaming and normalising happen at the edge (`created_at` → `createdAt`, MySQL datetime → ISO 8601), decoupling storage conventions from the wire format.",
    "Typed handler generics put the contract in the signature: wrong param names and typo'd body fields become compile errors instead of `undefined` at runtime.",
    "All of this is compile-time only — `as CreateUserRequest` validates nothing. Runtime enforcement (zod) is the other half of the contract.",
  ],

  interview: [
    {
      q: "Why shouldn't an API endpoint return the database row directly, and what do you do instead?",
      a: "Three reasons. First, leaks: the day someone adds a `password_hash` or an internal flag column, it ships to every client — the contract was implicit so nothing catches it. Second, accidental contract: clients bind to fields you never meant to promise, and now removing a column is a breaking API change. Third, coupling: your wire format inherits storage conventions like snake_case and database datetime formats forever. Instead I define an explicit response DTO — `UserResponse` — and a mapper like `toUserResponse(row)` with that return type. In TypeScript, excess property checks then make leaking a field a compile error, and any contract change is a visible diff on the DTO rather than a side effect of a migration. It's the same idea as a Laravel API Resource, with the compiler enforcing it.",
    },
    {
      q: "What's the difference between a request DTO and your domain type, and why not reuse one type for both?",
      a: "The request DTO is what clients are *allowed to send* — for user creation that's maybe `email` and `name`. The domain type is the full internal shape — `id`, `role`, `password_hash`, timestamps. If you reuse one type, you either mark everything optional (destroying its usefulness) or you implicitly accept client input for fields the client must never control, which is how mass-assignment vulnerabilities happen — the same bug PHP frameworks fought with `$fillable`/`$guarded` on Eloquent models. Separate types make the safe path the only path: the handler literally cannot read `role` off a `CreateUserRequest` because the field doesn't exist on the type.",
    },
    {
      q: "You've typed your request and response DTOs. Is the API contract now safe?",
      a: "At compile time, yes; at runtime, not at all — and I'd say exactly that in a design review. TypeScript types are erased when the code runs, so `req.body as CreateUserRequest` is an unchecked assertion: the client can send anything, and the handler will happily operate on it. The types protect against *our* mistakes — typos, leaked fields, drift between handler and contract — not against malicious or malformed input. The complete story is a runtime validator at the boundary, like a zod schema, ideally one that also *generates* the static type via `z.infer` so the runtime check and the compile-time type can never disagree.",
    },
  ],

  quiz: [
    {
      question:
        "A developer adds a `two_factor_secret` column to the users table. In the 'json_encode the row' architecture vs the mapper architecture, what happens to the API response?",
      options: [
        "Both architectures leak the new column until someone updates code",
        "The row-encoding API leaks it immediately; the mapped API ships nothing new until UserResponse and the mapper change",
        "Both are safe — databases don't affect API responses",
        "The mapped API crashes because UserRow no longer matches the table",
      ],
      answerIndex: 1,
      explain:
        "With json_encode($row) the schema IS the contract, so the secret ships with the next request. With a mapper returning an explicit UserResponse, the new column is invisible on the wire until someone deliberately adds it to the response type — the leak requires an intentional code change instead of happening by default.",
    },
    {
      question: "Why does `const user = req.body as CreateUserRequest` NOT protect the endpoint?",
      options: [
        "Because `as` casts are removed by tsc, so the code fails to compile",
        "Because TypeScript types don't exist at runtime — the assertion checks nothing about the actual payload",
        "Because req.body is always a string and must be JSON.parse'd first",
        "It does protect it — the cast validates the shape",
      ],
      answerIndex: 1,
      explain:
        "Type assertions are compile-time claims that are erased in the emitted JavaScript. At runtime req.body is whatever the client sent; the cast just silences the compiler. Runtime protection requires an actual validator (like a zod schema) executing on the payload.",
    },
    {
      question:
        "What TypeScript feature makes `return { ...fields, password_hash: row.password_hash }` fail inside a function declared to return UserResponse?",
      options: [
        "Excess property checks on object literals against the declared return type",
        "The `readonly` modifier on UserResponse",
        "Runtime reflection on the interface",
        "strictNullChecks",
      ],
      answerIndex: 0,
      explain:
        "When an object literal is checked against a target type, TypeScript rejects properties that don't exist on that type — that's the excess property check. Declaring the mapper's return type as UserResponse therefore turns 'leak an extra field' into a compile error. (There's no runtime reflection; interfaces are erased.)",
    },
  ],
};

export default lesson;

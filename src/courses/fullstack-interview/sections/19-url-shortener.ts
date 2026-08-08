import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 19,
  slug: "url-shortener",
  title: "Design a URL Shortener",
  part: "The Classic Questions",
  estMinutes: 13,
  summary:
    "The canonical warm-up design, walked end to end — requirements, API, data model, and the two decisions that matter: how you generate short codes and the fact that redirects are read-heavy, not storage-heavy.",

  concept: `
The URL shortener is the classic warm-up because it's small enough to finish
and rich enough to show method. **This section is the template for the four
designs that follow** — chat, feed, checkout, and the rest all run the same
loop: clarify **requirements**, sketch the **API**, choose a **data model**,
then reason about **scale**. Get the loop right here and the harder ones are
the same moves on bigger numbers.

### Step 1 — Requirements (ask before you draw)

Never start drawing boxes. Ask:

- **Core**: shorten a long URL to a short code; redirect the short code to the
  original. That's the whole product's spine.
- **Custom aliases?** Can users pick \`short.ly/my-brand\`, or only generated
  codes? (Changes the key-generation story.)
- **Analytics?** Do we count clicks / referrers? (Changes the redirect
  response and adds a write per redirect.)
- **Expiry?** Do links live forever or expire?
- **Scale**: how many new URLs per unit time, and — the number that actually
  matters — how many **redirects per second**?

### Step 2 — API

Two endpoints carry the product:

\`\`\`
POST /urls        { "url": "https://..." }  -> 201 { "code": "3n8Kf2" }
GET  /:code                                 -> 301/302 redirect to the URL
\`\`\`

Optional: \`POST /urls\` with a \`customAlias\`, \`GET /urls/:code/stats\` for
analytics.

### Step 3 — Data model and the key-generation decision

The table is nearly trivial: \`code -> url\`. The interesting decision is **how
you make the code**, and there are two schools:

- **Hash-and-truncate** — hash the URL, take the first few characters as the
  code. Sounds clever, but truncated hashes **collide**, and now every insert
  needs a collision check and a retry loop. It also can't guarantee a fixed
  short length as you grow.
- **Counter + base62** — keep a monotonic counter (a DB sequence / auto-id),
  and **base62-encode** the id into the code. Base62 is \`[0-9a-zA-Z]\`, 62
  symbols, so codes stay short and are **collision-free by construction** —
  each id maps to exactly one code. This is the strong answer. Custom aliases
  are just rows inserted with a chosen code and a uniqueness constraint.

### Step 4 — Scale (do the arithmetic)

This is where you sound senior. **Storage is a non-issue**: at 100M new URLs
per year, each row is maybe a few hundred bytes, so that's tens of gigabytes a
year — a rounding error. **Redirects are the number that matters**, because
they are massively **read-heavy**: a link is created once and followed
thousands of times. So the design centers on serving \`GET /:code\` fast:

- **Cache hot codes** in a Redis-style store — a tiny fraction of codes get
  the overwhelming majority of traffic, so the cache hit ratio is very high
  and the database barely sees redirects.
- **Index the code column** (or make it the primary key) so the rare cache
  miss is a single indexed point lookup, not a scan.

### The 301 vs 302 trade-off

A **301 (permanent)** redirect is cacheable by browsers and the CDN — fast and
cheap, but the browser stops asking your server, so you **lose click
analytics**. A **302 (found/temporary)** sends every click back through your
server — you can **count every redirect**, at the cost of more traffic and no
downstream caching. If analytics matter, 302; if raw speed matters and you
don't need per-click data, 301. Naming this trade-off unprompted is exactly
the senior signal the warm-up is testing for.
`,

  comparisons: [
    {
      label: "Hash-and-truncate vs counter + base62",
      intro:
        "Two ways to generate the short code. The weak version hashes the URL and truncates, ignoring collisions; the strong version base62-encodes a sequence id, which is collision-free by construction.",
      php: `// Weak: hash the URL, take the first 6 chars.
function makeCode(url: string): string {
  // Truncating a hash throws away bits, so two different
  // URLs can produce the SAME 6-char code. This code
  // doesn't even check for that - it just overwrites,
  // silently sending one link to the wrong destination.
  return sha256(url).slice(0, 6);
}

// To make it correct you'd need a collision check and a
// retry loop on every insert - and you still can't hold
// a fixed short length as the table grows.`,
      ts: `// Strong: base62-encode a monotonic sequence id.
const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function encode(id: number): string {
  if (id === 0) return ALPHABET[0];
  let n = id, code = "";
  while (n > 0) {
    code = ALPHABET[n % 62] + code;
    n = Math.floor(n / 62);
  }
  return code;
}

// id 1 -> "1", id 125 -> "21", id 100000 -> "q0U".
// Every id maps to exactly ONE code: no collisions, no
// retry loop, and codes stay short as the table grows.`,
      note:
        "A counter + base62 is collision-free by construction — no check, no retry. Hash-and-truncate trades a one-line 'clever' idea for a collision-handling loop you then have to build anyway.",
    },
    {
      label: "Unindexed single table vs indexed schema with a cache note",
      intro:
        "The redirect path — GET /:code — is the hot query. The weak schema forces a full scan per redirect; the strong schema makes the code the key and adds an index for reverse lookups, with the hot path served from cache.",
      php: `-- Weak: a single table, no keys, no index.
CREATE TABLE urls (
  id       bigint,
  code     text,     -- the value every redirect looks up
  long_url text
);

-- Every redirect runs:
--   SELECT long_url FROM urls WHERE code = '3n8Kf2';
-- With no index on code, that's a SEQUENTIAL SCAN of the
-- whole table on the single hottest query in the system.`,
      ts: `-- Strong: code is the key, reverse lookup is indexed.
CREATE TABLE urls (
  id         bigint GENERATED ALWAYS AS IDENTITY,
  code       text        NOT NULL,
  long_url   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code)            -- redirect: point lookup on the PK
);

-- Optional: dedupe identical URLs / analytics lookups.
CREATE INDEX idx_urls_long_url ON urls (long_url);

-- Hot path: redirects are read-heavy, so serve GET /:code
-- from a Redis-style cache; the rare miss is a single
-- indexed PK lookup, never a scan.`,
      note:
        "Making code the primary key turns the redirect into an O(log n) point lookup; the cache note shows you know redirects are read-heavy and shouldn't touch the DB on the common path.",
      leftLang: "sql",
      rightLang: "sql",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The key-generation core: base62 encode/decode of sequence ids, with a round-trip check. Predict the code for id 62 before running (hint: base62), then confirm every id survives encode-then-decode.",
    code: `// base62 encode/decode of sequence ids - the key-generation
// core of a URL shortener. A counter guarantees uniqueness;
// base62 keeps the code short. No collisions, no retry loop.

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = ALPHABET.length; // 62

function encode(id: number): string {
  if (id === 0) return ALPHABET[0];
  let n = id;
  let code = "";
  while (n > 0) {
    code = ALPHABET[n % BASE] + code;
    n = Math.floor(n / BASE);
  }
  return code;
}

function decode(code: string): number {
  let n = 0;
  for (const ch of code) {
    n = n * BASE + ALPHABET.indexOf(ch);
  }
  return n;
}

const ids = [1, 61, 62, 3844, 125, 100000, 999999999];
console.log("          id -> code     -> decoded    [round-trip]");
for (const id of ids) {
  const code = encode(id);
  const back = decode(code);
  const ok = back === id ? "ok" : "MISMATCH";
  console.log(
    \`\${String(id).padStart(12)} -> \${code.padEnd(8)} -> \${String(back).padStart(9)}  [\${ok}]\`
  );
}

// At 100M new URLs/year, ids stay tiny - storage is a
// non-issue. Even 100 billion is a short code:
const big = 100_000_000_000;
console.log(\`\\n\${big} -> "\${encode(big)}" (\${encode(big).length} base62 chars)\`);`,
  },

  keyPoints: [
    "Run the design loop — requirements, API, data model, scale — and this warm-up sets the template the next four classic designs (chat, feed, checkout) reuse on bigger numbers.",
    "Clarify scope before drawing: custom aliases, analytics, and expiry each change the design, and the scale number that matters is redirects/sec, not URLs stored.",
    "The API is two endpoints: POST /urls returns a code, GET /:code redirects (301 or 302); analytics and custom aliases are optional extensions.",
    "Generate codes with a counter + base62, not hash-and-truncate: base62 of a sequence id is collision-free by construction, so there's no collision check or retry loop.",
    "Redirects are massively read-heavy — a link is created once and followed thousands of times — so cache hot codes and index (or key on) the code column; storage itself is trivial.",
    "301 vs 302 is a real trade-off: 301 is cacheable and fast but loses click analytics; 302 routes every click through your server so you can count them.",
  ],

  interview: [
    {
      q: "Design a URL shortener. Where do you start?",
      a: "With requirements, not boxes. I'd confirm the spine — shorten a URL to a code, redirect the code to the URL — then ask the questions that change the design: do we support custom aliases, do we need click analytics, do links expire, and above all what's the read volume, because redirects vastly outnumber creations. Then the API is two endpoints: POST /urls returns a short code, GET /:code issues a redirect. The data model is essentially code-to-URL, and the one real decision is code generation: I'd use a monotonic counter base62-encoded rather than hashing and truncating, because base62 of a sequence id is collision-free by construction — no collision-check retry loop. Then scale: storage is a non-issue even at 100 million URLs a year, so the design centers on serving redirects fast — cache the hot codes and index the code column.",
    },
    {
      q: "How do you generate the short codes, and why not just hash the URL?",
      a: "I keep a monotonic counter — a database sequence or auto-increment id — and base62-encode that id into the code. Base62 is the 62 alphanumeric characters, so ids stay short: a hundred billion still fits in about seven characters. The key property is that each id maps to exactly one code, so codes are collision-free by construction with no coordination. Hashing the URL and truncating sounds simpler, but a truncated hash discards bits, so different URLs can collide onto the same code — now every insert needs a collision check and a retry loop, and you still can't guarantee a fixed short length as you grow. Custom aliases fit neatly on top: they're just rows inserted with a chosen code and a uniqueness constraint. If I need to avoid guessable sequential codes I'd shuffle the id space or salt the encoding, but the counter stays the backbone.",
    },
    {
      q: "Redirects are the hot path. How do you make them fast, and what's the 301-vs-302 call?",
      a: "Redirects are read-heavy — a link is created once and followed thousands of times — and access is very skewed, so a tiny fraction of codes get most of the traffic. That's ideal for caching: I put the hot codes in a Redis-style cache, so the vast majority of redirects never touch the database, and the rare miss is a single indexed point lookup on the code, which I'd make the primary key. On 301 versus 302: a 301 permanent redirect is cacheable by browsers and CDNs, so it's the fastest and cheapest, but the client stops asking my server and I lose per-click analytics. A 302 sends every click back through my server, so I can count clicks and referrers, at the cost of more traffic and no downstream caching. So it's driven by the requirement — analytics means 302, pure speed with no per-click data means 301.",
    },
  ],

  quiz: [
    {
      question:
        "Why is a counter + base62 preferred over hash-and-truncate for generating short codes?",
      options: [
        "Base62 codes are impossible to guess",
        "Base62 of a sequence id is collision-free by construction, so no collision check or retry loop is needed",
        "Hashing is too slow to run per request",
        "Base62 codes compress the original URL",
      ],
      answerIndex: 1,
      explain:
        "Each sequence id maps to exactly one base62 code, so there are no collisions to detect. A truncated hash discards bits, so different URLs can collide onto the same code, forcing a collision-check-and-retry loop on every insert.",
    },
    {
      question:
        "At 100M new URLs per year, what is the number that actually drives the design?",
      options: [
        "Total storage, which grows unmanageably large",
        "Redirects per second, because redirects are far more frequent than creations",
        "The length of the original URLs",
        "The number of custom aliases requested",
      ],
      answerIndex: 1,
      explain:
        "100M rows a year is only tens of GB — trivial. Redirects, however, vastly outnumber creations (a link is created once and followed thousands of times), so the design centers on serving GET /:code fast via caching and an indexed code lookup.",
    },
    {
      question:
        "What is the trade-off between using a 301 and a 302 redirect for the short code?",
      options: [
        "301 is faster but insecure; 302 encrypts the redirect",
        "301 is cacheable by browsers/CDNs (fast) but you lose click analytics; 302 routes every click through your server so you can count them",
        "301 works only for HTTPS; 302 works for HTTP",
        "There is no difference; both behave identically",
      ],
      answerIndex: 1,
      explain:
        "A 301 permanent redirect is cached downstream, so it's fast and cheap but the client stops hitting your server — no per-click data. A 302 sends every click back through your server, enabling analytics at the cost of extra traffic and no caching.",
    },
  ],
};

export default lesson;

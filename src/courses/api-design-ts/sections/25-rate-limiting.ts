import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "rate-limiting",
  title: "Rate Limiting",
  part: "Operating in Production",
  estMinutes: 12,
  summary:
    "Rate limiting protects the API as a shared resource: token buckets allow bursts at a sustained average, keys are chosen per client, and 429 + Retry-After turns refusal into a protocol.",

  concept: `
An API without a rate limit is a shared resource with no fairness rules: one
buggy retry loop, one scraper, or one brute-force script can consume the
capacity every other client depends on. Rate limiting exists for four
reasons: **abuse** (scraping, credential stuffing — pair it with lockouts on
login endpoints), **cost** (every request burns compute and often money),
**fairness** (one tenant must not starve the rest), and **stability**
(protecting your own backends from thundering herds — including your own
frontend's bugs).

### Fixed window: simple, and flawed at the boundary

Count requests per key per clock window: 60 allowed per minute, counter
resets at \`:00\`. It's one counter and one \`INCR\` — but the reset is a cliff.
A client can send 60 requests at \`10:00:59\` and 60 more at \`10:01:00\`:
120 requests in about a second, **double** the intended rate, perfectly
"within limits". Boundary bursts are why fixed windows alone don't survive
contact with production traffic.

### Sliding window: smoother, costlier

Sliding-window approaches judge each request against the *previous N
seconds* rather than the clock. A sliding **log** stores a timestamp per
request — exact but memory-heavy. A sliding **counter** interpolates between
the previous and current fixed windows — a cheap, widely used approximation
that kills the boundary burst.

### Token bucket: the industry default

Each client has a bucket holding up to \`capacity\` tokens. A request costs
one token; tokens **refill at a steady rate**. The elegance is that the two
parameters map directly onto the two things you actually want to say:

- **capacity** = the burst you'll tolerate ("up to 60 at once"),
- **refill rate** = the sustained average ("but only 1/second long-term").

Real clients are bursty — a page load fires ten calls — and the token bucket
absorbs that without permitting a sustained flood. Implementation is tiny:
store \`tokens\` and \`lastRefill\` per key, and refill *lazily* on each
request from the elapsed time — no background timers. In production the
state lives in Redis (atomically, often via a Lua script) so all instances
share one view; the classic PHP mistake is counting hits with a database
INSERT per request, which makes the rate limiter itself the heaviest query
on the box.

### What do you key on?

- **Per API key / user** — the primary choice: limits follow identity, and
  paid tiers can differ (\`capacity\` and refill become plan attributes).
- **Per IP** — the fallback for unauthenticated traffic. Beware NAT: one
  office IP may be hundreds of humans.
- **Per endpoint class** — expensive endpoints (search, export, login) get
  their own tighter buckets; don't let cheap health checks share a budget
  with report generation.

These compose: a global per-key limit *and* a stricter per-key limit on
\`/search\` is normal.

### The response contract

Refusing a request is part of the API's contract, so do it properly:

- **429 Too Many Requests** (defined in RFC 6585), with a Problem Details
  body saying which limit was hit.
- **\`Retry-After\`** header — seconds until it's worth retrying. This is the
  difference between clients that back off and clients that hammer.
- **Rate-limit headers on every response**, so clients can pace themselves
  before hitting the wall. The \`X-RateLimit-Limit\` / \`-Remaining\` /
  \`-Reset\` trio is the de-facto convention; the IETF HTTPAPI working group
  has a draft standardising unprefixed \`RateLimit-*\` fields — still a
  draft, so check its status before citing it as a standard.

Return 429 when the *client* exceeded its budget; return 503 when *your
service* is degraded — they trigger different client behaviour and different
dashboards.
`,

  comparisons: [
    {
      label: "Counting hits in the database vs a token bucket in middleware",
      intro:
        "Both enforce '60 requests per minute per key'. The left one writes to the database on every request and resets on the minute; the right refills a per-key bucket lazily and answers from memory or Redis.",
      php: `<?php // rate-limit.inc.php — fixed window, counted in MySQL
$minute = date('YmdHi'); // window id: resets on the boundary

$stmt = $pdo->prepare(
  'INSERT INTO hits (api_key, minute, count) VALUES (?, ?, 1)
   ON DUPLICATE KEY UPDATE count = count + 1'
);
$stmt->execute([$apiKey, $minute]); // a DB WRITE on every request

$stmt = $pdo->prepare(
  'SELECT count FROM hits WHERE api_key = ? AND minute = ?'
);
$stmt->execute([$apiKey, $minute]);

if ((int) $stmt->fetchColumn() > 60) {
    http_response_code(429);
    exit; // no Retry-After, no headers — and 60 more allowed at :00
}`,
      ts: `// middleware/rate-limit.ts — token bucket per key (Redis in prod)
const buckets = new Map<string, { tokens: number; last: number }>();
const CAPACITY = 60;      // burst allowance
const REFILL_PER_SEC = 1; // sustained average: 60/min

export function rateLimit(req: Req, res: Res, next: Next) {
  const key = req.client.keyPrefix;
  const now = Date.now() / 1000;
  const b = buckets.get(key) ?? { tokens: CAPACITY, last: now };

  // Lazy refill from elapsed time — no timers, no cron.
  b.tokens = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_SEC);
  b.last = now;
  buckets.set(key, b);

  res.setHeader("X-RateLimit-Limit", CAPACITY);
  res.setHeader("X-RateLimit-Remaining", Math.floor(b.tokens));

  if (b.tokens < 1) {
    res.setHeader("Retry-After", Math.ceil((1 - b.tokens) / REFILL_PER_SEC));
    return res.status(429).json(problem(429, "Rate limit exceeded"));
  }
  b.tokens -= 1;
  next();
}`,
      note:
        "The PHP version makes the limiter itself the heaviest query on the box and still allows 120 requests across a minute boundary; the bucket costs arithmetic, allows honest bursts, and caps the sustained rate.",
    },
    {
      label: "A bare 429 vs a 429 that is a protocol",
      intro:
        "Two ways to refuse the 61st request. Ask what a well-behaved client SDK can do with each response.",
      php: `$ curl -i https://api.example.com/v1/orders \\
    -H "Authorization: Bearer sk_live_9f2k..."
HTTP/1.1 429 Too Many Requests
Content-Length: 0

# Now what? Retry immediately? Wait a second? A minute?
# The client guesses — and the usual guess is an instant
# retry loop that makes the overload worse.`,
      ts: `$ curl -i https://api.example.com/v1/orders \\
    -H "Authorization: Bearer sk_live_9f2k..."
HTTP/1.1 429 Too Many Requests
Retry-After: 30
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1783432890
Content-Type: application/problem+json

{
  "type": "https://api.example.com/problems/rate-limited",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "60 requests/min per key. Retry after 30 seconds."
}

# An SDK can sleep 30s, surface the quota, and pace itself
# using Remaining/Reset on every earlier 200 response too.`,
      note:
        "Retry-After turns refusal into cooperation; the X-RateLimit-* trio is the de-facto convention (an IETF draft is standardising unprefixed RateLimit-* fields — verify its current status before citing it).",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "The minute boundary: fixed window vs token bucket",
      intro:
        "The same aggressive client against the same '60 per minute' policy. Watch what each algorithm permits in the two seconds around 10:01:00.",
      php: `# Fixed window, 60/min — the counter RESETS at :00
10:00:59.0   requests 1-60    -> 200 OK   (window 10:00 now full)
10:00:59.5   request  61      -> 429      (counter = 60)
10:01:00.1   requests 62-121  -> 200 OK   (fresh window 10:01!)

# 120 requests accepted in ~1.1 seconds — DOUBLE the intended
# rate, entirely "within the limit". The clock boundary is the
# vulnerability: attackers schedule around it deliberately.`,
      ts: `# Token bucket: capacity 60, refill 1 token/sec
10:00:59.0   requests 1-60    -> 200 OK   (bucket drained to 0)
10:00:59.5   request  61      -> 429      (0.5 tokens — not enough)
10:01:00.1   request  62      -> 200 OK   (~1.1 tokens refilled)
10:01:00.2   request  63      -> 429      (bucket empty again)
10:01:30.0   request  64      -> 200 OK   (~30 tokens available)

# Bursts up to 60 are honoured, but the sustained rate can never
# exceed 1/sec — there is no boundary to schedule around.`,
      note:
        "Same '60 per minute' promise, different guarantees: the fixed window caps a counter per clock interval; the bucket caps the actual sustained rate, which is what your backend capacity cares about.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A complete token bucket (capacity 5, refill 1 token/sec) run against a timestamped burst. Predict each line — which of the six t=0 requests pass, what happens at t=1 and t=3, and how many tokens are back by t=10 — then run it. Try capacity 1 to see it become a strict 1/sec limiter.",
    code: `// A token bucket: capacity = burst size, refill rate = sustained average.
// Watch it absorb a burst at t=0, starve, then recover as tokens drip back.

interface Bucket {
  capacity: number;      // max tokens (burst allowance)
  tokens: number;
  refillPerSec: number;  // sustained rate
  lastRefill: number;    // seconds
}

function createBucket(capacity: number, refillPerSec: number): Bucket {
  return { capacity, tokens: capacity, refillPerSec, lastRefill: 0 };
}

function tryConsume(bucket: Bucket, atSecond: number): boolean {
  // Lazy refill: top up based on time elapsed since we last looked.
  const elapsed = atSecond - bucket.lastRefill;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerSec);
  bucket.lastRefill = atSecond;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

// One client's bucket: bursts of up to 5, refills 1 token/second.
const bucket = createBucket(5, 1);

// A burst at t=0, a straggler at t=1, a mini-burst at t=3, then quiet.
const requestTimes = [0, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 10];

for (const t of requestTimes) {
  const allowed = tryConsume(bucket, t);
  const status = allowed ? "200 OK" : "429   ";
  console.log(
    "t=" + String(t).padStart(2) + "s  " + status +
    "  remaining=" + bucket.tokens.toFixed(1)
  );
}`,
  },

  keyPoints: [
    "Rate limit for four reasons: abuse (scraping, brute force), cost, fairness between tenants, and protecting your own backends from thundering herds.",
    "Fixed windows are trivially cheap but leak double the intended rate at the boundary (60 at 10:00:59 + 60 at 10:01:00); sliding windows smooth that out at higher cost.",
    "Token bucket is the industry default: `capacity` = tolerated burst, refill rate = sustained average — refilled lazily from elapsed time, no timers needed.",
    "Key limits per API key/user first (tiers become bucket parameters), per IP only as an unauthenticated fallback (NAT!), and give expensive endpoint classes their own buckets.",
    "The refusal contract: 429 Too Many Requests + `Retry-After` + a Problem Details body; send the de-facto `X-RateLimit-Limit`/`-Remaining`/`-Reset` trio on every response (the unprefixed `RateLimit-*` names are still an IETF draft, not an RFC).",
    "429 means the client exceeded its budget; 503 means your service is degraded — don't conflate them.",
  ],

  interview: [
    {
      q: "How would you add rate limiting to a public API?",
      a: "Token bucket per API key, enforced in middleware or at the gateway, with state in Redis so every instance shares one view. The bucket's two parameters map to the policy directly: capacity is the burst I tolerate — real clients are bursty — and refill rate is the sustained average my backend can afford; a plan tier is just different numbers. I'd key primarily on the API key or user, fall back to IP for unauthenticated routes (carefully — NAT means one IP can be an office), and give expensive endpoint classes like search or login their own tighter buckets. On refusal: 429 with a `Retry-After` header and a Problem Details body, plus `X-RateLimit-Limit`/`-Remaining`/`-Reset` on every response so well-behaved clients slow down before hitting the wall.",
    },
    {
      q: "What's wrong with a fixed-window limiter, and how does a token bucket fix it?",
      a: "The fixed window has a cliff at the reset: with '60 per minute' resetting on the clock, a client sends 60 requests at 10:00:59 and 60 more at 10:01:00 — 120 in about a second, double the intended rate, all technically within limits, and attackers schedule around boundaries deliberately. The token bucket has no boundary: tokens refill continuously at the sustained rate, and the bucket depth caps the burst. So after a full burst you're limited to genuine refill — the sustained rate can never exceed what you configured, regardless of clock alignment. It's also barely more code: per key you store a token count and a last-refill timestamp, and refill lazily from elapsed time on each request; in Redis that's a small atomic script.",
    },
    {
      q: "A client hits your limit. What exactly should the response look like, and why does it matter?",
      a: "429 Too Many Requests — not 403, which says forbidden, and not 503, which says *my* service is unhealthy. The critical header is `Retry-After` with the seconds until a retry can succeed: without it, the typical client reaction is an immediate retry loop, which converts a rate limit into a self-inflicted stampede. I'd include a Problem Details body naming the limit that was hit, and send the rate-limit headers — conventionally `X-RateLimit-Limit`, `-Remaining`, and `-Reset` — on every response, not just the 429, so SDKs can pace themselves proactively. On naming, I'd note the IETF HTTPAPI working group has a draft standardising unprefixed `RateLimit-*` fields, but it's still a draft; the X- forms remain what you meet in the wild.",
    },
    {
      q: "What do you key rate limits on — and what are the traps?",
      a: "Identity first: per API key or user, because the limit should follow the client, survive IP changes, and support tiering — a paid plan is just a bigger bucket. IP-based limiting is the fallback for unauthenticated endpoints, with two traps: corporate NAT and mobile carriers put hundreds of legitimate users behind one address, and attackers rotate IPs cheaply, so it's simultaneously too coarse and too weak. I also separate endpoint classes — login endpoints get very tight per-account-plus-IP limits as brute-force defence, and expensive operations like exports get their own budget so they can't be starved out or used to starve others. And the limits compose: a global per-key limit plus stricter per-endpoint buckets is the normal production shape.",
    },
  ],

  quiz: [
    {
      question:
        "A '100 requests per minute' fixed-window limiter resets at :00. What's the worst burst a client can push through around a boundary?",
      options: [
        "100 requests — the limiter guarantees the rate",
        "150 requests, because windows overlap by half",
        "200 requests in a couple of seconds — filling the window before and after the reset",
        "Unlimited requests, since the counter can be bypassed",
      ],
      answerIndex: 2,
      explain:
        "Nothing connects the end of one window to the start of the next: 100 requests at :59 and 100 more at :00 are both 'within limits', delivering double the intended rate in seconds. This boundary burst is the standard argument for sliding windows or token buckets.",
    },
    {
      question: "In a token bucket, what do capacity and refill rate each control?",
      options: [
        "Capacity = requests per day; refill rate = requests per second",
        "Capacity = the tolerated burst size; refill rate = the sustained average rate",
        "Capacity = number of clients; refill rate = tokens shared between them",
        "Capacity = the sustained rate; refill rate = the burst allowance",
      ],
      answerIndex: 1,
      explain:
        "That direct mapping is why token buckets are the default: a full bucket lets a client burst up to `capacity` at once (page loads are bursty), while refill sets the long-term average that can never be exceeded. State is just tokens + last-refill time, topped up lazily.",
    },
    {
      question: "Which response is correct when a client exceeds its rate limit?",
      options: [
        "403 Forbidden with an explanatory HTML page",
        "503 Service Unavailable, since the server cannot serve the request",
        "429 Too Many Requests with a Retry-After header and a problem+json body",
        "200 OK with an empty body, to avoid breaking naive clients",
      ],
      answerIndex: 2,
      explain:
        "429 (RFC 6585) states precisely what happened: the client exceeded its budget. Retry-After tells it when trying again is worthwhile — the difference between backoff and a retry stampede. 503 would wrongly signal that the service itself is degraded; that code belongs to your outages, not the client's quota.",
    },
    {
      question: "Why is rate limiting purely by IP address problematic as a primary strategy?",
      options: [
        "IP addresses are encrypted under TLS and unavailable to the server",
        "NAT puts many legitimate users behind one IP, while attackers rotate IPs cheaply — it's too coarse and too weak at once",
        "HTTP/2 removed the client IP from the connection metadata",
        "It only works for IPv6 clients",
      ],
      answerIndex: 1,
      explain:
        "One office or mobile-carrier NAT address can represent hundreds of genuine users who then share a single budget, while a motivated abuser simply rotates addresses. Key on API key or user identity first; IP limits are the fallback for unauthenticated traffic.",
    },
  ],
};

export default lesson;

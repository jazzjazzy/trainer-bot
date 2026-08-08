import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 20,
  slug: "rate-limiter",
  title: "Design a Rate Limiter",
  part: "The Classic Questions",
  estMinutes: 13,
  summary:
    "Requirements first, then the algorithm menu — fixed window and its boundary-burst bug, sliding window, and token bucket as the usual right answer — plus the distributed twist of a shared atomic counter and the 429/Retry-After API surface.",

  concept: `
"Design a rate limiter" is really two questions: *which algorithm* and *where
does the counter live when there's more than one server*. Get the requirements
first, name the algorithm trade-offs, then handle the distributed twist — that
sequence is the whole answer.

### Step 1 — Requirements

- **What's the key?** Per-user, per-IP, per-API-key, per-endpoint, or a
  combination (e.g. per-user-per-endpoint)? This decides the counter's key.
- **Block or queue?** On limit, do you reject with **429 Too Many Requests**,
  or shape traffic by queuing/delaying? Rejecting is the common case.
- **The limit itself** — "100 requests per minute" — and whether bursts are
  allowed.

### Step 2 — The algorithm menu

- **Fixed window** — count requests per calendar window (e.g. per minute);
  reset the counter at each boundary. Trivial, but it has a real bug: the
  **boundary burst**. A client can send the full limit at the very end of one
  window and the full limit at the very start of the next — **2x the limit in a
  span shorter than one window**. Name this flaw; it's the point of the
  question.
- **Sliding window log** — store a timestamp per request and count only those
  within the trailing window. Exact, but stores every timestamp (memory-heavy).
- **Sliding window counter** — a weighted blend of the current and previous
  fixed windows; approximates the sliding log cheaply and smooths the boundary
  burst. A common production compromise.
- **Token bucket** — the usual right answer. A bucket holds up to **capacity**
  tokens and **refills at a steady rate**; each request spends one token, and a
  request with no token available is rejected. It **allows controlled bursts**
  (up to capacity) while enforcing a smooth long-run rate (the refill rate) —
  which is what real traffic actually wants.
- **Leaky bucket** — requests enter a queue that drains at a fixed rate;
  smooths output to a constant rate. One line: token bucket allows bursts,
  leaky bucket forces a constant drain.

### Step 3 — The distributed twist

In-process counters **break behind a load balancer**: with the counter in one
server's memory, five servers each allow the full limit, so the real limit is
5x what you configured. The fix is a **shared store** — a Redis-style
in-memory store — holding the counter, updated with an **atomic** operation
(atomic increment, or a small atomic script) so concurrent requests across all
app servers can't race past the limit. The limiter itself lives as
**middleware** or at the **API gateway**, in front of your handlers — exactly
where you'd have put a rate-limiting middleware in a PHP framework.

### Step 4 — The API surface

Be a good HTTP citizen when you reject:

- **\`429 Too Many Requests\`** — the status code for "you're over the limit".
- **\`Retry-After: 30\`** — tells the client how many seconds to wait.
- **\`X-RateLimit-Limit\` / \`X-RateLimit-Remaining\` / \`X-RateLimit-Reset\`** —
  let well-behaved clients self-throttle before they hit the wall.

Returning a bare 500 or silently dropping requests is the junior tell; the
429 + \`Retry-After\` + \`X-RateLimit-*\` trio shows you've consumed a rate-limited
API and know what a good one tells you.
`,

  comparisons: [
    {
      label: "Fixed window (boundary-burst bug) vs token bucket",
      intro:
        "Both enforce '5 requests per 10 seconds'. The fixed-window counter resets on the boundary and can be tricked into passing 10 requests in ~1 second; the token bucket enforces a smooth rate while still allowing a bounded burst.",
      php: `// Weak: fixed window, resets on the boundary.
const LIMIT = 5, WINDOW = 10; // 5 per 10s
let windowStart = 0, count = 0;

function allow(now: number): boolean {
  const w = Math.floor(now / WINDOW) * WINDOW;
  if (w !== windowStart) { windowStart = w; count = 0; }
  if (count < LIMIT) { count++; return true; }
  return false;
}
// Bug: 5 requests at t=9s (end of window 0) + 5 at
// t=10s (start of window 1) = 10 allowed in ~1 second,
// double the intended rate. The reset is the flaw.`,
      ts: `// Strong: token bucket, smooth refill + bounded burst.
const CAP = 5, REFILL = 1; // capacity 5, +1 token/sec
let tokens = CAP, last = 0;

function allow(now: number): boolean {
  tokens = Math.min(CAP, tokens + (now - last) * REFILL);
  last = now;
  if (tokens >= 1) { tokens -= 1; return true; }
  return false; // no token -> 429 + Retry-After
}
// Absorbs a burst up to capacity (5), then throttles to
// the refill rate. No boundary to exploit - the bucket
// only ever holds what the refill rate has earned.`,
      note:
        "The fixed window's reset creates an exploitable boundary; the token bucket has no boundary — it allows a bounded burst then enforces the steady refill rate, which is what production traffic actually needs.",
    },
    {
      label: "In-process counters vs a shared atomic store",
      intro:
        "The same limiter behind a load balancer. The weak version keeps the counter in each server's memory, so N servers multiply the real limit by N; the strong version keeps one counter in a shared store, incremented atomically.",
      php: `# Weak: counter in each app server's memory
topology:
  load_balancer -> [app-1, app-2, app-3, app-4, app-5]
each app:
  counter: in local RAM   # per-process
effect:
  configured limit: 100 req/min per user
  actual limit:     up to 500 req/min
                    (each of 5 servers allows 100)
  # and it resets when any server restarts`,
      ts: `# Strong: one counter in a shared atomic store
topology:
  load_balancer -> [app-1..app-5] -> redis-style store
counter:
  location: shared in-memory store
  update:   atomic increment (INCR + EXPIRE),
            or a small atomic script for token bucket
effect:
  configured limit: 100 req/min per user
  actual limit:     100 req/min, cluster-wide
  # concurrent requests across all servers can't
  # race past the limit - the increment is atomic`,
      note:
        "A rate limiter is only correct if all app servers share one counter updated atomically; in-process counters silently multiply the limit by the number of servers behind the load balancer.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Token bucket vs fixed window on the SAME burst — five requests at t=9s and five at t=10s, straddling a window boundary. Predict how many each lets through before running: the token bucket caps the burst, the fixed window doesn't.",
    code: `// Token bucket vs fixed window on the SAME burst.
// Requests cluster around a window boundary: five at t=9s
// and five at t=10s. Watch the fixed window leak a double burst.

const arrivals = [9, 9, 9, 9, 9, 10, 10, 10, 10, 10];

// --- Token bucket: capacity 5, refills 1 token/sec ---
const CAP = 5;
const REFILL = 1;
let tokens = CAP;
let last = 0;
let tbAllow = 0;
console.log("token bucket (capacity 5, +1 token/sec):");
for (const t of arrivals) {
  tokens = Math.min(CAP, tokens + (t - last) * REFILL);
  last = t;
  if (tokens >= 1) {
    tokens -= 1;
    tbAllow++;
    console.log(\`  t=\${t}s  ALLOW  tokens->\${tokens.toFixed(1)}\`);
  } else {
    console.log(\`  t=\${t}s  DENY   429 Retry-After: 1\`);
  }
}

// --- Fixed window: 5 requests per 10-second window ---
const LIMIT = 5;
const WINDOW = 10;
let windowStart = 0;
let count = 0;
let fwAllow = 0;
console.log("\\nfixed window (5 per 10s):");
for (const t of arrivals) {
  const w = Math.floor(t / WINDOW) * WINDOW;
  if (w !== windowStart) { windowStart = w; count = 0; }
  if (count < LIMIT) {
    count++;
    fwAllow++;
    console.log(\`  t=\${t}s  ALLOW  window[\${windowStart}-\${windowStart + WINDOW}) count=\${count}\`);
  } else {
    console.log(\`  t=\${t}s  DENY   window quota spent\`);
  }
}

console.log(\`\\ntoken bucket allowed \${tbAllow}/10; fixed window allowed \${fwAllow}/10.\`);
console.log(\`the fixed window let \${fwAllow} through in a ~1s real span - the boundary-burst bug.\`);`,
  },

  keyPoints: [
    "Answer in order: requirements (per-user/IP/key? block or queue?), then the algorithm, then the distributed twist, then the HTTP surface — the sequence is the answer.",
    "Fixed window is trivial but has the boundary-burst bug: a client can send the limit at the end of one window and again at the start of the next — 2x the limit in under a window.",
    "Token bucket is the usual right answer: a capacity-bounded bucket refilling at a steady rate allows controlled bursts while enforcing a smooth long-run rate, which matches real traffic.",
    "In-process counters break behind a load balancer — N servers multiply the real limit by N — so keep one counter in a shared store updated with an atomic increment.",
    "The limiter lives as middleware or at the API gateway, in front of handlers — the same place you'd add rate-limiting middleware in a PHP framework.",
    "On rejection return 429 Too Many Requests with Retry-After, and expose X-RateLimit-Limit/Remaining/Reset so well-behaved clients self-throttle before hitting the wall.",
  ],

  interview: [
    {
      q: "Design a rate limiter for our API. Talk me through it.",
      a: "First requirements: what's the key — per-user, per-IP, per-API-key, or per-endpoint — the limit and window, and whether I reject or queue over-limit requests; rejecting with 429 is the usual case. For the algorithm I'd reach for a token bucket: a bucket holds up to a capacity of tokens and refills at a steady rate, each request spends one, and an empty bucket means reject. That allows a bounded burst while enforcing a smooth long-run rate, which is what real traffic looks like — unlike a fixed window, which resets on a boundary and lets a client push double the limit across that boundary. The critical distributed detail is that the counter can't live in one server's memory, or five servers each allow the full limit; it goes in a shared in-memory store, updated atomically so concurrent requests across all servers can't race past the limit. The limiter sits as middleware or at the gateway, and on rejection I return 429 with Retry-After plus X-RateLimit headers so good clients self-throttle.",
    },
    {
      q: "Why token bucket over a fixed window counter?",
      a: "Two reasons. First, correctness at the boundary: a fixed window resets its counter each period, so a client can send the whole limit in the last second of one window and the whole limit in the first second of the next — twice the intended rate in a span shorter than the window. The token bucket has no boundary to exploit; the bucket only ever holds what the refill rate has earned, so the long-run rate is bounded no matter how requests cluster. Second, it models real traffic better: users are bursty, and the token bucket explicitly allows a burst up to capacity and then throttles to the steady refill rate, rather than either rejecting all bursts or allowing a double one. A sliding-window counter is a decent middle ground if I specifically want to smooth the fixed window, but token bucket is my default answer.",
    },
    {
      q: "How do you make the rate limiter work correctly across many app servers?",
      a: "The counter has to be shared and updated atomically. If each app server keeps its own in-memory counter, then behind a load balancer with five servers the effective limit is five times what I configured, and it resets whenever a server restarts — so it's not really a limit. Instead I keep the counter in a shared in-memory store like a Redis-style server, keyed by whatever I'm limiting on, and I update it with an atomic operation — an atomic increment with an expiry for a windowed counter, or a small atomic script that reads the token count, refills based on elapsed time, and decrements in one step for a token bucket. Atomicity is the point: without it, two concurrent requests can both read 'under the limit' and both proceed. The store's own expiry handles cleanup so counters don't accumulate forever.",
    },
  ],

  quiz: [
    {
      question:
        "What is the boundary-burst bug in a fixed-window rate limiter?",
      options: [
        "The counter overflows at large request volumes",
        "A client can send the full limit at the end of one window and again at the start of the next, passing ~2x the limit in under a window",
        "The window boundary is computed in the wrong timezone",
        "Fixed windows can't be used per-user",
      ],
      answerIndex: 1,
      explain:
        "Because the counter resets at each window boundary, requests bunched right before and right after the reset both pass — up to double the intended limit within a single window's span. Token bucket and sliding-window approaches avoid this.",
    },
    {
      question:
        "Why is the token bucket usually the right default algorithm?",
      options: [
        "It never rejects any request",
        "It allows a bounded burst (up to capacity) while enforcing a smooth long-run rate via steady refill",
        "It uses less memory than any other algorithm",
        "It requires no shared state to work across servers",
      ],
      answerIndex: 1,
      explain:
        "A token bucket holds up to `capacity` tokens and refills at a fixed rate; requests spend tokens. That absorbs realistic bursts up to capacity yet caps the long-run rate at the refill rate — a better match for real traffic than reject-all-bursts or the fixed window's double burst.",
    },
    {
      question:
        "What breaks if each app server keeps its own in-memory rate-limit counter behind a load balancer?",
      options: [
        "Nothing — per-server counters are the recommended design",
        "The effective limit becomes N times the configured limit (one per server), so you must use a shared, atomically-updated counter",
        "The counters synchronise automatically over the network",
        "Requests are rejected twice as often as intended",
      ],
      answerIndex: 1,
      explain:
        "With the counter in each server's memory, N servers each independently allow the full limit, so the real cluster-wide limit is N times too high (and resets on restart). Correctness requires one shared counter in a store like Redis, updated with an atomic operation.",
    },
  ],
};

export default lesson;

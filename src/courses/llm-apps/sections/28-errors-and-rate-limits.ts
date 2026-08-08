import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "errors-and-rate-limits",
  title: "Errors, Retries, and Rate Limits",
  part: "Production Engineering",
  estMinutes: 12,
  summary:
    "Split retryable failures from fatal ones by exception type, back off with jitter on 429/5xx, and let one layer own retries instead of stacking them.",

  concept: `
Every network integration you ever hardened with Guzzle middleware taught the
same lesson: failures are not all alike, and the response to each is different.
An LLM API is no exception. The difference between a flaky feature and a solid
one is almost entirely in how you classify and respond to errors.

### The error taxonomy

The HTTP status tells you what to do:

- **400** \`invalid_request_error\` — *your* bug (bad params, malformed
  messages, first message not \`user\`). **Fix it, never retry** — it will fail
  identically forever.
- **401 / 403** — auth or permission. A config problem; don't retry.
- **413** — request too large. Trim history or split the input.
- **429** \`rate_limit_error\` — you're over a limit. **Back off** and honor the
  \`retry-after\` header.
- **500** \`api_error\` / **529** \`overloaded_error\` — transient server
  trouble. **Retry with exponential backoff plus jitter.**

### Catch by type, never by message

The SDKs throw typed exceptions — \`Anthropic.RateLimitError\`,
\`Anthropic.BadRequestError\`, \`Anthropic.APIConnectionError\`,
\`Anthropic.InternalServerError\` — each mapping to a status. Catch them
**specific-first**, and branch retryable-vs-fatal on the *type*, not on
substring-matching the error message. Message text changes; types don't.

### The SDKs already retry — don't double up

By default the SDK auto-retries 429 and 5xx **twice** (\`max_retries\`), with
backoff and \`retry-after\` respected for you. If you wrap your own five-attempt
loop around that, a single 429 can trigger up to fifteen underlying calls.
**Pick one layer to own retries**: either raise the SDK's \`max_retries\` and
let it handle everything, or set it to 0 and own the loop — never both.

### Backoff, jitter, and thundering herds

When you do retry, wait \`base * 2^attempt\` (capped), and add **jitter** — a
random fraction of that delay — so that a fleet of clients that all hit a 429
at once don't all retry at the same instant and re-overload the service. This
is the same "thundering herd" problem you'd guard against with a job queue.

### Beyond retries: degrade gracefully

Retries buy time; they don't fix an outage. For burst traffic, cap concurrency
with a queue so you throttle yourself before the API does. For retried writes,
think about **idempotency** — will replaying this request double-charge someone?
And when everything fails, degrade honestly: fall back to a cheaper model, a
cached answer, or a plain "try again in a minute" — never a blank screen.
`,

  comparisons: [
    {
      label: "One blind catch vs a typed-exception chain",
      intro:
        "Handle a failed request. One version retries everything the same way; the other splits retryable failures from fatal ones by exception type.",
      php: `// First attempt: one catch, every failure treated identically
try {
  return await client.messages.create({ /* ... */ });
} catch (err) {
  // A 400 (your bug) and a 529 (transient) get the same blind retry.
  // The 400 fails again every time; the user waits through pointless
  // retries for an error that will never succeed.
  await sleep(1000);
  return retry();
}`,
      ts: `// Production: split retryable from fatal by TYPE, not message text
import Anthropic from "@anthropic-ai/sdk";

try {
  return await client.messages.create({ /* ... */ });
} catch (err) {
  if (err instanceof Anthropic.BadRequestError) throw err;      // 400 — fix the call
  if (err instanceof Anthropic.AuthenticationError) throw err;  // 401 — config
  if (err instanceof Anthropic.RateLimitError) return backoff(err);     // 429
  if (err instanceof Anthropic.APIConnectionError) return backoff(err); // network
  if (err instanceof Anthropic.InternalServerError) return backoff(err); // 5xx / 529
  throw err;
}`,
      note:
        "Typed exceptions carry the status; branch on the class. String-matching error messages is brittle — the wording can change and your logic silently breaks.",
    },
    {
      label: "Hammering after a 429 vs honoring retry-after",
      intro:
        "The API returned 429. One version retries in a tight loop; the other respects retry-after and backs off with jitter.",
      php: `// First attempt: retry immediately, as fast as possible
while (true) {
  try { return await callApi(); }
  catch (err) {
    if (err.status === 429) continue; // tight loop -> you make it WORSE
    throw err;
  }
}`,
      ts: `// Production: honor retry-after, then exponential backoff + jitter
async function callWithBackoff(attempt = 0): Promise<Result> {
  try {
    return await callApi();
  } catch (err) {
    if (!isRetryable(err) || attempt >= 5) throw err;
    const retryAfterMs = (Number(err.headers?.["retry-after"]) || 0) * 1000;
    const capped = Math.min(30000, 500 * 2 ** attempt);
    const jitter = Math.random() * capped;
    await sleep(Math.max(retryAfterMs, jitter));
    return callWithBackoff(attempt + 1);
  }
}`,
      note:
        "A tight retry loop after a 429 pours fuel on the fire. Respect retry-after when present, cap the exponential growth, and add jitter so many clients don't retry in lockstep.",
    },
    {
      label: "Stacking your retries on the SDK's vs owning one layer",
      intro:
        "The SDK auto-retries 429 and 5xx twice by default. One version wraps its own loop on top; the other picks a single layer to own retries.",
      php: `// First attempt: your own loop around a client that ALREADY retries
const client = new Anthropic(); // max_retries defaults to 2
for (let i = 0; i < 5; i++) {
  try { return await client.messages.create({ /* ... */ }); }
  catch { await sleep(1000); } // the SDK retried twice under each of these
}
// A single 429 can now fan out to 5 x 3 = 15 underlying attempts.`,
      ts: `// Production: pick ONE layer to own retries. Let the SDK do it:
const client = new Anthropic({ maxRetries: 4 }); // backoff + retry-after built in
return await client.messages.create({ /* ... */ });

// Or set maxRetries: 0 and own the loop yourself — but never both,
// or your retry counts multiply.`,
      note:
        "The SDK's built-in retries already do backoff and honor retry-after. Either configure max_retries and lean on it, or disable it and hand-roll — stacking the two multiplies attempts.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A withRetry wrapper against a scripted flaky endpoint that returns 429, then 529, then succeeds. Watch it classify each failure, compute a jittered backoff, and stop retrying a non-retryable error. Predict the sequence, then run.",
    code: `// A retry wrapper: exponential backoff + full jitter, retrying only the
// errors that are actually retryable. Deterministic PRNG so the demo is
// reproducible; real code would await the delay instead of just logging it.

class ApiError extends Error {
  constructor(public status: number) {
    super("HTTP " + status);
  }
}

// mulberry32: a small, integer-safe seeded PRNG for reproducible "jitter".
let seed = 12345 >>> 0;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const RETRYABLE = new Set([429, 500, 529]);
interface RetryOpts { maxRetries: number; baseMs: number; capMs: number }

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOpts,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await fn(attempt);
      console.log("attempt " + attempt + ": success");
      return out;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const retryable = RETRYABLE.has(status);
      if (!retryable || attempt >= opts.maxRetries) {
        console.log(
          "attempt " + attempt + ": " + status + " -> giving up (" +
          (retryable ? "out of retries" : "not retryable") + ")",
        );
        throw err;
      }
      const exp = Math.min(opts.capMs, opts.baseMs * 2 ** attempt);
      const delay = Math.round(rand() * exp); // full jitter: 0..exp
      console.log("attempt " + attempt + ": " + status + " -> retry in " + delay + "ms");
      // In production: await sleep(delay). Skipped here so the demo is instant.
    }
  }
}

// Scripted flaky endpoint: 429, then 529, then success.
const script = [429, 529, 200];
let call = 0;
async function flakyEndpoint(): Promise<string> {
  const status = script[call] ?? 200;
  call++;
  if (status !== 200) throw new ApiError(status);
  return "OK";
}

const result = await withRetry(() => flakyEndpoint(), {
  maxRetries: 5,
  baseMs: 100,
  capMs: 2000,
});
console.log("final result: " + result);

// Now watch a fatal error stop immediately — no retries on a 400.
call = 0;
try {
  await withRetry(async () => { throw new ApiError(400); }, {
    maxRetries: 5,
    baseMs: 100,
    capMs: 2000,
  });
} catch {
  console.log("400 was not retried — as it should not be");
}`,
  },

  keyPoints: [
    "Classify by status: 400 is your bug (fix, never retry), 401/403 are config, 429 means back off and honor retry-after, 500/529 are transient (retry with backoff + jitter).",
    "Catch the SDK's typed exceptions (`Anthropic.RateLimitError`, `BadRequestError`, `APIConnectionError`, ...) specific-first, and branch on the type — never string-match error messages.",
    "SDKs auto-retry 429/5xx twice by default (`max_retries`); don't stack your own loop on top, or a single failure fans out into many attempts.",
    "Use exponential backoff (`base * 2^attempt`, capped) with jitter so a fleet of clients doesn't retry in lockstep and re-overload the API.",
    "For burst traffic, cap concurrency with a queue to throttle yourself before the API does; for retried writes, design for idempotency so replays don't double-act.",
    "Degrade gracefully on persistent failure — fallback model, cached answer, or an honest error message — never a blank screen.",
  ],

  interview: [
    {
      q: "How do you decide whether to retry a failed Claude API request?",
      a: "By the error type, which maps to the HTTP status. A 400 invalid_request_error is my own bug — bad parameters or a malformed message array — so retrying is pointless; I fix the call. 401 and 403 are auth or permission, also not retryable. But 429 rate limits and 500/529 server errors are transient, so I retry those with exponential backoff and jitter, honoring the retry-after header on a 429. I get this classification from the SDK's typed exceptions — I catch RateLimitError and InternalServerError as retryable, BadRequestError and AuthenticationError as fatal, and I branch on the class rather than pattern-matching the message text, which is brittle.",
    },
    {
      q: "The SDK already retries automatically. Why is that a trap, and how do you handle it?",
      a: "Because it's easy to accidentally retry twice. The Anthropic SDKs retry 429 and 5xx errors twice by default via max_retries, with backoff and retry-after handled for you. If I don't know that and wrap my own five-attempt loop around each call, a single 429 can fan out to fifteen underlying requests — which just makes the rate limiting worse. So I pick one layer to own retries: either I raise the SDK's max_retries and rely on it entirely, or I set max_retries to zero and hand-roll the loop when I need custom behavior. What I never do is leave both active.",
    },
    {
      q: "Why add jitter to exponential backoff, and what else do you do for burst traffic?",
      a: "Jitter prevents a thundering herd. If a burst of requests all hit a 429 at the same moment and all back off by exactly base times two-to-the-attempt, they retry in perfect lockstep and re-overload the API at the same instant. Adding a random component to each delay spreads the retries out. Beyond that, for genuine burst traffic I put a concurrency cap or queue in front so I throttle myself before the API throttles me — the same instinct as bounding worker pool size. And for anything that writes or has side effects, I think about idempotency, because a retried request that issues a refund twice is worse than the original failure.",
    },
  ],

  quiz: [
    {
      question:
        "Your code catches every exception and retries with a fixed 1-second delay. What's the most important problem with this on a 400 invalid_request_error?",
      options: [
        "The delay should be 2 seconds, not 1",
        "A 400 is your own bug and will fail identically on every retry — it should not be retried at all",
        "400 errors are actually retryable and need backoff",
        "You should retry 400s faster, with no delay",
      ],
      answerIndex: 1,
      explain:
        "A 400 means the request itself is malformed — wrong params, bad message order. Retrying can never fix it; it just wastes time and hides the real bug. Retries are for transient failures (429, 5xx), not for your own invalid requests.",
    },
    {
      question:
        "You wrap your own 5-attempt retry loop around `client.messages.create()` with the SDK's default settings. What happens on a persistent 429?",
      options: [
        "Exactly 5 attempts — the SDK does not retry",
        "Up to about 15 attempts, because the SDK retries each of your 5 calls twice more",
        "Exactly 1 attempt — the loop is ignored",
        "The SDK disables your loop automatically",
      ],
      answerIndex: 1,
      explain:
        "The SDK auto-retries 429/5xx twice by default (max_retries: 2), so each of your 5 loop iterations becomes up to 3 underlying calls — ~15 total. Pick one layer to own retries: raise the SDK's max_retries, or set it to 0 and own the loop.",
    },
    {
      question:
        "Why is jitter added to exponential backoff delays?",
      options: [
        "To make retries happen faster",
        "So many clients that failed at the same instant don't all retry simultaneously and re-overload the service",
        "Because the retry-after header requires it",
        "To reduce the number of retries to zero",
      ],
      answerIndex: 1,
      explain:
        "Without jitter, a fleet of clients that all hit a 429 together would back off by identical amounts and retry in lockstep — a thundering herd. Randomizing each delay spreads the retries out so the service can recover.",
    },
  ],
};

export default lesson;

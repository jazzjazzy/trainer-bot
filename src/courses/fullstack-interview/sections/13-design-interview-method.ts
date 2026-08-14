import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "design-interview-method",
  title: "The System Design Method: Requirements to Scale",
  part: "System Design Fundamentals",
  estMinutes: 13,
  summary:
    "One reusable four-step frame — requirements, API, data model, scale — carries every system-design round, and the cardinal sin is drawing boxes before asking a single question.",

  concept: `
System design panics people because it feels open-ended. It isn't. Almost every
question yields to the same four-step frame, run in order, and every classic
problem you'll practise — URL shortener, rate limiter, feed, chat, checkout —
is just this method with different nouns. Learn the frame once and you always
know what to say next.

### The four steps

1. **Requirements** — functional (what it does) and non-functional (how fast,
   how many, how consistent). Crucially, you *extract the numbers by asking*:
   "How many daily active users? Read-heavy or write-heavy? Is stale data okay
   for a few seconds?" You cannot design for scale you refused to quantify.
2. **API sketch** — a handful of endpoints with verbs and payloads. This pins
   down the contract and surfaces questions ("does create return the full
   object or just an id?") before any storage exists.
3. **Data model** — the tables or keys and, more importantly, the **access
   patterns**: how is this read, how is it written, what's the hot query. The
   schema follows the access pattern, not the other way around.
4. **Scale** — identify where it breaks *first* as load grows, and name the one
   thing you'd add: a cache for read pressure, a read replica for query load, a
   queue to absorb write bursts, a shard when one box can't hold the data. You
   don't bolt on all four; you reason about which bottleneck arrives first.

### The cardinal sin: boxes before questions

The fastest way to fail is to open with an architecture. "So we'll have a load
balancer, three microservices, Kafka, and a Cassandra cluster..." — before you
know whether this is a hundred users or a hundred million. It signals that you
pattern-match buzzwords instead of designing for a problem. **The strong opening
is questions.** Five minutes of "who uses this, how much, how fast, how
consistent" earns more than any diagram, and it's how you've scoped every client
project for 25 years — requirements-first isn't an interview trick for you, it's
a decades-old habit.

### Budgeting a 45-minute round

Rough thirds. Spend the first ~10 minutes on requirements and the numbers —
this is not throat-clearing, it's the foundation, and rushing it dooms
everything after. Spend the middle ~20 minutes on the API and data model, the
concrete core of the design. Leave the last ~10-15 minutes for scale and
trade-offs, where senior signal lives: "at ten times the load, the read path is
the bottleneck, so I'd put a cache here and accept this staleness." Watch the
clock out loud — "I've got the core down, let me spend my remaining time on
scale" — so you never run out mid-diagram.

### Drive it; don't wait to be led

The interviewer is a collaborator, not an examiner. Announce the step you're on
("let me start with requirements"), state your assumptions and check them
("I'll assume read-heavy, maybe 100:1 — does that match what you had in mind?"),
and move yourself to the next step. A candidate who drives the frame looks like
someone who's led designs before, because you have.
`,

  comparisons: [
    {
      label: "The opening move",
      intro:
        "Same prompt — 'design a URL shortener'. The first thirty seconds of your answer tell the interviewer whether you design for problems or pattern-match buzzwords.",
      php: `// WEAK: boxes before questions.
//
// "Okay, so we'll have an API gateway in front of three
//  microservices, a Kafka topic between them for events, a
//  Cassandra cluster for the mappings, Redis in front of that,
//  and we'll run it all on Kubernetes with autoscaling..."
//
// Interviewer's read: "No idea if this is 100 users or 100
// million. They're reciting an architecture, not designing
// for a problem. This is the anti-signal I screen for."`,
      ts: `// STRONG: questions before boxes.
//
// "Before I draw anything, let me pin the requirements.
//  - Core: shorten a URL, redirect a short code to it.
//  - How many links created per day? And reads per link?
//  - I'd guess very read-heavy, maybe 100:1 — is that right?
//  - Do links expire? Custom aliases? Analytics?
//  - Any latency target on the redirect?"
//
// Interviewer's read: "Extracting the numbers first, checking
// assumptions. This is someone who's scoped real projects."`,
    },
    {
      label: "The API sketch",
      intro:
        "Step two of the frame for the same shortener. A vague hand-wave versus a concrete contract you can actually build against and probe.",
      php: `// WEAK: vague, verbless, unprobeable.
//
// "There's an endpoint to create a short link, and then
//  something to redirect. Maybe one for stats too. We'd
//  return the link and store it somewhere."
//
// Nothing here pins down a verb, a status code, a payload,
// or an idempotency story. There's nothing to design against.`,
      ts: `# STRONG: explicit endpoints, verbs, payloads, codes.

# create a short link (idempotent on the same long URL)
$ curl -XPOST api.short.ly/links \\
    -H 'content-type: application/json' \\
    -d '{"url":"https://example.com/a/very/long/path"}'
  201 -> {"code":"7Gx2a","short":"short.ly/7Gx2a"}

# follow a short code -> 301 to the original
$ curl -i short.ly/7Gx2a
  301 Location: https://example.com/a/very/long/path

# read-only stats for a code
$ curl api.short.ly/links/7Gx2a/stats
  200 -> {"code":"7Gx2a","clicks":1043,"created":"2026-05-01"}`,
      note:
        "The concrete sketch surfaces real design questions — idempotency on create, 301 vs 302 on the redirect, where the click counter lives — that the vague version hides.",
      leftLang: "ts",
      rightLang: "bash",
    },
    {
      label: "Reasoning about scale",
      intro:
        "The final step. One candidate sprinkles infrastructure everywhere; the other names where it breaks first and adds one targeted thing.",
      php: `// WEAK: everything, everywhere, unjustified.
//
// "For scale we'd add Redis, and Kafka, and shard the DB, and
//  add read replicas, and a CDN, and a message queue, and..."
//
// Interviewer: "Which of those solves which bottleneck? At
// what load does each become necessary? No idea. This is a
// shopping list, not reasoning."`,
      ts: `// STRONG: name the first bottleneck, add one thing.
//
// "At the numbers we assumed it's overwhelmingly reads — the
//  redirect path. So the first bottleneck is read load on the
//  code->URL lookup. The mapping is immutable once created,
//  which makes it ideal to cache: I'd put a cache in front of
//  the lookup, expecting a very high hit rate, and only then
//  look at a read replica if the cache misses still hurt.
//  Writes are comparatively tiny, so the primary handles those
//  fine for a long time."
//
// Interviewer: "Bottleneck identified from the numbers, one
// justified addition, knows what NOT to add yet. Senior."`,
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A filled-in design-doc skeleton for a generic 'save-and-share notes' service, following the four-step frame. Read it as an interviewer would: predict which steps pass and which invite the next probing question.",
    code: `# design.yaml — a notes service, run through the four-step frame

step_1_requirements:
  functional:
    - create a note, read a note by id, list my notes
    - share a note via a public read-only link
  non_functional:
    numbers_extracted_by_asking:
      dau: 2_000_000
      notes_created_per_user_per_day: 5     # write rate
      reads_per_note: 20                     # read-heavy, ~20:1 overall
    latency_target_ms: 200
    consistency: "read-your-own-writes; public links may lag a few seconds"

step_2_api:
  - "POST   /notes            -> 201 {id}"
  - "GET    /notes/:id        -> 200 {note}"
  - "GET    /notes            -> 200 [{note}]   # my notes, paginated"
  - "POST   /notes/:id/share  -> 201 {token}"
  - "GET    /public/:token    -> 200 {note}     # no auth"

step_3_data_model:
  notes:
    keys: "id (pk), owner_id (indexed), created_at"
    access_patterns:
      - "by id           -> primary key lookup"
      - "list by owner   -> index on (owner_id, created_at)"
  share_tokens:
    keys: "token (pk) -> note_id"

step_4_scale:
  first_bottleneck: "read load on GET /notes/:id and public links"
  additions_in_order:
    - "cache hot notes + public links (TTL a few seconds)"
    - "read replica once cache misses still pressure the primary"
    - "shard by owner_id only if a single primary can't hold writes"
  deliberately_not_yet: ["queue", "search cluster", "microservices"]`,
    output: `Interviewer's review, step by step:

step_1 (requirements): PASS. Numbers were extracted by asking, not
  invented. read:write ratio and a consistency stance are stated.
  Probe: "read-your-own-writes but public links can lag — why is
  that trade-off safe for this product?" (Good sign they asked it.)

step_2 (api): PASS. Verbs, paths, status codes, pagination on the
  list. Probe: "POST /notes on a retry — is it idempotent, or do I
  get two notes?" (The sketch doesn't say yet. Follow-up earned.)

step_3 (data_model): STRONG. The (owner_id, created_at) index is
  chosen to serve the exact list access pattern, not bolted on.
  Probe: "how does GET /public/:token avoid a table-scan?" -> the
  token pk answers it. Good.

step_4 (scale): STRONG. Names the FIRST bottleneck from the stated
  numbers (reads), adds one thing at a time, and explicitly lists
  what NOT to build yet. This is the senior-signal section.
  Probe: "walk me through a cache invalidation when a note is
  edited." (The natural next question — Part 4 territory.)

Overall: drove the frame in order, quantified before designing,
justified each scaling step. A clear hire-signal design round.`,
  },

  keyPoints: [
    "Every system-design question yields to one four-step frame: requirements, API sketch, data model, scale — run in that order.",
    "Extract the numbers by asking (DAU, read/write ratio, latency, consistency tolerance) — you cannot design for scale you refused to quantify.",
    "The cardinal sin is boxes before questions: opening with 'load balancer, microservices, Kafka' before knowing the scale is the anti-signal interviewers screen for.",
    "The data model follows the access pattern — decide how it's read and written first, then choose keys and indexes to serve those exact queries.",
    "For scale, name where it breaks FIRST and add one targeted thing (cache, replica, queue, shard); knowing what NOT to add yet is itself senior signal.",
    "Budget a 45-minute round in rough thirds — ~10 min requirements, ~20 min API and data, ~10-15 min scale — and watch the clock out loud.",
    "Requirements-first is how you've scoped client projects for 25 years — drive the frame, state and check assumptions, don't wait to be led.",
  ],

  interview: [
    {
      q: "How do you approach an open-ended system-design question?",
      a: "I run the same four-step frame every time so I'm never guessing what to say next: requirements, then an API sketch, then the data model, then scale. I start by extracting the numbers by asking — daily active users, read versus write ratio, latency target, how much staleness is acceptable — because I can't design for a scale nobody's quantified. Then I sketch the handful of endpoints, then the tables and the access patterns they serve, and I save the last third for where it breaks first and the one thing I'd add there. Honestly this is how I've scoped client projects for 25 years; requirements before architecture is a habit, not a technique I put on for interviews.",
    },
    {
      q: "What's the most common mistake candidates make in a design round?",
      a: "Drawing boxes before asking a single question — opening with 'we'll have a load balancer, three microservices, and a Kafka cluster' before they know whether it's a hundred users or a hundred million. It signals pattern-matching on buzzwords instead of designing for the actual problem, and it commits you to complexity you can't justify. The fix is to open with five minutes of questions and let the numbers drive the design. An architecture that falls out of stated requirements always beats one recited from memory.",
    },
    {
      q: "How do you budget your time in a 45-minute design interview?",
      a: "Rough thirds, and I say it out loud so the interviewer knows I'm managing it. The first ten minutes are requirements and the numbers — that's the foundation, so I don't let myself rush it. The middle twenty are the concrete core: the API sketch and the data model with its access patterns. I deliberately protect the last ten to fifteen minutes for scale and trade-offs, because that's where senior signal lives — identifying the first bottleneck and reasoning about the one thing I'd add. If I feel time slipping I'll say 'I've got the core down, let me move to scale now' rather than run out mid-diagram.",
    },
  ],

  quiz: [
    {
      question:
        "What are the four steps of the reusable system-design frame, in order?",
      options: [
        "Draw the architecture, pick a database, add caching, scale out",
        "Requirements, API sketch, data model, scale",
        "Microservices, message queue, sharding, replication",
        "Estimate load, write code, test, deploy",
      ],
      answerIndex: 1,
      explain:
        "Requirements (with numbers extracted by asking), then a small API sketch, then the data model driven by access patterns, then scale — identify the first bottleneck and add one targeted thing. Every classic question is this frame with different nouns.",
    },
    {
      question:
        "Why is opening a design answer with 'we'll use a load balancer, microservices, and Kafka' a mistake?",
      options: [
        "Those technologies are outdated",
        "You've committed to an architecture before knowing the scale or requirements it must serve",
        "Interviewers dislike naming specific tools",
        "It takes too long to say",
      ],
      answerIndex: 1,
      explain:
        "Boxes-before-questions signals pattern-matching on buzzwords rather than designing for the problem. Whether it's a hundred or a hundred-million-user system completely changes the design, and you can't know until you ask. Strong candidates open with requirements questions.",
    },
    {
      question:
        "In the scale step, what distinguishes a senior answer?",
      options: [
        "Adding caching, replicas, queues, and sharding all at once for safety",
        "Naming where the system breaks first and adding one targeted thing, while knowing what not to add yet",
        "Choosing the trendiest datastore available",
        "Refusing to discuss scale until the code is written",
      ],
      answerIndex: 1,
      explain:
        "A shopping list of infrastructure is an anti-signal. The senior move is to identify the first bottleneck from the stated numbers, add the one thing that addresses it (a cache for read pressure, say), and articulate why the others aren't needed yet.",
    },
  ],
};

export default lesson;

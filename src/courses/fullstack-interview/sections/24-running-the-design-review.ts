import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "running-the-design-review",
  title: "How Interviewers Grade Design Rounds",
  part: "The Classic Questions",
  estMinutes: 12,
  summary:
    "The rubric behind a system-design round — problem exploration, trade-off reasoning, quantification, depth on one component, communication — and how to clear the senior bar by driving the conversation and volunteering failure modes.",

  concept: `
Every design question you've practised is graded against the same rubric. Once
you can see the scorecard, you stop performing and start scoring. This capstone
turns the interviewer's chair around.

### The five rubric lines

1. **Problem exploration** — did you nail down requirements, scale, and scope
   before drawing? Read/write ratio, QPS, data size, latency target.
2. **Trade-off reasoning** — for every choice, did you name the alternative and
   say *why* you rejected it? A design with no rejected options looks lucky, not
   reasoned.
3. **Quantification** — did you put numbers on it? "50M followers = 50M writes",
   "5 writes/s is one modest Postgres box". Numbers are the difference between
   an opinion and an argument.
4. **Depth on one component** — did you go deep somewhere (the data model, the
   cache, the rate limiter) instead of staying shallow everywhere?
5. **Communication** — did you drive, structure the time, and think out loud so
   the interviewer could follow and steer?

### The senior bar

Mid-level candidates answer the question. Senior candidates **run the session**:

- **Drive the conversation** — propose the agenda ("requirements, then data
  model, then scale"), don't wait to be prompted.
- **Volunteer failure modes** — say "here's where this breaks" before you're
  asked. Naming your design's weak point is the strongest signal in the room.
- **Adapt when requirements change mid-round** — interviewers *deliberately*
  change the ask ("now it's 100x traffic") to watch you re-reason, not recite.

### Failure modes from real debriefs

- **Buzzword architecture with no numbers** — "Kafka, Cassandra, a CDN, and
  Kubernetes" with no QPS and no justification. Reads as pattern-matching.
- **"We'll use Kafka" with no why** — naming a tool without the problem it
  solves. Interviewers immediately ask "why not a database table?" and there's
  no answer.
- **Ignoring the interviewer's hints** — when they ask "what happens if that
  cache goes down?" that's a gift pointing at what to discuss, not an attack.
- **Spending 40 minutes on requirements** — over-scoping so you never design
  anything. Time-box: ~5 minutes scoping, then draw.

### Recovery when probed on something you don't know

You *will* be asked about something unfamiliar. Bluffing a fake fact is the only
fatal move — interviewers can tell, and it poisons everything else you said.
Instead, **reason from fundamentals out loud**: "I haven't used that specific
system, but the problem is X; from first principles I'd want Y and Z, so I'd
expect a solution to look like...". They are scoring the *reasoning*, not
whether you've memorised the product. A calm, honest derivation beats a
confident wrong fact every time — and 25 years of production judgment is exactly
what makes the derivation credible.
`,

  comparisons: [
    {
      label: "The one-paragraph design summary",
      intro:
        "You're asked to summarise your design in 30 seconds. The weak version is a wall of brand names; the strong version is the same length but every clause carries a number and a reason.",
      php: `/* WEAK — buzzword-dense, zero quantification.
   An interviewer hears pattern-matching, not reasoning.

   "I'd use a microservices architecture with Kafka for
    events, Cassandra for storage because it scales, Redis
    for caching, an API gateway, a CDN, and deploy it all
    on Kubernetes with auto-scaling for high availability."

   Follow-ups it invites (all unanswerable as written):
     - Why Cassandra over Postgres? What's the access pattern?
     - What QPS are we scaling for? How big is the data?
     - What does Kafka carry, and why not a jobs table?
*/`,
      ts: `/* STRONG — same length, every clause has a number + a why.

   "Reads dominate ~100:1, ~5k read QPS, ~50 write QPS, data
    under 100 GB — so a single primary Postgres with read
    replicas handles it, no sharding needed yet. I cache hot
    reads in Redis with a short TTL for a ~90% hit rate, and
    push email/fulfilment onto a queue so writes stay fast.
    The one thing I'd watch is cache stampede on a popular
    key, which I'd fix with a lock-and-refill."

   Follow-ups it invites (all ones you WANT):
     - Great, when does sharding become necessary? (you have
       the threshold ready)
     - Walk me through the stampede fix. (you led them there)
*/`,
      note:
        "Same word count, opposite signal: the weak version lists tools, the strong version states the access pattern, the numbers that justify each choice, and volunteers the failure mode — which steers the follow-ups toward your strengths.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Handling the mid-round curveball",
      intro:
        "Forty minutes in, the interviewer says 'actually, now imagine 100x the traffic'. The weak response is defensive; the strong response treats the change as the point of the exercise.",
      php: `/* WEAK — hears the curveball as an attack on the design.

   "Well, that breaks my design... I mean, 100x is a lot,
    I'd probably have to rewrite most of this. I guess the
    database wouldn't handle it. Can we go back to the
    original numbers? I had that working."

   What the interviewer writes down:
     - rigid; couldn't adapt when requirements moved
     - treated a normal scaling question as a failure
     - defensive under pressure
*/`,
      ts: `/* STRONG — treats the change as the actual test.

   "Good — let's find where it breaks first. At 100x, writes
    go from ~50 to ~5k QPS and the data outgrows one box, so
    the single primary is now the bottleneck. Two moves: shard
    the writes by a stable key so no single node is hot, and
    add a write-behind queue to absorb bursts. Reads were
    already replica-served, so those mostly scale with more
    replicas. The new risk is cross-shard queries — I'd design
    the shard key to keep the common query on one shard."

   What the interviewer writes down:
     - identified the bottleneck with numbers, adapted calmly
     - drove the re-design, volunteered the new failure mode
*/`,
      note:
        "The curveball is deliberate — they want to watch you re-reason, not recite. The strong answer locates the bottleneck quantitatively, proposes a scoped change, and names the new risk the change introduces.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A candidate's submitted URL-shortener design, written as a spec. Read it as an interviewer and predict the scorecard: which of the five rubric lines score well and which get docked. The output is the real debrief.",
    code: `# Candidate submission: "Design a URL shortener (TinyURL)"
requirements_gathering:
  time_spent: "45 seconds"
  clarified: "none — jumped straight to the architecture"
  scale_assumptions: "not stated"

api:
  - "POST /shorten { url } -> { shortUrl }"
  - "GET /:code -> 301 redirect"

data_model:
  table: links
  columns: [code PK, long_url, created_at]
  code_generation: "base62 of an auto-increment id"
  note: "deep dive — discussed collisions, why base62, sequential-id leakage"

storage_choice:
  picked: "Cassandra"
  justification: "it scales"

caching:
  layer: "Redis in front of reads"
  ttl: "not discussed"
  quantification: "no read/write ratio or QPS given"

extras_mentioned: ["Kafka", "Kubernetes", "a CDN", "GraphQL"]
failure_modes_volunteered: "none"`,
    output: `INTERVIEWER SCORECARD — URL shortener
overall: NO HIRE (borderline) — strong on data model, thin everywhere else

[1] Problem exploration ............ 2/5
    Jumped to architecture in 45s. Never established the one number
    that shapes this whole design: reads dominate writes ~100:1, so
    the redirect path is what must be fast. No QPS, no data size.

[2] Trade-off reasoning ............ 2/5
    "Cassandra because it scales" is not a trade-off — no alternative
    named, no rejection reason. This is a read-heavy key-value lookup
    that a single Postgres with replicas serves comfortably; the
    unjustified Cassandra pick reads as pattern-matching.

[3] Quantification ................. 1/5
    Almost none. No read/write ratio, no QPS, no data-size estimate,
    no cache hit-rate target. Every sizing decision was asserted.

[4] Depth on one component ......... 4/5
    Real strength: the code-generation deep dive (base62, collision
    handling, sequential-id leakage) was genuinely senior. This alone
    keeps the candidate off a clear no-hire.

[5] Communication .................. 2/5
    Buzzword tail (Kafka, Kubernetes, CDN, GraphQL) with no role in
    the design actively hurt — invited "why?" questions with no
    answers. Volunteered zero failure modes.

DEBRIEF: Knows data modelling deeply; does not yet drive a design from
requirements and numbers. Would re-interview if they lead with the
read/write ratio and cut the unjustified tool names.`,
  },

  keyPoints: [
    "Design rounds grade five lines: problem exploration, trade-off reasoning, quantification, depth on one component, and communication — design to score each one.",
    "For every choice, name the alternative and why you rejected it; a design with no rejected options looks lucky, not reasoned.",
    "Quantify relentlessly — a read/write ratio, QPS, and data size turn assertions into arguments and steer follow-ups toward your strengths.",
    "Clear the senior bar by driving: propose the agenda, volunteer failure modes before you're asked, and adapt calmly when requirements change mid-round.",
    "Avoid the classic debrief killers: buzzword architecture with no numbers, naming a tool with no 'why', ignoring the interviewer's hints, and spending 40 minutes scoping.",
    "When probed on something unknown, reason from fundamentals out loud instead of bluffing — interviewers score the reasoning, and a confident wrong fact is the only fatal move.",
  ],

  interview: [
    {
      q: "What separates a mid-level system-design answer from a senior one?",
      a: "Driving. A mid-level candidate answers the question that's asked; a senior candidate runs the session. I propose the agenda up front — requirements, data model, then scale — instead of waiting to be prompted, and I time-box scoping to about five minutes so I actually design something. For every decision I name the alternative and why I rejected it, I put numbers on the sizing, and I go deep on one component rather than staying shallow everywhere. The clearest senior tell is volunteering failure modes: saying 'here's where this breaks and how I'd handle it' before I'm asked. And when the interviewer changes the requirements mid-round — which they do on purpose — I treat that as the test and re-reason calmly rather than getting defensive.",
    },
    {
      q: "In a design round you're asked about a technology you've never used. What do you do?",
      a: "I say so, then reason from fundamentals out loud — never bluff a fact, because that's the one move that's actually fatal and interviewers can always tell. I'd say something like 'I haven't run that specific system in production, but the problem it's solving is X; from first principles I'd want properties Y and Z — say, ordered durable delivery and horizontal partitioning — so I'd expect a good solution to look roughly like this'. Then I reason toward it. They're scoring the quality of the reasoning, not whether I've memorised a product, and after 25 years of production systems my derivation is usually close. A calm, honest first-principles derivation beats a confident wrong answer every single time.",
    },
    {
      q: "Why is quantification weighted so heavily in the rubric?",
      a: "Because numbers are what separate an opinion from an argument. If I say 'we'll need a distributed database', that's a guess; if I say 'writes are about 50 a second and the data's under 100 gigabytes, so a single primary with read replicas is plenty — we don't shard until writes cross a few thousand a second', that's a defensible decision with a threshold attached. Quantification also drives the whole design: the read/write ratio tells you which path to optimise, the QPS tells you how many boxes, the data size tells you whether to shard. And it steers the follow-ups — when I state the threshold for sharding, the interviewer's natural next question is one I've already prepared for.",
    },
  ],

  quiz: [
    {
      question: "An interviewer asks 'what happens when that cache goes down?' How should you read that?",
      options: [
        "As an attack on your design that you should defend against",
        "As a hint pointing at exactly what they want you to discuss next",
        "As a sign you should switch to a different architecture",
        "As an irrelevant edge case you can wave away",
      ],
      answerIndex: 1,
      explain:
        "Interviewer questions are gifts, not ambushes — they point at the area you should go deeper on. Ignoring the hint is a documented failure mode; leaning into it (cache-down behaviour, stampede, fallback to the DB) scores communication and depth.",
    },
    {
      question: "Which of these most damages a design-round score?",
      options: [
        "Going deep on the data model and less deep elsewhere",
        "Naming tools like Kafka and Cassandra with no numbers and no justification",
        "Spending five minutes clarifying requirements before drawing",
        "Volunteering where your own design would break",
      ],
      answerIndex: 1,
      explain:
        "Buzzword architecture with no QPS, no data size, and no 'why not the simpler option' reads as pattern-matching and invites follow-ups you can't answer. Deep-on-one-component, brief scoping, and volunteering failure modes are all positive signals.",
    },
    {
      question: "You're asked about a system you've genuinely never used. Best move?",
      options: [
        "Confidently state what you think it does and hope it's right",
        "Say you don't know it and stop there",
        "Admit you haven't used it, then reason from fundamentals about what it would need to do",
        "Change the subject to something you know well",
      ],
      answerIndex: 2,
      explain:
        "Bluffing a fact is the fatal move — interviewers detect it and it discredits the rest. Reasoning from first principles out loud is exactly what they're grading; honesty plus a credible derivation scores far higher than a confident wrong fact.",
    },
  ],
};

export default lesson;

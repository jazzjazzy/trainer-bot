import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "take-home-strategy",
  title: "Take-Home Strategy: Where Veterans Win",
  part: "Live Coding & Take-Homes",
  estMinutes: 13,
  summary:
    "Take-homes reward exactly what 25 years builds — scoping, clear organisation, a README that explains decisions, and one test on the core path — so respect the timebox and document what you deliberately left out.",

  concept: `
The take-home is the round where your experience is worth the most, because it
grades the things juniors don't know to do: scoping ruthlessly, organising code
so a stranger understands it in two minutes, writing down *why* you made each
call, and proving the core path with a test. None of that is about clever
algorithms. All of it is about judgment — which is exactly what 25 years buys.

### The reviewer's real rubric

A reviewer opens your submission tired, with five others to get through. In the
first five minutes they are answering three questions, in this order:

1. **Does it run on the first try?** \`npm install && npm test && npm start\`
   with no surprises. If it doesn't start, nothing else you did matters —
   they've already formed an opinion.
2. **Are the trade-offs written down?** A README that says *why* you used an
   in-memory store instead of Postgres tells them you made a decision, not that
   you didn't know better.
3. **Is there at least one test proving the core?** One meaningful test on the
   part most likely to hide a bug beats forty trivial ones on getters.

Everything else — perfect coverage, exotic patterns, a slick UI — is below the
waterline. Get those three right and you're already ahead of most submissions.

### Timebox discipline

The brief says "about four hours." Treat that as a hard constraint, because
respecting it *is* the test — real work is always time-boxed. The trap is not
"I ran out of time." The trap is spending hour four gold-plating instead of
writing the README. When you hit the limit, **stop and list the cut corners in
the README** rather than pushing on. "I capped this at four hours; with more I'd
add X and Y" reads as senior judgment. Silently shipping a half-finished
sixth feature reads as someone who can't scope.

### The veteran trap: over-engineering

The specific way experienced developers lose take-homes is over-engineering.
Abstract factories, a dependency-injection container, hexagonal ports-and-
adapters, and three layers of interfaces — for one endpoint due in four hours —
does not read as "senior." It reads as **poor judgment about scope**, which is
the single thing the exercise is designed to measure. The senior move is boring,
obvious code that a stranger reads top to bottom without a map. Save the
architecture story for the "what I'd do with more time" section.

### The README skeleton

Three headings do almost all the work:

\`\`\`text
## How to run     — the exact commands, in order, that just work
## Decisions      — what I chose and WHY (store, validation, structure)
## With more time — what I'd build next, and what I deliberately cut
\`\`\`

That last heading is where you convert missing features from a weakness into
evidence of scoping. You knew what to build *and* what not to — say so.
`,

  comparisons: [
    {
      label: "The README a reviewer opens first",
      intro:
        "The README is the first thing read and the last thing most candidates write. One version leaves the reviewer guessing; the other answers their three questions before they ask.",
      php: `# README.md

# my-app

## Setup

npm install
npm start

## Notes

Built the orders API. Let me know if you have questions.`,
      ts: `# README.md

# Orders API — take-home submission

## How to run
npm install
npm test     # 6 tests; covers the pricing/discount core
npm start    # serves on http://localhost:3000

## Decisions
- In-memory store, not Postgres. The brief said ~4 hours and
  the grader runs \`npm start\`; a real DB adds setup friction
  without exercising the logic actually under test. The store
  sits behind one interface, so swapping it is a small change.
- Validation with a schema at the HTTP boundary; the domain
  code trusts its inputs and stays clean.
- One integration test on the pricing path — the part most
  likely to hide a bug — plus unit tests on the discount rules.

## With more time
- Swap the in-memory store for Postgres behind the same interface.
- Idempotency keys on POST /orders (retries are inevitable).
- The discount calc is O(n*m) on line items; I'd load-test it.

## Deliberately cut (out of scope, noted in the brief)
- No auth, no pagination on GET /orders.`,
      note:
        "The strong README answers 'does it run / are trade-offs written down / is the core tested' before the reviewer has to dig — and turns cut features into evidence of scoping.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "File structure: over-abstracted vs boring-and-clear",
      intro:
        "Same four-hour exercise, same single endpoint. One structure signals architecture chops; the other signals judgment. Only one of those is being graded.",
      php: `// src/ — the veteran trap: architecture for its own sake
//
// src/
//   core/
//     domain/entities/Order.ts
//     domain/valueobjects/Money.ts
//     application/ports/OrderRepositoryPort.ts
//     application/usecases/CreateOrderUseCase.ts
//     infrastructure/persistence/InMemoryOrderRepository.ts
//     infrastructure/di/Container.ts
//   factories/AbstractOrderFactory.ts
//
// Reviewer: "Ports, adapters, a DI container and an abstract
// factory for ONE endpoint due in four hours. This reads as
// poor judgment about scope, not senior skill. Lean no."`,
      ts: `// src/ — boring, obvious, read top-to-bottom in 2 minutes
//
// src/
//   server.ts        // wire routes, start listening
//   orders.ts        // the two handlers: create, get
//   pricing.ts       // discount logic — the interesting part
//   pricing.test.ts  // tests ON the interesting part
//   store.ts         // in-memory Map behind one interface
//
// Reviewer: "Understood the whole thing in two minutes, tests
// are on the logic that matters, right-sized for the brief.
// This is what a senior submission looks like."`,
      note:
        "Over-engineering is the specific way experienced developers fail take-homes — the exercise measures scope judgment, and boring code that a stranger reads without a map is the strong answer.",
    },
    {
      label: "Hour four: gold-plate vs document and stop",
      intro:
        "You're at the timebox with a working core and one feature unstarted. What you do in the last hour is itself the thing being scored.",
      php: `// WEAK: push past the timebox on a sixth feature.
//
// - Start building CSV export at hour 4.
// - Half-finish it; it throws on empty input.
// - No README written; no tests on the new code.
// - Submit at hour 6, over the brief, with a broken feature
//   and no explanation.
//
// Reviewer: "Went over time AND shipped something broken.
// Can't scope. This is the exact failure mode we screen for."`,
      ts: `// STRONG: respect the box, convert the gap to signal.
//
// - Stop coding at the four-hour mark, core working.
// - Spend the last 20 minutes on the README.
// - "With more time I'd add CSV export and pagination;
//    I capped this at 4 hours as the brief asked."
// - Submit on time, running clean, with the cuts named.
//
// Reviewer: "Scoped it, hit the box, told me exactly what
// they'd do next. Senior judgment. Strong yes."`,
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "The reviewer's literal first five minutes with your submission — the transcript that decides the grade before they read a single line of your code. Predict what each command prints and where a pass is won or lost.",
    code: `# Reviewer opens the tired-at-9pm submission. Predict each step.
$ unzip orders-api.zip -d orders-api && cd orders-api
$ head -6 README.md

$ npm install

$ npm test

$ npm start &
$ curl -s -XPOST localhost:3000/orders \\
    -H 'content-type: application/json' \\
    -d '{"item":"book","qty":2,"code":"SAVE10"}'

$ curl -s localhost:3000/orders/1`,
    output: `# Orders API — take-home submission
## How to run
npm install
npm test     # 6 tests; covers the pricing/discount core
npm start    # serves on http://localhost:3000

added 214 packages in 6s

> orders-api@1.0.0 test
> vitest run

 ✓ pricing.test.ts (6 tests) 41ms
   ✓ applies SAVE10 as 10% off the subtotal
   ✓ rejects an unknown discount code
   ✓ never lets a discount push the total below zero

 Test Files  1 passed (1)
      Tests  6 passed (6)

listening on http://localhost:3000

{"id":1,"item":"book","qty":2,"subtotal":2000,"discount":200,"total":1800}

{"id":1,"item":"book","qty":2,"subtotal":2000,"discount":200,"total":1800}

# Reviewer's verdict: ran first try, README explained the
# trade-offs, the core discount path has a real test, and the
# endpoint works. Three-for-three in five minutes -> strong pass,
# before a single line of implementation was read.`,
  },

  keyPoints: [
    "A tired reviewer answers three questions in the first five minutes: does it run first try, are the trade-offs written down, is there one real test on the core.",
    "If it doesn't `npm install && npm start` cleanly, nothing else you built counts — they've already formed the opinion.",
    "Respect the stated timebox as a hard constraint; the trap isn't running out of time, it's gold-plating in hour four instead of writing the README.",
    "The veteran failure mode is over-engineering — abstract factories and DI containers for one endpoint read as poor scope judgment, which is exactly what's being measured.",
    "Boring, obvious code a stranger reads top-to-bottom in two minutes beats a clever layered architecture every time on a take-home.",
    "Use a three-heading README — How to run / Decisions (with why) / With more time — and list deliberately cut corners to turn missing features into scoping evidence.",
  ],

  interview: [
    {
      q: "How do you approach a four-hour take-home exercise?",
      a: "I treat the four hours as a hard constraint, because respecting the box is part of what's being graded. I start by scoping: what's the core the exercise is really testing, and what can I explicitly leave out. I build that core with boring, readable code and put one solid test on the part most likely to hide a bug — usually the business logic, not the plumbing. I reserve the last twenty minutes for the README, which explains the decisions I made and why, and lists what I'd do with more time. If I hit the limit mid-feature I stop and document the cut rather than push over time, because after 25 years I know that shipping something scoped and running beats shipping something bigger and broken.",
    },
    {
      q: "A lot of experienced developers over-engineer take-homes. How do you avoid that?",
      a: "By remembering what the exercise measures, which is judgment about scope, not how many patterns I can name. For one endpoint due in four hours, a dependency-injection container and an abstract factory aren't seniority, they're the exact anti-signal the reviewer is screening for. So I write the simplest structure that a stranger can read top to bottom in two minutes, put the one interface where it genuinely buys a future swap — the data store — and nowhere else. Then I move the architecture conversation into the README's 'with more time' section, where it reads as vision instead of gold-plating.",
    },
    {
      q: "What goes in the README, and why does it matter so much?",
      a: "Three headings do the work: how to run it with exact commands, the decisions I made and why, and what I'd do with more time. It matters because a tired reviewer forms their opinion in the first five minutes, and the README is what turns 'they used an in-memory store' from a possible gap into a visible, deliberate trade-off. I always include a line naming what I cut on purpose — no auth, no pagination — because that converts a missing feature into evidence that I knew both what to build and what not to build, which is the whole point of a scoping exercise.",
    },
  ],

  quiz: [
    {
      question:
        "What is the single most important thing about a take-home submission in the reviewer's first five minutes?",
      options: [
        "That it has near-100% test coverage",
        "That it runs on the first try with the documented commands",
        "That it demonstrates an advanced architectural pattern",
        "That the code is heavily commented throughout",
      ],
      answerIndex: 1,
      explain:
        "If `npm install && npm start` surprises the reviewer, they've already formed a negative opinion and nothing below the waterline recovers it. Running cleanly first try is the price of admission before decisions, tests, or structure even get evaluated.",
    },
    {
      question:
        "Why is building an abstract factory and a DI container for a one-endpoint, four-hour take-home a mistake?",
      options: [
        "Those patterns don't work in TypeScript",
        "It signals poor judgment about scope — the exact quality the exercise measures",
        "Reviewers can't understand advanced patterns",
        "It always introduces runtime bugs",
      ],
      answerIndex: 1,
      explain:
        "Take-homes grade scope judgment. Heavy architecture for a tiny, time-boxed problem reads as an inability to right-size the solution, which is the failure mode reviewers are specifically watching for. Boring, obvious code plus a 'with more time' note is the senior answer.",
    },
    {
      question:
        "You hit the four-hour timebox with the core working but one feature unstarted. What's the strong move?",
      options: [
        "Keep going for two more hours to finish everything",
        "Delete the unfinished feature and never mention it",
        "Stop, and note the cut plus what you'd do next in the README",
        "Submit the half-finished feature as-is to show effort",
      ],
      answerIndex: 2,
      explain:
        "Respecting the timebox is part of the test. Stopping on time with a clean core and a README that names the deliberate cut converts a missing feature into evidence of scoping. Going over time with broken code demonstrates exactly the inability to scope that sinks candidates.",
    },
  ],
};

export default lesson;

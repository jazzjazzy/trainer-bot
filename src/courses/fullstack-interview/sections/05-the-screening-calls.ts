import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "the-screening-calls",
  title: "Recruiter and Hiring-Manager Screens",
  part: "Positioning & Pipeline",
  estMinutes: 12,
  summary:
    "Two 30-minute calls gate the whole loop — the recruiter screen (logistics, salary, 'tell me about yourself') and the hiring-manager screen (motivation, technical narrative, red flags) — and both are won with a rehearsed 90-second arc and a calm deferral on comp.",

  concept: `
Before any coding happens, you clear two 30-minute phone calls, and most
candidates treat them as formalities and under-prepare. They are not
formalities — they are gates, and each one scores something specific. Walk in
knowing what's being measured and you sail through; wing it and you can lose
the whole loop on a call you thought didn't count.

### The recruiter screen: logistics and coherence

The recruiter is not evaluating your code. In 30 minutes they check three
things: does your story hang together, do the logistics work (location, visa,
notice period, timeline), and — the one that matters most — are your salary
expectations inside their band. They also almost always open with **"tell me
about yourself"**. Give them a coherent story and a workable set of logistics
and you pass; the recruiter becomes your advocate and your guide through the
rest of the process.

### The hiring-manager screen: motivation and red flags

The hiring manager screen is deeper. They are scoring your motivation (why
*this* role, why now), your technical narrative (can you describe what you've
built in a way that sounds senior), and they are quietly running a red-flag
scan — job hopping, badmouthing past employers, vagueness where there should
be specifics. This is where a stack-switcher gets the pointed questions, and
you want them rehearsed rather than improvised.

### The 90-second self-intro arc

"Tell me about yourself" is not an invitation to narrate your CV from 2001.
It has a three-beat structure, and 90 seconds is the target:

- **Present** — one line on who you are *now*: "I'm a full-stack engineer
  with 25 years shipping production web systems, now working in TypeScript
  and Node."
- **Proof from the past** — two or three quantified highlights: the platform
  you owned, the scale, a migration, an outcome.
- **Why this role** — a specific reason you're talking to *them*, not a
  generic one.

Rehearse it aloud until it's 90 seconds and calm. It is the most predictable
question in the entire process; there is no excuse for rambling through it.

### Deflecting early salary anchoring

Recruiters ask for a salary number early because whoever names one first
anchors the negotiation, and it's rarely to your advantage to answer. You
don't refuse — you defer, politely and once:

\`\`\`
"I'm targeting market rate for senior full-stack roles. I'm happy to
 talk specifics once we both know it's a fit — what range is budgeted
 for this position?"
\`\`\`

That's calm, it turns the question back to their band, and it keeps you from
anchoring low. If pressed, give a researched range, not a single number, and
bias it slightly high.

### The stack-switcher's guaranteed questions

You *will* get "why TypeScript now?" and "how current are you?". Have a
rehearsed one-paragraph answer for each. "Why TypeScript now" is a
deliberate-choice story, not an apology. "How current are you" is answered
with recent, concrete evidence — a shipped app, the versions you're using,
the fact that TypeScript 7 is the Go rewrite and you know why that matters.
Calm and specific beats defensive every time.
`,

  comparisons: [
    {
      label: "\"Tell me about yourself\"",
      intro:
        "The opening question of nearly every screen. One rambles chronologically; the other hits the present-proof-motive arc in about 90 seconds.",
      php: `// Weak: chronological ramble, no arc
//
// "So I started out in 2001 doing PHP for a small
//  agency, then I moved to another company where I
//  did more PHP and some MySQL, and then around
//  2009 I... actually it might have been 2010... I
//  joined a bigger team, and we used a lot of
//  different things over the years, and, um, yeah,
//  now I'm learning TypeScript I guess. There's a
//  lot, hard to summarise 25 years really."
//
// Four minutes, no scope, no numbers, no point.`,
      ts: `// Strong: present -> proof -> why, ~90 seconds
//
// "I'm a full-stack engineer with 25 years shipping
//  production web systems, now working in TypeScript
//  and Node.
//
//  For eight years I owned an e-commerce platform
//  doing 12,000 orders a day — architecture, on-call,
//  a migration off a legacy stack with zero downtime.
//
//  Lately I retrained deliberately into TS and
//  SvelteKit, and I'm here because you're scaling a
//  checkout system, which is exactly what I operated
//  for a decade."
//
// Tight, quantified, ends on why THEM.`,
      note:
        "The arc is present → proof → why-this-role. It's the most predictable question in the process — rehearse it to 90 calm seconds and there's no excuse to ramble.",
    },
    {
      label: "The early salary question",
      intro:
        "The recruiter asks for your number in the first 30 minutes. One anchors you low on the spot; the other defers politely and turns it back to their band.",
      php: `// Weak: blurts a number, anchors low
//
// Recruiter: "What are your salary expectations?"
//
// "Oh, um — I was on about 110 in my last role, so
//  maybe around there? Honestly I've been out of
//  the market a while and I'm switching stacks, so
//  I'm pretty flexible, whatever works really."
//
// Names a number first, anchors to an old/low base,
// and signals 'flexible' = cheap. Money left on
// the table before the loop even starts.`,
      ts: `// Strong: defers once, turns it back to their band
//
// Recruiter: "What are your salary expectations?"
//
// "I'm targeting market rate for senior full-stack
//  roles. I'm happy to get specific once we both
//  know it's a fit — what range is budgeted for
//  this position?"
//
// (If pressed for a number, give a researched RANGE,
//  biased slightly high, not a single figure.)
//
// Calm, non-committal, and it makes their band the
// anchor instead of your history.`,
      note:
        "Whoever names a number first anchors the negotiation. You defer once, politely, and ask for their range — 'flexible' reads as 'cheap', and an old base number anchors you below market.",
    },
    {
      label: "\"Why TypeScript now, after 25 years of PHP?\"",
      intro:
        "The question every stack-switcher gets on the hiring-manager screen. One apologises; the other frames it as a deliberate, evidenced choice.",
      php: `// Weak: apologetic, sounds forced
//
// "Yeah, honestly PHP work has been drying up and
//  everyone wants JavaScript now, so I figured I
//  had to learn TypeScript to stay employable. I'm
//  still pretty new to it, but I'm working on it
//  and hoping to get up to speed quickly."
//
// Frames the switch as forced and incomplete.
// Reads as junior and slightly desperate.`,
      ts: `// Strong: deliberate choice, current evidence
//
// "I chose TypeScript deliberately for the next
//  chapter — I wanted one type-safe language across
//  the whole stack, and after 25 years of dynamic
//  PHP the compiler catching a class of bugs before
//  runtime genuinely appeals to me. I'm current: I
//  ship on TS 6, I know 7 is the Go rewrite that
//  makes the toolchain much faster, and I've got a
//  SvelteKit + Postgres app I can walk you through.
//  The judgment is 25 years old; the stack is new
//  on purpose."
//
// Deliberate, specific, current. Not an apology.`,
      note:
        "'Why TypeScript now' is a deliberate-choice story, not a confession. Anchor it with current evidence — the version you ship, why TS 7 matters, a shipped app — and it becomes senior signal.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A self-intro assembler: it builds the present-proof-motive script from data, then estimates how long it takes to say at a calm speaking pace. Predict whether this script fits the 90-second window, then run it — and try adding a fourth proof point to see the timing move.",
    code: `// Assemble a 90-second self-intro from parts, then check its length.
// The arc: PRESENT (who you are now) -> PROOF (from the past)
// -> WHY THIS ROLE. Rehearsed, it should land in about 90 seconds.

interface IntroInput {
  present: string; // one line on who you are today
  proof: string[]; // 2-3 concrete, quantified proof points
  motive: string;  // why THIS role, specifically
}

const me: IntroInput = {
  present:
    "I'm a full-stack engineer with 25 years shipping production web systems, " +
    "now working in TypeScript and Node.",
  proof: [
    "For eight years I owned an e-commerce platform doing 12,000 orders a day, " +
      "from schema to on-call.",
    "I led its migration off a legacy stack with no downtime, and mentored " +
      "three engineers who are now leads.",
    "Over the last year I retrained deliberately: TypeScript, SvelteKit, and a " +
      "Postgres-backed app I can walk you through.",
  ],
  motive:
    "You're scaling a checkout system, which is exactly the problem I spent a " +
    "decade operating, and I want to do that in a modern stack.",
};

function buildIntro(x: IntroInput): string {
  return [x.present, x.proof.join(" "), x.motive].join(" ");
}

function wordCount(s: string): number {
  return s.trim().split(/\\s+/).length;
}

const script = buildIntro(me);
const words = wordCount(script);
const wpm = 130; // calm spoken pace
const seconds = Math.round((words / wpm) * 60);

console.log("--- self-intro script ---");
console.log(script);
console.log("");
console.log("words    : " + words);
console.log("estimate : ~" + seconds + "s at " + wpm + " wpm");
console.log(
  "verdict  : " + (seconds <= 105 ? "fits the 90s window" : "trim it - over 90s"),
);`,
  },

  keyPoints: [
    "Two 30-minute screens gate the loop: the recruiter checks story coherence, logistics, and salary band; the hiring manager checks motivation, technical narrative, and red flags.",
    "'Tell me about yourself' has a three-beat arc — present (who you are now), proof (2-3 quantified highlights), why this role — rehearsed to a calm 90 seconds.",
    "Defer early salary questions once and politely: 'I'm targeting market rate for senior full-stack roles; happy to get specific once it's a fit — what's budgeted?'",
    "Whoever names a salary number first anchors the negotiation; if pressed, give a researched range biased slightly high, never a single figure or your old base.",
    "'Flexible' reads as 'cheap' — deferring to their band and anchoring at senior protects both your level and your compensation before the loop starts.",
    "Have rehearsed one-paragraph answers to the guaranteed stack-switch questions ('why TypeScript now?', 'how current are you?') framed as deliberate choices with current evidence, never apologies.",
  ],

  interview: [
    {
      q: "So — tell me about yourself.",
      a: "I'm a full-stack engineer with 25 years shipping production web systems, now working in TypeScript and Node. For eight years I owned an e-commerce platform doing about 12,000 orders a day — architecture through on-call — and I led its migration off a legacy stack with zero downtime while mentoring engineers who are now leads. Over the last year I retrained deliberately into TypeScript, SvelteKit, and Postgres, and I have a working app I can walk you through. I'm here specifically because you're scaling a checkout system, which is exactly the problem I operated for a decade, and I want to solve it in a modern stack.",
    },
    {
      q: "What are your salary expectations?",
      a: "I'm targeting market rate for senior full-stack roles, and I'd rather get specific about numbers once we both know it's a mutual fit. To do that well, it helps to know what range is budgeted for this position — could you share that? If you need a figure from me first, I've researched the market for this level and location and I'm looking in a band rather than at a single number, but I'd genuinely prefer to anchor the conversation on the role and the level before we get into precise figures.",
    },
    {
      q: "Why TypeScript now, after a whole career in PHP?",
      a: "It was a deliberate choice, not a forced one. I wanted a single type-safe language across the whole stack, and after 25 years of dynamic PHP the idea of the compiler catching a whole class of bugs before runtime genuinely appeals to me — it fits how I already think about building reliable systems. And I'm current, not dabbling: I ship on TypeScript 6, I understand 7 is the Go rewrite that makes the toolchain dramatically faster, and I've built a SvelteKit and Postgres app I can show you. The engineering judgment is 25 years deep; choosing this stack for the next chapter was intentional.",
    },
  ],

  quiz: [
    {
      question:
        "What is the recruiter screen primarily evaluating in its 30 minutes?",
      options: [
        "Your coding ability on a live algorithm problem",
        "Story coherence, logistics, and whether your salary expectations fit their band",
        "Your system-design depth and scaling knowledge",
        "Which framework versions you've memorised",
      ],
      answerIndex: 1,
      explain:
        "The recruiter isn't judging code. In 30 minutes they check that your story hangs together, that logistics work (location, timeline, notice), and — most decisively — that your salary expectations land inside their budget. Clear those and they become your advocate through the loop.",
    },
    {
      question:
        "A recruiter asks for your salary number early in the first call. What's the strongest move?",
      options: [
        "Give your previous salary so they know where you stand",
        "Say you're flexible and will take whatever they offer",
        "Defer once politely, target 'market rate for senior', and ask what range is budgeted",
        "Refuse to discuss compensation until after the onsite",
      ],
      answerIndex: 2,
      explain:
        "Whoever names a number first anchors the negotiation. Deferring once — targeting market rate for the level and turning the question back to their band — avoids anchoring low. 'Flexible' reads as 'cheap', and quoting an old base anchors you below market before the loop even begins.",
    },
    {
      question:
        "How should a 25-year PHP veteran answer 'why TypeScript now?' on a hiring-manager screen?",
      options: [
        "Explain that PHP work dried up so the switch was necessary to stay employable",
        "As a deliberate choice, backed by current evidence — a shipped TS app and awareness of where the toolchain is headed",
        "Downplay the switch and pivot back to PHP strengths",
        "Say you're still very new but a fast learner",
      ],
      answerIndex: 1,
      explain:
        "The strong answer frames the move as intentional — wanting one type-safe language across the stack — and proves currency with concrete evidence: shipping on TypeScript 6, knowing 7 is the Go rewrite, and a walkthrough-ready app. Apology or 'I had no choice' framings read as junior; deliberate-plus-evidenced reads as senior.",
    },
  ],
};

export default lesson;

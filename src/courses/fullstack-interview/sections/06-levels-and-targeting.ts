import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "levels-and-targeting",
  title: "Reading Job Ads and Engineering Levels",
  part: "Positioning & Pipeline",
  estMinutes: 12,
  summary:
    "Engineering levels decide what your interview actually tests and what you get paid — learn to decode a job ad's real level, real stack, and real dealbreakers, and to target senior/staff instead of accepting whatever level you're handed.",

  concept: `
Job ads and job titles are lossy encodings of something much more precise:
the **level** the company has budgeted for. Before you apply anywhere, you
need to read past the title to the level, because the level determines what
the interview loop tests, what the offer band is, and what your first year
looks like.

### The ladder, decoded

Most companies run some version of the same individual-contributor ladder:

- **Junior / entry** (Google L3, Meta E3 style): can complete well-defined
  tasks with guidance. Interviews test fundamentals and coding speed.
- **Mid** (L4 / E4): owns features end to end. Interviews test competent
  delivery — working code, reasonable tests, sane API choices.
- **Senior** (L5 / E5): owns problems, not tickets. Interviews test
  **trade-off reasoning and ambiguity handling** — can you take a vague
  requirement, ask the right questions, and defend a design under probing?
- **Staff / principal** (L6+ / E6+): owns direction across teams. Interviews
  add organisational scope: influencing without authority, multi-quarter
  technical strategy, "tell me about a time you changed how three teams work".

The number scheme varies (Amazon says SDE II, banks say VP, startups say
nothing), but the shape is nearly universal. When a recruiter says "this is
an L5-equivalent role", they are telling you which exam you'll sit.

### What each level's interview actually grades

This is the part most candidates miss. The *same coding question* is graded
differently by level. A junior is graded on getting to working code. A senior
is graded on everything around the code: restating the problem, naming the
brute force and rejecting it with a complexity argument, discussing edge
cases before being prompted, and saying trade-offs out loud. Nobody expects
a senior to type faster than a 24-year-old — they expect calmer judgment.

System design rounds usually don't exist below senior, and behavioural
rounds shift from "tell me about a bug you fixed" to "tell me about a
decision you got wrong and what it cost". That mapping tells you where to
spend your preparation time for a given target level.

### Reading the ad: level, stack, dealbreakers

Three passes over any job ad:

1. **Real level.** Ignore the title. Count scope words: "own", "lead",
   "define", "mentor" signal senior+; "assist", "contribute", "under the
   guidance of" signal mid or below. Salary bands, where posted, are the
   ground truth.
2. **Real stack.** The technologies in the first two bullets are the daily
   stack. Everything after "familiarity with" or "nice to have" is wishlist.
3. **Dealbreakers vs wishlist.** "Must have 5 years of React" almost never
   means a calendar check — it means "can build production product UIs
   without hand-holding". If you can demonstrate the capability, apply.
   Genuine dealbreakers are rarer: security clearances, on-site
   requirements, a domain certification, a language you truly cannot
   discuss. Treat the rest as negotiable evidence problems.

### Where 25 years should aim

With 25 years of shipping software you target **senior**, with staff in
range at companies that value depth over framework tenure. Recruiters will
sometimes float mid-level "because your TypeScript is recent". That is
**down-leveling**, and it's a negotiation position, not a verdict. The
counter is calm and factual: your level is set by scope and judgment —
production ownership, incident command, mentoring, architecture decisions —
which you have decades of, not by years-per-framework. Accepting one level
down costs 20-40% in compensation and typically two years to claw back.
Say no politely, or make them prove the gap in the loop.
`,

  comparisons: [
    {
      label: "Reading a job ad: literal vs decoded",
      intro:
        "The same ad, annotated two ways. The weak reading takes every bullet as a pass/fail filter; the strong reading classifies each line as level signal, daily stack, or wishlist.",
      php: `# senior-fullstack-ad.yaml — literal reading
title: Senior Full-Stack Engineer
requirements:
  - "5+ years React"        # I have ~1. Fail. Don't apply.
  - "Strong TypeScript"      # recent. Weak. Fail?
  - "Experience with AWS"    # some. maybe.
  - "Kubernetes a plus"      # none. another fail.
  - "Lead projects end-to-end" # ok, I have this
conclusion: 2 of 5. Skip this one.`,
      ts: `# senior-fullstack-ad.yaml — decoded reading
title: Senior Full-Stack Engineer   # senior loop: design + behavioural
requirements:
  - "5+ years React"        # capability test: "can build product
                            #  UIs unaided" — demonstrable, apply
  - "Strong TypeScript"      # daily stack (top 2 bullets = real)
  - "Experience with AWS"    # daily stack; map to years of
                            #  running LAMP in production
  - "Kubernetes a plus"      # wishlist — "a plus" marks it
  - "Lead projects end-to-end" # LEVEL SIGNAL: they want ownership,
                            #  my strongest 25-year evidence
conclusion: 1 wishlist gap, 0 dealbreakers. Apply, lead with ownership.`,
      note:
        "Requirement lists are written as wishlists by hiring managers who expect ~60% coverage. 'Must have N years of X' is a capability claim to demonstrate, not a calendar check to fail.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "Answering 'what level are you looking for?'",
      intro:
        "A recruiter screen question that sets your band before any interview happens. Said aloud, one of these costs you 20-40% of the offer.",
      php: `// Weak: level-agnostic, invites down-leveling
//
// "Honestly, I'm flexible. I know my TypeScript is
//  newer, so I'd be happy to come in at mid-level
//  and prove myself. I just want to get back into
//  a good team and I'm open to whatever you think
//  fits."
//
// Translation the recruiter hears: price me at the
// bottom of whatever band is easiest to fill.`,
      ts: `// Strong: level-anchored, evidence-first
//
// "I'm targeting senior roles. I've owned systems
//  end to end for over two decades — architecture,
//  production incidents, mentoring — and that's
//  what senior loops test. My TypeScript is recent
//  but my engineering judgment isn't, and I'm happy
//  for the coding rounds to speak for themselves.
//  If the loop surfaces a real gap, we can talk,
//  but I wouldn't start from mid-level."
//
// Calm, specific, and it makes THEM prove the gap.`,
      note:
        "Level is negotiated before the loop, not after. 'Flexible' reads as 'cheap'; anchoring at senior with evidence reads as accurate self-assessment — exactly the trait senior loops grade.",
    },
    {
      label: "Preparing for the loop the level actually runs",
      intro:
        "Two prep plans for the same senior application. One preps the junior exam; the other preps the exam seniors actually sit.",
      php: `# prep-plan.yaml — grinding the wrong exam
plan:
  - 150 algorithm puzzles, hardest first
  - memorise red-black tree rotations
  - practise typing solutions fast, silently
  - skim "what is a load balancer" the night
    before the design round
  - no behavioural prep ("I'll just be honest")
result: fast silent coding, thin design answers,
        rambling 9-minute war stories`,
      ts: `# prep-plan.yaml — matched to a senior loop
plan:
  - coding: the 5 screen patterns, practised
    OUT LOUD - name brute force, state big-O,
    then improve (graded on reasoning)
  - design: 6 classic questions, each driven
    requirements -> API -> data -> scale
  - behavioural: 8 stories from 25 years,
    structured, 2 minutes each, quantified
  - recruiter screen: level + comp anchors ready
result: matches the senior rubric - trade-offs,
        ambiguity, calm ownership`,
      note:
        "Senior loops weight design and behavioural roughly as much as coding. Puzzle-grinding alone preps you for the L3 exam while you interview for the L5 one.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A job-ad scorer: each requirement line is classified against a candidate profile as MATCH, STRETCH (demonstrable capability or wishlist gap), or DEALBREAKER, then a verdict is printed. Predict the verdicts for both ads, then run it — and try editing the profile.",
    code: `// Score job-ad requirement lines against a candidate profile.

interface Requirement {
  line: string;   // as written in the ad
  skill: string;  // what it's really testing
  years: number;  // stated bar
  hard: boolean;  // true genuine dealbreaker if uncovered
}

// 25 years of shipping, TS/React recent, deep SQL and ops:
const candidate = new Map<string, number>([
  ["typescript", 1], ["react", 1], ["sql", 20],
  ["http-apis", 22], ["production-ops", 18],
  ["leadership", 12],
]);

function classify(req: Requirement): "MATCH" | "STRETCH" | "DEALBREAKER" {
  const have = candidate.get(req.skill) ?? 0;
  if (have >= req.years) return "MATCH";
  if (have > 0 || !req.hard) return "STRETCH"; // demonstrable or wishlist
  return "DEALBREAKER";                        // hard bar, zero coverage
}

function scoreAd(title: string, ad: Requirement[]): void {
  console.log(\`--- \${title} ---\`);
  let matches = 0, dealbreakers = 0;
  for (const req of ad) {
    const verdict = classify(req);
    if (verdict === "MATCH") matches++;
    if (verdict === "DEALBREAKER") dealbreakers++;
    console.log(\`  [\${verdict.padEnd(11)}] \${req.line}\`);
  }
  const apply = dealbreakers === 0 && matches >= ad.length / 3;
  console.log(\`  => \${apply ? "APPLY" : "SKIP"} \` +
    \`(\${matches} match, \${dealbreakers} dealbreaker)\\n\`);
}

scoreAd("Senior Full-Stack Engineer", [
  { line: "5+ years React building product UIs", skill: "react", years: 5, hard: false },
  { line: "Strong TypeScript", skill: "typescript", years: 2, hard: false },
  { line: "SQL schema design and query tuning", skill: "sql", years: 3, hard: false },
  { line: "Own services in production", skill: "production-ops", years: 3, hard: true },
  { line: "Kubernetes a plus", skill: "kubernetes", years: 2, hard: false },
]);

scoreAd("Senior iOS Engineer", [
  { line: "7+ years shipping Swift apps to the App Store", skill: "swift", years: 7, hard: true },
  { line: "Strong API design", skill: "http-apis", years: 3, hard: false },
]);`,
  },

  keyPoints: [
    "Levels, not titles, decide the exam: junior loops grade working code, senior loops grade trade-off reasoning and ambiguity handling, staff loops add cross-team scope.",
    "Read every ad in three passes: real level (scope words like 'own' and 'lead'), real stack (the first two bullets), and dealbreakers vs wishlist ('a plus' and 'familiarity with' mark the wishlist).",
    "'Must have 5 years of React' is a capability claim — 'can build production UIs unaided' — not a calendar check; genuine dealbreakers (clearances, location, a truly unknown platform) are rare.",
    "With 25 years of ownership, target senior with staff in range; down-leveling to mid costs 20-40% in compensation and is a negotiating position, not a verdict.",
    "Answer 'what level?' with an anchor and evidence — scope, incidents, mentoring — never with 'I'm flexible', which prices you at the bottom of the easiest band.",
    "Prep for the loop your target level actually runs: senior loops weight system design and behavioural stories roughly as heavily as coding.",
  ],

  interview: [
    {
      q: "What level are you targeting, and why?",
      a: "Senior, and staff where the company values depth. The senior bar is about scope and judgment — owning problems end to end, handling ambiguity, making trade-offs under constraints — and I've done that for over two decades: architecture decisions, production incident command, mentoring engineers who are now leads themselves. My TypeScript stack is the recent part, and I'm comfortable letting the coding rounds verify it. What I'd push back on is pricing 25 years of engineering judgment at a level defined by framework tenure.",
    },
    {
      q: "The role asks for 5+ years of React and your React experience is recent. Why should we still consider you?",
      a: "Because that requirement is really asking whether I can build and maintain production product UIs without hand-holding, and I can demonstrate that directly — I've shipped component-based UIs in this stack, and I've built and operated web front ends for 25 years, through several full paradigm shifts. Engineers who have absorbed multiple stack transitions tend to learn the next one fast, and React's component model maps cleanly onto patterns I've used for years. I'd rather be evaluated on a working artifact than a start date, so I'm happy to walk through code in the loop.",
    },
    {
      q: "A recruiter says they'd like to bring you in at mid-level given your recent stack change. How do you respond?",
      a: "Politely and specifically. I'd say the level should be set by what the loop measures — design judgment, ownership, handling ambiguity — not by tenure in one framework, and those are exactly my strongest areas after 25 years. I'd ask them to run me through the senior loop and let the interviews decide; if a real gap shows up, we can talk then. I'd also be transparent that a mid-level offer isn't one I'd accept, because the down-level costs both compensation and two years of re-proving scope I already operate at. That usually reframes the conversation without burning it.",
    },
  ],

  quiz: [
    {
      question:
        "A job ad for 'Senior Full-Stack Engineer' says 'must have 5+ years of React'. What is the strongest reading of that line?",
      options: [
        "A hard filter — apply only if you have 5 calendar years of React",
        "A capability claim: 'can build production product UIs unaided' — demonstrable evidence beats the calendar",
        "A signal the role is actually junior",
        "A legal requirement the company must enforce",
      ],
      answerIndex: 1,
      explain:
        "Hiring managers write requirement lists as wishlists and expect partial coverage. Year counts are shorthand for capability; if you can demonstrate the capability (shipped UIs, code to walk through), apply. Genuine hard dealbreakers — clearances, location, a platform you can't discuss at all — are much rarer.",
    },
    {
      question:
        "What distinguishes a senior-level coding interview from a junior one, given the same question?",
      options: [
        "Seniors get harder algorithms",
        "Seniors must finish in half the time",
        "Seniors are graded on trade-off reasoning, edge-case thinking, and narrating decisions — not typing speed",
        "There is no difference; the rubric is identical",
      ],
      answerIndex: 2,
      explain:
        "The grading rubric shifts with level. A junior passes by reaching working code; a senior is expected to restate the problem, name and reject the brute force with a complexity argument, surface edge cases unprompted, and defend choices under probing. Calm judgment, not speed, is the senior signal.",
    },
    {
      question:
        "A recruiter proposes bringing a 25-year veteran in at mid-level because their TypeScript is recent. What's the recommended stance?",
      options: [
        "Accept — it's easier to get promoted from inside",
        "Treat it as negotiable: anchor at senior, cite scope and judgment as the level criteria, and let the loop prove any gap",
        "Withdraw immediately; the company is acting in bad faith",
        "Accept but ask for a signing bonus to compensate",
      ],
      answerIndex: 1,
      explain:
        "Down-leveling is a negotiating position, not fate. It typically costs 20-40% in compensation and about two years to reverse from inside. The effective counter is factual: level is defined by scope, ownership, and judgment — which decades of production work demonstrate — so ask to be evaluated by the senior loop rather than by framework tenure.",
    },
    {
      question:
        "Which part of a job ad most reliably tells you the technologies you'd actually use daily?",
      options: [
        "The job title",
        "The first two requirement bullets",
        "The 'nice to have' section",
        "The company's careers-page tech blog",
      ],
      answerIndex: 1,
      explain:
        "Ads front-load the real daily stack; everything introduced with 'familiarity with', 'a plus', or 'nice to have' is wishlist. The title tells you the level band at best, and often not even that.",
    },
  ],
};

export default lesson;

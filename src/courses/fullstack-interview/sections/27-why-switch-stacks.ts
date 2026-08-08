import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "why-switch-stacks",
  title: "Answering 'Why Leave PHP?' and Asking Back",
  part: "Stories, Offers & Day One",
  estMinutes: 12,
  summary:
    "The stack-switch question appears in every loop; answer it with pull toward TypeScript's ecosystem — never a push away from PHP — then flip the table with questions that signal seniority.",

  concept: `
If you are a PHP veteran interviewing for TypeScript roles, some version of
"why are you leaving PHP?" is coming in every single loop. Its cousins are
"are you actually current?", "why not just stay senior in PHP?", and the
quietly hostile "won't you be bored ramping up on a new stack?". They are all
one question: *is this a considered career move or a panic exit, and will it
stick?* Get it right and it becomes your best moment — the clearest evidence
you make deliberate decisions.

### The rule: pull, never push

A push answer complains about where you're leaving: "PHP gets no respect,"
"the ecosystem is dated," "I'm tired of legacy." Every push answer secretly
tells the panel how you'll talk about *them* in two years. A pull answer is
drawn toward the new thing: the type system that catches bugs at compile time,
one language across the whole stack, a huge job market, an ecosystem you
genuinely enjoy. Same decision, opposite framing — one sounds bitter, the
other sounds ambitious.

### Demonstrate currency with specifics, not adjectives

"I keep up with modern JavaScript" is worthless; specifics are proof. Name
that TypeScript 6 is the current stable and the last of the JavaScript-based
compilers — TypeScript 7 is the ground-up rewrite in Go that makes the
toolchain roughly ten times faster. Say you run Node 24 LTS locally with Node
26 on the Current line. Name the SvelteKit project you built and the one
decision in it you'd defend. Concrete, current facts are the difference
between "learning TypeScript" and "a TypeScript engineer."

### Frame it as one more platform shift

You have already lived through more platform shifts than most interviewers
have years of experience — PHP 4 to modern typed PHP, jQuery to SPAs,
bare metal to cloud, sync to async. Switching primary stacks is not a
reinvention; it's the same thing you have done successfully every few years
for a quarter century. That reframing turns "new to the stack" into "has done
exactly this transition, repeatedly, and it worked."

### Then flip the table

The candidate's questions at the end are scored too. Vague questions
("what's the culture like?") signal a junior; sharp, specific questions signal
someone who has operated systems and knows what to look for. Ask how code is
reviewed, what on-call actually looks like, how people get promoted, and why
this specific role is open. The answers are also *your* data — hesitation on
"how do people get promoted?" or "the last person burned out" are red flags
you want surfaced before you sign, not after.
`,

  comparisons: [
    {
      label: "\"Why are you leaving PHP?\"",
      intro:
        "The question you'll answer in every loop. One version pushes away with grievance; the other pulls toward the new stack and proves currency.",
      php: `// Weak: defensive, push-motivated, grievance
//
// "Honestly, PHP just doesn't get any respect anymore. Every
//  job posting wants JavaScript, the cool projects are all in
//  TypeScript, and PHP is seen as legacy. I feel stuck — like
//  my experience is being held against me. So I'm switching
//  because I kind of have to if I want to stay employable."
//
// What the panel hears: bitter, forced into it, will badmouth
// US in two years, frames 25 years as a liability.`,
      ts: `// Strong: pull-motivated, current, deliberate
//
// "I've spent 25 years shipping production systems, and the
//  work I find most satisfying now is the one I get with
//  TypeScript: one typed language across the whole stack, and
//  a compiler that catches a whole class of bugs I used to
//  find in production. I've gone deep — TypeScript 6 today,
//  with the Go-based TS 7 compiler coming that makes the
//  toolchain about 10x faster; I run Node 24 LTS. I built a
//  SvelteKit app end to end to prove it to myself. This is
//  the same deliberate platform shift I've made every few
//  years my whole career — I just picked the one with the
//  best type story and the biggest market."
//
// What the panel hears: chose this, is current, treats 25
// years as evidence, will speak well of past and future teams.`,
      note:
        "Identical decision, opposite framing. The pull version proves currency with named versions and a real project, and reframes 'new to the stack' as a transition this candidate has made successfully many times.",
    },
    {
      label: "The close: 'any questions for us?'",
      intro:
        "The last two minutes of the interview, which are scored. One candidate has nothing; the other asks three questions that only a senior thinks to ask.",
      php: `// Weak: no questions, or generic ones
//
// "No, I think you've covered everything! It all sounds great.
//  I'm really excited about the opportunity."
//
// -- or barely better --
//
// "What's the company culture like? And what's a typical day?"
//
// What the panel hears: didn't prepare, doesn't know what to
// evaluate, treats the interview as one-directional. A quiet,
// no-questions close reads as low engagement in the debrief.`,
      ts: `// Strong: three questions that signal seniority
//
// "Yes, three. First, how does code review actually work here
//  day to day — who reviews, what blocks a merge, how long does
//  a PR usually sit? Second, what does on-call look like for this
//  team — rotation, pager volume, and do you get time to fix the
//  things that page you? And third, this role — is it backfill or
//  growth, and what would 'this hire went great' look like at
//  six months?"
//
// What the panel hears: has operated real systems, evaluates
// teams the way we evaluate candidates, knows exactly what
// separates a good engineering org from a painful one.`,
      note:
        "Sharp questions do double duty: they're scored as seniority signal AND they surface red flags (a vague promotion answer, a brutal on-call story) while you can still walk away.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A reusable bank of closing questions, grouped by what each one probes and paired with the red-flag answer to listen for. Predict which category 'why is this role open?' lands in, then run it.",
    code: `// The questions to ask back — grouped by what they reveal,
// with the answer that should make you nervous.

interface AskBack {
  question: string;
  probes: "engineering culture" | "growth" | "stability";
  redFlag: string;
}

const bank: AskBack[] = [
  {
    question: "How does code review work day to day?",
    probes: "engineering culture",
    redFlag: "\\"We don't really review — people just push.\\"",
  },
  {
    question: "What does on-call and incident response look like?",
    probes: "stability",
    redFlag: "\\"It's intense, but you get used to the pager.\\"",
  },
  {
    question: "How do engineers get promoted here?",
    probes: "growth",
    redFlag: "Vague answer, no levels, \\"it varies.\\"",
  },
  {
    question: "Why is this role open?",
    probes: "stability",
    redFlag: "\\"The last person left\\" with no follow-up detail.",
  },
  {
    question: "How do you decide what to build next?",
    probes: "engineering culture",
    redFlag: "\\"Whatever the CEO wants that week.\\"",
  },
  {
    question: "What does ramping up in the first 90 days look like?",
    probes: "growth",
    redFlag: "\\"You'll figure it out — we throw people in.\\"",
  },
];

// Group by what each question probes (Map ~ PHP associative array).
const byProbe = new Map<string, AskBack[]>();
for (const q of bank) {
  const list = byProbe.get(q.probes) ?? [];
  list.push(q);
  byProbe.set(q.probes, list);
}

for (const [probe, questions] of byProbe) {
  console.log(\`\\n### Probing: \${probe.toUpperCase()}\`);
  for (const q of questions) {
    console.log(\`  Q: \${q.question}\`);
    console.log(\`     red flag -> \${q.redFlag}\`);
  }
}

console.log(\`\\nAsk 3, spread across all three categories.\`);`,
  },

  keyPoints: [
    "The stack-switch question is really 'is this deliberate and will it stick?' — answer with a pull toward TypeScript, never a push away from PHP.",
    "Prove currency with specifics: TypeScript 6 is current stable and the last JS-based compiler, TS 7 is the Go rewrite (~10x faster toolchain), Node 24 is LTS — and name your own SvelteKit project.",
    "Frame the switch as one more platform shift in a career full of them; you've done exactly this transition successfully every few years for 25 years.",
    "Never badmouth PHP or a past employer — a push answer tells the panel how you'll talk about them later, and it always loses.",
    "The candidate's closing questions are scored: sharp, specific questions (code review, on-call, promotion, why the role is open) signal seniority; 'no questions' reads as low engagement.",
    "Those questions are also your due diligence — a vague promotion answer or a grim on-call story is a red flag you want surfaced before you sign.",
  ],

  interview: [
    {
      q: "You've been a PHP developer for 25 years. Why switch to TypeScript now?",
      a: "It's a pull, not an escape. The work I find most satisfying now is the work I get with TypeScript — one typed language across the whole stack and a compiler that catches an entire class of bugs I used to chase in production. I've gone deep rather than dabbled: TypeScript 6 is the current stable, and I've been following the Go-based TS 7 compiler that makes the toolchain roughly ten times faster; I run Node 24 LTS day to day. I built a SvelteKit application end to end to prove the transition to myself before I ever put it on a resume. Honestly, this is the same deliberate platform shift I've made every few years for a quarter century — PHP 4 to modern typed PHP, jQuery to SPAs, bare metal to cloud — I just picked the one with the strongest type story and the biggest market.",
    },
    {
      q: "Aren't you worried you'll be bored ramping up on a stack that's new to you?",
      a: "The stack is new; the job isn't. What I'm actually good at — decomposing a messy domain, designing schemas that survive scale, keeping a system up during an incident, mentoring the people around me — transfers completely, and none of it gets boring. The syntax I'll pick up in weeks; I already have. What I bring is judgment that took decades, applied to a toolchain I'm genuinely excited about. If anything I ramp faster than a junior on the same stack because I know what questions to ask and what mistakes to avoid.",
    },
    {
      q: "Do you have any questions for us?",
      a: "Yes, three. First, how does code review actually work here day to day — who reviews, what blocks a merge, and how long does a typical PR sit? Second, what does on-call look like for this team — the rotation, the pager volume, and whether you get time to fix the things that page you? And third, is this role a backfill or a growth hire, and what would 'this hire went really well' look like at the six-month mark? Those tell me how the team operates under normal load and under stress, which is what I care about most.",
    },
  ],

  quiz: [
    {
      question:
        "What's the difference between a 'push' and a 'pull' answer to 'why are you leaving PHP?'",
      options: [
        "Push answers are longer; pull answers are shorter",
        "Push answers complain about what you're leaving; pull answers are drawn toward the new thing",
        "Push answers are for junior roles; pull answers are for senior roles",
        "There's no real difference — both work equally well",
      ],
      answerIndex: 1,
      explain:
        "A push answer voices grievance about PHP, which quietly tells the panel how you'll talk about them in two years. A pull answer is drawn toward TypeScript's type system, market, and ecosystem — same decision, but it reads as ambition rather than bitterness.",
    },
    {
      question:
        "Which statement best demonstrates that a candidate is genuinely current?",
      options: [
        "\"I keep up with all the latest JavaScript trends.\"",
        "\"TypeScript 6 is current stable and the last JS-based compiler; TS 7 is the Go rewrite. I run Node 24 LTS and built a SvelteKit app.\"",
        "\"I've heard TypeScript is really popular right now.\"",
        "\"I'm a fast learner and can pick up anything quickly.\"",
      ],
      answerIndex: 1,
      explain:
        "Specifics are proof; adjectives are noise. Naming current versions, the TS 7 Go rewrite, the Node LTS line, and a real project you built is the concrete evidence that separates 'a TypeScript engineer' from 'someone learning TypeScript.'",
    },
    {
      question:
        "Why do sharp closing questions matter beyond just 'making a good impression'?",
      options: [
        "They pad out the interview time so you seem engaged",
        "They're scored as seniority signal and surface red flags while you can still walk away",
        "They let you avoid answering the interviewer's harder questions",
        "They're only useful if you already have a competing offer",
      ],
      answerIndex: 1,
      explain:
        "The close is scored — specific questions about code review, on-call, and promotion mark you as someone who has operated systems. They also serve as your due diligence: a vague promotion answer or a grim on-call story is a red flag you want before signing, not after.",
    },
  ],
};

export default lesson;

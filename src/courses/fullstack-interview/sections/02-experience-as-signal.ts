import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 2,
  slug: "experience-as-signal",
  title: "25 Years Is a Feature, Not a Bug",
  part: "Positioning & Pipeline",
  estMinutes: 11,
  summary:
    "A long PHP career is senior signal — production ownership, migrations survived, systems operated for a decade — the moment you frame it as scope and impact instead of a list of technologies.",

  concept: `
The single most expensive mistake a veteran makes in interviews is
apologising for the past. Twenty-five years is not a liability you have to
explain away; it is the strongest evidence in the room that you can be
trusted with something that matters. The catch is that seniority does not
announce itself — it has to be *framed*. A hiring panel reads a career for
one thing: **signal**. Scope, scale, judgment, outcomes. A technology list
carries almost none of that.

### Signal, not stack

"PHP, MySQL, jQuery, Apache" tells a panel what you touched. It tells them
nothing about whether you can own a problem. Compare it to: "I ran an
e-commerce platform doing 12,000 orders a day for eight years, on call for
it, and cut checkout latency by 75%." The second sentence is the same job —
but now it carries scope (owned a whole platform), scale (a real number),
duration (sustained, not a demo), and an outcome (a measured win). That is
senior signal, and it is invisible in a stack list.

The reframe is mechanical once you see it. For every role, answer four
questions: **what did I own, how big was it, how long did I run it, and what
changed because I was there?** Everything else — the frameworks, the
libraries, the versions — is trivia the interviewer can read off your resume.

### The reframe vocabulary

Weak verbs describe activity: *used, worked with, helped, was involved in,
responsible for*. Strong verbs describe ownership and result: *owned, ran,
shipped, migrated, scaled, reduced, led, decided*. "Responsible for the
payments code" is a duty. "Owned payments through three PSP migrations with
zero lost transactions" is a story a panel remembers and quotes in your
debrief.

### Ageism and the "legacy" bias, met head-on

The bias exists and pretending otherwise helps no one. Two counter-frames
defuse it, and you should have both rehearsed. First, **frameworks are
weather, judgment is climate**: you have watched jQuery, Backbone, Angular,
and now React rise and fade, which is exactly why you don't panic about the
next one — you have absorbed paradigm shifts before and shipped through all
of them. Second, **learning velocity is demonstrable**: you picked up
TypeScript, SvelteKit, and Node in months, with a working app to show. A
25-year career that keeps adding stacks is not "stuck in the past"; it is a
long, unbroken record of staying current. Say that calmly and it flips the
whole frame — the years become proof of adaptability, not evidence against
it.

### Never be defensive

The tone matters as much as the content. Defensiveness reads as insecurity,
and insecurity reads as junior. You don't say "I know PHP isn't trendy, but
I'm trying to learn." You say "I've operated production systems for two
decades and I chose TypeScript deliberately for this next chapter." Same
facts, opposite signal. The years are an asset on your balance sheet —
carry them like one.
`,

  comparisons: [
    {
      label: "Describing yourself in one line",
      intro:
        "The answer to 'so, tell me about your background' — the first thing a hiring manager hears. One lists technologies; the other states scope and impact.",
      php: `// Weak: a technology inventory
//
// "I'm a PHP developer. I've mostly worked with
//  PHP and MySQL, some jQuery, a bit of Laravel
//  later on. I've been doing it a long time.
//  I'm trying to move into TypeScript now."
//
// What the panel hears: a list of tools, an
// apology, and no evidence of ownership or scale.`,
      ts: `// Strong: scope and impact
//
// "I've spent 25 years building and operating
//  production web systems — most recently owning
//  an e-commerce platform doing 12,000 orders a
//  day for eight years, on call for it, and I cut
//  checkout latency by 75%. I moved to TypeScript
//  and Node deliberately for what I want to build
//  next."
//
// What the panel hears: ownership, a real number,
// a measured outcome, a deliberate choice.`,
      note:
        "Same career, opposite signal. The strong version answers 'what did you own, how big, how long, what changed' — the four questions a panel is actually grading.",
    },
    {
      label: "The career summary at the top of a conversation",
      intro:
        "A two-line self-summary a recruiter forwards to the hiring manager. Left lists technologies used; right lists systems owned and outcomes delivered.",
      php: `// Weak: "technologies used"
//
// Technologies: PHP, MySQL, jQuery, Apache, Linux,
// Symfony, Memcached, Bash, some AWS, REST APIs,
// Git, Jenkins, Redis, Elasticsearch.
//
// (Twelve nouns. Nothing about what any of them
//  achieved, at what scale, or under whose
//  ownership. A junior with a bootcamp certificate
//  can list the same nouns.)`,
      ts: `// Strong: "systems owned, outcomes delivered"
//
// - Owned an e-commerce platform, 12k orders/day,
//   8 yrs; cut checkout p95 from 1.8s to 400ms.
// - Led a zero-downtime migration off a legacy
//   stack serving 40 internal engineers.
// - On-call incident lead; drove MTTR from hours
//   to under 20 minutes across two years.
//
// (Three sentences a panel can quote. Scope,
//  scale, duration, outcome — senior signal.)`,
      note:
        "A tech list is the floor any candidate can clear; systems-owned-with-outcomes is the ceiling only years of real ownership can reach. Lead with the thing juniors cannot fake.",
    },
    {
      label: "Handling the 'isn't this all legacy?' jab",
      intro:
        "A hiring manager probes whether decades of PHP means you're stuck in the past. One answer gets defensive; the other reframes tenure as adaptability.",
      php: `// Weak: defensive, concedes the frame
//
// "Yeah, I know PHP has a reputation, and a lot of
//  what I did was older tech. But I'm really
//  motivated to learn modern tools, and I promise
//  I'm not stuck in my ways. I'm a fast learner."
//
// Concedes 'legacy = behind', then pleads. Reads
// as insecure — which reads as junior.`,
      ts: `// Strong: reframes tenure as adaptability
//
// "I've watched jQuery, Backbone, and Angular come
//  and go and shipped through all of them — so the
//  next framework doesn't rattle me, I've absorbed
//  that transition several times. The proof it's a
//  habit, not a story: I picked up TypeScript,
//  SvelteKit, and Node in months and have a
//  Postgres-backed app to walk you through. The
//  years are why I adapt fast, not why I can't."
//
// Owns the frame. Turns tenure into evidence.`,
      note:
        "Frameworks are weather, judgment is climate. Surviving multiple paradigm shifts is itself the adaptability proof — say it calmly and the years flip from liability to asset.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A reframing engine: it takes raw career facts and rewrites each as a signal statement, then scores whether the line carries scope, scale, and an outcome. Predict which facts score 3/3, then run it — and try adding a fact of your own.",
    code: `// Turn raw career facts into interview-ready signal statements.

interface CareerFact {
  role: string;      // what the seat was
  years: number;     // how long you held it
  metric: string;    // what the headline number measures
  value: number;     // the headline number
  tech: string[];    // the raw resume-line technologies
  win?: string;      // an operational moment worth naming
}

const facts: CareerFact[] = [
  {
    role: "e-commerce platform",
    years: 8,
    metric: "orders/day",
    value: 12000,
    tech: ["PHP", "MySQL", "jQuery"],
    win: "cut checkout p95 latency from 1.8s to 400ms",
  },
  {
    role: "flight-booking backend",
    years: 6,
    metric: "concurrent users at peak",
    value: 5000,
    tech: ["PHP", "Postgres", "Memcached"],
  },
  {
    role: "internal tooling",
    years: 4,
    metric: "engineers served",
    value: 40,
    tech: ["PHP", "Symfony"],
    win: "ran the PHP 5 to 7 migration with zero downtime",
  },
];

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// Signal density: does the line carry scope, scale, and an outcome?
function density(f: CareerFact): number {
  let score = 0;
  if (f.years >= 2) score++; // scope / ownership over time
  if (f.value > 0) score++;  // quantified scale
  if (f.win) score++;        // a named outcome
  return score;
}

function toSignal(f: CareerFact): string {
  const base =
    "Owned the " + f.role + " for " + f.years +
    " years, running " + fmt(f.value) + " " + f.metric;
  return f.win ? base + "; " + f.win + "." : base + ".";
}

for (const f of facts) {
  console.log("weak   : " + f.tech.join(", "));
  console.log("strong : " + toSignal(f));
  console.log("signal : " + density(f) + "/3 (scope, scale, outcome)");
  console.log("");
}

// The second fact scores 2/3 — it has scope and scale but no named
// outcome. That's your prompt: what CHANGED because you were there?`,
  },

  keyPoints: [
    "A hiring panel reads a career for signal — scope, scale, duration, outcome — none of which a technology list carries.",
    "Reframe every role by answering four questions: what did I own, how big was it, how long did I run it, and what changed because I was there?",
    "Swap activity verbs (used, worked with, responsible for) for ownership verbs (owned, ran, shipped, migrated, scaled, led) — the verb is half the signal.",
    "Meet the 'legacy' bias with two rehearsed frames: frameworks are weather and judgment is climate, and a fast, recent TypeScript switch proves learning velocity is a habit.",
    "Never apologise for PHP: 'I chose TypeScript deliberately' beats 'I know PHP isn't trendy, but' — defensiveness reads as insecurity, which reads as junior.",
    "Quantify or it didn't happen: '12,000 orders a day' and 'cut latency 75%' are quotable in a debrief; 'high traffic' and 'improved performance' are not.",
  ],

  interview: [
    {
      q: "Tell me about your background.",
      a: "I've spent 25 years building and operating production web systems. Most recently I owned an e-commerce platform doing about 12,000 orders a day for eight years — end to end, including on-call — and over that time I cut checkout p95 latency from 1.8 seconds to 400 milliseconds and led a zero-downtime migration off a legacy stack. About a year ago I moved deliberately into TypeScript and Node, and I've built a Postgres-backed app in the modern stack I'm happy to walk through. So the short version is: two decades of ownership and operations, now pointed at a modern toolchain.",
    },
    {
      q: "Most of your experience is in PHP. Are you worried that's a bit legacy for this role?",
      a: "Not really, and here's why. In 25 years I've watched jQuery, Backbone, and Angular rise and fade, and I shipped production systems through every one of those transitions — so a new framework doesn't rattle me, because absorbing them is something I've done repeatedly. The proof it's a current habit and not just a story is that I picked up TypeScript, SvelteKit, and Node in a matter of months and have a working app to show for it. What the years actually buy me is judgment that transfers across every stack — how to design a schema that survives growth, how to run an incident calmly, how to make a trade-off under a deadline. That doesn't go legacy.",
    },
    {
      q: "What makes you a senior candidate rather than someone we'd bring in mid-level?",
      a: "Scope and judgment, which is what senior actually measures. I've owned whole systems, not tickets — architecture decisions, production incidents, capacity planning, mentoring engineers who are now leads themselves. I can take a vague requirement, ask the questions that matter, and defend a design under pressure, because I've lived with the consequences of those decisions for years afterward. The TypeScript is the recent layer, and I'm glad to let the coding rounds verify it — but the thing that takes 25 years to build, the operational and design judgment, is exactly what a senior loop is trying to find.",
    },
  ],

  quiz: [
    {
      question:
        "Which self-description carries the strongest senior signal to a hiring panel?",
      options: [
        "\"I've worked with PHP, MySQL, jQuery, and later some Laravel and AWS.\"",
        "\"I owned an e-commerce platform doing 12,000 orders/day for 8 years and cut checkout latency 75%.\"",
        "\"I'm a fast learner and I'm really motivated to move into modern tech.\"",
        "\"I have 25 years of experience across many different technologies.\"",
      ],
      answerIndex: 1,
      explain:
        "Senior signal is scope, scale, duration, and outcome — 'owned a platform', '12,000 orders/day', '8 years', 'cut latency 75%'. A technology list, a motivation statement, and a vague 'many technologies' all fail to say what you owned or what changed because of you.",
    },
    {
      question:
        "A hiring manager asks whether decades of PHP means you're behind on modern tooling. What's the strongest response?",
      options: [
        "Concede that PHP is legacy but promise you're a fast learner",
        "Argue that PHP is actually still modern and doesn't need defending",
        "Reframe: you've shipped through multiple framework shifts and recently learned TS/Node fast, so tenure is adaptability proof",
        "Change the subject to your salary expectations",
      ],
      answerIndex: 2,
      explain:
        "The winning move owns the frame instead of conceding or arguing it: surviving several paradigm shifts and then learning TypeScript in months is direct evidence of adaptability. Frameworks are weather; the judgment built over 25 years is climate, and it transfers.",
    },
    {
      question:
        "Why does 'responsible for the payments code' read as weaker than 'owned payments through three PSP migrations with zero lost transactions'?",
      options: [
        "It's shorter, and longer answers always score higher",
        "'Responsible for' is a duty; the second states ownership, scope, and a measured outcome",
        "Payments is a more impressive domain than the wording",
        "The second one uses more technical jargon",
      ],
      answerIndex: 1,
      explain:
        "'Responsible for' describes a duty and could be true of a junior on the team. 'Owned ... three PSP migrations ... zero lost transactions' states ownership, quantifies scope, and names an outcome — the concrete, quotable evidence a debrief runs on.",
    },
  ],
};

export default lesson;

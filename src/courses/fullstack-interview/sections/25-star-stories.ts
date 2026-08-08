import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "star-stories",
  title: "Mining 25 Years for STAR Stories",
  part: "Stories, Offers & Day One",
  estMinutes: 12,
  summary:
    "Build a small bank of STAR stories from a long career — Result quantified, Action in first-person singular — and map six well-chosen stories onto the behavioural prompts they answer.",

  concept: `
Behavioural rounds feel unpredictable, but the prompts collapse into a handful
of families, and a small bank of well-shaped stories covers almost all of them.
The work is not inventing stories — after 25 years you have hundreds — it's
**selecting and cutting** them so each lands in two minutes.

### The STAR shape

Every strong answer has four parts:

- **Situation** — the context, in one or two sentences. Where and when.
- **Task** — what you were responsible for. The specific problem.
- **Action** — what **you** did. First-person singular: "I decided", "I built",
  "I convinced" — not "we". Panels score *your* contribution, and "we" hides it.
- **Result** — the outcome, **quantified**. "Restored in 22 minutes",
  "cut costs 30%", "promoted within a year". A number makes it real.

Action and Result carry the score. Keep Situation and Task short; spend your
words on what you did and what it produced.

### Veteran-specific edits

A long career is an asset, but it needs editing for the room:

- **Compress ancient context ruthlessly.** The panel does not need the 2009 org
  chart or three paragraphs of backstory. One sentence of setup, then act.
- **Pick recent-enough stories.** A brilliant story from 2008 can read as "hasn't
  done anything since". Favour the last 5–7 years to show *current* judgment.
- **Translate outcomes into the interviewer's units** — revenue, uptime, latency,
  time saved, headcount freed. "Faster" is weak; "cut p99 from 800ms to 120ms"
  is a result. Money and time are the universal currencies.

### The six-story bank

Six stories, chosen for range, cover roughly 90% of behavioural prompts. Mine
these veins:

- **The worst outage** — pressure, incident response, ownership.
- **The migration that could have failed** — planning under risk, ambiguity.
- **The disagreement with a decision-maker** — conflict, influence with data.
- **The junior you grew** — leadership, mentorship, without-authority.
- **The project you killed** — judgment, ego-in-check, failure reframed.
- **The vague one-line brief** — ambiguity, scoping, driving clarity.

### Prompt-type -> story mapping

Don't memorise answers to specific questions — memorise which *story* answers
each **family** of prompt. "Tell me about a conflict", "a time you pushed back",
"a disagreement you handled" are the same family, answered by the same story.
Tag each story with the families it covers, and in the room you're just picking
the right one off the shelf, then telling it in STAR. That mapping is exactly
the associative array you've built a thousand times: prompt family as key,
story as value.
`,

  comparisons: [
    {
      label: "'We' team-vague vs 'I' first-person STAR",
      intro:
        "The same incident, answered two ways. The weak version hides the candidate behind 'we' and skips the number; the strong version makes the individual contribution and the result explicit.",
      php: `// WEAK — "we" everywhere, no quantified result.
// The panel cannot tell what THIS candidate actually did.
const answer = \`
We had some issues with the site during a big sale.
The team looked into it and we figured out there was
a problem with a recent change. We worked together and
eventually got everything back up and running. It was a
good example of teamwork under pressure.
\`;
// Score: low. No Task ownership, no first-person Action,
// no Result. "Teamwork" is not an achievement.`,
      ts: `// STRONG — first-person Action, quantified Result, tight.
const answer = \`
S/T: On Black Friday our checkout started failing at peak
     traffic and I was the on-call engineer.
A:   I declared an incident, traced it to a deploy from an
     hour earlier, made the call to roll back rather than
     hotfix, and coordinated comms while it recovered.
R:   Checkout was restored in 22 minutes; we protected
     roughly $40k/hour of sales, and I wrote the postmortem
     that added the deploy-gate we still use.
\`;
// Score: high. Clear ownership, decisive Action, a number.`,
      note:
        "Same event, opposite signal: 'we' with no number reads as a bystander; first-person Action plus a quantified Result reads as the person who owned the outcome. Panels grade your contribution — say 'I'.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "The 10-minute epic vs the 2-minute cut",
      intro:
        "The same migration story, told long and told tight. The weak version drowns the point in ancient context; the strong version cuts to Action and Result.",
      php: `// WEAK — 10 minutes, buried lede.
const answer = \`
So back in 2011 we had this monolith, and to explain it I
need to tell you about the team structure at the time, and
how the old billing system worked, which came from an
acquisition in 2009... and there were three databases,
and the vendor... [four more minutes of setup] ...anyway,
eventually we moved it and it went okay I think.
\`;
// The interviewer has stopped listening. No result stated.`,
      ts: `// STRONG — 2 minutes, one line of setup, then act.
const answer = \`
S/T: A legacy schema was blocking every new feature and I
     owned the migration off it — with no downtime allowed.
A:   I designed a dual-write cutover: write to old and new
     in parallel, backfill 80M rows in batches overnight,
     verify with row-count checks, then flip reads.
R:   Zero downtime, migration done in three weeks, and it
     unblocked the feature roadmap for the next quarter.
\`;
// One sentence of context; the words go on Action + Result.`,
      note:
        "Compress ancient context to a single sentence and spend your time on Action and Result — the 2009 backstory scores nothing, and a buried result is a wasted story.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A story bank as typed objects, each tagged with the prompt families it covers. Given six behavioural prompts, it prints which story answers each and its one-line STAR summary. Predict which story covers both 'conflict' and 'influence'.",
    code: `type PromptType =
  | "conflict"
  | "failure"
  | "leadership"
  | "pressure"
  | "ambiguity"
  | "influence";

interface Story {
  id: string;
  title: string;
  covers: PromptType[];   // which prompt families this story answers
  star: string;           // one-line STAR summary (S/T -> A -> R)
}

// Six stories cover ~90% of behavioural prompts.
const bank: Story[] = [
  {
    id: "outage",
    title: "The Black Friday outage",
    covers: ["pressure", "failure"],
    star: "Checkout died at peak (S/T); I ran the incident and rolled back the bad deploy (A); restored in 22 min, saved ~$40k/hr (R).",
  },
  {
    id: "migration",
    title: "The zero-downtime DB migration",
    covers: ["ambiguity", "pressure"],
    star: "Legacy schema blocked us (S/T); I designed a dual-write cutover and backfilled in batches (A); migrated 80M rows, zero downtime (R).",
  },
  {
    id: "disagreement",
    title: "Pushing back on the rewrite",
    covers: ["conflict", "influence"],
    star: "The CTO wanted a full rewrite (S/T); I built a strangler-fig proposal with data (A); we refactored incrementally, shipped 6 months sooner (R).",
  },
  {
    id: "mentorship",
    title: "Growing the junior dev",
    covers: ["leadership"],
    star: "A junior was stalling (S/T); I paired weekly and handed off ownership of a service (A); they were promoted within a year (R).",
  },
  {
    id: "killed-project",
    title: "Killing my own project",
    covers: ["failure", "influence"],
    star: "My six-week build had no users (S/T); I gathered usage data and recommended we cut it (A); freed two engineers for revenue work (R).",
  },
  {
    id: "vague-brief",
    title: "The one-line feature brief",
    covers: ["ambiguity", "leadership"],
    star: "'Make search better' was the whole brief (S/T); I ran user interviews and scoped 3 concrete wins (A); search conversion up 18% (R).",
  },
];

// Index prompt-family -> stories that cover it (an associative array).
const byType = new Map<PromptType, Story[]>();
for (const s of bank) {
  for (const t of s.covers) {
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(s);
  }
}

const prompts: { text: string; type: PromptType }[] = [
  { text: "Tell me about a time you disagreed with your manager.", type: "conflict" },
  { text: "Describe a failure and what you learned.", type: "failure" },
  { text: "Tell me about a time you led without authority.", type: "leadership" },
  { text: "Describe working under intense pressure.", type: "pressure" },
  { text: "Tell me about an ambiguous problem you scoped.", type: "ambiguity" },
  { text: "How did you influence a technical decision?", type: "influence" },
];

console.log("=== prompt -> best story mapping ===");
for (const p of prompts) {
  const pick = (byType.get(p.type) ?? [])[0]; // first matching story
  console.log(\`\\nPROMPT (\${p.type}): \${p.text}\`);
  if (!pick) {
    console.log("  no story yet — gap to fill");
    continue;
  }
  console.log(\`  -> "\${pick.title}"\`);
  console.log(\`     \${pick.star}\`);
}

console.log("\\n=== coverage check ===");
const allTypes: PromptType[] = ["conflict", "failure", "leadership", "pressure", "ambiguity", "influence"];
const covered = allTypes.filter((t) => (byType.get(t)?.length ?? 0) > 0);
console.log(\`\${bank.length} stories cover \${covered.length}/\${allTypes.length} prompt families.\`);`,
  },

  keyPoints: [
    "STAR = Situation, Task, Action, Result — keep Situation and Task to a sentence each and spend your words on Action and Result, which carry the score.",
    "Tell the Action in first-person singular: 'I decided', 'I built', not 'we' — panels grade your contribution and 'we' hides it.",
    "Quantify every Result in the interviewer's units — revenue, uptime, latency, time saved, headcount — because a number turns a claim into evidence.",
    "Compress ancient context ruthlessly and favour stories from the last 5–7 years, so you show current judgment rather than a 2008 highlight reel.",
    "Six stories chosen for range — worst outage, risky migration, a disagreement, a mentee, a killed project, a vague brief — cover ~90% of behavioural prompts.",
    "Memorise the prompt-family -> story mapping, not scripted answers: 'conflict', 'pushed back', 'disagreement' are one family answered by one story.",
  ],

  interview: [
    {
      q: "Tell me about a time you disagreed with a senior decision-maker.",
      a: "Our CTO wanted to stop feature work and do a full rewrite of the billing platform, and I owned that platform, so I pushed back. Rather than argue in the abstract, I built a one-page proposal with data: I pulled the change-failure rate and the modules that actually caused our incidents, and showed that a strangler-fig approach — wrapping the legacy system and replacing it module by module — would de-risk the same problems without a multi-quarter freeze. I walked him through it, agreed a checkpoint after the first module so he could kill the plan if it stalled, and we went incremental. We shipped the highest-risk module in six weeks and delivered the whole thing roughly six months sooner than the rewrite estimate, with no feature freeze. The lesson I took is that disagreeing well means bringing data and an off-ramp, not just conviction.",
    },
    {
      q: "How do you decide which stories to prepare from a long career?",
      a: "I mine for range, not for the single best story. I pick six that each cover a different behavioural family — my worst outage for pressure and incident ownership, a risky migration for planning under ambiguity, a disagreement with a decision-maker for conflict and influence, a junior I grew for leadership, a project I killed for judgment and ego-in-check, and a vague one-line brief for scoping. I bias toward the last five to seven years so they show current judgment, and I cut the ancient context down to one sentence of setup. Then I tag each story with the prompt families it answers, so in the room I'm not searching my memory — I'm picking the right story off the shelf and telling it in STAR with a quantified result.",
    },
    {
      q: "Tell me about a failure.",
      a: "I spent about six weeks building an internal analytics tool I was convinced the support team needed. When we shipped it, almost no one used it — I'd built from my assumptions instead of watching how support actually worked. Rather than defend it, I pulled the usage data, sat with three support leads to understand what they really did, and concluded the honest move was to kill my own project and redeploy the two engineers to a revenue feature that was starved. I made that recommendation to my manager myself. The result was two engineers freed for work that shipped and mattered, and a rule I've kept since: validate demand with real users before building, not after. Being willing to kill your own work is a skill, and that's where I learned it.",
    },
  ],

  quiz: [
    {
      question: "Why answer the Action part of a STAR story in the first person singular ('I') rather than 'we'?",
      options: [
        "It sounds more confident regardless of content",
        "Panels grade your individual contribution, and 'we' hides what you actually did",
        "Grammar rules require it in interviews",
        "It makes the story shorter",
      ],
      answerIndex: 1,
      explain:
        "The interviewer is assessing what YOU contributed. 'We' blurs your role behind the team; first-person Action ('I decided', 'I built', 'I convinced') makes your specific contribution — the thing being scored — visible.",
    },
    {
      question: "What is the veteran-specific edit that most improves a story from 20 years ago?",
      options: [
        "Add more detail about the old technology stack",
        "Explain the full org structure at the time",
        "Compress the ancient context to one sentence and, ideally, pick a more recent story",
        "Remove all numbers so it sounds humble",
      ],
      answerIndex: 2,
      explain:
        "Long backstory buries the point and old stories can read as 'nothing recent'. Cut setup to a sentence, favour the last 5–7 years to show current judgment, and keep the quantified result — that's what scores.",
    },
    {
      question: "What's the point of mapping prompt families to stories instead of memorising answers to specific questions?",
      options: [
        "It lets you recite the exact same words every time",
        "Many differently-worded prompts are the same family answered by one story, so you pick off the shelf instead of freezing",
        "It guarantees the interviewer asks those exact questions",
        "It removes the need to quantify results",
      ],
      answerIndex: 1,
      explain:
        "'Tell me about a conflict', 'a time you pushed back', and 'a disagreement' are one family. Tagging each story with the families it covers means you retrieve the right story fast and tell it in STAR, rather than scripting brittle per-question answers.",
    },
  ],
};

export default lesson;

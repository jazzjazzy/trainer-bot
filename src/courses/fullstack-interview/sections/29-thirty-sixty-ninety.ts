import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "thirty-sixty-ninety",
  title: "The 30/60/90 Plan for a New Stack",
  part: "Stories, Offers & Day One",
  estMinutes: 12,
  summary:
    "A concrete first-quarter plan turns 'I'll ramp up' into evidence of senior judgment: ship small and map the system in the first month, own a feature by 60, lead something visible by 90.",

  concept: `
The interview doesn't really end at the offer — the final rounds and the
manager screen often circle one unspoken question: *what will you actually do
once you're here?* A 30/60/90 plan answers it before they ask. It's a concrete
map of your first quarter, and presenting one unprompted in a final round is a
genuine differentiator, because almost nobody does it and it proves you think
like someone who has onboarded onto systems before — which, after 25 years,
you have.

### Days 1-30: ship something small, map the system and the people

The goal of month one is not impact — it's orientation and a small,
confidence-building win. Get your first pull request merged in the first week,
however tiny; it proves the local setup, the review process, and the deploy
path all work and that you can move through them. Spend the rest of the month
on **archaeology**: read the code, draw the system yourself, and ask the
questions only a newcomer gets to ask for free — "why is it built this way?",
"what breaks most often?", "who owns this service?". Map the people as
carefully as the architecture.

### Days 31-60: own a feature end to end, pay learning back as docs

Month two is about taking real ownership of something that ships to users —
designed, built, reviewed, deployed, and watched in production by you. The
senior move is to **pay your learning forward**: the onboarding gaps and
undocumented gotchas you just hit are freshest in your mind now, so write them
down. Documentation you produce while ramping is a gift to the next hire and a
visible early contribution that isn't code.

### Days 61-90: lead something visible, propose one measured improvement

By month three you lead: take a project with some scope, or drive a piece of
technical direction. And now — only now — you propose **one** improvement to
how things are done, backed by evidence you gathered in the first two months.
One well-argued, measured proposal lands; ten opinions in your first week
don't.

### The veteran's calibration: senior judgment, new hands

Hold this distinction clearly, because it's what makes the plan credible:
your *hands* are new to the stack, but your *judgment* is senior from day one.
That means you get to ask architecture questions freely and early — nobody
expects the new person to already know the syntax, so use the newcomer window
to interrogate the design. But hold your rewrite opinions for ninety days.
The instinct to declare "this should all be rewritten" in week one is the
single fastest way to burn the credibility your experience earned you. Observe
first, gather evidence, then propose — the same discipline you'd want from
anyone touching a system you'd operated for years.

### The two-minute spoken version

You should be able to say the whole thing out loud in about two minutes:
"In the first month I'd get a small PR shipped early to prove the pipeline,
then map the system and ask the newcomer questions while I still can. By 60
I'd own a feature end to end and document what I learned ramping. By 90 I'd
lead something visible and bring you one measured improvement — not before,
because I want the evidence first." Calm, concrete, and it lands.
`,

  comparisons: [
    {
      label: "\"What would your first 90 days look like?\"",
      intro:
        "The final-round question that separates candidates. One gives a vague reassurance; the other presents a milestone plan with artifacts and success signals.",
      php: `# Weak: vague reassurance, no artifacts
answer: >
  I'd spend the first while getting up to speed and
  learning the codebase. I'm a fast learner, so I'd
  ramp up quickly and start contributing as soon as
  I can. I'd ask questions and try to be helpful
  wherever the team needs me.

# What the panel hears: no plan, no milestones, no way
# to tell at 30 days whether it's going well. "Ramp up"
# and "contribute" are not measurable. Sounds junior.`,
      ts: `# Strong: milestones with artifacts and success signals
plan:
  days_1_30:
    goal: orient + a small win
    ship: first PR merged in week one (proves the pipeline)
    learn: map the system myself, ask newcomer "why" questions
    signal: I can name the top 3 services and their owners
  days_31_60:
    goal: own a feature end to end
    ship: one user-facing feature designed, built, deployed by me
    give_back: document the onboarding gaps I just hit
    signal: a feature in prod + a doc the next hire will use
  days_61_90:
    goal: lead something visible
    ship: drive a project or a piece of technical direction
    propose: ONE measured improvement, backed by 60 days of evidence
    signal: trusted with scope; my proposal gets a real hearing

# What the panel hears: has onboarded before, thinks in
# milestones, knows month one isn't for impact. Senior.`,
      note:
        "The strong plan is falsifiable — at each checkpoint there's a concrete artifact and a success signal, so both you and the manager can tell whether it's on track. 'Ramp up' can't be measured.",
      leftLang: "yaml",
      rightLang: "yaml",
    },
    {
      label: "The newcomer's posture toward the codebase",
      intro:
        "How a new senior hire treats a legacy codebase in week one. One arrives with a rewrite crusade; the other observes, gathers evidence, and proposes later.",
      php: `// Weak: the day-one rewrite crusade
//
// Week 1, in the team channel:
// "Okay, I've looked at this codebase and honestly it needs
//  a serious rewrite. The architecture is wrong, there are no
//  tests worth the name, and we should move all of this to a
//  different pattern. I've seen this done right before and
//  this isn't it. Who do I talk to about planning the rewrite?"
//
// Result: torches credibility in week one. You don't yet know
// why any of it is the way it is — the 'obvious' rewrite usually
// has three good reasons you haven't discovered. Team defensive,
// judgment now suspect.`,
      ts: `// Strong: observe, gather evidence, propose at 90
//
// Week 1, asking questions:
// "Can you walk me through why the checkout flow is structured
//  this way? What breaks most often? What's been tried before?"
//
// Week 12, with evidence:
// "Over the last two months I've watched the deploy step fail
//  the same way six times — here's the data. I think a 3-day
//  investment in the CI pipeline pays back within a month. Want
//  me to write it up?"
//
// Result: the newcomer window is spent LEARNING the design, and
// the one proposal that comes is measured, evidenced, and small
// enough to say yes to. Credibility intact and growing.`,
      note:
        "Your judgment is senior on day one but your knowledge of THIS system isn't — so ask architecture questions freely and hold rewrite opinions for 90 days, until you have evidence instead of instinct.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The 30/60/90 plan as typed milestone objects. Each item carries a concrete action and the success signal that tells you it's done. Predict the three phase headers, then run it to see the full checklist.",
    code: `// A first-quarter plan you can actually check yourself against.

interface Item {
  action: string;
  signal: string; // how you KNOW it's done — not a vibe
}

interface Phase {
  window: string;
  theme: string;
  items: Item[];
}

const plan: Phase[] = [
  {
    window: "Days 1-30",
    theme: "Orient + a small win",
    items: [
      { action: "Ship first PR (however tiny)", signal: "merged in week one; pipeline proven" },
      { action: "Map the system yourself", signal: "can name top 3 services + owners" },
      { action: "Ask the newcomer 'why' questions", signal: "understand 3 non-obvious design choices" },
    ],
  },
  {
    window: "Days 31-60",
    theme: "Own a feature end to end",
    items: [
      { action: "Design + build + deploy one feature", signal: "it's live and I watched it in prod" },
      { action: "Document onboarding gaps I hit", signal: "a doc the next hire actually uses" },
    ],
  },
  {
    window: "Days 61-90",
    theme: "Lead something visible",
    items: [
      { action: "Drive a project or technical direction", signal: "trusted with real scope" },
      { action: "Propose ONE measured improvement", signal: "backed by 60 days of evidence, gets a hearing" },
    ],
  },
];

let n = 1;
for (const phase of plan) {
  console.log(\`\\n== \${phase.window}: \${phase.theme} ==\`);
  for (const item of phase.items) {
    console.log(\`  [\${n}] \${item.action}\`);
    console.log(\`      done when -> \${item.signal}\`);
    n++;
  }
}

const total = plan.reduce((sum, p) => sum + p.items.length, 0);
console.log(\`\\n\${total} checkpoints across 90 days. Rewrite opinions: held until day 90.\`);`,
  },

  keyPoints: [
    "A 30/60/90 plan answers the unspoken final-round question — 'what will you actually do here?' — and presenting one unprompted is a genuine differentiator.",
    "Days 1-30 are for orientation and a small win: first PR merged in week one to prove the pipeline, then map the system and ask newcomer 'why' questions while you still can.",
    "Days 31-60: own one feature end to end (designed, built, deployed, watched in prod) and pay your learning back as documentation for the next hire.",
    "Days 61-90: lead something visible and propose exactly ONE measured improvement, backed by evidence gathered in the first two months.",
    "Your judgment is senior from day one but your hands are new to the stack — ask architecture questions freely and early, but hold rewrite opinions for 90 days.",
    "The day-one rewrite crusade is the fastest way to burn credibility; the 'obvious' rewrite usually has three good reasons you haven't discovered yet.",
  ],

  interview: [
    {
      q: "What would your first 90 days on this team look like?",
      a: "In the first month I'd focus on orientation and one small win — I'd get a tiny PR merged in the first week to prove the local setup, review process, and deploy path all work, then spend the rest of the month mapping the system myself and asking the newcomer 'why' questions while I still get to ask them for free. By 60 days I'd own a feature end to end — designed, built, deployed, and watched in production by me — and I'd document the onboarding gaps I hit while they're fresh, because that's a gift to the next hire. By 90 I'd be leading something visible and I'd bring you exactly one measured improvement, backed by evidence I gathered in the first two months — not before, because I want the data first. Deliberately, I hold my rewrite opinions until I understand why the system is the way it is.",
    },
    {
      q: "You're new to TypeScript — how do you avoid slowing the team down while you ramp?",
      a: "By being honest about what's new and what isn't. My hands are new to the stack, so I lean on the team for idioms and tooling in the first weeks and I get a small PR through early to prove I can move through the pipeline without hand-holding. But my judgment is senior from day one, so I actually speed some things up — I ask the architecture questions a newcomer is allowed to ask, and those questions often surface assumptions nobody had revisited in years. I pay the ramp back fast by documenting what I learn. The one thing I consciously don't do is show up with rewrite opinions before I've earned the context to have them.",
    },
  ],

  quiz: [
    {
      question:
        "What is the primary goal of the first 30 days in a strong 30/60/90 plan?",
      options: [
        "Maximum impact — ship as many features as possible",
        "Orientation plus a small confidence-building win, like a first PR merged early",
        "Identifying everything that needs to be rewritten",
        "Staying invisible until you fully understand the codebase",
      ],
      answerIndex: 1,
      explain:
        "Month one is for orientation and a small win, not impact. A tiny first PR proves the setup, review, and deploy path work, and the rest of the month is archaeology — mapping the system and asking the 'why' questions only a newcomer gets to ask.",
    },
    {
      question:
        "Why should a senior hire hold their rewrite opinions for 90 days?",
      options: [
        "Company policy usually forbids code changes for 90 days",
        "Their judgment isn't senior yet — it takes 90 days to become senior",
        "Their judgment is senior but their knowledge of THIS system isn't; the 'obvious' rewrite usually has reasons they haven't found",
        "Rewrites are always a bad idea and should never be proposed",
      ],
      answerIndex: 2,
      explain:
        "A veteran's judgment is senior on day one, but knowledge of this specific system is not. The day-one rewrite crusade burns credibility because the 'obvious' fix usually has three good reasons you haven't discovered — observe, gather evidence, then propose one measured improvement.",
    },
    {
      question:
        "What makes a 30/60/90 plan credible rather than vague?",
      options: [
        "Using the words 'ramp up' and 'contribute' confidently",
        "Promising maximum impact in week one",
        "Each checkpoint has a concrete artifact and a measurable success signal",
        "Keeping it flexible with no specific commitments",
      ],
      answerIndex: 2,
      explain:
        "A strong plan is falsifiable: at each checkpoint there's a concrete artifact (a merged PR, a shipped feature, a doc) and a success signal, so both you and the manager can tell whether it's on track. 'Ramp up and contribute' can't be measured, which is why it reads as junior.",
    },
  ],
};

export default lesson;

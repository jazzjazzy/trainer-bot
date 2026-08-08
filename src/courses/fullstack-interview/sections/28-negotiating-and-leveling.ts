import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "negotiating-and-leveling",
  title: "Negotiating Offers and Fighting Down-Leveling",
  part: "Stories, Offers & Day One",
  estMinutes: 13,
  summary:
    "The 30 minutes of negotiation are worth years of salary: never name the first number, see the whole package before reacting, negotiate with enthusiasm, and fight down-leveling with scope evidence.",

  concept: `
The salary conversation is the highest-leverage half hour of the entire
process. The company has already decided they want you — that's why there's
an offer — so this is the one moment your negotiating position is strongest
and will never be this strong again. Most engineers, and especially ones
switching stacks, leave real money on the table because they treat the offer
as a verdict to accept rather than an opening position to improve.

### Never give the first number

When a recruiter asks "what are you looking for?", the honest-feeling answer
is a number, and it's almost always a mistake — you'll either anchor low and
cap yourself, or anchor high and get screened out before they even like you.
Deflect: "I want to find the right fit; I'm confident we can land on a number
that works if the role is right — what range is budgeted for this level?"
The first side to name a number loses information. Make them go first.

### See the whole picture before you react

Total compensation is base salary, cash bonus, equity, and benefits — react
to any one piece and you're negotiating blind. Get all of it in writing before
you respond: base, target bonus and how it's actually paid, equity type and
vesting schedule, and the benefits that have real cash value (retirement
match, health premiums, learning budget). Then evaluate the *package*, not the
base.

### Understand equity well enough to compare

- **RSUs** (restricted stock units) are actual shares granted on a vesting
  schedule — real value the day they vest, common at public companies.
- **Options** are the *right to buy* shares at a fixed strike price; they're
  worth something only if the company grows and you can afford to exercise —
  common at startups, and often worth zero.
- **Vesting** is almost always four years with a one-year cliff: you get
  nothing if you leave inside year one, then 25% vests, then monthly.
- A startup's headline "your equity could be worth 400k" is a *paper number*
  built on a hoped-for valuation. It is not salary and you cannot pay rent
  with it. Discount it heavily when comparing against guaranteed cash.

### Negotiate with enthusiasm, not ultimatums

The frame that works is collaborative: "I'm genuinely excited about this — I
want to make it work. Based on my experience and what I'm seeing in the
market, there's a gap on base; can we close it?" Enthusiasm plus a specific,
justified ask beats a cold ultimatum every time. Competing offers and honest
deadlines are legitimate levers — "I have another offer I need to respond to
by Friday" — used to create urgency, never as a threat.

### Fight the stack-switcher's down-level

The specific trap for you: an offer at mid-level "because you're new to the
stack." Reject the premise calmly. Your seniority is scope and judgment —
designing systems, running incidents, mentoring — none of which resets
because the language changed. Counter with evidence from your own record and
the plain business logic: hiring senior judgment is expensive and slow, and
they're getting it in someone who has *already* proven they can switch stacks.
Bring the scope, and make them level you on judgment, not syntax.
`,

  comparisons: [
    {
      label: "The recruiter asks for your number",
      intro:
        "The recruiter screen's classic question: 'what are you looking for, comp-wise?' One answer surrenders the anchor; the other keeps the information advantage.",
      php: `// Weak: names a number, anchors yourself
//
// Recruiter: "What are your salary expectations?"
//
// You: "I'm currently on about 120, so I'm hoping for maybe
//  130? 135 would be great but I'm flexible, really — whatever
//  seems fair for the role."
//
// Result: you just capped the offer at ~135 before they told
// you the band was 150-180. 'Flexible' and 'whatever seems
// fair' signal you won't push. Money left on the table:
// possibly 30-45k a year.`,
      ts: `// Strong: deflect, make them anchor
//
// Recruiter: "What are your salary expectations?"
//
// You: "I want to find the right fit first — I'm confident that
//  if the role is right, we'll land on a number that works for
//  both of us. To make sure we're in the same ballpark, what
//  range is budgeted for this level?"
//
// Result: they name the band. Now you negotiate up from the
// TOP of their range with your scope as justification, instead
// of up from a number you invented under pressure.`,
      note:
        "The first party to name a number loses information. Deflecting to 'what's budgeted for this level?' costs nothing and routinely surfaces a band well above what you'd have guessed.",
    },
    {
      label: "The offer comes in a level low",
      intro:
        "The stack-switcher's specific fight: an offer at mid-level 'because you're new to TypeScript.' One accepts the framing; the other rejects the premise with evidence.",
      php: `// Weak: accepts the down-level
//
// "I understand — I am new to the TypeScript stack, so mid-level
//  makes sense. I'm just grateful for the opportunity and I'm
//  sure I'll level up quickly once I'm in. Mid-level is fine."
//
// Result: 6-18 months and a full promotion cycle to recover a
// level you already earned. Comp anchored to the wrong tier.
// The 'new to the stack' framing went unchallenged.`,
      ts: `// Strong: reject the premise, counter with scope
//
// "I appreciate the offer, and I want to make this work — but
//  I'd push back on the level. My seniority isn't the language;
//  it's 25 years of designing systems, owning incidents, and
//  mentoring teams — none of which resets because the syntax
//  changed. I've already proven I can switch stacks: I built and
//  shipped a full SvelteKit app. Hiring senior judgment is
//  expensive and slow, and you're getting it in someone who
//  ramps faster than a junior. I'm looking for the senior level
//  and the band that goes with it."
//
// Result: reframes 'new to the stack' as 'proven stack-switcher
// with senior judgment.' Levels the conversation on judgment,
// not syntax.`,
      note:
        "Down-leveling costs a full promotion cycle to undo, so it's worth the discomfort of pushing back on day one — anchor on scope and judgment, which don't reset when the language does.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "An offer comparator: a higher base with a small bonus versus a lower base at a startup leaning on option upside. Predict which wins on guaranteed cash and which on 4-year total — then run it and note how much of Offer B is paper.",
    code: `// Compare two offers on cash you can count vs paper upside.

interface Offer {
  company: string;
  level: string;
  base: number;        // annual salary
  bonusPct: number;    // target bonus as % of base
  equityPerYear: number; // annualised grant value at face
  equityKind: "RSU" | "options";
  // How much of the equity face value to trust as real cash.
  // RSUs at a public co ~ 0.9; startup options ~ 0.25.
  equityConfidence: number;
}

const offerA: Offer = {
  company: "PublicCo",
  level: "Senior",
  base: 165_000,
  bonusPct: 0.12,
  equityPerYear: 30_000,
  equityKind: "RSU",
  equityConfidence: 0.9,
};

const offerB: Offer = {
  company: "StartupCo",
  level: "Senior",
  base: 145_000,
  bonusPct: 0.05,
  equityPerYear: 90_000, // big paper number
  equityKind: "options",
  equityConfidence: 0.25,
};

function guaranteedCashPerYear(o: Offer): number {
  return o.base + o.base * o.bonusPct;
}

function realisticTotalPerYear(o: Offer): number {
  return guaranteedCashPerYear(o) + o.equityPerYear * o.equityConfidence;
}

function pad(n: number): string {
  return ("$" + Math.round(n).toLocaleString("en-US")).padStart(12);
}

for (const o of [offerA, offerB]) {
  const cash = guaranteedCashPerYear(o);
  const real = realisticTotalPerYear(o);
  const facePaper = o.equityPerYear;
  console.log(\`\\n\${o.company} (\${o.level}) — \${o.equityKind}\`);
  console.log(\`  guaranteed cash/yr : \${pad(cash)}\`);
  console.log(\`  equity face/yr     : \${pad(facePaper)}  (trust \${o.equityConfidence * 100}%)\`);
  console.log(\`  realistic total/yr : \${pad(real)}\`);
  console.log(\`  realistic 4-yr     : \${pad(real * 4)}\`);
}

const diff = realisticTotalPerYear(offerA) - realisticTotalPerYear(offerB);
console.log(\`\\nOffer A leads by \${pad(Math.abs(diff))}/yr on realistic comp.\`);
console.log(\`StartupCo's face total/yr looks higher, but \${(offerB.equityPerYear - offerB.equityPerYear * offerB.equityConfidence).toLocaleString("en-US")} of it is paper.\`);`,
  },

  keyPoints: [
    "The negotiation is the highest-leverage moment of the process — the company already wants you, so your position will never be stronger; treat the offer as an opening, not a verdict.",
    "Never name the first number; deflect with 'what range is budgeted for this level?' — the first side to anchor loses information.",
    "Get the whole package in writing (base, bonus, equity type and vesting, benefits) before reacting, and evaluate the total comp, not the base.",
    "Know equity well enough to compare: RSUs are real shares on a vesting schedule; options are the right to buy and are often worth zero; a startup's paper number is not salary.",
    "Negotiate with enthusiasm and a specific justified ask ('I want this to work — here's the gap'); competing offers and honest deadlines are legitimate levers, not threats.",
    "Fight the stack-switcher's down-level by rejecting the premise: seniority is scope and judgment, which don't reset when the language changes — anchor on that, not syntax.",
  ],

  interview: [
    {
      q: "What are your salary expectations for this role?",
      a: "I want to find the right fit first — I'm confident that if the role is right, we'll land on a number that works for both of us. To make sure we're in the same ballpark, could you tell me what range is budgeted for this level? I'd rather calibrate to how you level the role and then talk specifics, because my expectation is really a function of the scope and seniority we're both agreeing on. Once I understand the band and the equity structure, I can give you a clear, justified number.",
    },
    {
      q: "We'd like to bring you in at mid-level since TypeScript is new to you. How does that sound?",
      a: "I appreciate the offer and I genuinely want to make this work, but I'd push back on the level. My seniority isn't the language — it's twenty-five years of designing systems, owning production incidents, and mentoring teams, and none of that resets because the syntax changed. I've already proven I can switch stacks: I built and shipped a full SvelteKit application end to end. Hiring senior judgment is expensive and slow, and you're getting it in someone who ramps faster than a junior would, so I'm looking for the senior level and the band that goes with it. If we can align on that, I'm ready to move.",
    },
    {
      q: "How do you think about comparing a big-company offer against a startup one?",
      a: "I separate cash I can count from paper I can only hope for. Base and bonus are guaranteed, so those compare directly. Equity I discount by confidence: public-company RSUs vest into real shares, so I trust most of that face value, but startup options are the right to buy at a strike price and are often worth nothing, so I discount them heavily — a headline 'could be worth 400k' is a valuation bet, not salary. Then I compare realistic four-year totals, factor in the four-year-with-one-year-cliff vesting, and only after that weigh the intangibles like growth and risk appetite. I never let a big paper number outrank guaranteed cash without consciously pricing the gamble.",
    },
  ],

  quiz: [
    {
      question:
        "Why should you avoid naming the first salary number when a recruiter asks?",
      options: [
        "It's considered rude to discuss money directly",
        "The first party to name a number loses information — you may cap yourself below their band or screen yourself out",
        "Recruiters aren't allowed to negotiate anyway",
        "It's better to negotiate only after the first day of work",
      ],
      answerIndex: 1,
      explain:
        "Naming a number anchors the whole negotiation to a figure you invented under pressure. Deflecting to 'what's budgeted for this level?' costs nothing and often reveals a band well above what you'd have asked for.",
    },
    {
      question:
        "What's the key difference between RSUs and stock options when comparing offers?",
      options: [
        "RSUs are for startups; options are for public companies",
        "RSUs are actual shares with real value when they vest; options are the right to buy at a strike price and can be worth zero",
        "Options always vest faster than RSUs",
        "There's no practical difference — both are just 'equity'",
      ],
      answerIndex: 1,
      explain:
        "RSUs grant actual shares on a vesting schedule with real value the day they vest. Options only pay off if the company grows above the strike price and you can afford to exercise — common at startups and often worth nothing, so they must be discounted heavily against guaranteed cash.",
    },
    {
      question:
        "You're offered mid-level 'because you're new to the stack.' What's the strong response?",
      options: [
        "Accept graciously and aim to get promoted quickly once inside",
        "Reject the offer outright and walk away",
        "Reject the premise: seniority is scope and judgment, which don't reset when the language changes — counter with evidence",
        "Ask for a mid-level title but senior-level pay",
      ],
      answerIndex: 2,
      explain:
        "Down-leveling costs a full promotion cycle to undo. The strong move is to reject the framing calmly and anchor on scope and judgment — system design, incident ownership, mentoring — none of which resets because the syntax changed, backed by concrete evidence like a shipped project.",
    },
  ],
};

export default lesson;

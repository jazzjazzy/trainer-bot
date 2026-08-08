import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "evals",
  title: "Evals: Measuring Quality Beyond Vibes",
  part: "Production Engineering",
  estMinutes: 13,
  summary:
    "Evals are the test suite for model behavior — a fixture set, a grader per case, and a runner that scores every prompt change before it ships.",

  concept: `
"It seems better" is not an engineering claim. When you change a prompt, swap a
model, or tweak a tool description, you need to know whether quality went up or
down — and a couple of hand-checked examples in a playground can't tell you.
**Evals are the automated test suite for model behavior**: a fixture set of
real inputs, expected properties per case, and a runner that scores every
change. If you've written a PHPUnit suite, you already have the mental model —
these are unit tests where the thing under test is a prompt.

### The grader ladder: cheapest check that works

Pick the simplest grader that actually verifies the property:

- **Programmatic / exact checks** — for structured tasks. Does the output
  parse as JSON? Does it contain the required fields? Is the label correct?
  These are free, instant, and deterministic — a plain \`JSON.parse\` and an
  equality test. Use them wherever the answer is checkable in code.
- **Rubric scoring** — for fuzzier tasks. Break "is it good?" into a list of
  independent binary criteria: *answers the question*, *no invented policy*,
  *polite tone*. Each is gradeable; the vague whole is not.
- **LLM-as-judge** — a cheap model (like \`claude-haiku-4-5\`) grading outputs
  against that rubric, for genuinely subjective qualities like helpfulness or
  faithfulness. Powerful but not free of caveats: judges have biases, can be
  gamed by verbose output, and drift — so **calibrate** the judge against a
  sample of human-labelled cases and spot-check it, don't trust it blind.

### Build the eval set from production failures

The best fixtures aren't invented — they're harvested. Every time the feature
misbehaves in production, add that input to the eval set with the property it
should have satisfied. Over time your suite becomes a museum of every way the
feature has ever broken, and a prompt change can't silently reintroduce an old
bug without a red case catching it.

### Regression-test prompts like code

Treat a prompt change like a pull request: run the full suite on the old prompt
and the new one, and compare pass rates **case by case**. The headline number
going up is not enough — v2 can improve the average while quietly regressing a
case that v1 handled. A per-case diff is what catches that. This is exactly the
discipline that separates candidates who've shipped an LLM feature from those
who've only followed a tutorial: the shipped ones have an eval harness and run
it on every change.
`,

  comparisons: [
    {
      label: "Eyeballing three outputs vs running a fixture suite",
      intro:
        "Decide whether a classifier is good enough to deploy. One version spot-checks a few examples by eye; the other scores a fixture set and gates the deploy on the pass rate.",
      php: `// First attempt: ship on vibes
const samples = ["order #123", "where is my stuff", "REFUND NOW"];
for (const s of samples) {
  console.log(await classify(s)); // eyeball three, looks fine, deploy
}
// No number, no baseline, no way to know if the next prompt tweak
// makes things better or worse.`,
      ts: `// Production: a fixture set with expected properties, scored automatically
interface EvalCase { input: string; expect: (out: string) => boolean; }
const suite: EvalCase[] = loadFixtures("./evals/classify.json"); // 50+ real cases

let passed = 0;
for (const c of suite) {
  const out = await classify(c.input);
  if (c.expect(out)) passed++;
}
console.log(\`pass rate: \${passed}/\${suite.length}\`); // gate the deploy on this`,
      note:
        "Three eyeballed samples give you a feeling; a scored fixture set gives you a number you can diff across prompt versions and set a release threshold against.",
    },
    {
      label: "A vague judge prompt vs a binary rubric",
      intro:
        "Use an LLM to grade support replies. One judge prompt asks a fuzzy question; the other asks for independent binary criteria.",
      php: `// First attempt: a vague judge -> noisy, unreproducible scores
const judgePrompt = \`Is this support reply good? Rate it 1-10.

Reply: \${reply}\`;
// "good" means nothing consistent; the same reply scores 6 today and
// 8 tomorrow, so you can't compare prompt versions with it.`,
      ts: `// Production: a rubric of independent, checkable criteria
const judgePrompt = \`Score this reply. Answer ONLY with a JSON object.

Reply: \${reply}

Return:
{
  "answers_question": true or false,
  "no_invented_policy": true or false,
  "polite_tone": true or false
}\`;
// Each criterion is gradeable on its own; you can calibrate the judge
// against human-labelled cases and watch each criterion over time.`,
      note:
        "A 1-10 'is it good' score is unstable and unactionable. Binary criteria are reproducible, individually checkable, and let you see exactly which quality regressed.",
    },
    {
      label: "LLM-judging a trivial check vs using a programmatic grader",
      intro:
        "Grade whether the model emitted the right label. One version pays for a model call; the other uses a free deterministic check.",
      php: `// First attempt: LLM-judge everything, even an exact-match check
const ok = await llmJudge(\`Did the model output the label "billing"? \${out}\`);
// Slow, costs a model call per case, and can be WRONG about a check
// a single line of code answers perfectly.`,
      ts: `// Production: cheapest grader that works — programmatic for structured tasks
const ok = JSON.parse(out).label === "billing"; // exact, free, deterministic

// Reserve the LLM-judge (a cheap model like claude-haiku-4-5 + a rubric)
// for genuinely fuzzy output — tone, helpfulness, faithfulness — and
// spot-check its grades against human labels.`,
      note:
        "Match the grader to the task: exact code checks for structured output, LLM-judge only for the subjective parts. Judging a label check wastes money and adds noise.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A mini eval harness: three fixture cases with programmatic graders, run against two 'prompt versions' whose outputs are canned here. Predict the pass rates — and watch the per-case diff catch v2 regressing a case even as it improves overall.",
    code: `// A mini eval harness. Graders are programmatic; the model outputs are
// canned per prompt version (in real life the model produces them). The
// lesson is the SCORING and the regression diff, not the model call.

const parsesAsJson = (out: string) => {
  try { JSON.parse(out); return true; } catch { return false; }
};
const hasField = (field: string) => (out: string) => {
  try { return field in JSON.parse(out); } catch { return false; }
};
const labelIs = (want: string) => (out: string) => {
  try { return JSON.parse(out).label === want; } catch { return false; }
};

interface Case {
  id: string;
  graders: { name: string; check: (out: string) => boolean }[];
}

const cases: Case[] = [
  { id: "refund", graders: [
    { name: "parses", check: parsesAsJson },
    { name: "has label", check: hasField("label") },
    { name: "label=billing", check: labelIs("billing") },
  ]},
  { id: "bug", graders: [
    { name: "parses", check: parsesAsJson },
    { name: "has label", check: hasField("label") },
    { name: "label=technical", check: labelIs("technical") },
  ]},
  { id: "praise", graders: [
    { name: "parses", check: parsesAsJson },
    { name: "has label", check: hasField("label") },
    { name: "label=feedback", check: labelIs("feedback") },
  ]},
];

// Canned model outputs per prompt version, keyed by case id.
const outputs: Record<string, Record<string, string>> = {
  v1: {
    refund: '{"label": "billing"}',
    bug: 'Sure! It looks like {"label": "technical"}', // preamble breaks JSON.parse
    praise: '{"label": "billing"}',                     // wrong label
  },
  v2: {
    refund: '{"label": "payments"}',   // REGRESSED: was correct, now wrong label
    bug: '{"label": "technical"}',     // fixed: strict JSON now
    praise: '{"label": "feedback"}',   // fixed: correct label
  },
};

function scoreCase(c: Case, out: string): { passed: number; total: number; ok: boolean } {
  let passed = 0;
  for (const g of c.graders) if (g.check(out)) passed++;
  return { passed, total: c.graders.length, ok: passed === c.graders.length };
}

const versions = ["v1", "v2"];
for (const v of versions) {
  console.log("=== " + v + " ===");
  let casesPassed = 0;
  for (const c of cases) {
    const s = scoreCase(c, outputs[v][c.id]);
    if (s.ok) casesPassed++;
    console.log(
      "  " + c.id.padEnd(8) + (s.ok ? "PASS" : "FAIL") +
      "  (" + s.passed + "/" + s.total + " checks)",
    );
  }
  console.log("  pass rate: " + casesPassed + "/" + cases.length);
  console.log("");
}

// The headline number improved (1/3 -> 2/3), but did anything regress?
console.log("=== v1 -> v2 diff ===");
for (const c of cases) {
  const a = scoreCase(c, outputs.v1[c.id]).ok;
  const b = scoreCase(c, outputs.v2[c.id]).ok;
  if (a !== b) {
    console.log(
      "  " + c.id + ": " + (a ? "PASS" : "FAIL") + " -> " + (b ? "PASS" : "FAIL") +
      (b ? "  (fixed)" : "  (REGRESSED)"),
    );
  }
}`,
  },

  keyPoints: [
    "Evals are the test suite for model behavior: fixtures of real inputs, an expected property per case, and a runner that scores every prompt/model change before it ships.",
    "Climb the grader ladder from cheapest: programmatic/exact checks for structured output, rubric scoring for fuzzy tasks, LLM-as-judge only for genuinely subjective qualities.",
    "LLM-as-judge (a cheap model like claude-haiku-4-5 against a rubric) has biases and drift — calibrate and spot-check it against human labels rather than trusting it blind.",
    "Build the eval set from production failures: every real misbehavior becomes a fixture, so a prompt change can't silently reintroduce an old bug.",
    "Regression-test prompts like code — diff pass rates case by case, because a change can raise the average while quietly regressing an individual case.",
    "A binary rubric (independent true/false criteria) is reproducible and actionable; a vague 1-10 'is it good' score is noisy and can't be compared across versions.",
  ],

  interview: [
    {
      q: "How do you know a prompt change actually improved your LLM feature?",
      a: "I run an eval suite — the test suite for model behavior. It's a fixture set of real inputs, each with the properties the output should satisfy, and a runner that scores every case. When I change a prompt, I run the whole suite on the old version and the new one and compare pass rates case by case, not just the headline average, because a change can lift the average while regressing a case the old prompt handled. The fixtures come largely from production failures: whenever the feature misbehaves, that input becomes a new case, so the suite accumulates every way the feature has ever broken and guards against reintroducing those bugs.",
    },
    {
      q: "Walk me through how you'd grade outputs. When would you use an LLM as a judge?",
      a: "I use the cheapest grader that actually verifies the property — a ladder. For structured tasks I use programmatic checks: does it parse as JSON, does it have the required fields, is the label right — free, instant, deterministic. For fuzzier tasks I write a rubric of independent binary criteria, like 'answers the question', 'invents no policy', 'polite tone', because you can grade each one but not the vague whole. LLM-as-judge — a cheap model like claude-haiku-4-5 scoring against that rubric — I reserve for genuinely subjective qualities like helpfulness or faithfulness. And I don't trust the judge blindly: judges have biases, can be swayed by verbose output, and drift, so I calibrate it against a sample of human-labelled cases and spot-check its grades.",
    },
    {
      q: "Why is a rubric of binary criteria better than asking the model to rate a reply 1 to 10?",
      a: "Because a 1-to-10 score isn't reproducible or actionable. 'Good' means something slightly different every run, so the same reply might score 6 one day and 8 the next, and you can't compare two prompt versions with a metric that unstable. Breaking it into independent binary criteria — answers the question yes/no, invents no policy yes/no, polite yes/no — makes each judgment checkable on its own, far more consistent, and diagnostic: when the score drops you can see exactly which criterion regressed instead of staring at a vague number that fell from 7 to 6.",
    },
  ],

  quiz: [
    {
      question:
        "You change a prompt and your eval suite's overall pass rate goes from 60% to 66%. Why isn't that alone enough to ship?",
      options: [
        "Pass rate is meaningless; only manual review counts",
        "The average can rise while an individual case that passed before now regresses — you need a per-case diff to catch it",
        "66% is below the required 90% for any deploy",
        "Eval suites can't be run on prompt changes",
      ],
      answerIndex: 1,
      explain:
        "A higher average can hide a regression: v2 might fix two cases and break one that v1 handled. Comparing pass/fail case by case surfaces the regressed case, which the headline number conceals.",
    },
    {
      question:
        "You need to grade whether a classifier output has the correct label 'billing'. Which grader is the right choice?",
      options: [
        "An LLM-as-judge call asking if the label looks correct",
        "A programmatic check: JSON.parse(out).label === 'billing' — exact, free, deterministic",
        "A human reviewer for every case",
        "A 1-10 rubric score from a large model",
      ],
      answerIndex: 1,
      explain:
        "Label correctness is exactly checkable in code, so a programmatic grader is free, instant, and never wrong about it. LLM-as-judge is for genuinely fuzzy qualities like tone or helpfulness, not for checks a single line of code answers.",
    },
    {
      question:
        "What is the main caveat of using a cheap model as an LLM-as-judge?",
      options: [
        "It can only grade its own outputs",
        "Judges have biases and drift, so you must calibrate and spot-check them against human labels",
        "It is always more expensive than a human reviewer",
        "It cannot output structured scores",
      ],
      answerIndex: 1,
      explain:
        "LLM judges can be biased (e.g. toward verbose answers) and their behavior drifts, so a judge grade isn't ground truth. Calibrating against a sample of human-labelled cases and periodically spot-checking keeps the judge honest.",
    },
  ],
};

export default lesson;

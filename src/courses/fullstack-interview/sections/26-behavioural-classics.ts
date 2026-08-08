import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "behavioural-classics",
  title: "The Behavioural Classics, Answered with Scope",
  part: "Stories, Offers & Day One",
  estMinutes: 12,
  summary:
    "The canonical behavioural prompts test self-awareness, ownership, and influence without authority — not events; a 25-year career answers them with data, empathy, and a named systemic fix.",

  concept: `
Behavioural rounds feel like storytelling, but they are a rubric in disguise.
The interviewer is not collecting anecdotes — they are probing three traits
that predict whether a senior hire is safe to trust: **self-awareness**
(do you see your own part accurately), **ownership** (do you act on problems
you don't formally own), and **influence without authority** (can you move
people who don't report to you). Every classic prompt is a different lens on
those three. Once you know what is being scored, you stop telling the story
you find flattering and start telling the one that produces the evidence.

### The five prompts and what each is really asking

- **"Tell me about a conflict."** Not "were you right" — *how do you disagree
  and stay in the room*. Scores empathy plus data.
- **"Tell me about a failure."** Not "confess a sin" — *do you own outcomes
  and fix the system, not just the symptom*. Scores accountability.
- **"A time you disagreed with your manager."** Scores backbone with
  professionalism: you pushed, you were heard, and you committed to the call
  once it was made — even the one that went against you.
- **"Your proudest project."** Scores scope and impact — can you articulate
  *why it mattered* in numbers, not just what you built.
- **"A time you delivered under a tight deadline."** Scores judgment under
  pressure: what you cut, what you protected, and what you refused to fake.

### Conflict: data plus empathy, never a verdict

A weak conflict answer is a courtroom summary where you win. A strong one
treats the other person as reasonable and the disagreement as a shared
problem with a shared metric. In twenty-five years you have had the argument
where you were wrong, and saying so is the strongest possible signal —
it proves the self-awareness the whole round is measuring.

### Failure: own it, then name the systemic fix

Juniors describe a failure as bad luck; seniors describe the process gap that
allowed it and the guardrail they added so it can't recur. "I shipped a bad
migration" is a symptom. "We had no staging replica and no migration review,
so I added both, and that class of incident stopped" is ownership. The result
is not the apology — it is the system that is now stronger.

### The traps that sink strong candidates

- **Badmouthing a past employer or colleague.** It answers a question nobody
  asked — "what will you say about *us* in two years" — and it always loses.
- **The fake weakness.** "I'm a perfectionist" / "I care too much" reads as
  evasion. A real weakness with an active mitigation reads as maturity.
- **No Result.** A story that ends at the action, with no measurable outcome
  and no lesson, scores as "didn't see it through." Always land the plane.
`,

  comparisons: [
    {
      label: "\"Tell me about a conflict\"",
      intro:
        "The same real disagreement over a caching strategy, told two ways. One wins an argument; the other demonstrates the trait being scored.",
      php: `// Weak: blame-flavoured, a verdict in your own favour
//
// "I had a conflict with a backend dev who wanted to cache
//  everything in Redis. I knew it was the wrong call — he
//  didn't understand our invalidation problem. I told him it
//  wouldn't work, he pushed back, and eventually production
//  proved me right when the cache served stale prices. So
//  yeah, I was correct and he had to walk it back."
//
// What the interviewer hears: makes others wrong, no empathy,
// 'I was right' is the whole point. Scores low on self-awareness.`,
      ts: `// Strong: shared problem, data, empathy, committed outcome
//
// "A backend engineer wanted to cache pricing aggressively in
//  Redis; I worried about stale prices during promotions. Rather
//  than argue opinions, we agreed on the metric that mattered —
//  price-correctness during a sale — and I pulled a week of
//  promo traffic to see the real invalidation rate. The data
//  showed his read-heavy paths were safe to cache but the promo
//  path wasn't, so we split the policy: cache the catalogue,
//  compute promo prices live. He was right about most of it;
//  I was right about the edge. We shipped it together and stale-
//  price incidents went to zero that quarter."
//
// What the interviewer hears: disagrees with data not ego,
// grants the other person credit, lands a measured result.`,
      note:
        "The strong version never announces a winner — it converts the conflict into a shared metric, which is exactly the self-awareness and influence the prompt scores.",
    },
    {
      label: "\"What's your biggest weakness?\"",
      intro:
        "The most-dodged question in the loop. One answer evades; the other names a real gap and the guardrail already in place around it.",
      php: `// Weak: the fake weakness
//
// "Honestly? I'm a perfectionist. I care too much about the
//  code and sometimes I work too hard on things. I guess I
//  need to learn to let 'good enough' be good enough."
//
// What the interviewer hears: won't answer the question, humble-
// brag, zero self-awareness. This is a scored negative, not a
// safe dodge — it reads as 'can't be honest about limitations.'`,
      ts: `// Strong: real weakness + active mitigation
//
// "Coming from a long PHP background, my instinct is to reach
//  for a runtime check where a strong type would catch the bug
//  at compile time — I under-used the type system at first. I
//  noticed it in code review when reviewers kept suggesting
//  discriminated unions I'd have written as string checks. So I
//  made a rule: model state as types before I write logic, and
//  I pair-review my own PRs against that. It's a gap I actively
//  manage rather than one I've magically fixed."
//
// What the interviewer hears: honest, specific, self-correcting,
// already improving. Real weakness + mitigation = maturity.`,
      note:
        "A concrete weakness with a working mitigation scores higher than any 'strength disguised as flaw' — the round rewards self-awareness, and evasion is the opposite of it.",
    },
    {
      label: "\"Tell me about a failure\"",
      intro:
        "A production incident, told without a Result versus told with the systemic fix named. Only one demonstrates ownership.",
      php: `// Weak: a symptom and an apology, no Result
//
// "I once pushed a database migration that locked a big table
//  during peak hours and took checkout down for a bit. It was
//  bad. I felt terrible about it and I was more careful after
//  that."
//
// What the interviewer hears: bad luck, vague, no lesson, no
// systemic change. 'More careful' is not a fix. No Result.`,
      ts: `// Strong: own the outcome, fix the system, land the Result
//
// "I ran a migration that took an exclusive lock on the orders
//  table at peak and stalled checkout for about eleven minutes.
//  I owned it in the incident channel immediately and rolled it
//  back. But the real failure was systemic: we had no way to
//  review migrations for locking behaviour and no staging replica
//  with production-scale data. So I introduced a migration
//  checklist that flags locking operations and a rule that large
//  migrations run in off-peak windows behind a feature flag. That
//  class of incident hasn't recurred in the eighteen months since."
//
// What the interviewer hears: accountable, names the process gap,
// builds a guardrail, quantifies the result. Textbook ownership.`,
      note:
        "The Result of a failure story is never the apology — it's the system that is now stronger. Naming the process gap, not just the mistake, is the senior move.",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A cheat-sheet mapping the five classic prompts to the trait each one actually scores, plus the trap that tanks it. Predict what an interviewer would write in the debrief for a strong answer to each — then read the notes.",
    code: `# behavioural-rubric.yaml
# What each classic prompt is REALLY measuring.

prompts:
  - ask: "Tell me about a conflict"
    scores: self-awareness + influence without authority
    strong_signal: converts disagreement into a shared metric
    trap: turning it into a verdict where you win

  - ask: "Tell me about a failure"
    scores: ownership + accountability
    strong_signal: names the systemic fix, not just the mistake
    trap: ending at the apology with no Result

  - ask: "A time you disagreed with your manager"
    scores: backbone + professionalism
    strong_signal: pushed with data, then committed to the call
    trap: either caving instantly or never letting it go

  - ask: "Your proudest project"
    scores: scope + quantified impact
    strong_signal: why it mattered, in numbers
    trap: a feature tour with no business outcome

  - ask: "A tight deadline"
    scores: judgment under pressure
    strong_signal: what you cut vs what you protected
    trap: heroics with no mention of trade-offs`,
    output: `Interviewer debrief notes on strong answers:

conflict     -> "Didn't try to win. Pulled real traffic data,
                gave the other engineer credit, split the policy.
                Stale-price incidents to zero. Strong hire signal."

failure      -> "Owned an 11-min checkout outage without flinching.
                Fixed the PROCESS — migration review + off-peak
                windows. No recurrence in 18 months. Very senior."

disagreement -> "Pushed back on a deadline with data, was overruled,
                shipped the manager's plan cleanly anyway. Backbone
                + committable. Exactly what I want on my team."

proudest     -> "Led the checkout rewrite; cut cart abandonment 8%,
                p95 latency 40%. Talks in impact, not features."

deadline     -> "Cut the nice-to-have dashboard, protected payment
                correctness, flagged the risk early. No fake heroics.
                Trusted judgment under pressure."

Verdict: consistent ownership + quantified results across the
board. No badmouthing, no fake-perfectionist dodge. Advance.`,
  },

  keyPoints: [
    "Behavioural prompts score three traits, not events: self-awareness, ownership, and influence without authority — answer to the trait, not the plot.",
    "A conflict answer wins by converting the disagreement into a shared metric and granting the other person credit, never by declaring yourself the winner.",
    "A failure story's Result is the systemic guardrail you added, not the apology — name the process gap that let it happen and the fix that stopped recurrence.",
    "The three fatal traps: badmouthing a past employer, the fake 'perfectionist' weakness, and any story that ends at the action with no measurable Result.",
    "Answer 'biggest weakness' with a real gap plus an active mitigation — evasion scores as a negative, honesty-with-a-plan scores as maturity.",
    "Twenty-five years means you have the story where you were wrong; telling it is the single strongest self-awareness signal you can give.",
  ],

  interview: [
    {
      q: "Tell me about a time you had a conflict with a coworker.",
      a: "A backend engineer wanted to cache pricing aggressively in Redis and I was worried about serving stale prices during promotions. Instead of arguing opinions, we agreed on the metric that actually mattered — price correctness during a sale — and I pulled a week of promotional traffic to measure the real invalidation rate. The data showed his read-heavy catalogue paths were safe to cache but the promo path wasn't, so we split the policy: cache the catalogue, compute promo prices live. He was right about most of it and I was right about the edge case; we shipped it together and stale-price incidents went to zero that quarter. The lesson I carry is that most engineering conflict dissolves the moment you agree on the number you're both trying to move.",
    },
    {
      q: "What's your biggest weakness?",
      a: "Coming from a long PHP background, my first instinct was to reach for a runtime check where a strong type would have caught the bug at compile time — I under-used TypeScript's type system when I started. I noticed it because reviewers kept suggesting discriminated unions where I'd written string comparisons. So I made it a working rule to model state as types before I write the logic, and I review my own pull requests against that habit before I open them. It's a gap I actively manage rather than one I'll claim I've perfectly solved — and being able to say that honestly is part of the point.",
    },
    {
      q: "Tell me about your biggest professional failure.",
      a: "I once ran a database migration that took an exclusive lock on the orders table at peak traffic and stalled checkout for about eleven minutes. I owned it in the incident channel immediately and rolled it back, but the real failure was systemic: we had no process to review migrations for locking behaviour and no staging replica with production-scale data. So I introduced a migration checklist that flags locking operations and a rule that large migrations run off-peak behind a feature flag, and that class of incident hasn't recurred in the eighteen months since. The mistake was mine; the fix was making sure the next person couldn't repeat it.",
    },
  ],

  quiz: [
    {
      question:
        "What is a behavioural interviewer primarily trying to measure with 'tell me about a conflict'?",
      options: [
        "Whether you were technically correct in the disagreement",
        "Self-awareness and your ability to influence people without authority",
        "How many conflicts you've been involved in",
        "Whether you can avoid conflict entirely",
      ],
      answerIndex: 1,
      explain:
        "The prompt is a lens on self-awareness and influence-without-authority. Being 'right' is beside the point — a strong answer converts the disagreement into a shared metric and grants the other person credit, which is what actually gets scored.",
    },
    {
      question:
        "Why does 'my biggest weakness is that I'm a perfectionist' score poorly?",
      options: [
        "Perfectionism is genuinely a strength, so it's dishonest",
        "It reads as evasion — the round scores self-awareness, and dodging is the opposite",
        "Interviewers prefer candidates with no weaknesses",
        "It takes too long to say",
      ],
      answerIndex: 1,
      explain:
        "The weakness question scores self-awareness. A strength-disguised-as-flaw is a transparent dodge and registers as 'can't be honest about limitations.' A real weakness paired with an active mitigation scores as maturity instead.",
    },
    {
      question:
        "In a failure story, what should the 'Result' actually be?",
      options: [
        "A sincere apology and a promise to be more careful",
        "Proof that the failure wasn't really your fault",
        "The systemic guardrail you added so the problem can't recur",
        "A different, more impressive success to change the subject",
      ],
      answerIndex: 2,
      explain:
        "Ownership means fixing the system, not just the symptom. The Result that demonstrates seniority is the process gap you identified and the guardrail you built — ideally with a measurable 'hasn't recurred since,' not an apology.",
    },
  ],
};

export default lesson;

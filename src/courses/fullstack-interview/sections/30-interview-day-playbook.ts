import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 30,
  slug: "interview-day-playbook",
  title: "Interview-Day Playbook and Course Cheatsheet",
  part: "Stories, Offers & Day One",
  estMinutes: 12,
  summary:
    "The whole course compressed into what to load the night before — the design method, coding patterns with triggers, the STAR bank, logistics, and a rejection protocol — because a stack-switch search is won across many loops.",

  concept: `
This is the capstone: everything the course taught, compressed into what you
actually load into your head the night before an interview and what you do on
the day. The night before is not for learning new topics — it's for reviewing
your own material until it's calm and ready. Panic-cramming a system-design
concept you've never practised at 11pm makes you worse the next morning, not
better; reviewing the six stories and four patterns you already own makes you
sharp.

### The 4-step design method

Every system-design round runs on the same rails, so walk them out loud:
**(1) Requirements** — clarify functional scope and the non-functional
numbers (users, QPS, read/write ratio, data size). **(2) API sketch** —
name the handful of endpoints with verbs and payloads. **(3) Data model** —
the tables or keys and, above all, the access patterns they serve.
**(4) Scale & trade-offs** — find the first bottleneck and address it with
caching, sharding, replication, or async work, naming the trade-off each time.
Requirements first, scaling last, always.

### The four coding patterns and their triggers

Roughly 80% of coding screens are one of four shapes. Recognise the trigger,
reach for the pattern:

- **Hash map / set** — "have I seen this before?", counting, pairs that sum to
  a target, dedupe, group-by. O(1) lookup; a Map is your PHP associative array.
- **Two pointers** — a *sorted* array, finding a pair or triplet, in-place
  work, palindromes. Two indices moving toward or with each other.
- **Sliding window** — a *contiguous* subarray or substring, "longest/shortest
  with a constraint", running sums. Grow and shrink a window, not nested loops.
- **BFS / DFS** — trees, graphs, grids, connected components, shortest path in
  an unweighted graph (BFS) or explore-all-paths (DFS). Queue for BFS, stack or
  recursion for DFS.

### Your fixed assets: intro, stories, questions

Three things should be memorised cold. Your **90-second intro** — who you are,
the through-line of 25 years, why this role, ending on a question. Your
**six-story STAR bank** — conflict, failure, proudest, disagreement, deadline,
leadership — each a two-minute Situation-Task-Action-Result. And your
**three questions to ask** — code review, on-call, how people level. These are
reusable across every loop; you build them once and draw on them forever.

### Logistics that quietly decide loops

Test the remote setup the day before — camera, mic, the shared editor,
a quiet room, a backup on your phone in case the wifi dies. Send a short
thank-you note within 24 hours. If you're chasing a decision, do it once,
politely, with a real reason ("I have another offer to respond to"), never as
nagging. Small operational competence reads as exactly the operational
competence they're hiring for.

### The rejection protocol — because morale is a managed resource

A stack-switch search takes multiple attempts; rejection is part of the
process, not a verdict on your career. So run it like an incident review, not
a spiral. Ask for feedback (you'll sometimes get it). Log the loop: which
stage, what was asked, what felt weak. Look for **patterns across loops** —
dying at triage means fix the resume; dying at coding means practise aloud;
one bad round is noise, the same weakness three times is signal. Treat morale
as a resource you actively protect, because the search rewards the person who
is still calm and prepared on loop number eight.

### The thesis

Strip away the tactics and the whole course is one idea: the panel is really
deciding whether they want *you* in the room during an outage at 2am —
someone who stays calm, sees the system clearly, owns the problem, and brings
everyone with them. Twenty-five years of doing exactly that is the answer.
Go show them.
`,

  comparisons: [
    {
      label: "The night before",
      intro:
        "Same candidate, same 8pm, night before an onsite. One tries to learn new material under pressure; the other reviews the assets they already own.",
      php: `// Weak: cram new topics at the last minute
//
// 8pm, night before the loop:
// - Start reading a blog series on Kafka internals I've
//   never used, because it "might come up".
// - Watch two videos on a dynamic-programming pattern
//   I've never practised.
// - Realise I don't know it, panic, read more.
// - Bed at 1am, anxious, having half-learned three things
//   I can't actually use tomorrow.
//
// Result: tired, rattled, and no better at the things that
// will ACTUALLY be asked. New material at 11pm makes you worse.`,
      ts: `// Strong: review your own bank until it's calm
//
// 8pm, night before the loop:
// - Read my six STAR stories once; say the two weakest aloud.
// - Re-read the four pattern triggers, do ONE easy problem
//   of each to warm the hands — not to learn, to loosen up.
// - Say my 90-second intro out loud twice.
// - Confirm the three questions I'll ask them.
// - Test camera, mic, editor. Lay out clothes. Bed by 11.
//
// Result: rested and sharp on exactly the material that gets
// used. You perform the things you've rehearsed, not the
// things you crammed.`,
      note:
        "The night before is for review, not acquisition — warming up assets you already own beats half-learning new ones you can't yet use under pressure.",
    },
    {
      label: "After a rejection",
      intro:
        "The email says no. Same candidate, two responses. One spirals; the other runs a loop retro and gets sharper for the next one.",
      php: `// Weak: the post-rejection spiral
//
// "Rejected again. Maybe 25 years of PHP really is worthless
//  now. Maybe I'm too old, maybe the switch was a mistake,
//  maybe I should just give up on TypeScript roles. I don't
//  even know what I did wrong — probably everything. I'll
//  take a break from applying for a while."
//
// Result: treats one gate's signal as a verdict on a career,
// stops the search at the exact moment persistence pays.
// No data extracted, morale spent, nothing fixed.`,
      ts: `// Strong: run it like a loop retro
//
// "No this time. Okay — incident review, not a spiral."
// 1. Ask the recruiter for any feedback (sometimes you get it).
// 2. Log the loop: which stage, what was asked, what felt weak.
//    -> "Stalled on the system-design scaling step again."
// 3. Compare across loops: is this a pattern or noise?
//    -> Third time scaling tripped me. That's SIGNAL.
// 4. Fix that one thing: drill the 4-step method, scaling step.
// 5. Protect morale: one bad loop is noise; I'm calibrating,
//    not failing. Next application goes out tomorrow.
//
// Result: extracts data, fixes the real bottleneck, stays in
// the search long enough to win it.`,
      note:
        "A stack-switch search is won across many loops, so morale is a managed resource — one rejection is noise, the same weakness three times is a fixable pattern, and quitting is the only unrecoverable move.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "The whole course as a one-screen cheatsheet — design method, pattern triggers, STAR slots, and the day-of checklist — printed the way you'd want to read it right before a loop. Predict the four section headers, then run it.",
    code: `// The night-before cheatsheet. Read it, don't cram past it.

const designMethod: string[] = [
  "1. Requirements  (scope + numbers: users, QPS, read/write, size)",
  "2. API sketch  (endpoints, verbs, payloads)",
  "3. Data model  (tables/keys + access patterns)",
  "4. Scale + trade-offs  (find bottleneck; cache/shard/queue; name the cost)",
];

const patterns: Array<{ name: string; trigger: string }> = [
  { name: "Hash map / set", trigger: "seen-before? counting, pair-sum, dedupe, group-by" },
  { name: "Two pointers", trigger: "SORTED array, pair/triplet, in-place, palindrome" },
  { name: "Sliding window", trigger: "CONTIGUOUS subarray, longest/shortest w/ constraint" },
  { name: "BFS / DFS", trigger: "trees/graphs/grids, shortest-path (BFS), all-paths (DFS)" },
];

const starBank: string[] = [
  "conflict", "failure", "proudest", "disagreement", "deadline", "leadership",
];

const dayOf: string[] = [
  "Test camera + mic + shared editor + backup on phone",
  "90-second intro rehearsed; ends on a question",
  "3 questions ready: code review, on-call, leveling",
  "Thank-you note within 24h",
  "Rejection? Log the loop, look for patterns, apply again tomorrow",
];

function section(title: string, lines: string[]): void {
  console.log(\`\\n=== \${title} ===\`);
  for (const line of lines) console.log("  " + line);
}

section("4-STEP DESIGN METHOD", designMethod);
section("CODING PATTERNS -> TRIGGERS", patterns.map(p => \`\${p.name.padEnd(16)} <- \${p.trigger}\`));
section("STAR STORY BANK (2 min each)", starBank.map((s, i) => \`\${i + 1}. \${s}\`));
section("DAY-OF CHECKLIST", dayOf);

console.log(\`\\nThesis: they're deciding if they want you in the room during\`);
console.log(\`a 2am outage. 25 years says yes. Go show them.\`);`,
  },

  keyPoints: [
    "The night before is for reviewing assets you already own — stories, pattern triggers, your intro — not cramming new topics, which makes you worse under pressure the next morning.",
    "The 4-step design method is always Requirements → API sketch → Data model → Scale & trade-offs; requirements first, scaling last.",
    "Four patterns cover ~80% of coding screens — hash map (seen-before/counting), two pointers (sorted/pairs), sliding window (contiguous+constraint), BFS/DFS (graphs/trees) — recognise the trigger, reach for the pattern.",
    "Memorise three reusable assets cold: the 90-second intro, the six-story STAR bank, and the three questions to ask; you build them once and use them every loop.",
    "Logistics decide loops quietly: test the remote setup the day before, send a thank-you within 24h, chase a decision once and politely with a real reason.",
    "Run rejections like an incident review, not a spiral — log the loop, look for patterns across loops, fix the one real bottleneck, and protect morale as the resource that wins a multi-loop search.",
  ],

  interview: [
    {
      q: "How do you prepare the night before an interview loop?",
      a: "I review, I don't cram. New material at 11pm makes me worse, not better, so the night before is for warming up the assets I already own: I read my six STAR stories once and say the two weakest out loud, I re-read the four coding-pattern triggers and do one easy problem of each just to loosen my hands, and I rehearse my 90-second intro and confirm the three questions I'll ask them. Then it's logistics — test the camera, mic, and shared editor, with a backup on my phone in case the wifi dies — and bed by eleven. I perform the things I've rehearsed calmly, not the things I panic-learned at midnight.",
    },
    {
      q: "A stack-switch job search means a lot of rejections. How do you keep going?",
      a: "I treat it like an incident review instead of a verdict. When a loop says no, I ask the recruiter for any feedback, log which stage it was and what felt weak, and then I look for patterns across loops — one bad round is noise, but the same weakness three times is signal I can actually fix. If I'm dying at triage I rewrite the resume; if I'm stalling on the design round's scaling step, I drill that. And I actively protect morale, because the search rewards whoever is still calm and prepared on loop number eight — quitting is the only unrecoverable move. Twenty-five years of running production systems taught me that persistence plus diagnosis beats panic every time.",
    },
    {
      q: "If you had to sum up what you think we're really evaluating, what would it be?",
      a: "Underneath the coding screen and the design round, I think you're deciding one thing: do you want me in the room during an outage at 2am — someone who stays calm, sees the system clearly, owns the problem instead of pointing at it, and brings the rest of the team along. Every part of the loop is a proxy for that. My honest answer is that I've been that person for twenty-five years across a lot of stacks and a lot of incidents, and the language changing doesn't change the judgment. That's what I'd want you to walk away believing, because it's true.",
    },
  ],

  quiz: [
    {
      question:
        "What's the right use of the night before an interview loop?",
      options: [
        "Learn a new system-design concept you've never practised, in case it comes up",
        "Review the assets you already own — stories, pattern triggers, your intro — until they're calm",
        "Do as many brand-new hard coding problems as possible",
        "Skip preparation entirely to stay fresh",
      ],
      answerIndex: 1,
      explain:
        "The night before is for review, not acquisition. Cramming new material at 11pm leaves you tired and rattled on exactly the things that will actually be asked. Warming up the six stories, four pattern triggers, and your intro makes you sharp and calm.",
    },
    {
      question:
        "You're given a coding problem about the longest substring with at most K distinct characters. Which pattern's trigger does this match?",
      options: [
        "Two pointers — because it mentions characters",
        "BFS / DFS — because substrings form a tree",
        "Sliding window — a contiguous substring with a constraint (longest/at-most-K)",
        "Hash map only — just count the characters",
      ],
      answerIndex: 2,
      explain:
        "'Contiguous substring' plus 'longest with a constraint' is the sliding-window trigger: grow and shrink a window rather than using nested loops. A hash map often rides along inside the window to count distinct characters, but the controlling pattern is the sliding window.",
    },
    {
      question:
        "What's the strong way to handle a rejection during a long job search?",
      options: [
        "Take an extended break from applying to recover",
        "Treat it as proof the career switch was a mistake",
        "Run a loop retro: log the stage, look for patterns across loops, fix the one real bottleneck, apply again",
        "Reapply to the same company immediately with the same materials",
      ],
      answerIndex: 2,
      explain:
        "A stack-switch search is won across many loops, so a rejection is data, not a verdict. Logging which stage failed and comparing across loops turns noise into a fixable pattern — one bad round is noise, the same weakness three times is signal — while protecting the morale that keeps you in the search long enough to win.",
    },
  ],
};

export default lesson;

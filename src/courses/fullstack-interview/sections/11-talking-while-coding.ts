import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "talking-while-coding",
  title: "Talking While Coding",
  part: "Live Coding & Take-Homes",
  estMinutes: 12,
  summary:
    "The spoken track decides borderline screens: restate, name the naive approach and its complexity, name the target pattern, then code while narrating decisions — and finish by testing edge cases unprompted.",

  concept: `
Two candidates write the identical correct Map solution. One passes, one
doesn't. The difference is never the code — it's the **spoken track** running
alongside it. Interviewers are scoring a question they rarely say out loud:
"would I want this person debugging with me at 2am?" You answer that with your
mouth, not your keyboard. And here is your unfair advantage: you have spent 25
years explaining code to juniors, to clients, to your past self in a code
review. **Narrating a solution is a skill you already have** — the screen just
asks you to aim it at the interviewer instead of a colleague.

### The four moves, in order, before you type

1. **Restate the problem in your words.** "So I'm given an array of orders and
   I need the first pair that sums to a target — indices, not values, and I
   should assume there might be none." This catches misunderstandings while
   they're free, and it buys you thinking time that looks like diligence.
2. **Name the naive approach and its complexity.** "Brute force is nested
   loops, every pair, O(n²) time." You are proving you *see* the baseline, not
   that you failed to think of it.
3. **Name the target pattern and the trade.** "I'll trade O(n) memory for O(1)
   lookups with a Map, one pass." Now the interviewer knows where you're going
   before a line exists.
4. **Then code — narrating decisions, not keystrokes.** Not "now I type f-o-r".
   Instead: "I insert *after* the check so an element can't pair with itself."

### Narrate decisions, not keystrokes

The junior mistake is a play-by-play of typing. The senior move is a
running commentary on *why*: why a Map and not an object, why check-then-insert,
why this base case. Every "why" is a data point the interviewer writes on the
scorecard. Silence writes nothing.

### The script for getting stuck

Getting stuck is normal and survivable; freezing silently is not. Say what
you're unsure about and **test the assumption with a concrete example**: "I'm
not sure if the input is sorted — let me check [3,1,2], no, not sorted, so
binary search is out." That one sentence turns a panic into visible
problem-solving. If you're truly stuck, think out loud about a simpler version
of the problem and build back up.

### When you find a bug live

Don't silently start deleting. Say "that doesn't look right, let me trace one
example through it" and **walk a single concrete input line by line, out loud.**
Finding your own bug by tracing is one of the strongest signals you can send —
it's exactly what the job is.

### Finishing strong

The weak close is "...is that right?" — it hands your judgment to the
interviewer and invites doubt. The strong close is a **self-test they didn't
ask for**: state the complexity, then run the edge cases aloud — empty input,
a single element, duplicates, the boundary. "Empty array: loop doesn't run,
returns null, good. [3,3] target 6: second one finds the first, good. O(n)
time, O(n) space. I'm happy with this." You just did the interviewer's job for
them, and that's the whole point.
`,

  comparisons: [
    {
      label: "Same two-sum solve: silent vs narrated",
      intro:
        "Identical, correct one-pass Map solutions to two-sum. The only difference is the spoken track — and that difference is the entire grade on a borderline screen.",
      php: `// WEAK: ten minutes of silence, then a shrug.
//
// [long pause... typing... more silence...]
// "...okay, I think this works?"

function twoSum(nums: number[], target: number) {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(target - nums[i]);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
  }
  return null;
}

// Scorecard: "Correct. But I have no idea how they think.
// Did they know the brute force? Was the Map a lucky guess?
// No signal on judgment. Borderline / lean no."`,
      ts: `// STRONG: the same code, with the reasoning spoken aloud.
//
// "Brute force is every pair, nested loops, O(n^2). I can do
//  better by trading memory for lookups."

function twoSum(nums: number[], target: number) {
  // "A Map from each value to the index I saw it at."
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    // "For each number I look up its complement, target - num."
    const need = target - nums[i];
    const j = seen.get(need);
    if (j !== undefined) return [j, i];
    // "Insert AFTER the check so an element can't match itself."
    seen.set(nums[i], i);
  }
  return null;
}

// Scorecard: "Named the O(n^2) baseline, chose the Map on
// purpose, flagged the self-pair edge case unprompted.
// Clear hire signal."`,
    },
    {
      label: "Getting stuck: freeze vs test an assumption",
      intro:
        "You hit a wall mid-solve. Both candidates are equally uncertain; only one keeps generating signal while they think.",
      php: `// WEAK: the silent freeze.
//
// [stops typing]
// [starts deleting working code]
// "...sorry. Give me a second."
// [more silence; the interviewer can't tell if you're
//  thinking or drowning, and has nothing to write down]`,
      ts: `// STRONG: narrate the doubt, test it with an example.
//
// "I'm not certain whether the array is sorted — that changes
//  everything. Let me test my assumption with a concrete case:
//  [3, 1, 2]. Not sorted. So binary search is out, and I'll
//  stick with the hash-map approach. If it WERE guaranteed
//  sorted I'd use two pointers instead — worth confirming
//  with you which it is."
//
// Same uncertainty, but now it reads as method, not panic.`,
    },
    {
      label: "The close: validation-seeking vs self-testing",
      intro:
        "You've written a working solution and have two minutes left. How you end the session is what the interviewer remembers when they write the scorecard an hour later.",
      php: `// WEAK: hand your judgment to the interviewer.
//
// "...is that right? Does that look okay to you?"
//
// You've just told them you can't tell whether your own code
// works, and invited them to go hunting for a flaw. Even if
// it's correct, the close reads as unsure.`,
      ts: `// STRONG: test the edge cases they didn't ask for.
//
// "Let me check the edges before I call it done.
//   empty []        -> loop never runs, returns null. good.
//   single [5], t=10 -> no complement, null. good.
//   dupes [3,3], t=6 -> second 3 finds the first, [0,1]. good.
//  O(n) time, O(n) space. I'm confident in this."
//
// You just did the interviewer's verification for them and
// closed on evidence instead of a question.`,
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A complete solve with the spoken track printed alongside the computation — restate, name the naive bound, name the pattern, trace one example, state complexity, then edge-test unprompted. This is the model to rehearse aloud. Predict the trace before running.",
    code: `// One complete narrated solve. Problem: given user IDs in
// arrival order, return the FIRST id that repeats, else null.

function say(label: string, text: string): void {
  console.log(\`[\${label}] \${text}\`);
}

function firstDuplicate(ids: number[]): number | null {
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) return id; // "have I seen this before?"
    seen.add(id);
  }
  return null;
}

// --- the spoken track, in the order you'd say it ---
say("RESTATE", "Return the first value that repeats, scanning left to right; null if all unique.");
say("NAIVE", "Brute force: for each element compare to every earlier one. O(n^2) time, O(1) space.");
say("PATTERN", "Trade O(n) memory for O(1) lookups: one pass, a Set of what I've seen. First hit wins.");

// prove the idea to myself on one concrete example
const example = [4, 2, 7, 2, 4];
say("EXAMPLE", \`Trace [\${example.join(", ")}] out loud:\`);
const seen = new Set<number>();
for (const id of example) {
  if (seen.has(id)) {
    say("TRACE", \`see \${id} -> already in {\${[...seen].join(",")}} -> that's the answer\`);
    break;
  }
  seen.add(id);
  say("TRACE", \`see \${id} -> new, store -> {\${[...seen].join(",")}}\`);
}

say("COMPLEXITY", "One pass: O(n) time, O(n) space. Say the trade, don't wait to be asked.");

// finish strong: the edge cases, UNPROMPTED
say("EDGE", "Now the cases they'd probe, before they ask:");
console.log("  empty []          ->", firstDuplicate([]));
console.log("  single [9]        ->", firstDuplicate([9]));
console.log("  all unique        ->", firstDuplicate([1, 2, 3]));
console.log("  dup at the end    ->", firstDuplicate([1, 2, 3, 1]));
console.log("  earliest dup wins ->", firstDuplicate([5, 5, 6, 6]));`,
  },

  keyPoints: [
    "The spoken track, not the code, decides borderline screens — two identical correct solutions score differently based entirely on the narration.",
    "Run the four moves in order before typing: restate the problem, name the naive approach and its complexity, name the target pattern and the trade, then code.",
    "Narrate decisions ('I insert after the check so it can't pair with itself'), never keystrokes ('now I type a for loop') — every 'why' is a scorecard data point.",
    "Stuck is survivable, frozen is not: say what you're unsure of and test the assumption with a concrete example ('is [3,1,2] sorted? no — so binary search is out').",
    "Found a bug live? Don't silently delete — walk one concrete input through the code line by line out loud; catching your own bug by tracing is top-tier signal.",
    "Finish strong: state the complexity, then edge-test unprompted (empty, single element, duplicates, boundary) — never close with 'is that right?'.",
    "Your 25 years of explaining code to juniors and clients IS this skill; the screen just asks you to aim the narration at the interviewer.",
  ],

  interview: [
    {
      q: "Walk me through how you approach a problem the moment you hear it, before writing any code.",
      a: "I restate it in my own words first, including the assumptions — input shape, whether there could be no answer or many, indices versus values — because catching a misunderstanding then is free, and later it's expensive. Then I say the brute-force approach and its complexity out loud, so we both know I see the baseline. Then I name the pattern I'm heading for and the trade it makes, something like 'I'll spend O(n) memory to get O(1) lookups and do it in one pass.' Only then do I type, and I narrate the decisions as I go rather than the typing. After 25 years of explaining code to other people, thinking out loud is my default mode anyway; the interview just points it at the interviewer.",
    },
    {
      q: "What do you do when you get stuck partway through a coding interview?",
      a: "The one thing I don't do is go silent and start deleting working code — that reads as drowning. I say exactly what I'm uncertain about, then test the assumption with a concrete example: 'I'm not sure whether the array is sorted; let me check [3,1,2] — no — so binary search is out.' If I'm genuinely stuck I solve a smaller version of the problem out loud and build back up. Being stuck is normal; staying visibly methodical while stuck is the thing they're actually grading, and it's how real debugging works.",
    },
    {
      q: "How do you close out a solution once it seems to work?",
      a: "I test the edge cases before the interviewer asks — empty input, a single element, duplicates, and the boundary condition — walking each one through the code out loud, then I state the time and space complexity and say plainly that I'm confident in it. I never end on 'is that right?', because that hands my judgment to them and invites doubt about code that's probably fine. Doing my own verification unprompted is exactly the habit that keeps production systems up, and it's the note I want them writing on the scorecard.",
    },
  ],

  quiz: [
    {
      question:
        "Two candidates submit the identical, correct one-pass Map solution to two-sum. What most determines who passes the screen?",
      options: [
        "Which one typed it faster",
        "The spoken track — restating, naming the naive bound and the trade, narrating decisions, and self-testing",
        "Whether they used a Map or a plain object",
        "The number of comments in the code",
      ],
      answerIndex: 1,
      explain:
        "The code is identical, so it can't be the discriminator. The interviewer is scoring judgment and communication — did you show you saw the baseline, choose the pattern deliberately, and verify your own work — all of which live in the narration, not the source.",
    },
    {
      question:
        "You realise mid-solve that your code has a bug. What's the strongest move?",
      options: [
        "Silently delete the section and start over",
        "Ask the interviewer to point out where the bug is",
        "Say you'll trace one concrete example through the code line by line, out loud",
        "Comment out the suspect line and hope the tests pass",
      ],
      answerIndex: 2,
      explain:
        "Finding your own bug by tracing a concrete input is one of the strongest signals available — it's literally the job. Narrating the trace keeps the interviewer inside your reasoning instead of watching you flail in silence.",
    },
    {
      question:
        "Which is the strong way to finish a live-coding solution?",
      options: [
        "Ask 'is that right?' and wait for the interviewer's verdict",
        "Stop as soon as the happy-path example returns the right value",
        "State the complexity, then test empty/single/duplicate/boundary cases unprompted",
        "Immediately start optimising the constant factors",
      ],
      answerIndex: 2,
      explain:
        "Closing on an unprompted self-test — complexity plus the edge cases — demonstrates exactly the verification habit the role needs and leaves the interviewer with quotable evidence. 'Is that right?' surrenders your judgment and invites doubt.",
    },
  ],
};

export default lesson;

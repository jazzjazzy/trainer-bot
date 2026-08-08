import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 14,
  slug: "estimating-load",
  title: "Back-of-Envelope: Estimating Load and Capacity",
  part: "System Design Fundamentals",
  estMinutes: 12,
  summary:
    "The arithmetic that separates talkers from operators: turn DAU into requests per second, rows into storage, and know the latency ladder — rounding hard and stating assumptions out loud is the signal, not false precision.",

  concept: `
Somewhere in every design round the interviewer asks "roughly how much traffic
is that?" or "how big does this get in a year?" This is where operators separate
from talkers. You don't need exact numbers — you need to show you can turn a
user count into requests per second and storage, out loud, with the assumptions
visible. You have watched real servers fall over under real load for 25 years;
this section just attaches numbers to that gut feel so you can say it to a panel.

### The one number to memorise

A day is about **86,400 seconds** — round it to ~100,000 (10⁵) in your head. That
single fact drives everything: **1 million requests/day ≈ 12 requests/sec
average.** So 100M requests/day is ~1,200 rps average, 1B/day is ~12,000 rps.
Once you can go from daily volume to average rps in your head, you sound like
someone who has capacity-planned before.

### From DAU to requests per second

The chain is always the same:

\`\`\`text
requests/day = DAU × actions per user per day
avg rps      = requests/day ÷ 86,400
peak rps     = avg rps × peak factor   (5–10× is the usual guess)
\`\`\`

Average traffic never sizes a system — **peak** does. Real traffic clumps into
waking hours and spikes, so multiply the average by 5–10× and design for that.
Say the factor out loud as an assumption: "I'll assume peak is about 8× average
because usage concentrates in the evening."

### From rows to storage

\`\`\`text
storage = rows × bytes per row × retention
\`\`\`

Estimate bytes per record generously (a row is rarely just its columns — indexes,
overhead, and related rows add up), multiply by how many you create per day, then
by how long you keep them. A chat app storing 80M messages/day at ~300 bytes is
~24 GB/day — about 9 TB a year. That number decides whether one database box is
fine or you're already talking about partitioning.

### Read/write ratio

Ask it early, because it changes the whole design. A read-heavy system (100:1,
like a URL shortener or a feed) is a caching problem — most load never needs to
touch the primary. A write-heavy system (a metrics ingest) is a durability and
throughput problem — caching barely helps and you think about queues and
partitioning instead. "Is this read-heavy or write-heavy?" is one of the most
valuable questions you can ask.

### The latency ladder

Know the orders of magnitude — not exact nanoseconds, the *ratios*:

\`\`\`text
main memory read        ~100 ns          the baseline
SSD random read         ~100 µs          ~1,000× slower than memory
same-region round trip  ~0.5 ms          another ~5× on top
cross-continent trip    ~100+ ms          ~200× slower than same-region
\`\`\`

The takeaways carry the answer: memory is ~1,000× faster than disk (so caching
hot data in RAM is transformative), and a cross-region hop costs more than a
thousand local disk reads (so where your data lives geographically dominates
latency). That's why "put a cache in front of it" and "keep it in-region" are
the two highest-leverage moves in most designs.

### Round hard, state assumptions

False precision is anti-signal — "42,617 requests per second" from thin air
tells the interviewer you don't know it's a guess. Rounded numbers with visible
assumptions ("call it ~1,000 rps, assuming 2M users doing 40 actions a day") is
the signal, because now they can challenge the *inputs*, which is the actual
conversation. Method over precision, every time.
`,

  comparisons: [
    {
      label: "Sizing a system: hand-wave vs worked estimate",
      intro:
        "The interviewer asks how much traffic the design must handle. One answer dodges the question; the other does the arithmetic out loud.",
      php: `// WEAK: dodge the numbers entirely.
//
// "It'll get a lot of traffic, but we'll just put it on the
//  cloud and autoscale, so we don't really need to worry about
//  the exact load — the platform handles it."
//
// Interviewer: "Autoscale WHAT, to WHAT? They can't tell me if
// this is 10 rps or 10,000, so they can't tell me what breaks
// first or what it costs. No operator signal."`,
      ts: `// STRONG: DAU -> rps -> storage, out loud.
//
// "Let's size it. Say 2M daily actives doing ~40 actions a
//  day -> 80M requests/day. A day's ~86,400s, so that's
//  ~925 rps average. Traffic clumps, so peak maybe 8x ->
//  ~7,400 rps to design for.
//
//  Storage: 80M writes/day at ~300 bytes -> ~24 GB/day, so
//  ~9 TB/year. That's past one comfortable box, so I'm already
//  thinking about partitioning the write path within a year."
//
// Interviewer: "That's an operator. Knows what breaks and when."`,
    },
    {
      label: "Precise-but-baseless vs rounded-with-assumptions",
      intro:
        "Two candidates state a throughput number. One sounds authoritative and is worthless; the other sounds approximate and is exactly what's wanted.",
      php: `// WEAK: false precision from nowhere.
//
// "The system will handle 42,617 requests per second and store
//  1.847 petabytes in the first year."
//
// Where did those digits come from? No stated inputs, so the
// interviewer can't challenge the reasoning — and precise
// figures with no assumptions read as someone who doesn't
// realise it's all a guess. That's the anti-signal.`,
      ts: `// STRONG: round hard, expose the inputs.
//
// "Call it ~1,000 rps average, assuming ~2M users doing ~40
//  actions a day — and I'd design for ~8,000 peak. Storage is
//  order-of-magnitude 10 TB in year one at ~300 bytes a
//  record. All rough; if any of those inputs is off, tell me
//  and the numbers move with it."
//
// Now the assumptions are on the table and the interviewer can
// push on the INPUTS — which is the real conversation.`,
    },
    {
      label: "The latency ladder: guessing vs knowing the ratios",
      intro:
        "The interviewer asks why you'd cache a particular lookup. One answer waves at 'speed'; the other cites the orders of magnitude.",
      php: `// WEAK: 'caching makes it faster' with no numbers.
//
// "We'd add a cache because reading from the cache is faster
//  than reading from the database. Caches are just faster."
//
// True but empty — no sense of HOW MUCH faster, so no way to
// judge whether the cache is worth the added complexity here.`,
      ts: `// STRONG: cite the ladder, justify the move.
//
// "Memory reads are ~100ns; an SSD random read is ~100us —
//  about 1,000x slower. This lookup is on the hot read path
//  and the data's immutable once written, so caching it in
//  memory turns a ~100us disk hit into a ~100ns one on the
//  vast majority of requests. And a cross-region round trip
//  is ~100ms — a thousand-plus local disk reads — so I'd also
//  keep the cache in the same region as the callers."
//
// Interviewer: "Knows the ladder, applies it. Senior."`,
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A back-of-envelope calculator that turns DAU, actions, payload size, and retention into average/peak rps and storage growth for two products. Predict the chat app's average rps (2M x 40 over 86,400s) before running.",
    code: `// Back-of-envelope capacity for two products. Round hard,
// state assumptions, let the interviewer challenge the INPUTS.

const SECONDS_PER_DAY = 86_400; // ~1e5 — the number to memorise

interface Product {
  name: string;
  dau: number;                 // daily active users
  actionsPerUserPerDay: number;
  bytesPerAction: number;      // stored payload per action
  peakFactor: number;          // peak rps vs average (5-10x typical)
  retentionDays: number;
}

function human(bytes: number): string {
  const gb = bytes / 1e9;
  if (gb >= 1000) return \`\${(gb / 1000).toFixed(2)} TB\`;
  return \`\${gb.toFixed(2)} GB\`;
}

function estimate(p: Product): void {
  const requestsPerDay = p.dau * p.actionsPerUserPerDay;
  const avgRps = requestsPerDay / SECONDS_PER_DAY;
  const peakRps = avgRps * p.peakFactor;
  const bytesPerDay = requestsPerDay * p.bytesPerAction;
  const storedAtRetention = bytesPerDay * p.retentionDays;
  const yearlyGrowth = bytesPerDay * 365;

  console.log(\`=== \${p.name} ===\`);
  console.log(\`  assumptions: \${p.dau.toLocaleString()} DAU x \${p.actionsPerUserPerDay} actions x \${p.bytesPerAction}B, peak \${p.peakFactor}x, keep \${p.retentionDays}d\`);
  console.log(\`  requests/day : \${requestsPerDay.toLocaleString()}\`);
  console.log(\`  avg rps      : ~\${Math.round(avgRps)}\`);
  console.log(\`  peak rps     : ~\${Math.round(peakRps)}   (avg x \${p.peakFactor})\`);
  console.log(\`  storage/day  : \${human(bytesPerDay)}\`);
  console.log(\`  at retention : \${human(storedAtRetention)}   (x \${p.retentionDays} days)\`);
  console.log(\`  growth/year  : \${human(yearlyGrowth)}\\n\`);
}

const products: Product[] = [
  { name: "Chat app",      dau: 2_000_000, actionsPerUserPerDay: 40, bytesPerAction: 300, peakFactor: 8, retentionDays: 365 },
  { name: "URL shortener", dau: 500_000,   actionsPerUserPerDay: 6,  bytesPerAction: 500, peakFactor: 5, retentionDays: 1825 },
];

console.log(\`(a day ~ \${SECONDS_PER_DAY.toLocaleString()}s, so 1M req/day ~ \${Math.round(1_000_000 / SECONDS_PER_DAY)} rps average)\\n\`);
for (const p of products) estimate(p);

console.log("method beats precision: every number above is rounded and every");
console.log("assumption is stated, so the interviewer can challenge the INPUTS.");`,
  },

  keyPoints: [
    "Memorise one fact: a day is ~86,400s (~10⁵), so 1M requests/day ≈ 12 rps average — scale that up for any daily volume.",
    "The chain is DAU × actions/user/day = requests/day, ÷ 86,400 = avg rps, × a 5–10× peak factor = the rps you actually design for.",
    "Storage = rows × bytes/row × retention; estimate bytes generously, and the yearly total decides one-box versus partitioning.",
    "Ask read/write ratio early: read-heavy (100:1) is a caching problem, write-heavy is a durability/throughput problem — it changes the whole design.",
    "Know the latency ladder by ratio: memory ~100ns, SSD ~100µs (~1,000× slower), same-region ~0.5ms, cross-region ~100ms (a thousand-plus disk reads).",
    "Round hard and state assumptions aloud — false precision like '42,617 rps' is anti-signal; visible inputs let the interviewer challenge the reasoning.",
  ],

  interview: [
    {
      q: "Roughly how many requests per second is 100 million requests a day, and how would you size for it?",
      a: "A day is about 86,400 seconds, so I round that to 100,000; 100 million divided by 100,000 is about 1,000 requests per second average. But average never sizes a system — traffic clumps into waking hours and spikes, so I'd assume a peak of maybe 8× and design for roughly 8,000 rps. I'd say all of that out loud as assumptions so you can push back on the peak factor if your traffic is flatter or spikier. The point isn't the exact figure, it's that I can get from a daily user number to a peak rps I'd provision for in my head.",
    },
    {
      q: "Why do you care whether a system is read-heavy or write-heavy?",
      a: "Because it changes the entire shape of the design, so I ask it early. A read-heavy system — a URL shortener or a feed at maybe 100 reads per write — is fundamentally a caching problem: most requests should never touch the primary database, and my effort goes into cache hit rates and read replicas. A write-heavy system, like metrics ingest, is a durability and throughput problem where caching barely helps, so I think about queues to absorb bursts and partitioning the write path. Same four-step frame, completely different bottleneck, and the read/write ratio is what tells me which one I'm solving.",
    },
    {
      q: "Talk me through the latency numbers you keep in your head.",
      a: "I keep the orders of magnitude, not exact figures. A main-memory read is around 100 nanoseconds; an SSD random read is around 100 microseconds, roughly a thousand times slower; a same-region network round trip is about half a millisecond; and a cross-continent round trip is 100 milliseconds or more. Two takeaways drive most designs: memory is about a thousand times faster than disk, which is why caching hot data in RAM is transformative, and a cross-region hop costs more than a thousand local disk reads, which is why keeping data near its callers dominates latency. I've felt both of those the hard way on production systems; the numbers just let me say it to a panel.",
    },
  ],

  quiz: [
    {
      question:
        "Approximately how many requests per second is 1 million requests per day, on average?",
      options: ["About 1 rps", "About 12 rps", "About 120 rps", "About 1,000 rps"],
      answerIndex: 1,
      explain:
        "A day is ~86,400 seconds. 1,000,000 ÷ 86,400 ≈ 11.6, so ~12 rps average. This is the anchor fact: scale it linearly — 100M/day ≈ 1,200 rps, 1B/day ≈ 12,000 rps.",
    },
    {
      question:
        "Why multiply average rps by a factor of 5–10 when sizing capacity?",
      options: [
        "To add a safety margin for bugs",
        "Because real traffic peaks well above average, and peak load is what the system must survive",
        "Because cloud providers bill on peak",
        "It's an arbitrary industry convention with no basis",
      ],
      answerIndex: 1,
      explain:
        "Traffic isn't uniform across the day — it concentrates in waking hours and spikes on events. Average traffic never sizes a system; you provision for peak, and 5–10× average is the standard rough guess to state out loud as an assumption.",
    },
    {
      question:
        "Roughly how much slower is an SSD random read than a main-memory read?",
      options: ["About 2× slower", "About 10× slower", "About 1,000× slower", "About the same speed"],
      answerIndex: 2,
      explain:
        "Memory reads are ~100ns and SSD random reads are ~100µs — about three orders of magnitude, ~1,000×. That ratio is exactly why caching hot data in RAM is such a high-leverage move on a read-heavy path.",
    },
  ],
};

export default lesson;

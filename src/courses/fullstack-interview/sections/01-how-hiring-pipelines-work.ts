import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 1,
  slug: "how-hiring-pipelines-work",
  title: "How Hiring Pipelines Actually Work",
  part: "Positioning & Pipeline",
  estMinutes: 11,
  summary:
    "The standard hiring pipeline is a funnel with known gatekeepers and known loss rates — most candidates die at resume triage, not the onsite, and referrals attack exactly that stage.",

  concept: `
Before you practise a single coding question, understand the machine you are
feeding yourself into. Almost every company over ~50 people runs the same
pipeline: **application or referral → recruiter screen → technical screen →
take-home or onsite loop → debrief → offer**. Each stage has a different
gatekeeper with different powers, and your material has to work for each of
them in turn.

### The stages and their gatekeepers

- **Resume triage** — a recruiter or an ATS (applicant tracking system) filter.
  Six to ten seconds per resume. They match keywords and titles against the
  job req; they cannot judge code quality, and they will not infer that
  "PHP since 1999" implies you can learn Node.
- **Recruiter screen** — a 30-minute call. Scores: does your story hang
  together, are logistics workable (location, visa, salary band), can you
  talk like someone the hiring manager won't regret meeting.
- **Technical screen** — one engineer, 45-60 minutes, usually one or two
  coding problems in a shared editor. Scores a narrow slice: can you code
  fluently while talking, at roughly the level on your resume.
- **Onsite loop** — 3-5 interviews in a day or across a week: coding, system
  design, behavioural, sometimes a hiring-manager round.
- **Debrief** — the interviewers meet, compare written scorecards, and argue.
  You are not in the room; your interviewers advocate (or don't) on your
  behalf. That is why *how you made each one feel about your judgment*
  matters as much as whether the code compiled.

### Where candidates actually get rejected

The funnel is brutally front-loaded. Cold applications commonly convert to a
recruiter screen at **5-10%**; each later stage passes **35-70%**. Run the
arithmetic and the shape is clear: if you reach the onsite, your odds of an
offer are often better than one in four — but reaching the recruiter screen
at all is a one-in-ten event for a cold resume. Candidates obsess over the
onsite and under-invest in the stage where 90% of the loss happens.

### Cold applications vs referrals

A referral does one thing, but it is the right thing: it moves your resume
from the ATS pile to a human's inbox with a colleague's name attached. Triage
pass rates for referred candidates are commonly **4-6x** cold rates. Later
stages barely change — a referral will not pass a coding screen for you.

So the strategy is not "spray 200 identical applications" and not "hand-craft
one perfect application a week". It is **volume with targeting**: a focused
list of companies where your background genuinely fits, a referral hunted for
each one, and a resume tuned per job req. Twenty targeted, mostly-referred
applications routinely beat two hundred cold ones.

### How debriefs weigh signals

Debriefs work on written evidence: each interviewer submits a score and
specific observations ("drove the design, caught the off-by-one themselves,
asked about failure modes"). A pile of lukewarm "fine, I guess" scores loses
to one enthusiastic advocate plus no objections. A single strong no —
usually about behaviour or communication, rarely about one bad question —
sinks most candidacies. Your job in every session is to leave that
interviewer with concrete, quotable evidence to write down.
`,

  comparisons: [
    {
      label: "The job-search plan",
      intro:
        "Two search plans for the same candidate, written down the way you'd actually execute them. One optimises for effort spent; the other optimises for where the funnel actually loses people.",
      php: `// The "spray" plan
//
// - Export resume once as PDF. Same file for every job.
// - Apply to ~200 postings via "Easy Apply" in two weekends.
// - No cover letters, no contact with humans.
// - Wait. Refresh inbox.
// - Conclusion after 4 weeks of silence:
//   "the market is dead for PHP people."
//
// Reality check: 200 apps x ~5% cold triage rate
// = ~10 recruiter screens, all at randomly-chosen
// companies, none of which were picked for fit.`,
      ts: `// The targeted-referral plan
//
// - Build a list of 25 companies where the stack
//   (TS/Node, Postgres) and domain match my history.
// - For each: tailor headline + top 3 bullets to the req.
// - Hunt a referral first: ex-colleagues, meetup contacts,
//   maintainers I've filed issues with. Referral found for
//   ~12 of 25; cold-apply the rest anyway.
// - Track every application in a sheet: stage, date,
//   contact, next action. Follow up after 7 days.
// - Review weekly: which stage is killing me? Fix THAT.
//
// 25 apps, ~half referred, each one aimed — this yields
// more screens than 200 cold ones, at companies I chose.`,
      note:
        "Referrals multiply the triage pass rate 4-6x but change nothing afterwards — so spend your effort getting past triage, then let preparation carry the later stages.",
    },
    {
      label: "What is being scored at each stage",
      intro:
        "A candidate's mental model of the pipeline, said out loud. One treats every stage as the same exam; the other knows each gatekeeper is scoring something different.",
      php: `// Weak mental model
//
// "It's all one big technical evaluation. If my code
//  is good enough, I'll get through. The recruiter
//  call is a formality — I'll wing it. The onsite is
//  where I should spend 100% of my prep time.
//  If I get rejected, my coding wasn't good enough."`,
      ts: `// Strong mental model
//
// "Triage scores keyword match in ~6 seconds — my resume's
//  job, not mine. The recruiter scores story coherence and
//  logistics — I rehearse a 90-second intro. The tech screen
//  scores fluency-while-talking — I practise aloud. The
//  onsite scores four separate skills with four separate
//  people. The debrief scores what evidence my interviewers
//  can quote. A rejection tells me which stage failed,
//  and I fix that stage — not 'everything'."`,
      note:
        "Diagnosing rejections by stage is the whole game: dying at triage means fix the resume, dying at tech screens means practise aloud — 'get better generally' fixes nothing.",
    },
    {
      label: "Reading the debrief from outside the room",
      intro:
        "How a candidate thinks about the interviewers they just met. One performs for a grade; the other equips advocates with evidence.",
      php: `// Weak: interviews as exams
//
// "I answered everything they asked. I didn't say
//  anything wrong. The code worked. So I should pass."
//
// What the scorecard says: "Solved it. Quiet.
//  No questions for me. No strong signal either way."
//  -> lukewarm 'fine' — loses the debrief argument.`,
      ts: `// Strong: interviews as evidence-generation
//
// "I narrated my trade-offs, named the O(n^2) risk before
//  they did, asked how their team handles schema migrations,
//  and connected the problem to the inventory system I ran
//  for 8 years."
//
// What the scorecard says: "Caught the perf issue unprompted;
//  asked sharp operational questions; clear senior judgment."
//  -> a quotable advocate in the debrief.`,
      note:
        "Interviewers write scorecards from memory hours later — give each one two or three concrete, quotable moments and you have an advocate instead of a shrug.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A funnel calculator for the same pipeline through two channels. Before running: which stage do you think dominates the difference, and roughly how many cold applications does one offer cost?",
    code: `// One offer, two channels: how many applications does each need?

interface Stage {
  name: string;
  cold: number;     // pass rate for a cold application
  referral: number; // pass rate with an internal referral
}

// Later stages are identical — a referral can't pass a
// coding screen for you. It only fixes triage.
const stages: Stage[] = [
  { name: "resume triage",     cold: 0.08, referral: 0.40 },
  { name: "recruiter screen",  cold: 0.60, referral: 0.70 },
  { name: "technical screen",  cold: 0.45, referral: 0.45 },
  { name: "onsite loop",       cold: 0.35, referral: 0.35 },
  { name: "debrief -> offer",  cold: 0.85, referral: 0.85 },
];

function runChannel(channel: "cold" | "referral"): void {
  console.log(\`--- \${channel} applications ---\`);
  let survival = 1;
  for (const s of stages) {
    survival *= s[channel];
    const pct = (s[channel] * 100).toFixed(0).padStart(3);
    console.log(
      \`\${s.name.padEnd(17)} pass \${pct}%  | still alive: \${(survival * 100).toFixed(2)}%\`
    );
  }
  console.log(\`=> ~\${Math.ceil(1 / survival)} applications per offer\\n\`);
}

runChannel("cold");
runChannel("referral");

// Note where the two channels diverge: ONLY at triage.
// Try it: bump the cold triage rate to 0.20 (a tailored
// resume) and watch the cost per offer collapse.`,
  },

  keyPoints: [
    "The standard pipeline is application/referral → recruiter screen → technical screen → onsite loop → debrief → offer; each stage has a different gatekeeper scoring a different thing.",
    "Most rejection happens at resume triage (5-10% cold pass rate) and the first technical screen — not at the onsite, where conversion is comparatively high.",
    "A recruiter or ATS spends ~6 seconds on triage and matches keywords; they cannot infer transferable skill, so the resume must state it outright.",
    "Referrals multiply the triage pass rate roughly 4-6x but leave later stages unchanged — they get you seen, not hired.",
    "Volume with targeting beats both extremes: a tracked list of ~25 well-matched companies with hunted referrals outperforms 200 cold applications.",
    "Debriefs run on written scorecards; leave every interviewer two or three concrete, quotable moments so they can advocate for you in a room you are not in.",
  ],

  interview: [
    {
      q: "Walk me through how you're running your job search.",
      a: "I treat it as a funnel with measurable stages. I built a target list of about 25 companies where TypeScript/Node and my e-commerce background genuinely fit, and for each one I tailor the resume headline and top bullets to the req and try to find a referral first — a referral roughly quintuples the odds of getting past triage, which is where most of the loss is. I track every application by stage in a sheet, follow up after a week, and review weekly: if I'm dying at triage I fix the resume, if I'm dying at technical screens I practise coding aloud. Twenty-five years of running production systems taught me to fix the bottleneck the metrics point at, not the stage that feels most dramatic.",
    },
    {
      q: "You've had a few rejections recently — what do you take from that?",
      a: "The useful question is *which stage* rejected me, because each stage measures something different. Rejections at triage told me my old resume led with PHP instead of the TypeScript work, so I rewrote the headline and skills line. One technical-screen rejection came down to me coding silently, so I now practise narrating trade-offs out loud. I don't treat a rejection as a verdict on 25 years of work — it's one gate's signal about one artifact, and every artifact is fixable.",
    },
    {
      q: "Why do you ask for referrals instead of just applying?",
      a: "Because the data on my own funnel says triage is the expensive stage: a cold application gets read for about six seconds by someone matching keywords, and mine passes maybe one time in ten. A referral moves the resume to a human with a colleague's credibility attached — pass rates go up several-fold. It changes nothing after that, and I wouldn't want it to; I still have to earn the screens and the onsite. It's simply putting effort where the funnel actually loses people.",
    },
  ],

  quiz: [
    {
      question:
        "Where do most candidates get rejected in a standard hiring pipeline?",
      options: [
        "At the onsite loop, where the hardest questions are",
        "At the debrief, where interviewers compare notes",
        "At resume triage and the first technical screen",
        "At the recruiter screen, over salary expectations",
      ],
      answerIndex: 2,
      explain:
        "The funnel is front-loaded: cold resumes pass triage at roughly 5-10%, and the first technical screen filters hard too. Candidates who reach the onsite convert at a much higher rate — so prep effort should mirror where the loss actually happens.",
    },
    {
      question: "What does a referral actually change in the pipeline?",
      options: [
        "It raises your scores across every stage of the loop",
        "It multiplies the resume-triage pass rate but leaves later stages unchanged",
        "It lets you skip the recruiter screen entirely",
        "It guarantees an onsite at most companies",
      ],
      answerIndex: 1,
      explain:
        "A referral gets your resume in front of a human with credibility attached — commonly a 4-6x improvement at triage. It cannot pass a coding screen or an onsite for you, which is exactly why it pairs with, rather than replaces, preparation.",
    },
    {
      question:
        "In the debrief, which outcome is most dangerous to a candidacy?",
      options: [
        "One interviewer scoring you 'strong no' on behaviour or communication",
        "Getting one coding question wrong out of four sessions",
        "Interviewers disagreeing about your system-design round",
        "The recruiter forgetting to submit logistics notes",
      ],
      answerIndex: 0,
      explain:
        "Debriefs tolerate a flubbed question and even disagreement — an advocate with concrete evidence can carry those. What sinks candidacies is a strong no, and those are usually about behaviour, communication, or judgment rather than a single wrong answer.",
    },
  ],
};

export default lesson;

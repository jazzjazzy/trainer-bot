import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "resume-for-a-stack-switch",
  title: "The Resume for a Stack Switch",
  part: "Positioning & Pipeline",
  estMinutes: 12,
  summary:
    "A stack-switch resume is built for a six-second triage: a headline naming the target stack, a skills line with TS/Node first and PHP as depth, and accomplishment bullets — recent work detailed, old roles compressed, two pages maximum.",

  concept: `
A resume is not an autobiography; it is a triage document. On a first pass a
recruiter or hiring manager gives it **six to ten seconds** before deciding
"screen" or "pass". For a stack-switcher that window is unforgiving: if the
top third of page one reads as a PHP resume, you are filed as a PHP
candidate for a TypeScript role, and no amount of detail further down
rescues you. Everything about the layout has to earn that first pass.

### The headline does the heavy lifting

The first line under your name is the highest-value real estate on the page.
It must name the target stack and the seniority, in words the reader is
already scanning for:

\`\`\`
Full-stack engineer — TypeScript/Node · 25 years shipping web systems
\`\`\`

That single line tells the reader you are aimed at *their* role (TypeScript/
Node), that you are senior (25 years), and that you *ship* (not just "know").
A headline like "Experienced PHP Developer" fails the same test in the
opposite direction — accurate, and disqualifying.

### The skills line: order is the message

Recruiters and ATS keyword-match the skills line, and humans read it
left-to-right and stop early. So the order *is* the message. Put the target
stack first and your PHP depth where it reads as an asset, not a headline:

\`\`\`
TypeScript · Node 24 LTS · SvelteKit · PostgreSQL 18 · REST APIs · AWS · PHP (15+ yrs)
\`\`\`

TS/Node/SvelteKit lead; PHP is present — it's real depth and hiding it would
be dishonest — but it sits after the target stack, framed as years of depth
rather than the thing you are.

### Bullets are accomplishments, not duties

Every bullet follows one shape: **verb + scale + outcome**. "Responsible for
the checkout system" is a job description. "Rebuilt checkout, cutting p95
latency from 1.8s to 400ms at 12,000 orders/day" is an accomplishment a
reader remembers. Lead with the verb, put a number in the middle, end on the
result. If a bullet has no number and no outcome, it is a duty — cut it or
fix it.

### Stack-switch specifics: weight recent, compress old

This is where a veteran's resume goes wrong. Twenty-five years does **not**
mean six pages. It means **two pages, with the last ten years detailed and
everything before that compressed to impact lines.** Your recent TypeScript
project gets the most bullets even if it is the smallest role, because it is
the evidence the reader is hunting for. A 2003 role gets a single line:
"Built and ran the billing platform for a regional ISP (2 yrs)." Nobody is
screening you on what you did in 2003 — they are checking that you *can* do
the job now and confirming the depth is real. Detail follows relevance, not
chronology.

### Two pages, and no filler

A senior resume that sprawls to five pages signals someone who can't
prioritise — the opposite of the judgment you're selling. Two pages. Recent
and relevant in detail, older roles as one-liners, and every bullet either
carries a number or gets cut. The discipline of the document is itself a
signal.
`,

  comparisons: [
    {
      label: "A single experience bullet",
      intro:
        "One line from the experience section, describing the same work two ways. A recruiter skims dozens of these — one is skippable, the other stops the eye.",
      php: `// Weak: duty-based, no scale, no outcome
//
// • Responsible for the checkout system and
//   worked on performance improvements.
// • Involved in the migration to a new stack.
// • Helped maintain the payments integration.
//
// Every line is a job description. No numbers,
// no results — nothing a reader can quote.`,
      ts: `// Strong: verb + scale + outcome
//
// • Rebuilt checkout at 12,000 orders/day, cutting
//   p95 latency from 1.8s to 400ms.
// • Led a zero-downtime migration off a legacy
//   PHP stack serving 40 internal engineers.
// • Owned payments through 3 PSP migrations with
//   zero lost transactions.
//
// Each line: what I did, how big, what changed.`,
      note:
        "The shape is verb → number → outcome. A bullet with no number and no result is a duty; cut it or quantify it. Numbers are what a reviewer remembers six seconds later.",
    },
    {
      label: "The top third of page one",
      intro:
        "What a reviewer's eye lands on first. For a stack-switch, the top third decides whether you're read as a TypeScript candidate or a PHP one.",
      php: `// Weak: buried target stack
//
// John Smith
// Senior PHP Developer
//
// Summary: Experienced PHP developer with 25 years
// building web applications in PHP, MySQL, and
// related technologies. Recently exploring
// TypeScript.
//
// Skills: PHP, MySQL, jQuery, Apache, Laravel,
//   Symfony, ... TypeScript, Node
//
// (Reader's verdict at 6s: "PHP guy." Filed.)`,
      ts: `// Strong: headline-first, target stack on top
//
// John Smith
// Full-stack engineer — TypeScript/Node ·
//   25 years shipping web systems
//
// Skills: TypeScript · Node 24 LTS · SvelteKit ·
//   PostgreSQL 18 · REST APIs · AWS · PHP (15+ yrs)
//
// Recent: Built a SvelteKit + PostgreSQL ordering
//   app; owned e-commerce at 12k orders/day for 8y.
//
// (Reader's verdict at 6s: "Senior, TS, ships,
//  deep background." Screen.)`,
      note:
        "Same person, same facts, opposite filing decision. The target stack and seniority must appear in the first two lines — the reader stops there on the first pass.",
      leftLang: "ts",
      rightLang: "ts",
    },
    {
      label: "Allocating detail across 25 years",
      intro:
        "How much space each era of the career gets. One version spreads evenly by chronology; the other weights by relevance to the target role.",
      php: `// Weak: even detail, chronological, 5 pages
//
// 2001–2004  Junior Dev — 6 bullets
// 2004–2009  Developer   — 6 bullets
// 2009–2016  Senior Dev  — 6 bullets
// 2016–2024  Lead        — 6 bullets
// 2024–now   TS role     — 6 bullets
//
// Every role weighted the same. The 2003 job gets
// as much page as the thing that matters now.
// Reader gives up before reaching the TS work.`,
      ts: `// Strong: weighted by relevance, 2 pages
//
// 2024–now   TS/Node role — 5 bullets (the evidence)
// 2016–2024  Lead, e-comm — 4 bullets (scope + scale)
// 2009–2016  Senior Dev   — 2 impact lines
// 2001–2009  earlier      — 1 line total: "Built and
//              ran billing + CMS platforms for two
//              SaaS companies."
//
// Detail follows relevance. Recent TS work is
// densest; the deep past is proof, compressed.`,
      note:
        "Detail follows relevance, not chronology. The recent TypeScript role earns the most bullets even if it's the smallest job — it's the evidence the reader came for.",
      leftLang: "ts",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "yaml",
    intro:
      "A resume's structure as data — sections top to bottom, and how much detail each carries. Read it as a recruiter would in six seconds and predict the verdict; the output is their read transcript, line by line.",
    code: `# resume.yaml — the page, ordered top to bottom.
# For a stack-switch, ordering IS the argument.

name: John Smith
headline: "Full-stack engineer — TypeScript/Node · 25 years shipping web systems"

skills:            # left-to-right; reader stops early
  - TypeScript
  - Node 24 LTS
  - SvelteKit
  - PostgreSQL 18
  - REST APIs
  - AWS
  - "PHP (15+ yrs depth)"

experience:
  - role: "Senior Engineer — Acme Commerce"
    when: "2024–present"
    detail: high          # recent TS work = most bullets
    bullets:
      - "Built a SvelteKit + PostgreSQL ordering app, TS end to end."
      - "Added typed API layer; cut a class of runtime bugs to zero."

  - role: "Lead Engineer — ShopFast"
    when: "2016–2024"
    detail: medium        # scope + scale, fewer bullets
    bullets:
      - "Owned e-commerce platform at 12,000 orders/day for 8 years."
      - "Rebuilt checkout: p95 latency 1.8s -> 400ms."

  - role: "Earlier roles"
    when: "2001–2016"
    detail: compressed    # one impact line, no bullets
    summary: "Built and operated billing, CMS, and booking platforms."

length: "2 pages"

# Predict: what does the recruiter conclude at second 6?`,
    output: `[recruiter 6-second read, top to bottom]
0.0s  name — skip
0.5s  headline — "TypeScript/Node" + "25 years" + "shipping"
        -> senior, target stack, delivers. Good start.
1.5s  skills — TS, Node, SvelteKit, Postgres lead;
        PHP present but framed as depth. Keyword match: pass.
3.0s  first role — recent, SvelteKit + Postgres, TS end to end.
        -> the TS evidence is real and current, not aspirational.
4.5s  second role — 12k orders/day, 8 years, latency win.
        -> genuine senior scope and a quantified outcome.
5.5s  earlier roles — one line. Good: they didn't pad 2003.
6.0s  length 2 pages. Disciplined.

VERDICT: SCREEN. Senior signal, target stack proven recent,
depth real, judgment shown by what was left OFF the page.`,
  },

  keyPoints: [
    "A resume is a six-to-ten-second triage document — the top third of page one decides whether a stack-switcher is read as a TypeScript or a PHP candidate.",
    "The headline is the highest-value line: name the target stack and seniority, e.g. 'Full-stack engineer — TypeScript/Node · 25 years shipping web systems'.",
    "Order the skills line target-stack-first with PHP framed as depth — recruiters and ATS keyword-match it and humans read left-to-right and stop early.",
    "Every bullet is verb + scale + outcome; a line with no number and no result is a duty — cut it or quantify it.",
    "Weight detail by relevance, not chronology: the recent TypeScript role gets the most bullets, roles older than ~10 years compress to one-line impact statements.",
    "Two pages maximum — a five-page senior resume signals someone who can't prioritise, the opposite of the judgment you're selling.",
  ],

  interview: [
    {
      q: "Your resume leads with TypeScript but most of your career is PHP. Isn't that a bit misleading?",
      a: "No — it's ordered by relevance to the role, which is what a resume is for. The headline names TypeScript/Node because that's the work I'm applying to do and the work I'm doing now, and PHP is right there in the skills line, framed honestly as 15-plus years of depth. Nothing is hidden; I'd never drop PHP, because two decades of it is real evidence of judgment. I'm just putting the most relevant signal where a six-second read will catch it, and letting the depth support it rather than lead. If anything, burying the TypeScript would be the misleading choice for a TypeScript role.",
    },
    {
      q: "Why is your recent, smallest role the most detailed part of your resume?",
      a: "Because detail should follow relevance, not seniority or chronology. That recent role is where I have TypeScript and SvelteKit shipping in production, and that's the exact evidence a reviewer is hunting for when they're hiring for this stack. My eight-year e-commerce role is bigger in scope, so it gets the scope-and-scale bullets — 12,000 orders a day, the latency win — but it doesn't need six lines to make its point. And the roles from 15 years ago are one line each. Spreading detail evenly by chronology would push the thing that matters below the fold.",
    },
    {
      q: "How do you decide what makes it onto a two-page resume with 25 years to cover?",
      a: "I treat page space as a budget and spend it on evidence for this role. Recent and relevant work gets bullets in verb-scale-outcome form; anything without a number or an outcome gets cut because it's a duty, not an accomplishment. Roles older than about ten years compress to a single impact line each — they prove the depth is real without eating the page. The discipline is deliberate: a senior who can edit 25 years down to two focused pages is demonstrating exactly the prioritisation judgment the job needs.",
    },
  ],

  quiz: [
    {
      question:
        "For a PHP veteran applying to a TypeScript role, what belongs in the resume headline?",
      options: [
        "\"Experienced PHP Developer with 25 years of expertise\"",
        "\"Full-stack engineer — TypeScript/Node · 25 years shipping web systems\"",
        "A detailed paragraph summarising every technology used",
        "Just the name and job title — headlines look unprofessional",
      ],
      answerIndex: 1,
      explain:
        "The headline is read in the first second and decides how you're filed. It must name the target stack (TypeScript/Node) and the seniority (25 years) and imply delivery (shipping). Leading with PHP files you as a PHP candidate for a TS role; a vague or absent headline wastes the highest-value line on the page.",
    },
    {
      question:
        "Which bullet is written correctly for a triage read?",
      options: [
        "\"Responsible for the checkout system and its performance.\"",
        "\"Involved in various migrations and maintenance tasks.\"",
        "\"Rebuilt checkout at 12,000 orders/day, cutting p95 latency 1.8s to 400ms.\"",
        "\"Worked extensively with modern and legacy web technologies.\"",
      ],
      answerIndex: 2,
      explain:
        "The correct shape is verb + scale + outcome: 'Rebuilt' (verb), '12,000 orders/day' (scale), '1.8s to 400ms' (outcome). The others are duties — no number, no result, nothing a reviewer can quote in a debrief.",
    },
    {
      question:
        "How should a 25-year veteran allocate detail across a two-page resume?",
      options: [
        "Equal space per role, in strict chronological order",
        "Most detail on the earliest roles to establish credibility",
        "Most detail on recent, relevant (TypeScript) work; roles older than ~10 years compressed to one-line impact statements",
        "Six pages so nothing important gets left out",
      ],
      answerIndex: 2,
      explain:
        "Detail follows relevance. The recent TypeScript work is the evidence the reviewer wants, so it gets the most bullets even if it's the smallest role; deep-past roles compress to single impact lines that prove the depth without consuming the page. Two pages, disciplined — the edit itself signals prioritisation.",
    },
  ],
};

export default lesson;

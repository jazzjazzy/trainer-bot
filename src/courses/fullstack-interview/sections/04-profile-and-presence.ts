import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "profile-and-presence",
  title: "GitHub, LinkedIn, and Getting Screened In",
  part: "Positioning & Pipeline",
  estMinutes: 11,
  summary:
    "Recruiters check your LinkedIn and GitHub before they call — align the LinkedIn story with your resume, and pin two or three real TypeScript repos with READMEs, tests, and sane commits, because one polished project outweighs thirty tutorial forks.",

  concept: `
Between reading your resume and picking up the phone, a recruiter or engineer
spends a couple of minutes on your online surface: LinkedIn, and — for an
engineering role — GitHub. These are not vanity pages. They are corroboration.
The reviewer is checking that the story on your resume holds up when someone
who isn't you describes it, and that the code exists and looks like a
professional wrote it. Get this surface aligned and you get screened in; leave
it contradictory or empty and you plant doubt right before the call.

### LinkedIn: corroborate the resume, don't contradict it

The single worst LinkedIn mistake is a headline that fights your resume. If
your resume says "Full-stack engineer — TypeScript/Node" and your LinkedIn
still says "Senior PHP Developer", the reviewer notices, and the mismatch
reads as either stale or unsure. Align them. The headline names the same
target stack and seniority; the About section tells the same scope-and-impact
story in the first person, in three or four short paragraphs — what you own,
at what scale, and the deliberate move to TypeScript. LinkedIn is also where
recruiters *source*, so the target-stack keywords being present is what gets
you found in the first place.

### GitHub: 90 seconds, and quality over green squares

An engineer looking at your GitHub is not counting your contribution squares —
that myth costs people real effort for no return. They click your pinned
repos and spend about 90 seconds forming a judgment. What they infer:

- **Is there a README that explains what this is and how to run it?** A repo
  with no README reads as unfinished, whatever the code is like.
- **Are there tests?** Even a handful signals someone who ships
  responsibly.
- **Do the commits read like a professional?** "Fix bug" x40 versus
  meaningful messages tells them how you work in a team.
- **Does it run?** A clear \`npm install && npm test\` that passes closes the
  loop.

Pin **two or three** repos, not twenty. One polished full-stack project — say
a SvelteKit + PostgreSQL app with a real README, tests, and a clean history —
outweighs thirty forked tutorials, because it demonstrates you can carry
something to done. Thirty half-finished forks demonstrate the opposite. Curate
ruthlessly; unpin the noise.

### What a reviewer reads in a repo

Put yourself in their seat. They \`git clone\`, they \`ls\`, they \`cat
README.md\`, they run the tests. In that minute and a half they are answering
one question: *would I be comfortable if this person pushed to our main
branch?* A tidy structure, a README that gets them running in two commands,
tests that pass, and commit messages that explain intent all answer "yes".

### Referrals: how to actually ask

A referral is the highest-leverage move in your whole search, and most people
ask for it wrong — a vague "let me know if you hear of anything" that can't be
forwarded. Make it forwardable. Message a real contact with three things: a
one-line reminder of how you know them, the specific role and company you're
targeting, and a two-line pitch they can paste verbatim to their recruiter.
You are doing the work for them: the easier your message is to forward, the
more likely it travels. "Can you refer me?" is a chore; "here's a role I'm a
fit for and two lines you can forward" is a favour that takes them 30 seconds.
`,

  comparisons: [
    {
      label: "The LinkedIn About section",
      intro:
        "The first-person summary a recruiter reads after your headline. One is a passive keyword soup; the other tells the resume's scope-and-impact story and corroborates it.",
      php: `// Weak: passive, keyword-stuffed, misaligned
//
// "Experienced software developer. Passionate about
//  technology and problem solving. Skilled in PHP,
//  MySQL, JavaScript, HTML, CSS, and more. Team
//  player and hard worker looking for new
//  opportunities. Open to work."
//
// Says nothing about scope, contradicts a resume
// that leads with TypeScript, quotable by no one.`,
      ts: `// Strong: first-person, scope + impact, aligned
//
// "Full-stack engineer, 25 years shipping production
//  web systems. I owned an e-commerce platform doing
//  12,000 orders/day for eight years — architecture,
//  on-call, the lot — and cut checkout latency 75%.
//
//  Over the past year I moved deliberately into
//  TypeScript and Node; my pinned repo is a
//  SvelteKit + PostgreSQL app you can clone and run.
//
//  I care about systems that stay reliable as they
//  grow, and about mentoring the people who run them."
//
// Same story as the resume, in the first person.`,
      note:
        "LinkedIn's job is corroboration. The About section must tell the same scope-and-impact story as the resume and name the same target stack — a headline that still says 'PHP Developer' plants doubt before the call.",
    },
    {
      label: "The README for a pinned repo",
      intro:
        "The file a reviewer opens first. One leaves them guessing; the other gets them from clone to a passing test in two commands.",
      php: `# README.md — weak
# my-app

A project I built.

## TODO
- add tests
- write docs
- clean up

(No description of what it does, no run steps,
 no evidence it works. Reads as abandoned.)`,
      ts: `# README.md — strong
# Orders — a SvelteKit + PostgreSQL demo

Typed full-stack ordering app: SvelteKit front end,
Node API, PostgreSQL 18, TypeScript end to end.

## Run
    npm install
    docker compose up -d db   # Postgres 18
    npm test                  # 34 tests, ~4s
    npm run dev               # http://localhost:5173

## Design notes
- Schema in /db; indexed on (customer_id, created_at).
- API validated with zod; errors typed end to end.
- Trade-offs and what I'd do next: see NOTES.md.`,
      note:
        "A reviewer spends ~90 seconds here. A README that states what it is, runs in two commands, and links design notes answers the only question they have: would I let this person push to main?",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Asking a contact for a referral",
      intro:
        "The message you send someone who works where you want to apply. One can't be forwarded; the other is a paste-ready favour.",
      php: `// Weak: vague, unforwardable
//
// "Hey! Long time. I'm looking for a new job —
//  let me know if you hear of anything that might
//  be a good fit for me. Would really appreciate
//  it. Thanks!"
//
// Nothing specific to forward, no role, no pitch.
// Best case they say "sure, will do" and forget.`,
      ts: `// Strong: specific, forwardable, low-effort
//
// "Hi Sam — we worked together on the billing
//  rebuild at ShopFast. I'm applying for the
//  Senior Full-Stack (TypeScript) role at your
//  company, req #4821. If you're comfortable
//  referring me, here are two lines you can paste:
//
//  'John led our e-commerce platform (12k orders/
//   day, 8 yrs) and recently shipped a TS/SvelteKit
//   app. Strong senior full-stack, worth a screen.'
//
//  Resume attached. No worries at all if not."
//
// Specific role, paste-ready pitch, 30s of effort.`,
      note:
        "Make the referral forwardable: remind them how you know each other, name the exact role, and hand them two lines to paste. You do the work; the easier it is to forward, the further it travels.",
    },
  ],

  playground: {
    lang: "bash",
    intro:
      "A reviewer cloning and inspecting your pinned repo, the way they actually do it — clone, ls, cat the README, run the tests. Predict what verdict they reach at each step; the output is the transcript with their running judgment.",
    code: `# What a reviewer actually types when they open your
# pinned repo. ~90 seconds, one question in mind:
# would I let this person push to our main branch?

git clone https://github.com/johnsmith/orders.git
cd orders
ls
cat README.md
git log --oneline -5
npm install
npm test`,
    output: `$ git clone https://github.com/johnsmith/orders.git
Cloning into 'orders'... done.

$ cd orders && ls
NOTES.md        db/             package.json    src/
README.md       docker-compose.yml  tests/      tsconfig.json
# tidy: tests/ and a tsconfig present. Looks maintained.

$ cat README.md
# Orders — a SvelteKit + PostgreSQL demo
## Run:  npm install / docker compose up -d db / npm test
# clear what it is and how to run it. Good sign.

$ git log --oneline -5
a1c9f2e Add cursor pagination to orders list
7b3d004 Validate order payloads with zod
c40188a Index orders on (customer_id, created_at)
19ee7a1 Set up SvelteKit + Postgres skeleton
# messages explain intent, not "fix" x5. Ships like a pro.

$ npm install && npm test
...
Test Suites: 6 passed, 6 total
Tests:       34 passed, 34 total
Time:        4.1 s
# it runs, tests pass, loop closed.

VERDICT: one polished project, README + tests + clean
history. Comfortable putting this person in a screen.`,
  },

  keyPoints: [
    "Recruiters check LinkedIn and GitHub between the resume and the call — treat them as corroboration of your story, not vanity pages.",
    "Align the LinkedIn headline and About section with the resume: same target stack, same scope-and-impact story in the first person; a stale 'PHP Developer' headline plants doubt.",
    "GitHub reviewers don't count green squares — they open pinned repos for ~90 seconds and judge README, tests, commit quality, and whether it runs.",
    "Pin two or three real projects: one polished SvelteKit + PostgreSQL app with a README, tests, and clean commits outweighs thirty tutorial forks.",
    "A README that states what the project is and gets a reviewer running in two commands answers their only question — would I let this person push to main?",
    "Make referral requests forwardable: remind the contact how you know them, name the exact role, and hand them two paste-ready lines — do the work so the ask is a 30-second favour.",
  ],

  interview: [
    {
      q: "We looked at your GitHub — walk us through what you'd want us to see there.",
      a: "I keep it curated rather than sprawling: two or three pinned repos, and the one I'd point you to first is a SvelteKit and PostgreSQL ordering app, TypeScript end to end. It has a README that gets you from clone to a passing test suite in two commands, about 34 tests, a schema with sensible indexing, and a NOTES file where I wrote down the trade-offs and what I'd do next. I deliberately don't pin tutorial forks — I'd rather you judge me on one project I carried to done than thirty I abandoned halfway. The commit history is meaningful too, because how I commit is how I'd work on your team.",
    },
    {
      q: "Your LinkedIn and your resume — how do you keep your story consistent across them?",
      a: "I treat the resume as the source of truth and make LinkedIn corroborate it. Same headline — full-stack engineer, TypeScript/Node, 25 years — and the About section tells the same scope-and-impact story in the first person: the platform I owned, the scale, the deliberate move to TypeScript, and a link to the pinned project. The reason I'm careful about it is that a recruiter reads both before calling, and a mismatch — say a headline still saying 'PHP Developer' — reads as stale or unsure right before the conversation that matters. Consistency removes a doubt I don't need to create.",
    },
    {
      q: "How do you go about getting referrals?",
      a: "I make the ask forwardable, because a referral is the highest-leverage thing in a search and most people ask for it in a way that can't be actioned. I message a specific contact, remind them how we worked together, name the exact role and req number, and hand them two lines they can paste straight to their recruiter — a one-sentence summary of my scope and a one-sentence 'worth a screen'. Resume attached, and an explicit 'no worries if not'. The point is to turn it from a chore into a 30-second favour; the easier it is to forward, the more likely it actually travels to the hiring team.",
    },
  ],

  quiz: [
    {
      question:
        "An engineer opens your pinned GitHub repo. What are they most likely judging in the first 90 seconds?",
      options: [
        "The total number of contribution squares on your profile",
        "Whether there's a clear README, tests, sane commit messages, and whether it runs",
        "How many programming languages appear across all your repos",
        "The number of stars and forks the repo has received",
      ],
      answerIndex: 1,
      explain:
        "Reviewers aren't counting green squares — that's a myth. In ~90 seconds they check whether a README explains and runs the project, whether tests exist, whether commits read professionally, and whether it actually runs. They're answering one question: would I let this person push to our main branch?",
    },
    {
      question:
        "For a job search, which GitHub profile makes the strongest impression?",
      options: [
        "Thirty forked tutorial repos showing breadth of exposure",
        "A daily-commit streak kept alive with trivial changes",
        "Two or three pinned real projects, one polished full-stack app with README, tests, and clean history",
        "A private profile with everything hidden to look mysterious",
      ],
      answerIndex: 2,
      explain:
        "One polished project carried to done — README, tests, sensible commits — demonstrates you can ship, which is exactly the signal. Thirty abandoned forks and streak-padding demonstrate the opposite. Curate ruthlessly and pin only what you'd want judged.",
    },
    {
      question:
        "What makes a referral request most likely to actually be forwarded?",
      options: [
        "Keeping it vague so the contact can match you to anything",
        "Asking a large number of loose contacts at once",
        "A specific role plus two paste-ready lines the contact can forward verbatim",
        "A long message detailing your entire career history",
      ],
      answerIndex: 2,
      explain:
        "A forwardable ask names the exact role and hands the contact a short, paste-ready pitch — you do the work so referring you is a 30-second favour. Vague 'let me know if you hear of anything' messages can't be actioned and are forgotten; a wall of history is too much effort to relay.",
    },
  ],
};

export default lesson;

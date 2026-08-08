import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "queues-and-async-work",
  title: "Queues and Async Work",
  part: "System Design Fundamentals",
  estMinutes: 12,
  summary:
    "When work takes longer than a request may block, move it off the request path onto a queue with workers — and be ready to talk about delivery semantics, idempotent consumers, retries with backoff, and dead-letter queues.",

  concept: `
Every "the request must return in 200ms but the work takes 30 seconds" problem
has the same answer: **don't do the work in the request.** Accept it, write a
record, put a message on a **queue**, return \`202 Accepted\`, and let a
**worker** process it in the background. Sending email, resizing images,
calling slow third-party webhooks, generating exports — none of it belongs on
the request path.

You have already built this. The **cron-driven jobs table** in your PHP apps —
insert a row with \`status = 'pending'\`, a cron picks it up, marks it
\`'done'\` — *was a queue*. It worked. Naming precisely what a dedicated broker
adds over that table is exactly the senior signal an interviewer is listening
for.

### What a dedicated broker adds over a jobs table

- **Push, not poll** — workers block waiting for messages instead of a cron
  polling every minute, so latency is milliseconds, not up to 60 seconds.
- **Delivery guarantees and acks** — a message isn't removed until the worker
  **acknowledges** success; if the worker dies mid-job, the message is
  redelivered rather than lost.
- **Concurrency and fan-out** — many workers pull from one queue; the broker
  handles distribution so two workers never grab the same message.
- **Retries, backoff, and dead-lettering** as first-class features rather than
  columns you hand-roll.

### Delivery semantics — and why idempotency is mandatory

Three theoretical guarantees: **at-most-once** (may lose messages), **exactly-once**
(a distributed-systems unicorn — genuinely hard, usually faked), and
**at-least-once**, which is the practical default. At-least-once means a
message **may be delivered more than once** — a worker processed a job, then
crashed before its ack landed, so the broker redelivers it. The consequence is
non-negotiable: **consumers must be idempotent.** Processing the same message
twice must produce the same result as processing it once. You get there with an
**idempotency key** — a unique job/message id you record as "already handled"
so the second delivery is a no-op.

### Retries, backoff, and dead-letter queues

Transient failures — an SMTP timeout, a third-party 503 — should be **retried
with exponential backoff** (wait 1s, then 2s, then 4s), so you don't hammer a
struggling dependency. But a **poison message** — one that will *never*
succeed, like a malformed payload — must not retry forever and block the
queue. After N attempts it goes to a **dead-letter queue (DLQ)**: a side queue
of failed messages you inspect and replay later. The DLQ is what stops one bad
message from becoming an outage.

### Work queue vs replayable log

Two shapes of broker, and knowing the difference is worth saying:

- **Work queue** (RabbitMQ-style) — a message is delivered to *one* consumer
  and removed on ack. Perfect for "do this task once": send this email.
- **Replayable log** (Kafka-style) — an append-only, ordered log; messages are
  retained and *many* independent consumers read at their own offset, and can
  **replay** from the past. Perfect for event streams that multiple systems
  react to and for reprocessing history. A work queue forgets on ack; a log
  remembers.
`,

  comparisons: [
    {
      label: "Synchronous send-in-request vs enqueue-and-ack",
      intro:
        "Sign-up must send a welcome email. The weak version sends inside the request, so the user waits on the mail server and a mail outage becomes a sign-up outage; the strong version enqueues and returns immediately.",
      php: `// Weak: do the slow work on the request path.
async function signup(req: Request) {
  const user = await db.users.create(req.body);

  // Blocks the response for as long as SMTP takes —
  // 2s on a good day, 30s+ on a bad one. If the mail
  // server is down, the whole sign-up 500s even though
  // the account was created.
  await sendWelcomeEmail(user.email);

  return json({ ok: true }); // finally
}`,
      ts: `// Strong: accept, enqueue, return; a worker does the rest.
async function signup(req: Request) {
  const user = await db.users.create(req.body);

  // Enqueue with a stable id and return in milliseconds.
  await queue.publish("emails", {
    jobId: \`welcome:\${user.id}\`, // idempotency key
    to: user.email,
    template: "welcome",
  });

  return json({ ok: true }, 202); // Accepted
}

// Elsewhere, a worker consumes "emails", sends, and acks.
// Mail outage now delays a background job, not the sign-up.`,
      note:
        "Moving the send off the request path decouples sign-up latency and availability from the mail server. The jobId is the idempotency key the worker uses to not double-send.",
    },
    {
      label: "Non-idempotent consumer vs idempotency key",
      intro:
        "At-least-once delivery means this email job may arrive twice. The weak consumer sends on every delivery, double-emailing the user; the strong consumer records the job id and makes the redelivery a no-op.",
      php: `// Weak: sends on every delivery.
async function handleEmailJob(job: EmailJob) {
  // Under at-least-once, if the worker crashes AFTER
  // sending but BEFORE acking, the broker redelivers —
  // and this sends the welcome email a SECOND time.
  await sendEmail(job.to, job.template);
  // ack happens after return
}`,
      ts: `// Strong: idempotency key makes redelivery a no-op.
async function handleEmailJob(job: EmailJob) {
  // Atomically claim the job id; if it's already there,
  // this delivery is a duplicate — skip and ack.
  const firstTime = await db.processedJobs
    .insertIfAbsent(job.jobId);
  if (!firstTime) {
    return; // already sent; ack the duplicate quietly
  }

  await sendEmail(job.to, job.template);
  // Now a redelivery finds the id present and does nothing.
}`,
      note:
        "At-least-once delivery is the practical default, so consumers must be idempotent. A recorded idempotency key (the job id) turns 'delivered twice' into 'processed once'.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A work queue with a flaky worker: transient failures retry with exponential backoff, and a poison message that never succeeds is dead-lettered after 3 attempts. Predict which jobs finish OK and which lands in the DLQ, then run it.",
    code: `// A work queue with a flaky worker. Transient failures are
// retried with backoff; a poison message is dead-lettered.

interface Job {
  id: string;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const queue: Job[] = [
  { id: "email-1", attempts: 0 },
  { id: "email-2", attempts: 0 },
  { id: "poison", attempts: 0 },
  { id: "email-3", attempts: 0 },
];
const deadLetter: Job[] = [];
const done: string[] = [];

// Deterministic "flakiness": email-2 fails once then succeeds,
// "poison" always throws, everything else succeeds first try.
function process(job: Job): void {
  if (job.id === "poison") throw new Error("malformed payload");
  if (job.id === "email-2" && job.attempts < 2) throw new Error("smtp timeout");
}

function backoffMs(attempt: number): number {
  return 100 * 2 ** (attempt - 1); // 100, 200, 400 - exponential
}

while (queue.length > 0) {
  const job = queue.shift()!;
  job.attempts++;
  try {
    process(job);
    done.push(job.id);
    console.log(\`\${job.id.padEnd(8)} attempt \${job.attempts} -> OK (ack)\`);
  } catch (err) {
    const msg = (err as Error).message;
    if (job.attempts >= MAX_ATTEMPTS) {
      deadLetter.push(job);
      console.log(\`\${job.id.padEnd(8)} attempt \${job.attempts} -> FAIL (\${msg}) -> dead-letter\`);
    } else {
      queue.push(job); // requeue for another attempt
      console.log(\`\${job.id.padEnd(8)} attempt \${job.attempts} -> retry in \${backoffMs(job.attempts)}ms (\${msg})\`);
    }
  }
}

console.log(\`\\nprocessed OK: \${done.join(", ")}\`);
console.log(\`dead-letter:  \${deadLetter.map((j) => j.id).join(", ")}\`);`,
  },

  keyPoints: [
    "Move slow work (email, image processing, webhooks) off the request path: accept the request, enqueue a message, return 202, and let a worker process it — the answer to every 'return in 200ms but the work takes 30s' problem.",
    "Your PHP cron-driven jobs table was already a queue; a dedicated broker adds push delivery, acks with redelivery on crash, concurrency/fan-out, and first-class retries and dead-lettering.",
    "At-least-once is the practical delivery default (exactly-once is largely a myth), so a message may arrive more than once — consumers must be idempotent.",
    "Make consumers idempotent with an idempotency key — a unique job/message id recorded as processed so a redelivery becomes a no-op instead of a double-send.",
    "Retry transient failures with exponential backoff; send poison messages that never succeed to a dead-letter queue after N attempts so one bad message can't block the queue.",
    "Work queue (RabbitMQ-style) delivers each message to one consumer and forgets on ack; a replayable log (Kafka-style) retains an ordered log that many consumers read and can replay.",
  ],

  interview: [
    {
      q: "A request needs to trigger work that takes 30 seconds. How do you keep the endpoint fast?",
      a: "I take the work off the request path. The endpoint does the minimum synchronously — validate, persist a record, publish a message to a queue with a stable job id — and returns 202 Accepted immediately, in milliseconds. A pool of workers consumes the queue and does the slow part in the background, acknowledging each message only on success so a crash mid-job means redelivery, not a lost job. That decouples the endpoint's latency and availability from the slow dependency: if the mail server or image service is down, a background job is delayed, not the user's request. I've done the poor-man's version of this for years with a cron-driven jobs table in PHP; a broker just makes the delivery, retries, and fan-out first-class.",
    },
    {
      q: "Your queue guarantees at-least-once delivery. What does that force you to do?",
      a: "At-least-once means a message can be delivered more than once — typically when a worker finishes a job but crashes before its ack lands, so the broker redelivers. That makes idempotent consumers mandatory: processing the same message twice must have the same effect as processing it once. I implement that with an idempotency key, usually the job id, which I record atomically as 'handled' — insert-if-absent — before doing the side effect. A redelivery finds the id already present and no-ops. Exactly-once delivery would remove the need, but it's extremely hard in practice and usually just at-least-once plus idempotent consumers wearing a costume, so I design for at-least-once and make the work idempotent.",
    },
    {
      q: "When would you reach for a Kafka-style log instead of a RabbitMQ-style work queue?",
      a: "A work queue is right when a message is a task to be done once by one worker and then forgotten on ack — send this email, resize this image. I'd reach for a replayable log when the same events need to feed multiple independent consumers, when ordering within a partition matters, or when I need to replay history — reprocess the last week of events into a new service or rebuild a downstream store. The log retains messages and each consumer tracks its own offset, so adding a new consumer that reads from the beginning is free; a work queue forgets a message the moment it's acked. So: discrete tasks go on a work queue, event streams that several systems react to and may need to replay go on a log.",
    },
  ],

  quiz: [
    {
      question:
        "Why must consumers be idempotent under at-least-once delivery?",
      options: [
        "Because messages are always delivered exactly once and idempotency is just good style",
        "Because a message may be delivered more than once (e.g. a crash before the ack), so reprocessing must not duplicate side effects",
        "Because idempotency makes the broker faster",
        "Because the queue reorders messages randomly",
      ],
      answerIndex: 1,
      explain:
        "At-least-once means redelivery can happen — a worker that succeeds but dies before acking gets its message again. Idempotency (via a recorded idempotency key) makes the second processing a no-op so the user isn't emailed or charged twice.",
    },
    {
      question:
        "What is a dead-letter queue for?",
      options: [
        "Load-balancing messages across multiple workers",
        "Holding messages that repeatedly fail so a poison message doesn't retry forever and block the queue",
        "Storing successfully processed messages for auditing",
        "Guaranteeing exactly-once delivery",
      ],
      answerIndex: 1,
      explain:
        "A poison message — one that will never succeed, like a malformed payload — would retry endlessly and stall the queue. After N attempts it's routed to a dead-letter queue for inspection and later replay, isolating the failure.",
    },
    {
      question:
        "What is the key difference between a work queue and a replayable log?",
      options: [
        "A work queue is faster; a log is slower",
        "A work queue delivers a message to one consumer and drops it on ack; a log retains an ordered stream that many consumers read at their own offset and can replay",
        "A log can only have one consumer; a work queue can have many",
        "There is no real difference; the names are interchangeable",
      ],
      answerIndex: 1,
      explain:
        "A work queue (RabbitMQ-style) is task distribution: one consumer, forgotten on ack. A replayable log (Kafka-style) retains an ordered history that multiple independent consumers read and can replay from any offset — right for event streams and reprocessing.",
    },
  ],
};

export default lesson;

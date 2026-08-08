import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 16,
  slug: "streams",
  title: "Streams and Backpressure",
  part: "Async, Data & Validation",
  estMinutes: 12,
  summary:
    "Streams move data through your one long-running process in small chunks — pipeline() wires them together safely, and backpressure keeps a fast producer from flooding a slow consumer.",

  concept: `
In PHP, memory discipline was largely someone else's problem. Each request ran
in its own PHP-FPM process with its own \`memory_limit\`; if one request slurped
a 500MB file with \`file_get_contents()\`, worst case *that request* died and
the process was recycled. In Node there is **one process and one heap shared by
every concurrent user**. Twenty users downloading a 500MB file through
\`readFile()\` means twenty 500MB buffers in the same heap — that's not a slow
request, that's an out-of-memory crash for **everyone**.

Streams are Node's answer: move data in small chunks (default 64 KiB for
\`fs.createReadStream\`) so memory use stays flat no matter how big the file or
how many users are mid-transfer.

### The stream types, at a working level

- **Readable** — a source you consume: \`fs.createReadStream()\`, an incoming
  HTTP request body.
- **Writable** — a sink you push into: \`fs.createWriteStream()\`, an outgoing
  HTTP response.
- **Transform** — both at once, with processing in the middle: gzip
  (\`node:zlib\`'s \`createGzip()\`), encryption, CSV parsing.
- (**Duplex** is readable and writable without transforming — sockets. You'll
  rarely build one.)

### pipeline() is the default, pipe() is the legacy

\`readable.pipe(writable)\` works, but it has a famous flaw: if one stream in the
chain errors, the others are **not** destroyed or cleaned up — you leak file
descriptors and hang responses. The modern tool is \`pipeline\` from
\`node:stream/promises\`:

\`\`\`ts
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";

await pipeline(
  createReadStream("access.log"),
  createGzip(),
  createWriteStream("access.log.gz"),
);
// resolves when done, REJECTS on any error, destroys every stream either way
\`\`\`

It returns a promise, forwards errors from any stage, and tears the whole
chain down on failure. Use \`pipeline()\` by default; read \`.pipe()\` in older
code and know why it was replaced.

### Backpressure in one honest paragraph

A fast producer (disk read) can outrun a slow consumer (a client on hotel
wifi). Without a brake, chunks pile up in memory and you're back to the OOM.
So writable streams buffer up to a cap called **highWaterMark**; when the
buffer hits it, \`write()\` returns \`false\`, the upstream readable **pauses**,
and when the consumer drains the buffer the writable emits \`'drain'\` and the
producer resumes. \`pipe()\` and \`pipeline()\` wire this pause/resume handshake
for you — which is exactly why you stream through them instead of manually
reading and writing.

### The reveal: req and res ARE streams

Express's \`req\` is a Readable (the request body arrives in chunks) and \`res\`
is a Writable — \`res.write(chunk)\` and \`res.end()\` are the raw stream API
that \`res.send()\` and \`res.json()\` are built on. Streaming a file to a client
is just connecting two streams:

\`\`\`ts
app.get("/download/report", async (req, res, next) => {
  res.setHeader("Content-Type", "application/pdf");
  try {
    await pipeline(createReadStream("./files/report.pdf"), res);
  } catch (err) {
    next(err); // client disconnects mid-download land here too
  }
});
\`\`\`

Memory stays flat whether the file is 5MB or 5GB, and whether one user or a
hundred are downloading it.
`,

  comparisons: [
    {
      label: "Serving a large file for download",
      intro:
        "An endpoint streams a big PDF to the client. PHP hands the job to readfile(), which internally chunks to the output buffer; Node connects a file stream to the response stream with pipeline().",
      php: `<?php
// download.php — PHP-FPM: this request has its OWN process
header('Content-Type: application/pdf');
header('Content-Length: ' . filesize('./files/report.pdf'));

// readfile() streams to the output buffer in chunks —
// memory stays low, and if it didn't, only THIS
// request's memory_limit would blow.
readfile('./files/report.pdf');`,
      ts: `// routes/download.ts — ONE process serves every user
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

app.get("/download/report", async (req, res, next) => {
  res.setHeader("Content-Type", "application/pdf");
  try {
    // ~64 KiB in flight per download, whatever the file size.
    await pipeline(createReadStream("./files/report.pdf"), res);
  } catch (err) {
    next(err); // read error OR client hung up — chain is cleaned up
  }
});`,
      note:
        "Both stream, but the stakes differ: a memory blowup in PHP kills one request's process; in Node it kills the single process serving every concurrent user — so streaming is survival, not optimisation.",
    },
    {
      label: "Whole-file-in-memory vs streaming a transform",
      intro:
        "Gzip a large log file. The load-it-all version needs the whole file (plus the compressed copy) in memory at once; the streaming version needs one chunk at a time.",
      php: `<?php
// Memory profile: entire file + entire gzip result
// in RAM at the same moment.
$data = file_get_contents('access.log');   // 800MB file? 800MB heap
$gz   = gzencode($data);                   // + compressed copy
file_put_contents('access.log.gz', $gz);

// PHP does have streams (fopen/fread loops, stream
// filters) — but file_get_contents is the reflex.`,
      ts: `// compress.ts — memory profile: one ~64 KiB chunk at a time
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

await pipeline(
  createReadStream("access.log"),
  createGzip(),                       // Transform: chunks in, chunks out
  createWriteStream("access.log.gz"),
);
console.log("done — heap never held the whole file");`,
      note:
        "pipeline() also solves what .pipe() chains didn't: an error in ANY stage rejects the promise and destroys every stream, so no leaked file descriptors.",
    },
    {
      label: "Writing a response incrementally",
      intro:
        "Send output to the client piece by piece — a progress log, a big CSV export. PHP echoes and flushes; Node uses the response's native Writable API.",
      php: `<?php
// export.php — echo + flush pushes chunks out
header('Content-Type: text/csv');

$rows = fetchRowsIterator(); // generator over DB rows
foreach ($rows as $row) {
    echo implode(',', $row) . "\\n";
    flush(); // beg the SAPI/output buffering to send it
}`,
      ts: `// routes/export.ts — res IS a Writable stream
app.get("/export.csv", async (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  for await (const row of fetchRows()) {   // async iterator over DB rows
    const ok = res.write(row.join(",") + "\\n");
    if (!ok) {
      // backpressure: client is slow, wait for the buffer to drain
      await new Promise((r) => res.once("drain", r));
    }
  }
  res.end(); // finish the response — like the request script ending in PHP
});`,
      note:
        "res.write()/res.end() are the stream layer under res.send(); checking write()'s boolean and awaiting 'drain' is backpressure done by hand — pipeline() does it for you when the source is a stream.",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Backpressure as a visible simulation: a fast producer, a slow consumer, and a buffer capped at highWaterMark = 3. Predict when the producer pauses and when 'drain' lets it resume, then run it.",
    code: `// A Writable stream in miniature: a fast producer, a slow consumer,
// and a buffer capped by highWaterMark. Watch WHEN the producer pauses.

const HIGH_WATER_MARK = 3;
const TOTAL_CHUNKS = 8;

const buffer: string[] = [];
let produced = 0;
let paused = false;

// write() in miniature: buffer the chunk, report whether the caller
// should keep writing (true) or back off (false).
function write(chunk: string): boolean {
  buffer.push(chunk);
  console.log(\`producer: wrote \${chunk}  (buffered: \${buffer.length})\`);
  return buffer.length < HIGH_WATER_MARK;
}

// The producer respects backpressure: it writes until write()
// returns false, then pauses until the 'drain' event.
function produce(): void {
  while (produced < TOTAL_CHUNKS && !paused) {
    const ok = write(\`chunk-\${produced++}\`);
    if (!ok) {
      paused = true;
      console.log(\`producer: PAUSED — buffer hit highWaterMark (\${HIGH_WATER_MARK})\`);
    }
  }
}

// The consumer is slower: it processes ONE chunk per turn of the loop.
function consumeOne(): void {
  const chunk = buffer.shift();
  if (chunk !== undefined) {
    console.log(\`consumer: processed \${chunk}  (buffered: \${buffer.length})\`);
  }
  if (paused && buffer.length === 0) {
    paused = false;
    console.log(\`consumer: buffer drained — 'drain' fires, producer resumes\`);
  }
}

// Alternate them, like turns of the event loop:
while (produced < TOTAL_CHUNKS || buffer.length > 0) {
  produce();
  consumeOne();
}

console.log(\`done: \${TOTAL_CHUNKS} chunks moved, never more than \${HIGH_WATER_MARK} in memory\`);`,
  },

  keyPoints: [
    "In Node every concurrent user shares ONE heap — `readFile()` on big files multiplies whole-file buffers per user, where PHP's per-request process made that one request's problem.",
    "Streams move data in small chunks (~64 KiB for `fs.createReadStream`), keeping memory flat regardless of file size or concurrency.",
    "Use `pipeline` from `node:stream/promises` as the default: it returns a promise, forwards errors from any stage, and destroys the whole chain on failure — `.pipe()` cleans up nothing on error.",
    "Backpressure: a writable buffers up to `highWaterMark`; `write()` returning `false` pauses the producer, and `'drain'` resumes it. `pipeline()` handles this handshake for you.",
    "`req` is a Readable and `res` is a Writable — `res.write()`/`res.end()` are the stream API under `res.send()`, and streaming a file to a client is `pipeline(createReadStream(path), res)`.",
    "Transform streams (like `node:zlib`'s `createGzip()`) sit mid-chain to process chunks — gzip, encryption, parsing — without ever holding the whole payload.",
  ],

  interview: [
    {
      q: "Why do streams matter more in Node than they did in your PHP work?",
      a: "It comes down to the process model. PHP-FPM gave every request its own process with its own memory_limit, so loading a whole file into memory was wasteful but contained — one request paid the price. Node runs one long-lived process whose heap is shared by every concurrent user, so twenty concurrent 500MB `readFile()` calls is ten gigabytes in one heap and an OOM that takes down everyone. Streams cap that by moving data in small chunks — roughly 64 KiB at a time for a file stream — so memory stays flat regardless of file size or user count. In PHP streaming was an optimisation; in Node it's how you stay up.",
    },
    {
      q: "What does pipeline() from node:stream/promises give you over calling .pipe()?",
      a: "Three things: error propagation, cleanup, and a promise. With `.pipe()` chains, an error in one stream doesn't destroy the others — you have to attach error handlers to every stage yourself or you leak file descriptors and leave responses hanging. `pipeline()` wires the whole chain, rejects its promise if any stage fails (including the client disconnecting mid-response), and destroys every stream on the way down. Because it returns a promise it also fits naturally into async/await handlers — in Express 5 a rejection forwards straight to the error middleware. I treat `.pipe()` as legacy code I can read, and `pipeline()` as what I write.",
    },
    {
      q: "Explain backpressure and how Node implements it.",
      a: "Backpressure is the brake between a fast producer and a slow consumer — a disk read can produce data far faster than a client on a slow connection can accept it, and without a brake the difference accumulates in memory. In Node, a writable stream buffers up to its `highWaterMark`; once the buffer hits that cap, `write()` returns `false`, which tells the producer to pause. When the consumer drains the buffer, the writable emits `'drain'` and the producer resumes. You almost never hand-roll this: `pipe()` and `pipeline()` implement the pause/resume handshake, which is a major reason to always connect streams through them rather than shuttling chunks manually.",
    },
  ],

  quiz: [
    {
      question:
        "Twenty users concurrently download a 500MB file from an endpoint that uses await readFile(path) and res.send(). What happens in Node that wouldn't in PHP-FPM?",
      options: [
        "Nothing different — both platforms buffer per request",
        "Node serializes the downloads so they happen one at a time",
        "All twenty 500MB buffers live in the ONE shared heap, risking an out-of-memory crash for every user",
        "Express automatically converts readFile results into streams",
      ],
      answerIndex: 2,
      explain:
        "PHP-FPM isolates each request in its own process with its own memory_limit, so a huge buffer hurt one request. Node's single process shares one heap across all concurrent users — 20 × 500MB buffers is ~10GB in that heap. Streaming with createReadStream + pipeline keeps memory flat instead.",
    },
    {
      question: "Why is pipeline() from node:stream/promises preferred over .pipe()?",
      options: [
        "It compresses data automatically between stages",
        "It propagates errors from any stage, destroys all streams on failure, and returns an awaitable promise — .pipe() does none of that on error",
        "It is faster because it skips the highWaterMark buffering",
        "pipe() was removed in Node 22",
      ],
      answerIndex: 1,
      explain:
        "pipe()'s flaw is error handling: a failure in one stream leaves the others alive, leaking descriptors. pipeline() tears the whole chain down on any error and rejects its promise, which async handlers can await. It still uses the same backpressure buffering — that's not skipped.",
    },
    {
      question: "A writable stream's write() method just returned false. What does that mean?",
      options: [
        "The write failed and the data was lost",
        "The stream has been destroyed",
        "The internal buffer reached highWaterMark — the chunk was accepted, but the producer should pause until 'drain'",
        "The consumer has finished and no more writes are allowed",
      ],
      answerIndex: 2,
      explain:
        "false is a backpressure signal, not an error: the chunk IS buffered, but the buffer is at or over highWaterMark, so a well-behaved producer stops writing until the 'drain' event says the consumer has caught up. Ignoring it doesn't lose data — it just piles chunks into memory.",
    },
  ],
};

export default lesson;

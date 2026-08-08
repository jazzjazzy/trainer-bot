import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 17,
  slug: "files-and-uploads",
  title: "File Handling and Uploads",
  part: "Async, Data & Validation",
  estMinutes: 12,
  summary:
    "node:fs/promises replaces PHP's file functions, node:path plus a prefix check blocks traversal, express.static serves assets — and uploads need multer because Node has no $_FILES.",

  concept: `
PHP's file functions are synchronous and it never mattered — blocking on disk
held up one request in one process. In Node, a synchronous read blocks the
event loop for **every** user, so day-to-day file work uses the promise API
from \`node:fs/promises\`.

### fs/promises: the working set

\`\`\`ts
import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";

await mkdir("./storage/reports", { recursive: true }); // mkdir -p
await writeFile("./storage/reports/q3.json", JSON.stringify(report));
const text = await readFile("./storage/reports/q3.json", "utf8");
const info = await stat("./storage/reports/q3.json");
console.log(info.size, info.isDirectory()); // like filesize()/is_dir()
await rm("./storage/tmp", { recursive: true, force: true });
\`\`\`

Rough mapping: \`file_get_contents\` → \`readFile\`, \`file_put_contents\` →
\`writeFile\`, \`mkdir($p, 0777, true)\` → \`mkdir(p, { recursive: true })\`,
\`filesize\`/\`is_dir\`/\`filemtime\` → \`stat\`, \`unlink\`/\`rmdir\` → \`rm\`. The
\`readFileSync\` twins exist — reserve them for startup code (loading config
before the server listens), never inside a request handler.

### Safe paths: resolve, then check the prefix

Never concatenate user input into a path. Build it with \`node:path\` and then
verify the resolved result is still inside your base directory — the same
discipline as a \`realpath()\` prefix check in PHP:

\`\`\`ts
import path from "node:path";

const BASE = path.resolve("./storage/uploads");

function safeJoin(base: string, userPath: string): string | null {
  const resolved = path.resolve(base, userPath); // folds ../ away
  return resolved === base || resolved.startsWith(base + path.sep)
    ? resolved
    : null; // ../../etc/passwd resolved OUTSIDE base — reject
}
\`\`\`

Note the \`path.sep\` in the check: without it, \`/storage/uploads-evil\` would
pass a bare \`startsWith\` test.

### Serving files: express.static, res.sendFile, res.download

Your Apache/nginx instinct says "the doc root serves static files". In Node,
your app can do it: \`app.use(express.static("public"))\` serves \`public/\`
with correct content types and traversal protection built in. That's fine for
small apps; at scale you put a CDN or nginx in front for static assets — the
Node process's time is better spent on dynamic work. For one-off files from
handlers: \`res.sendFile(absolutePath)\` streams a file as the response, and
\`res.download(filePath, "invoice.pdf")\` adds the \`Content-Disposition:
attachment\` header so the browser saves rather than displays it.

### Uploads: there is no $_FILES

PHP parsed multipart bodies before your script even ran. Node parses
**nothing** — \`express.json()\` handles JSON bodies, but multipart forms need
dedicated middleware, and the standard choice is **multer**:

\`\`\`ts
import multer from "multer";

const upload = multer({
  dest: "uploads/",                        // disk storage
  limits: { fileSize: 5 * 1024 * 1024 },   // 5MB cap — NOT optional
});

app.post("/avatar", upload.single("avatar"), (req, res) => {
  // req.file: { originalname, mimetype, size, path, ... }
  // req.body: the text fields of the form
  res.json({ stored: req.file?.path });
});
\`\`\`

Two storage engines: \`multer.diskStorage()\` writes straight to disk (the
\`move_uploaded_file\` analogue), \`multer.memoryStorage()\` gives you
\`req.file.buffer\` — convenient for piping to S3, but those buffers live in
**your one shared heap**. Always set \`limits.fileSize\` (the default is
Infinity): without it, an attacker uploading huge files is a denial-of-service
against every user, not just their own request like PHP's per-request
\`upload_max_filesize\` world.
`,

  comparisons: [
    {
      label: "Handling a single file upload",
      intro:
        "Accept an avatar image, cap its size, and store it under a generated name. PHP gets a pre-parsed $_FILES array; Express needs multer middleware to parse the multipart body.",
      php: `<?php
// upload.php — PHP parsed the multipart body for you
// (limits come from php.ini: upload_max_filesize, post_max_size)
$file = $_FILES['avatar'] ?? null;

if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    exit('upload failed');
}
if ($file['size'] > 5 * 1024 * 1024) {
    http_response_code(413);
    exit('too large');
}

$dest = __DIR__ . '/uploads/' . bin2hex(random_bytes(8)) . '.img';
move_uploaded_file($file['tmp_name'], $dest);
echo json_encode(['stored' => $dest]);`,
      ts: `// routes/upload.ts — no $_FILES: multer parses multipart
import multer from "multer";
import crypto from "node:crypto";

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) =>
    cb(null, crypto.randomBytes(8).toString("hex") + ".img"),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // default is Infinity!
});

app.post("/avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "upload failed" });
  res.json({ stored: req.file.path }); // already moved — no tmp_name dance
});`,
      note:
        "Oversize files surface differently: PHP flags $_FILES['error']; multer throws a MulterError (LIMIT_FILE_SIZE) that lands in your error middleware. And the size limit is on YOU to set — php.ini isn't there to save you.",
    },
    {
      label: "Everyday file work: check, create, write",
      intro:
        "Ensure a per-user report directory exists and write a JSON file into it. Same steps, but the Node version awaits each disk operation instead of blocking on it.",
      php: `<?php
// saveReport.php — sync is fine: blocking holds up
// only THIS request's process
$dir = __DIR__ . "/storage/reports/{$userId}";

if (!is_dir($dir)) {
    mkdir($dir, 0775, true); // recursive
}

file_put_contents(
    $dir . '/summary.json',
    json_encode($report, JSON_PRETTY_PRINT)
);

$bytes = filesize($dir . '/summary.json');`,
      ts: `// saveReport.ts — await keeps the event loop free
// for every OTHER user while the disk works
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const dir = path.join("storage", "reports", String(userId));

// no is_dir() check needed — recursive mkdir is idempotent
await mkdir(dir, { recursive: true });

await writeFile(
  path.join(dir, "summary.json"),
  JSON.stringify(report, null, 2),
);

const { size } = await stat(path.join(dir, "summary.json"));`,
      note:
        "mkdirSync/writeFileSync exist and would 'work' — but a slow disk would stall every concurrent request, so the sync twins belong only in startup code before the server listens.",
    },
    {
      label: "Serving static assets",
      intro:
        "Serve CSS, images, and other public files. In PHP the web server's doc root did this before PHP was ever invoked; in Node your app opts in with express.static.",
      php: `# Apache/nginx era: the web server owns static files.
# Anything under the doc root is served directly;
# PHP only runs for .php requests.
#
# /var/www/html/
#   index.php        <- PHP-FPM handles this
#   css/site.css     <- Apache/nginx serves this, PHP never runs
#   img/logo.png     <- same
#
# nginx.conf (typical):
location ~ \\.php$ { fastcgi_pass php-fpm:9000; }
location /        { root /var/www/html; }`,
      ts: `// app.ts — Node IS the server; static serving is opt-in
import express from "express";
import path from "node:path";

const app = express();

// Serves ./public with content types, ETags, and
// path-traversal protection built in:
app.use(express.static(path.join(import.meta.dirname, "public")));

// GET /css/site.css -> public/css/site.css
// Fine for small apps. At scale: CDN or nginx in front,
// so the event loop spends its time on dynamic work.

app.get("/report/:year", (req, res) => { /* dynamic */ });`,
      note:
        "There's no doc root by default in Node — nothing is served unless you mount express.static (or put a proxy/CDN in front). That's a feature: no accidentally web-readable files.",
      leftLang: "bash",
      rightLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "safeJoin() — the path.resolve + prefix check pattern, hand-rolled so it runs here. Predict which of the six inputs are accepted and which are rejected, then run it.",
    code: `// path.resolve + prefix check, in miniature. safeJoin() resolves the
// user-supplied path against a base directory and rejects anything
// that escapes it — the Node equivalent of PHP's realpath() check.

const BASE = "/var/www/uploads";

// A pure stand-in for path.resolve(base, userPath):
// absolute input ignores the base; "." and ".." are folded away.
function resolvePath(base: string, userPath: string): string {
  const full = userPath.startsWith("/") ? userPath : base + "/" + userPath;
  const stack: string[] = [];
  for (const part of full.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      stack.pop(); // ".." climbs one level — past the root it's a no-op
      continue;
    }
    stack.push(part);
  }
  return "/" + stack.join("/");
}

function safeJoin(base: string, userPath: string): string | null {
  const resolved = resolvePath(base, userPath);
  // The prefix check: equal to base, or inside it. The "/" matters —
  // without it, /var/www/uploads-evil would slip through.
  if (resolved === base || resolved.startsWith(base + "/")) {
    return resolved;
  }
  return null;
}

const attempts = [
  "report.pdf",
  "2026/invoices/march.pdf",
  "./notes/../report.pdf",
  "../../../etc/passwd",
  "/etc/passwd",
  "..",
];

for (const input of attempts) {
  const result = safeJoin(BASE, input);
  if (result === null) {
    console.log(\`REJECT  \${input}\`);
  } else {
    console.log(\`ACCEPT  \${input}  ->  \${result}\`);
  }
}`,
  },

  keyPoints: [
    "Use `node:fs/promises` (`readFile`, `writeFile`, `mkdir`, `stat`, `rm`) in handlers — the `*Sync` twins block every concurrent user and belong only in startup code.",
    "`mkdir(dir, { recursive: true })` is PHP's `mkdir($p, 0777, true)` and is idempotent — no `is_dir()` check needed first.",
    "Block path traversal like a `realpath()` check: `path.resolve(base, userInput)` then verify the result equals `base` or starts with `base + path.sep`.",
    "`express.static('public')` is your doc root, opt-in — fine for small apps; put a CDN/nginx in front at scale. `res.sendFile` streams a file, `res.download` adds the attachment header.",
    "There is no `$_FILES`: multipart bodies need multer — `upload.single('field')` puts the file on `req.file` and text fields on `req.body`.",
    "Always set multer's `limits.fileSize` (default: Infinity). Oversized or numerous uploads consume your ONE shared heap — a DoS in Node where PHP's per-request limits contained it.",
  ],

  interview: [
    {
      q: "How do you handle file uploads in Express, coming from PHP's $_FILES?",
      a: "The big difference is that PHP parsed multipart bodies before my script ran — $_FILES was just there. Node parses nothing by default, so I mount multer on the upload route: `upload.single('avatar')` parses the multipart body, puts the file on `req.file` and the text fields on `req.body`. I choose the storage engine deliberately — diskStorage to land files on disk like move_uploaded_file, memoryStorage when I'm forwarding the buffer to S3 — and I always set `limits.fileSize`, because the default is Infinity and there's no php.ini upload_max_filesize behind me. That limit matters more in Node: upload buffers live in the one heap shared by all users, so unbounded uploads are a denial-of-service vector, not just one bad request.",
    },
    {
      q: "How do you prevent path traversal when a request parameter names a file?",
      a: "Never concatenate the parameter into a path. I resolve it against the base directory — `path.resolve(base, userInput)` — which folds any `../` sequences into a real absolute path, then I check the result is still inside the base: equal to it, or starting with `base + path.sep`. The separator in that check matters, otherwise `/uploads-evil` passes a naive startsWith against `/uploads`. It's the same discipline as a realpath() prefix check in PHP. For plain static assets I let express.static do the serving, since it has traversal protection built in.",
    },
    {
      q: "Why does Express have express.static at all, when Apache or nginx always handled static files for your PHP apps?",
      a: "Because Node is the web server — there's no doc root and nothing is served unless the app opts in. express.static mounts a directory with correct content types, ETag caching headers, and traversal protection, which is entirely adequate for small and medium apps and keeps deployment to a single process. At scale I'd still push static assets to a CDN or an nginx layer in front, for the same reason PHP did: the Node event loop's time is better spent on dynamic requests than shovelling bytes of CSS. The inversion is actually a security win — in the doc-root world, forgetting to block a directory made it public; in Node, forgetting to mount it makes it private.",
    },
  ],

  quiz: [
    {
      question: "Why must fs.readFileSync never appear in an Express request handler?",
      options: [
        "It's deprecated in Node 22 in favour of readFile",
        "It can't read files larger than 64 KiB",
        "It blocks the event loop, freezing EVERY concurrent request until the disk read finishes",
        "It returns a Buffer, which Express can't send",
      ],
      answerIndex: 2,
      explain:
        "Sync fs calls park the single thread until the disk answers. In PHP that stalled one request's process; in Node it stalls everyone. The sync twins are fine at startup — before the server listens, there's no one to block. It isn't deprecated, size is irrelevant, and Buffers send fine.",
    },
    {
      question:
        "A route serves files from BASE using a :name param. Which check correctly blocks traversal?",
      options: [
        "Reject any name containing the substring '..'",
        "resolved = path.resolve(BASE, name); accept only if resolved === BASE || resolved.startsWith(BASE + path.sep)",
        "Use path.join(BASE, name) — join sanitises automatically",
        "URL-decode the name twice before joining it",
      ],
      answerIndex: 1,
      explain:
        "Resolve first, then prefix-check with the separator included — that's the realpath()-style proof the final path lives inside BASE. Substring checks miss encodings and absolute paths; path.join happily produces BASE/../../etc/passwd; double-decoding does nothing to contain the result.",
    },
    {
      question: "What's the key operational risk of multer.memoryStorage() with no fileSize limit?",
      options: [
        "Files are lost when the response is sent",
        "It's slower than disk storage for large files",
        "Uploaded files become Buffers in the single shared heap — and the default size limit is Infinity, so uploads can OOM the whole process",
        "req.body stops receiving the form's text fields",
      ],
      answerIndex: 2,
      explain:
        "memoryStorage holds each upload fully in RAM, and multer's default fileSize limit is Infinity. A few concurrent large uploads can exhaust the one heap every user shares — so limits.fileSize is mandatory DoS protection, doing the job php.ini's upload_max_filesize did per-request in PHP.",
    },
  ],
};

export default lesson;

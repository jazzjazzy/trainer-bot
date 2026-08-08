import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "file-uploads",
  title: "File Uploads",
  part: "Operating in Production",
  estMinutes: 12,
  summary:
    "Three upload designs — multipart through the API, raw-body PUT, and presigned URLs where your API authorizes but object storage does the byte-shovelling — plus the validation rules that keep uploads from becoming your next security incident.",

  concept: `
Uploads are where quick-and-dirty PHP did the most damage: \`move_uploaded_file($_FILES['f']['tmp_name'],
'/var/www/uploads/' . $_FILES['f']['name'])\` has probably shipped more web shells than any
other line of code. Everything in \`$_FILES\` — the filename, the type, even implicitly the
size — is **client input**, exactly as untrustworthy as \`$_GET\`. Designing uploads properly
is one part API shape, one part input validation.

### Option 1: multipart/form-data through your API

The classic: the client POSTs \`multipart/form-data\`, your server parses the stream (busboy /
multer in Node — the equivalents of PHP populating \`$_FILES\`), stores the file, returns a
resource. Simple, one round trip, easy to validate inline — and it **ties your API server up**
for the duration of every upload: memory, sockets, and request-timeout budget all spent on
byte-shovelling. Fine for avatars; painful for 500 MB video. Enforce a size cap and answer
**413 Content Too Large** (RFC 9110's name for the old "Payload Too Large") when it's exceeded.

### Option 2: raw-body PUT

For single files, skip multipart entirely: \`PUT /files/{id}\` with \`Content-Type: image/png\`
and the raw bytes as the body. Cleaner semantics (the body *is* the representation), trivially
streamable — but the same server-in-the-middle cost as option 1, and no room for sidecar
form fields.

### Option 3: presigned URLs — the senior answer

Split **authorization** from **transfer**:

\`\`\`text
1. POST /api/uploads { filename, contentType, size }   -> your API
   API validates type + size, creates a PENDING file record,
   returns { uploadUrl, key, expiresAt }  (URL signed, short-lived)
2. PUT <uploadUrl>  (raw bytes)                        -> object storage direct
3. POST /api/uploads/{key}/complete                    -> your API
   API verifies the object exists (and its real size/type), flips
   the record to READY
\`\`\`

Your API makes the *decision* (who may upload what, where); S3/GCS/R2 does the *transfer*.
The signed URL embeds the key, expiry, and constraints, so storage can verify it without
calling you. Your servers never see the bytes — no memory pressure, no timeout tuning, and
uploads scale with the storage provider, not with your pod count. The costs to name in an
interview: three round trips, CORS configuration on the bucket, and the **pending/confirm
dance** — clients abandon uploads, so you need a janitor that expires PENDING records.

### Validation: the rules that survive all three options

- **Never trust the declared Content-Type or filename.** Both come from the client. Check the
  declared type against a whitelist at authorization time, then **sniff the magic bytes**
  (\`89 50 4E 47\` for PNG, \`FF D8 FF\` for JPEG) server-side — or on the confirm step for
  presigned flows — before marking the file usable.
- **Opaque names, outside the webroot.** Store as \`uploads/2026/07/9f3ac1d2.png\` — a key you
  generated — and keep the user's filename as metadata for the \`Content-Disposition\` header
  on download. That one habit eliminates path traversal (\`../../etc/cron.d/x\`), double
  extensions (\`invoice.php.png\`), and collisions in one move.
- **Cap sizes early**: reject at the authorization step from declared size, enforce again at
  the transfer (multipart parsers and presigned policies both support hard limits), and
  answer 413.
- **Serve downloads defensively**: from a cookieless domain or via signed download URLs, with
  \`Content-Disposition: attachment\` and \`X-Content-Type-Options: nosniff\` so a polyglot
  file can't execute as HTML in your origin.
`,

  comparisons: [
    {
      label: "Storing an upload: the classic PHP foot-gun vs opaque keys",
      intro:
        "Both accept an image upload. The PHP script trusts the client's filename and type and drops the file inside the webroot; the TS handler validates the declared type, generates its own key, and keeps the original name as metadata only.",
      php: `<?php // upload.php — three vulnerabilities in two lines
if ($_FILES['f']['type'] === 'image/png') {      // client-controlled!
    move_uploaded_file(
        $_FILES['f']['tmp_name'],
        '/var/www/html/uploads/' . $_FILES['f']['name']
        // name is client input too:
        //   "../../cron.d/evil"     -> path traversal
        //   "shell.php"             -> executable in webroot
        //   "invoice.php.png"       -> Apache multiviews surprise
    );
    echo 'ok';
}`,
      ts: `// routes/uploads.ts — server generates the name, client keeps a label
import { randomUUID } from "node:crypto";

const ALLOWED = new Set(["image/png", "image/jpeg", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

app.post("/api/uploads", requireAuth, async (req, res) => {
  const { filename, contentType, size } = req.body;

  if (!ALLOWED.has(contentType))
    return res.status(422).json({ title: "Unsupported file type" });
  if (size > MAX_BYTES)
    return res.status(413).json({ title: "Content Too Large" });

  const ext = contentType === "image/png" ? "png"
            : contentType === "image/jpeg" ? "jpg" : "pdf";
  const key = \`uploads/\${new Date().getFullYear()}/\${randomUUID()}.\${ext}\`;

  // key: server-minted, opaque, outside any webroot.
  // filename: stored as metadata for Content-Disposition on download.
  const record = await files.createPending({ key, filename, contentType, size });
  res.status(201).json({ id: record.id, key });
});`,
      note:
        "The uploaded file's name and type are attacker input. Minting an opaque key and storing outside the webroot removes path traversal, double-extension execution, and collisions in one move — the original filename survives only as display metadata.",
    },
    {
      label: "Through the API vs presigned: who carries the bytes?",
      intro:
        "The same 4 MB photo uploaded two ways. Left: multipart through your API — one round trip, but your server streams every byte. Right: the presigned flow — your API authorizes, object storage does the transfer.",
      php: `# Multipart through the API — server in the middle
POST /api/photos HTTP/1.1
Content-Type: multipart/form-data; boundary=----x
Content-Length: 4194821

------x
Content-Disposition: form-data; name="file"; filename="cat.png"
Content-Type: image/png

<4 MB of bytes streamed THROUGH your API server>
------x--

HTTP/1.1 201 Created
{"id":"ph_91","url":"/photos/ph_91"}

# Cost: your process holds sockets + memory for the
# whole transfer; 200 concurrent uploads = capacity planning.`,
      ts: `# Presigned flow — API decides, storage transfers
POST /api/uploads HTTP/1.1              # 1. authorize (tiny JSON)
{"filename":"cat.png","contentType":"image/png","size":4194821}

HTTP/1.1 201 Created
{"key":"uploads/2026/9f3ac1d2.png",
 "uploadUrl":"https://bucket.s3.example/uploads/2026/9f3ac1d2.png?sig=...&expires=...",
 "expiresAt":"2026-07-07T12:15:00Z"}

PUT https://bucket.s3.example/...?sig=... # 2. bytes go DIRECT to storage
Content-Type: image/png
<4 MB of bytes — never touch your API>

HTTP/1.1 200 OK

POST /api/uploads/9f3ac1d2/complete     # 3. confirm; API verifies the
HTTP/1.1 200 OK                          #    object, flips PENDING -> READY
{"id":"ph_91","status":"ready"}`,
      note:
        "Three round trips instead of one, but your API only ever handles small JSON — transfer capacity scales with the storage provider. The pending/confirm step exists because clients abandon uploads; a janitor expires stale PENDING records.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "Validating type: trusting the header vs sniffing the bytes",
      intro:
        "A file arrived claiming to be image/png. One handler believes the claim; the other checks the magic bytes before marking the file usable.",
      php: `// naive confirm step — the claim is the check
app.post("/api/uploads/:key/complete", async (req, res) => {
  const file = await files.findPending(req.params.key);

  // The stored contentType came from the client's request.
  // A .html file full of <script> uploaded as "image/png"
  // sails through — and later gets served from our origin.
  await files.markReady(file.id);
  res.json({ status: "ready" });
});`,
      ts: `// confirm step that sniffs magic bytes
const MAGIC: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
};

app.post("/api/uploads/:key/complete", async (req, res) => {
  const file = await files.findPending(req.params.key);
  const head = await storage.readBytes(file.key, 0, 8); // first bytes only

  const magic = MAGIC[file.contentType];
  const genuine = magic.every((b, i) => head[i] === b);
  if (!genuine) {
    await storage.delete(file.key);
    return res.status(422).json({ title: "File content does not match declared type" });
  }
  await files.markReady(file.id);
  res.json({ status: "ready" });
});`,
      note:
        "Declared Content-Type is a promise, not a fact — content sniffing the first bytes catches the HTML-disguised-as-PNG trick. Serve downloads with nosniff and Content-Disposition: attachment as the second layer.",
      leftLang: "ts",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "A presigned-upload flow in miniature: authorize (validate type + size, mint an expiring toy-signed URL), then 'upload' against it. The signature is illustrative — real presigning uses the storage provider's SDK — but the decision points are the real ones. Predict which of the five attempts succeed.",
    code: `// Presigned uploads, simulated: the API authorizes, "storage" verifies.
// Toy signature — real code uses the storage SDK's presigner.

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const URL_TTL_SECONDS = 900;       // 15 minutes

function toySign(secret: string, message: string): string {
  let h = 2166136261;
  const input = secret + "|" + message;
  for (let i = 0; i < input.length; i++) {
    h = ((h ^ input.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h.toString(16);
}

const SECRET = "storage_signing_key";
let nextId = 1;

interface PresignedUpload {
  key: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;  // unix seconds
  signature: string;  // covers key + type + size cap + expiry
}

function createPresignedUpload(
  req: { filename: string; contentType: string; size: number },
  now: number
): { status: number; upload?: PresignedUpload; problem?: string } {
  if (!ALLOWED_TYPES.has(req.contentType)) {
    return { status: 422, problem: "unsupported type " + req.contentType };
  }
  if (req.size > MAX_BYTES) {
    return { status: 413, problem: "Content Too Large (max 5 MB)" };
  }
  // Opaque server-minted key — the client's filename is metadata only.
  const key = "uploads/2026/file-" + String(nextId++).padStart(4, "0");
  const expiresAt = now + URL_TTL_SECONDS;
  const signature = toySign(SECRET, key + "|" + req.contentType + "|" + MAX_BYTES + "|" + expiresAt);
  return { status: 201, upload: { key, contentType: req.contentType, maxBytes: MAX_BYTES, expiresAt, signature } };
}

// "Object storage" checking a PUT against the signed policy:
function storagePut(u: PresignedUpload, actualBytes: number, now: number): string {
  const expected = toySign(SECRET, u.key + "|" + u.contentType + "|" + u.maxBytes + "|" + u.expiresAt);
  if (expected !== u.signature) return "403 signature invalid (policy tampered)";
  if (now > u.expiresAt) return "403 URL expired";
  if (actualBytes > u.maxBytes) return "400 exceeds signed size cap";
  return "200 stored as " + u.key;
}

const now = 1_767_800_000;

// 1. A well-behaved PNG upload.
const ok = createPresignedUpload({ filename: "cat.png", contentType: "image/png", size: 2_000_000 }, now);
console.log("authorize png   ->", ok.status, ok.upload ? ok.upload.key : ok.problem);
console.log("upload png      ->", storagePut(ok.upload!, 2_000_000, now + 5));

// 2. Wrong type: rejected before any bytes move.
const exe = createPresignedUpload({ filename: "tool.exe", contentType: "application/x-msdownload", size: 1_000 }, now);
console.log("authorize exe   ->", exe.status, exe.problem);

// 3. Declared size over the cap: 413 at authorization time.
const big = createPresignedUpload({ filename: "video.pdf", contentType: "application/pdf", size: 50_000_000 }, now);
console.log("authorize 50MB  ->", big.status, big.problem);

// 4. Valid URL used too late: storage refuses without asking the API.
const slow = createPresignedUpload({ filename: "scan.pdf", contentType: "application/pdf", size: 100_000 }, now);
console.log("upload expired  ->", storagePut(slow.upload!, 100_000, now + 2 * 3600));

// 5. Lied at authorization (small size), sent more bytes than signed for.
const liar = createPresignedUpload({ filename: "small.jpg", contentType: "image/jpeg", size: 10_000 }, now);
console.log("upload oversize ->", storagePut(liar.upload!, 9_000_000, now + 5));`,
  },

  keyPoints: [
    "Multipart through the API is simplest but your server carries every byte — cap sizes and answer `413 Content Too Large`; raw-body PUT is the clean single-file variant with the same cost.",
    "Presigned URLs split authorization from transfer: the API validates and mints a short-lived signed URL plus a PENDING record; the client uploads directly to object storage; a confirm step verifies and flips the record to READY.",
    "The pending/confirm dance needs a janitor — clients abandon uploads, so PENDING records must expire.",
    "Filename and Content-Type in an upload are client input: whitelist declared types, then verify by sniffing magic bytes before marking the file usable.",
    "Store under server-minted opaque keys outside any webroot; keep the user's filename only as metadata for `Content-Disposition` — this kills path traversal, double-extension execution, and collisions at once.",
    "Serve downloads defensively: signed download URLs or a cookieless domain, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.",
  ],

  interview: [
    {
      q: "How would you design file uploads for an API that needs to handle large files at scale?",
      a: "Presigned URLs. The client asks my API for permission — `POST /uploads` with declared filename, content type, and size; the API validates against a whitelist and size cap, creates a PENDING file record with a server-minted opaque key, and returns a short-lived signed upload URL. The client PUTs the bytes directly to object storage, which enforces the signed constraints without calling me. A confirm endpoint then verifies the object — real size, magic bytes — and flips the record to READY. My API only ever handles small JSON, so upload throughput scales with the storage provider rather than my servers. The trade-offs I'd name: three round trips, bucket CORS configuration, and needing a janitor to expire abandoned PENDING records. For small things like avatars, multipart straight through the API with a hard size limit is perfectly defensible — simpler beats scalable when files are tiny.",
    },
    {
      q: "What validation does an upload endpoint need beyond checking the file extension?",
      a: "Extension checking is close to worthless — both the filename and the declared Content-Type come from the client, so I treat them like `$_GET` in PHP: pure attacker input. First, whitelist the declared type at authorization time; second, verify the actual content by sniffing magic bytes — `89 50 4E 47` for PNG, `FF D8 FF` for JPEG — before the file becomes usable, deleting mismatches. Third, enforce size caps at every layer: reject declared size early with 413, and enforce a hard limit during transfer so the declaration can't be a lie. Fourth, never store under the client's filename: mint an opaque key outside the webroot, keeping the original name only as download metadata. And on the way out, serve with `nosniff` and `Content-Disposition: attachment` so a polyglot file can't execute as HTML in my origin.",
    },
    {
      q: "In a presigned-URL flow, why does the API need a confirm/complete step at all?",
      a: "Because after handing out the URL, the API is blind: it doesn't know whether the upload happened, was abandoned, or was completed with content that violates the promises made at authorization. The confirm step closes the loop — the client says 'done', and the API checks the object actually exists in storage, verifies its real size against what was declared, and sniffs its magic bytes against the declared type before flipping the PENDING record to READY. Nothing references a file that isn't READY, so half-uploaded or lying uploads never surface in the product. It also gives a natural cleanup boundary: a scheduled job deletes PENDING records — and their orphaned objects — older than the URL's lifetime.",
    },
  ],

  quiz: [
    {
      question:
        "What is the primary architectural benefit of presigned upload URLs over multipart uploads through the API?",
      options: [
        "They make uploads complete in a single round trip",
        "File bytes go directly to object storage, so the API server never carries the transfer load",
        "They remove the need to validate file types",
        "They encrypt files automatically",
      ],
      answerIndex: 1,
      explain:
        "Presigning separates the authorization decision (your API, small JSON) from the byte transfer (object storage, which verifies the signed constraints itself). It actually costs MORE round trips — authorize, upload, confirm — and validation is still required; the win is that transfer capacity scales with the storage provider.",
    },
    {
      question:
        "PHP's move_uploaded_file($_FILES['f']['tmp_name'], '/var/www/html/uploads/' . $_FILES['f']['name']) is dangerous because...",
      options: [
        "move_uploaded_file is deprecated in modern PHP",
        "tmp_name may not exist on all platforms",
        "the client-controlled filename enables path traversal and executable uploads into the webroot",
        "it only works for files under 2 MB",
      ],
      answerIndex: 2,
      explain:
        "$_FILES['f']['name'] is client input: '../../cron.d/x' traverses out of the directory, and 'shell.php' becomes an executable script inside the webroot. Server-minted opaque keys stored outside the webroot eliminate the whole class.",
    },
    {
      question: "An upload declares Content-Type: image/png. What should the server do before treating the file as an image?",
      options: [
        "Nothing — the Content-Type header is authoritative",
        "Check that the filename ends in .png",
        "Verify the file's magic bytes (89 50 4E 47) match the declared type",
        "Re-encode the header to lowercase",
      ],
      answerIndex: 2,
      explain:
        "The declared type is a client claim; the filename is too. Content sniffing the first bytes is the check the client can't fake cheaply — an HTML file uploaded as 'image/png' fails it, which matters because that file served from your origin is stored XSS.",
    },
    {
      question: "Which status code does RFC 9110 assign to a request body exceeding the server's size limit?",
      options: [
        "406 Not Acceptable",
        "413 Content Too Large",
        "422 Unprocessable Content",
        "507 Insufficient Storage",
      ],
      answerIndex: 1,
      explain:
        "413 is the size-limit rejection — RFC 9110 renamed it from 'Payload Too Large' to 'Content Too Large'. 422 is for well-formed bodies that fail semantic validation; 406 is content negotiation; 507 is a WebDAV server-side storage condition.",
    },
  ],
};

export default lesson;

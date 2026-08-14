// ─────────────────────────────────────────────────────────────────────────
// AI Tutor request handler.
//
// The browser must never hold an API key. This handler receives the chat
// request, calls Claude server-side with the key resolved from the
// environment (ANTHROPIC_API_KEY) or an `ant auth login` session, and streams
// the answer text back. The key stays on the server.
//
// Plain ESM JavaScript with no build step, so the same handler runs in three
// places without drift: the Vite dev server, `vite preview`, and the
// production server in `server/index.mjs`. It depends only on Node builtins
// and `@anthropic-ai/sdk`, which is already a runtime dependency.
// ─────────────────────────────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 700;

const NO_CREDENTIALS =
  "No Claude credentials found. Set ANTHROPIC_API_KEY in your environment (or run `ant auth login`), then restart the server.";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function buildSystem(course, lesson) {
  const audience =
    course?.audience ?? "a developer working through this course";
  const persona = course?.persona ?? "";
  return `You are an expert, friendly tutor for the course "${course?.title ?? "this course"}". Your student is ${audience}.

Teaching rules:
- BE BRIEF. Answer in ONE short paragraph — a paragraph and a half at the absolute most. Do not pad, and do not use headings or bullet lists for a normal answer.
- Only include a code block when a concrete code example is genuinely needed to illustrate the point. If words alone suffice, use no code at all.
- ${persona}
- When the student's message contains a code snippet, focus on that snippet — briefly say what it does and WHY it's written that way, still within the length limit.
- Be clear, concrete, and encouraging. Plain explanation over theory.

The student is currently on this lesson:
Title: ${lesson?.title ?? "(unknown)"}
Part: ${lesson?.part ?? ""}
Summary: ${lesson?.summary ?? ""}

Lesson notes for your reference (may be truncated):
${(lesson?.concept ?? "").slice(0, 1800)}`;
}

export async function handleAsk(req, res) {
  try {
    const body = JSON.parse((await readBody(req)) || "{}");
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "No messages provided." }));
      return;
    }

    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    let client;
    try {
      // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
      client = new Anthropic();
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: NO_CREDENTIALS }));
      return;
    }

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystem(body.course, body.lesson),
      messages,
    });

    // Defer sending headers until the first token, so an auth/setup failure
    // (which happens before any text) can still return a clean JSON error.
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
    };
    stream.on("text", (delta) => {
      begin();
      res.write(delta);
    });

    try {
      await stream.finalMessage();
      begin();
      res.end();
    } catch (err) {
      const raw = err?.message ?? String(err);
      const friendly = /authentic|api[_ -]?key|x-api-key|credential|401/i.test(
        raw
      )
        ? NO_CREDENTIALS
        : raw;
      if (!started) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: friendly }));
      } else {
        res.write(`\n\n_[error: ${friendly}]_`);
        res.end();
      }
    }
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err?.message ?? String(err) }));
    } else {
      res.end();
    }
  }
}

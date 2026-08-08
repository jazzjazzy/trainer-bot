// Browser-side client for the AI tutor. Talks to the dev-server proxy at
// /api/ask (the key lives server-side; see vite.config.ts) and streams the
// answer text back, invoking `onText` with the full accumulated text so far.

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskBody {
  course: { title: string; audience: string; persona: string };
  lesson: { title: string; part: string; summary: string; concept: string };
  messages: AskMessage[];
}

export async function streamAsk(
  body: AskBody,
  onText: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onText(full);
  }
  return full;
}

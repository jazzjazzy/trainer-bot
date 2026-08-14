import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Handles a POST /api/ask tutor request: calls Claude server-side and streams
 * the answer back as text/plain. Never throws — failures are written to the
 * response as JSON (before the first token) or appended inline (after it).
 */
export declare function handleAsk(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void>;

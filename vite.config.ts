import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAsk } from "./server/tutor.mjs";

// ─────────────────────────────────────────────────────────────────────────
// AI Tutor proxy.
//
// The browser must never hold an API key. This dev/preview-server middleware
// mounts the shared tutor handler from `server/tutor.mjs`, which calls Claude
// server-side with the key resolved from the environment (ANTHROPIC_API_KEY)
// or an `ant auth login` session. The key stays on this machine.
//
// The production server (`server/index.mjs`, run by `npm start`) mounts the
// exact same handler, so dev and production cannot drift apart.
// ─────────────────────────────────────────────────────────────────────────

function aiTutorProxy() {
  const attach = (server: {
    middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
  }) => {
    server.middlewares.use((req, res, next) => {
      if (req.method === "POST" && req.url === "/api/ask") {
        void handleAsk(req, res);
      } else {
        next();
      }
    });
  };
  return {
    name: "ai-tutor-proxy",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

// The `typescript` package is imported into the browser to power the live
// playground (transpile TS -> JS at runtime). It references `process.env`,
// so we shim NODE_ENV for the browser bundle.
export default defineConfig({
  plugins: [react(), aiTutorProxy()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  optimizeDeps: {
    include: ["typescript"],
  },
});

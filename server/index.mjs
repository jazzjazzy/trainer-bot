// ─────────────────────────────────────────────────────────────────────────
// Production server.
//
// Serves the built SPA out of `dist/` and hosts the AI tutor endpoint at
// POST /api/ask. In development the same tutor handler is mounted as Vite
// middleware (see vite.config.ts), so dev and production share one
// implementation.
//
// Run with: npm start   (after `npm run build`)
// ─────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, normalize, extname, sep } from "node:path";
import { handleAsk } from "./tutor.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

/**
 * Resolve a URL pathname to a file inside dist/, or null if it escapes.
 * Vite emits content-hashed asset filenames, so anything under /assets/ is
 * safe to cache forever; everything else must revalidate.
 */
function resolveInDist(pathname) {
  const decoded = decodeURIComponent(pathname);
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = join(DIST, rel);
  if (full !== DIST.slice(0, -1) && !full.startsWith(DIST)) return null;
  return full;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

async function serveFile(res, filePath, { immutable = false } = {}) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("not a file");
  const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "content-length": info.size,
    "cache-control": immutable
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/ask") {
    if (req.method !== "POST") {
      send(res, 405, "Method Not Allowed", { allow: "POST" });
      return;
    }
    await handleAsk(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed");
    return;
  }

  const target = resolveInDist(url.pathname);
  if (target === null) {
    send(res, 403, "Forbidden");
    return;
  }

  const isAsset = url.pathname.startsWith("/assets/");
  try {
    await serveFile(res, target, { immutable: isAsset });
    return;
  } catch {
    // fall through to the SPA entry point
  }

  // Routing is hash-based (#/course/lesson), so real paths rarely miss — but
  // serve index.html for anything that isn't a built asset, and let the app
  // decide. A miss under /assets/ is a genuine 404.
  if (isAsset) {
    send(res, 404, "Not Found");
    return;
  }
  try {
    await serveFile(res, join(DIST, "index.html"));
  } catch {
    send(
      res,
      500,
      "dist/index.html not found — run `npm run build` before starting the server."
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[devcourses] serving ${DIST} on http://${HOST}:${PORT}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "[devcourses] AI tutor: ANTHROPIC_API_KEY present"
      : "[devcourses] AI tutor: no ANTHROPIC_API_KEY — /api/ask will return a setup message"
  );
});

// Docker/Coolify stop the container with SIGTERM; close cleanly so in-flight
// tutor streams are not cut mid-token.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[devcourses] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

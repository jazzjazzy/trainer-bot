// Verifies every section of every course: extracts the lesson object, runs its
// playground code through the same transpile+execute pipeline the app uses, and
// checks quiz/data integrity. Run with: node scripts/verify-content.mjs
import ts from "typescript";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

let havePython = true;
try {
  execFileSync("python3", ["--version"], { stdio: "ignore" });
} catch {
  havePython = false;
}

let havePhp = true;
try {
  execFileSync("php", ["--version"], { stdio: "ignore" });
} catch {
  havePhp = false;
}

const COURSES = new URL("../src/courses/", import.meta.url).pathname;

// Collect NN-*.ts section files across every course folder.
const courseDirs = readdirSync(COURSES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const files = [];
for (const course of courseDirs) {
  const secDir = join(COURSES, course, "sections");
  let entries;
  try {
    entries = readdirSync(secDir);
  } catch {
    continue; // course folder without a sections/ dir
  }
  for (const name of entries.filter((f) => /^\d.*\.ts$/.test(f)).sort()) {
    files.push({ course, name, full: join(secDir, name), label: `${course}/${name}` });
  }
}

const tmp = mkdtempSync(join(tmpdir(), "tsverify-"));

function transpile(code) {
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
}

async function runSnippet(code) {
  const js = transpile(code);
  const logs = [];
  const fakeConsole = {
    log: (...a) => logs.push(a.join(" ")),
    info: (...a) => logs.push(a.join(" ")),
    warn: (...a) => logs.push(a.join(" ")),
    error: (...a) => logs.push(a.join(" ")),
    debug: (...a) => logs.push(a.join(" ")),
  };
  const pending = new Set();
  const doneByHandle = new Map();
  const sandboxSetTimeout = (cb, ms = 0, ...args) => {
    let done;
    const p = new Promise((r) => (done = r));
    pending.add(p);
    const settle = () => {
      pending.delete(p);
      done();
    };
    const handle = setTimeout(
      () => {
        try {
          if (typeof cb === "function") cb(...args);
        } finally {
          doneByHandle.delete(handle);
          settle();
        }
      },
      Math.min(ms, 2000),
      ...args
    );
    doneByHandle.set(handle, settle);
    return handle;
  };
  // A cleared timer must resolve its pending promise too, or debounce-style
  // code (clearTimeout + reschedule) would leave the drain loop hanging.
  const sandboxClearTimeout = (handle) => {
    clearTimeout(handle);
    const settle = doneByHandle.get(handle);
    if (settle) {
      doneByHandle.delete(handle);
      settle();
    }
  };
  const fn = new Function(
    "console",
    "setTimeout",
    "clearTimeout",
    `"use strict"; return (async () => {\n${js}\n})();`
  );
  await fn(fakeConsole, sandboxSetTimeout, sandboxClearTimeout);
  let guard = 0;
  while (pending.size > 0 && guard++ < 500) await Promise.all([...pending]);
  return logs;
}

/** Reject if a snippet hasn't finished within the ceiling — prevents one bad
 *  playground (e.g. an un-drained timer) from hanging the whole verify run. */
function runSnippetGuarded(code) {
  return Promise.race([
    runSnippet(code),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("snippet timed out (8s)")), 8000)
    ),
  ]);
}

let failures = 0;
let warnings = 0;

for (const file of files) {
  const src = readFileSync(file.full, "utf8");
  const label = file.label.padEnd(52);

  let lesson;
  try {
    const js = transpile(src);
    const out = join(tmp, file.full.replace(/[/\\]/g, "_").replace(/\.ts$/, ".mjs"));
    writeFileSync(out, js);
    lesson = (await import(pathToFileURL(out).href)).default;
  } catch (e) {
    console.log(`✖ ${label} could not load module: ${e.message}`);
    failures++;
    continue;
  }

  const problems = [];

  for (const k of [
    "id", "slug", "title", "part", "summary", "concept",
    "comparisons", "playground", "keyPoints", "interview", "quiz",
  ]) {
    if (lesson[k] === undefined) problems.push(`missing field: ${k}`);
  }
  if (!Array.isArray(lesson.comparisons) || lesson.comparisons.length < 2)
    problems.push("needs >=2 comparisons");
  if (!Array.isArray(lesson.interview) || lesson.interview.length < 2)
    problems.push("needs >=2 interview Q&A");

  for (const [i, q] of (lesson.quiz || []).entries()) {
    if (!Array.isArray(q.options) || q.options.length < 2)
      problems.push(`quiz ${i + 1}: <2 options`);
    if (
      typeof q.answerIndex !== "number" ||
      q.answerIndex < 0 ||
      q.answerIndex >= (q.options?.length ?? 0)
    )
      problems.push(`quiz ${i + 1}: answerIndex out of range`);
    if (!q.explain) problems.push(`quiz ${i + 1}: missing explain`);
  }

  const lang = lesson.playground.lang ?? "typescript";
  let logs = [];
  if (lang === "typescript") {
    try {
      const codeNoComments = lesson.playground.code
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      if (/(^|\n)\s*(import|export)\b/.test(codeNoComments))
        problems.push("playground has import/export (must be self-contained)");
      logs = await runSnippetGuarded(lesson.playground.code);
      if (logs.length === 0) {
        warnings++;
        problems.push("WARN: playground produced no console output");
      }
    } catch (e) {
      problems.push(`playground threw at runtime: ${e.message}`);
    }
  } else if (lang === "php") {
    // Execute with the system PHP CLI when available and compare against the
    // declared output; otherwise fall back to shape checks.
    if (!/<\?php/.test(lesson.playground.code))
      problems.push("php playground missing <?php");
    if (!lesson.playground.output || !lesson.playground.output.trim())
      problems.push("php playground missing expected output");
    logs = (lesson.playground.output || "").trim()
      ? lesson.playground.output.trim().split("\n")
      : [];
    if (havePhp && lesson.playground.output) {
      const script = join(tmp, `${file.label.replace(/[/\\]/g, "_")}.php`);
      writeFileSync(script, lesson.playground.code);
      try {
        // Deprecations off: older-PHP teaching snippets may warn on a new CLI.
        const actual = execFileSync(
          "php",
          ["-d", "error_reporting=E_ALL & ~E_DEPRECATED", script],
          { encoding: "utf8", timeout: 10000 }
        );
        if (actual.trim() !== lesson.playground.output.trim())
          problems.push(
            `php output mismatch:\n--- declared ---\n${lesson.playground.output.trim()}\n--- actual ---\n${actual.trim()}`
          );
      } catch (e) {
        problems.push(`php playground failed to run: ${e.message}`);
      }
    }
  } else if (lang === "python") {
    // Execute with the system CPython when available and compare against the
    // declared output; otherwise fall back to shape checks.
    if (!lesson.playground.output || !lesson.playground.output.trim())
      problems.push("python playground missing expected output");
    logs = (lesson.playground.output || "").trim()
      ? lesson.playground.output.trim().split("\n")
      : [];
    if (havePython && lesson.playground.output) {
      const script = join(tmp, `${file.label.replace(/[/\\]/g, "_")}.py`);
      writeFileSync(script, lesson.playground.code);
      try {
        const actual = execFileSync("python3", [script], {
          encoding: "utf8",
          timeout: 10000,
        });
        if (actual.trim() !== lesson.playground.output.trim())
          problems.push(
            `python output mismatch:\n--- declared ---\n${lesson.playground.output.trim()}\n--- actual ---\n${actual.trim()}`
          );
      } catch (e) {
        problems.push(`python playground failed to run: ${e.message}`);
      }
    }
  } else if (lang === "svelte") {
    // Can't compile Svelte here — validate shape + precomputed output.
    if (!/<script/.test(lesson.playground.code))
      problems.push("svelte playground missing <script> block");
    if (!lesson.playground.output || !lesson.playground.output.trim())
      problems.push("svelte playground missing expected output");
    logs = (lesson.playground.output || "").trim()
      ? lesson.playground.output.trim().split("\n")
      : [];
  } else if (["tsx", "jsx", "bash", "yaml", "sql"].includes(lang)) {
    // Read-and-predict languages: just require the precomputed output.
    if (!lesson.playground.output || !lesson.playground.output.trim())
      problems.push(`${lang} playground missing expected output`);
    logs = (lesson.playground.output || "").trim()
      ? lesson.playground.output.trim().split("\n")
      : [];
  } else {
    problems.push(`unknown playground lang: ${lang}`);
  }

  if (problems.filter((p) => !p.startsWith("WARN")).length > 0) {
    failures++;
    console.log(`✖ ${label} ${problems.join(" | ")}`);
  } else if (problems.length > 0) {
    console.log(`▲ ${label} ${problems.join(" | ")}`);
  } else {
    console.log(`✓ ${label} playground ran, ${logs.length} log line(s)`);
  }
}

console.log(
  `\n${files.length} sections across ${courseDirs.length} course(s) · ${failures} failure(s) · ${warnings} warning(s)`
);
process.exit(failures > 0 ? 1 : 0);

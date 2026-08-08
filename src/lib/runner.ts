import * as ts from "typescript";

export interface RunResult {
  /** Lines captured from console.* calls, in order. */
  logs: string[];
  /** A transpile or runtime error message, if anything went wrong. */
  error?: string;
}

/** Transpile TypeScript source to runnable ES2020 JavaScript. */
export function transpile(code: string): string {
  const out = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      // Keep output close to the source so it's readable if inspected.
      removeComments: false,
    },
  });
  return out.outputText;
}

function format(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === "bigint" ? `${v}n` : v),
      2
    );
  } catch {
    return String(value);
  }
}

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
/** Delays are clamped so async demos stay snappy. */
const MAX_DELAY_MS = 2000;
/** Whole-run ceiling, so an infinite loop / long timer can't hang the UI. */
const RUN_TIMEOUT_MS = 6000;

/**
 * Transpile and execute user TypeScript in the page, capturing console output.
 *
 * The code is wrapped in an async IIFE so top-level `await` works (lesson 24).
 * `setTimeout` is sandboxed so that output from *un-awaited* async work (e.g.
 * `main()` fired without await to demonstrate non-blocking) is still captured:
 * after the IIFE settles we drain any pending timers before reporting. No real
 * imports are available — samples must be self-contained.
 */
export async function runCode(code: string): Promise<RunResult> {
  const logs: string[] = [];
  const sink =
    (prefix: string) =>
    (...args: unknown[]) =>
      logs.push((prefix ? prefix + " " : "") + args.map(format).join(" "));

  const fakeConsole = {
    log: sink(""),
    info: sink("ℹ"),
    warn: sink("⚠"),
    error: sink("✖"),
    debug: sink("›"),
  };

  // Track scheduled timers so trailing async logs can be flushed. A cleared
  // timer must also resolve its pending promise — otherwise code that debounces
  // (clearTimeout + re-schedule) leaves a promise that never settles and the
  // drain loop below never finishes.
  const pending = new Set<Promise<void>>();
  const doneByHandle = new Map<unknown, () => void>();
  const sandboxSetTimeout = (
    cb: (...a: unknown[]) => void,
    ms = 0,
    ...args: unknown[]
  ) => {
    let done!: () => void;
    const p = new Promise<void>((r) => (done = r));
    pending.add(p);
    const settle = () => {
      pending.delete(p);
      done();
    };
    const handle = realSetTimeout(
      () => {
        try {
          if (typeof cb === "function") cb(...args);
        } catch (e) {
          logs.push("✖ " + format(e));
        } finally {
          doneByHandle.delete(handle);
          settle();
        }
      },
      Math.min(ms, MAX_DELAY_MS),
      ...args
    );
    doneByHandle.set(handle, settle);
    return handle;
  };
  const sandboxClearTimeout = (handle: unknown) => {
    realClearTimeout(handle as Parameters<typeof realClearTimeout>[0]);
    const settle = doneByHandle.get(handle);
    if (settle) {
      doneByHandle.delete(handle);
      settle();
    }
  };

  let js: string;
  try {
    js = transpile(code);
  } catch (e) {
    return { logs, error: `Transpile error: ${(e as Error).message}` };
  }

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "console",
      "setTimeout",
      "clearTimeout",
      `"use strict"; return (async () => {\n${js}\n})();`
    );
    const settled = (async () => {
      await fn(fakeConsole, sandboxSetTimeout, sandboxClearTimeout);
      // Drain timers (and any they schedule), bounded.
      let guard = 0;
      while (pending.size > 0 && guard++ < 500) {
        await Promise.all([...pending]);
      }
    })();
    const timeout = new Promise<never>((_, reject) =>
      realSetTimeout(
        () =>
          reject(
            new Error(
              "Execution timed out — possible infinite loop or very long delay."
            )
          ),
        RUN_TIMEOUT_MS
      )
    );
    await Promise.race([settled, timeout]);
    return { logs };
  } catch (e) {
    return { logs, error: format(e) };
  }
}

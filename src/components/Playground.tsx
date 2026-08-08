import { useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { PlaygroundExample } from "../types";
import { runCode, type RunResult } from "../lib/runner";
import { useAI } from "../ai/AIContext";

interface Props {
  example: PlaygroundExample;
}

/**
 * Code playground. TypeScript runs live (Monaco type-checks + transpile-and-run).
 * Other languages (e.g. PHP) can't run in-browser, so "Run" reveals the
 * precomputed `output` instead — a read-predict-reveal interaction.
 */
export function Playground({ example }: Props) {
  const lang = example.lang ?? "typescript";
  const runnable = lang === "typescript";
  // Map to Monaco's built-in language ids where the names differ.
  const monacoLangMap: Record<string, string> = {
    svelte: "html",
    tsx: "typescript",
    jsx: "javascript",
    bash: "shell",
  };
  const editorLang = monacoLangMap[lang] ?? lang;

  const [code, setCode] = useState(example.code);
  const [result, setResult] = useState<RunResult | null>(null);
  const [expected, setExpected] = useState(false);
  const [running, setRunning] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const { openAsk } = useAI();

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    if (!runnable) return;
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution:
        monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      strict: true,
    });
  };

  async function handleRun() {
    if (!runnable) {
      setExpected(true);
      setResult({
        logs: example.output ? example.output.replace(/\n+$/, "").split("\n") : [],
      });
      return;
    }
    setRunning(true);
    const current = editorRef.current?.getValue() ?? code;
    const res = await runCode(current);
    setExpected(false);
    setResult(res);
    setRunning(false);
  }

  function handleReset() {
    setCode(example.code);
    editorRef.current?.setValue(example.code);
    setResult(null);
  }

  return (
    <div className="playground">
      {example.intro && <p className="playground-intro">{example.intro}</p>}
      <div className="playground-editor">
        <Editor
          height="280px"
          language={editorLang}
          theme="vs-dark"
          value={code}
          onChange={(v) => setCode(v ?? "")}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
      <div className="playground-toolbar">
        <button className="btn btn-run" onClick={handleRun} disabled={running}>
          {running ? "Running…" : runnable ? "▶ Run" : "▶ Show output"}
        </button>
        <button className="btn btn-ghost" onClick={handleReset}>
          Reset
        </button>
        <button
          className="btn btn-ai"
          onClick={() =>
            openAsk({
              question:
                "Explain what this code does and why, step by step.",
              lang,
              code: editorRef.current?.getValue() ?? code,
            })
          }
        >
          ✨ Ask AI
        </button>
        <span className="playground-hint">
          {runnable
            ? "Edit the code, then Run. Type errors show inline as you type."
            : "Read it, predict the result, then reveal the output."}
        </span>
      </div>
      {result && (
        <div className="console">
          <div className="console-header">
            {expected ? "Expected output" : "Console output"}
          </div>
          {result.logs.length === 0 && !result.error && (
            <div className="console-empty">
              {runnable ? (
                <>
                  (no output — add a <code>console.log(...)</code>)
                </>
              ) : (
                "(no output)"
              )}
            </div>
          )}
          {result.logs.map((line, i) => (
            <pre className="console-line" key={i}>
              {line}
            </pre>
          ))}
          {result.error && (
            <pre className="console-line console-error">{result.error}</pre>
          )}
        </div>
      )}
    </div>
  );
}

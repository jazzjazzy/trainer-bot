import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Course, Lesson } from "../types";
import { Markdown } from "../components/Markdown";
import { streamAsk, type AskMessage } from "./aiClient";

/** A seed for opening the tutor pre-loaded with a question (and optional code). */
export interface AskSeed {
  question?: string;
  code?: string;
  lang?: string;
}

interface CourseTutorCtx {
  id: string;
  title: string;
  audience: string;
  persona: string;
}

interface AIApi {
  /** Open the tutor. With a seed, immediately ask about it. */
  openAsk: (seed?: AskSeed) => void;
  /** Tell the tutor which course the student is in (null on the catalog). */
  setCourse: (course: Course | null) => void;
  /** Tell the tutor which lesson the student is on (sets its context). */
  setLesson: (lesson: Lesson) => void;
}

const Ctx = createContext<AIApi | null>(null);

export function useAI(): AIApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAI must be used within <AIProvider>");
  return value;
}

const SUGGESTIONS = [
  "Explain this lesson simply, with a PHP comparison.",
  "What's the #1 thing a PHP dev gets wrong here?",
  "Give me a tiny real-world example.",
  "Quiz me with one tricky question on this topic.",
];

export function AIProvider({ children }: { children: ReactNode }) {
  const lessonRef = useRef<Lesson | null>(null);
  const courseRef = useRef<CourseTutorCtx | null>(null);
  const threadRef = useRef<AskMessage[]>([]);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const [hasCourse, setHasCourse] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const commitThread = (next: AskMessage[]) => {
    threadRef.current = next;
    rerender();
  };

  const setCourse = useCallback((course: Course | null) => {
    const prevId = courseRef.current?.id ?? null;
    const nextId = course?.id ?? null;
    if (prevId !== nextId) {
      courseRef.current = course
        ? {
            id: course.id,
            title: course.title,
            audience: course.tutor.audience,
            persona: course.tutor.persona,
          }
        : null;
      // Switching course (or leaving for the catalog) starts a fresh tutor.
      abortRef.current?.abort();
      commitThread([]);
      setError(null);
      if (!course) setOpen(false);
    }
    setHasCourse(!!course);
  }, []);

  const setLesson = useCallback((lesson: Lesson) => {
    if (lessonRef.current?.slug !== lesson.slug) {
      lessonRef.current = lesson;
      // Fresh tutor context when the student moves to a new lesson.
      abortRef.current?.abort();
      commitThread([]);
      setError(null);
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;
    setError(null);
    setInput("");

    const base: AskMessage[] = [
      ...threadRef.current,
      { role: "user", content: trimmed },
    ];
    commitThread([...base, { role: "assistant", content: "" }]);
    busyRef.current = true;
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    const lesson = lessonRef.current;
    const course = courseRef.current;

    try {
      await streamAsk(
        {
          course: {
            title: course?.title ?? "",
            audience: course?.audience ?? "",
            persona: course?.persona ?? "",
          },
          lesson: {
            title: lesson?.title ?? "",
            part: lesson?.part ?? "",
            summary: lesson?.summary ?? "",
            concept: lesson?.concept ?? "",
          },
          messages: base,
        },
        (full) => {
          const next = threadRef.current.slice();
          next[next.length - 1] = { role: "assistant", content: full };
          commitThread(next);
        },
        ac.signal
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setError((e as Error).message);
      }
      // Drop a trailing empty assistant bubble.
      const next = threadRef.current.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && !last.content) next.pop();
      commitThread(next);
    } finally {
      busyRef.current = false;
      setBusy(false);
      abortRef.current = null;
    }
  }, []);

  const openAsk = useCallback(
    (seed?: AskSeed) => {
      setOpen(true);
      if (seed && (seed.question || seed.code)) {
        const q =
          seed.question ??
          "Why do we do it this way? Walk me through what's happening here.";
        const content = seed.code
          ? `${q}\n\n\`\`\`${seed.lang ?? "typescript"}\n${seed.code}\n\`\`\``
          : q;
        void send(content);
      }
    },
    [send]
  );

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  // Dock the tutor as a right-hand column: reflow the page instead of overlaying.
  useEffect(() => {
    document.body.classList.toggle("ai-open", open);
    return () => document.body.classList.remove("ai-open");
  }, [open]);

  const thread = threadRef.current;
  const lesson = lessonRef.current;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <Ctx.Provider value={{ openAsk, setCourse, setLesson }}>
      {children}

      {hasCourse && !open && (
        <button
          className="ai-fab"
          onClick={() => setOpen(true)}
          aria-label="Ask the AI tutor"
        >
          <span className="ai-fab-spark">✨</span> Ask AI
        </button>
      )}

      {hasCourse && (
      <aside className={`ai-drawer ${open ? "open" : ""}`} aria-label="AI tutor">
        <header className="ai-head">
          <div>
            <div className="ai-title">
              <span className="ai-fab-spark">✨</span> AI Tutor
            </div>
            <div className="ai-sub">
              {lesson ? `Lesson: ${lesson.title}` : "Ask anything in this course"}
            </div>
          </div>
          <div className="ai-head-actions">
            {thread.length > 0 && (
              <button
                className="ai-icon-btn"
                onClick={() => {
                  abortRef.current?.abort();
                  commitThread([]);
                  setError(null);
                }}
                title="New conversation"
              >
                ⟳
              </button>
            )}
            <button
              className="ai-icon-btn"
              onClick={() => setOpen(false)}
              title="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="ai-body" ref={scrollRef}>
          {thread.length === 0 && (
            <div className="ai-empty">
              <p>
                Ask about anything in this lesson — or hit{" "}
                <strong>✨ Ask AI</strong> on any code example to get it
                explained.
              </p>
              <div className="ai-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="ai-chip"
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((m, i) => (
            <div key={i} className={`ai-msg ai-${m.role}`}>
              {m.role === "assistant" ? (
                m.content ? (
                  <Markdown>{m.content}</Markdown>
                ) : (
                  <span className="ai-typing">thinking…</span>
                )
              ) : (
                <div className="ai-user-text">{m.content}</div>
              )}
            </div>
          ))}

          {error && (
            <div className="ai-error">
              <strong>Couldn't reach the tutor.</strong> {error}
            </div>
          )}
        </div>

        <footer className="ai-foot">
          <textarea
            className="ai-input"
            placeholder="Ask a follow-up… (Enter to send)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
          />
          {busy ? (
            <button
              className="btn btn-ghost ai-send"
              onClick={() => abortRef.current?.abort()}
            >
              Stop
            </button>
          ) : (
            <button
              className="btn btn-run ai-send"
              onClick={() => void send(input)}
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </footer>
        <div className="ai-foot-note">Powered by Claude (Haiku 4.5)</div>
      </aside>
      )}
    </Ctx.Provider>
  );
}

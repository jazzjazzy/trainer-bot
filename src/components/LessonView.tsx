import type { ComparisonConfig, Lesson } from "../types";
import { Markdown } from "./Markdown";
import { PhpVsTs } from "./PhpVsTs";
import { Playground } from "./Playground";
import { Quiz } from "./Quiz";
import { InterviewPrep } from "./InterviewPrep";
import { useAI } from "../ai/AIContext";

interface Props {
  courseId: string;
  comparison: ComparisonConfig;
  lesson: Lesson;
  total: number;
  isDone: boolean;
  onToggleDone: (done: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="lesson-section">
      <div className="section-head">
        <span className="section-icon">{icon}</span>
        <h2 className="section-title">{title}</h2>
        {hint && <span className="section-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function LessonView({
  courseId,
  comparison,
  lesson,
  total,
  isDone,
  onToggleDone,
  onPrev,
  onNext,
}: Props) {
  const { openAsk } = useAI();
  return (
    <article className="lesson">
      <header className="lesson-header">
        <div className="lesson-eyebrow">
          <span className="lesson-part">{lesson.part}</span>
          <span className="lesson-counter">
            Section {lesson.id} of {total}
          </span>
          <span className="lesson-time">~{lesson.estMinutes} min</span>
        </div>
        <h1 className="lesson-title">{lesson.title}</h1>
        <p className="lesson-summary">{lesson.summary}</p>
        <button
          className="ask-btn ask-btn-lesson"
          onClick={() =>
            openAsk({
              question: `Give me a clear, beginner-friendly overview of "${lesson.title}" for a developer with 20 years of PHP experience. What's the key idea and the closest PHP parallel?`,
            })
          }
        >
          ✨ Ask AI about this lesson
        </button>
      </header>

      <Section icon="📘" title="Concept">
        <Markdown>{lesson.concept}</Markdown>
      </Section>

      <Section
        icon="🔀"
        title={`${comparison.leftLabel} → ${comparison.rightLabel}`}
        hint="What you know, beside what's new"
      >
        <PhpVsTs items={lesson.comparisons} config={comparison} />
      </Section>

      <Section icon="🧪" title="Live Playground" hint="Edit & run real TypeScript">
        <Playground example={lesson.playground} />
      </Section>

      <Section icon="🎯" title="Key Points">
        <ul className="key-points">
          {lesson.keyPoints.map((k, i) => (
            <li key={i}>
              <Markdown>{k}</Markdown>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="💼" title="Interview Prep" hint="Click a question to reveal">
        <InterviewPrep items={lesson.interview} />
      </Section>

      <Section icon="✅" title="Quiz">
        <Quiz courseId={courseId} slug={lesson.slug} questions={lesson.quiz} />
      </Section>

      <footer className="lesson-footer">
        <label className="done-toggle">
          <input
            type="checkbox"
            checked={isDone}
            onChange={(e) => onToggleDone(e.target.checked)}
          />
          Mark this section complete
        </label>
        <div className="lesson-nav">
          <button className="btn btn-ghost" onClick={onPrev} disabled={!onPrev}>
            ← Previous
          </button>
          <button className="btn btn-run" onClick={onNext} disabled={!onNext}>
            Next →
          </button>
        </div>
      </footer>
    </article>
  );
}

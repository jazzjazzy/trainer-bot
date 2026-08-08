import { useMemo, useRef, useState } from "react";
import type { QuizQuestion } from "../types";
import { getQuizAttempt, setQuizAttempt } from "../lib/progress";

interface Props {
  courseId: string;
  slug: string;
  questions: QuizQuestion[];
}

/** Multiple-choice knowledge check — answers + result persist per lesson. */
export function Quiz({ courseId, slug, questions }: Props) {
  // Restore any saved attempt for this lesson (persists across visits/sessions).
  const saved = useMemo(
    () => getQuizAttempt(courseId, slug),
    [courseId, slug]
  );

  const [answers, setAnswersState] = useState<(number | null)[]>(() =>
    saved && saved.answers.length === questions.length
      ? saved.answers
      : questions.map(() => null)
  );
  const [submitted, setSubmitted] = useState(() => saved?.submitted ?? false);

  // Mirror answers in a ref so rapid successive picks don't clobber each other.
  const answersRef = useRef(answers);
  function commit(next: (number | null)[], nextSubmitted: boolean) {
    answersRef.current = next;
    setAnswersState(next);
    setQuizAttempt(courseId, slug, { answers: next, submitted: nextSubmitted });
  }

  function choose(qi: number, oi: number) {
    if (submitted) return;
    const next = answersRef.current.slice();
    next[qi] = oi;
    commit(next, false);
  }

  const correct = answers.filter(
    (a, i) => a === questions[i].answerIndex
  ).length;
  const allAnswered = answers.every((a) => a !== null);

  function submit() {
    setSubmitted(true);
    setQuizAttempt(courseId, slug, {
      answers: answersRef.current,
      submitted: true,
    });
  }

  function retry() {
    setSubmitted(false);
    commit(questions.map(() => null), false);
  }

  return (
    <div className="quiz">
      {questions.map((q, qi) => (
        <div className="quiz-q" key={qi}>
          <p className="quiz-question">
            <span className="quiz-num">{qi + 1}.</span> {q.question}
          </p>
          <div className="quiz-options">
            {q.options.map((opt, oi) => {
              const chosen = answers[qi] === oi;
              const isCorrect = oi === q.answerIndex;
              let cls = "quiz-option";
              if (chosen) cls += " chosen";
              if (submitted && isCorrect) cls += " correct";
              if (submitted && chosen && !isCorrect) cls += " wrong";
              return (
                <button
                  key={oi}
                  className={cls}
                  onClick={() => choose(qi, oi)}
                  disabled={submitted}
                >
                  <span className="quiz-marker">
                    {String.fromCharCode(65 + oi)}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
          {submitted && (
            <p className="quiz-explain">
              {answers[qi] === q.answerIndex ? "✓ Correct. " : "✗ "}
              {q.explain}
            </p>
          )}
        </div>
      ))}

      <div className="quiz-footer">
        {!submitted ? (
          <button
            className="btn btn-run"
            onClick={submit}
            disabled={!allAnswered}
          >
            Check answers
          </button>
        ) : (
          <>
            <span className="quiz-score">
              Score: {correct} / {questions.length}
            </span>
            <button className="btn btn-ghost" onClick={retry}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

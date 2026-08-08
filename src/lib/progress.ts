// localStorage-backed progress + quiz scores, namespaced per course.

const DONE_PREFIX = "tsphp.completed.v2";
const QUIZ_PREFIX = "tsphp.quiz.v2";

const doneKey = (courseId: string) => `${DONE_PREFIX}.${courseId}`;
const quizKey = (courseId: string) => `${QUIZ_PREFIX}.${courseId}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

export function getCompleted(courseId: string): Set<string> {
  return new Set(read<string[]>(doneKey(courseId), []));
}

export function setCompleted(
  courseId: string,
  slug: string,
  done: boolean
): Set<string> {
  const set = getCompleted(courseId);
  if (done) set.add(slug);
  else set.delete(slug);
  write(doneKey(courseId), [...set]);
  return set;
}

/** Number of completed lessons for a course (for catalog progress). */
export function completedCount(courseId: string): number {
  return getCompleted(courseId).size;
}

/** A saved quiz attempt for one lesson: the chosen answers + whether checked. */
export interface QuizAttempt {
  answers: (number | null)[];
  submitted: boolean;
}

export function getQuizAttempt(
  courseId: string,
  slug: string
): QuizAttempt | null {
  const all = read<Record<string, QuizAttempt>>(quizKey(courseId), {});
  return all[slug] ?? null;
}

export function setQuizAttempt(
  courseId: string,
  slug: string,
  attempt: QuizAttempt
): void {
  const all = read<Record<string, QuizAttempt>>(quizKey(courseId), {});
  all[slug] = attempt;
  write(quizKey(courseId), all);
}

/** Lessons in a course whose quiz has been completed (submitted). */
export function passedQuizCount(courseId: string): number {
  const all = read<Record<string, QuizAttempt>>(quizKey(courseId), {});
  return Object.values(all).filter((a) => a.submitted).length;
}

export function resetProgress(courseId: string): void {
  write(doneKey(courseId), []);
  write(quizKey(courseId), {});
}

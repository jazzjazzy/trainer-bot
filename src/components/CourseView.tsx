import { useEffect, useMemo, useState } from "react";
import type { Course } from "../types";
import { Sidebar } from "./Sidebar";
import { LessonView } from "./LessonView";
import { getCompleted, setCompleted } from "../lib/progress";
import { useAI } from "../ai/AIContext";

interface Props {
  course: Course;
  slug: string | null;
  onSelectLesson: (slug: string) => void;
  onBackToCatalog: () => void;
}

export function CourseView({
  course,
  slug,
  onSelectLesson,
  onBackToCatalog,
}: Props) {
  const { setCourse, setLesson } = useAI();
  const [completed, setCompletedState] = useState<Set<string>>(() =>
    getCompleted(course.id)
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const index = useMemo(() => {
    const i = course.lessons.findIndex((l) => l.slug === slug);
    return i === -1 ? 0 : i;
  }, [slug, course]);
  const lesson = course.lessons[index];

  // Redirect to the first lesson when no/unknown slug.
  useEffect(() => {
    if (!slug || !course.lessons.some((l) => l.slug === slug)) {
      onSelectLesson(course.lessons[0].slug);
    }
  }, [slug, course, onSelectLesson]);

  // Reload progress when the course changes.
  useEffect(() => {
    setCompletedState(getCompleted(course.id));
  }, [course.id]);

  // Point the AI tutor at this course + lesson.
  useEffect(() => setCourse(course), [course, setCourse]);
  useEffect(() => setLesson(lesson), [lesson, setLesson]);

  function toggleDone(done: boolean) {
    setCompletedState(new Set(setCompleted(course.id, lesson.slug, done)));
  }

  const prev =
    index > 0 ? () => onSelectLesson(course.lessons[index - 1].slug) : undefined;
  const next =
    index < course.lessons.length - 1
      ? () => onSelectLesson(course.lessons[index + 1].slug)
      : undefined;

  return (
    <div className="app">
      <Sidebar
        course={course}
        currentSlug={lesson.slug}
        completed={completed}
        onNavigate={onSelectLesson}
        onBackToCatalog={onBackToCatalog}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      {menuOpen && (
        <div className="scrim" onClick={() => setMenuOpen(false)} />
      )}
      <main className="content">
        <div className="topbar">
          <button
            className="menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <span className="topbar-title">{lesson.title}</span>
        </div>
        <LessonView
          key={lesson.slug}
          courseId={course.id}
          comparison={course.comparison}
          lesson={lesson}
          total={course.lessons.length}
          isDone={completed.has(lesson.slug)}
          onToggleDone={toggleDone}
          onPrev={prev}
          onNext={next}
        />
      </main>
    </div>
  );
}

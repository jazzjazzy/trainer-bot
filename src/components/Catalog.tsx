import { useMemo, useState, type CSSProperties } from "react";
import type { Course } from "../types";
import { completedCount } from "../lib/progress";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  courses: Course[];
  onOpenCourse: (id: string) => void;
}

export function Catalog({ courses, onOpenCourse }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      [c.title, c.subtitle, c.description, c.level, ...c.tags]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [courses, query]);

  return (
    <div className="catalog">
      <header className="catalog-head">
        <div className="catalog-topline">
          <div className="catalog-brand">
            <span className="catalog-mark">◆</span>
            <span>DevCourses</span>
          </div>
          <ThemeToggle />
        </div>
        <h1 className="catalog-title">Interactive developer courses</h1>
        <p className="catalog-tagline">
          Hands-on, multimedia courses with live code playgrounds, quizzes, and
          an AI tutor. Pick one to begin.
        </p>
        <input
          className="catalog-search"
          type="search"
          placeholder="Search courses…  (e.g. “typescript”, “php”, “interview”)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="catalog-grid">
        {filtered.map((c) => {
          const done = completedCount(c.id);
          const total = c.lessons.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <button
              key={c.id}
              className="course-card"
              style={{ "--card-accent": c.accent } as unknown as CSSProperties}
              onClick={() => onOpenCourse(c.id)}
            >
              <div className="course-card-top">
                <span
                  className="course-badge"
                  style={{ background: c.accent }}
                >
                  {c.badge}
                </span>
                <span className="course-level">{c.level}</span>
              </div>
              <h2 className="course-card-title">{c.title}</h2>
              <p className="course-card-sub">{c.subtitle}</p>
              <div className="course-tags">
                {c.tags.slice(0, 4).map((t) => (
                  <span className="course-tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="course-card-foot">
                <div className="course-progress">
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="course-meta">
                    {done > 0
                      ? `${done}/${total} done · ${pct}%`
                      : `${total} sections`}
                  </span>
                </div>
                <span className="course-cta">
                  {done > 0 ? "Continue →" : "Start →"}
                </span>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="catalog-empty">No courses match “{query}”.</p>
        )}
      </div>
    </div>
  );
}

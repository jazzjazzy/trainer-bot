import type { Course } from "../types";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  course: Course;
  currentSlug: string;
  completed: Set<string>;
  onNavigate: (slug: string) => void;
  onBackToCatalog: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  course,
  currentSlug,
  completed,
  onNavigate,
  onBackToCatalog,
  open,
  onClose,
}: Props) {
  const lessons = course.lessons;
  const pct = Math.round((completed.size / lessons.length) * 100);

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-head">
        <div className="sidebar-toprow">
          <button className="back-link" onClick={onBackToCatalog}>
            ← All courses
          </button>
          <ThemeToggle />
        </div>
        <div className="brand">
          <span className="brand-mark" style={{ background: course.accent }}>
            {course.badge}
          </span>
          <div>
            <div className="brand-title">{course.title}</div>
            <div className="brand-sub">{lessons.length} sections</div>
          </div>
        </div>
        <div className="overall-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-label">
            {completed.size}/{lessons.length} done · {pct}%
          </span>
        </div>
      </div>

      <nav className="nav">
        {course.parts.map((part) => {
          const inPart = lessons.filter((l) => l.part === part);
          if (inPart.length === 0) return null;
          return (
            <div className="nav-group" key={part}>
              <div className="nav-group-title">{part}</div>
              {inPart.map((l) => {
                const active = l.slug === currentSlug;
                const done = completed.has(l.slug);
                return (
                  <button
                    key={l.slug}
                    className={`nav-item ${active ? "active" : ""}`}
                    onClick={() => {
                      onNavigate(l.slug);
                      onClose();
                    }}
                  >
                    <span className={`nav-check ${done ? "done" : ""}`}>
                      {done ? "✓" : l.id}
                    </span>
                    <span className="nav-text">{l.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

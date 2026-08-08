import { useEffect, useState } from "react";

export interface Route {
  /** Course id from the hash, or null for the catalog. */
  courseId: string | null;
  /** Lesson slug within the course, or null. */
  slug: string | null;
}

/** Parses `#/<courseId>/<slug>` from the URL hash. */
export function useHashRoute(): [
  Route,
  (courseId: string | null, slug?: string | null) => void
] {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (courseId: string | null, slug?: string | null) => {
    const next = courseId
      ? `#/${courseId}${slug ? `/${slug}` : ""}`
      : "#/";
    if (window.location.hash === next) return;
    window.location.hash = next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return [route, navigate];
}

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  if (!raw) return { courseId: null, slug: null };
  const [courseId, slug] = raw.split("/");
  return { courseId: courseId || null, slug: slug || null };
}

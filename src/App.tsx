import { useEffect } from "react";
import { courses, getCourse } from "./courses";
import { Catalog } from "./components/Catalog";
import { CourseView } from "./components/CourseView";
import { useHashRoute } from "./lib/useHashRoute";
import { useAI } from "./ai/AIContext";

export default function App() {
  const [route, navigate] = useHashRoute();
  const { setCourse } = useAI();
  const course = getCourse(route.courseId);

  // On the catalog (no valid course), clear the tutor's course context.
  useEffect(() => {
    if (!course) setCourse(null);
  }, [course, setCourse]);

  if (!course) {
    return (
      <Catalog courses={courses} onOpenCourse={(id) => navigate(id)} />
    );
  }

  return (
    <CourseView
      course={course}
      slug={route.slug}
      onSelectLesson={(slug) => navigate(course.id, slug)}
      onBackToCatalog={() => navigate(null)}
    />
  );
}

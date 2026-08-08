import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "ts-for-php",
  title: "TypeScript for PHP Veterans",
  subtitle: "Learn modern TypeScript by mapping it to the PHP you already know.",
  description:
    "Thirty interactive sections that teach TypeScript through the lens of PHP — every concept shown side by side with the PHP equivalent, with a live playground, quizzes, and interview prep.",
  tags: ["typescript", "php", "frontend", "backend", "interview", "language"],
  level: "Intermediate",
  accent: "#3aa6ff",
  badge: "TS",
  parts: [
    "Foundations",
    "The Type System",
    "Object-Oriented TypeScript",
    "Modern Runtime & Async",
    "Ecosystem & Interview",
  ],
  comparison: {
    leftLabel: "PHP",
    leftLang: "php",
    rightLabel: "TypeScript",
    rightLang: "typescript",
  },
  tutor: {
    audience:
      "a software developer with about 20 years of PHP experience who is learning TypeScript to be ready for job interviews",
    persona:
      "ALWAYS connect new TypeScript ideas back to the PHP the student already knows (e.g. \"like PHP's ...\").",
  },
  lessons,
};

export default course;

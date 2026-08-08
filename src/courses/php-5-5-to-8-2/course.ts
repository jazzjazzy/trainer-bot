import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "php-5-5-to-8-2",
  title: "PHP 5.5 → 8.2: The Upgrade",
  subtitle: "Catch up on everything that changed across PHP 7 and 8.",
  description:
    "If you know PHP 5.5, this course brings you current: scalar types, enums, readonly, match, named arguments, attributes and more — each shown as the old way beside the modern way, with the breaking changes to watch for.",
  tags: ["php", "php8", "php7", "upgrade", "backend", "language"],
  level: "Intermediate",
  accent: "#8a93ff",
  badge: "PHP",
  parts: [
    "Getting Current",
    "PHP 7.0: Types & the Engine",
    "PHP 7.1–7.4: Refinements",
    "PHP 8.0: The Big Leap",
    "PHP 8.1–8.2: Modern PHP",
  ],
  comparison: {
    leftLabel: "PHP 5.5",
    leftLang: "php",
    rightLabel: "Modern PHP",
    rightLang: "php",
  },
  tutor: {
    audience:
      "a developer who knows PHP 5.5 well and is catching up on everything that changed through PHP 8.2",
    persona:
      "Frame each feature as \"here's how you did it in 5.5, here's the modern way\", and call out deprecations and breaking changes to watch for when upgrading.",
  },
  lessons,
};

export default course;

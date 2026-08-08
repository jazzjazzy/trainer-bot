import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "python-for-php-devs",
  title: "Python for PHP Veterans",
  subtitle: "Your decades of PHP, translated into fluent Python.",
  description:
    "A ground-up Python course for developers with a deep PHP background and zero Python. Every concept is taught beside the PHP you already know — arrays become lists and dicts, foreach becomes for-in, Composer becomes pip and venvs — so you learn the new spelling, not programming itself.",
  tags: ["python", "php", "backend", "career-change", "fundamentals"],
  level: "Beginner",
  accent: "#3776ab",
  badge: "PY",
  parts: [
    "First Contact",
    "Control Flow & Functions",
    "OOP the Python Way",
    "Batteries Included",
    "Real-World Python",
  ],
  comparison: {
    leftLabel: "PHP",
    leftLang: "php",
    rightLabel: "Python",
    rightLang: "python",
  },
  tutor: {
    audience:
      "a developer with ~25 years of PHP experience who has never written Python before and is learning it from scratch",
    persona:
      "Always anchor Python ideas to their PHP equivalent first (associative array → dict, foreach → for-in, Composer → pip/venv, PHPUnit → pytest, $this → self), then explain where the mapping breaks down. Assume deep programming knowledge — never explain what a loop or a class is, only how Python spells and thinks about it. Flag Python 3.10+ features by version. Warn about the classic PHP-to-Python traps: indentation as syntax, truthiness differences, mutable default arguments, and the long-running process model versus PHP's request-dies world.",
  },
  lessons,
};

export default course;

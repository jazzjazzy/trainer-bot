import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "testing-across-stack",
  title: "Testing Across the Stack",
  subtitle:
    "Vitest, Testing Library, Playwright, pytest — the skill every listing demands.",
  description:
    "Go from untested code to a suite a hiring panel will respect: unit tests with Vitest 4, behaviour-driven component tests with Testing Library, API and database integration tests, Playwright end-to-end runs, and pytest 9 for the Python track — plus the judgment calls (what to test, what to mock, what to skip) that interviews actually probe.",
  tags: ["testing", "vitest", "playwright", "pytest", "tdd", "ci"],
  level: "Intermediate",
  accent: "#f59e0b",
  badge: "QA",
  parts: [
    "Foundations",
    "Vitest Fundamentals",
    "Components & Python",
    "Integration & E2E",
    "Discipline & Delivery",
  ],
  comparison: {
    leftLabel: "Old Habits",
    leftLang: "php",
    rightLabel: "Modern Test",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience retraining for the job market, now learning automated testing across the stack — Vitest, Testing Library, Playwright, and pytest — with interview-readiness as the explicit goal",
    persona:
      "Assume they shipped plenty of production PHP that was tested by hand (or with PHPUnit at best) and know TypeScript, Svelte, and Python basics from earlier courses. Map new ideas to that history: describe/it blocks are PHPUnit test classes, pytest fixtures are setUp() done right, parametrize is a data provider, Playwright is the manual browser-clicking they have done for decades — automated. Stress behaviour-over-implementation and the testing pyramid, and frame every topic as something they should be able to defend in a technical interview.",
  },
  lessons,
};

export default course;

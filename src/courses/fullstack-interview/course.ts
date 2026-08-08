import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "fullstack-interview",
  title: "The Full-Stack Interview",
  subtitle: "System design, live coding, and selling 25 years of experience.",
  description:
    "This course is about the exam itself, not a technology: how hiring pipelines really work, the coding patterns that cover 80% of screens, system design from requirements to scale, and how to turn a 25-year PHP career into senior signal instead of legacy baggage.",
  tags: ["interview", "system-design", "career", "live-coding"],
  level: "Advanced",
  accent: "#fb7185",
  badge: "INT",
  parts: [
    "Positioning & Pipeline",
    "Live Coding & Take-Homes",
    "System Design Fundamentals",
    "The Classic Questions",
    "Stories, Offers & Day One",
  ],
  comparison: {
    leftLabel: "Weak answer",
    leftLang: "ts",
    rightLabel: "Strong answer",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience who has retrained in TypeScript and is now preparing for full-stack interviews — coding screens, take-homes, system design, and behavioural rounds",
    persona:
      "Coach them like a candidate, not a student: every topic exists to be said out loud to a hiring panel. Relate coding patterns to PHP they already know (Map ≈ associative array, array_count_values, usort), system design to their years of operating LAMP stacks in production, and behavioural questions to real incidents from a long career. Treat their 25 years as evidence of seniority — help them frame scope, impact, and judgment, never apologise for PHP. Push them to practise answers aloud, narrate trade-offs, and quantify.",
  },
  lessons,
};

export default course;

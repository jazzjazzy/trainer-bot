import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "node-backend-ts",
  title: "Node.js Backend for PHP Veterans",
  subtitle: "One long-running process, not one request at a time.",
  description:
    "Retrain your PHP server instincts for Node's event loop: build typed Express 5 APIs with validation, Postgres, pino logging, graceful shutdown, and a deployment story — knowing exactly what changes when your process never dies between requests.",
  tags: ["node", "backend", "express", "api", "typescript"],
  level: "Intermediate",
  accent: "#68a063",
  badge: "JS",
  parts: [
    "The Runtime Shift",
    "Express Essentials",
    "Async, Data & Validation",
    "Production Hardening",
    "Scaling & Shipping",
  ],
  comparison: {
    leftLabel: "PHP",
    leftLang: "php",
    rightLabel: "Node + TS",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience retraining for backend jobs, who knows TypeScript syntax but is new to Node.js as a server runtime",
    persona:
      "Constantly relate Node concepts back to PHP: the event loop vs PHP-FPM's process-per-request model, npm vs Composer, Express middleware vs PSR-15, pg vs PDO. Hammer the core shift — PHP dies after every request while Node is one long-running process, so state persists and blocking code blocks every user. Keep answers interview-ready: they should be able to explain WHY to a hiring panel, not just recite APIs.",
  },
  lessons,
};

export default course;

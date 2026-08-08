import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "sql-and-orms",
  title: "SQL & Modern ORMs: Prisma and Drizzle",
  subtitle: "Your 25 years of SQL, typed end-to-end.",
  description:
    "Take the Postgres and raw-SQL instincts you built over decades of PHP and PDO, and wire them into a fully typed TypeScript data layer. Model schemas, run migrations, and write queries in both Prisma 7 and Drizzle — knowing exactly what SQL runs underneath and why.",
  tags: ["sql", "database", "prisma", "drizzle", "postgres", "orm"],
  level: "Intermediate",
  accent: "#38bdf8",
  badge: "DB",
  parts: [
    "Foundations",
    "Schema & Migrations",
    "Queries & CRUD",
    "Transactions & Performance",
    "Production & Choosing",
  ],
  comparison: {
    leftLabel: "PHP / SQL",
    leftLang: "php",
    rightLabel: "Typed TS",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP and deep SQL/Postgres experience who knows TypeScript fundamentals and is now learning modern typed ORMs (Prisma 7 and Drizzle) to be job-ready",
    persona:
      "They are NOT new to databases — they know joins, indexes, transactions, and EXPLAIN better than most interviewers. Never explain SQL basics; instead show what SQL an ORM call produces and map every concept back to PDO, prepared statements, and hand-written queries. Treat their SQL depth as their interview superpower: connect ORM behaviour (N+1, over-fetching, pooling) to the underlying Postgres mechanics they already understand. Assume TS interfaces, generics, and unions are known; the new part is schema-as-code, generated types, and each ORM's query API.",
  },
  lessons,
};

export default course;

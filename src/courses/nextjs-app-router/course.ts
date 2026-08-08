import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "nextjs-app-router",
  title: "Next.js App Router with TypeScript",
  subtitle: "The React framework the job listings ask for — App Router, typed.",
  description:
    "Server Components by default, Server Actions for mutations, file-convention routing, and caching you actually understand: the Next.js 16 App Router, taught as the closest thing JavaScript has to the PHP request model — with TypeScript everywhere.",
  tags: ["nextjs", "react", "fullstack", "app-router", "server-components"],
  level: "Intermediate",
  accent: "#94a3b8",
  badge: "N",
  parts: [
    "Foundations",
    "Routing & Navigation",
    "Data & Caching",
    "Mutations & APIs",
    "Production & Interview Prep",
  ],
  comparison: {
    leftLabel: "Classic PHP",
    leftLang: "php",
    rightLabel: "Next.js + TS",
    rightLang: "tsx",
  },
  tutor: {
    audience:
      "a developer with ~25 years of PHP experience who has completed TypeScript and React fundamentals and is now learning the Next.js App Router to qualify for full-stack React jobs",
    persona:
      "Assume they know TypeScript (interfaces, generics, unions) and React basics (components, props, hooks) but are new to Next.js conventions, Server Components, and the caching model. Lean on their server-side instincts: Server Components ≈ a PHP page rendering per request, Server Actions ≈ a form POST handler, route handlers ≈ API endpoints/controllers, proxy.ts ≈ framework middleware, layouts ≈ shared templates/includes. Target Next.js 16 (App Router only) and be precise about what changed in 15/16: fetch is not cached by default, params/cookies/headers are async, middleware.ts is renamed proxy.ts.",
  },
  lessons,
};

export default course;

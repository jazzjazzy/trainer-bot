import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "react-fundamentals",
  title: "React Fundamentals for PHP Developers",
  subtitle: "Components, hooks, and state — from template thinking to React.",
  description:
    "Learn React 19 the modern way — function components, JSX/TSX, and hooks — with every concept mapped back to the PHP templating and vanilla-JS DOM habits you already have. Typed props, state, effects, context, data fetching, and a preview of Server Components: interview-ready throughout.",
  tags: ["react", "frontend", "hooks", "jsx", "typescript"],
  level: "Beginner",
  accent: "#61dafb",
  badge: "R",
  parts: [
    "Thinking in React",
    "State, Events & Forms",
    "Effects, Refs & Rendering",
    "Advanced Hooks & Data",
    "Patterns & Production",
  ],
  comparison: {
    leftLabel: "PHP / Vanilla",
    leftLang: "php",
    rightLabel: "React + TS",
    rightLang: "tsx",
  },
  tutor: {
    audience:
      "a developer with ~25 years of PHP experience who has completed TypeScript fundamentals and is now learning React from scratch to retrain for frontend jobs",
    persona:
      "Assume strong programming fundamentals, HTTP/SQL/server experience, and solid TypeScript syntax (interfaces, generics, unions) — but zero prior React. Relate ideas to what they know: JSX ≈ a PHP template that is really code, components ≈ typed template partials, props ≈ function parameters, a re-render ≈ a fresh page request that PHP devs already reason about, state ≈ data that survives between those 'requests', hooks ≈ declarative alternatives to global helpers. Teach React 19 with function components and hooks only; mention class components solely as history (error boundaries excepted). Interview readiness is the goal — frame answers the way a strong candidate would say them to a hiring panel.",
  },
  lessons,
};

export default course;

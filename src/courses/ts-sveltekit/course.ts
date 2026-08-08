import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "ts-sveltekit",
  title: "TypeScript-First SvelteKit",
  subtitle: "Build SvelteKit apps with TypeScript as the default language.",
  description:
    "From <script lang=\"ts\"> to fully typed load functions, form actions, and endpoints: use Svelte 5 runes and SvelteKit's generated $types so the compiler catches your bugs before the browser does.",
  tags: ["svelte", "sveltekit", "typescript", "frontend", "fullstack", "runes"],
  level: "Intermediate",
  accent: "#ff3e00",
  badge: "SK",
  parts: [
    "Foundations",
    "Typed Components",
    "Routing & Data",
    "Server & Forms",
    "Patterns & Shipping",
  ],
  comparison: {
    leftLabel: "JavaScript",
    leftLang: "svelte",
    rightLabel: "TypeScript",
    rightLang: "svelte",
  },
  tutor: {
    audience:
      "a developer with a PHP background who has learned TypeScript fundamentals and is now building SvelteKit apps with TypeScript as the default language",
    persona:
      "Assume they know core TypeScript (interfaces, generics, unions) but are new to Svelte 5 runes and SvelteKit conventions. Lean on SvelteKit's generated ./$types. Where it helps, map server concepts to PHP frameworks (routes ≈ controllers, load ≈ controller actions, hooks ≈ middleware).",
  },
  lessons,
};

export default course;

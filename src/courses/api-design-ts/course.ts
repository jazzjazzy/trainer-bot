import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "api-design-ts",
  title: "REST & API Design in TypeScript",
  subtitle: "Design APIs like a senior — contracts, auth, and versioning.",
  description:
    "Move past ad-hoc endpoint scripts to deliberately designed APIs: resource modelling, correct HTTP semantics, zod-validated contracts, Problem Details errors, cursor pagination, versioning, auth (sessions vs JWT vs OAuth2/OIDC), rate limiting, caching, OpenAPI, and webhooks — framework-light, all in TypeScript.",
  tags: ["api", "rest", "http", "auth", "openapi", "zod"],
  level: "Intermediate",
  accent: "#f472b6",
  badge: "API",
  parts: [
    "HTTP & Resource Design",
    "Contracts & Validation",
    "Collections & Evolution",
    "Auth & Access Control",
    "Operating in Production",
  ],
  comparison: {
    leftLabel: "Legacy PHP",
    leftLang: "php",
    rightLabel: "Typed TS API",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience who has shipped plenty of quick-and-dirty PHP endpoints and is now retraining to design typed, professional REST APIs in TypeScript for the job market",
    persona:
      "Assume they know HTTP, SQL, and TypeScript syntax (interfaces, generics, unions) but have never designed an API deliberately — their habits are $_GET, json_encode, and one script per endpoint. Relate ideas to that PHP experience: routes ≈ front controllers, middleware ≈ Laravel middleware, zod schemas ≈ filter_var/manual checks done properly, PDO ≈ the data layer behind handlers. Emphasise design trade-offs and how to defend each decision in an interview.",
  },
  lessons,
};

export default course;

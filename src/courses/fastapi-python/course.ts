import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "fastapi-python",
  title: "FastAPI: Production Python APIs",
  subtitle: "The Python backend employers actually hire for.",
  description:
    "Build production-grade Python APIs the modern way: type hints that drive validation, Pydantic v2 models, dependency injection with Depends, SQLAlchemy 2.0, JWT auth, and automatic OpenAPI docs — everything a hiring panel expects a FastAPI developer to know.",
  tags: ["python", "fastapi", "pydantic", "backend", "async"],
  level: "Intermediate",
  accent: "#14b8a6",
  badge: "PY",
  parts: [
    "Foundations",
    "Pydantic & Responses",
    "Dependencies & Architecture",
    "Data & Auth",
    "Production & Shipping",
  ],
  comparison: {
    leftLabel: "PHP",
    leftLang: "php",
    rightLabel: "FastAPI",
    rightLang: "python",
  },
  tutor: {
    audience:
      "a developer with ~25 years of PHP experience (Laravel/Symfony-style apps) who has completed a Python-basics course and is now learning FastAPI to become employable as a Python backend developer",
    persona:
      "Assume they know Python syntax, HTTP, SQL, and server fundamentals deeply, but are new to FastAPI, Pydantic v2, and async Python. Map ideas to PHP where it genuinely helps: Depends ≈ a Laravel/Symfony DI container resolving constructor arguments, APIRouter ≈ route groups/controllers, Pydantic models ≈ FormRequest validation + DTOs in one, middleware ≈ PSR-15 middleware, uvicorn workers ≈ PHP-FPM pools. Use current APIs only: Pydantic v2 names (model_validate, model_dump, ConfigDict, field_validator), Annotated-style dependencies, lifespan context managers, SQLAlchemy 2.0 style. Keep the goal in view: they should be able to defend every topic in a job interview.",
  },
  lessons,
};

export default course;

import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "llm-apps",
  title: "Building with LLM APIs",
  subtitle: "Claude in your stack: streaming, tools, and RAG — TS and Python.",
  description:
    "Learn to build real product features on the Anthropic API: the stateless mental model, streaming UX, reliable JSON, the tool-use loop, embeddings and RAG, plus the production concerns — cost, safety, evals, and error handling — that interviews actually probe.",
  tags: ["ai", "llm", "claude", "rag", "embeddings", "streaming"],
  level: "Intermediate",
  accent: "#c084fc",
  badge: "AI",
  parts: [
    "The Mental Model",
    "Conversations & Streaming",
    "Structured Output & Tools",
    "Embeddings & RAG",
    "Production Engineering",
  ],
  comparison: {
    leftLabel: "First attempt",
    leftLang: "ts",
    rightLabel: "Production",
    rightLang: "ts",
  },
  tutor: {
    audience:
      "a developer with 25 years of PHP experience retraining for the job market, who has completed TypeScript, Python-basics, and SvelteKit courses and is now learning to build product features on LLM APIs (primarily the Anthropic API)",
    persona:
      "Assume solid HTTP/SQL/server fundamentals and working TypeScript, but no prior LLM API experience. Map concepts to what they know: a stateless LLM API is like PHP's request/response cycle, conversation history the app must keep is like $_SESSION data, the tool-use loop is like handling a webhook round-trip, retrieval is the evolution of SQL full-text search, and retries/rate limits are like hardening a Guzzle integration. Keep the focus on interview readiness: name the concepts precisely (context window, temperature-free 5-family models, RAG, evals) and explain the WHY behind each production pattern.",
  },
  lessons,
};

export default course;

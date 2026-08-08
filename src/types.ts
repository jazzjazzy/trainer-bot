// ─────────────────────────────────────────────────────────────────────────
// The lesson data contract.
//
// Every one of the 30 sections is a module under `src/sections/NN-slug.ts`
// that default-exports a single object satisfying the `Lesson` interface.
// The app renders that data — there is no per-lesson UI code. Keep all 30
// files identical in shape so the course stays consistent and maintainable.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A side-by-side code comparison. The two slots are generic "left" and "right"
 * (their labels and languages come from the course's `comparison` config) —
 * e.g. PHP-vs-TypeScript for one course, or "PHP 5.5"-vs-"PHP 8.2" for another.
 * The field names `php`/`ts` are historical; read them as left/right.
 */
export interface CodeComparison {
  /** Optional short heading for the pair, e.g. "Declaring a typed variable". */
  label?: string;
  /**
   * 1–2 plain-language sentences shown above the code: what this example is
   * trying to do and the expected outcome, so the reader has context before
   * reading the two versions.
   */
  intro?: string;
  /** Left-column source (the "before" / familiar side). */
  php: string;
  /** Right-column source (the "after" / new side). */
  ts: string;
  /** One-line callout of what actually differs / what to watch out for. */
  note?: string;
  /**
   * Optional per-comparison syntax-highlight overrides. Useful when a course's
   * default column language (e.g. "svelte") doesn't fit a specific pair —
   * e.g. a comparison of two plain .ts server files sets both to "ts".
   */
  leftLang?: string;
  rightLang?: string;
}

/** An interview question and a model answer framed for an ex-PHP developer. */
export interface InterviewQA {
  q: string;
  /** Answer in markdown. May contain inline `code` and short fenced blocks. */
  a: string;
}

/** A single multiple-choice knowledge check. */
export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index into `options` of the correct answer. */
  answerIndex: number;
  /** Shown after answering — why the right answer is right. */
  explain: string;
}

/** The editable code sample for the playground. */
export interface PlaygroundExample {
  /** Optional one-line framing shown above the editor. */
  intro?: string;
  /**
   * Editor language. "typescript" (the default) runs live in the browser.
   * Other languages (e.g. "php", "python", "svelte") can't execute in-browser,
   * so the editor is read-and-predict and "Run" reveals the precomputed
   * `output`.
   */
  lang?:
    | "typescript"
    | "php"
    | "svelte"
    | "python"
    | "tsx"
    | "jsx"
    | "bash"
    | "yaml"
    | "sql";
  /**
   * Self-contained source for the editor.
   *
   * For "typescript": MUST run with no imports and no top-level `return`; use
   * `console.log(...)` for output. It is transpiled to JS and executed; type
   * errors surface live in the editor.
   *
   * For "php": a self-contained `<?php ... ` snippet that prints via
   * `echo`/`print_r`/`var_dump`; provide its result in `output`.
   *
   * For "python": a self-contained script that prints via `print(...)`;
   * provide its result in `output`.
   *
   * For "svelte": a complete .svelte component (or route file); `output`
   * describes what it renders / logs.
   *
   * For "tsx"/"jsx"/"bash"/"yaml"/"sql": read-and-predict; `output` (required)
   * shows or describes the result.
   */
  code: string;
  /**
   * Precomputed output shown when `code` can't run in-browser (e.g. PHP).
   * Required for non-"typescript" languages.
   */
  output?: string;
}

/** One complete section of the course. */
export interface Lesson {
  /** 1-based ordering, matches the file name prefix. */
  id: number;
  /** URL slug, matches the file name, e.g. "why-typescript". */
  slug: string;
  title: string;
  /** Curriculum grouping, e.g. "Foundations". One of the course's `parts`. */
  part: string;
  /** Rough time to complete, in minutes. */
  estMinutes: number;
  /** One-sentence summary shown in the sidebar / header. */
  summary: string;
  /** The main teaching body, in markdown (headings, lists, code fences ok). */
  concept: string;
  /** PHP ↔ TS comparisons. 2–5 per lesson. */
  comparisons: CodeComparison[];
  /** The hands-on runnable sample. */
  playground: PlaygroundExample;
  /** Quick-recap bullets. 3–6 per lesson. */
  keyPoints: string[];
  /** Interview prep Q&A. 2–5 per lesson. */
  interview: InterviewQA[];
  /** Knowledge-check quiz. 2–4 questions per lesson. */
  quiz: QuizQuestion[];
}

/** Labels + syntax-highlight languages for a course's two comparison columns. */
export interface ComparisonConfig {
  leftLabel: string;
  leftLang: string;
  rightLabel: string;
  rightLang: string;
}

/** How the AI tutor should frame itself for a given course. */
export interface CourseTutor {
  /** Who the learner is — woven into the tutor's system prompt. */
  audience: string;
  /** Course-specific guidance for the tutor (tone, what to relate ideas to). */
  persona: string;
}

/**
 * A self-contained course. Each course lives in its own folder under
 * `src/courses/<id>/` and is registered in `src/courses/index.ts`. The platform
 * (catalog, routing, progress, tutor) is generic over this shape.
 */
export interface Course {
  /** URL slug, unique across courses, e.g. "ts-for-php". */
  id: string;
  title: string;
  /** Short tagline for the catalog card. */
  subtitle: string;
  /** One or two sentences describing the course. */
  description: string;
  /** Free-text tags used for catalog search/filtering. */
  tags: string[];
  level: "Beginner" | "Intermediate" | "Advanced";
  /** Brand accent color (hex) for the card and course chrome. */
  accent: string;
  /** Short mark shown on the card/sidebar, e.g. "TS", "PHP". */
  badge: string;
  /** Ordered part names — the sidebar groupings for this course. */
  parts: string[];
  /** How to label/highlight the two columns of each code comparison. */
  comparison: ComparisonConfig;
  /** AI-tutor framing specific to this course. */
  tutor: CourseTutor;
  /** The ordered lessons. */
  lessons: Lesson[];
}

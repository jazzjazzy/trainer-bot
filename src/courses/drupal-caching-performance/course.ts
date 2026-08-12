import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-caching-performance",
  title: "Drupal Caching & Performance",
  subtitle: "Make it fast, keep it correct — cacheability metadata through to the edge.",
  description:
    "Cache tags, contexts and max-age as one coherent contract, then every layer that consumes them: render cache, internal and dynamic page cache, placeholders, BigPipe, Varnish and CDN purging. Plus the unglamorous half — N+1 entity loads, Views query settings, Redis backends, OPcache and FPM tuning, profiling, load testing, and catching regressions in CI.",
  tags: ["drupal", "performance", "caching", "varnish", "redis", "devops"],
  level: "Advanced",
  accent: "#2f9e6f",
  badge: "PF",
  parts: [
    "The Cacheability Model",
    "Page & Render Caching Layers",
    "Reverse Proxies & the Edge",
    "Data, Queries & Runtime",
    "Measurement & Operations",
  ],
  comparison: {
    leftLabel: "Symfony / generic PHP",
    leftLang: "php",
    rightLabel: "Drupal",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who knows Drupal's architecture and render arrays, now responsible for making a busy Drupal site fast and keeping it that way",
    persona:
      "Lean on transferable ops knowledge — OPcache, FPM sizing, EXPLAIN, load testing and CDN behaviour are the same everywhere, so say so and move fast there. Spend the depth on what is Drupal-specific: cacheability metadata that travels with the output and bubbles, the page-cache layers, and tag-based invalidation reaching the edge. Two habits to drill: measure before optimising, and reach for a tag or a context rather than max-age 0.",
  },
  lessons,
};

export default course;

import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-site-building",
  title: "Drupal Site Building Without Code",
  subtitle: "Content types, fields, Views, and layouts — built in the admin UI, deployed as config.",
  description:
    "The half of Drupal a framework developer keeps missing: content modeling, listing pages, blocks, menus, moderation, and multilingual are built by clicking, not coding — and every click exports to reviewable, deployable YAML. Learn what to build in the UI, what it replaces in Symfony, and when to reach for code instead.",
  tags: ["drupal", "site-building", "views", "config", "cms", "no-code"],
  level: "Intermediate",
  accent: "#53b0eb",
  badge: "SB",
  parts: [
    "The Site-Builder Mindset",
    "Content Modeling in the UI",
    "Views: Queries Without Code",
    "Layout, Blocks & Menus",
    "Users, Config & Handoff",
  ],
  comparison: {
    leftLabel: "The code you'd write",
    leftLang: "php",
    rightLabel: "The Drupal way",
    rightLang: "yaml",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who understands Drupal's architecture but instinctively writes code for things Drupal site builders click together in the admin UI",
    persona:
      "For every task, contrast the code they would have written (entity class, controller, FormType, query, template) with the admin click-path and the config YAML it produces. Reinforce the config-vs-content split and its deployment consequences. Be concrete with admin paths (Structure > Content types > ...). Acknowledge when code IS the right call — this course is about knowing the boundary.",
  },
  lessons,
};

export default course;

import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-config-deployment",
  title: "Drupal Config Management & Deployment",
  subtitle: "Get Drupal from a laptop to production, repeatedly, with a team.",
  description:
    "The configuration system from the inside — active store, sync directory, UUIDs, dependencies and overrides — then everything built on it: cex/cim as a review discipline, config_split and config_ignore, update hooks in the deploy order, CI pipelines that gate a config import, recipes, multi-environment workflow, rollback when it goes wrong, and auditing a legacy project you have just inherited.",
  tags: ["drupal", "devops", "deployment", "config", "ci-cd", "composer"],
  level: "Advanced",
  accent: "#8b5cf6",
  badge: "CD",
  parts: [
    "The Configuration System",
    "Everyday Workflow",
    "Deployment Mechanics",
    "Team Workflow",
    "Safety & Operations",
  ],
  comparison: {
    leftLabel: "Symfony / generic PHP",
    leftLang: "php",
    rightLabel: "Drupal",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who builds Drupal modules and now owns getting a Drupal site safely from a laptop to production, repeatedly, as part of a team",
    persona:
      "The central mental adjustment to keep returning to: Drupal's config round-trips through a database, so it can drift, conflict and carry identity (UUIDs) in ways Symfony's read-only config/packages never can — that single fact explains site-UUID mismatches, config_ignore, config_split and most deploy failures. Be honest where Symfony is simply simpler (per-environment config) and where ops knowledge transfers wholesale (CI, backups, observability). Push two habits: rehearse every deploy against a production database copy, and treat a config diff as a security review.",
  },
  lessons,
};

export default course;

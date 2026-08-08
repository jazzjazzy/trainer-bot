import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-module-dev",
  title: "Drupal Custom Module Development",
  subtitle: "Build a production-quality module end to end — routes, services, forms, config, cron, and shipping polish.",
  description:
    "One running example — an incident-tracker module — built section by section: info.yml and routing, services and dependency injection, hooks and events, Form API and config schema, install and update hooks, queues and cron, a configurable block plugin, asset libraries, mail, logging, and coding standards. Every step mapped from what you'd do in Symfony.",
  tags: ["drupal", "php", "modules", "backend", "symfony", "hands-on"],
  level: "Intermediate",
  accent: "#7b8ff0",
  badge: "MD",
  parts: [
    "Module Anatomy & Scaffolding",
    "Services, DI & Business Logic",
    "Forms & Config",
    "Data, State & Background Work",
    "Polish & Ship",
  ],
  comparison: {
    leftLabel: "Symfony",
    leftLang: "php",
    rightLabel: "Drupal",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who understands Drupal's architecture and is now building their first production custom modules for Drupal 10/11",
    persona:
      "Everything centers on the running example module, incident_tracker. Map each mechanism from Symfony (MakerBundle ≈ drush generate, autowiring ≈ explicit services.yml + create(), Messenger handler ≈ QueueWorker, flash bag ≈ messenger, Assert constraints ≈ Constraint plugins, Encore ≈ libraries.yml). Flag Drupal 10 vs 11 differences briefly (attribute plugins in 10.2+, #[Hook] classes in 11.1+). Push production discipline: cache metadata, config schema, uninstall cleanliness, phpcs.",
  },
  lessons,
};

export default course;

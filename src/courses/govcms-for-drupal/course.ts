import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "govcms-for-drupal",
  title: "GovCMS for Drupal Developers",
  subtitle:
    "The Australian Government's Drupal platform — and the guardrails that come with it.",
  description:
    "You know Drupal. GovCMS is Drupal with a landlord. Why the Department of Finance built it, the OFFICIAL: Sensitive boundary it operates inside, and the two offerings you will be asked to choose between in an interview — SaaS, where Finance owns security and you may not ship a line of PHP, and PaaS, where the application layer comes back to you. Then the machinery: the distribution, the ahoy scaffold, Lagoon, the deploy contract, and the validators that fail your pipeline for an enabled module, a granted permission, a called function or a committed file.",
  tags: ["drupal", "govcms", "australia", "government", "lagoon", "compliance"],
  level: "Intermediate",
  accent: "#00796b",
  badge: "GOV",
  parts: [
    "Why GovCMS Exists",
    "The Distribution & Your Codebase",
    "Lagoon: Deploy & Run",
    "The Compliance Gates",
    "Building on GovCMS & Interview Prep",
  ],
  comparison: {
    leftLabel: "Standard Drupal",
    leftLang: "php",
    rightLabel: "GovCMS",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who is fluent in Drupal — module development, config management, caching, deployment — and is now interviewing for GovCMS agency and vendor roles in Australia",
    persona:
      "The mental adjustment to keep returning to: on GovCMS the platform is a party to every technical decision, and on SaaS it holds a veto. A thing being possible in Drupal says nothing about whether it will survive a validator run. Frame answers as 'on SaaS … on PaaS …', because that is how a GovCMS interviewer thinks and how the shared-responsibility model is written. Be concrete about Australian-Government context — OFFICIAL: Sensitive, the ACSC, accessibility obligations, the Drupal Services Panel — because vendor interviews probe it. Never let the learner reach for a custom module before checking whether the distribution already ships the answer.",
  },
  lessons,
};

export default course;

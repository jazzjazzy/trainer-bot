import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-for-symfony",
  title: "Drupal for Symfony Developers",
  subtitle: "Learn Drupal 10 & 11 by mapping every concept from Symfony.",
  description:
    "Drupal is built on Symfony components — so you already know half of it. This course maps controllers, services, routing, the entity system, plugins, hooks, render arrays, caching, and config management from what you know in Symfony to how Drupal does it, and shows exactly where the two diverge.",
  tags: ["drupal", "symfony", "php", "cms", "backend", "fullstack"],
  level: "Intermediate",
  accent: "#0678be",
  badge: "DR",
  parts: [
    "Foundations & Mental Model",
    "Routing, Controllers & Services",
    "Content Model & Entities",
    "Extending Drupal",
    "Rendering, Config & Shipping",
  ],
  comparison: {
    leftLabel: "Symfony",
    leftLang: "php",
    rightLabel: "Drupal",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced Symfony developer (25 years general PHP) with no prior Drupal background, learning Drupal 10/11 to widen their job options",
    persona:
      "Assume fluent Symfony: bundles, services.yaml autowiring, #[Route] attributes, Doctrine ORM, the Form component, voters, Twig. Teach every Drupal concept by mapping FROM Symfony (bundle ≈ module, services.yaml ≈ *.services.yml, Doctrine ≈ the entity system, voter ≈ access handler, findBy ≈ entityQuery, render() ≈ render array). Always name where Drupal genuinely diverges and why.",
  },
  lessons,
};

export default course;

import type { Course } from "../../types";
import { lessons } from "./sections";

const course: Course = {
  id: "drupal-forms-theming",
  title: "Drupal Forms, Render Arrays & the Theme Layer",
  subtitle: "The output half of Drupal: how PHP becomes HTML, and how to control every step.",
  description:
    "Form API beyond buildForm() — element plugins, #states, AJAX commands, wizards. Render arrays and the pipeline that turns them into markup, with cacheability that actually bubbles. Then the theme layer: theme hooks, template suggestions, preprocess, Drupal's Twig dialect, asset libraries, behaviors, and Single Directory Components.",
  tags: ["drupal", "twig", "theming", "forms", "render-arrays", "frontend"],
  level: "Advanced",
  accent: "#e07a3f",
  badge: "TH",
  parts: [
    "Form API in Depth",
    "Render Arrays & the Render Pipeline",
    "The Theme Layer",
    "Assets, Components & Layout",
    "Quality & Debugging",
  ],
  comparison: {
    leftLabel: "Symfony / Twig",
    leftLang: "php",
    rightLabel: "Drupal",
    rightLang: "php",
  },
  tutor: {
    audience:
      "an experienced PHP/Symfony developer who knows Drupal's architecture and can already build a custom module, now learning how Drupal produces HTML — Form API internals, render arrays, and the theme layer",
    persona:
      "Assume they know getFormId/buildForm/submitForm, ConfigFormBase, basic #ajax and attaching a library — build past those rather than re-teaching them. Map to Symfony where an analogue exists (FormType ≈ element plugin, Twig Components ≈ SDC, Encore ≈ libraries.yml, ESI ≈ #lazy_builder) and be explicit when one does not (render arrays, preprocess, template suggestions). Push two disciplines relentlessly: cacheability metadata on everything, and escaping/markup safety.",
  },
  lessons,
};

export default course;

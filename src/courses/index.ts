import type { Course } from "../types";
import tsForPhp from "./ts-for-php/course";
import phpUpgrade from "./php-5-5-to-8-2/course";
import tsSvelteKit from "./ts-sveltekit/course";
import pythonForPhp from "./python-for-php-devs/course";
import reactFundamentals from "./react-fundamentals/course";
import nextjsAppRouter from "./nextjs-app-router/course";
import nodeBackendTs from "./node-backend-ts/course";
import sqlAndOrms from "./sql-and-orms/course";
import apiDesignTs from "./api-design-ts/course";
import fastapiPython from "./fastapi-python/course";
import testingAcrossStack from "./testing-across-stack/course";
import dockerCicd from "./docker-cicd/course";
import llmApps from "./llm-apps/course";
import fullstackInterview from "./fullstack-interview/course";
import drupalForSymfony from "./drupal-for-symfony/course";
import drupalSiteBuilding from "./drupal-site-building/course";
import drupalModuleDev from "./drupal-module-dev/course";
import drupalFormsTheming from "./drupal-forms-theming/course";
import drupalCachingPerformance from "./drupal-caching-performance/course";
import drupalConfigDeployment from "./drupal-config-deployment/course";

// The course catalog. To add a course, create `src/courses/<id>/course.ts`
// exporting a Course, then import and list it here.
export const courses: Course[] = [
  tsForPhp,
  phpUpgrade,
  tsSvelteKit,
  pythonForPhp,
  reactFundamentals,
  nextjsAppRouter,
  nodeBackendTs,
  sqlAndOrms,
  apiDesignTs,
  fastapiPython,
  testingAcrossStack,
  dockerCicd,
  llmApps,
  fullstackInterview,
  drupalForSymfony,
  drupalSiteBuilding,
  drupalModuleDev,
  drupalFormsTheming,
  drupalCachingPerformance,
  drupalConfigDeployment,
];

export function getCourse(id: string | null): Course | undefined {
  if (!id) return undefined;
  return courses.find((c) => c.id === id);
}

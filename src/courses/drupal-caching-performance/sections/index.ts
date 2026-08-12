import type { Lesson } from "../../../types";
import l01 from "./01-why-drupal-caches";
import l02 from "./02-cache-tags";
import l03 from "./03-cache-contexts";
import l04 from "./04-max-age-and-permanent";
import l05 from "./05-bubbling-and-dependencies";
import l06 from "./06-cache-api-bins-backends";
import l07 from "./07-render-cache";
import l08 from "./08-internal-page-cache";
import l09 from "./09-dynamic-page-cache";
import l10 from "./10-placeholders-auto-placeholdering";
import l11 from "./11-bigpipe";
import l12 from "./12-cache-poisoning-mistakes";
import l13 from "./13-http-cache-headers";
import l14 from "./14-varnish-and-purge";
import l15 from "./15-cdn-edge-caching";
import l16 from "./16-anonymous-vs-authenticated";
import l17 from "./17-redis-memcache-backends";
import l18 from "./18-query-performance";
import l19 from "./19-entity-loading-n-plus-1";
import l20 from "./20-views-performance";
import l21 from "./21-cron-queues-batch-performance";
import l22 from "./22-php-runtime-tuning";
import l23 from "./23-frontend-performance";
import l24 from "./24-profiling-tools";
import l25 from "./25-logging-and-slow-queries";
import l26 from "./26-load-testing";
import l27 from "./27-performance-in-ci";
import l28 from "./28-scaling-architecture";
import l29 from "./29-performance-checklist";
import l30 from "./30-cheatsheet-performance-interview";

export const lessons: Lesson[] = [
  l01, l02, l03, l04, l05, l06, l07, l08, l09, l10,
  l11, l12, l13, l14, l15, l16, l17, l18, l19, l20,
  l21, l22, l23, l24, l25, l26, l27, l28, l29, l30,
];

import type { Lesson } from "../../../types";
import l01 from "./01-why-typed-data-layers";
import l02 from "./02-orm-landscape";
import l03 from "./03-postgres-baseline";
import l04 from "./04-prisma-setup";
import l05 from "./05-drizzle-setup";
import l06 from "./06-reading-generated-types";
import l07 from "./07-prisma-schema-modelling";
import l08 from "./08-drizzle-schema-modelling";
import l09 from "./09-relations-in-schema";
import l10 from "./10-constraints-defaults-enums";
import l11 from "./11-prisma-migrations";
import l12 from "./12-drizzle-kit-migrations";
import l13 from "./13-reading-rows";
import l14 from "./14-writing-rows";
import l15 from "./15-filtering-and-operators";
import l16 from "./16-select-include-overfetching";
import l17 from "./17-relations-and-joins";
import l18 from "./18-sorting-and-pagination";
import l19 from "./19-transactions";
import l20 from "./20-n-plus-one";
import l21 from "./21-aggregations-and-grouping";
import l22 from "./22-raw-sql-escape-hatches";
import l23 from "./23-indexes-and-explain";
import l24 from "./24-pooling-and-serverless";
import l25 from "./25-seeding-and-test-data";
import l26 from "./26-testing-against-postgres";
import l27 from "./27-migrations-in-ci";
import l28 from "./28-prisma-vs-drizzle";
import l29 from "./29-choosing-your-stack";
import l30 from "./30-cheatsheet-and-interview";

export const lessons: Lesson[] = [
  l01, l02, l03, l04, l05, l06, l07, l08, l09, l10,
  l11, l12, l13, l14, l15, l16, l17, l18, l19, l20,
  l21, l22, l23, l24, l25, l26, l27, l28, l29, l30,
];

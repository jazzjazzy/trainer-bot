import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 5,
  slug: "config-vs-content",
  title: "The Site as Data: Config vs Content Mindset",
  part: "Foundations & Mental Model",
  estMinutes: 12,
  summary:
    "The core Drupal shift with no Symfony parallel: routes, forms, and field/entity definitions are DATA (config or content), not PHP you write.",

  concept: `
## The shift that trips up every Symfony dev

In Symfony, the shape of your application lives **in code you write**. A route is
a PHP attribute on a controller. An entity and its fields are a Doctrine class
with \`#[ORM\\Column]\` properties. A form is a \`FormType\` class. To add a field
you edit a class and run a migration. The site *is* the codebase.

Drupal inverts a huge slice of this. Much of what you'd hardcode is instead
**data created by a site builder in the admin UI** and stored — not authored in
PHP. A content type ("Article"), the fields on it ("Body", "Tags"), how it's
displayed, a listing page, a menu, a role's permissions: these are all created
by clicking through \`/admin\`, and they land in the database as *configuration*.

This is why a seasoned Drupalist answers so many questions with **"it depends on
the site config"** — and means it literally. The behaviour genuinely isn't in
the repo as code; it's in exported YAML or in the database.

## Two buckets: config vs content

Drupal splits all this data into two categories, and the distinction governs
where things live and how they move between environments.

### Config — the structure of the site

Config is the **definition** layer: content types, field definitions, view
displays, Views listings, roles/permissions, image styles, site name. It's
low-volume, authored by developers/site-builders, and it's **exportable to YAML
and version-controlled**. Think of it as the schema plus the wiring — the part
that should be identical on dev, staging, and prod.

You export the entire site's config to flat YAML with Drush, commit it, and
import it elsewhere:

- \`drush config:export\` (\`cex\`) → dumps DB config into \`config/sync/*.yml\`
- \`drush config:import\` (\`cim\`) → applies committed YAML back into the DB

So config *round-trips through the database* but its **source of truth is YAML in
git** — much closer to Symfony's mindset than content is.

### Content — what editors create

Content is the **data** layer: nodes (articles, pages), users, taxonomy terms,
comments, media. It's high-volume, created by editors, and it lives **only in the
database**. It is *not* exported to YAML and *not* in git. You move it with a DB
dump or a migration, never with \`config:import\`.

## The rule of thumb

- Would every environment have the *same* value? → **config** (in git as YAML).
- Is it created by editors and unique per environment? → **content** (DB only).

An "Article" content type is config. The 500 articles are content. The field
*Body* is config; the text typed into Body on article #42 is content.

Internally these map to **config entities** (\`node.type.article\`, a Views view)
versus **content entities** (\`node\`, \`user\`, \`taxonomy_term\`) — content
entities are fieldable and revisionable; config entities are neither.
`,

  comparisons: [
    {
      label: "Defining an entity's fields",
      intro:
        "You want an 'Article' with a title, body, and tags. In Symfony you write a class and migrate; in Drupal a site builder clicks it into being and it becomes exportable config.",
      php: `// Symfony: fields are typed PHP properties on a Doctrine entity.
#[ORM\\Entity]
class Article
{
    #[ORM\\Column(length: 255)]
    private string $title;

    #[ORM\\Column(type: 'text')]
    private string $body;
}
// Then: bin/console make:migration && doctrine:migrations:migrate`,
      ts: `# Drupal: no PHP. A site builder adds fields at
#   /admin/structure/types/manage/article/fields
# The field DEFINITION is exported as config YAML:
#   field.field.node.article.body.yml
# and committed to git via  drush cex.
# Adding a field ships NO migration you write by hand.`,
      note:
        "The Doctrine class IS the schema. In Drupal the schema is data a site builder authored, captured as YAML — you rarely define fields in PHP.",
      rightLang: "yaml",
    },
    {
      label: "A listing page",
      intro:
        "'Show the 10 newest published articles as a page at /news.' In Symfony that's a controller + query + template; in Drupal it's typically a Views config entity built in the UI.",
      php: `// Symfony: a route, a controller, a DQL query, a Twig template.
#[Route('/news', name: 'news')]
public function news(ArticleRepository $repo): Response
{
    return $this->render('news.html.twig', [
        'articles' => $repo->findLatestPublished(10),
    ]);
}`,
      ts: `// Drupal: build it in the Views UI (/admin/structure/views).
// No controller, no query, no template file authored.
// The whole page is one config entity exported as YAML:
//   views.view.news.yml
// It declares the filters (published, type=article),
// sort (created DESC), a pager of 10, and the /news path.`,
      note:
        "A large fraction of 'pages' in Drupal are Views config, not routes+controllers. The listing lives in YAML, not in a PHP method.",
    },
    {
      label: "Moving structure between environments",
      intro:
        "Promote your new content type and fields from dev to production without touching the live editors' content.",
      php: `# Symfony: schema changes travel as migration classes in git.
git pull
bin/console doctrine:migrations:migrate
# Editor data lives only in each env's DB; migrations
# change structure, not rows.`,
      ts: `# Drupal: structure travels as exported config YAML in git.
git pull
drush config:import   # alias: drush cim
# Content (nodes, users, terms) is NOT touched by cim —
# it lives only in the DB, moved via a dump if ever needed.`,
      note:
        "config:import is the deploy step for structure — the moral equivalent of running migrations. It never imports content.",
      leftLang: "bash",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Model Drupal's classifier: given a bundle of 'things', decide which are config (exported to YAML/git) and which are content (DB only). Predict the split, then run.",
    code: `<?php
// A tiny stand-in for how Drupal sorts its data into two buckets.
// Config = structure, exportable to YAML, versioned.
// Content = editor data, database only.

$items = [
    'node.type.article'      => 'config',   // the "Article" content type
    'field.field.node.article.body' => 'config', // the Body field def
    'views.view.news'        => 'config',   // a listing page
    'user.role.editor'       => 'config',   // a role + its permissions
    'node:42'                => 'content',  // an actual article
    'user:7'                 => 'content',  // an actual account
    'taxonomy_term:15'       => 'content',  // an actual tag
];

$exported = [];   // goes to config/sync/*.yml and into git
$dbOnly   = [];   // stays in the database, never in git

foreach ($items as $name => $kind) {
    if ($kind === 'config') {
        $exported[] = $name . '.yml';
    } else {
        $dbOnly[] = $name;
    }
}

echo "drush cex writes to config/sync:\\n";
foreach ($exported as $file) {
    echo "  - " . $file . "\\n";
}

echo "Never exported (content, DB only):\\n";
foreach ($dbOnly as $row) {
    echo "  - " . $row . "\\n";
}

echo "\\nConfig files in git: " . count($exported) . "\\n";
echo "Content rows skipped: " . count($dbOnly) . "\\n";`,
    output: `drush cex writes to config/sync:
  - node.type.article.yml
  - field.field.node.article.body.yml
  - views.view.news.yml
  - user.role.editor.yml
Never exported (content, DB only):
  - node:42
  - user:7
  - taxonomy_term:15

Config files in git: 4
Content rows skipped: 3`,
  },

  keyPoints: [
    "In Symfony the app's shape is code; in Drupal much of it is DATA a site builder creates in the admin UI (content types, fields, view displays, Views listings, roles).",
    "Config = structure (content types, fields, Views, roles, settings): low-volume, exportable to YAML, version-controlled — its source of truth is git.",
    "Content = editor data (nodes, users, taxonomy terms, media): high-volume, database-only, never exported to YAML or committed.",
    "drush config:export (cex) and config:import (cim) round-trip config through git — cim is the deploy step for structure, the moral equivalent of running migrations.",
    "Rule of thumb: same value on every environment → config; unique per environment and editor-created → content.",
    "This is why 'it depends on the site config' is a real answer — the behaviour genuinely lives in YAML or the DB, not necessarily in the repo's PHP.",
  ],

  interview: [
    {
      q: "In Drupal, what is the difference between configuration and content, and why does it matter for deployment?",
      a: "Configuration is the site's *structure* — content types, field definitions, view displays, Views listings, roles, and settings — and it is exportable to YAML and kept in version control. Content is the editor-created *data* — nodes, users, taxonomy terms, media — and it lives only in the database. It matters for deployment because config travels through git and is applied with `drush config:import` on each environment (the equivalent of running Symfony migrations), whereas content is never in git and only moves via a database dump. Mixing them up — trying to `cim` content, or hand-editing structure directly on prod — is a classic source of broken deploys.",
    },
    {
      q: "A Symfony dev asks: where do I write the code for a content type and its fields? How do you answer?",
      a: "You mostly don't write code for it. In Symfony a content type would be a Doctrine entity class with typed properties and a migration; in Drupal a site builder creates the content type and adds fields through the admin UI at `/admin/structure/types`, and the definitions become **config entities** stored as YAML like `node.type.article.yml` and `field.field.node.article.body.yml`. You then run `drush config:export` to capture that YAML into git. You *can* define fields or entire entity types in PHP for programmatic cases, but the day-to-day path is UI-driven config, which is exactly the mental flip Symfony devs have to make.",
    },
    {
      q: "Why is 'it depends on the site config' a legitimate answer in Drupal when it usually isn't in Symfony?",
      a: "Because in Drupal a large amount of behaviour is data, not code. Whether a page exists at `/news`, what fields an Article has, which roles can edit it, and how it renders are all decisions captured as config (Views, field definitions, view displays, permissions) rather than committed PHP logic. Two sites running identical module code can behave completely differently based purely on their exported config and their content. So without seeing the config you genuinely cannot say how the site behaves — unlike Symfony, where routes, entities, and forms are all right there in the source.",
    },
  ],

  quiz: [
    {
      question:
        "Which of these is CONTENT (database-only), not configuration?",
      options: [
        "The 'Article' content type",
        "The definition of the 'Body' field on Article",
        "A published article node titled 'Hello World'",
        "A Views listing that shows the latest articles",
      ],
      answerIndex: 2,
      explain:
        "The content type, the field definition, and the Views listing are all config (structure, exported to YAML). The actual article node is editor-created data that lives only in the database and is never exported with drush cex.",
    },
    {
      question:
        "During a deploy, which command applies structural changes (new fields, updated view displays) that arrived in git?",
      options: [
        "drush config:import (cim)",
        "drush config:export (cex)",
        "bin/console doctrine:migrations:migrate",
        "drush cron",
      ],
      answerIndex: 0,
      explain:
        "config:import (cim) reads the committed YAML in the config sync directory and applies it to the database — the deploy-time equivalent of running migrations. config:export (cex) goes the other way (DB → YAML). Doctrine migrations are Symfony, not Drupal.",
    },
    {
      question:
        "A Symfony developer wants a page at /news showing the 10 newest articles. What is the most idiomatic Drupal approach?",
      options: [
        "Write a route attribute, a controller, a DQL query, and a Twig template",
        "Build a Views listing in the admin UI, which becomes an exportable config entity",
        "Add rows to a content-only database table",
        "Hardcode the article list in settings.php",
      ],
      answerIndex: 1,
      explain:
        "Listing pages are typically built with Views in the admin UI. The result is a single config entity (e.g. views.view.news.yml) declaring the filters, sort, pager, and path — no controller, query, or template you author by hand — and it exports to git like any other config.",
    },
  ],
};

export default lesson;

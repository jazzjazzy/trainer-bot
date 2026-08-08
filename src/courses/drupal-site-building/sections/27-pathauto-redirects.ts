import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "pathauto-redirects",
  title: "URL Aliases, Pathauto & Redirects",
  part: "Users, Config & Handoff",
  estMinutes: 12,
  summary:
    "Core gives every node a manual URL alias field; Pathauto turns aliasing into per-bundle token patterns (config), Token supplies the placeholders, and Redirect auto-creates 301s when aliases change — the slug system you'd code in Symfony becomes three modules and zero PHP.",

  concept: `
## Aliases are presentation, not identity

Every node's canonical route is \`/node/42\` — think of it as the Symfony route
\`/node/{node}\` that never changes. Core's **path** module adds a "URL alias"
box to the node edit form: type \`/about-us\` and Drupal stores a
\`path_alias\` entity mapping that pretty path to the internal one. Inbound, a
path processor resolves the alias back to \`/node/42\` before routing; outbound,
every link Drupal renders swaps in the current alias. That's the whole trick —
and it's why you link to *entities* (menu items, link fields, entity references
all store \`entity:node/42\`), never to alias strings. Rename the alias and
every link updates itself.

Manual per-node aliases don't scale past a demo, which is why real sites
install three contrib staples: **Pathauto**, **Token**, and **Redirect**.

## Pathauto: the slug generator as config

\`Configuration > Search and metadata > URL aliases > Patterns > Add Pathauto
pattern\`: pick a pattern type (Content, Taxonomy term, User), a path pattern
like \`/blog/[node:title]\`, and which bundles it applies to. Saving an Article
titled "Drupal & Symfony: Better Together!" now yields
\`/blog/drupal-symfony-better-together\` — lowercasing, punctuation stripping,
the \`-\` separator, max length, and transliteration all come from the
**Settings** tab (\`pathauto.settings\`), not from a slugger you wrote.

The placeholders come from the **Token** module. The pattern form's "Browse
available tokens" link opens a tree of everything on the entity:
\`[node:title]\`, \`[node:created:custom:Y]\`, \`[term:name]\`, even chained
field tokens like \`[node:field_topics:entity:name]\` — so
\`/[node:field_topics:entity:name]/[node:title]\` builds category-prefixed URLs
with no code. In Symfony this whole layer is a slug column, a lifecycle
listener, and a route requirement per entity; here it's **one config entity per
bundle** (\`pathauto.pattern.blog_posts\`) that \`drush cex\` exports.

## Redirect: SEO safety when slugs move

Retitling a node regenerates its alias — and every inbound link and search
result pointing at the old URL would 404. The **Redirect** module's settings
(\`Configuration > Search and metadata > URL redirects > Settings\`) include
"Automatically create redirects when URL aliases are changed": the old alias
becomes a 301 to the entity automatically. The same screen manages manual
redirects (marketing vanity URLs, migrated legacy paths), and the bundled
\`redirect_404\` submodule logs real 404s so you can fix dead links from the UI.

## The config/content split, one more time

- **Config, exported**: \`pathauto.pattern.*\`, \`pathauto.settings\`,
  \`redirect.settings\`.
- **Content, never exported**: the generated \`path_alias\` entities and the
  redirect rows themselves.

Deploy the pattern with \`drush cim\`, then backfill existing content on each
environment via \`URL aliases > Bulk generate\` — a batch job that applies each
bundle's pattern to un-aliased (or all) content. The discipline to keep:
aliases are a skin over stable canonical routes. Never hardcode an alias in
code, config, or a menu link — reference the entity and let the alias layer do
its job.
`,

  comparisons: [
    {
      label: "Slug generation per bundle",
      intro:
        "In Symfony the URL scheme for a blog is a slug column, a lifecycle listener, and a hardcoded route. In Drupal it's one Pathauto pattern config entity per bundle — the URL scheme becomes deployable YAML.",
      php: `// Symfony: the slug is schema + code on every entity.
#[ORM\\Entity]
#[ORM\\HasLifecycleCallbacks]
class Post
{
    #[ORM\\Column(length: 255, unique: true)]
    private string $slug;

    #[ORM\\PrePersist]
    #[ORM\\PreUpdate]
    public function refreshSlug(): void
    {
        $this->slug = (new AsciiSlugger())
            ->slug($this->title)->lower()->toString();
    }
}

// ...and the URL scheme is baked into a route:
#[Route('/blog/{slug}', name: 'post_show')]
public function show(
    #[MapEntity(mapping: ['slug' => 'slug'])] Post $post,
): Response { /* ... */ }
// Moving /blog/... to /articles/... is a code deploy.`,
      ts: `# Clicks (after composer require drupal/pathauto —
#   pulls Token; enable Pathauto + Token. CTools still
#   downloads (legacy composer artifact) — on D10/D11
#   it is NOT a dependency; leave it uninstalled):
# Configuration > Search and metadata > URL aliases
#   > Patterns > Add Pathauto pattern
#   Pattern type: Content
#   Path pattern: /blog/[node:title]
#     ("Browse available tokens" opens the token tree)
#   Content type: Article  ->  Save
#
# drush cex -> config/sync/pathauto.pattern.blog_posts.yml
langcode: en
status: true
dependencies:
  module:
    - node
id: blog_posts
label: 'Blog posts'
type: 'canonical_entities:node'
pattern: '/blog/[node:title]'
selection_criteria:
  9a4bfa61-8f6e-4f6b-a8d2-4c3f0f6f2e11:
    id: 'entity_bundle:node'
    negate: false
    uuid: 9a4bfa61-8f6e-4f6b-a8d2-4c3f0f6f2e11
    context_mapping:
      node: node
    bundles:
      article: article
selection_logic: and
weight: 0
relationships: {  }`,
      note:
        "Cleaning (lowercase, punctuation, the '-' separator, max length, transliteration) lives in pathauto.settings — the Settings tab — not in code. Want category-prefixed URLs? Change the pattern to /[node:field_topics:entity:name]/[node:title]: a config edit, not a deploy.",
    },
    {
      label: "301s when a slug changes",
      intro:
        "Renaming content must not break inbound links. In Symfony you build slug history and serve the 301 yourself; in Drupal the Redirect module watches alias changes and creates the 301 for you.",
      php: `// Symfony: slug history + a manual 301 — all yours.
#[ORM\\Entity]
class PostSlugHistory
{
    #[ORM\\ManyToOne(targetEntity: Post::class)]
    private Post $post;

    #[ORM\\Column(length: 255, unique: true)]
    private string $oldSlug;
}

#[Route('/blog/{slug}', name: 'post_show')]
public function show(string $slug): Response
{
    $post = $this->posts->findOneBy(['slug' => $slug]);
    if (!$post) {
        $old = $this->history
            ->findOneBy(['oldSlug' => $slug]);
        if (!$old) {
            throw $this->createNotFoundException();
        }
        return $this->redirectToRoute('post_show', [
            'slug' => $old->getPost()->getSlug(),
        ], Response::HTTP_MOVED_PERMANENTLY);
    }
    // ...render
}
// Plus a listener writing history rows on each rename.`,
      ts: `# Clicks: composer require drupal/redirect; enable it.
# Configuration > Search and metadata > URL redirects
#   > Settings
#   [x] Automatically create redirects when URL aliases
#       are changed
#   Default redirect status: 301 (Moved Permanently)
#   Save
#
# drush cex -> config/sync/redirect.settings.yml (trimmed)
auto_redirect: true
default_status_code: 301
passthrough_querystring: true
ignore_admin_path: true
route_normalizer_enabled: true`,
      note:
        "The redirect rows themselves (source path, target entity, status code, hit count) are CONTENT entities managed on the URL redirects screen — settings are config, rows are data, the same split as aliases. The bundled redirect_404 submodule logs live 404s so editors can attach fixes from the UI.",
    },
    {
      label: "Backfilling aliases for existing content",
      intro:
        "The pattern arrives on a site that already has 4,000 nodes. In Symfony that's a console command you write and batch; in Drupal it's the Bulk generate tab.",
      php: `// Symfony: write a console command, batch it yourself.
#[AsCommand(name: 'app:backfill-slugs')]
class BackfillSlugsCommand extends Command
{
    public function __construct(
        private PostRepository $posts,
        private EntityManagerInterface $em,
        private SluggerInterface $slugger,
    ) { parent::__construct(); }

    protected function execute(InputInterface $in,
                               OutputInterface $out): int
    {
        $batch = 0;
        foreach ($this->posts->findBy(['slug' => null]) as $post) {
            $post->setSlug($this->slugger
                ->slug($post->getTitle())
                ->lower()->toString());
            if (++$batch % 100 === 0) {
                $this->em->flush();
            }
        }
        $this->em->flush();
        return Command::SUCCESS;
    }
}`,
      ts: `# No command to write. Clicks:
# Configuration > Search and metadata > URL aliases
#   > Bulk generate
#   [x] Content
#   ( ) Generate a URL alias for un-aliased paths only
#   -> Update
# Drupal batch-runs every bundle's pattern over the
# existing nodes. A "Delete aliases" tab resets if a
# pattern change needs a clean regenerate.

# The PATTERN deploys like any config:
drush cex -y
git add config/sync/pathauto.pattern.blog_posts.yml

# ...later, on prod:
drush cim -y      # imports the pattern (config)
# then run Bulk generate THERE. The generated aliases
# are content — they never travel in the config export.`,
      note:
        "With Redirect's auto_redirect on, a bulk REgeneration after a pattern change also mints 301s from every old alias to its replacement — the SEO-safe way to restructure a site's URLs from the admin UI.",
      leftLang: "php",
      rightLang: "bash",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Pathauto + Redirect in miniature: the patterns and cleaning settings play the role of CONFIG; the aliases and redirect rows the run produces are CONTENT. Predict both generated aliases and the auto-created 301 before you run it.",
    code: `<?php
// Pathauto in miniature: per-bundle patterns (CONFIG) drive alias
// generation; Redirect auto-creates a 301 when an alias changes.

$patterns = [                        // pathauto.pattern.* config entities
  'article' => '/blog/[node:title]',
  'event'   => '/events/[node:created:custom:Y]/[node:title]',
];
$settings = ['separator' => '-', 'max_length' => 100]; // pathauto.settings

// The "clean string" service: lowercase, punctuation -> separator.
function cleanSegment(string $raw, array $s): string {
  $slug = strtolower($raw);
  $slug = preg_replace('/[^a-z0-9]+/', $s['separator'], $slug);
  return substr(trim($slug, $s['separator']), 0, $s['max_length']);
}

function generateAlias(array $node, array $patterns, array $s): string {
  $replacements = [ // the Token module, in two lines
    '[node:title]' => cleanSegment($node['title'], $s),
    '[node:created:custom:Y]' => $node['created_year'] ?? '',
  ];
  return strtr($patterns[$node['bundle']], $replacements);
}

$aliases = [];   // path_alias entities (CONTENT, not config)
$redirects = []; // redirect entities  (CONTENT, not config)

function saveAlias(int $nid, string $alias, array &$aliases, array &$redirects): void {
  if (isset($aliases[$nid]) && $aliases[$nid] !== $alias) {
    // redirect.settings: auto_redirect: true, default_status_code: 301
    $redirects[$aliases[$nid]] = $alias;
  }
  $aliases[$nid] = $alias;
}

$post  = ['bundle' => 'article', 'title' => 'Drupal & Symfony: Better Together!'];
$event = ['bundle' => 'event', 'title' => 'Drupal Dev Days!', 'created_year' => '2026'];

saveAlias(1, generateAlias($post, $patterns, $settings), $aliases, $redirects);
saveAlias(7, generateAlias($event, $patterns, $settings), $aliases, $redirects);
echo "Generated aliases (canonical routes unchanged):\\n";
foreach ($aliases as $nid => $alias) {
  echo "  /node/$nid -> $alias\\n";
}

// An editor retitles node 1; Pathauto regenerates, Redirect steps in.
$post['title'] = 'Drupal and Symfony, a Love Story';
saveAlias(1, generateAlias($post, $patterns, $settings), $aliases, $redirects);

echo "\\nAfter the title edit:\\n";
echo "  /node/1 -> " . $aliases[1] . "\\n";
echo "\\nAuto-created redirects (301):\\n";
foreach ($redirects as $from => $to) {
  echo "  $from => $to\\n";
}`,
    output: `Generated aliases (canonical routes unchanged):
  /node/1 -> /blog/drupal-symfony-better-together
  /node/7 -> /events/2026/drupal-dev-days

After the title edit:
  /node/1 -> /blog/drupal-and-symfony-a-love-story

Auto-created redirects (301):
  /blog/drupal-symfony-better-together => /blog/drupal-and-symfony-a-love-story`,
  },

  keyPoints: [
    "Canonical routes never change: /node/42 stays underneath, and a path_alias entity maps the pretty URL onto it — aliases are presentation, so always link to entities, never to alias strings.",
    "Core's path module = manual per-node aliases; Pathauto makes aliasing per-bundle CONFIG: a pattern type plus a token pattern like /blog/[node:title], with cleaning rules (lowercase, separator, length, transliteration) in pathauto.settings.",
    "The Token module supplies the placeholders — [node:title], [node:created:custom:Y], chained field tokens like [node:field_topics:entity:name] — browsable from the pattern form's token tree.",
    "The Redirect module's auto_redirect setting mints a 301 from the old alias whenever an alias changes, and its UI manages manual redirects plus (via redirect_404) a live 404 log.",
    "Config vs content: pathauto.pattern.*, pathauto.settings, and redirect.settings export with drush cex; the generated aliases and redirect rows are content and never leave the database.",
    "Deploy the pattern, then run URL aliases > Bulk generate on each environment to backfill existing content — there's no backfill command to write.",
  ],

  interview: [
    {
      q: "How do Drupal URL aliases work under the hood, and why does the canonical route stay /node/ID?",
      a: "An alias is a `path_alias` content entity mapping a public path like `/blog/my-post` to an internal one like `/node/42`. On the way in, a path processor resolves the alias to the internal path before routing runs — so the router only ever knows `/node/{node}`, much like a fixed Symfony route. On the way out, Drupal rewrites rendered links to show the current alias. Keeping the canonical route stable means aliases are pure presentation: menu links, link fields, and entity references store `entity:node/42`, so renaming an alias updates every link on the site without touching content. That's also why you never hardcode alias strings in code or config.",
    },
    {
      q: "Walk me through a production-grade URL setup for a Drupal blog, and what each piece contributes.",
      a: "Install Pathauto, Token, and Redirect. Pathauto adds per-bundle patterns at Configuration > Search and metadata > URL aliases > Patterns — e.g. `/blog/[node:title]` for Articles — and its Settings tab controls cleaning: lowercasing, punctuation, the separator, max length, transliteration. Token provides the placeholder vocabulary, including chained field tokens like `[node:field_topics:entity:name]`, browsable from the pattern form. Redirect, with 'automatically create redirects when URL aliases are changed' enabled, converts every alias change into a 301 so retitled posts don't 404 old inbound links. Each pattern is a config entity (`pathauto.pattern.blog_posts`) that exports with `drush cex`, so the whole URL strategy is reviewable in git — the Symfony equivalent (slug columns, listeners, route changes, redirect handling) is all code.",
    },
    {
      q: "In the alias/redirect stack, what is config and what is content — and how does that shape your deployment process?",
      a: "The patterns (`pathauto.pattern.*`), Pathauto's cleaning settings, and `redirect.settings` are config entities: they export to YAML, travel in git, and import with `drush cim`. The generated aliases (`path_alias` entities) and the redirect rows are content: environment-specific database rows that `drush cex` never touches. So deployment is two steps: import the pattern config, then run URL aliases > Bulk generate on that environment to backfill aliases for pre-existing content. It's the same split as vocabularies versus terms — structure deploys, data doesn't — and it means you should never write config or code that assumes a specific alias string exists.",
    },
    {
      q: "An editor retitles a popular article. What happens to the URL, and how do you make that safe for SEO without code?",
      a: "With Pathauto, saving the node regenerates the alias from the pattern, so the URL changes to match the new title (Pathauto's update behavior is itself configurable — leave the old alias, keep both, or replace it). With the Redirect module's auto-create option on, replacing the alias automatically creates a 301 redirect from the old path to the node, so search engines transfer ranking and old links keep resolving. Nothing 404s because the canonical `/node/ID` route never moved — only the presentation layer changed. In Symfony you'd need a slug-history table, a listener, and redirect logic in the controller to get the same guarantee; here it's two checkboxes of config.",
    },
  ],

  quiz: [
    {
      question:
        "You change the Article pattern from /blog/[node:title] to /articles/[node:title], export, and run drush cim on prod. What happens to the 500 existing article URLs?",
      options: [
        "They all switch to /articles/... immediately — config import rewrites aliases",
        "Nothing yet: aliases are content, so existing ones keep their old paths until nodes are re-saved or you run Bulk generate",
        "They 404 until cron runs",
        "drush cim fails because aliases would conflict",
      ],
      answerIndex: 1,
      explain:
        "The pattern is config, but generated aliases are content entities that cim never touches. Existing nodes keep /blog/... until re-saved or bulk-updated from URL aliases > Bulk generate. With Redirect's auto_redirect enabled, that regeneration also creates 301s from each old alias — the safe way to roll out a URL restructure.",
    },
    {
      question:
        "Marketing worries that retitling posts will break links shared on social media. Which setup addresses this with zero code?",
      options: [
        "Disable Pathauto so URLs never change",
        "Train editors to manually add old URLs to robots.txt",
        "Enable the Redirect module's 'automatically create redirects when URL aliases are changed' setting — old aliases 301 to the node",
        "Hardcode both URLs in the theme's routing file",
      ],
      answerIndex: 2,
      explain:
        "Redirect's auto_redirect setting watches alias changes and mints a 301 from the retired alias to the entity, preserving inbound links and search ranking. Disabling Pathauto sacrifices the URL strategy, and the other options aren't real mechanisms — the point is that slug-history handling you'd code in Symfony is a checkbox here.",
    },
    {
      question:
        "What does the token [node:field_topics:entity:name] in a Pathauto pattern do, and what makes it available?",
      options: [
        "It's invalid — patterns can only use [node:title]",
        "It inserts the referenced Topics term's name into the alias; the Token module exposes chained entity/field tokens in the pattern form's token browser",
        "It runs a Views query at render time",
        "It only works if you implement hook_token_info() in a custom module",
      ],
      answerIndex: 1,
      explain:
        "Token (a Pathauto dependency) exposes every field on the entity as tokens, including chained hops through entity references — so a pattern like /[node:field_topics:entity:name]/[node:title] yields /php/my-post with no code. The 'Browse available tokens' link on the pattern form lists the full tree. Custom hook_token_info() is only for tokens Drupal doesn't already provide.",
    },
    {
      question:
        "Which of these ends up in config/sync after drush cex on a site using Pathauto and Redirect?",
      options: [
        "The pattern (pathauto.pattern.blog_posts), pathauto.settings, and redirect.settings — but no aliases and no redirect rows",
        "Every generated alias, so prod URLs match dev",
        "The redirect rows, since 301s are part of site structure",
        "Nothing — URL handling is entirely content",
      ],
      answerIndex: 0,
      explain:
        "Patterns and module settings are config entities and export to YAML. The path_alias entities Pathauto generates and the redirect entities Redirect creates are content: per-environment database rows. That's why deployment is 'import the pattern, then bulk-generate aliases on each environment' — the same structure-vs-data split as vocabularies and terms.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "contrib-before-custom",
  title: "Contrib First: Finding Modules Instead of Writing Them",
  part: "The Site-Builder Mindset",
  estMinutes: 12,
  summary:
    "Before writing a custom module, search drupal.org's ~50,000 contrib modules — learn to evaluate a project page in a minute, install with composer + drush, and know the seven modules that belong on almost every site.",

  concept: `
## The reflex to unlearn

In Symfony, "we need 301 redirects when editors rename pages" is a ticket you
*implement*: a listener, a table, an admin CRUD. In Drupal it is a **search**:
drupal.org/project hosts roughly **50,000 contributed modules**, and the overlap
with your backlog is enormous. The site-builder rule of thumb is:

1. **Core first** — can a content type, view, or block do it?
2. **Contrib second** — has someone already built and battle-tested it?
3. **Custom last** — and only for the slice contrib genuinely can't cover.

This is a bigger cultural shift than it sounds. Packagist has plenty of Symfony
bundles, but the ecosystem is smaller and **code-centric**: a bundle hands you
classes and services to wire up. A Drupal contrib module usually ships an
**admin UI, permissions, and exportable config** — it extends the *site
builder's* toolkit, not just the developer's. And it lives in one centralized
place with usage stats and a shared security team, which makes evaluation fast.

### Reading a project page in one minute

Every drupal.org project page gives you the signals you need:

- **Usage stats** — "x sites report using this module." Six figures means the
  edge cases you'd hit have been hit (and fixed) already.
- **Compatibility badge** — does a release support Drupal 10 *and* 11? Under the
  hood this is the module's \`core_version_requirement\` (e.g. \`^10 || ^11\`).
- **Security shield** — "Covered by the security advisory policy." The Drupal
  Security Team triages and publishes advisories for covered projects.
- **Last release date** — a stable release in the last year beats a busy but
  never-released dev branch.
- **Issue queue health** — not *how many* issues (popular modules have
  thousands) but whether maintainers respond and merge.

One trap worth knowing for interviews: security advisories are only issued for
**stable releases of covered projects**. Run a \`-dev\`, alpha, beta, or RC
build and you get **no advisories**, shield or not — you're on your own.

### Installing is two separate steps

\`\`\`bash
composer require drupal/token   # DOWNLOAD: code lands in web/modules/contrib/
drush en token -y               # ENABLE: recorded in core.extension config
\`\`\`

Composer only puts code on disk (the \`drupal/recommended-project\` template
preconfigures the packages.drupal.org repository, so \`drupal/*\` package names
resolve). Nothing changes on the site until \`drush en\` (alias of
\`drush pm:install\`) flips it on — which, as you saw last lesson, is a
**config** change in \`core.extension\`. Deploys carry both halves:
\`composer.lock\` ships the code, exported config ships the enabled state.

### Seven modules that are basically core

Install these early on almost any build: **Admin Toolbar** (drop-down admin
menus), **Token** (browsable \`[node:title]\`-style placeholders other modules
consume), **Pathauto** (URL alias patterns from tokens), **Redirect** (301s,
auto-created when aliases change), **Webform** (a form builder that replaces
most FormTypes), **Paragraphs** (editor-composable content components), and
**Metatag** (per-bundle SEO tags). Custom code is for the 5% these can't do.
`,

  comparisons: [
    {
      label: "Auto-generating URL aliases",
      intro:
        "Every article should live at /blog/its-title. The Symfony instinct is a slugger wired into a Doctrine listener; the Drupal answer is the Pathauto contrib module and one exported pattern.",
      php: `// src/EventListener/ArticleSlugListener.php — you own slugs forever
#[AsEntityListener(event: Events::prePersist, entity: Article::class)]
class ArticleSlugListener
{
    public function __construct(private SluggerInterface $slugger) {}

    public function prePersist(Article $article): void
    {
        $slug = strtolower($this->slugger->slug($article->getTitle()));
        $article->setSlug('/blog/' . $slug);
    }
}
// ...plus a unique index, uniqueness collision handling, a
// /blog/{slug} route, and a migration. All yours to maintain.`,
      ts: `# composer require drupal/pathauto && drush en pathauto -y
# Configuration > Search and metadata > URL aliases > Patterns
#   > Add Pathauto pattern: type Content, bundle Article,
#     pattern /blog/[node:title]. Export produces:

# pathauto.pattern.blog_articles.yml
id: blog_articles
label: 'Blog articles'
type: 'canonical_entities:node'
pattern: '/blog/[node:title]'
selection_criteria:
  6a1fb1a2-5d8e-4c37-9d5c-2f6a0d9b3e11:
    id: 'entity_bundle:node'
    negate: false
    uuid: 6a1fb1a2-5d8e-4c37-9d5c-2f6a0d9b3e11
    context_mapping:
      node: node
    bundles:
      article: article
selection_logic: and
relationships: {  }
weight: 0
status: true`,
      note:
        "The pattern is a config entity: tokens come from the Token module, dedupe (-0, -1 suffixes) is built in, and editors never see any of it.",
      leftLang: "php",
      rightLang: "yaml",
    },
    {
      label: "301 redirects when URLs change",
      intro:
        "An editor renames a page and the old URL must 301 to the new one. In Symfony you'd build a lookup table and a request listener; in Drupal the Redirect module creates the redirect automatically the moment the alias changes.",
      php: `// src/EventListener/LegacyRedirectListener.php
#[AsEventListener(event: KernelEvents::REQUEST, priority: 64)]
class LegacyRedirectListener
{
    public function __construct(private Connection $db) {}

    public function onKernelRequest(RequestEvent $event): void
    {
        $path = $event->getRequest()->getPathInfo();
        $target = $this->db->fetchOne(
            'SELECT target FROM legacy_redirect WHERE source = ?',
            [$path],
        );
        if ($target !== false) {
            $event->setResponse(new RedirectResponse($target, 301));
        }
    }
}
// ...plus the table, an admin CRUD for it, and someone must
// remember to add a row every time a page is renamed.`,
      ts: `# composer require drupal/redirect && drush en redirect -y
# Configuration > Search and metadata > URL redirects
#   Editors manage redirects in a UI; renaming a page with a
#   Pathauto alias creates the 301 automatically. Settings export:

# redirect.settings.yml (excerpt)
auto_redirect: true          # old alias -> new alias on change
default_status_code: 301
passthrough_querystring: true`,
      note:
        "Pathauto + Redirect is the canonical pairing: aliases regenerate on rename, and Redirect quietly preserves every old URL.",
      leftLang: "php",
      rightLang: "yaml",
    },
    {
      label: "Installing contrib: download, then enable",
      intro:
        "The framework habit is to scaffold yet another custom module. The Drupal habit is composer require (code on disk) followed by drush en (state in config) — two distinct steps with two distinct deployment artifacts.",
      php: `# The instinct: build it yourself
mkdir -p web/modules/custom/my_tokens/src
vim web/modules/custom/my_tokens/my_tokens.info.yml
vim web/modules/custom/my_tokens/my_tokens.module
# ...then write, test, document, and patch it forever.
# You now own bugs that Token's hundreds of thousands of
# installs found and fixed years ago.`,
      ts: `# Step 1 — DOWNLOAD. Composer resolves drupal/* names via the
# packages.drupal.org repo (preconfigured by recommended-project)
# and puts code in web/modules/contrib/. Site unchanged.
composer require drupal/token drupal/admin_toolbar

# Step 2 — ENABLE. drush en (alias of pm:install) records the
# modules in core.extension config and imports their defaults.
drush en token admin_toolbar admin_toolbar_tools -y
drush cr

# Deploys carry both halves:
#   composer.lock        -> which code is on disk
#   core.extension.yml   -> which modules are on`,
      note:
        "composer require alone changes nothing on the site; drush en alone fails if the code isn't downloaded. You always need both.",
      leftLang: "bash",
      rightLang: "bash",
    },
    {
      label: "A contact form without a FormType",
      intro:
        "A contact form with validation and an email notification. Symfony: FormType + controller + Mailer + template — a deploy per change. Drupal: the Webform module, built in the UI, exported as config.",
      php: `// src/Form/ContactType.php
class ContactType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('name', TextType::class, ['constraints' => [new NotBlank()]])
            ->add('email', EmailType::class, [
                'constraints' => [new NotBlank(), new Email()],
            ])
            ->add('message', TextareaType::class, ['constraints' => [new NotBlank()]]);
    }
}
// ...plus a controller to render/validate, MailerInterface
// wiring, a Twig template, and a flash message. Adding a
// field next month is another code deploy.`,
      ts: `# composer require drupal/webform && drush en webform webform_ui -y
# Structure > Webforms > Add webform > drag elements into place,
#   add an Email handler. Editors change the form with no deploy.

# webform.webform.contact.yml (excerpt)
id: contact
title: Contact
elements: |-
  name:
    '#type': textfield
    '#title': 'Your name'
    '#required': true
  email:
    '#type': email
    '#title': 'Your email'
    '#required': true
  message:
    '#type': textarea
    '#title': Message
    '#required': true
handlers:
  notify_team:
    id: email
    status: true
    settings:
      to_mail: team@example.com`,
      note:
        "Webform stores the element tree as data inside a config entity — the form's structure is content-editor territory, not a PHP class.",
      leftLang: "php",
      rightLang: "yaml",
    },
  ],

  playground: {
    intro:
      "This models a drupal.org project page as data and runs the site-builder's one-minute evaluation: compatibility badge, security shield, usage, freshness, maintainer activity. Predict which candidate earns a composer require.",
    lang: "php",
    code: `<?php
// Model the drupal.org project page as data, then evaluate it the way a
// site builder does before typing "composer require".
$candidates = [
  'pathauto' => [
    'core'               => '^10 || ^11',
    'security'           => true,    // green shield: covered by the security team
    'usage'              => 610243,  // "x sites report using this module"
    'days_since_release' => 90,
    'maintainers'        => 4,
  ],
  'auto_slug_legacy' => [
    'core'               => '^7',
    'security'           => false,
    'usage'              => 812,
    'days_since_release' => 2400,
    'maintainers'        => 0,
  ],
];

function evaluate(string $name, array $m): void {
  $checks = [
    "Drupal 10/11 compatible ({$m['core']})" =>
      str_contains($m['core'], '10') || str_contains($m['core'], '11'),
    'Security-team coverage (green shield)' => $m['security'],
    sprintf('Widely used (%s sites)', number_format($m['usage'])) =>
      $m['usage'] >= 5000,
    "Release within 12 months ({$m['days_since_release']} days ago)" =>
      $m['days_since_release'] <= 365,
    "Active maintainers ({$m['maintainers']})" => $m['maintainers'] > 0,
  ];

  echo $name . "\\n";
  $passed = 0;
  foreach ($checks as $label => $ok) {
    echo '  [' . ($ok ? 'x' : ' ') . "] {$label}\\n";
    $passed += $ok ? 1 : 0;
  }
  echo $passed === count($checks)
    ? "  VERDICT: composer require drupal/{$name}\\n\\n"
    : "  VERDICT: keep looking -- or write custom as a last resort\\n\\n";
}

foreach ($candidates as $name => $meta) {
  evaluate($name, $meta);
}`,
    output: `pathauto
  [x] Drupal 10/11 compatible (^10 || ^11)
  [x] Security-team coverage (green shield)
  [x] Widely used (610,243 sites)
  [x] Release within 12 months (90 days ago)
  [x] Active maintainers (4)
  VERDICT: composer require drupal/pathauto

auto_slug_legacy
  [ ] Drupal 10/11 compatible (^7)
  [ ] Security-team coverage (green shield)
  [ ] Widely used (812 sites)
  [ ] Release within 12 months (2400 days ago)
  [ ] Active maintainers (0)
  VERDICT: keep looking -- or write custom as a last resort`,
  },

  keyPoints: [
    "The site-builder order of operations: **core first, contrib second, custom last** — drupal.org hosts ~50,000 contrib modules, so search before you scaffold.",
    "Evaluate a project page by its **usage stats**, **Drupal 10/11 compatibility badge**, **security-coverage shield**, **last stable release date**, and **issue-queue responsiveness**.",
    "Security advisories only cover **stable releases of covered projects** — dev/alpha/beta/RC builds get no advisories even when the project shows the shield.",
    "Installing contrib is two steps: `composer require drupal/x` downloads code to `web/modules/contrib/`; `drush en x` (alias of `pm:install`) turns it on by recording it in `core.extension` config.",
    "Seven near-core modules to know cold: Admin Toolbar, Token, Pathauto, Redirect, Webform, Paragraphs, Metatag.",
    "Unlike code-centric Symfony bundles, Drupal contrib typically ships an admin UI, permissions, and exportable config — it extends what site builders can click, not just what developers can call.",
  ],

  interview: [
    {
      q: "A stakeholder asks for automatic 301 redirects when editors rename pages. Walk me through your process on a Drupal project.",
      a: "I would *not* start writing a request listener like I would in Symfony. First I check whether core covers it (it doesn't, beyond basic path aliases), then I search drupal.org/project — and this one is a solved problem: the **Redirect** module, paired with **Pathauto**, creates a 301 automatically whenever an alias changes. I'd evaluate the project page (usage in the hundreds of thousands, D10/11 releases, security coverage), then \`composer require drupal/redirect\`, \`drush en redirect\`, and export the settings as config. Custom code only enters if there's a genuinely site-specific rule contrib can't express — and even then, often as a small module *alongside* contrib, not instead of it.",
    },
    {
      q: "How do you judge whether a contrib module is safe to add to a client project?",
      a: "Five signals on the project page: **usage stats** (a six-figure install base means the edge cases are already found), a release with a **Drupal 10/11 compatibility badge**, the **'Covered by the security advisory policy' shield**, a **recent stable release**, and an **issue queue where maintainers actually respond**. The critical nuance: the security team only issues advisories for *stable releases of covered projects* — if I'm forced onto a dev or beta release, I treat it as unvetted code and review it myself. I also skim the module's own code briefly; as a PHP developer that costs me ten minutes and occasionally rules a candidate out.",
    },
    {
      q: "What's the difference between composer require drupal/token and drush en token, and why does Drupal need both?",
      a: "They operate on different layers. \`composer require\` is pure dependency management: it resolves the package from packages.drupal.org (preconfigured in \`drupal/recommended-project\`) and puts code on disk in \`web/modules/contrib/\` — the running site is completely unaffected. \`drush en\` (alias of \`pm:install\`) is a *config* operation: it records the module in \`core.extension\`, runs its install hooks, and imports its default configuration. That split mirrors Drupal's code-versus-config architecture: \`composer.lock\` deploys which code exists, exported config deploys which modules are active. Symfony has no equivalent second step — a bundle in \`bundles.php\` is on because the code deploy says so.",
    },
    {
      q: "How does the Drupal contrib ecosystem differ from Symfony bundles in practice?",
      a: "Scale and shape. Scale: one centralized catalog on drupal.org with ~50k modules, per-project usage statistics, and a shared security team publishing advisories — Packagist offers none of that vetting infrastructure for bundles. Shape: a bundle is developer-facing — classes and services you still have to wire and build UI around. A typical Drupal contrib module ships a finished feature: admin screens, permissions, and config entities that export to YAML. Webform is the sharpest example — it replaces the entire FormType-controller-Mailer-template stack with something a content editor operates. The practical effect is that a Drupal team ships many features with zero custom PHP, which is exactly the habit a framework developer has to consciously build.",
    },
  ],

  quiz: [
    {
      question:
        "A module's project page shows the 'Covered by the security advisory policy' shield, but you install its 8.x-2.0-beta1 release. What security advisory coverage do you have?",
      options: [
        "Full coverage — the shield applies to every release of the project",
        "None — advisories are only issued for stable releases, even of covered projects",
        "Partial coverage — advisories are published but delayed for pre-releases",
        "Coverage only if the module is also in the top 100 by usage",
      ],
      answerIndex: 1,
      explain:
        "The Drupal Security Team issues advisories only for stable releases of projects that opted into coverage. Dev, alpha, beta, and RC releases are explicitly not covered — running one means vetting the code yourself.",
    },
    {
      question:
        "You run composer require drupal/pathauto and nothing else. What is the state of your site?",
      options: [
        "Pathauto is installed and generating aliases",
        "Pathauto's code is on disk in web/modules/contrib/, but the site behaves exactly as before",
        "Pathauto appears enabled but is missing its default config",
        "Composer fails, because contrib modules can only be installed with drush",
      ],
      answerIndex: 1,
      explain:
        "Composer only downloads code (resolving drupal/* names via packages.drupal.org). The module does nothing until drush en / pm:install records it in core.extension config and imports its defaults — installing contrib is always the two steps.",
    },
    {
      question:
        "Editors keep renaming landing pages, and old URLs must keep working with 301s while new URLs follow a /section/page-title pattern. Which contrib pairing is the standard answer?",
      options: [
        "Token + Metatag",
        "Webform + Paragraphs",
        "Pathauto + Redirect",
        "Admin Toolbar + Token",
      ],
      answerIndex: 2,
      explain:
        "Pathauto generates aliases from token patterns like /section/[node:title], and Redirect (with auto_redirect enabled) creates a 301 from the old alias whenever the alias changes. Token and Metatag serve placeholders and SEO tags; Webform and Paragraphs solve different problems.",
    },
    {
      question:
        "Which signal on a drupal.org project page is the WEAKEST indicator of module health?",
      options: [
        "The raw number of open issues in the queue",
        "The number of sites reporting the module in use",
        "A stable release compatible with Drupal 10 and 11",
        "The date of the most recent release",
      ],
      answerIndex: 0,
      explain:
        "Popular modules accumulate thousands of open issues simply because they have huge audiences — what matters is whether maintainers respond and merge. Usage, D10/11-compatible stable releases, and release recency are all direct health signals.",
    },
  ],
};

export default lesson;

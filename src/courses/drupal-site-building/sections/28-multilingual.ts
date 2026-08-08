import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "multilingual",
  title: "Multilingual: Four Modules, Zero Code",
  part: "Users, Config & Handoff",
  estMinutes: 12,

  summary:
    "Core's four-module suite — Language, Interface Translation, Content Translation, Config Translation — replaces the translator YAML, LocaleListener, and Doctrine translatable extensions you would hand-wire in Symfony, with per-field content translatability as the standout.",

  concept: `
## Four modules where Symfony hand-wires three systems

Going multilingual in Symfony is a wiring project. UI strings route through the
translator and \`translations/messages.fr.yaml\` — but only the strings you
remembered to pipe through \`|trans\`. Locale detection means a \`{_locale}\`
route prefix plus \`LocaleListener\`, with session/browser fallbacks as a custom
subscriber. Content translation is not in core at all: you pull in Gedmo
Translatable or KnpLabs DoctrineBehaviors, migrate a translations table, and
translate entities through listener magic.

Drupal ships the whole stack as **four core modules** — enable them at
**Extend**, or \`drush pm:enable language locale content_translation
config_translation\`:

- **Language** — define languages and decide how one is chosen per request.
- **Interface Translation** (machine name \`locale\`) — translates the UI's
  thousands of built-in strings, mostly by downloading community-maintained
  \`.po\` files from localize.drupal.org.
- **Content Translation** — per-bundle, per-**field** opt-in translation of
  your content.
- **Config Translation** — translates the config itself: site name, field
  labels, Views titles.

### Detection is drag-and-drop

**Configuration > Regional and language > Languages**, *Detection and
selection* tab: an ordered chain of methods — **URL** (path prefix like
\`/fr\`, or one domain per language), **Session**, **User** (account
preference), **Browser** (Accept-Language), and **Selected language** as the
fallback. Drag to reorder, tick to enable; the chain exports to
\`language.types.yml\` and the per-method settings to
\`language.negotiation.yml\`. That is the \`LocaleListener\` you did not write.

### Per-field granularity is the standout

**Configuration > Regional and language > Content language and translation
settings** is a big checkbox matrix: which entity types, which bundles, and
inside each bundle which **fields** are translatable. A translated node is not
a second node — it is **one entity, one nid**, holding per-language values for
translatable fields only. Tick *Body*, untick *Image*: French and English
visitors read different body text but share the same hero image, and updating
that image updates every translation at once. No duplicate rows to sync, no
join tables. Editors get a **Translate** tab on each node.

### Which side of the config/content line?

- **Config**: language definitions (\`language.entity.fr\`), the detection
  chain, which bundles/fields are translatable
  (\`language.content_settings.*\` plus \`translatable: true\` on field
  config), and config translations themselves — exported into
  \`language/fr/\` subfolders of \`config/sync\`.
- **Content**: the actual translations of nodes, terms, and media. Database
  rows, invisible to \`drush cex\`.
- **Interface strings**: neither — \`locale\` keeps them in its own database
  tables, refreshed by \`drush locale:update\`, exportable as \`.po\`.

### The switcher, and the warning

The language switcher is a core block: **Structure > Block layout > Place
block > Language switcher** — once placed, ordinary block config. Final
warning: **enable multilingual early** if there is any real chance you need
it. Retrofitting means auditing every bundle-times-field for translatability
and revisiting aliases, menus, and blocks, while existing content sits in one
langcode. The four modules are cheap to switch on; the retrofit never is.
`,

  comparisons: [
    {
      label: "Add French + URL-prefix detection",
      intro:
        "Locale routing and detection in Symfony is framework config plus listeners you tune by hand. In Drupal it is two admin screens, and the result is two small config files.",
      leftLang: "yaml",
      php: `# config/packages/translation.yaml
framework:
  default_locale: en
  enabled_locales: ['en', 'fr']
  translator:
    default_path: '%kernel.project_dir%/translations'

# config/routes.yaml — every route gains a locale prefix
controllers:
  resource: ../src/Controller/
  type: attribute
  prefix: /{_locale}
  requirements:
    _locale: en|fr
  defaults:
    _locale: en
# Plus: LocaleListener maps _locale onto the request;
# want session or Accept-Language fallbacks? Write an
# event subscriber and order it yourself.`,
      ts: `# Click: Extend > enable 'Language'
# Configuration > Regional and language > Languages
#   > Add language > French
# Then the 'Detection and selection' tab:
#   drag URL to the top, enable Session + Browser below it
# drush cex ->
# config/sync/language.entity.fr.yml
langcode: en
status: true
dependencies: {  }
id: fr
label: French
direction: ltr
weight: 1
locked: false
---
# config/sync/language.negotiation.yml (method settings)
url:
  source: path_prefix   # or: domain (one host per language)
  prefixes:
    en: ''
    fr: fr
session:
  parameter: language
selected_langcode: site_default`,
      note:
        "The drag-ordered chain of detection methods lands in language.types.yml; each method's knobs (prefixes vs domains, the session parameter) land in language.negotiation.yml. URL prefix vs domain is one radio button.",
    },
    {
      label: "Translating content: per-field opt-in",
      intro:
        "Symfony core has no content translation, so you bolt on a Doctrine extension and translate property-by-property through listeners. Drupal's checkbox matrix gives you the same granularity — and the untranslated fields stay shared.",
      php: `<?php
// Doctrine + Gedmo Translatable: wiring, not clicking.
use Gedmo\\Mapping\\Annotation as Gedmo;

#[ORM\\Entity]
class Article implements Translatable
{
    #[Gedmo\\Translatable]
    #[ORM\\Column(length: 255)]
    private string $title;

    #[Gedmo\\Translatable]
    #[ORM\\Column(type: 'text')]
    private string $body;

    #[ORM\\ManyToOne]              // shared image: just do not
    private ?MediaObject $image;   // annotate it — hope nobody does

    #[Gedmo\\Locale]
    private ?string $locale = null;
}
// Plus: register TranslatableListener, migrate the
// ext_translations table, call setTranslatableLocale()
// per request, eager-load to dodge N+1 on translations.`,
      ts: `# Click: Extend > enable 'Content Translation'
# Configuration > Regional and language >
#   Content language and translation settings:
#   [x] Content
#     [x] Article
#       [x] Title   [x] Body   [ ] Image   <- per FIELD
# drush cex ->
# config/sync/language.content_settings.node.article.yml
id: node.article
target_entity_type_id: node
target_bundle: article
default_langcode: site_default
language_alterable: true
third_party_settings:
  content_translation:
    enabled: true
# ...and every ticked field's own config file gains:
#   field.field.node.article.body.yml -> translatable: true
# Editors now see a Translate tab on each article.
# One node, one nid: Body forks per language, Image is
# shared by every translation.`,
      note:
        "Which fields are translatable is CONFIG and deploys with cex/cim. The French body text an editor types is CONTENT and stays in the database — same boundary as everywhere else in Drupal.",
    },
    {
      label: "Translating the config itself: site name, labels, Views titles",
      intro:
        "In Symfony, any UI-visible string must first become a trans key in your code before it can be localized. Drupal's Config Translation module adds a Translate tab to nearly every admin form — no key extraction step.",
      leftLang: "yaml",
      php: `# translations/messages.fr.yaml — every visible string
# must first be routed through the translator in code:
site.name: 'Ma Belle Boutique'
nav.latest_articles: 'Derniers articles'
form.body_label: 'Corps'

# ...then you edit templates and form types to use keys:
#   {{ 'site.name'|trans }}
#   ->add('body', ..., ['label' => 'form.body_label'])
# Miss one hard-coded string in Twig?
# It ships to French users in English.`,
      ts: `# Click: Extend > enable 'Configuration Translation'
# Configuration > Regional and language >
#   Configuration translation — or just use the 'Translate'
#   tab it adds to the config form you are already on:
#   Basic site settings > Translate > French
# drush cex — translations export as a language COLLECTION,
# mirroring the original file names under language/fr/:
#
# config/sync/language/fr/system.site.yml
name: 'Ma Belle Boutique'
---
# config/sync/language/fr/field.field.node.article.body.yml
label: Corps
---
# config/sync/language/fr/views.view.articles.yml
display:
  default:
    display_options:
      title: 'Derniers articles'`,
      note:
        "Only the overridden keys appear in the language collection files. Because these are config, the French site name goes through code review and deploys with drush cim — unlike content translations, which live in the database.",
    },
    {
      label: "Thousands of interface strings you didn't write",
      intro:
        "Symfony makes you own every catalog, including strings from third-party bundles. Drupal's locale module pulls community-maintained translations for core and contrib from localize.drupal.org.",
      leftLang: "yaml",
      rightLang: "bash",
      php: `# Symfony: you maintain each locale's catalog yourself.
# translations/messages.fr.yaml
'Log in': 'Se connecter'
'Create account': 'Créer un compte'
'Password': 'Mot de passe'
# Extract new keys after every change:
#   bin/console translation:extract fr --force
# Third-party bundle UI strings? Also your problem —
# and again after every composer update.`,
      ts: `# Enable the suite; UI strings for core AND contrib arrive
# pre-translated from localize.drupal.org.
$ drush pm:enable language locale content_translation config_translation -y
 [success] Successfully enabled: language, locale, content_translation, config_translation

$ drush locale:check
 [notice] Checked fr translation for drupal.
$ drush locale:update
 [notice] Imported fr translation for drupal.
 [notice] Translations imported: 8641 added, 0 updated, 0 removed.

# One-off wording fixes: /admin/config/regional/translate
# Stored in locale_* DB tables, NOT in config/sync.
# Ship customizations as a .po file:
$ drush locale:export fr --types=customized > custom.fr.po`,
      note:
        "Interface translations are the third storage bucket: not config, not your content — locale's own tables, refreshed from localize.drupal.org and exportable as .po. Only your custom overrides need managing.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Both halves of the suite as pure PHP: the drag-ordered detection chain resolving a language per request, then one node whose translatable fields fork per language while the unticked field stays shared. Predict the output, then reveal.",
    code: `<?php
declare(strict_types=1);

// Languages > Detection and selection, as data: the drag order
// plus the method settings from language.negotiation.yml.
$negotiation = [
    'order'    => ['url', 'session', 'browser', 'selected'],
    'prefixes' => ['en' => '', 'fr' => 'fr', 'de' => 'de'], // url.prefixes
    'param'    => 'language',                               // session.parameter
    'selected' => 'en',                                     // fallback
];

function negotiate(array $request, array $cfg): array
{
    $first = explode('/', ltrim($request['path'], '/'))[0];
    foreach ($cfg['order'] as $method) {
        if ($method === 'url') {
            foreach ($cfg['prefixes'] as $langcode => $prefix) {
                if ($prefix !== '' && $prefix === $first) {
                    return [$langcode, 'URL prefix'];
                }
            }
        }
        if ($method === 'session' && isset($request['session'][$cfg['param']])) {
            return [$request['session'][$cfg['param']], 'Session'];
        }
        if ($method === 'browser') {
            foreach ($request['accept'] ?? [] as $langcode) {
                if (isset($cfg['prefixes'][$langcode])) {
                    return [$langcode, 'Browser'];
                }
            }
        }
        if ($method === 'selected') {
            return [$cfg['selected'], 'Selected language'];
        }
    }
    return ['en', 'Fallback'];
}

$requests = [
    ['path' => '/fr/actualites', 'accept' => ['de']],
    ['path' => '/about', 'session' => ['language' => 'de']],
    ['path' => '/about', 'accept' => ['fr', 'en']],
    ['path' => '/contact'],
];
foreach ($requests as $request) {
    [$langcode, $method] = negotiate($request, $negotiation);
    echo str_pad($request['path'], 16) . "-> {$langcode} ({$method})\\n";
}

// Content Translation: ONE node. Fields fork per language only
// where the 'translatable' box was ticked; the rest is shared.
$node = [
    'translatable' => ['title', 'body'],
    'fields' => [
        'title'       => ['en' => 'Annual Report', 'fr' => 'Rapport annuel'],
        'body'        => ['en' => 'Our year in review.', 'fr' => 'Notre annee en revue.'],
        'field_image' => ['en' => 'chart.png'],
    ],
];
foreach (['en', 'fr'] as $langcode) {
    echo "\\nnode/42 ({$langcode}):\\n";
    foreach ($node['fields'] as $name => $values) {
        $shared = !in_array($name, $node['translatable'], true);
        $value  = $shared ? $values['en'] : $values[$langcode];
        echo '  ' . str_pad($name, 12) . $value . ($shared ? '  [shared]' : '') . "\\n";
    }
}`,
    output: `/fr/actualites  -> fr (URL prefix)
/about          -> de (Session)
/about          -> fr (Browser)
/contact        -> en (Selected language)

node/42 (en):
  title       Annual Report
  body        Our year in review.
  field_image chart.png  [shared]

node/42 (fr):
  title       Rapport annuel
  body        Notre annee en revue.
  field_image chart.png  [shared]`,
  },

  keyPoints: [
    "Core's multilingual suite is four modules — **Language**, **Interface Translation** (`locale`), **Content Translation**, **Config Translation** — enabled at Extend or with `drush pm:enable`; no code, no third-party extensions.",
    "Language detection is a drag-ordered chain (URL prefix or domain, Session, User, Browser, Selected fallback) at Configuration > Regional and language > Languages > Detection and selection; it exports to `language.types.yml` and `language.negotiation.yml`.",
    "Content translation is opt-in per bundle AND per field: a translated node is **one entity** with per-language values for ticked fields — translate `body`, share `field_image` — unlike Doctrine extensions' translation tables and listener wiring.",
    "The boundary: language definitions, detection settings, and translatability checkboxes are **config**; editors' translations of nodes are **content**; interface strings live in `locale`'s own DB tables, refreshed via `drush locale:update` from localize.drupal.org.",
    "Config Translation adds a Translate tab to admin forms; translated site name, field labels, and Views titles export as language collections — `config/sync/language/fr/system.site.yml` and friends — and deploy with `drush cim`.",
    "Place the core **Language switcher** block in Block layout for the visitor-facing toggle, and enable the suite **early**: retrofitting translatability across every bundle and field is the expensive path.",
  ],

  interview: [
    {
      q: "How does Drupal's multilingual system map onto what you'd build in Symfony?",
      a: "Symfony gives you three hand-wired systems: the translator plus `translations/*.yaml` for UI strings, a `{_locale}` route prefix with `LocaleListener` for detection, and a Doctrine extension like Gedmo Translatable for content. Drupal ships all of it as four core modules. **Language** covers detection — an ordered, draggable chain of URL prefix/domain, session, user, and browser methods that exports as config. **Interface Translation** replaces your message catalogs, pulling community `.po` files from localize.drupal.org for core and contrib. **Content Translation** replaces the Doctrine extension with per-bundle, per-field checkboxes, and **Config Translation** covers strings that live in config — site name, labels, Views titles — which have no Symfony equivalent because there you'd first have to turn each one into a trans key in code.",
    },
    {
      q: "How does Drupal store a translated node — is it a second node?",
      a: "No, and that's the key architectural difference from most hand-rolled solutions: a translation is the **same entity** — same nid, same URL patterns — carrying per-language values for whichever fields were marked translatable. Untranslatable fields keep a single shared value across all languages, so you can translate the body while every language shares one hero image, and updating that image updates it everywhere at once. The translatability decision is made per field on the Content language and translation settings screen, and it exports as config (`language.content_settings.node.article` plus `translatable: true` on each field config). The translations themselves — the French text an editor types under the node's Translate tab — are content, stored in the entity's field tables keyed by langcode.",
    },
    {
      q: "Which multilingual pieces deploy with config export, and which don't?",
      a: "Three buckets. Config, riding `drush cex`/`cim`: the language entities (`language.entity.fr`), the detection chain (`language.types`, `language.negotiation`), per-bundle translation settings, per-field `translatable` flags, and config translations themselves, which export as language collections like `config/sync/language/fr/system.site.yml`. Content, never exported: the actual node, term, and media translations editors create — they move with the database like any content. Interface strings are the third bucket: the `locale` module stores them in its own database tables, refreshes them from localize.drupal.org via `drush locale:update`, and your custom wording overrides can be shipped as a `.po` file with `drush locale:export fr --types=customized`. Knowing that three-way split is exactly the config-vs-content fluency Drupal teams look for.",
    },
    {
      q: "A client 'might want French next year.' Do you enable multilingual now or later?",
      a: "Now, if the chance is real — enabling the modules early is nearly free, while retrofitting is an audit. The Language module alone barely changes the site, but it establishes correct langcodes on all content created from day one. Retrofitting later means walking every entity type, bundle, and field to decide translatability, then revisiting path aliases, menu links, blocks, and Views for language awareness, all while existing content sits in a single langcode that may need mass updating. I'd enable the suite, configure detection, mark the obvious bundles translatable, and simply not add the second language until it's needed — the marginal cost of carrying the config is close to zero, and it's all reviewable YAML in the meantime.",
    },
  ],

  quiz: [
    {
      question:
        "The client wants the site name and a View's page title shown in French. Which module handles it?",
      options: [
        "Interface Translation — they're UI strings",
        "Content Translation — they're editor-facing text",
        "Config Translation — site name and Views titles live in config",
        "Language — it covers everything once French is added",
      ],
      answerIndex: 2,
      explain:
        "The site name (system.site) and Views titles are configuration, so Config Translation is the module that adds Translate tabs for them. The translations export as language collections — e.g. config/sync/language/fr/system.site.yml — and deploy with drush cim.",
    },
    {
      question:
        "An editor translates an Article into French via its Translate tab. What now exists in the database?",
      options: [
        "Two separate nodes linked by an entity reference",
        "One node, with per-language values stored for its translatable fields",
        "A row per property in an ext_translations table, Doctrine-style",
        "A new config entity holding the French field values",
      ],
      answerIndex: 1,
      explain:
        "A Drupal translation is the same entity — one nid — with per-language field values where translatability was ticked. Untranslatable fields stay shared across languages. There is no second node and no separate translations table to join, and field values are content, never config.",
    },
    {
      question:
        "Detection order is URL, then Browser, then Selected (English). A visitor whose browser sends Accept-Language: de opens /fr/actualites. Which language renders?",
      options: [
        "German — the browser preference belongs to the user",
        "French — the URL method matches first and the chain stops",
        "English — conflicting signals fall back to Selected",
        "It depends on a coin flip between URL and Browser",
      ],
      answerIndex: 1,
      explain:
        "Detection methods run strictly in the configured drag order, and the first one that resolves a language wins. The /fr prefix satisfies the URL method, so Browser and Selected are never consulted. Reordering that chain in the UI re-exports language.types.yml — the whole 'listener' is config.",
    },
    {
      question:
        "After building out a bilingual site, you run drush cex. Which of these is NOT in the export?",
      options: [
        "language.entity.fr.yml",
        "language.content_settings.node.article.yml",
        "language/fr/system.site.yml",
        "The French body text of translated articles",
      ],
      answerIndex: 3,
      explain:
        "Language definitions, translatability settings, and config translations (the language/fr collection) are all config and export cleanly. Editors' translations of content are content — database rows that move with the DB, not with config sync. Interface strings are a third bucket, held in locale's own tables.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 24,
  slug: "themes-appearance",
  title: "Themes & Appearance: The Look Without the Build",
  part: "Layout, Blocks & Menus",
  estMinutes: 11,
  summary:
    "The Appearance page runs a whole presentation layer Symfony doesn't have: a front-end theme and an admin theme at once, per-theme settings and block layouts, base-theme inheritance — all exportable as system.theme and THEME.settings config.",

  concept: `
## Symfony hands you a blank page; Drupal hands you a working site

In Symfony there is no theme layer. \`base.html.twig\`, the asset pipeline,
every template — you build all of it, for the public site AND whatever admin
UI you bolt on. Drupal inverts the deal: core ships complete, accessible,
responsive themes, and you customize *down* from a working UI instead of up
from an empty page.

## The Appearance page

**Appearance** (\`/admin/appearance\`) is the theme dashboard. Core gives you:

- **Olivero** — the front-end default in Drupal 10 and 11: responsive,
  accessibility-focused, 13 block regions.
- **Claro** — the admin default: the clean back office every admin screenshot
  in this course shows.
- **Stark** — intentionally unstyled; switch to it to prove a bug isn't your
  theme's fault.

Uninstalled themes sit lower on the page with **Install** and **Install and
set as default** links. The key mental shift: a Drupal site runs **two themes
at once**. The *default theme* renders visitor pages; the *administration
theme* (a select at the bottom of Appearance) renders \`/admin\`. A checkbox —
*Use the administration theme when editing or creating content* — extends the
admin theme to node forms too. Exports: \`system.theme\` holds \`default:\`
and \`admin:\`; the checkbox lives in \`node.settings\` as
\`use_admin_theme\`; which themes are installed at all rides
\`core.extension\`, same as modules.

## Theme settings: rebranding without a deploy

Every installed theme has a **Settings** link
(\`/admin/appearance/settings/olivero\`): upload a logo (untick *use the
default*), upload a favicon, toggle features like user pictures on posts and
comments. Themes add their own controls — Olivero offers a primary color and
a site-branding background; contrib admin themes like Gin go much further.
Values export per theme as \`THEME.settings\` (\`olivero.settings.yml\`), with
site-wide fallbacks in \`system.theme.global\` — \`theme_get_setting()\` walks
that chain, so a theme only stores what it overrides.

Block layout is per-theme too: **Structure > Block layout** shows one tab per
installed theme, because regions belong to a theme. Each placement
(\`block.block.*\`) carries a \`theme:\` key — placing a search block in
Olivero's header touches nothing in Claro. The next lessons live on that page.

## Base themes and subthemes, from the site-builder chair

Contrib themes (\`composer require drupal/bootstrap5\`, Radix, Gin) are
usually **base themes**: you rarely set them as default directly. Instead a
small **subtheme** declares \`base theme: bootstrap5\` in its \`.info.yml\`
and inherits every template, library, and setting it doesn't override — class
inheritance for the presentation layer. Site-builder scope: install the base
theme, install the subtheme, set the *subtheme* as default, configure its
settings. Writing the Twig and CSS overrides inside it belongs to a theming
course.

## The dev bridge: Starterkit

Core themes are deliberately *not* base themes — Olivero's README says so.
When the design team needs a fully custom theme, core generates the starting
point: \`php core/scripts/drupal generate-theme acme\` copies the Starterkit
theme into a standalone theme you own outright, immune to upstream refactors.
Know it exists, hand it to your themer, and keep clicking: everything in this
lesson — which theme runs where, logos, block placement — stays config either
way.
`,

  comparisons: [
    {
      label: "Front theme + admin theme, zero routing code",
      intro:
        "A public look for visitors and a different UI for admins. In Symfony you build and switch both yourself; in Drupal it's two dropdowns on the Appearance page and a two-line config export.",
      php: `// Symfony has no theme layer: two looks = two template trees
// you build, plus the switching logic you write.
#[AsEventListener]
final class LayoutListener
{
    public function __invoke(RequestEvent $event): void
    {
        $request = $event->getRequest();
        $layout = str_starts_with($request->getPathInfo(), '/admin')
            ? 'admin/base.html.twig'
            : 'base.html.twig';
        $request->attributes->set('layout', $layout);
    }
}
// ...and every template starts with:
// {% extends layout %}
// Accessibility, responsive nav, admin styling? Also you.`,
      ts: `# Drupal: Appearance (/admin/appearance)
# 1. "Install and set as default" on the visitor theme (Olivero).
# 2. Administration theme select (bottom of page): Claro.
# 3. Tick "Use the administration theme when editing or
#    creating content" so editors get Claro forms too.
# drush cex writes system.theme.yml:
default: olivero
admin: claro
# ...and the checkbox lands in node.settings.yml:
use_admin_theme: true`,
      note:
        "Theme negotiation is core's job: admin routes render in the admin theme, everything else in the default theme. Two complete UIs, and the whole decision is a config object with two keys.",
    },
    {
      label: "Logo and favicon are settings, not template edits",
      intro:
        "Rebranding in Symfony means editing templates and redeploying assets. In Drupal the logo and favicon are per-theme SETTINGS an editor changes in the UI — and the result still exports as YAML.",
      php: `// Symfony: branding is hardcoded in templates and parameters.
// config/services.yaml
//   parameters:
//     app.logo: 'build/images/acme-logo.svg'
// config/packages/twig.yaml
//   twig:
//     globals:
//       app_logo: '%app.logo%'
// templates/base.html.twig
//   <link rel="icon" href="{{ asset('favicon.ico') }}">
//   <img src="{{ asset(app_logo) }}" alt="Acme">
// New logo? Edit config, rebuild assets, redeploy.`,
      ts: `# Drupal: Appearance > Settings > Olivero
#   (/admin/appearance/settings/olivero)
# Untick "Use the logo supplied by the theme", upload the file;
# same form: favicon, feature toggles, Olivero's own extras
# (primary color, branding background).
# drush cex writes olivero.settings.yml:
logo:
  use_default: false
  path: 'public://acme-logo.svg'
favicon:
  use_default: true
site_branding_bg_color: default
features:
  logo: true
  favicon: true
  node_user_picture: true
  comment_user_picture: true`,
      note:
        "Site-wide fallbacks live in system.theme.global; theme_get_setting() checks the theme's own settings first, then the global config. The theme only stores what it overrides.",
    },
    {
      label: "Blocks are placed per theme",
      intro:
        "Sidebars and headers in Symfony are include() calls inside each layout. In Drupal every placement is a config entity bound to ONE theme's regions — which is why Block layout has a tab per theme.",
      php: `// Symfony: each layout hardcodes its own furniture.
// templates/base.html.twig
//   {{ include('_partials/search_box.html.twig') }}
//   {{ include('_partials/main_nav.html.twig') }}
// templates/admin/base.html.twig
//   {{ include('_partials/admin_shortcuts.html.twig') }}
// Moving the search box = editing the layout template
// and redeploying.`,
      ts: `# Drupal: Structure > Block layout (/admin/structure/block)
# One TAB PER INSTALLED THEME — regions belong to a theme
# (Olivero ships 13; Claro has its own set).
# "Place block" in an Olivero region exports as
# block.block.olivero_search_form_wide.yml:
id: olivero_search_form_wide
theme: olivero
region: secondary_menu
weight: -4
plugin: search_form_block
settings:
  id: search_form_block
  label: Search
  label_display: '0'
dependencies:
  theme:
    - olivero`,
      note:
        "The theme: key is the point — this placement exists only in Olivero, so admin pages in Claro are untouched. The coming block lessons build on exactly this page.",
    },
    {
      label: "Contrib base theme + your subtheme",
      intro:
        "Want a Bootstrap look? A framework dev starts copying templates. A site builder installs a contrib base theme and points a tiny subtheme at it — inheritance does the rest.",
      php: `// Symfony: restyling a bundle's UI = copying its templates
// and owning them forever.
//   templates/bundles/EasyAdminBundle/layout.html.twig
//   templates/bundles/EasyAdminBundle/crud/index.html.twig
// Once copied, upstream template fixes stop reaching you —
// there is no override cascade, only full replacement.
// And for the public site there is nothing to copy:
// every template and breakpoint starts from zero.`,
      ts: `# Drupal: composer require drupal/bootstrap5
# Appearance: install the base theme, install your subtheme,
# "Install and set as default" on the SUBTHEME only.
# The subtheme is one folder + an info file:
# themes/custom/acme/acme.info.yml
name: Acme
type: theme
core_version_requirement: ^10 || ^11
base theme: bootstrap5
# Regions do NOT inherit from the base theme: omit regions:
# and you get core's DEFAULT region set, not bootstrap5's.
# So declare the base theme's full list (as its starterkit
# subtheme does), or its page template's regions go empty:
regions:
  header: Header
  nav_branding: 'Navigation branding region'
  nav_main: 'Main navigation region'
  nav_additional: 'Additional navigation region'
  breadcrumb: Breadcrumbs
  content: 'Main content'
  sidebar_first: 'Sidebar first'
  sidebar_second: 'Sidebar second'
  footer: Footer
# Templates, libraries and settings you DON'T override
# cascade up from bootstrap5 — regions never do.`,
      note:
        "Core themes are not meant as base themes. For a fully custom start, core's Starterkit generates a standalone theme you own: php core/scripts/drupal generate-theme acme. The Twig/CSS inside is a later course; installing and wiring it is site building.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Simulate the two config mechanisms behind the Appearance page: theme negotiation from system.theme, and theme_get_setting()'s fallback from THEME.settings to system.theme.global. Predict which theme renders each route and which logo values win, then run.",
    code: `<?php
// Two mechanisms behind Appearance, driven purely by config:
// 1. theme NEGOTIATION  (system.theme: default vs admin)
// 2. theme_get_setting() (THEME.settings -> system.theme.global)

$config = [
    'system.theme'        => ['default' => 'olivero', 'admin' => 'claro'],
    'node.settings'       => ['use_admin_theme' => true],
    'system.theme.global' => [
        'logo'    => ['use_default' => true, 'path' => ''],
        'favicon' => ['use_default' => true],
    ],
    'olivero.settings'    => [
        'logo' => ['use_default' => false, 'path' => 'public://acme-logo.svg'],
        'base_primary_color' => '#0d7061',
    ],
    'claro.settings'      => [],  // no overrides -> global wins
];

// -- 1. Which theme renders which route? -----------------------------
function negotiate(array $route, array $config): string {
    if (!empty($route['admin_route'])) {
        return $config['system.theme']['admin'];
    }
    if (!empty($route['node_form']) && $config['node.settings']['use_admin_theme']) {
        return $config['system.theme']['admin'];  // the Appearance checkbox
    }
    return $config['system.theme']['default'];
}

$routes = [
    '/node/42'         => [],
    '/admin/structure' => ['admin_route' => true],
    '/node/42/edit'    => ['node_form' => true],
];
foreach ($routes as $path => $route) {
    printf("%-18s -> %s\\n", $path, negotiate($route, $config));
}

// -- 2. theme_get_setting(): theme config first, then global ---------
function theme_get_setting(string $key, string $theme, array $config) {
    foreach ([$theme . '.settings', 'system.theme.global'] as $name) {
        $value = $config[$name] ?? [];
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                continue 2;  // not set here -> try the next config object
            }
            $value = $value[$part];
        }
        return $value;
    }
    return null;
}

echo "\\n";
echo "olivero logo.use_default: ";
var_export(theme_get_setting('logo.use_default', 'olivero', $config));
echo "\\nolivero logo.path:        "
   . theme_get_setting('logo.path', 'olivero', $config);
echo "\\nclaro   logo.use_default: ";
var_export(theme_get_setting('logo.use_default', 'claro', $config));
echo "\\n\\nTwo active themes, per-theme settings — all decided by config.\\n";`,
    output: `/node/42           -> olivero
/admin/structure   -> claro
/node/42/edit      -> claro

olivero logo.use_default: false
olivero logo.path:        public://acme-logo.svg
claro   logo.use_default: true

Two active themes, per-theme settings — all decided by config.`,
  },

  keyPoints: [
    "Appearance (/admin/appearance) installs and switches themes, and a Drupal site runs TWO at once: the default theme for visitors (Olivero in D10/11) and the administration theme for /admin (Claro) — exported as system.theme.yml with default: and admin: keys.",
    "The checkbox 'Use the administration theme when editing or creating content' stores as use_admin_theme in node.settings; which themes are installed at all is tracked in core.extension, exactly like modules.",
    "Each theme's Settings form (Appearance > Settings > THEME) covers logo, favicon, and feature toggles plus theme-specific extras (Olivero's primary color); it exports as THEME.settings, with site-wide fallbacks in system.theme.global.",
    "Block layout is per theme: Structure > Block layout shows one tab per installed theme, and every placement (block.block.*) is bound to a single theme's regions by its theme: key.",
    "Contrib themes (Bootstrap5, Radix, admin theme Gin) are usually base themes — your subtheme declares 'base theme:' in its .info.yml and inherits everything it doesn't override; site building = install both, set the subtheme as default.",
    "Core themes are not base themes; php core/scripts/drupal generate-theme copies core's Starterkit into a standalone theme you own — the bridge to real Twig/CSS theming, which is beyond this course.",
  ],

  interview: [
    {
      q: "Drupal renders the front end and the admin in completely different themes. How does that work, and what config controls it?",
      a: "Core runs theme negotiation on every request: routes flagged as admin routes render in the administration theme, everything else in the default theme. Both are chosen on the Appearance page and export to one tiny config object — `system.theme` with `default: olivero` and `admin: claro` on a stock 10/11 site. A related checkbox, 'Use the administration theme when editing or creating content', stores as `use_admin_theme` in `node.settings` and pulls node add/edit forms into the admin theme as well. In Symfony you would hand-roll this split with route conventions and duplicate base layouts; in Drupal it's two dropdowns, which is why a usable back office exists on day one.",
    },
    {
      q: "A client wants a Bootstrap-based design. Do you write a theme from scratch?",
      a: "No — first reach for a contrib base theme like Bootstrap5 or Radix, installed with Composer and enabled on the Appearance page. You then create a minimal subtheme whose `.info.yml` declares `base theme: bootstrap5`, set the *subtheme* as default, and let inheritance supply every template and library you haven't overridden — much like extending a class and overriding only a few methods. If nothing on contrib fits, core's Starterkit generates a standalone starting point: `php core/scripts/drupal generate-theme acme`, deliberately a copy you own rather than a subtheme of a core theme, since core themes aren't supported as base themes. Either way the site-builder work — installing, setting defaults, theme settings, block placement — is all UI and config; only the Twig/CSS inside the theme is developer territory.",
    },
    {
      q: "You changed the site logo and some Olivero settings locally. What deploys through config, and what's the gotcha?",
      a: "The settings themselves are config: `drush cex` exports `olivero.settings.yml` (and `system.theme.yml` if you changed which theme is default or admin), and `drush cim` replays them on production. The gotcha is that config stores the logo's *path* — something like `public://acme-logo.svg` — while the uploaded file itself is content in the public files directory, which config import never moves. So either sync the files directory as part of your deployment, or skip uploading entirely and ship the logo inside the theme folder so it deploys with code. It's the same config-versus-content line this course keeps drawing: structure and settings export, files and content don't.",
    },
  ],

  quiz: [
    {
      question:
        "Which exported config file records that visitors see Olivero while /admin renders in Claro?",
      options: [
        "core.extension.yml",
        "olivero.settings.yml",
        "system.theme.yml",
        "system.site.yml",
      ],
      answerIndex: 2,
      explain:
        "system.theme.yml holds exactly two decisions: default: (the visitor-facing theme) and admin: (the administration theme). core.extension tracks which themes and modules are installed at all, THEME.settings holds a theme's own options like logo and favicon, and system.site is the site name and front page.",
    },
    {
      question:
        "You place a Search block in Olivero's header region. Why doesn't it appear on admin pages?",
      options: [
        "Admin pages cannot show blocks",
        "Block placements are per theme, and admin pages render in Claro",
        "The Search module is disabled on admin routes",
        "You must clear the cache before blocks appear anywhere",
      ],
      answerIndex: 1,
      explain:
        "Every placement (block.block.*) is bound to one theme via its theme: key and one of that theme's regions — that's why Structure > Block layout has a tab per installed theme. Admin pages render in the administration theme (Claro), which has its own regions and its own placements, so Olivero placements never apply there.",
    },
    {
      question:
        "In themes/custom/acme/acme.info.yml, what does the line 'base theme: bootstrap5' do?",
      options: [
        "Copies Bootstrap5's files into the acme folder once, at install time",
        "Makes acme inherit Bootstrap5's templates, libraries, and settings, overriding only what acme provides",
        "Loads Bootstrap's CSS from a CDN",
        "Marks acme as an administration theme",
      ],
      answerIndex: 1,
      explain:
        "base theme: sets up an inheritance chain: when rendering, Drupal looks in the subtheme first and falls back up through its base theme(s), so acme stays a small folder of overrides while Bootstrap5 keeps supplying everything else — and contrib updates still reach you. Nothing is copied; contrast that with Symfony's copy-and-own bundle template overrides.",
    },
    {
      question:
        "What does 'php core/scripts/drupal generate-theme acme' give you?",
      options: [
        "A subtheme of Olivero that tracks core's front-end updates",
        "A standalone theme copied from core's Starterkit that you own and modify freely",
        "A compiled CSS bundle for the current default theme",
        "A config export of the active theme's settings",
      ],
      answerIndex: 1,
      explain:
        "Starterkit is generated, not inherited: the script copies core's starterkit_theme into a new theme that belongs to you, precisely because core themes like Olivero are not supported as base themes and may refactor their internals. It's the hand-off point from site building to actual Twig/CSS theming.",
    },
  ],
};

export default lesson;

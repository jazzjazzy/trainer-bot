import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 26,
  slug: "images-responsive",
  title: "Images, Image Styles & Responsive Images",
  part: "Assets, Components & Layout",
  estMinutes: 13,
  summary:
    "Choose deliberately between '#theme' => 'image', '#theme' => 'image_style' and the field formatter, then graduate to the Responsive Image module: breakpoints declared in incident_theme.breakpoints.yml, mapped to image styles by a responsive image style config entity, emitted as a real <picture> with srcset, sizes, WebP/AVIF derivatives, loading=\"lazy\" and alt text that is never optional.",

  concept: `
## Three ways to put an image on the page

Drupal gives you a ladder, and picking the wrong rung is the most common
image mistake in a custom module.

\`\`\`php
// 1. Dumb <img>. You already have a URL. No derivative, no lazy loading.
$build['logo'] = [
  '#theme' => 'image',
  '#uri' => 'public://incidents/rack-42.jpg',
  '#alt' => $this->t('Rack 42 with the failed PSU highlighted'),
  '#attributes' => ['loading' => 'lazy'],
];

// 2. Run it through an image style first.
$build['photo'] = [
  '#theme' => 'image_style',
  '#style_name' => 'incident_card_narrow',
  '#uri' => $file->getFileUri(),
  '#alt' => $item->alt,
  '#title' => $item->title,
];

// 3. Best: let the field formatter do it, configured in the display.
$build = $view_builder->viewField($node->get('field_incident_photo'), 'card');
\`\`\`

\`image_style\` has its own template, \`image-style.html.twig\`, which is just
\`{{ image }}\` — its preprocess resolves the derivative URL and builds a nested
\`'#theme' => 'image'\` render array, so the actual tag is still emitted by
\`image.html.twig\`, which is literally \`<img{{ attributes }} />\`. Both templates
are overridable, and an \`image.html.twig\` override therefore also affects
styled images through that second render pass. Everything you see in the
markup came from an attributes object.

### Image styles are a derivative pipeline

An image style is a config entity (\`image.style.incident_card_wide.yml\`)
holding an ordered list of **effect plugins**: \`image_scale\`,
\`image_scale_and_crop\` (with an \`anchor\`), \`image_crop\`, \`image_desaturate\`,
\`image_rotate\`, \`image_convert\`. Derivatives are generated lazily on first
request to
\`/sites/default/files/styles/STYLE/public/PATH\` and cached on disk; flushing a
style deletes them. In code you rarely need more than
\`ImageStyle::load('incident_card_wide')->buildUrl($uri)\` — and
\`transformDimensions()\` if you want the width/height up front.

\`image_convert\` with \`extension: webp\` is how you ship WebP without a module
(core's GD toolkit gained WebP in 9.2; AVIF only from 11.2, and only when the
PHP GD build has libavif — on Drupal 10 you need the contrib AVIF module. AVIF
has its own effect id, \`image_convert_avif\`, separate from \`image_convert\`). The derivative keeps the original filename and
**appends** the new extension: \`rack-42.jpg.webp\`.

### Responsive images

One derivative can't serve a phone and a 4K monitor. The Responsive Image
module (core, not enabled by default) needs three pieces:

1. \`incident_theme.breakpoints.yml\` — named media queries plus \`multipliers\`.
2. A **responsive image style** config entity that maps each
   breakpoint+multiplier to either an image style, a \`sizes\` declaration with a
   list of styles, or \`_none\`, plus a \`fallback_image_style\`.
3. Output: the *Responsive image* field formatter, or
   \`'#theme' => 'responsive_image'\` with \`#responsive_image_style_id\` and
   \`#uri\`.

You get a real \`<picture>\`: one \`<source>\` per breakpoint, **largest media
query first** (the browser takes the first match), \`srcset\` using \`2x\`
multipliers or \`900w\` width descriptors — never both in one srcset — and a
\`type\` attribute when every image in that srcset shares a MIME type. That last
rule is how a WebP-only breakpoint becomes \`type="image/webp"\` with a JPEG
fallback below it.

### Two things people get wrong

**loading="lazy" is not automatic.** It is a *formatter* setting
(\`image_loading: {attribute: lazy}\`, default \`lazy\` on both the image and
responsive image formatters). A hand-built \`'#theme' => 'image'\` gets nothing
— set \`#attributes['loading']\`, and set it to \`eager\` for a hero image.

**Alt text is data.** Tick *Alt field required* on the field; pass \`#alt\`
through in every custom build. An empty string is a legitimate value meaning
"decorative", but a missing \`alt\` attribute is a WCAG 1.1.1 failure and Drupal
will not invent one.
`,

  comparisons: [
    {
      label: "Rendering one image at a known size",
      intro:
        "Show the incident photo at card width. Symfony reaches for LiipImagineBundle's Twig filter; Drupal describes the image as a render array and lets the theme layer emit the tag.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony + LiipImagineBundle. The filter runs at render time and
   returns a URL; the <img> tag, the alt attribute and the loading
   attribute are all yours to type — and to remember. #}
<img src="{{ asset(incident.photoPath)|imagine_filter('incident_card_narrow') }}"
     alt="{{ incident.photoAlt }}"
     width="560"
     loading="lazy">

{# Nothing stops a colleague writing this instead: #}
<img src="{{ asset(incident.photoPath) }}">
{# ...shipping a 4 MB original, no alt, no lazy loading, and no way for
   the design team to change the crop without a deploy. #}`,
      ts: `<?php
// Drupal: the style name is config, so a site builder can change the
// crop at /admin/config/media/image-styles without touching this code.
$file = $node->get('field_incident_photo')->entity;
$item = $node->get('field_incident_photo')->first();

$build['photo'] = [
  '#theme' => 'image_style',
  '#style_name' => 'incident_card_narrow',
  '#uri' => $file->getFileUri(),
  // Alt is not optional. It comes from the field, not from your imagination.
  '#alt' => $item->alt,
  '#title' => $item->title,
  // #theme => image_style does NOT add loading="lazy" for you.
  '#attributes' => ['loading' => 'lazy', 'class' => ['incident-card__photo']],
  // The derivative depends on the file AND the style config.
  '#cache' => ['tags' => Cache::mergeTags(
    $file->getCacheTags(),
    ['config:image.style.incident_card_narrow'],
  )],
];

// Just need the URL (e.g. for an og:image meta tag)?
$url = \\Drupal\\image\\Entity\\ImageStyle::load('incident_card_narrow')
  ->buildUrl($file->getFileUri());

// Want the post-transform dimensions without generating the file?
$dimensions = ['width' => $item->width, 'height' => $item->height];
\\Drupal\\image\\Entity\\ImageStyle::load('incident_card_narrow')
  ->transformDimensions($dimensions, $file->getFileUri());`,
      note:
        "image.html.twig is one line: <img{{ attributes }} />. Everything — src, alt, width, height, loading, classes — arrives through the Attributes object, which is why '#attributes' is the only place to add anything and why a theme can alter it in hook_preprocess_image() without you knowing.",
    },
    {
      label: "Declaring the derivative pipeline",
      intro:
        "The same transform, declared once and reused. Liip filter sets live in a bundle config file; Drupal image styles are config entities you export with the rest of the site config.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/liip_imagine.yaml
liip_imagine:
  driver: gd
  filter_sets:
    incident_card_narrow:
      quality: 82
      filters:
        relative_resize: { widen: 560 }

    incident_card_wide:
      quality: 82
      format: webp          # bundle-level format conversion
      filters:
        thumbnail: { size: [1200, 675], mode: outbound }

# Derivatives are written under web/media/cache/<filter>/...
# Cache busting is 'php bin/console liip:imagine:cache:remove'.`,
      ts: `# config/install/image.style.incident_card_wide.yml
# (or exported from /admin/config/media/image-styles)
langcode: en
status: true
dependencies: {  }
name: incident_card_wide
label: 'Incident card (wide, WebP)'
effects:
  b2d0f7a1-3c1e-4a52-9b3d-7f0d5c3e21aa:
    uuid: b2d0f7a1-3c1e-4a52-9b3d-7f0d5c3e21aa
    id: image_scale_and_crop
    weight: 1
    data:
      width: 1200
      height: 675
      anchor: center-center
  c9e4a610-88bb-4f0a-9c77-2b1a44de9012:
    uuid: c9e4a610-88bb-4f0a-9c77-2b1a44de9012
    id: image_convert
    weight: 2
    data:
      # GD supports webp since core 9.2. AVIF only landed in 11.2, needs a
      # PHP GD built with libavif, and uses a SEPARATE effect id
      # (image_convert_avif). Check /admin/reports/status.
      extension: webp

# Derivatives: /sites/default/files/styles/incident_card_wide/public/
#   incidents/rack-42.jpg.webp   <- new extension is APPENDED
# Flush them with: drush image:flush incident_card_wide`,
      note:
        "Effects are plugins ordered by 'weight' and keyed by uuid — hand-editing the YAML means inventing valid uuids, so build the style in the UI and 'drush config:export'. Because it is config, an image style has cache tag config:image.style.NAME: change the crop and every render that declared that tag is invalidated.",
    },
    {
      label: "A responsive <picture>",
      intro:
        "Serve a 320px WebP to phones and a 1200px JPEG to desktops. In Symfony you hand-write the picture element and keep it in sync with your filter sets; in Drupal breakpoints and mappings are config and the markup is generated.",
      leftLang: "twig",
      rightLang: "yaml",
      php: `{# Symfony: every URL, every media query and every descriptor typed
   by hand, in every template that shows this image. Add a breakpoint
   and you edit N templates. #}
<picture>
  <source media="(min-width: 1000px)"
          type="image/jpeg"
          sizes="(min-width: 1000px) 900px, 100vw"
          srcset="{{ asset(p)|imagine_filter('incident_card_narrow') }} 560w,
                  {{ asset(p)|imagine_filter('incident_card_wide') }} 1200w">
  <source media="(min-width: 560px)"
          srcset="{{ asset(p)|imagine_filter('incident_card_narrow') }} 1x">
  <source type="image/webp"
          srcset="{{ asset(p)|imagine_filter('incident_card_mobile') }} 1x,
                  {{ asset(p)|imagine_filter('incident_card_mobile_2x') }} 2x">
  <img src="{{ asset(p)|imagine_filter('incident_card_narrow') }}"
       alt="{{ alt }}" loading="lazy">
</picture>`,
      ts: `# 1. incident_theme.breakpoints.yml  (key = EXTENSION.[GROUP.]NAME)
incident_theme.mobile:
  label: Mobile
  mediaQuery: ''
  weight: 0
  multipliers: ['1x', '2x']
incident_theme.narrow:
  label: Narrow
  mediaQuery: 'all and (min-width: 560px)'
  weight: 1
  multipliers: ['1x', '2x']
incident_theme.wide:
  label: Wide
  mediaQuery: 'all and (min-width: 1000px)'
  weight: 2
  multipliers: ['1x']

# 2. config/install/responsive_image.styles.incident_card.yml
id: incident_card
label: 'Incident card'
breakpoint_group: incident_theme
fallback_image_style: incident_card_narrow
# ORDER MATTERS: core emits one <source> per mapping in exactly this
# stored order and does NOT re-sort at render time. List them
# WIDEST FIRST. The UI at /admin/config/media/responsive-image-style
# writes them in this order for you (see core's demo_umami hero style),
# so hand-written config has to match. Put mobile first and its empty
# mediaQuery matches every viewport — desktops get the 320px file.
image_style_mappings:
  - breakpoint_id: incident_theme.wide
    multiplier: 1x
    image_mapping_type: sizes
    image_mapping:
      sizes: '(min-width: 1000px) 900px, 100vw'
      sizes_image_styles:
        - incident_card_narrow
        - incident_card_wide
  - breakpoint_id: incident_theme.narrow
    multiplier: 1x
    image_mapping_type: image_style
    image_mapping: incident_card_narrow
  - breakpoint_id: incident_theme.mobile
    multiplier: 1x
    image_mapping_type: image_style
    image_mapping: incident_card_mobile
  - breakpoint_id: incident_theme.mobile
    multiplier: 2x
    image_mapping_type: image_style
    image_mapping: incident_card_mobile_2x

# 3. Turn it on, then pick it in the view display:
#    drush en responsive_image
#    /admin/config/media/responsive-image-style`,
      note:
        "The breakpoint key must be prefixed with the extension name that declares it, and breakpoint_group must match that prefix or the responsive image style form shows no breakpoints at all. The 'weight' key is more limited than it looks: it orders the rows in the /admin/config/media/responsive-image-style form (which iterates array_reverse(getBreakpointsByGroup()), so the form saves image_style_mappings widest-first). At render time preprocessResponsiveImage() does no sorting at all — it emits one <source> per mapping in stored config order. Since <picture> takes the first matching <source>, a hand-written config file bypasses the form and you must order the mappings widest-first yourself.",
    },
    {
      label: "Rendering it, and overriding the markup",
      intro:
        "Once the config exists you almost never build the picture by hand — but you do need to know the theme hook, the loading setting, and where the template lives when a designer wants a wrapper.",
      leftLang: "php",
      rightLang: "php",
      php: `<?php
// Symfony: there is no theme hook. If the <picture> markup must change
// you edit the template, and every controller that renders an incident
// photo has to be pointed at the same partial by convention.
final class IncidentController extends AbstractController
{
    public function show(Incident $incident): Response
    {
        return $this->render('incident/show.html.twig', [
            'p' => $incident->getPhotoPath(),
            'alt' => $incident->getPhotoAlt(),
        ]);
    }
}

// templates/incident/_photo.html.twig is included by hand:
//   {% include 'incident/_photo.html.twig' with { p: p, alt: alt } %}
// Nothing enforces that a new template uses it.`,
      ts: `<?php
// Drupal, in order of preference.

// A) Field formatter — configure, don't code. Exported as
//    core.entity_view_display.node.incident.card.yml:
//      field_incident_photo:
//        type: responsive_image
//        settings:
//          responsive_image_style: incident_card
//          image_link: ''
//          image_loading: { attribute: lazy }

// B) A render array, when the image is not a field on this entity.
$build['photo'] = [
  '#theme' => 'responsive_image',
  '#responsive_image_style_id' => 'incident_card',
  '#uri' => $file->getFileUri(),
  '#width' => $item->width,
  '#height' => $item->height,
  // NOTE: unlike 'image' / 'image_style', the responsive_image theme hook
  // declares NO #alt and NO #title variable — it only has uri, attributes,
  // responsive_image_style_id, height, width. A stray '#alt' is silently
  // dropped by ThemeManager::render() and you ship an <img> with no alt.
  // Alt and title must travel inside #attributes; preprocess moves alt onto
  // the inner img element for you.
  '#attributes' => [
    'alt' => $alt,
    'title' => $item->title,
    'loading' => 'lazy',
  ],
];

// C) From a field item, so alt/title/dimensions come along:
$build['photo'] = [
  '#theme' => 'responsive_image_formatter',
  '#item' => $item,
  '#responsive_image_style_id' => 'incident_card',
];

// Overriding the markup in incident_theme:
//   templates/content/responsive-image.html.twig
//   templates/content/image.html.twig
// Add suggestions the usual way:
function incident_theme_theme_suggestions_responsive_image_alter(
  array &$suggestions,
  array &$variables,
): void {
  $id = $variables['responsive_image_style_id'] ?? '';
  if ($id !== '') {
    // responsive-image--incident-card.html.twig
    $suggestions[] = 'responsive_image__' . $id;
  }
}

// In an SDC you pass the whole render array through as a prop/slot —
// never re-implement <picture> inside the component template.`,
      note:
        "In Drupal 11.3 core's *initial* preprocess callbacks moved out of template_preprocess_*() functions. They are not #[Hook]-attributed — they are registered with an 'initial preprocess' key inside hook_theme() pointing at a service method (ImagePreprocess::preprocessImage(), ResponsiveImageThemeHooks::preprocessResponsiveImage(); ImagePreprocess is a plain @internal service, not a hook class). template_preprocess_image(), template_preprocess_image_style() and template_preprocess_responsive_image() are deprecated in 11.3 and removed in 12.0 — see change record 3504125. Your own hook_preprocess_HOOK() functions in a .theme file still work exactly as before in both 10 and 11.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The responsive_image module in about 90 lines of pure PHP: read a breakpoints.yml-shaped array plus a responsive image style config entity, walk image_style_mappings in stored config order (no render-time sorting — that is the real behaviour, and the reason the mappings are written widest-first), resolve each mapping to derivative URLs, and print the <picture> it would emit. Predict three things before you run it — which <source> comes first, which one gets a type attribute, and what the WebP derivative's filename looks like. Then try moving the two mobile mappings to the top and watch every viewport get the 320px file.",
    code: `<?php
// A miniature responsive_image module: breakpoints.yml + a responsive image
// style config entity in, a real <picture> out. No Drupal bootstrap.

// --- THEME.breakpoints.yml (incident_theme) -------------------------------
$breakpoints = [
    'incident_theme.mobile' => ['mediaQuery' => '',                              'weight' => 0],
    'incident_theme.narrow' => ['mediaQuery' => 'all and (min-width: 560px)',    'weight' => 1],
    'incident_theme.wide'   => ['mediaQuery' => 'all and (min-width: 1000px)',   'weight' => 2],
];

// --- responsive_image.styles.incident_card.yml ----------------------------
$responsive_style = [
    'id' => 'incident_card',
    'breakpoint_group' => 'incident_theme',
    'fallback_image_style' => 'incident_card_narrow',
    // WIDEST FIRST. This stored order IS the <source> order - see below.
    'image_style_mappings' => [
        ['breakpoint_id' => 'incident_theme.wide',   'multiplier' => '1x', 'image_mapping_type' => 'sizes',      'image_mapping' => [
            'sizes' => '(min-width: 1000px) 900px, 100vw',
            'sizes_image_styles' => ['incident_card_narrow', 'incident_card_wide'],
        ]],
        ['breakpoint_id' => 'incident_theme.narrow', 'multiplier' => '1x', 'image_mapping_type' => 'image_style', 'image_mapping' => 'incident_card_narrow'],
        // "_none" = deliberately no derivative for this breakpoint/multiplier.
        ['breakpoint_id' => 'incident_theme.narrow', 'multiplier' => '2x', 'image_mapping_type' => '_none',      'image_mapping' => ''],
        ['breakpoint_id' => 'incident_theme.mobile', 'multiplier' => '1x', 'image_mapping_type' => 'image_style', 'image_mapping' => 'incident_card_mobile'],
        ['breakpoint_id' => 'incident_theme.mobile', 'multiplier' => '2x', 'image_mapping_type' => 'image_style', 'image_mapping' => 'incident_card_mobile_2x'],
    ],
];

// --- image.style.*.yml, reduced to what we need here ----------------------
$image_styles = [
    'incident_card_mobile'    => ['width' => 320,  'extension' => 'webp'],
    'incident_card_mobile_2x' => ['width' => 640,  'extension' => 'webp'],
    'incident_card_narrow'    => ['width' => 560,  'extension' => NULL],
    'incident_card_wide'      => ['width' => 1200, 'extension' => NULL],
];

$mime = ['webp' => 'image/webp', 'jpg' => 'image/jpeg', 'png' => 'image/png'];

/** ImageStyle::buildUrl(): an image_convert effect APPENDS the new extension. */
function derivative_url(string $style_id, string $uri, array $image_styles): string {
    $path = preg_replace('#^public://#', '', $uri);
    $ext = $image_styles[$style_id]['extension'] ?? NULL;
    return '/sites/default/files/styles/' . $style_id . '/public/' . $path . ($ext ? '.' . $ext : '');
}

function source_ext(string $style_id, string $uri, array $image_styles): string {
    return $image_styles[$style_id]['extension'] ?? pathinfo($uri, PATHINFO_EXTENSION);
}

$uri = 'public://incidents/rack-42.jpg';
$alt = 'Rack 42 with the failed PSU highlighted';

// Group the mappings by breakpoint. This is ResponsiveImageStyle::
// getKeyedImageStyleMappings(): a plain foreach over the raw config, so the
// keys come out in the order the breakpoints first appear in
// image_style_mappings. preprocessResponsiveImage() then emits one <source>
// per entry in THAT order - it never sorts by weight at render time.
// 'weight' only orders the rows in the admin form, and saving that form is
// what writes the mappings widest-first. Hand-written config gets no such
// help: <picture> takes the first <source> whose media matches, so putting
// the empty-mediaQuery mobile breakpoint first would serve 320px to everyone.
$by_breakpoint = [];
foreach ($responsive_style['image_style_mappings'] as $m) {
    $by_breakpoint[$m['breakpoint_id']][] = $m;
}

$sources = [];
foreach ($by_breakpoint as $breakpoint_id => $mappings) {
    $breakpoint = $breakpoints[$breakpoint_id];
    $srcset = [];
    $exts = [];
    $sizes = NULL;
    foreach ($mappings as $m) {
        if ($m['image_mapping_type'] === '_none') {
            continue;
        }
        if ($m['image_mapping_type'] === 'image_style') {
            $id = $m['image_mapping'];
            // Multiplier syntax: "URL 2x".
            $srcset[] = derivative_url($id, $uri, $image_styles) . ' ' . $m['multiplier'];
            $exts[] = source_ext($id, $uri, $image_styles);
        }
        else {
            $sizes = $m['image_mapping']['sizes'];
            foreach ($m['image_mapping']['sizes_image_styles'] as $id) {
                // Sizes syntax: WIDTH descriptors, never multipliers.
                $srcset[] = derivative_url($id, $uri, $image_styles) . ' ' . $image_styles[$id]['width'] . 'w';
                $exts[] = source_ext($id, $uri, $image_styles);
            }
        }
    }
    if ($srcset === []) {
        continue;
    }
    $attrs = 'srcset="' . implode(', ', $srcset) . '"';
    if ($sizes !== NULL) {
        $attrs .= ' sizes="' . $sizes . '"';
    }
    if ($breakpoint['mediaQuery'] !== '') {
        $attrs .= ' media="' . $breakpoint['mediaQuery'] . '"';
    }
    // type= is only emitted when every image in the srcset shares a MIME type.
    if (count(array_unique($exts)) === 1) {
        $attrs .= ' type="' . $mime[$exts[0]] . '"';
    }
    $sources[] = '  <source ' . $attrs . '/>';
}

$fallback = $responsive_style['fallback_image_style'];
echo "<picture>\\n";
echo implode("\\n", $sources) . "\\n";
echo '  <img src="' . derivative_url($fallback, $uri, $image_styles) . '"'
    . ' width="' . $image_styles[$fallback]['width'] . '"'
    . ' alt="' . $alt . '" loading="lazy"/>' . "\\n";
echo "</picture>\\n\\n";

// --- Where loading="lazy" actually comes from ----------------------------
$elements = [
    'field formatter'      => ['image_loading' => ['attribute' => 'lazy']],
    'hand-built #theme'    => [],
    'above-the-fold hero'  => ['image_loading' => ['attribute' => 'eager']],
];
foreach ($elements as $label => $settings) {
    $loading = $settings['image_loading']['attribute'] ?? '(none - you must set #attributes[loading])';
    printf("%-20s loading=%s\\n", $label, $loading);
}
echo "\\n";

// --- Alt text is data, not decoration ------------------------------------
$items = [
    ['uri' => 'public://incidents/rack-42.jpg', 'alt' => 'Rack 42 with the failed PSU highlighted'],
    ['uri' => 'public://incidents/graph.png',   'alt' => ''],
    ['uri' => 'public://incidents/redacted.jpg'],
];
$report = [];
foreach ($items as $item) {
    $report[basename($item['uri'])] = match (TRUE) {
        !array_key_exists('alt', $item) => 'MISSING - field_incident_photo has alt_field required off',
        $item['alt'] === ''             => 'empty string - decorative, allowed',
        default                         => 'ok',
    };
}
print_r($report);`,
    output: `<picture>
  <source srcset="/sites/default/files/styles/incident_card_narrow/public/incidents/rack-42.jpg 560w, /sites/default/files/styles/incident_card_wide/public/incidents/rack-42.jpg 1200w" sizes="(min-width: 1000px) 900px, 100vw" media="all and (min-width: 1000px)" type="image/jpeg"/>
  <source srcset="/sites/default/files/styles/incident_card_narrow/public/incidents/rack-42.jpg 1x" media="all and (min-width: 560px)" type="image/jpeg"/>
  <source srcset="/sites/default/files/styles/incident_card_mobile/public/incidents/rack-42.jpg.webp 1x, /sites/default/files/styles/incident_card_mobile_2x/public/incidents/rack-42.jpg.webp 2x" type="image/webp"/>
  <img src="/sites/default/files/styles/incident_card_narrow/public/incidents/rack-42.jpg" width="560" alt="Rack 42 with the failed PSU highlighted" loading="lazy"/>
</picture>

field formatter      loading=lazy
hand-built #theme    loading=(none - you must set #attributes[loading])
above-the-fold hero  loading=eager

Array
(
    [rack-42.jpg] => ok
    [graph.png] => empty string - decorative, allowed
    [redacted.jpg] => MISSING - field_incident_photo has alt_field required off
)
`,
  },

  keyPoints: [
    "Ladder of choices: '#theme' => 'image' (#uri, #alt, #attributes) is a bare <img> with no derivative; '#theme' => 'image_style' adds #style_name and resolves the derivative URL before handing off to image.html.twig; the field formatter is best because the style becomes a display setting a site builder can change without a deploy.",
    "An image style is a config entity of ordered effect plugins (image_scale, image_scale_and_crop with an anchor, image_crop, image_convert). Derivatives are generated on first request under /sites/default/files/styles/STYLE/public/..., and image_convert APPENDS the new extension — rack-42.jpg becomes rack-42.jpg.webp. Core GD supports WebP from 9.2; AVIF only from 11.2, where the PHP GD build has libavif, via the separate image_convert_avif effect (on Drupal 10 that means the contrib AVIF module).",
    "Responsive images need three things: media queries in THEME.breakpoints.yml (key prefixed with the extension name, plus weight and multipliers), a responsive image style config entity whose breakpoint_group matches that prefix and whose image_style_mappings pick image_style / sizes / _none per breakpoint+multiplier, and a fallback_image_style.",
    "The emitted <picture> contains one <source> per image_style_mappings entry, in stored config order — core does no render-time sorting. 'weight' in breakpoints.yml only orders the rows in the responsive image style admin form, which saves the mappings widest-first; write the config by hand and ordering them widest-first (so the browser's first match is the largest media query) is on you. Each srcset uses either multiplier descriptors (2x) or width descriptors (1200w) but never both, and type= is only added when every image in that srcset shares a MIME type.",
    "loading=\"lazy\" is a formatter setting (image_loading: {attribute: lazy}) — the setting arrived in 9.4 for the image formatter and 10.1 for the responsive image formatter, and defaults to lazy in both — not something '#theme' => 'image' does for you — set #attributes['loading'] yourself, and use 'eager' for above-the-fold hero images.",
    "Alt text is required data, not decoration: tick 'Alt field required' on the image field and pass #alt through in every custom render array. An empty string means decorative; a missing attribute is a WCAG 1.1.1 failure and Drupal will not fabricate one.",
  ],

  interview: [
    {
      q: "When would you use '#theme' => 'image_style' instead of just letting the field formatter render the image?",
      a: "Only when the image isn't being rendered as a field on the entity being viewed — a custom block that pulls a photo off a related node, a mail template, an og:image meta tag, a controller that builds a card from a query. The formatter is preferable whenever it applies, because the image style then lives in `core.entity_view_display.*` config where a site builder can swap the crop without a code deploy, and because the formatter also gives you the image link, the alt/title pass-through and `image_loading` for free. If I do reach for `'#theme' => 'image_style'` I remember it does not add `loading=\"lazy\"` and does not add the style's config cache tag — I set `#attributes['loading']` and merge `config:image.style.NAME` with the file's cache tags myself. For a URL with no markup at all, `ImageStyle::load($id)->buildUrl($uri)` is the direct route.",
    },
    {
      q: "Walk me through setting up responsive images for a card in incident_theme.",
      a: "Enable the core Responsive Image module, then declare the media queries in `incident_theme.breakpoints.yml` — keys namespaced as `incident_theme.mobile`, `incident_theme.narrow`, `incident_theme.wide`, each with a `mediaQuery`, a `weight` and the `multipliers` I want to support. Then create the image styles for each size (including an `image_convert` to WebP where it's worth it) and a responsive image style at `/admin/config/media/responsive-image-style` whose `breakpoint_group` is `incident_theme`; for each breakpoint+multiplier I pick either a single image style, a `sizes` declaration with a list of styles, or `_none`, and I always set a `fallback_image_style`. Finally I set the field's formatter to *Responsive image* in the card view display and export the lot with `drush config:export`. The classic gotcha is the breakpoint group: if `breakpoint_group` doesn't match the extension prefix in the breakpoints file, the responsive image style form shows no breakpoints and you sit there wondering why.",
    },
    {
      q: "How does this compare to what you'd do in Symfony, and what does Drupal buy you?",
      a: "In Symfony I'd use LiipImagineBundle: filter sets in `liip_imagine.yaml`, then `|imagine_filter('name')` in Twig, with derivatives written under `web/media/cache`. That covers the derivative pipeline well, but the `<picture>` element itself is hand-written markup — every template that shows the image repeats the media queries, the descriptors and the fallback, and adding a breakpoint means editing all of them. Drupal moves that markup into config: breakpoints and mappings are data, the `<picture>` is generated by `responsive-image.html.twig`, and I can still override that template in `incident_theme` or add a `responsive_image__incident_card` suggestion if a specific style needs different markup. The other real difference is that the whole thing is cache-tagged config, so changing a crop invalidates the right renders instead of requiring a cache clear.",
    },
    {
      q: "A page scores badly on LCP and the images are the problem. What do you actually check in a Drupal site?",
      a: "First, whether the image is going through an image style at all — an unstyled `'#theme' => 'image'` on a full-size upload is the usual culprit, visible immediately in the `src` (no `/styles/` segment). Second, the `loading` attribute: the field formatter defaults to `lazy`, which is right for below-the-fold images but actively harms LCP for a hero, so I set that formatter's `image_loading` to `eager`. Third, whether a responsive image style is in use so phones aren't downloading the desktop derivative, and whether the `sizes` value is honest — a wrong `sizes` makes the browser pick the largest candidate. Fourth, format: an `image_convert` effect to WebP typically cuts 25–35% off, and `width`/`height` on the img prevents layout shift. If derivatives are being generated on every request I'd also check that the files directory is writable and that a CDN isn't stripping the query string Drupal uses for the derivative token.",
    },
  ],

  quiz: [
    {
      question:
        "You build ['#theme' => 'image_style', '#style_name' => 'incident_card_narrow', '#uri' => $uri, '#alt' => $alt]. What is missing that the field formatter would have given you?",
      options: [
        "The derivative URL — image_style only outputs the original file",
        "loading=\"lazy\", which is a formatter setting rather than something the theme hook adds",
        "The alt attribute, which image.html.twig ignores",
        "Nothing; #theme => image_style and the formatter produce identical markup",
      ],
      answerIndex: 1,
      explain:
        "image_style does resolve the derivative and does render #alt. What it does not do is add loading=\"lazy\": that comes from the image / responsive_image field formatter's image_loading setting, which defaults to lazy (the setting was added in 9.4 for the image formatter and 10.1 for the responsive image formatter). In a hand-built render array you must set #attributes['loading'] yourself — and choose 'eager' for above-the-fold images.",
    },
    {
      question:
        "In a responsive image style, why are the <source> elements emitted with the widest media query first?",
      options: [
        "Because breakpoints.yml sorts alphabetically and 'wide' comes last",
        "Because <picture> uses the FIRST <source> whose media query matches, so narrower queries listed first would always win",
        "Because the fallback <img> must be the widest derivative",
        "It is arbitrary — the browser evaluates all sources and picks the smallest",
      ],
      answerIndex: 1,
      explain:
        "The <picture> element short-circuits on the first matching <source>. Drupal does not sort at render time: preprocessResponsiveImage() emits one <source> per image_style_mappings entry in stored config order. The 'weight' key only orders the rows in the responsive image style admin form, and saving that form writes the mappings widest-first — which is why UI-built config comes out with 'all and (min-width: 1000px)' before 'all and (min-width: 560px)'. Hand-write the config in the wrong order (mobile first, with its empty mediaQuery matching everything) and desktop visitors quietly receive the mobile derivative.",
    },
    {
      question:
        "Your image style has an image_convert effect with extension: webp. What does the derivative file look like for incidents/rack-42.jpg?",
      options: [
        "incidents/rack-42.webp — the original extension is replaced",
        "incidents/rack-42.jpg.webp — the new extension is appended to the full filename",
        "incidents/rack-42.jpg — the extension never changes, only the MIME type does",
        "incidents/webp/rack-42.jpg — the format becomes a path segment",
      ],
      answerIndex: 1,
      explain:
        "ImageStyle::buildUri() keeps the source filename intact and appends the converted extension, giving /sites/default/files/styles/STYLE/public/incidents/rack-42.jpg.webp. That matters when you write rewrite rules or CDN behaviours that match on file extension, and it is why a responsive image style can emit type=\"image/webp\" on one <source> and fall back to the original JPEG on another.",
    },
    {
      question:
        "Editors have been uploading incident photos with no alt text and the accessibility audit failed. What is the correct fix?",
      options: [
        "Add a hook_preprocess_image() that copies the filename into the alt attribute when it is empty",
        "Enable 'Alt field required' on the image field and backfill the existing values; keep passing #alt through in custom render arrays",
        "Set alt=\"\" on every image so the markup is at least valid",
        "Switch to the responsive image formatter, which generates alt text from the image content",
      ],
      answerIndex: 1,
      explain:
        "Alt text is editorial data — Drupal deliberately will not invent it, and a filename is not a description. The field settings have both 'Alt field' and 'Alt field required'; turning the latter on enforces it at the form layer. alt=\"\" is only correct for genuinely decorative images, and no formatter derives alt text for you.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "media-library",
  title: "Media & the Media Library",
  part: "Content Modeling in the UI",
  estMinutes: 12,
  summary:
    "Wrap files in fieldable media entities, browse and reuse them via the Media Library widget, and replace your hand-rolled image resize service with clickable image styles.",

  concept: `
## Stop attaching bare files to nodes

The framework-dev instinct is to put an image field (a raw file upload) on every
content type. That glues each upload to one node: no reuse, no shared caption or
credit, and the same photo uploaded five times. Drupal's answer is the **media
entity** — a file or remote URL *wrapped in a full content entity* you can add
fields to.

## Media types are bundles

Media types are to the \`media\` entity what content types are to \`node\`. Core
ships five sources: **Image**, **Document**, **Audio**, **Video** (local file),
and **Remote video** (oEmbed — paste a YouTube/Vimeo URL and Drupal fetches the
thumbnail and renders the player). Each type has a *source plugin* that owns one
source field (\`field_media_image\`, \`field_media_oembed_video\`, ...);
everything else is ordinary field UI. Want a caption and photographer credit on
every image? \`Structure > Media types > Image > Manage fields\` — add them like
any node field. No class, no migration.

Enable it all with two core modules: **Media** and **Media Library**
(\`drush pm:enable media media_library\`).

## The Media Library

\`Content > Media\` is the admin overview of every asset. The payoff for authors
is the **Media library widget**: put a *Reference > Media* field on a content
type and the form shows a modal asset browser — grid of thumbnails, search,
filter by type, bulk drag-and-drop upload, and one-click **reuse** of anything
already uploaded. Update the media item once (new crop, fixed credit) and every
node referencing it updates.

For inline images in body text, edit a text format
(\`Configuration > Content authoring > Text formats and editors\`): drag the
**Drupal media** button (it shows as a media/image icon in the toolbar builder)
into the CKEditor 5 toolbar and tick the **Embed media** filter. Editors then embed library assets as \`<drupal-media>\` tags that render
through a view mode — no shortcode parser to write.

## Image styles: your resize service, as config

\`Configuration > Media > Image styles\` holds named derivative pipelines: chains
of effects like *Scale*, *Crop*, *Scale and crop*, *Resize*, *Desaturate*, and
*Convert* (e.g. to WebP). This is the LiipImagineBundle \`filter_sets\` idea —
except you click the pipeline together and pick a style **per formatter** on a
Manage display tab. Derivatives are generated lazily on first request and cached
under \`sites/default/files/styles/<style-name>/...\`; the *Flush* link deletes
them so they regenerate.

## What exports, what doesn't

Everything structural is config: \`media.type.image\`, \`image.style.thumbnail\`,
the field definitions, and the form display that names \`media_library_widget\`
all land in \`drush cex\` output and go to git. The **media entities and the
uploaded files themselves are content** — they live in the database and the
files directory, and move by DB dump or migration, never by \`drush cim\`.
`,

  comparisons: [
    {
      label: "A fieldable wrapper around a file",
      intro:
        "You need images with a caption and a photographer credit, reusable across articles. In Symfony that's a Doctrine entity plus an uploader bundle; in Drupal it's a media type with two extra fields.",
      php: `// src/Entity/MediaAsset.php — hand-rolled media model
#[ORM\\Entity]
#[Vich\\Uploadable]
class MediaAsset
{
    #[ORM\\Id, ORM\\GeneratedValue, ORM\\Column]
    private ?int $id = null;

    #[Vich\\UploadableField(mapping: 'media_assets',
        fileNameProperty: 'fileName')]
    private ?File $file = null;

    #[ORM\\Column]
    private string $fileName = '';

    #[ORM\\Column(length: 255)]
    private string $caption = '';

    #[ORM\\Column(length: 255)]
    private string $credit = '';
}
// ...plus vich_uploader.yaml mapping + a migration.`,
      ts: `# Structure > Media types  (core "Image" type ships ready-made)
# Structure > Media types > Image > Manage fields
#   > Add field: Text (plain) "Caption", then "Credit"
# drush cex  ->  media.type.image.yml:
langcode: en
status: true
dependencies: {  }
id: image
label: Image
description: 'Use local images for reusable media.'
source: image
queue_thumbnail_downloads: false
new_revision: true
source_configuration:
  source_field: field_media_image
field_map:
  name: name
# Caption/Credit export separately as
# field.field.media.image.field_caption.yml etc.`,
      note:
        "The source plugin ('source: image') owns the file itself; caption and credit are plain field UI on the media bundle — zero PHP, all exportable config.",
    },
    {
      label: "Image derivatives: LiipImagine vs image styles",
      intro:
        "Every listing needs a 480x320 WebP crop of the hero image. In Symfony you declare a filter set in code-config; in Drupal you click an image style together and assign it to a formatter.",
      php: `# config/packages/liip_imagine.yaml — deployed with the code
liip_imagine:
    driver: gd
    filter_sets:
        card_teaser:
            format: webp
            filters:
                thumbnail:
                    size: [480, 320]
                    mode: outbound

# Twig, in every template that needs it:
# {{ asset.path|imagine_filter('card_teaser') }}`,
      ts: `# Configuration > Media > Image styles > Add image style
#   Name "Card teaser" -> add effect: Scale and crop 480x320
#   -> add effect: Convert to WEBP -> Save
# Then Manage display: pick style "Card teaser" on the formatter.
# drush cex  ->  image.style.card_teaser.yml:
langcode: en
status: true
dependencies: {  }
name: card_teaser
label: 'Card teaser'
effects:
  1c8a7e0e-6c2e-4f4b-9e0a-2f6f3a1c8d21:
    uuid: 1c8a7e0e-6c2e-4f4b-9e0a-2f6f3a1c8d21
    id: image_scale_and_crop
    weight: 1
    data:
      width: 480
      height: 320
      anchor: center-center
  4b9d2f31-8a55-4c8e-b1d0-7e5a9c3f6a02:
    uuid: 4b9d2f31-8a55-4c8e-b1d0-7e5a9c3f6a02
    id: image_convert
    weight: 2
    data:
      extension: webp`,
      note:
        "Same idea as a filter set, but built in the UI and wired to view modes there too. Derivatives generate lazily on first hit under /sites/default/files/styles/.",
      leftLang: "yaml",
    },
    {
      label: "Reusing assets across content",
      intro:
        "Editors should pick from existing uploads instead of re-uploading. DIY means a search API plus a custom picker modal; Drupal ships the whole browser as a widget.",
      php: `// The DIY route: search endpoint + hand-built JS modal picker,
// wired into every form that needs an asset.
#[Route('/api/assets', methods: ['GET'])]
public function search(Request $r, MediaAssetRepository $repo): JsonResponse
{
    $assets = $repo->createQueryBuilder('a')
        ->where('a.caption LIKE :q')
        ->setParameter('q', '%' . $r->query->get('q', '') . '%')
        ->orderBy('a.createdAt', 'DESC')
        ->setMaxResults(24)
        ->getQuery()->getResult();

    return $this->json($assets);
    // ...then build the grid UI, upload tab, selection state...
}`,
      ts: `# Structure > Content types > Article > Manage fields > Add field
#   Reference > Media, label "Hero media", allowed type: Image
# Manage form display: widget "Media library" (the default)
# drush cex  ->
# field.field.node.article.field_hero_media.yml (excerpt):
settings:
  handler: 'default:media'
  handler_settings:
    target_bundles:
      image: image
# core.entity_form_display.node.article.default.yml (excerpt):
content:
  field_hero_media:
    type: media_library_widget
    weight: 3
    settings:
      media_types: {  }`,
      note:
        "The modal grid, search, bulk upload, and 'reuse existing' flow all come from the widget — the only decisions you make are which media types the field allows.",
    },
    {
      label: "Embedding assets in rich text",
      intro:
        "Editors want images with captions inside body copy. The DIY answer is a shortcode filter; Drupal adds a CKEditor button plus a render-time filter — both config.",
      php: `// A Twig filter that expands [img id=42] shortcodes in body HTML.
class ShortcodeExtension extends AbstractExtension
{
    public function getFilters(): array
    {
        return [new TwigFilter('shortcodes',
            $this->expand(...), ['is_safe' => ['html']])];
    }

    private function expand(string $html): string
    {
        return preg_replace_callback('/\\[img id=(\\d+)\\]/',
            function (array $m): string {
                // load the asset, render <figure> + caption...
                return '<figure>...</figure>';
            }, $html);
    }
}`,
      ts: `# Configuration > Content authoring > Text formats and editors
#   > Basic HTML > Configure:
#   drag "Drupal media" into the toolbar; tick "Embed media". Save.
# drush cex  ->  editor.editor.basic_html.yml (excerpt):
settings:
  toolbar:
    items:
      - bold
      - italic
      - drupalMedia
# filter.format.basic_html.yml (excerpt):
filters:
  media_embed:
    id: media_embed
    provider: media
    status: true
    settings:
      default_view_mode: default
      allowed_view_modes: {  }
      allowed_media_types: {  }`,
      note:
        "The editor stores a <drupal-media> tag with the entity UUID; the media_embed filter swaps in the rendered media (via a view mode) at output time — a shortcode system you never wrote.",
    },
  ],

  playground: {
    intro:
      "Image styles are just named effect pipelines stored as config. Predict the derivative each style produces from a 2400x1200 source photo.",
    lang: "php",
    code: `<?php

// Simulate two image styles: each is a config-defined chain of effects
// applied to a source image on first request.
$styles = [
  'thumbnail' => [
    ['id' => 'image_scale', 'width' => 100, 'height' => 100],
  ],
  'card_teaser' => [
    ['id' => 'image_scale_and_crop', 'width' => 480, 'height' => 320],
    ['id' => 'image_convert', 'extension' => 'webp'],
  ],
];

$source = ['uri' => 'public://hero.jpg', 'width' => 2400, 'height' => 1200];

foreach ($styles as $name => $effects) {
  $img = $source;
  foreach ($effects as $e) {
    switch ($e['id']) {
      case 'image_scale':
        // Fit inside the box, keep aspect ratio, never upscale.
        $ratio = min($e['width'] / $img['width'], $e['height'] / $img['height'], 1);
        $img['width'] = (int) round($img['width'] * $ratio);
        $img['height'] = (int) round($img['height'] * $ratio);
        break;

      case 'image_scale_and_crop':
        // Cover the box, crop the overflow.
        $img['width'] = $e['width'];
        $img['height'] = $e['height'];
        break;

      case 'image_convert':
        // Core appends the new extension to the derivative name.
        $img['uri'] .= '.' . $e['extension'];
        break;
    }
  }
  $path = str_replace(
    'public://',
    'sites/default/files/styles/' . $name . '/public/',
    $img['uri']
  );
  echo $name . ': ' . $img['width'] . 'x' . $img['height'] . ' -> ' . $path . PHP_EOL;
}`,
    output: `thumbnail: 100x50 -> sites/default/files/styles/thumbnail/public/hero.jpg
card_teaser: 480x320 -> sites/default/files/styles/card_teaser/public/hero.jpg.webp`,
  },

  keyPoints: [
    "A media item is a fieldable content entity wrapping a file or a remote URL; media types (Image, Document, Audio, Video, Remote video) are its bundles, so you can add caption/credit fields in the UI.",
    "For anything reusable, use a Reference > Media field with the Media library widget instead of a bare image/file field — the modal browser gives search, bulk upload, and one-click reuse.",
    "Remote video uses the oEmbed source: editors paste a YouTube/Vimeo URL, Drupal fetches the thumbnail and renders the player.",
    "Image styles (Configuration > Media > Image styles) are named effect pipelines — scale, crop, convert-to-WebP — chosen per formatter on Manage display; they replace a hand-written resize service or LiipImagine filter sets.",
    "Derivatives generate lazily on first request under sites/default/files/styles/ and are flushed from the style's listing when you change the pipeline.",
    "Config vs content: media.type.*, image.style.*, field and display YAML export with drush cex; the media entities and uploaded files are content and never travel through config import.",
  ],

  interview: [
    {
      q: "Why would you use a media reference field instead of a plain image field on a content type?",
      a: "A plain image field ties the upload to that one entity: no reuse, no shared metadata, and duplicated files. A media reference points at a **media entity**, which is fieldable — caption, credit, alt policy live on the asset once — and the **Media library widget** lets editors search and reuse existing uploads instead of re-uploading. Fix the credit on the media item and every node rendering it updates. It is the same argument as normalizing a database: the asset becomes a first-class row other things reference.",
    },
    {
      q: "How do Drupal image styles compare to something like LiipImagineBundle in Symfony?",
      a: "They are the same concept — named derivative pipelines — but built in the admin UI and stored as config entities (`image.style.card_teaser`) instead of authored in a YAML package file. Each style is an ordered chain of effects (scale, crop, scale-and-crop, convert to WebP), and you attach a style to a **formatter** on a view mode rather than calling a Twig filter in templates. Derivatives are generated lazily on first request and written under `sites/default/files/styles/`, so there is no warm-up command. Because styles are config, `drush cex` puts the whole pipeline in git for review and deployment.",
    },
    {
      q: "In a media-heavy site, what parts export with drush cex and what has to move some other way?",
      a: "All the *structure* is config: `media.type.image`, its field definitions, `image.style.*`, the form display naming `media_library_widget`, and the text format enabling the `media_embed` filter. The *assets* are content: media entities live in the database and the binaries live in the files directory, so `cex`/`cim` never touch them. To move them between environments you sync the database (or use migrations/default-content tooling) plus the files directory. Interviewers probe this because shipping a site that 'loses all its images' on deploy is the classic config-vs-content mistake.",
    },
    {
      q: "An editor wants to place library images with captions inside body text. What do you configure — and what would you have coded in a framework?",
      a: "In a framework you would invent a shortcode or embed syntax, write the parser, and render a figure partial. In Drupal you edit the text format: drag the **Drupal media** button into the CKEditor 5 toolbar and enable the **Embed media** filter. The editor stores a `<drupal-media>` tag holding the media entity's UUID, and the `media_embed` filter renders it through a configurable view mode at output time. Both halves are config (`editor.editor.*`, `filter.format.*`), so the whole feature ships as reviewable YAML.",
    },
  ],

  quiz: [
    {
      question: "Where do you create a new image derivative pipeline (e.g. 480x320 WebP crop)?",
      options: [
        "Structure > Media types > Add media type",
        "Configuration > Media > Image styles",
        "Content > Media > Add media",
        "Write an ImageEffect plugin in a custom module",
      ],
      answerIndex: 1,
      explain:
        "Image styles live at Configuration > Media > Image styles: name a style, chain effects like Scale and crop and Convert, then pick the style on a formatter in Manage display. Custom ImageEffect plugins are only needed for effects core/contrib doesn't provide.",
    },
    {
      question: "Which of these does NOT export with drush cex on a media-heavy site?",
      options: [
        "media.type.image (the Image media type)",
        "image.style.thumbnail (the Thumbnail style)",
        "The uploaded files and their media entities",
        "field.field.node.article.field_hero_media",
      ],
      answerIndex: 2,
      explain:
        "Media entities and the binaries they wrap are content — database rows plus the files directory. Config export carries only structure: media types, image styles, field definitions, and displays.",
    },
    {
      question: "What turns a media reference field's form element into the pop-up asset browser with search and reuse?",
      options: [
        "The entity_reference_autocomplete widget",
        "The media_library_widget widget on the form display",
        "An 'Asset browser' checkbox on the field's storage settings",
        "A views_ui block placed in a modal region",
      ],
      answerIndex: 1,
      explain:
        "The Media Library module provides media_library_widget; select 'Media library' on Manage form display and the field renders the modal grid with search, type tabs, bulk upload, and reuse. The choice is exported inside core.entity_form_display.*.yml.",
    },
    {
      question: "How does the core 'Remote video' media type get a playable YouTube video onto the site?",
      options: [
        "It downloads the video file into the files directory",
        "Editors paste the video URL; the oEmbed source fetches the thumbnail and renders the provider's player",
        "It requires the contrib Video Embed Field module",
        "It stores raw iframe HTML in a formatted text field",
      ],
      answerIndex: 1,
      explain:
        "Remote video uses the oEmbed source plugin (source: 'oembed:video'). The source field holds just the URL; Drupal queries the provider's oEmbed endpoint for the thumbnail and metadata and renders the embedded player — no file is downloaded and no contrib module is needed.",
    },
  ],
};

export default lesson;

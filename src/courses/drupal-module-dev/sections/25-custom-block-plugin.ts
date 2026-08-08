import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 25,
  slug: "custom-block-plugin",
  title: "A Configurable Custom Block Plugin",
  part: "Polish & Ship",
  estMinutes: 13,
  summary:
    "Build RecentIncidentsBlock — a #[Block] attribute plugin with injected services, a cache-aware render array, and per-placement settings — the one deliverable that knits plugins, DI, render arrays, cache metadata, and config forms together.",

  concept: `
## Everything you've learned, in one file

A block is the first deliverable a site builder can actually *touch*: an
admin-placeable, admin-configurable widget. Building
\`src/Plugin/Block/RecentIncidentsBlock.php\` exercises the whole course so
far — plugin discovery, dependency injection, render arrays, cache metadata,
and a form — in about a hundred lines.

### Discovery: the #[Block] attribute

Drop the class in \`src/Plugin/Block/\` (the plugin manager scans that PSR-4
sub-namespace) and put the metadata in a PHP attribute — the mechanism Drupal
10.2 introduced and all of Drupal 11 uses:

\`\`\`php
#[Block(
  id: 'incident_tracker_recent',
  admin_label: new TranslatableMarkup('Recent incidents'),
  category: new TranslatableMarkup('Incident Tracker'),
)]
\`\`\`

The attribute class is \`Drupal\\Core\\Block\\Attribute\\Block\`. On Drupal
10.0/10.1 the same metadata goes in a docblock **annotation** instead —
\`@Block(id = "...", admin_label = @Translation("..."))\` — and both forms
still work on 10.2+/11 during the long deprecation runway. Plugin definitions
are cached, so \`drush cr\` after adding the file. \`drush generate
plugin:block\` scaffolds all of this, version-appropriately.

### DI, plugin flavor

Plugins are instantiated by the plugin manager, not resolved from the
container, so autowiring never happens. Implement
\`ContainerFactoryPluginInterface\`: its \`create()\` receives the container
**plus** \`$configuration\`, \`$plugin_id\`, \`$plugin_definition\` — the
plugin's per-placement settings and identity. Forward those three to
\`parent::__construct()\`, append your services (here:
\`entity_type.manager\`). Compare \`ContainerInjectionInterface\` on
controllers and forms, whose \`create()\` gets only the container — plugins
carry extra baggage.

### build(): a render array wearing cache metadata

\`build()\` queries the newest published incident nodes and returns an
\`item_list\` render array. The interesting part is \`#cache\`:

- **tags: \`node_list:incident\`** — the bundle-specific list tag (core since
  9.3). Saving, publishing, or deleting *any* incident node invalidates the
  block everywhere. Cheap and exact.
- **contexts: \`user.permissions\`** — the query runs with
  \`accessCheck(TRUE)\`, so output legitimately varies by permission set; one
  cached copy per combination.
- **max-age: \`Cache::PERMANENT\`** — tags handle freshness, so the render
  cache may keep it forever until a tag fires.

### Per-placement settings

Three methods give each placement its own settings:
\`defaultConfiguration()\` returns the defaults,
\`blockForm()\` adds elements to the placement dialog, and
\`blockSubmit()\` copies submitted values into \`$this->configuration\`.
Every placement is a \`block.block.*\` **config entity** (theme, region,
visibility conditions, and your settings) that \`drush cex\` exports — so the
same plugin can sit in the sidebar showing 3 incidents and on a dashboard
showing 10.

### Place it

Structure → **Block layout** (\`/admin/structure/block\`), pick the theme and
region, hit *Place block*, search "Recent incidents". The dialog shows core's
title and visibility settings with your \`blockForm()\` elements in the
middle. Symfony has no equivalent to that last step — a widget a site builder
positions and configures without a deploy.
`,

  comparisons: [
    {
      label: "Declaring the widget: attribute discovery",
      intro:
        "Symfony's closest analogue is a Twig component — attribute-discovered, but a developer decides where it renders. Drupal's block attribute registers the class with the block plugin manager so a site builder places it.",
      php: `<?php
// Symfony: a Twig component. #[AsTwigComponent] registers it,
// but placement is code: a DEVELOPER writes
// <twig:RecentIncidents :limit="3" /> into a template and deploys.
namespace App\\Twig\\Components;

use App\\Repository\\IncidentRepository;
use Symfony\\UX\\TwigComponent\\Attribute\\AsTwigComponent;

#[AsTwigComponent]
final class RecentIncidents
{
    public int $limit = 5;

    public function __construct(
        private readonly IncidentRepository $incidents,
    ) {}

    public function getIncidents(): array
    {
        return $this->incidents->findRecent($this->limit);
    }
}`,
      ts: `<?php
// Drupal: src/Plugin/Block/RecentIncidentsBlock.php — the block
// plugin manager discovers it; a SITE BUILDER places it in the UI.
declare(strict_types=1);

namespace Drupal\\incident_tracker\\Plugin\\Block;

use Drupal\\Core\\Block\\Attribute\\Block;
use Drupal\\Core\\Block\\BlockBase;
use Drupal\\Core\\Plugin\\ContainerFactoryPluginInterface;
use Drupal\\Core\\StringTranslation\\TranslatableMarkup;

#[Block(
  id: 'incident_tracker_recent',
  admin_label: new TranslatableMarkup('Recent incidents'),
  category: new TranslatableMarkup('Incident Tracker'),
)]
final class RecentIncidentsBlock extends BlockBase implements ContainerFactoryPluginInterface {
  // create(), build(), blockForm() ... — next panels.
}

/* Drupal 10.0/10.1 had no attribute discovery — same metadata
 * as a docblock ANNOTATION on the class instead:
 * @Block(
 *   id = "incident_tracker_recent",
 *   admin_label = @Translation("Recent incidents"),
 *   category = @Translation("Incident Tracker"),
 * )
 */`,
      note:
        "Attribute plugin discovery arrived in Drupal 10.2 (blocks and actions were the first core conversions); annotations still work everywhere but are the legacy form. Plugin definitions are cached — run drush cr after adding the class or it simply won't exist.",
    },
    {
      label: "Injecting services into the plugin",
      intro:
        "Symfony reflects on constructor type-hints. A Drupal plugin's create() is hand-written and receives three extra plugin arguments the container knows nothing about — identity and per-placement configuration.",
      php: `<?php
// Symfony: constructor autowiring. The container inspects the
// type-hint and injects — no factory method to write.
namespace App\\Twig\\Components;

use App\\Repository\\IncidentRepository;

final class RecentIncidents
{
    public function __construct(
        private readonly IncidentRepository $incidents,
    ) {}
}`,
      ts: `<?php
// Drupal: the plugin manager calls create() with the container
// PLUS the plugin's configuration and identity. Forward the three
// plugin args to parent::__construct(), then your services.
use Drupal\\Core\\Entity\\EntityTypeManagerInterface;
use Symfony\\Component\\DependencyInjection\\ContainerInterface;

final class RecentIncidentsBlock extends BlockBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    $plugin_id,
    $plugin_definition,
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): self {
    return new self(
      $configuration,
      $plugin_id,
      $plugin_definition,
      $container->get('entity_type.manager'),
    );
  }

}`,
      note:
        "Same pattern as ContainerInjectionInterface on controllers and forms, plus the three plugin arguments — $configuration is this placement's saved settings, already merged over defaultConfiguration() by the time build() runs.",
    },
    {
      label: "build(): render array + cache metadata",
      intro:
        "Symfony fragment caching is time-based (expire after N seconds). Drupal's render cache is declarative: the render array carries tags (invalidate), contexts (vary), and max-age — freshness without guessing a TTL.",
      php: `<?php
// Symfony: an ESI/fragment controller cached by TIME. Stale for
// up to 300s after an incident is filed; tag-based invalidation
// needs Varnish + FOSHttpCacheBundle.
use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\Response;
use Symfony\\Component\\HttpKernel\\Attribute\\Cache;

class RecentIncidentsController extends AbstractController
{
    #[Cache(smaxage: 300, public: true)]
    public function recent(IncidentRepository $incidents): Response
    {
        return $this->render('incident/_recent.html.twig', [
            'incidents' => $incidents->findRecent(5),
        ]);
    }
}
// Twig: {{ render_esi(controller('...::recent')) }}`,
      ts: `<?php
// Drupal: build() declares WHAT it depends on; the render cache
// does the rest. Cached forever, per permission set, until any
// incident node changes.
use Drupal\\Core\\Cache\\Cache;

public function build(): array {
  $storage = $this->entityTypeManager->getStorage('node');
  $nids = $storage->getQuery()
    ->accessCheck(TRUE)
    ->condition('type', 'incident')
    ->condition('status', 1)
    ->sort('created', 'DESC')
    ->range(0, $this->configuration['items_to_show'])
    ->execute();

  $items = [];
  foreach ($storage->loadMultiple($nids) as $node) {
    $items[] = $node->toLink()->toRenderable();
  }

  return [
    '#theme' => 'item_list',
    '#items' => $items,
    '#empty' => $this->t('No incidents logged.'),
    '#cache' => [
      // Invalidate: any incident node added/edited/deleted.
      'tags' => ['node_list:incident'],
      // Vary: accessCheck(TRUE) means output differs by role.
      'contexts' => ['user.permissions'],
      // Tags keep it fresh — no TTL needed.
      'max-age' => Cache::PERMANENT,
    ],
  ];
}`,
      note:
        "node_list:incident is the bundle-specific list cache tag (core since 9.3) — far cheaper than the site-wide node_list. Forgetting 'contexts' while access-checking is the classic leak: an anonymous user gets the cached copy built for an editor.",
    },
    {
      label: "Per-placement settings: blockForm()",
      intro:
        "The Twig component's $limit is fixed in a template until the next deploy. Drupal stores settings on each placement — a block.block.* config entity a site builder edits in the placement dialog.",
      php: `<?php
// Symfony: options are call-site arguments in a template.
// Changing the sidebar from 3 to 5 incidents = edit code, deploy.
//
// {# templates/base.html.twig #}
// <twig:RecentIncidents :limit="3" />  {# sidebar #}
//
// {# templates/dashboard.html.twig #}
// <twig:RecentIncidents :limit="10" /> {# dashboard #}

final class RecentIncidents
{
    public int $limit = 5;   // default when no :limit is passed
}`,
      ts: `<?php
// Drupal: three methods; values live in $this->configuration and
// persist on the block.block.* config entity for THIS placement.
use Drupal\\Core\\Form\\FormStateInterface;

public function defaultConfiguration(): array {
  return ['items_to_show' => 5];
}

public function blockForm($form, FormStateInterface $form_state): array {
  $form['items_to_show'] = [
    '#type' => 'number',
    '#title' => $this->t('Number of incidents to show'),
    '#min' => 1,
    '#max' => 20,
    '#default_value' => $this->configuration['items_to_show'],
  ];
  return $form;
}

public function blockSubmit($form, FormStateInterface $form_state): void {
  $this->configuration['items_to_show'] =
    (int) $form_state->getValue('items_to_show');
}`,
      note:
        "blockForm() elements appear inside the placement dialog between core's title and visibility settings (blockValidate() exists too). Place the block twice and each block.block.* export carries its own settings: items_to_show under the 'settings' key — versioned by drush cex like any config.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole block lifecycle in plain PHP: attribute discovery via reflection, two placements of ONE plugin class with different per-placement configuration merged over defaults, build() emitting cache metadata, and a node save firing tag-based invalidation. Predict the output, then run.",
    code: `<?php
// Simulate the block plugin lifecycle: attribute discovery, TWO
// placements of one plugin with different per-placement config,
// build() emitting cache metadata, and tag-based invalidation.

#[Attribute]
class Block {
    public function __construct(
        public string $id,
        public string $admin_label,
    ) {}
}

abstract class BlockBase {
    protected array $configuration;

    public function __construct(array $configuration, protected string $pluginId) {
        // Per-placement settings win over the plugin's defaults.
        $this->configuration = $configuration + $this->defaultConfiguration();
    }

    public function defaultConfiguration(): array {
        return [];
    }

    abstract public function build(): array;
}

#[Block(id: 'incident_tracker_recent', admin_label: 'Recent incidents')]
final class RecentIncidentsBlock extends BlockBase {
    private const INCIDENTS = [
        'DB replica lag',
        'Queue backlog on exports',
        'Slow admin pages',
        'Stale cache on /status',
    ];

    public function defaultConfiguration(): array {
        return ['items_to_show' => 3];
    }

    public function build(): array {
        return [
            '#theme' => 'item_list',
            '#items' => array_slice(self::INCIDENTS, 0, $this->configuration['items_to_show']),
            '#cache' => [
                'tags'     => ['node_list:incident'],
                'contexts' => ['user.permissions'],
                'max-age'  => -1,   // Cache::PERMANENT — tags handle freshness
            ],
        ];
    }
}

// 1. Discovery: the plugin manager reads the attribute via reflection.
$ref  = new ReflectionClass(RecentIncidentsBlock::class);
$meta = $ref->getAttributes(Block::class)[0]->newInstance();
echo "discovered: {$meta->id} ({$meta->admin_label})\\n\\n";

// 2. Two placements, each a block.block.* config entity in real Drupal.
$placements = [
    'sidebar (defaults)'   => new RecentIncidentsBlock([], $meta->id),
    'footer (items => 2)'  => new RecentIncidentsBlock(['items_to_show' => 2], $meta->id),
];

foreach ($placements as $label => $block) {
    $build = $block->build();
    echo "[{$label}]\\n";
    foreach ($build['#items'] as $title) {
        echo "  - {$title}\\n";
    }
    echo "  cache: tags=" . implode(',', $build['#cache']['tags'])
        . " contexts=" . implode(',', $build['#cache']['contexts']) . "\\n\\n";
}

// 3. Someone saves an incident node -> core invalidates node_list:incident.
$invalidated = ['node_list:incident'];
$cachedFragments = [
    'sidebar block (anon)'  => ['node_list:incident', 'user.permissions'],
    'footer block (editor)' => ['node_list:incident', 'user.permissions'],
    'site branding block'   => ['config:system.site'],
];
$lines = [];
foreach ($cachedFragments as $fragment => $tags) {
    $stale = array_intersect($tags, $invalidated) !== [];
    $lines[] = $fragment . ': ' . ($stale ? 'INVALIDATED, rebuilt on next view' : 'still cached');
}
echo implode("\\n", $lines);`,
    output: `discovered: incident_tracker_recent (Recent incidents)

[sidebar (defaults)]
  - DB replica lag
  - Queue backlog on exports
  - Slow admin pages
  cache: tags=node_list:incident contexts=user.permissions

[footer (items => 2)]
  - DB replica lag
  - Queue backlog on exports
  cache: tags=node_list:incident contexts=user.permissions

sidebar block (anon): INVALIDATED, rebuilt on next view
footer block (editor): INVALIDATED, rebuilt on next view
site branding block: still cached`,
  },

  keyPoints: [
    "A block plugin lives in src/Plugin/Block and is declared with the #[Block(id:, admin_label:, category:)] attribute (Drupal\\Core\\Block\\Attribute\\Block) on 10.2+/11 — a docblock @Block annotation on 10.0/10.1. Definitions are cached: drush cr after adding the class.",
    "ContainerFactoryPluginInterface::create() receives the container PLUS $configuration, $plugin_id, $plugin_definition — forward those three to parent::__construct() and append your services; plugins are never autowired.",
    "build() returns a render array whose #cache declares tags (node_list:incident — invalidate when any incident node changes), contexts (user.permissions — vary because of accessCheck(TRUE)), and max-age (Cache::PERMANENT — tags keep it fresh).",
    "defaultConfiguration() + blockForm() + blockSubmit() give each placement its own settings in $this->configuration; every placement is a block.block.* config entity (theme, region, visibility, settings) exported by drush cex.",
    "Place the block at /admin/structure/block (Block layout): pick a region, Place block, search the admin_label — your blockForm() elements render inside the dialog next to core's title and visibility options.",
    "Symfony's nearest analogue (a Twig component) is developer-placed with call-site options; a Drupal block is site-builder-placed and per-placement configurable with zero deploys — that's the point of the plugin + config-entity split.",
  ],

  interview: [
    {
      q: "Walk me through building a custom block plugin on Drupal 10/11.",
      a: "Create a class in `src/Plugin/Block/` extending `BlockBase`, declared with the `#[Block]` attribute — id, `admin_label` and `category` as `TranslatableMarkup` — on 10.2+/11, or an `@Block` annotation on 10.0/10.1. For services, implement `ContainerFactoryPluginInterface`: `create()` gets the container plus `$configuration`, `$plugin_id`, `$plugin_definition`; pass those three to `parent::__construct()` and inject the rest. `build()` returns a render array with `#cache` metadata (tags, contexts, max-age). If placements need settings, add `defaultConfiguration()`, `blockForm()` and `blockSubmit()`. Rebuild caches so discovery sees it, then place it via Block layout — `drush generate plugin:block` scaffolds the whole skeleton.",
    },
    {
      q: "Your block lists recent nodes. What cache metadata do you give it and why won't it go stale?",
      a: "Tags, contexts and max-age on the returned render array. The tag `node_list:incident` (the bundle-specific list tag, in core since 9.3) means creating, editing, or deleting any incident node invalidates every cached copy immediately — so `max-age` can be `Cache::PERMANENT`; freshness comes from invalidation, not TTL guessing. Because the entity query runs with `accessCheck(TRUE)`, output varies by role, so the `user.permissions` context stores one copy per permission set — omit it and an anonymous visitor can be served the copy built for an editor. This declarative bubbling model is the big contrast with Symfony's HTTP-level, time-based fragment caching, where tag invalidation requires Varnish plus FOSHttpCacheBundle.",
    },
    {
      q: "How does dependency injection into a plugin differ from a controller or form, and where do a block's settings actually live?",
      a: "Controllers and forms use `ContainerInjectionInterface`, whose `create()` receives only the container. Plugins use `ContainerFactoryPluginInterface`, whose `create()` additionally receives `$configuration`, `$plugin_id`, and `$plugin_definition`, because a plugin instance carries identity and instance settings; you forward those three to `parent::__construct()`. The settings themselves come from `defaultConfiguration()` merged with whatever `blockSubmit()` saved, and they persist on the `block.block.*` config entity that represents each placement — alongside theme, region, and visibility conditions. That's why one plugin class can be placed five times with five different configurations, and why the placements travel through `drush cex`/`cim` like any other config.",
    },
    {
      q: "When would you reach for a block plugin versus a custom route and controller?",
      a: "A route owns a full page at a fixed path; a block is a fragment a site builder can drop into any region, on any theme, with visibility conditions (path, role, content type) configured in the UI. If the requirement is 'show recent incidents somewhere in the sidebar, and let admins tune it', a block is right — no deploy to move or reconfigure it. If it's 'a page at /reports/incidents with access control', that's a route. They compose, too: the controller renders the page, while the same repository service feeds the block — which is exactly how incident_tracker uses its services in both places.",
    },
  ],

  quiz: [
    {
      question:
        "RecentIncidentsBlock caches with max-age: Cache::PERMANENT. Why doesn't the block show stale data after a new incident is filed?",
      options: [
        "Cron clears the render cache on every run",
        "The node_list:incident cache tag is invalidated when any incident node is saved, purging every cached copy",
        "PERMANENT only caches per session, so each user rebuilds it anyway",
        "The user.permissions context forces a rebuild on each request",
      ],
      answerIndex: 1,
      explain:
        "Tags decouple freshness from time: entity saves invalidate their list cache tags, and node_list:incident covers exactly this query. That's why max-age can be permanent. Contexts only choose WHICH cached variation to serve (per permission set) — they never force rebuilds, and cron is uninvolved.",
    },
    {
      question:
        "What extra arguments does a plugin's create() receive compared to a controller's create(), and what must happen to them?",
      options: [
        "None — both receive only the ContainerInterface",
        "$configuration, $plugin_id, $plugin_definition — forwarded to parent::__construct() alongside your injected services",
        "The route match and the current request",
        "The block's region and theme, which you must validate",
      ],
      answerIndex: 1,
      explain:
        "ContainerFactoryPluginInterface::create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition) carries the plugin's per-placement settings and identity; BlockBase needs all three in its constructor, so pass them through before your own services. ContainerInjectionInterface (controllers, forms) gets only the container.",
    },
    {
      question:
        "You place 'Recent incidents' in the sidebar showing 3 items and in the footer showing 10. Where do those two different values live?",
      options: [
        "In incident_tracker.settings simple config, keyed by region",
        "In the State API, since they're per-environment values",
        "Each placement is its own block.block.* config entity storing its own settings from blockSubmit()",
        "In the plugin attribute — you need two plugin classes",
      ],
      answerIndex: 2,
      explain:
        "One plugin class, many placements: every placement is a block.block.* config entity holding theme, region, visibility, and the settings array your blockSubmit() wrote. Both exports ship through drush cex. Simple config would be module-global, and State is explicitly not deployable content.",
    },
    {
      question:
        "Your module must still support Drupal 10.1. How do you declare the block plugin's metadata?",
      options: [
        "With the #[Block] attribute — attributes work on every Drupal 10 release",
        "With an @Block docblock annotation, since attribute plugin discovery only arrived in Drupal 10.2",
        "In incident_tracker.blocks.yml",
        "By tagging the class with 'block' in incident_tracker.services.yml",
      ],
      answerIndex: 1,
      explain:
        "Attribute-based plugin discovery landed in Drupal 10.2 (blocks among the first conversions); on 10.0/10.1 only annotations are parsed. Annotations still work on 10.2+/11, so @Block is the compatible choice until you can require >=10.2. Blocks are never declared in YAML or as tagged services.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 21,
  slug: "overriding-templates",
  title: "Overriding Core & Module Templates Safely",
  part: "The Theme Layer",
  estMinutes: 12,
  summary:
    "Read the Twig debug comment to find the file that actually rendered a region, copy that exact file into incident_theme, drush cr, then edit — and understand why Drupal makes you replace a template wholesale instead of extending it, and what that costs you at the next core upgrade.",

  concept: `
## The one-winner rule

Symfony's Twig loader is a search path. Drop a file at
\`templates/bundles/AcmeUserBundle/registration/confirmed.html.twig\` and it
shadows the bundle's copy; if you only wanted one block, the \`@!\` prefix
(\`{% extends "@!AcmeUser/registration/confirmed.html.twig" %}\`) pulls the
shadowed original back in and you override just that block.

Drupal has no \`@!\`. The theme registry resolves **exactly one file per theme
hook**, and the file you add does not layer over the previous winner — it *is*
the winner, wholesale. Everything else in this section follows from that.

## Find the file, do not guess it

Turn on Twig debug: on Drupal 10.1+ tick *Twig development mode* at
\`/admin/config/development/settings\`, or set \`twig.config: debug: true\` in
\`sites/development.services.yml\`. Then read the page source:

\`\`\`
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ✅ node--incident.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident.html.twig' -->
\`\`\`

Drupal 10.0–10.2 printed \`x\` and \`*\` instead of the emoji and always said
\`BEGIN OUTPUT\`; 10.3 introduced ✅/▪️ and the *💡 CUSTOM TEMPLATE OUTPUT*
wording, which appears only when the winning file lives inside the active
theme's directory — your "yes, my override is live" tell.

The path on the BEGIN line is the file to copy — **not "the core one"**. If
\`incident_theme\` declares \`base theme: olivero\`, the current winner for
\`node\` is \`core/themes/olivero/templates/content/node.html.twig\`, not
\`core/modules/node/templates/node.html.twig\`.

## Copy, rebuild, then edit

Keep the exact filename to replace the template everywhere, or rename it to
one of the listed suggestions to shrink the blast radius to a single bundle or
view mode. Adding a *new* template file always needs \`drush cr\`: the registry
caches the hook-to-file map. Editing the body of a template Drupal already
knows about does not, once the Twig cache is disabled.

## Why not extend it?

Twig namespaces do exist (\`@node/node.html.twig\`, \`@incident_theme/...\`), so
\`{% extends %}\` parses fine. It just buys nothing: core templates define no
\`{% block %}\` tags, so there is nothing to selectively override. Copy-then-edit
is the mechanism, and it comes with a bill — core's future changes to that
template (an accessibility attribute, a new variable, a removed wrapper) stop
reaching you the moment you copy it. Keep overrides few and small, and record
in the theme's README which core version each was copied from, so a minor
upgrade is a \`diff\`, not an archaeology dig.

## Precedence, and which base theme

Registry build order is modules first, then base themes most-distant-first,
then the active theme. A theme always beats a module; a module can never
override a theme.

Sub-theming a contrib theme inherits its templates *and* its future fixes —
and its future breakages, since base themes rarely promise a stable markup
API. \`php core/scripts/drupal generate-theme\` takes the opposite deal: it
copies starterkit_theme's entire \`templates/\` directory into your theme and
rewrites every reference to your machine name, so you own that markup forever;
the copied info.yml keeps starterkit_theme's own \`base theme\` line —
\`stable9\` on Drupal 10 and 11.0–11.3, \`false\` from 11.4 — so "standalone" is
about owning the files, not about having no parent.

Sub-theme \`stable9\` when you want a minimal, deliberately **frozen** copy of
Drupal 9.0.0's core markup as your baseline — stable9 is core's
backwards-compatibility layer ("A base theme using Drupal 9.0.0's core markup
and CSS"), and it will not change unless it is an objective bug fix. The fence
cuts both ways: core's template and CSS *improvements* do not reach you either
— and note stable9 is deprecated from Drupal 11.4, so treat it as a strategy
for 10.x–11.3 and plan a migration off it; on 11.4+ generate a theme with
Starterkit or sub-theme Olivero/Claro instead. If you actually want core's
evolving markup, sub-theme the core theme you are extending (Olivero, Claro) —
or do not override at all.
`,

  comparisons: [
    {
      label: "Which file rendered this markup?",
      intro:
        "Before you override anything you have to know what is currently winning. Symfony asks the console; Drupal writes the answer into the HTML itself.",
      leftLang: "bash",
      rightLang: "twig",
      php: `# Symfony: the loader is a search path, so ask which file matched.
php bin/console debug:twig @AcmeUser/registration/confirmed.html.twig

#  Matched File
#    templates/bundles/AcmeUserBundle/registration/confirmed.html.twig
#  Overridden Files
#    vendor/acme/user-bundle/templates/registration/confirmed.html.twig

# And to list every namespace and the directories behind it:
php bin/console debug:twig

# There is no per-request marker in the output — you map
# controller -> render() call -> template name by reading code.`,
      ts: `{# Drupal 10.1+: tick "Twig development mode" at
   /admin/config/development/settings, or set in
   sites/development.services.yml:

     parameters:
       twig.config:
         debug: true
         cache: false

   then drush cr and view source. Every themed chunk is wrapped: #}

<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ▪️ node--12.html.twig
   ▪️ node--incident--full.html.twig
   ✅ node--incident.html.twig
   ▪️ node--full.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident.html.twig' -->
<article class="node node--type-incident">...</article>
<!-- END CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident.html.twig' -->

{# ✅ = the file in use. ▪️ = a name Drupal WOULD have used if the file
   existed. 10.0-10.2 printed 'x' and '*' and always said BEGIN OUTPUT;
   the 💡 CUSTOM wording (10.3+) means the winner is inside your theme.
   A hook whose suggestions are malformed also gets an
   "INVALID FILE NAME SUGGESTIONS" block (10.1+). #}`,
      note:
        "The BEGIN line is the whole point: it names the file to copy. Do not assume it is the module's template — with base theme: olivero the winner for most hooks is Olivero's copy, not the module's.",
    },
    {
      label: "Making the override live",
      intro:
        "Same mechanic in both frameworks — put a file in the right directory and clear a cache — but the directory is derived differently, and Drupal's filename encodes the scope.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: mirror the bundle's path under templates/bundles/<BundleName>/.
mkdir -p templates/bundles/AcmeUserBundle/registration

cp vendor/acme/user-bundle/templates/registration/confirmed.html.twig \\
   templates/bundles/AcmeUserBundle/registration/confirmed.html.twig

php bin/console cache:clear

# The path is fixed by the bundle's own layout. There is no way to say
# "only for admin users" or "only on this route" in the filename —
# that logic goes inside the template, or in the controller.`,
      ts: `# Drupal: copy the file the debug comment named. Directory structure
# under templates/ is yours to choose — Drupal scans recursively and
# only the FILENAME matters.
mkdir -p themes/custom/incident_theme/templates/content

# 1. Replace this template everywhere on the site:
cp core/themes/olivero/templates/content/node.html.twig \\
   themes/custom/incident_theme/templates/content/node.html.twig

# 2. Or scope it to one bundle by renaming to a listed suggestion:
cp core/themes/olivero/templates/content/node.html.twig \\
   themes/custom/incident_theme/templates/content/node--incident.html.twig

# A NEW template file changes the registry, so this is mandatory:
drush cr

# Confirm it took: the comment should now read
#   💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/...'
# Sanity-check the whole theme's registered templates:
drush php:eval "print_r(array_keys(\\Drupal::service('theme.registry')->get()));" | head

# Generating the theme in the first place (Drupal 10/11):
php core/scripts/drupal generate-theme incident_theme \\
  --name "Incident Theme" --path themes/custom
# -> copies ALL of starterkit_theme's templates in; the copied info.yml
#    keeps starterkit_theme's own base theme (stable9 on 10.x-11.3,
#    false from 11.4)`,
      note:
        "Two files with the same name in different subdirectories of one theme is undefined behaviour — Drupal indexes by filename, so templates/content/node.html.twig and templates/misc/node.html.twig fight and you cannot predict the winner. Pick one location per template.",
    },
    {
      label: "Extend one block vs copy the whole file",
      intro:
        "The real divergence. Symfony lets you inherit from the template you just shadowed and change one block; Drupal makes you take the whole file and keep it forever.",
      leftLang: "twig",
      rightLang: "twig",
      php: `{# templates/bundles/AcmeUserBundle/registration/confirmed.html.twig

   The '!' says "extend the ORIGINAL, not the file I am writing" —
   without it this template extends itself and Twig blows up. #}
{% extends "@!AcmeUser/registration/confirmed.html.twig" %}

{% block confirmation_message %}
  <p class="incident-welcome">
    {{ 'You are now on the incident rota.'|trans }}
  </p>
{% endblock %}

{# Everything the bundle changes OUTSIDE that block still reaches you
   on the next composer update. Your surface area is one block. #}`,
      ts: `{#
  themes/custom/incident_theme/templates/content/node--incident.html.twig

  Copied verbatim from:
    core/themes/olivero/templates/content/node.html.twig @ Drupal 10.3.0
  Changed:  wrapped the submitted footer in <aside>, added severity class.
  Re-diff against core on every minor upgrade.

  {% extends '@olivero/content/node.html.twig' %} would PARSE — the
  namespace is real — but core templates declare no {% block %} tags,
  so there is nothing to override. Hence: copy the whole file.
#}
<article{{ attributes.addClass('incident--sev-' ~ severity) }}>

  {{ title_prefix }}
  {% if label and view_mode != 'full' %}
    <h2{{ title_attributes }}>
      <a href="{{ url }}" rel="bookmark">{{ label }}</a>
    </h2>
  {% endif %}
  {{ title_suffix }}

  {% if display_submitted %}
    <aside class="incident-meta">        {# <- the only markup change #}
      {{ author_picture }}
      <div{{ author_attributes }}>
        {% trans %}Submitted by {{ author_name }} on {{ date }}{% endtrans %}
        {{ metadata }}
      </div>
    </aside>
  {% endif %}

  <div{{ content_attributes }}>
    {{ content }}
  </div>

</article>`,
      note:
        "Keep the copied file as close to the original as you can bear — every line you did not need to touch is a line you now have to re-review at every core upgrade. If the change is purely a class or a wrapper, a preprocess function plus CSS is usually cheaper than owning a template.",
    },
    {
      label: "Overriding for one bundle only",
      intro:
        "You want incident nodes to render differently, and nothing else on the site to change. The filename is Drupal's scoping mechanism — and when the suggestion you need does not exist, you add it.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony: one template, so the scoping is an if. Every branch you
   add makes the shared template harder to reason about, and the file
   is still overridden for everyone. #}
{% extends "@!AcmeContent/entity/show.html.twig" %}

{% block body %}
  {% if entity.type == 'incident' and entity.severity == 'critical' %}
    {% include 'incident/_critical_banner.html.twig' %}
  {% endif %}
  {{ parent() }}
{% endblock %}

{# The alternative is to stop overriding and instead render a
   different template from the controller, which means the bundle's
   own callers still get the original. #}`,
      ts: `<?php
// Drupal: the filename IS the condition. These need no code at all,
// because node_theme_suggestions_node() already offers them:
//
//   node--incident.html.twig               (all incident nodes)
//   node--incident--teaser.html.twig       (incident nodes, teaser)
//   node--12--full.html.twig               (that one node, full view)
//   field--node--field-severity--incident.html.twig
//   block--incident-tracker-open-count.html.twig
//
// Need a suggestion core does not offer? Add one in incident_theme.theme.

/**
 * Implements hook_theme_suggestions_HOOK_alter() for node templates.
 */
function incident_theme_theme_suggestions_node_alter(array &$suggestions, array &$variables): void {
  $node = $variables['elements']['#node'];
  if ($node->bundle() !== 'incident' || $node->get('field_severity')->isEmpty()) {
    return;
  }
  // Appended LAST = most specific: Drupal walks the array backwards and
  // takes the first suggestion that has a matching file.
  // Must start with the base hook + '__' and contain no hyphens, or
  // Twig debug lists it under INVALID FILE NAME SUGGESTIONS (10.1+).
  $suggestions[] = 'node__incident__severity_' . $node->get('field_severity')->value;
}

// field_severity is a list_string with the keys low/high/critical, so
// themes/custom/incident_theme/templates/content/
//   node--incident--severity-critical.html.twig
// wins for critical incidents only, and every other node is untouched by you.
// drush cr after adding either the hook or the file.`,
      note:
        "Prefer the narrowest suggestion that does the job. Overriding node.html.twig to style incidents means you now own the markup of every node type on the site, forever — including ones content editors create after you leave.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "Two mechanics in one script. First, layer module / base-theme / active-theme templates into a registry, resolve the winner for the 'node' hook most-specific-first, and print the exact THEME DEBUG comment Drupal 10.3+/11 emits — predict which suggestion gets the ✅, remembering that a more specific name only wins if the FILE exists. Second, audit three copied templates against the core versions they were taken from: that report is the upgrade tax made visible.",
    code: `<?php
// Part 1: which Twig file actually wins for one theme hook, and the THEME
// DEBUG comment Drupal 10.3+/11 prints for it.

// Every layer that may supply a template, in theme-registry build order:
// modules first, then base themes (most distant first), then the active
// theme. A later layer overwrites an earlier one for the SAME filename.
$layers = [
    'core/modules/node/templates'                    => ['node.html.twig'],
    'core/modules/system/templates'                  => ['field.html.twig'],
    'core/themes/olivero/templates/content'          => ['node.html.twig'],
    'themes/custom/incident_theme/templates/content' => ['node--incident.html.twig'],
];
$active_theme_dir = 'themes/custom/incident_theme';

$available = [];
foreach ($layers as $dir => $files) {
    foreach ($files as $file) {
        // One winner per filename: the last layer to declare it keeps it.
        $available[$file] = $dir . '/' . $file;
    }
}
echo "REGISTRY (filename => winning path)\\n";
foreach ($available as $file => $path) {
    echo "  {$file} => {$path}\\n";
}

// What node_theme_suggestions_node() built for node 12 in view mode 'full',
// stored LEAST specific first.
$hook = 'node';
$suggestions = [
    'node__full',
    'node__incident',
    'node__incident__full',
    'node__12',
    'node__12__full',
];

/** Hook name -> file name: underscores become hyphens. */
function template_file(string $suggestion): string {
    return strtr($suggestion, '_', '-') . '.html.twig';
}

// ThemeManager walks suggestions MOST specific first and stops at the first
// one the registry actually has; otherwise it falls back to the base hook.
$winner = template_file($hook);
foreach (array_reverse($suggestions) as $suggestion) {
    if (isset($available[template_file($suggestion)])) {
        $winner = template_file($suggestion);
        break;
    }
}
$winning_path = $available[$winner];

// twig.engine reverses the suggestion list, then appends the base hook.
$display = array_reverse($suggestions);
$display[] = $hook;

echo "\\n<!-- THEME DEBUG -->\\n";
echo "<!-- THEME HOOK: '{$hook}' -->\\n";
echo "<!-- FILE NAME SUGGESTIONS:\\n";
foreach ($display as $suggestion) {
    $file = template_file($suggestion);
    // Drupal 10.3+ markers. 10.0-10.2 printed 'x' and '*'.
    echo '   ' . ($file === $winner ? "\\u{2705}" : "\\u{25AA}\\u{FE0F}") . " {$file}\\n";
}
echo "-->\\n";
// The 'CUSTOM TEMPLATE' wording only appears when the winner lives in the
// active theme's own directory - that is your "yes, my override is live" tell.
$custom = str_starts_with($winning_path, $active_theme_dir);
$begin = $custom ? "\\u{1F4A1} BEGIN CUSTOM TEMPLATE OUTPUT" : 'BEGIN OUTPUT';
echo "<!-- {$begin} from '{$winning_path}' -->\\n";

// Part 2: the upgrade tax. Every copied template is frozen at the core
// version you copied it from.
$core_now = '11.1.4';
$overrides = [
    'templates/content/node--incident.html.twig' => [
        'copied_from' => 'core/themes/olivero/templates/content/node.html.twig',
        'copied_at'   => '10.3.0',
    ],
    'templates/navigation/menu--main.html.twig' => [
        'copied_from' => 'core/modules/system/templates/menu.html.twig',
        'copied_at'   => '11.1.0',
    ],
    'templates/form/details.html.twig' => [
        'copied_from' => 'core/modules/system/templates/details.html.twig',
        'copied_at'   => '10.1.0',
    ],
];
// When core last touched each source file. Olivero is a living core theme:
// its markup does evolve, so a copy taken from it needs re-diffing at every
// minor upgrade. (stable9 - frozen at Drupal 9.0.0's markup, changed only for
// objective bug fixes, and deprecated from 11.4 - goes stale far more slowly,
// which is the same fence that keeps core's IMPROVEMENTS away from it.)
$core_touched = [
    'core/themes/olivero/templates/content/node.html.twig' => '10.2.0',
    'core/modules/system/templates/menu.html.twig'         => '10.2.0',
    'core/modules/system/templates/details.html.twig'      => '11.1.2',
];

echo "\\nOVERRIDE AUDIT (core {$core_now})\\n";
foreach ($overrides as $file => $meta) {
    $upstream = $core_touched[$meta['copied_from']];
    $stale = version_compare($upstream, $meta['copied_at'], '>');
    printf(
        "  %-42s copied @ %-7s upstream @ %-7s %s\\n",
        $file,
        $meta['copied_at'],
        $upstream,
        $stale ? 'STALE - diff it' : 'ok'
    );
}`,
    output: `REGISTRY (filename => winning path)
  node.html.twig => core/themes/olivero/templates/content/node.html.twig
  field.html.twig => core/modules/system/templates/field.html.twig
  node--incident.html.twig => themes/custom/incident_theme/templates/content/node--incident.html.twig

<!-- THEME DEBUG -->
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   ▪️ node--12--full.html.twig
   ▪️ node--12.html.twig
   ▪️ node--incident--full.html.twig
   ✅ node--incident.html.twig
   ▪️ node--full.html.twig
   ▪️ node.html.twig
-->
<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from 'themes/custom/incident_theme/templates/content/node--incident.html.twig' -->

OVERRIDE AUDIT (core 11.1.4)
  templates/content/node--incident.html.twig copied @ 10.3.0  upstream @ 10.2.0  ok
  templates/navigation/menu--main.html.twig  copied @ 11.1.0  upstream @ 10.2.0  ok
  templates/form/details.html.twig           copied @ 10.1.0  upstream @ 11.1.2  STALE - diff it
`,
  },

  keyPoints: [
    "Workflow: enable Twig debug (Drupal 10.1+ at /admin/config/development/settings, or twig.config.debug: true in sites/development.services.yml), read the BEGIN OUTPUT line in the page source, copy THAT file into your theme's templates/ keeping the filename (or renaming to a listed suggestion), drush cr, then edit.",
    "Drupal 10.3+ marks the winning suggestion with ✅ and the rest with ▪️, and says '💡 BEGIN CUSTOM TEMPLATE OUTPUT' when the winner lives inside the active theme; 10.0–10.2 used 'x' / '*' and always said 'BEGIN OUTPUT'. Malformed suggestions get an INVALID FILE NAME SUGGESTIONS block from 10.1 on.",
    "Only one template wins per theme hook, so your copy replaces the previous winner entirely — there is no Drupal equivalent of Symfony's {% extends \"@!Bundle/...\" %} because core templates define no {% block %} tags to override.",
    "The upgrade tax: once copied, core's future fixes to that template never reach you. Keep overrides few and minimal, note in the theme README which core version each was copied from, and re-diff on every minor upgrade.",
    "Scope with the filename: node--incident--teaser.html.twig beats overriding node.html.twig, and hook_theme_suggestions_HOOK_alter() adds suggestions core does not offer (append the most specific last; no hyphens; must start with the base hook plus '__').",
    "Registry order is modules, then base themes most-distant-first, then the active theme — a theme always beats a module. Sub-theming inherits the parent's markup and its future changes; generate-theme copies starterkit_theme's templates into your theme so you own that markup forever, while the copied info.yml keeps starterkit_theme's own base theme line (stable9 on Drupal 10 and 11.0–11.3, false from 11.4) — 'standalone' means owning the files, not having no parent.",
  ],

  interview: [
    {
      q: "Walk me through overriding the markup of a specific content type's teaser in a custom theme.",
      a: "First I enable Twig debug — on Drupal 10.1+ that's the *Twig development mode* checkbox at `/admin/config/development/settings`, otherwise `twig.config: debug: true` in `sites/development.services.yml` — then view source on the page and find the `THEME DEBUG` comment for that teaser. The `BEGIN OUTPUT` line names the file currently rendering it, which is what I copy: with `base theme: olivero` that's usually Olivero's template, not the module's. I copy it into `incident_theme/templates/content/` and rename it to a suggestion from the ✅/▪️ list — `node--incident--teaser.html.twig` — so only that bundle and view mode are affected. Then `drush cr`, because adding a new template file changes the theme registry, and only then do I edit. I also record in the theme's README which core file and version I copied from, since I've just taken permanent ownership of that markup.",
    },
    {
      q: "In Symfony you can override just one block of a bundle template with {% extends \"@!Bundle/...\" %}. Why can't you do that in Drupal?",
      a: "Two reasons. The mechanical one is that Drupal's theme registry resolves exactly one template per theme hook — there's no notion of \"the file I shadowed\", so there's nothing for `@!` to point at. The practical one is that Drupal core templates contain no `{% block %}` tags, so even though the Twig namespaces are real and `{% extends '@olivero/content/node.html.twig' %}` would parse, there'd be nothing to selectively override. So the idiom is copy-then-edit, and the cost is that core's later changes to that file stop reaching you. That's why I try to solve things in a preprocess function plus CSS first, and only take ownership of a template when the DOM structure itself genuinely has to change.",
    },
    {
      q: "A junior copies node.html.twig into the theme to add a class to incident nodes. What's your feedback?",
      a: "Two problems. The scope is far too wide: they now own the markup of every content type on the site, including ones created after they leave, when `node--incident.html.twig` would have limited the blast radius to one bundle. And the change probably doesn't need a template at all — adding a class is what `hook_preprocess_node()` and `$variables['attributes']['class'][]` are for, which leaves the core template in place so its future accessibility and markup fixes keep flowing in. I'd also point out that they've quietly taken on an upgrade obligation: every copied template needs a provenance comment naming the core version it came from, and a re-diff at each minor upgrade, or the site slowly drifts away from core's markup without anyone noticing.",
    },
    {
      q: "Sub-theme an existing theme, or generate a fresh one with the starterkit? How do you decide?",
      a: "Sub-theming means `base theme: olivero` (or a contrib theme) in the info.yml and inheriting its templates, libraries and CSS — you get the parent's future improvements for free, but base themes generally don't promise a stable markup API, so a parent redesign can break your overrides on a minor upgrade. `php core/scripts/drupal generate-theme incident_theme --path themes/custom` is the opposite trade: it copies starterkit_theme's entire templates directory into your theme and rewrites the references to my machine name, so I own that markup forever and nothing upstream changes it under me. One correction people get wrong: that does *not* mean `base theme: false` — the copied info.yml keeps starterkit_theme's own base theme value, which is `stable9` on Drupal 10 and 11.0–11.3 and only `false` from 11.4. 'Standalone' is about owning the copied files, not about having no parent. For a heavily designed site I generate; for something that should stay pinned to a known-stable, minimal markup layer I sub-theme `stable9` — but I'm clear about what that buys: stable9 is a frozen snapshot of Drupal 9.0.0's core markup and CSS, changed only for objective bug fixes, so it fences me off from core's markup *improvements* as much as from its breakages — and it's deprecated from Drupal 11.4, so I'd treat it as a strategy for 10.x–11.3 and plan the migration off it; on 11.4+ I'd generate with Starterkit or sub-theme Olivero/Claro. If I want core's evolving markup I sub-theme Olivero or Claro instead.",
    },
  ],

  quiz: [
    {
      question:
        "Twig debug shows six suggestions for a node, with ✅ next to node--incident.html.twig and ▪️ next to the more specific node--12--full.html.twig above it. Why didn't the more specific one win?",
      options: [
        "Suggestions ending in a view mode are always lower priority than bundle suggestions",
        "No node--12--full.html.twig file exists anywhere in the registry, so Drupal kept walking down the list",
        "The ▪️ marker means the suggestion was rejected as invalid",
        "Node ID suggestions only apply to anonymous users",
      ],
      answerIndex: 1,
      explain:
        "The suggestion list is aspirational: it shows every filename Drupal would have used, most specific first. Drupal walks it from the top and takes the first one that has an actual file in the theme registry. ▪️ simply means 'this name was offered but no file exists'. Invalid suggestions are reported separately under INVALID FILE NAME SUGGESTIONS (Drupal 10.1+).",
    },
    {
      question:
        "You copy core's menu.html.twig into incident_theme/templates/navigation/ and reload. Nothing changes. What is the most likely cause?",
      options: [
        "You must register the template in hook_theme() before a theme can override it",
        "Templates must sit directly in templates/, not in a subdirectory",
        "You haven't run drush cr — a new template file changes the theme registry, which is cached",
        "Theme templates cannot override module templates; only base themes can",
      ],
      answerIndex: 2,
      explain:
        "Drupal scans a theme's directory recursively (so subdirectories are fine) and indexes templates by filename, but that hook-to-file map is cached in the theme registry. Adding a *new* template file therefore requires drush cr. Editing the body of a template Drupal already knows about doesn't, once the Twig cache is disabled. And themes always beat modules — that ordering is never the problem.",
    },
    {
      question:
        "Which change is the WRONG reason to copy a core template into your theme?",
      options: [
        "You need to wrap the submitted-by footer in an <aside> element",
        "You need to add a CSS class based on an entity field value",
        "You need to move a field out of {{ content }} and place it above the title",
        "You need to remove a wrapper div that breaks a CSS grid",
      ],
      answerIndex: 1,
      explain:
        "Adding a class is what preprocess is for: $variables['attributes']['class'][] = 'incident--sev-critical' in hook_preprocess_node() leaves core's template in place, so its future accessibility and markup fixes keep reaching you. The other three genuinely change the DOM structure, which only a template can do. The rule of thumb: preprocess for data and attributes, template override only when the element tree itself must change.",
    },
    {
      question:
        "incident_theme declares 'base theme: olivero'. Twig debug says the node is rendered by core/themes/olivero/templates/content/node.html.twig. Which file should you copy?",
      options: [
        "core/modules/node/templates/node.html.twig, because that's the module that owns the hook",
        "core/themes/olivero/templates/content/node.html.twig — the file the BEGIN OUTPUT line names",
        "core/themes/stable9/templates/content/node.html.twig, since stable9 is core's markup baseline",
        "Either one; they are identical after the registry merges them",
      ],
      answerIndex: 1,
      explain:
        "The template that wins is the one the base theme already substituted, and that's what your users are actually seeing today. Copying the module's version — or stable9's, which is not in this theme's inheritance chain — silently reverts every markup decision Olivero made. The BEGIN OUTPUT (or 💡 BEGIN CUSTOM TEMPLATE OUTPUT) path exists precisely so you never have to guess which layer won.",
    },
  ],
};

export default lesson;

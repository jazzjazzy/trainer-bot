import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 23,
  slug: "text-formats-editor",
  title: "Text Formats & CKEditor: Safe Rich Text",
  part: "Layout, Blocks & Menus",
  estMinutes: 11,
  summary:
    "Build safe rich text as config: text formats are ordered filter pipelines gated by role, paired with a per-format CKEditor 5 toolbar whose buttons keep the allowed-tags list in sync automatically.",

  concept: `
## Rich text is a filter pipeline, not a sanitizer you wire

In Symfony, safe rich text is your problem: install \`symfony/html-sanitizer\`
(or the HTMLPurifier of old), configure an allowlist in code, and remember to
call it everywhere untrusted HTML is rendered. Drupal ships the whole machine
as clickable config at **Configuration > Content authoring > Text formats and
editors**. A **text format** is an ordered pipeline of **filters** that runs
over stored text. Core ships four:

- **Basic HTML** — limits tags to a safe allowlist, aligns/captions images,
  embeds media; paired with a CKEditor 5 toolbar.
- **Restricted HTML** — no editor at all; limits tags, converts line breaks
  into paragraphs, turns URLs into links. Comment-grade input.
- **Full HTML** — no tag limiting whatsoever. Trusted humans only.
- **Plain text** — the *fallback format*, available to everyone; escapes all
  HTML.

Each filter is a checkbox with settings and a weight — you are literally
ordering middleware in a form.

## Stored raw, filtered at view time

A formatted text field stores two columns: the raw text exactly as typed, plus
the id of the chosen format. Filters run when the field is **rendered**, and
the result is cached. That is the inverse of "purify on input", and it is the
better default: nothing is destroyed on save, so tightening a format's
allowlist tomorrow retroactively cleans every article ever written with it.
Change the config, rebuild caches, done.

## Roles are the XSS defense

The format form has a **Roles** checkbox set. Ticking one grants the
permission \`use text format X\` — which exports on the *role*, not the
format. That permission gates which formats a user may pick while editing;
rendering always uses the stored format. The security rule is one sentence:
**untrusted roles never get Full HTML**, because with no tag filter a
\`<script>\` sails straight into the page. Where Symfony makes "filtered"
something you remember to bolt on, Drupal is *filtered by default* and makes
"unfiltered" an explicit, auditable grant.

## CKEditor 5, per format

Drupal 10 removed CKEditor 4; CKEditor 5 is the standard editor in 10 and 11.
On the format form you pick the editor, then **drag buttons** between
"Available buttons" and the active toolbar. The killer D10/11 feature: with
the tag-limiting filter enabled, the *allowed HTML tags* list becomes
read-only and **syncs automatically with the buttons you enable** — add the
heading or list buttons and the matching tags appear in \`allowed_html\`.
Editor and output filter cannot drift. Need a tag no button produces? Add it
under the **Source Editing** plugin's "Manually editable HTML tags".
Per-format inline image upload (directory, max size) lives here too.

## Two config entities per format — and one dev bridge

\`drush cex\` exports the pair: \`filter.format.basic_html\` (the pipeline)
and \`editor.editor.basic_html\` (toolbar, plugin settings, upload settings),
with the role grants inside \`user.role.*\`. Adding behaviour is usually a
click — core and contrib ship filters for most needs. Only when nothing fits
do you cross the bridge and write a **filter plugin**: a small class extending
\`FilterBase\` with a \`process()\` method, which then shows up as... another
checkbox on every format's config page.
`,

  comparisons: [
    {
      label: "The sanitizer allowlist: code vs format config",
      intro:
        "Untrusted authors need bold, links, and headings — nothing else. In Symfony you wire the sanitizer and hard-code the allowlist; in Drupal the allowlist is a filter setting inside a text format.",
      php: `// Symfony 6.4/7: wire symfony/html-sanitizer yourself
// (the modern HTMLPurifier). The allowlist lives in CODE.
$config = (new HtmlSanitizerConfig())
    ->allowElement('p')
    ->allowElement('br')
    ->allowElement('strong')
    ->allowElement('em')
    ->allowElement('code')
    ->allowElement('a', ['href', 'hreflang'])
    ->allowElement('h2', ['id'])
    ->allowElement('blockquote', ['cite']);

$sanitizer = new HtmlSanitizer($config);

// ...and remember to call it at EVERY output point:
echo $sanitizer->sanitize($post->getBody());
// Forget once = stored XSS. Add a tag = redeploy.`,
      ts: `# Configuration > Content authoring > Text formats and editors
#   > Add text format: name it, enable + order the filter
#   checkboxes, incl. "Limit allowed HTML tags and correct
#   faulty HTML". Save configuration.
# drush cex  ->  filter.format.basic_html.yml (excerpt):
name: 'Basic HTML'
format: basic_html
weight: 0
filters:
  filter_html:
    id: filter_html
    provider: filter
    status: true
    weight: -10
    settings:
      allowed_html: '<br> <p> <h2 id> <h3 id> <strong> <em> <code> <a href hreflang> <ul type> <ol start type> <li> <blockquote cite>'
      filter_html_help: false
      filter_html_nofollow: false
  filter_align:
    id: filter_align
    provider: filter
    status: true
    weight: 7
    settings: {  }
  filter_caption:
    id: filter_caption
    provider: filter
    status: true
    weight: 8
    settings: {  }`,
      note:
        "The pipeline runs in weight order every time the field renders (cached afterwards). The allowlist is now reviewable YAML in git — changing it is a merge request, not a redeploy, and it retroactively applies to all stored text.",
    },
    {
      label: "Who may post raw HTML: role gating",
      intro:
        "Editors are trusted with raw markup; everyone else gets the filtered pipeline. The framework reflex is an isGranted() branch; Drupal turns the trust decision into a permission you tick on the format.",
      php: `// Symfony: trust decisions scattered through code.
public function renderBody(Post $post): string
{
    // Editors bypass the sanitizer; hope no editor
    // account is ever compromised, and hope every
    // template remembers to route through this method.
    if ($this->security->isGranted('ROLE_EDITOR')) {
        return $post->getBody();  // raw HTML
    }

    return $this->sanitizer->sanitize($post->getBody());
}`,
      ts: `# Each format's config form has a "Roles" checkbox set.
# Ticking a role grants the permission "use text format X",
# which exports on the ROLE, not the format:
# drush cex  ->  user.role.editor.yml (excerpt):
id: editor
label: Editor
permissions:
  - 'use text format basic_html'
  - 'use text format full_html'
# user.role.authenticated.yml (excerpt):
id: authenticated
label: 'Authenticated user'
permissions:
  - 'use text format basic_html'
# The permission gates which formats appear in the editing
# form's format selector; Plain text is the fallback every
# user can always use. Rendering uses the STORED format.`,
      note:
        "Full HTML has no tag filter at all, so granting it is granting script injection. In Drupal that grant is one greppable line of role config instead of a code path — auditors love it, and so do interviewers.",
    },
    {
      label: "Editor toolbar: hand-built CKEditor vs drag-and-drop",
      intro:
        "In a framework you maintain a CKEditor 5 JS build config AND a separate server-side allowlist — two lists that drift. In D10/11 the toolbar is per-format config, and the allowed tags follow the buttons automatically.",
      php: `// Hand-integrated CKEditor 5: config array for the JS
// build, passed to the template...
$editorConfig = [
    'toolbar' => ['heading', 'bold', 'italic', 'link',
                  'bulletedList'],
    'heading' => [
        'options' => [
            ['model' => 'heading2', 'view' => 'h2'],
            ['model' => 'heading3', 'view' => 'h3'],
        ],
    ],
];

// ...and a SECOND list in the sanitizer that must match.
// Forget <h3> here and the editor happily inserts markup
// the server silently strips on output:
$config = $config->allowElement('h2', ['id']); // no h3!`,
      ts: `# Configuration > Content authoring > Text formats and
#   editors > Basic HTML > Configure:
#   Text editor: CKEditor 5. Drag buttons from "Available
#   buttons" into the active toolbar. Save.
# The "Allowed HTML tags" box is READ-ONLY: D10/11 syncs
# it from the buttons + plugin settings you enabled.
# drush cex  ->  editor.editor.basic_html.yml (excerpt):
format: basic_html
editor: ckeditor5
settings:
  toolbar:
    items:
      - heading
      - bold
      - italic
      - '|'
      - link
      - bulletedList
      - numberedList
      - '|'
      - sourceEditing
  plugins:
    ckeditor5_heading:
      enabled_headings:
        - heading2
        - heading3
    ckeditor5_sourceEditing:
      allowed_tags:
        - <cite>
image_upload:
  status: true
  scheme: public
  directory: inline-images`,
      note:
        "One drag updates both config entities: the button lands in editor.editor.*, and the tag it produces is added to filter.format.*'s allowed_html. Tags with no button (like <cite> here) go in Source Editing's 'Manually editable HTML tags'.",
    },
    {
      label: "Extending the pipeline: tick a filter before writing one",
      intro:
        "Comments should auto-link pasted URLs. The framework reflex is another Twig extension and another regex; in Drupal it's a core filter you tick — and a plugin class only if nothing shipped fits.",
      php: `// The framework reflex: one more Twig filter, one more
// regex, registered and applied template by template.
class LinkifyExtension extends AbstractExtension
{
    public function getFilters(): array
    {
        return [new TwigFilter('linkify',
            $this->linkify(...), ['is_safe' => ['html']])];
    }

    private function linkify(string $html): string
    {
        return preg_replace(
            '~https?://\\S+~',
            '<a href="$0">$0</a>',
            $html
        );
    }
}`,
      ts: `# Configuration > Content authoring > Text formats and
#   editors > Restricted HTML > Configure:
#   tick "Convert URLs into links", set the trim length.
# drush cex  ->  filter.format.restricted_html.yml (excerpt):
filters:
  filter_autop:
    id: filter_autop
    provider: filter
    status: true
    weight: 0
    settings: {  }
  filter_url:
    id: filter_url
    provider: filter
    status: true
    weight: 0
    settings:
      filter_url_length: 72
# Only when no core/contrib filter fits do you write a
# filter PLUGIN (a class extending FilterBase with a
# process() method) — it then appears as one more
# checkbox on every format's config page.`,
      note:
        "This is the recurring dev bridge: site builders compose pipelines from existing filters as config; developers extend the palette with a plugin, and the plugin immediately becomes clickable, orderable, exportable config like everything else.",
    },
  ],

  playground: {
    intro:
      "A format is an ordered filter pipeline applied at render time to raw stored text. The same body value renders very differently through basic_html and full_html — predict both outputs before running.",
    lang: "php",
    code: `<?php

// Text formats as config: ordered filter pipelines.
// Drupal stores what the author typed and filters on VIEW.
$formats = [
  'basic_html' => [
    ['id' => 'filter_html', 'allowed' => '<a><em><strong><p><br>'],
    ['id' => 'filter_autop'],
  ],
  'full_html' => [
    ['id' => 'filter_autop'],
  ],
];

// One body value in the DB: raw text + the chosen format id.
$raw = "Hi <strong>team</strong> <script>alert('pwned')</script>\\n\\nSee the docs";

function apply_filters(string $text, array $pipeline): string {
  foreach ($pipeline as $filter) {
    switch ($filter['id']) {
      case 'filter_html':
        // Strip every tag not on the allowlist (text content is kept).
        $text = strip_tags($text, $filter['allowed']);
        break;

      case 'filter_autop':
        // Convert blank lines into paragraphs.
        $text = '<p>' . str_replace("\\n\\n", "</p>\\n<p>", $text) . '</p>';
        break;
    }
  }
  return $text;
}

foreach ($formats as $name => $pipeline) {
  echo '-- rendered through ' . $name . " --\\n";
  echo apply_filters($raw, $pipeline) . "\\n\\n";
}`,
    output: `-- rendered through basic_html --
<p>Hi <strong>team</strong> alert('pwned')</p>
<p>See the docs</p>

-- rendered through full_html --
<p>Hi <strong>team</strong> <script>alert('pwned')</script></p>
<p>See the docs</p>`,
  },

  keyPoints: [
    "A text format is an ordered pipeline of filters (limit allowed tags, convert line breaks, convert URLs, align/caption images, embed media) built as checkboxes at Configuration > Content authoring > Text formats and editors.",
    "Formatted text fields store the raw text plus the format id; filters run at render time and the result is cached — so tightening a format retroactively cleans everything ever saved with it.",
    "Formats are gated by role via the permission 'use text format X' (exported in user.role.*): this is the XSS defense — untrusted roles never get Full HTML, and Plain text is the fallback everyone can use.",
    "CKEditor 5 is the one editor in Drupal 10/11 (CKEditor 4 is gone); the toolbar is dragged together per format, and the allowed-tags list syncs automatically with the enabled buttons so editor and filter never drift.",
    "Each rich-text format exports as a pair of config entities: filter.format.<id> (the pipeline) and editor.editor.<id> (toolbar, plugin settings, image upload).",
    "Adding behaviour is a config click first (core/contrib filters); a custom filter plugin (FilterBase + process()) is the developer bridge, and it surfaces as just another checkbox on the format form.",
  ],

  interview: [
    {
      q: "How does Drupal's approach to rich-text safety differ from sanitizing input in a Symfony app?",
      a: "Symfony leaves it to you: wire `symfony/html-sanitizer` or HTMLPurifier, keep the allowlist in code, and call it at every output point — miss one and you have stored XSS. Drupal inverts this: formatted text is stored **raw** alongside a format id, and an ordered filter pipeline runs at **view time**, with the result cached. Because filtering happens on output, changing a format's config retroactively re-filters all existing content with no data loss. And because formats are config entities, the allowlist ships as reviewable YAML through `drush cex`, not as a code deploy.",
    },
    {
      q: "Why is handing Full HTML to authenticated users a security incident waiting to happen?",
      a: "Full HTML runs no tag-limiting filter, so anything a user types — including `<script>`, event-handler attributes, or iframes — is rendered verbatim to every visitor: classic stored XSS. Access to a format is a per-role permission (`use text format full_html`), so the fix is structural: only small, trusted roles ever get it, everyone else gets Basic or Restricted HTML, and Plain text is the universal fallback. In an audit you can grep the exported `user.role.*.yml` files for the grant, which makes the trust boundary explicit in a way scattered `isGranted()` branches never are.",
    },
    {
      q: "What changed about rich-text editing in Drupal 10, and what does the toolbar-to-tags sync buy you?",
      a: "Drupal 10 removed CKEditor 4 entirely; CKEditor 5 is the standard in 10 and 11, configured per text format as the `editor.editor.<format>` config entity. When the tag-limiting filter is enabled, the allowed-tags list becomes read-only and is computed from the toolbar buttons and plugin settings you enable — drag in the heading button and the heading tags join `allowed_html` automatically. That kills the classic two-list drift where the editor inserts markup the server-side filter silently strips. Tags with no corresponding button are declared under the Source Editing plugin's manually editable tags.",
    },
    {
      q: "An editor needs a new transformation on body text. Walk me through config-first versus writing code.",
      a: "First I check the format's filter list: core and contrib already cover most needs (URL linkifying, line-break conversion, media embedding, align/caption), so the fix is often ticking a checkbox and reordering weights — pure config, exported in `filter.format.<id>`. If nothing fits, I write a filter **plugin**: a class extending `FilterBase` implementing `process()`, returning a `FilterProcessResult` so cacheability is preserved. The payoff is that the plugin instantly becomes site-builder material — a checkbox with settings on every format form, ordered and exported like any core filter. That config-first-plugin-last habit is exactly what Drupal teams look for in ex-framework developers.",
    },
  ],

  quiz: [
    {
      question: "When does Drupal apply a text format's filters to a body field?",
      options: [
        "On save, replacing the stored text with sanitized HTML",
        "At render time, over the raw stored text, with the result cached",
        "In the browser, via a CKEditor 5 output plugin",
        "During cron, in a background sanitation queue",
      ],
      answerIndex: 1,
      explain:
        "The field stores the raw text plus the chosen format id; filters run when the field is rendered and the output is cached. Nothing is destroyed on save, which is why tightening a format later retroactively affects all previously saved content.",
    },
    {
      question: "You tick the Editor role on the Full HTML format's config form. Where does that grant appear in your config export?",
      options: [
        "As a roles key inside filter.format.full_html.yml",
        "Inside editor.editor.full_html.yml under settings",
        "As the permission 'use text format full_html' in user.role.editor.yml",
        "It is content, so it never exports",
      ],
      answerIndex: 2,
      explain:
        "Format access is a permission on the role, not a property of the format: the checkbox saves 'use text format full_html' into the Editor role, exported in user.role.editor.yml. The filter.format entity only describes the pipeline itself.",
    },
    {
      question: "In Drupal 10/11, what keeps the CKEditor 5 toolbar and the format's allowed HTML tags from drifting apart?",
      options: [
        "A nightly cron job reconciles the two lists",
        "The allowed-tags list is read-only and computed from the enabled toolbar buttons and plugin settings",
        "CKEditor 5 refuses to load if the lists differ",
        "Nothing — you maintain both lists by hand, as in CKEditor 4",
      ],
      answerIndex: 1,
      explain:
        "With the tag-limiting filter enabled, D10/11 derives allowed_html from the buttons you drag into the toolbar (plus plugin settings like enabled headings). Extra tags with no button are added via the Source Editing plugin's manually editable tags.",
    },
    {
      question: "Which pair of config entities fully describes the 'Basic HTML' rich-text experience?",
      options: [
        "filter.format.basic_html and editor.editor.basic_html",
        "node.type.article and core.entity_view_display.node.article.default",
        "editor.editor.basic_html and user.role.authenticated",
        "filter.format.basic_html and system.theme.global",
      ],
      answerIndex: 0,
      explain:
        "filter.format.basic_html holds the ordered filter pipeline and its settings; editor.editor.basic_html holds the CKEditor 5 toolbar, plugin settings, and image-upload options, and depends on the format. Role grants export separately inside user.role.*.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "search-solr-and-facets",
  title: "Search on GovCMS: Solr, Facets and Attachments",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "Solr is an opt-in service with a platform-pinned connector, the index is a separate lifecycle that no deploy task rebuilds, and making PDFs findable means Solr Cell plus a private-files decision you have to make deliberately.",
  concept: `## Solr is a service you ask for, not one you get

Search API, a Solr backend and a facet block are ordinary Drupal skills. What GovCMS changes is who owns the service, who owns the index configuration, and how long the index is allowed to be wrong.

The distribution bundles the whole stack — \`search_api\` 1.41.0, \`search_api_solr\` 4.3.14, \`facets\` 2.0.10 (carrying a patch for a Drupal 10.3 facets issue) and \`search_api_attachments\` 10.0.10. None of them is in the profile's install list, so a fresh site has no index at all.

Solr itself is **opt-in on every offering**. In the scaffold's \`docker-compose.yml\` the service sits behind \`# Uncomment to enable solr.\`, and \`Dockerfile.solr.saas\`, \`Dockerfile.solr.saasplus\` and \`Dockerfile.solr.paas\` all exist. It is not on by default and it is not PaaS-only. On SaaS, \`docker-compose.yml\` is one of the locked files — pushes that change it are declined — so switching Solr on is a conversation with GovCMS, not a commit.

### Call the server \`lagoon_solr\`

scaffold-tooling's \`all.settings.php\` contains exactly two Solr lines, on every environment:

\`\`\`php
$config['search_api.server.lagoon_solr']['backend_config']['connector_config']['path'] = '/';
$config['search_api.server.lagoon_solr']['backend_config']['connector_config']['core'] = 'drupal';
\`\`\`

Those are keyed to one server id. Export a server called \`acme_solr\` and the platform's path and core never apply to it. Host and port stay in your exported config.

Who may change any of this in the UI is settled too: \`administer search_api\` is one of exactly four entries in \`module_permissions.settings.permission_blacklist\`, so module_permissions unsets it from the delegated permissions form — a site administrator cannot grant it there. It filters that form, though; it does not vet a config import, and the platform's active-permissions validator does not name \`administer search_api\` either. Keep index definitions where they belong: deploy-managed config in \`config/default\`, not a delegated UI task. \`search_api\`, \`search_api_solr\`, \`search_api_attachments\`, \`search_api_db\`, \`search_api_db_defaults\`, \`facets\` and \`facets_range_widget\` are on the 73-name \`managed_modules\` allowlist; \`search_api_autocomplete\` and \`search_api_spellcheck\` are bundled but are not.

### Nothing in a deploy reindexes

This is the operational fact interviewers probe. The eight \`.lagoon.yml\` post-rollout tasks end at \`govcms-backups-preserve\`; there is no index step, and scaffold-tooling ships no reindex binary. Import a config change that adds a field to an index and the deploy finishes green with an index that does not contain that field. Reindexing rides the ordinary cronjob — and where that block sits in the file matters as much as what it says:

\`\`\`yaml
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli
\`\`\`

That is the only \`cronjobs\` key in the scaffold's \`.lagoon.yml\`, and it is nested under the \`master\` environment. Cron therefore runs on production and nowhere else. On a dev or branch environment nothing schedules cron at all, so the index there never self-heals — it stays wrong until someone runs \`ahoy drush search-api:index\` (or \`govcms-drush cron\`) by hand.

On production, \`M\` is Lagoon's chosen minute, so worst case is roughly an hour of cron batches — and cron only picks up items the tracker already marked dirty. A field addition needs the tracker reset first.

### Facets and PDFs

Facets is the filtered-listing pattern every agency site has: a view backed by the index, facet blocks in the sidebar, counts from the same query. All of it is exported configuration, so a facet is a merge request.

Government publishes in PDF, so attachment indexing is usually in scope. \`search_api_attachments\` extracts through a pluggable extractor; the one that works here is \`solr_extractor\`, which posts the file to Solr Cell — \`SOLR_MODULES\` defaults to \`extraction,langid,ltr,analysis-extras\`, so the handler is already loaded. Its \`excluded_private\` setting defaults to TRUE, and govcms_security forces webform uploads to the private stream.

GovCMS 3.x on Drupal 10 is the same shape with older pins: \`3.x-develop\` pins Drupal 10.6.12, \`search_api\` 1.40.0, \`search_api_solr\` 4.3.10, \`search_api_attachments\` 10.0.5, and scaffold-tooling's \`10.x-develop\` carries the identical \`lagoon_solr\` override.`,
  comparisons: [
    {
      label: "Getting a Solr container",
      intro:
        "You need a Solr 9 core called drupal with the Drupal config set. On your own infrastructure you add the service and push; on GovCMS the service already exists, commented out, in a file you may not be allowed to edit.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# docker-compose.yml on a site you control -- add it, commit it, done.
services:
  solr:
    image: solr:9
    ports:
      - "8983:8983"
    volumes:
      - ./solr-conf:/opt/solr/server/solr/configsets/drupal/conf
    command:
      - solr-precreate
      - drupal
      - /opt/solr/server/solr/configsets/drupal
    environment:
      SOLR_MODULES: extraction,langid,analysis-extras`,
      ts: `# docker-compose.yml in the scaffold -- present on saas, saasplus and paas,
# and shipped switched off.
  # Uncomment to enable solr.
  # solr:
  #   build:
  #     context: .
  #     dockerfile: .docker/Dockerfile.solr
  #   labels:
  #     lagoon.type: solr
  #   ports:
  #     - "8983" # Find port on host with \`docker compose port solr 8983\`

# The image is already correct -- .docker/Dockerfile.solr.paas:
#   FROM uselagoon/solr-9:\${LAGOON_IMAGE_VERSION:-latest}
#   COPY .docker/config/solr/ /opt/solr/server/solr/configsets/drupal/conf
#   ENV SOLR_MODULES=\${SOLR_MODULES:-"extraction,langid,ltr,analysis-extras"}
#
# docker-compose.yml is in the SaaS locked-files list, so on SaaS a push that
# uncomments this block is declined. Raise it with GovCMS instead.`,
      note: "Solr is available on all three scaffold types and enabled on none of them; on SaaS the file that enables it is not yours to change.",
    },
    {
      label: "Pointing Drupal at the server",
      intro:
        "Same Search API server entity either way. The difference is that two of its connector values are set from platform settings, and only for one exact server id.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# config/sync/search_api.server.acme_solr.yml -- you own every value here,
# and you can change any of them in the UI on production if you must.
id: acme_solr
label: 'Acme Solr'
backend: search_api_solr
backend_config:
  connector: standard
  connector_config:
    scheme: http
    host: solr
    port: 8983
    path: /
    core: acme
    timeout: 5
    commit_within: 1000
  optimize: false
  retrieve_data: false`,
      ts: `// vendor/govcms/scaffold-tooling/drupal/settings/all.settings.php.
// Included on every environment, local included. These two lines are the
// platform's, and they win over whatever your exported server says.
$config['search_api.server.lagoon_solr']['backend_config']['connector_config']['path'] = '/';
$config['search_api.server.lagoon_solr']['backend_config']['connector_config']['core'] = 'drupal';

// Consequences for config/default/search_api.server.lagoon_solr.yml:
//   id: lagoon_solr        <- must match, or you get no override at all
//   backend: search_api_solr
//   host: solr             <- still yours, still exported
//   port: 8983             <- still yours, still exported
// And 'administer search_api' is one of the four entries in
// $config['module_permissions.settings']['permission_blacklist'], so
// module_permissions unsets it from the delegated permissions form -- a site
// administrator cannot tick it in the UI. That filters a form; it does not
// vet a config import. Server and index edits arrive by config import.`,
      note: "Name the server lagoon_solr; the override is keyed to that id and pins only path and core.",
    },
    {
      label: "Reindexing after a release",
      intro:
        "You add a field to the index and deploy. On a site you control the deploy script reindexes. On GovCMS the rollout has no such step, so you have to know where indexing actually happens.",
      leftLang: "bash",
      rightLang: "yaml",
      php: `#!/bin/bash
# deploy.sh on a site you control -- the index is part of the release.
set -e
drush --yes updatedb
drush --yes config:import
drush --yes cache:rebuild
drush --yes search-api:reset-tracker acme_index
drush --yes search-api:index acme_index --batch-size=50
drush --yes search-api:status acme_index`,
      ts: `# .lagoon.yml -- the tail of the eight post-rollout tasks. No index step,
# and scaffold-tooling's composer bin list contains no reindex binary.
    - run:
        name: Perform config import
        command: /app/vendor/bin/govcms-config-import
        service: cli
    - run:
        name: Perform cache rebuild
        command: /app/vendor/bin/govcms-cache-rebuild
        service: cli
    - run:
        name: Preserve the last successful backup
        command: /app/vendor/bin/govcms-backups-preserve
        service: cli

# Indexing happens here instead, at a minute Lagoon picks. Note the parents:
# this is the only cronjobs key in the file and it is nested under the master
# environment, so cron runs on production only -- a dev or branch environment
# runs no cron at all and its index never catches up on its own.
environments:
  master:
    cronjobs:
      - name: Drupal cron with notifications
        schedule: "M * * * *"
        command: '/app/vendor/bin/govcms-drush cron --root=/app'
        service: cli

# To force it now, drush runs in the cli container, never on the host:
#   ahoy drush search-api:reset-tracker acme_index
#   ahoy drush search-api:index acme_index
# ahoy drush is: docker compose exec -T cli drush "$@"`,
      note: "A green deploy proves the config imported, not that the index reflects it; the tracker also has to be reset before cron can help — and off production there is no cron to help at all.",
    },
    {
      label: "Making PDFs findable",
      intro:
        "Both sides use search_api_attachments. The extractor you can actually run differs, and so does what the processor is willing to hand it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/sync/search_api_attachments.admin_config.yml
# Your image, so you install a JRE and the Tika jar and point at them.
extraction_method: tika_extractor
cache_backend: search_api_attachments.cache_keyvalue
cache_file_scheme: private
preserve_cache: true
tika_extractor_configuration:
  java_path: /usr/bin/java
  tika_path: /opt/tika/tika-app.jar
  tika_config_path: ''
  debug_mode: false

# config/sync/search_api.index.acme.yml (excerpt)
processor_settings:
  file_attachments:
    excluded_private: 0
    max_filesize: '20 MB'
    number_indexed: 0`,
      ts: `# config/default/search_api_attachments.admin_config.yml
# No JRE in the GovCMS image and no way to add one on SaaS. Use Solr Cell,
# which is already loaded: SOLR_MODULES defaults to
# extraction,langid,ltr,analysis-extras.
extraction_method: solr_extractor
cache_backend: search_api_attachments.cache_keyvalue
cache_file_scheme: private
preserve_cache: true
solr_extractor_configuration:
  solr_server: lagoon_solr

# config/default/search_api.index.acme.yml (excerpt)
processor_settings:
  file_attachments:
    excluded_private: 1      # the module default -- private files skipped
    max_filesize: '0'
    excluded_extensions: 'aif art avi bmp gif ico mov oga ogv png psd ra ram rgb flv'

# Decide excluded_private on purpose. govcms_security forces webform uploads
# to the private stream, and GovCMS puts the private path inside the public
# tree on the one Lagoon persistent volume -- which is also why the extractor
# can resolve a real local path from the cli container at all.`,
      note: "solr_extractor needs no extra binary because the extraction handler ships in SOLR_MODULES; the private-files default is the setting that quietly decides what is searchable.",
    },
  ],
  playground: {
    intro:
      "A whole search stack in one file: analyser, inverted index, term-frequency scoring, facet counts. Watch media/3 -- a PDF whose title says nothing about grants but whose extracted body does.",
    lang: "php",
    code: `<?php

// Five documents. media/3 is a PDF: its 'body' is what an extractor put
// there, not anything an editor typed.
$stopwords = ['the', 'a', 'of', 'and', 'for', 'in', 'to', 'on'];
$weights = ['title' => 2.0, 'body' => 1.0];

$docs = [
  'node/12' => [
    'type' => 'page',
    'year' => 2024,
    'title' => 'Annual report 2024',
    'body' => 'The department reports on grants paid to regional councils.',
  ],
  'node/18' => [
    'type' => 'news',
    'year' => 2025,
    'title' => 'Minister opens the 2025 grants round',
    'body' => 'Applications for the grants round close in October.',
  ],
  'media/3' => [
    'type' => 'publication',
    'year' => 2024,
    'title' => 'Accessibility statement',
    'body' => 'PDF EXTRACT: conformance testing and remediation of grants forms.',
  ],
  'node/44' => [
    'type' => 'page',
    'year' => 2023,
    'title' => 'Contact the department',
    'body' => 'Postal and phone details for the department.',
  ],
  'node/51' => [
    'type' => 'publication',
    'year' => 2025,
    'title' => 'Procurement policy',
    'body' => 'Procurement thresholds and reporting for the department.',
  ],
];

function analyse($text, array $stopwords) {
  $text = preg_replace('/[^a-z0-9 ]+/', ' ', strtolower($text));
  $out = [];
  foreach (preg_split('/ +/', trim($text)) as $token) {
    if ($token !== '' && !in_array($token, $stopwords, TRUE)) {
      $out[] = $token;
    }
  }
  return $out;
}

$index = [];
$length = [];
foreach ($docs as $id => $doc) {
  foreach (['title', 'body'] as $field) {
    foreach (analyse($doc[$field], $stopwords) as $term) {
      $index[$term][$id][$field] = ($index[$term][$id][$field] ?? 0) + 1;
      $length[$id] = ($length[$id] ?? 0) + 1;
    }
  }
}
ksort($index);

function search($query, array $index, array $length, array $stopwords, array $weights) {
  $hits = [];
  foreach (analyse($query, $stopwords) as $term) {
    foreach ($index[$term] ?? [] as $id => $fields) {
      foreach ($fields as $field => $tf) {
        $hits[$id]['score'] = ($hits[$id]['score'] ?? 0.0) + $weights[$field] * $tf / $length[$id];
        $hits[$id]['where'][$field] = TRUE;
      }
    }
  }
  ksort($hits);
  uasort($hits, function ($a, $b) {
    return $b['score'] <=> $a['score'];
  });
  return $hits;
}

function facet(array $hits, array $docs, $key) {
  $counts = [];
  foreach (array_keys($hits) as $id) {
    $value = (string) $docs[$id][$key];
    $counts[$value] = ($counts[$value] ?? 0) + 1;
  }
  ksort($counts);
  $parts = [];
  foreach ($counts as $value => $n) {
    $parts[] = $value . ' (' . $n . ')';
  }
  return implode('  ', $parts);
}

printf("mini index: %d documents, %d distinct terms, title weight %.1f\\n", count($docs), count($index), $weights['title']);

foreach (['grants', 'the department procurement'] as $query) {
  $hits = search($query, $index, $length, $stopwords, $weights);
  printf("\\nquery '%s' -- %d hits\\n", $query, count($hits));
  printf("  %5s  %-11s  %-11s  %4s  %s\\n", 'SCORE', 'MATCHED', 'TYPE', 'YEAR', 'TITLE');
  foreach ($hits as $id => $hit) {
    printf("  %5.2f  %-11s  %-11s  %4d  %s\\n", $hit['score'], implode('+', array_keys($hit['where'])), $docs[$id]['type'], $docs[$id]['year'], $docs[$id]['title']);
  }
  printf("  facet type:  %s\\n", facet($hits, $docs, 'type'));
  printf("  facet year:  %s\\n", facet($hits, $docs, 'year'));
}

$pdf = search('grants', $index, $length, $stopwords, $weights)['media/3'];
printf("\\nmedia/3 matched in %s only: no extractor, no row, no facet count.\\n", implode('+', array_keys($pdf['where'])));`,
    output: `mini index: 5 documents, 32 distinct terms, title weight 2.0

query 'grants' -- 3 hits
  SCORE  MATCHED      TYPE         YEAR  TITLE
   0.30  title+body   news         2025  Minister opens the 2025 grants round
   0.11  body         publication  2024  Accessibility statement
   0.11  body         page         2024  Annual report 2024
  facet type:  news (1)  page (1)  publication (1)
  facet year:  2024 (2)  2025 (1)

query 'the department procurement' -- 3 hits
  SCORE  MATCHED      TYPE         YEAR  TITLE
   0.67  body+title   publication  2025  Procurement policy
   0.50  title+body   page         2023  Contact the department
   0.11  body         page         2024  Annual report 2024
  facet type:  page (2)  publication (1)
  facet year:  2023 (1)  2024 (1)  2025 (1)

media/3 matched in body only: no extractor, no row, no facet count.
`,
  },
  keyPoints: [
    "Solr is opt-in on every offering: the `solr` service ships behind `# Uncomment to enable solr.` and Dockerfile.solr.saas, .saasplus and .paas all exist. On SaaS, docker-compose.yml is a locked file, so enabling it is a request rather than a commit.",
    "Name the Search API server `lagoon_solr`. scaffold-tooling's all.settings.php pins only that server's connector `path` to `/` and `core` to `drupal`; host, port and everything else stay in your exported config.",
    "`administer search_api` is one of exactly four entries in `module_permissions.settings.permission_blacklist`, so module_permissions strips it out of the delegated permissions form and a site administrator cannot tick it in the UI. It filters that form, not config import — so it is a guard rail, not a barrier, and index and server definitions travel as config in config/default rather than as UI edits on production.",
    "No deploy task reindexes. The eight post-rollout tasks contain no index step and scaffold-tooling ships no reindex binary; indexing rides the hourly Lagoon cronjob `/app/vendor/bin/govcms-drush cron --root=/app` on schedule `M * * * *`. That block is nested under `environments:` → `master:` in .lagoon.yml and is the only one in the file, so non-production environments run no cron and never reindex until you do it by hand.",
    "Bundled and on the 73-name managed_modules allowlist: search_api, search_api_solr, search_api_attachments, search_api_db, search_api_db_defaults, facets, facets_range_widget. Bundled but not allowlisted: search_api_autocomplete, search_api_spellcheck.",
    "PDF text comes from Solr Cell via the `solr_extractor` plugin — SOLR_MODULES defaults to `extraction,langid,ltr,analysis-extras` — while search_api_attachments' `excluded_private` defaults to TRUE, which silently excludes govcms_security's forced-private webform uploads.",
  ],
  interview: [
    {
      q: "Does a GovCMS site get Solr out of the box?",
      a: "No. The distribution bundles `search_api`, `search_api_solr`, `facets` and `search_api_attachments`, but none of them is in the profile's install list, so a new site has no index. The Solr service itself ships commented out in the scaffold's `docker-compose.yml` with `# Uncomment to enable solr.`, and there are Dockerfiles for saas, saasplus and paas — so it is available on all three types and enabled on none. On PaaS I uncomment it and push; on SaaS `docker-compose.yml` is one of the locked files, so I raise it with GovCMS and plan for that lead time in the estimate rather than discovering it in sprint two.",
    },
    {
      q: "You deployed a change that adds a field to a Search API index, the pipeline was green, and editors say search is missing results. What happened?",
      a: "The deploy did exactly what it promised and nothing more. The eight post-rollout tasks in `.lagoon.yml` end at `govcms-backups-preserve` — there is no index task, and scaffold-tooling ships no reindex binary — so `govcms-config-import` wrote the new index definition and the Solr documents still lack the field. Cron will not fix it on its own either, because cron only processes items the tracker has already marked unindexed. I reset the tracker and index explicitly through the cli container (`ahoy drush search-api:reset-tracker`, then `search-api:index`), and on a big index I do it as a deliberate post-deploy step with the content team warned, because the hourly cronjob is `M * * * *` and I would rather not discover its minute at 4pm.",
    },
    {
      q: "How do you get a faceted publications listing from local into production on SaaS?",
      a: "Everything in it is configuration: the index, the view, the facet source and each facet block. I build it locally, export to `config/default`, and it lands through `govcms-config-import` in the rollout — there is no UI shortcut, because `administer search_api` is one of the four entries in `module_permissions.settings.permission_blacklist`, so module_permissions strips it out of the delegated permissions form and a site administrator cannot tick it there. `facets` and `facets_range_widget` are both on the 73-name managed_modules allowlist, which is what actually decides whether a site may enable them. The one thing I check on review is that the exported server is `id: lagoon_solr`, because the platform's connector override in `all.settings.php` is keyed to that exact id.",
    },
    {
      q: "An agency wants their PDFs findable. Walk me through it.",
      a: "`search_api_attachments` is bundled and allowlisted, so the module side is fine; the question is the extractor. Tika needs a JRE in the image, which is not available and not addable on SaaS, so I use the `solr_extractor` plugin, which posts the file to Solr Cell — already loaded, since `SOLR_MODULES` defaults to `extraction,langid,ltr,analysis-extras` — and point it at the `lagoon_solr` server. Then I make the private-files call explicitly: the processor's `excluded_private` defaults to TRUE, and govcms_security forces webform uploads to the private stream, so leaving it alone means those attachments never index. Last, I set `max_filesize` and think about the extraction cost, because a first index of a decade of publications is a long cron-free operation, not something to trigger during business hours.",
    },
  ],
  quiz: [
    {
      question: "Which statement about Solr provisioning on GovCMS is correct?",
      options: [
        "Solr is provisioned by default on PaaS and available on request for SaaS.",
        "The solr service ships commented out in docker-compose.yml, and Dockerfile.solr exists for saas, saasplus and paas.",
        "Solr is PaaS-only; SaaS sites must use the database backend.",
        "Solr is enabled automatically as soon as search_api_solr is installed.",
      ],
      answerIndex: 1,
      explain:
        "The service block sits behind `# Uncomment to enable solr.` and Dockerfile.solr.saas, .saasplus and .paas all exist — available on all three types, on by default on none. Enabling the module does not create a container, and on SaaS docker-compose.yml is a locked file.",
    },
    {
      question: "What do the two Solr lines in scaffold-tooling's all.settings.php actually set?",
      options: [
        "The Solr host and port for any configured Search API server.",
        "The scheme and timeout for the server named acme_solr.",
        "The connector path (/) and core (drupal) for the server whose id is lagoon_solr.",
        "The index name and the commit interval for all Solr-backed indexes.",
      ],
      answerIndex: 2,
      explain:
        "They are `$config['search_api.server.lagoon_solr'][...]['path'] = '/'` and `[...]['core'] = 'drupal'`. Keyed to one server id, and only those two connector values — host and port remain in your exported config.",
    },
    {
      question: "A config import adds a new field to a Search API index during a GovCMS rollout. What indexes the existing content?",
      options: [
        "Nothing in the rollout does; the tracker must be reset and indexing runs via drush or the hourly cronjob.",
        "The `Perform cache rebuild` post-rollout task, which flushes and repopulates the index.",
        "A dedicated `govcms-search-index` post-rollout task added after the config import.",
        "`govcms-enable_modules`, which reindexes any index owned by a force-enabled module.",
      ],
      answerIndex: 0,
      explain:
        "There is no index task among the eight post-rollout tasks and no reindex binary in scaffold-tooling's bin list. Cron (`govcms-drush cron`, schedule `M * * * *`) only processes items the tracker already marked unindexed, so a field addition needs `search-api:reset-tracker` first — and the cronjobs block is nested under `environments: master:`, so on a non-production environment there is no cron and drush is the only route.",
    },
    {
      question: "Why might PDFs attached through a webform not appear in search even after attachment indexing is configured correctly?",
      options: [
        "Webform uploads are stored outside the Lagoon persistent volume, so the extractor cannot reach them.",
        "The `extraction` Solr module is absent from SOLR_MODULES by default and must be requested.",
        "PDF is on the blocked upload extensions list enforced by govcms_security.",
        "govcms_security forces webform uploads to the private stream, and the processor's `excluded_private` setting defaults to TRUE.",
      ],
      answerIndex: 3,
      explain:
        "search_api_attachments defaults `excluded_private` to TRUE, and govcms_security sets `$properties['uri_scheme'] = 'private'` for webform file elements. Private files live inside the public tree on the same persistent volume, so reachability is not the problem; `extraction` is in the SOLR_MODULES default; and the blocked extensions are doc, xls, ppt and rtf, not pdf.",
    },
  ],
};

export default lesson;

import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 11,
  slug: "bigpipe",
  title: "BigPipe: Streaming the Slow Parts",
  part: "Page & Render Caching Layers",
  estMinutes: 12,
  summary:
    "BigPipe flushes the cacheable page skeleton immediately and streams each placeholder's replacement afterwards as a script chunk, so TTFB is set by the shell instead of by the slowest fragment — provided nothing between PHP and the browser buffers the response.",

  concept: `
## Same placeholders, later delivery

The previous section left the page full of holes: every uncacheable fragment
became a \`#lazy_builder\` and Dynamic Page Cache stored the shell with
\`<span data-big-pipe-placeholder-id="...">\` markers where the personalised
bits go. In the normal **single-flush** pipeline the renderer fills every hole
*before* a single byte reaches the browser, so time-to-first-byte is
shell + slowest fragment. BigPipe changes only *when* the replacements are
sent, never *what* they contain.

### The mechanics

\`HtmlResponseBigPipeSubscriber\` inspects the response attachments. If
\`big_pipe_placeholders\` or \`big_pipe_nojs_placeholders\` are present, it swaps
the \`HtmlResponse\` for a \`BigPipeResponse\`. \`BigPipe::sendContent()\` then:

1. splits the HTML at \`</body>\` and sends the whole skeleton as chunk 0,
   calling PHP's \`flush()\` — the browser can already parse, paint, and start
   fetching CSS and images;
2. emits a start signal, then renders each placeholder in turn and sends
   \`<script type="application/vnd.drupal-ajax" data-big-pipe-replacement-for-placeholder-with-id="...">\`
   containing a JSON AJAX command set; \`big_pipe.js\` applies each one on
   arrival, including any CSS/JS that fragment needs and has not been sent yet;
3. sends a stop signal and the remaining \`</body></html>\`.

Since Drupal 10.2 that per-placeholder rendering runs inside a PHP Fiber, so a
placeholder that suspends (waiting on I/O) lets another one proceed instead of
blocking the queue.

### When it engages

\`BigPipeStrategy\` only activates for requests **with a session** — anonymous
sessionless traffic on your news site is served by Internal Page Cache and
never needs it. A route can opt out entirely with the \`_no_big_pipe\` option.
And BigPipe deliberately handles exactly what Dynamic Page Cache placeholdered:
a DPC hit makes chunk 0 nearly free, which is what makes the streamed shell
feel instant.

### No-JS fallback

A \`<noscript>\` meta refresh points at \`/big_pipe/no-js\`, whose controller sets
the \`big_pipe_nojs\` cookie. On the next request \`BigPipeStrategy\` uses
\`big_pipe_nojs_placeholders\` instead: the skeleton is split at the placeholder
markers and each replacement is streamed **in situ** by multiple flushes. Not
BigPipe in the Facebook sense, but essential for values that live inside HTML
attributes — CSRF tokens in links — which a script chunk cannot patch.

### The one hard requirement: do not buffer

BigPipe sets \`Surrogate-Control: no-store, content="BigPipe/1.0"\` and
\`X-Accel-Buffering: no\`, and marks the response private. nginx ≥ 1.5.6 honours
that header by disabling FastCGI buffering and gzip. Everything else you must
configure: Apache mod_proxy_fcgi needs \`flushpackets=on\`, mod_fcgid needs
\`FcgidOutputBufferSize 0\`, gzip must be off for those responses
(\`SetEnv no-gzip 1\`). Varnish already streams — \`beresp.do_stream\` has
defaulted to \`true\` since Varnish 4.0 — but streaming is silently cancelled
when the response is ESI-processed (\`beresp.do_esi\`) or when site VCL overrides
\`do_stream\`, so the job there is to *check it has not been disabled* rather
than to switch it on; and because the BigPipe response is
\`Cache-Control: private\` with \`Surrogate-Control: no-store\`, VCL must let it
pass rather than cache it. Any buffer anywhere in the chain re-assembles the
chunks and you are back to a single flush — same total time, no perceived win.

### Measuring it

BigPipe never reduces total server work. Judge it on **TTFB and first
contentful paint**, not on \`time_total\`. Reserve space for the streamed
fragments with \`#lazy_builder_preview\` (Drupal 10.1+) or your layout shift
score will pay for the speed you just gained.
`,

  comparisons: [
    {
      label: "Streaming the shell, then the slow fragment",
      intro:
        "The incident ticker takes ~260ms. Both frameworks want the page skeleton on the wire before that query finishes — but only one asks you to write the streaming code.",
      php: `<?php
// Symfony: streaming is explicit. You own the flushing and the headers.
use Symfony\\Component\\HttpFoundation\\StreamedResponse;

$response = new StreamedResponse(function () use ($twig, $repo) {
    echo $twig->render('incidents/shell.html.twig');
    flush();                       // skeleton is on the wire now

    echo $twig->render('incidents/_ticker.html.twig', [
        'items' => $repo->slowTicker(),   // ~260ms
    ]);
    flush();

    echo '</body></html>';
});
// Otherwise nginx/FPM will happily buffer the whole thing anyway.
$response->headers->set('X-Accel-Buffering', 'no');`,
      ts: `<?php
// Drupal: you never touch the response object. You declare a lazy builder,
// and the delivery layer decides between single-flush and BigPipe.
public function incidents(): array {
  return [
    '#theme' => 'incident_page',
    '#ticker' => [
      '#lazy_builder' => ['incident.ticker:build', []],
      '#create_placeholder' => TRUE,
    ],
    '#cache' => [
      'contexts' => ['url.path'],
      'tags' => ['node_list:incident'],
    ],
  ];
}

// Opting a route out (e.g. an endpoint that must not stream):
// my_module.routing.yml
//   my_module.export:
//     options:
//       _no_big_pipe: TRUE`,
      note:
        "Identical render array, two delivery modes: BigPipeStrategy only picks it up when the request has a session, otherwise the same placeholder is filled before the first byte.",
    },
    {
      label: "Reserving space so the stream does not shift the layout",
      intro:
        "Content that arrives late reflows the page. Both stacks let you ship skeleton markup first; the difference is where it is declared.",
      leftLang: "twig",
      rightLang: "php",
      php: `{# Symfony + UX Turbo: the frame markup IS your placeholder. #}
<turbo-frame id="incident-ticker"
             src="{{ path('incident_ticker') }}"
             loading="lazy">
  <div class="ticker ticker--skeleton" style="min-height:220px">
    Loading incidents…
  </div>
</turbo-frame>

{# A second HTTP request fetches the fragment; nothing is streamed. #}`,
      ts: `<?php
// Drupal 10.1+: #lazy_builder_preview renders INSIDE the placeholder <span>,
// so the reserved box is part of the very first flushed chunk.
$build['ticker'] = [
  '#lazy_builder' => ['incident.ticker:build', []],
  '#create_placeholder' => TRUE,
  '#lazy_builder_preview' => [
    '#theme' => 'incident_ticker_skeleton',
  ],
];

// Previews render through the 'big_pipe_interface_preview' theme hook, with
// template suggestions derived from the lazy builder callback, e.g.
//   big-pipe-interface-preview--incident-ticker-build.html.twig`,
      note:
        "Turbo costs an extra round trip per frame; BigPipe reuses the one connection it already has open — but you must reserve the space yourself or trade TTFB for cumulative layout shift.",
    },
    {
      label: "Keeping the stream alive through the stack",
      intro:
        "Streaming is only as good as the least cooperative hop. A single buffer between PHP and the browser silently turns BigPipe back into a single flush.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# nginx in front of a Symfony StreamedResponse: default buffering wins.
location ~ \\.php$ {
  fastcgi_pass  php-fpm:9000;
  fastcgi_buffering off;    # or emit X-Accel-Buffering: no per response
  gzip off;                 # gzip needs a buffer to compress
}

# You also have to remember this on every CDN/proxy layer yourself.`,
      ts: `# Drupal already sends the two headers that ask the stack to stop buffering:
#   Surrogate-Control: no-store, content="BigPipe/1.0"
#   X-Accel-Buffering: no      <- nginx >= 1.5.6 disables fastcgi buffering + gzip

# Varnish streams by default; verify nothing in your VCL turns it off:
sub vcl_backend_response {
  if (beresp.http.Surrogate-Control ~ "BigPipe/1.0") {
    # Default is already true - make sure custom VCL has not cleared it,
    # and never ESI-process a BigPipe response (that disables streaming).
    set beresp.do_stream = true;
    set beresp.do_esi = false;
    set beresp.uncacheable = true;
  }
}

# Apache + PHP-FPM:
#   mod_proxy_fcgi (>= 2.4.31):  flushpackets=on
#   mod_fcgid:                   FcgidOutputBufferSize 0
#   disable compression on those responses: SetEnv no-gzip 1`,
      note:
        "The response is also marked private, so a shared cache must never store it — a CDN that ignores that will serve one editor's toolbar to everyone.",
    },
    {
      label: "Proving it actually helped",
      intro:
        "BigPipe does not reduce total work, so the wrong metric will tell you it did nothing. Compare first byte, not total time.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Symfony: did the first byte leave before the slow query finished?
curl -s -o /dev/null \\
  -w 'ttfb=%{time_starttransfer} total=%{time_total}\\n' \\
  https://example.test/incidents
# ttfb=0.512 total=0.518    <- buffered somewhere: TTFB == total

# Blackfire then tells you WHERE the 512ms went.
blackfire curl https://example.test/incidents`,
      ts: `# 1. Is BigPipe even installed and engaged?
drush pm:list --status=enabled --filter=big_pipe
drush cr

# 2. BigPipe only runs for sessioned requests, so log in first.
curl -sI -b ~/news-cookies.txt https://news.test/incidents \\
  | grep -iE 'surrogate-control|x-accel-buffering'
# surrogate-control: no-store, content="BigPipe/1.0"
# x-accel-buffering: no

# 3. TTFB should collapse to the (Dynamic Page Cache-served) shell,
#    total should still contain the slow fragments.
curl -s -b ~/news-cookies.txt -o /dev/null \\
  -w 'ttfb=%{time_starttransfer} total=%{time_total}\\n' \\
  https://news.test/incidents
# ttfb=0.084 total=0.503`,
      note:
        "No Surrogate-Control header means no BigPipe response was built at all — usually no session, a _no_big_pipe route, or nothing was placeholdered.",
    },
  ],

  playground: {
    intro:
      "A pure-PHP model of one /incidents response for a logged-in editor: an 80ms cacheable shell plus three placeholders. Compare when bytes reach the browser under single-flush, under BigPipe, and under BigPipe behind a buffering proxy.",
    lang: "php",
    code: `<?php
// Model one BigPipe response for /incidents as an authenticated editor.
// The shell is what Dynamic Page Cache already had; the placeholders are the
// fragments DPC could not cache and left as <span data-big-pipe-placeholder-id>.

$shellMs = 80; // cacheable skeleton, served from Dynamic Page Cache
$placeholders = [
  'user_menu'       => 40,
  'incident_ticker' => 260,
  'personal_alerts' => 120,
];

function stream(string $mode, int $shellMs, array $placeholders): array {
  $log = [];
  $clock = $shellMs;
  $ttfb = ($mode === 'bigpipe') ? $shellMs : $shellMs + array_sum($placeholders);

  if ($mode === 'bigpipe') {
    $log[] = sprintf('%4dms  chunk 0  skeleton flushed (</body> withheld)', $clock);
  }
  foreach ($placeholders as $id => $cost) {
    $clock += $cost;
    $log[] = ($mode === 'bigpipe')
      ? sprintf('%4dms  chunk +  <script data-big-pipe-replacement-for-placeholder-with-id="%s">', $clock, $id)
      : sprintf('%4dms  buffered  %s rendered, still nothing on the wire', $clock, $id);
  }
  if ($mode === 'bigpipe') {
    $log[] = sprintf('%4dms  chunk n  stop signal + </body></html>', $clock);
  } else {
    $log[] = sprintf('%4dms  chunk 0  entire page flushed at once', $clock);
  }
  return ['ttfb' => $ttfb, 'complete' => $clock, 'log' => $log];
}

foreach (['single-flush', 'bigpipe'] as $mode) {
  echo strtoupper($mode), "\\n";
  $r = stream($mode, $shellMs, $placeholders);
  foreach ($r['log'] as $line) {
    echo '  ', $line, "\\n";
  }
  echo '  => TTFB ', $r['ttfb'], "ms, complete ", $r['complete'], "ms\\n\\n";
}

// A buffering proxy re-assembles the chunks: complete time is unchanged, but
// the user sees nothing until the last byte, so TTFB collapses back.
$buffered = stream('bigpipe', $shellMs, $placeholders);
echo "BIGPIPE BEHIND A BUFFERING PROXY\\n";
echo '  => TTFB ', $buffered['complete'], "ms, complete ", $buffered['complete'], "ms\\n";
echo "  => the streaming win is gone; keep X-Accel-Buffering: no and unbuffered hops\\n";
`,
    output: `SINGLE-FLUSH
   120ms  buffered  user_menu rendered, still nothing on the wire
   380ms  buffered  incident_ticker rendered, still nothing on the wire
   500ms  buffered  personal_alerts rendered, still nothing on the wire
   500ms  chunk 0  entire page flushed at once
  => TTFB 500ms, complete 500ms

BIGPIPE
    80ms  chunk 0  skeleton flushed (</body> withheld)
   120ms  chunk +  <script data-big-pipe-replacement-for-placeholder-with-id="user_menu">
   380ms  chunk +  <script data-big-pipe-replacement-for-placeholder-with-id="incident_ticker">
   500ms  chunk +  <script data-big-pipe-replacement-for-placeholder-with-id="personal_alerts">
   500ms  chunk n  stop signal + </body></html>
  => TTFB 80ms, complete 500ms

BIGPIPE BEHIND A BUFFERING PROXY
  => TTFB 500ms, complete 500ms
  => the streaming win is gone; keep X-Accel-Buffering: no and unbuffered hops
`,
  },

  keyPoints: [
    "BigPipe sends the page skeleton up to </body> as chunk 0 and flushes, then streams each placeholder replacement as a <script type=\"application/vnd.drupal-ajax\" data-big-pipe-replacement-for-placeholder-with-id=\"...\"> chunk that big_pipe.js applies on arrival.",
    "It only engages for requests with a session, and never for a route carrying the _no_big_pipe option — anonymous sessionless traffic is served by Internal Page Cache instead.",
    "BigPipe delivers exactly what Dynamic Page Cache placeholdered; a DPC hit is what makes the first chunk cheap, so the two layers are complementary, not alternatives.",
    "Without JavaScript, a noscript meta refresh to /big_pipe/no-js sets the big_pipe_nojs cookie and replacements are streamed in situ by multiple flushes — the only way to patch values inside HTML attributes such as CSRF tokens.",
    "The response carries Surrogate-Control: no-store, content=\"BigPipe/1.0\" and X-Accel-Buffering: no and is private; any buffering hop (gzip, FastCGI buffers, a CDN, or a Varnish whose VCL disables do_stream or turns on ESI) silently reverts it to a single flush.",
    "Total server time is unchanged — measure TTFB and first contentful paint, and reserve space with #lazy_builder_preview (Drupal 10.1+) so the win is not paid back in layout shift.",
  ],

  interview: [
    {
      q: "Explain BigPipe to someone who has only ever used Symfony's StreamedResponse.",
      a: "It is the same underlying trick — write part of the body, call `flush()`, keep writing — but Drupal automates the decision about *what* to defer. The render pipeline has already turned every uncacheable fragment into a placeholder with a `#lazy_builder`, so BigPipe just sends the skeleton up to `</body>`, flushes, and then streams one `<script type=\"application/vnd.drupal-ajax\">` chunk per placeholder that the client-side `big_pipe.js` splices into the DOM. In Symfony you would hand-write the generator, decide the chunk boundaries, and remember `X-Accel-Buffering: no` yourself; in Drupal you write a render array and `HtmlResponseBigPipeSubscriber` swaps `HtmlResponse` for `BigPipeResponse` when placeholders exist. The important framing for an interview is that it is a **delivery** optimisation: total server work is identical, only perceived load time improves.",
    },
    {
      q: "We enabled BigPipe on a news site and TTFB did not move. How would you debug it?",
      a: "First check whether a BigPipe response was even produced: request the page with a session cookie and look for `Surrogate-Control: no-store, content=\"BigPipe/1.0\"` and `X-Accel-Buffering: no`. If those headers are missing, either the request had no session (BigPipe deliberately skips sessionless anonymous traffic, which Internal Page Cache handles), the route sets `_no_big_pipe`, or nothing on the page was actually placeholdered — auto-placeholdering only kicks in for the cache contexts configured as poor. If the headers are present but TTFB still equals total time, something is buffering: gzip/mod_deflate on that response, `fastcgi_buffering`, Apache's `FcgidOutputBufferSize`, missing `flushpackets=on`, or VCL that disables `do_stream` / enables ESI on that response — Varnish streams by default, so there the question is what switched it off. Finally, confirm you are measuring the right thing — `time_starttransfer` versus `time_total` in curl, or FCP in the browser, because `time_total` is expected to be unchanged.",
    },
    {
      q: "How do BigPipe and Dynamic Page Cache relate, and where does the render cache fit?",
      a: "They form one chain. The render cache caches individual render subtrees with their cache keys, contexts, tags and max-age. Dynamic Page Cache caches the whole page for authenticated users *with the uncacheable bits left as placeholders*, so a DPC hit reconstitutes the shell in a few milliseconds. BigPipe is what fills those same holes, but after the shell has already been flushed to the browser. So DPC decides how cheap chunk 0 is and BigPipe decides when the user sees it — you want both on, and if you disable DPC, BigPipe still works but the skeleton itself becomes expensive again.",
    },
  ],

  quiz: [
    {
      question:
        "An anonymous visitor with no session requests an article page. What does BigPipe do?",
      options: [
        "Streams the page in chunks as usual, since BigPipe is enabled site-wide",
        "Nothing — BigPipeStrategy only activates for requests associated with a session",
        "Streams only the no-JS placeholders and skips the JS ones",
        "Returns a 302 to /big_pipe/no-js to detect JavaScript support first",
      ],
      answerIndex: 1,
      explain:
        "BigPipeStrategy requires the request to have a session. Sessionless anonymous traffic is the domain of Internal Page Cache (and your reverse proxy), which serves a fully rendered page far faster than any streaming could.",
    },
    {
      question:
        "BigPipe headers are present on the response, but TTFB still equals total load time. Which explanation fits best?",
      options: [
        "Dynamic Page Cache is disabled, so the shell cannot be streamed",
        "The page has too few placeholders for BigPipe to be worthwhile",
        "Something between PHP and the browser is buffering — gzip, FastCGI buffers, or VCL that disables do_stream or ESI-processes the response",
        "The browser refuses to parse partial HTML until </html> arrives",
      ],
      answerIndex: 2,
      explain:
        "Streaming survives only if nothing buffers. BigPipe advertises the requirement with X-Accel-Buffering: no and the BigPipe Surrogate-Control value, but Apache FastCGI buffer sizes, compression and CDNs must each be configured to pass chunks straight through. Varnish already streams — beresp.do_stream has defaulted to true since 4.0 — so there the question is what disabled it: custom VCL clearing do_stream, or beresp.do_esi being set on that response, which cancels streaming outright.",
    },
    {
      question:
        "Why does the no-JS BigPipe strategy exist when the JavaScript one is faster to deliver?",
      options: [
        "Because search-engine crawlers refuse to execute the vnd.drupal-ajax script chunks",
        "Because some dynamic values live inside HTML attributes (such as CSRF tokens in links) and cannot be patched by a script replacement",
        "Because the JS strategy breaks Dynamic Page Cache",
        "Because it lets Drupal skip rendering placeholders entirely",
      ],
      answerIndex: 1,
      explain:
        "With the big_pipe_nojs cookie set, replacements are streamed in situ by splitting the skeleton at the placeholder markers and flushing repeatedly. That is the only way to substitute content that is not a DOM node — attribute values like CSRF tokens — and it is also the graceful degradation path for clients without JavaScript.",
    },
    {
      question:
        "Which Drupal 10.1+ render array property lets you put skeleton markup inside a BigPipe placeholder to prevent layout shift?",
      options: [
        "#placeholder_markup",
        "#lazy_builder_preview",
        "#big_pipe_preview",
        "#pre_render_placeholder",
      ],
      answerIndex: 1,
      explain:
        "#lazy_builder_preview, set alongside #lazy_builder, supplies a render array that becomes the markup inside the placeholder <span>. It renders through the big_pipe_interface_preview theme hook, with template suggestions derived from the lazy builder callback.",
    },
  ],
};

export default lesson;

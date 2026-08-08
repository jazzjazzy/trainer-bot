import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "logging-messenger-errors",
  title: "Logging, Messenger & Error-Handling Patterns",
  part: "Polish & Ship",
  estMinutes: 12,
  summary:
    "Wire incident_tracker's three feedback channels — a PSR-3 logger channel for ops (dblog/syslog, with @/%/: placeholder sanitization), the messenger for end-user flash messages, and Symfony HTTP exceptions plus catch-log-degrade so one failing API never white-screens a page.",

  concept: `
## Three channels, three audiences

When something happens in incident_tracker — an incident saved, the monitoring
API timing out, a junk ID in the URL — you have three ways to say so, and each
one speaks to a different audience:

- **Logger** → operations. Rows land in the \`watchdog\` table (dblog module)
  and/or syslog. Visitors never see them.
- **Messenger** → the person using the site. Drupal's flash-message queue,
  rendered by the theme on the next page.
- **Exceptions** → the HTTP layer. A thrown \`NotFoundHttpException\` becomes
  a themed 404 — literally the same Symfony class you already use.

The classic mistake is crossing the streams: messenger-ing a raw exception
message at an anonymous visitor, or logging a "Saved!" confirmation nobody
will ever read.

### Logger: PSR-3 with Drupal-flavoured placeholders

\`\\Drupal::logger('incident_tracker')\` asks the \`logger.factory\` service
(\`LoggerChannelFactoryInterface\`) for a named **channel**; the production
pattern is registering that channel once in \`incident_tracker.services.yml\`
with \`parent: logger.channel_base\` and injecting it. Every PSR-3 level
method exists (\`emergency()\` … \`debug()\`), but placeholders are **not**
PSR-3 \`{braces}\` — Drupal reuses \`t()\`'s \`FormattableMarkup\` rules,
which carry sanitization semantics because dblog renders messages as HTML:
\`@name\` is HTML-escaped, \`%name\` is escaped **and** wrapped in
\`<em class="placeholder">\`, and \`:url\` additionally strips dangerous
protocols like \`javascript:\` so the value is safe inside an \`href\`. Never
concatenate user input into the message string — the placeholders *are* the
security layer, exactly like parameterized SQL.

"Watchdog" is Drupal 7 legacy naming that survives in the table and the
tooling: browse entries at **Reports › Recent log messages**
(\`/admin/reports/dblog\`), or run
\`drush watchdog:show --type=incident_tracker --severity=Error\` (\`--type\`
matches the channel name) and \`drush watchdog:tail\` to stream them. Many
production sites uninstall dblog and enable **syslog** instead; your code is
unchanged, because every service tagged \`logger\` receives every entry.

### Messenger: Symfony flash bags, Drupal-style

\`\$this->messenger()\` comes from \`MessengerTrait\` — already on
\`ControllerBase\`, \`FormBase\` and (via \`PluginBase\`) \`BlockBase\` — and
gives you \`addStatus()\`, \`addWarning()\` and \`addError()\`. Messages queue
in the session; the theme renders them on the next page. Duplicate
(text, type) pairs are silently dropped unless you pass \`\$repeat = TRUE\`,
and strings are escaped on render, so pass \`\$this->t()\` results.

### Exceptions: loud in controllers, graceful in blocks

Controllers should **throw**: \`NotFoundHttpException\` and
\`AccessDeniedHttpException\` from
\`Symfony\\Component\\HttpKernel\\Exception\` produce Drupal's themed 404/403
(the \`Drupal\\Core\\Http\\Exception\\Cacheable*\` variants let the response be
cached). A block is different — it renders inside *someone else's* page, so an
uncaught exception from a flaky API white-screens every page it sits on.
Pattern: try/catch, log, return fallback markup with a short \`max-age\`. For
the logging half, \`watchdog_exception()\` was deprecated in 10.1 and
**removed in Drupal 11.0**; use
\`Error::logException(\$logger, \$e)\` from \`Drupal\\Core\\Utility\\Error\`,
which logs \`%type: @message in %function (line %line of %file).\`
`,

  comparisons: [
    {
      label: "A named log channel: Monolog channels vs logger.channel_base",
      intro:
        "Both frameworks tag entries with a channel so ops can filter one subsystem. Symfony declares Monolog channels in config; Drupal registers a channel service in your module's services.yml, and every backend tagged 'logger' (dblog, syslog) receives it.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/packages/monolog.yaml
monolog:
    channels: ['incident_tracker']

    handlers:
        main:
            type: stream
            path: '%kernel.logs_dir%/%kernel.environment%.log'
            level: debug

# Autowire the channel by parameter name:
#   public function __construct(
#     private LoggerInterface $incidentTrackerLogger,
#   ) {}`,
      ts: `# incident_tracker.services.yml
services:
  # Abstract core parent; its factory calls
  # logger.factory->get('incident_tracker') for you.
  logger.channel.incident_tracker:
    parent: logger.channel_base
    arguments: ['incident_tracker']

  incident_tracker.sync:
    class: Drupal\\incident_tracker\\IncidentSyncService
    arguments: ['@logger.channel.incident_tracker']

# Shortcuts when injection is impractical (hooks, .install):
#   \\Drupal::logger('incident_tracker')->error('...');
# On ControllerBase/FormBase, LoggerChannelTrait gives you:
#   $this->getLogger('incident_tracker')->warning('...');`,
      note:
        "The injected object is a LoggerChannelInterface — a plain PSR-3 LoggerInterface plus the channel name, so type-hint LoggerInterface and your service stays framework-agnostic. dblog writes rows to the watchdog table; swap in syslog on production and the same calls stream to the OS log with zero code changes.",
    },
    {
      label: "Message placeholders: PSR-3 {braces} vs @ / % / :",
      intro:
        "PSR-3 placeholders are pure interpolation. Drupal's prefixes are sanitization instructions, applied when the message is formatted, because the dblog UI renders that message as HTML.",
      php: `<?php
// Symfony: PSR-3 {brace} placeholders. Monolog's
// PsrLogMessageProcessor interpolates them verbatim —
// no escaping, because logs are plain text files.
namespace App\\Incident;

use Psr\\Log\\LoggerInterface;

final class IncidentNotifier
{
    public function __construct(
        private LoggerInterface $incidentTrackerLogger,
    ) {}

    public function opened(string $title, string $user): void
    {
        $this->incidentTrackerLogger->notice(
            'Incident {title} opened by {user}.',
            ['title' => $title, 'user' => $user],
        );
    }
}`,
      ts: `<?php
// Drupal: the prefix decides how the value is escaped.
namespace Drupal\\incident_tracker;

use Psr\\Log\\LoggerInterface;

class IncidentNotifier {

  public function __construct(
    // '@logger.channel.incident_tracker' from services.yml.
    private readonly LoggerInterface $logger,
  ) {}

  public function opened(string $title, string $user, string $url): void {
    $this->logger->notice(
      'Incident @title opened by %user. Details: :url',
      [
        '@title' => $title,   // HTML-escaped
        '%user'  => $user,    // escaped + <em class="placeholder">
        ':url'   => $url,     // javascript: etc. stripped, href-safe
        'link'   => 'view',   // non-prefixed keys are metadata, not
                              // placeholders: 'link' fills dblog's
                              // Operations column.
      ],
    );
  }

}`,
      note:
        "Never build the message by concatenation: 'Incident ' . $title is an XSS vector in the log UI, '@title' is not. Same FormattableMarkup rules as t(), so the habit transfers everywhere. uid, hostname, request URI and timestamp are captured for you.",
    },
    {
      label: "Telling the user: flash bag vs messenger",
      intro:
        "Same mechanism, different name — queue a message in the session, render it on the next page. Drupal's messenger has typed helpers, deduplicates repeats, and needs no template wiring.",
      php: `<?php
// Symfony: addFlash() writes to the session FlashBag and
// your Twig layout loops app.flashes to render them.
namespace App\\Controller;

use Symfony\\Bundle\\FrameworkBundle\\Controller\\AbstractController;
use Symfony\\Component\\HttpFoundation\\RedirectResponse;

class IncidentController extends AbstractController
{
    public function close(int $id): RedirectResponse
    {
        // ... close the incident ...
        $this->addFlash('success', 'Incident closed.');
        $this->addFlash('warning', 'On-call engineer was not notified.');

        return $this->redirectToRoute('incident_list');
    }
}`,
      ts: `<?php
// Drupal: the messenger service. ControllerBase, FormBase and
// BlockBase (via PluginBase) all expose it through MessengerTrait,
// and the theme renders the queue automatically.
namespace Drupal\\incident_tracker\\Controller;

use Drupal\\Core\\Controller\\ControllerBase;

class IncidentController extends ControllerBase {

  public function close(int $id) {
    // ... close the incident ...
    $this->messenger()->addStatus(
      $this->t('Incident INC-@id closed.', ['@id' => $id]),
    );
    $this->messenger()->addWarning(
      $this->t('On-call engineer was not notified.'),
    );

    return $this->redirect('incident_tracker.list');
  }

}`,
      note:
        "Types are status / warning / error (MessengerInterface::TYPE_* constants). addMessage($text, $type, $repeat) drops an identical text+type pair unless $repeat is TRUE. In a plain service there is no trait — inject '@messenger' (MessengerInterface).",
    },
    {
      label: "HTTP errors, and blocks that refuse to take the page down",
      intro:
        "Controllers throw the SAME Symfony HttpKernel exceptions in both frameworks. The Drupal-specific discipline is in blocks: they render inside every page they are placed on, so external calls get try/catch, a log entry, and fallback markup.",
      php: `<?php
// Symfony: throw for real HTTP errors; guard a flaky
// dependency in a Twig runtime so the page still renders.
use Symfony\\Component\\HttpKernel\\Exception\\NotFoundHttpException;

class IncidentController extends AbstractController
{
    public function view(int $id): Response
    {
        $incident = $this->incidents->find($id)
            ?? throw new NotFoundHttpException('No such incident.');

        return $this->render('incident/view.html.twig', [
            'incident' => $incident,
        ]);
    }
}

class StatsRuntime
{
    public function stats(): array
    {
        try {
            return $this->client->fetch();
        }
        catch (\\Throwable $e) {
            $this->logger->error($e->getMessage());
            return [];   // template shows an empty state
        }
    }
}`,
      ts: `<?php
// Drupal: identical exception classes -> themed 404/403 pages.
use Drupal\\Core\\Utility\\Error;
use Symfony\\Component\\HttpKernel\\Exception\\NotFoundHttpException;

class IncidentController extends ControllerBase {

  public function view(int $id): array {
    $incident = $this->incidentStorage->load($id)
      ?? throw new NotFoundHttpException();

    return ['#theme' => 'incident_detail', '#incident' => $incident];
  }

}

class IncidentStatsBlock extends BlockBase {

  public function build(): array {
    try {
      $stats = $this->statsClient->fetch();
    }
    catch (\\Throwable $e) {
      // watchdog_exception() is deprecated in 10.1, GONE in D11:
      Error::logException($this->logger, $e);
      return [
        '#markup' => $this->t('Statistics are temporarily unavailable.'),
        // Retry in a minute instead of caching the outage all day.
        '#cache' => ['max-age' => 60],
      ];
    }
    return ['#theme' => 'incident_stats', '#stats' => $stats];
  }

}`,
      note:
        "Error::logException($logger, $e) logs '%type: @message in %function (line %line of %file).' — pass an extra $message/$variables pair to customise it. Use Drupal\\Core\\Http\\Exception\\CacheableNotFoundHttpException when the 404 itself is cacheable, and remember route access checks (section 5) should catch most 403s before a controller ever runs.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "All three channels in one plain-PHP request: a formatter applying @/%/: sanitization, a logger channel filling a watchdog array, a deduplicating messenger, and a block that catches a dead API and degrades. Predict every line — especially what happens to the hostile <500s> markup and the javascript: URL — then run.",
    code: `<?php
// One request, three feedback channels: the LOGGER talks to ops
// (dblog/syslog), the MESSENGER talks to the end user (flash messages),
// and EXCEPTIONS talk HTTP. Simulate all three, no Drupal bootstrap.

// -- Drupal's placeholder rules (FormattableMarkup::placeholderFormat):
//    @ escapes, % escapes + emphasises, : strips dangerous protocols.
function placeholder_format(string $message, array $context): string {
    $map = [];
    foreach ($context as $key => $value) {
        $map[$key] = match ($key[0]) {
            '@' => htmlspecialchars((string) $value),
            '%' => '<em class="placeholder">' . htmlspecialchars((string) $value) . '</em>',
            ':' => htmlspecialchars(preg_replace('#^\\s*javascript:#i', '', (string) $value)),
            default => (string) $value,
        };
    }
    return strtr($message, $map);
}

// -- 1. LOGGER: a named channel stamps every row; dblog persists rows in
//    the {watchdog} table -> Reports > Recent log messages.
$watchdog = [];
$logger = function (string $level, string $message, array $context = []) use (&$watchdog): void {
    $watchdog[] = [
        'type'     => 'incident_tracker',   // the CHANNEL name
        'severity' => $level,
        'message'  => placeholder_format($message, $context),
    ];
};

$logger('notice', 'Incident @title opened by %user.', [
    '@title' => 'API gateway <500s>',    // hostile markup: escaped
    '%user'  => 'alice',
]);
$logger('error', 'Monitoring API unreachable at :url.', [
    ':url' => 'javascript:alert(1)',     // dangerous protocol: stripped
]);

echo "-- watchdog (drush watchdog:show --type=incident_tracker) --\\n";
foreach ($watchdog as $row) {
    printf("[%s] %s: %s\\n", $row['severity'], $row['type'], $row['message']);
}

// -- 2. MESSENGER: the flash queue the THEME renders to the visitor.
//    A repeated (text, type) pair is dropped unless $repeat = TRUE.
class Messenger {
    private array $queue = [];
    public function addMessage(string $text, string $type = 'status', bool $repeat = FALSE): void {
        if (!$repeat && in_array($text, $this->queue[$type] ?? [], TRUE)) {
            return;
        }
        $this->queue[$type][] = $text;
    }
    public function addStatus(string $t): void  { $this->addMessage($t, 'status'); }
    public function addWarning(string $t): void { $this->addMessage($t, 'warning'); }
    public function addError(string $t): void   { $this->addMessage($t, 'error'); }
    public function all(): array { return $this->queue; }
}

$messenger = new Messenger();
$messenger->addStatus('Incident INC-42 saved.');
$messenger->addStatus('Incident INC-42 saved.');   // deduped
$messenger->addWarning('Severity was auto-downgraded to medium.');
$messenger->addError('Could not notify the on-call engineer.');

echo "\\n-- messenger queue (theme prints it on the next page) --\\n";
foreach ($messenger->all() as $type => $texts) {
    foreach ($texts as $text) {
        echo "[$type] $text\\n";
    }
}

// -- 3. EXCEPTIONS: throw in controllers (Symfony's own HttpKernel
//    classes -> themed 404/403), but catch + log + degrade inside a
//    block, so one dead API never white-screens the whole page.
class NotFoundHttpException extends RuntimeException {}

$statsClient = function (): array {
    throw new RuntimeException('cURL error 28: connection timed out');
};

echo "\\n-- IncidentStatsBlock::build() --\\n";
try {
    $stats = $statsClient();
}
catch (Throwable $e) {
    // Exactly what Error::logException($logger, $e) formats for you.
    $logger('error', '%type: @message in %function.', [
        '%type'     => get_class($e),
        '@message'  => $e->getMessage(),
        '%function' => 'IncidentStatsBlock::build()',
    ]);
    $stats = NULL;
}
echo $stats === NULL
    ? "render: 'Statistics are temporarily unavailable.'\\n"
    : "render: the stats table\\n";

echo "\\n-- IncidentController::view(999) --\\n";
try {
    throw new NotFoundHttpException('Incident 999 not found');
}
catch (NotFoundHttpException $e) {
    echo "HTTP 404 - themed page for the visitor, detail stays server-side\\n";
}

$last = end($watchdog);
echo "\\nwatchdog rows this request: " . count($watchdog) . "\\n";
echo "last: [{$last['severity']}] {$last['message']}\\n";
`,
    output: `-- watchdog (drush watchdog:show --type=incident_tracker) --
[notice] incident_tracker: Incident API gateway &lt;500s&gt; opened by <em class="placeholder">alice</em>.
[error] incident_tracker: Monitoring API unreachable at alert(1).

-- messenger queue (theme prints it on the next page) --
[status] Incident INC-42 saved.
[warning] Severity was auto-downgraded to medium.
[error] Could not notify the on-call engineer.

-- IncidentStatsBlock::build() --
render: 'Statistics are temporarily unavailable.'

-- IncidentController::view(999) --
HTTP 404 - themed page for the visitor, detail stays server-side

watchdog rows this request: 3
last: [error] <em class="placeholder">RuntimeException</em>: cURL error 28: connection timed out in <em class="placeholder">IncidentStatsBlock::build()</em>.
`,
  },

  keyPoints: [
    "Three channels, three audiences: logger for ops (dblog/syslog), messenger for the current user (flash messages), exceptions for the HTTP layer (themed 403/404) — choose by who needs to know, and never cross them.",
    "Register a channel once in incident_tracker.services.yml (logger.channel.incident_tracker with parent: logger.channel_base, arguments: ['incident_tracker']) and inject it as a PSR-3 LoggerInterface; \\Drupal::logger('incident_tracker') is the shortcut for hooks and .install files.",
    "Placeholders sanitize on format, not PSR-3 {braces}: @name HTML-escapes, %name escapes and wraps in <em class=\"placeholder\">, :url strips dangerous protocols for href use — never concatenate user input into a log message.",
    "Messenger is Drupal's flash bag: $this->messenger()->addStatus()/addWarning()/addError() via MessengerTrait (ControllerBase, FormBase, BlockBase through PluginBase); identical text+type pairs are deduped unless $repeat = TRUE, and text is escaped on render.",
    "Controllers throw the exact Symfony classes — NotFoundHttpException / AccessDeniedHttpException from HttpKernel — and Drupal renders themed error pages; blocks instead try/catch, log, and return fallback markup with a short #cache max-age so one dead API never white-screens the site.",
    "'Watchdog' is D7 naming that lives on in the watchdog table, /admin/reports/dblog (Reports > Recent log messages) and drush watchdog:show/watchdog:tail; watchdog_exception() was deprecated in 10.1 and removed in 11.0 — use Error::logException($logger, $e).",
  ],

  interview: [
    {
      q: "When do you use the logger versus the messenger in a Drupal module?",
      a: "By audience. The logger — `\\Drupal::logger('incident_tracker')` or an injected `logger.channel.*` service — is the ops channel: entries go to every backend tagged `logger`, so the `watchdog` table via dblog and/or syslog on production, and site visitors never see them. Use it for API failures, cron results, security events, anything you'd want during an incident post-mortem. The messenger — `$this->messenger()->addStatus()/addWarning()/addError()` — is Drupal's flash bag: session-queued messages the theme shows to the *current user* on the next page, like 'Incident saved'. The smell test is simple: an exception message shown through the messenger leaks internals to the wrong audience, and a success confirmation sent to the logger informs nobody. Plenty of events deserve both — messenger for the human summary, logger for the diagnostic detail.",
    },
    {
      q: "Drupal log messages use @name, %name and :name instead of PSR-3 {braces}. What do the prefixes mean, and why does it matter?",
      a: "They are sanitization instructions applied when the message is formatted, because dblog renders log messages as HTML in the admin UI. `@name` HTML-escapes the value — the default choice; `%name` escapes it and wraps it in `<em class=\"placeholder\">` for emphasis; `:name` additionally strips dangerous protocols like `javascript:` so the value is safe inside an `href` attribute. The point that wins the question is *why*: concatenating user input into the message (`'Failed for ' . $title`) is a stored-XSS vector in the log UI, whereas the placeholder keeps the raw value in the context array and escapes at output — the same discipline as parameterized SQL. It's the `FormattableMarkup` mechanism shared with `t()`, so the rules transfer to every string in Drupal. Non-prefixed context keys like `link` are treated as metadata, not placeholders.",
    },
    {
      q: "A custom block calls an external API. How do you stop an outage from taking down the site, and how do you log the exception on Drupal 11?",
      a: "A block renders inside every page it's placed on, so an uncaught exception in `build()` white-screens the whole site — the rule of thumb is *throw in controllers, catch in blocks*. Wrap the external call in try/catch, log it, and return degraded output such as `['#markup' => $this->t('Statistics are temporarily unavailable.')]` so the rest of the page renders. Give that fallback a short `#cache['max-age']` so the block retries soon instead of caching the outage for hours, and consider a circuit-breaker in State (section 22) if the API is chronically flaky. For the logging half, `watchdog_exception()` was deprecated in Drupal 10.1 and removed in 11.0, so calls to it fatal on D11 — the replacement is `\\Drupal\\Core\\Utility\\Error::logException($this->logger, $e)`, which logs `%type: @message in %function (line %line of %file).` against a real injected channel.",
    },
    {
      q: "How does Drupal's logging relate to PSR-3, and where do entries actually end up?",
      a: "Logger channels implement `Psr\\Log\\LoggerInterface`, so all eight level methods from `emergency()` to `debug()` behave as they do in Monolog and you can type-hint `LoggerInterface` in your services. `logger.factory` hands out named channels, and every service tagged `logger` receives every entry: core ships dblog (rows in the `watchdog` table, browsable at Reports › Recent log messages, `/admin/reports/dblog`) and syslog (streams to the OS log). A common production setup uninstalls dblog to avoid the database writes and unbounded table growth, and runs syslog only — application code doesn't change, which is the whole point of the tagged-service design. Levels map to `RfcLogLevel` integers in the table, and `drush watchdog:show --type=incident_tracker --severity=Error` filters by channel and level from the CLI.",
    },
  ],

  quiz: [
    {
      question:
        "A log message must include a user-supplied URL that dblog will render inside an href attribute. Which placeholder prefix is designed for that?",
      options: [
        "@url — HTML escaping covers it",
        "%url — the emphasis wrapper also sanitizes URLs",
        ":url — escapes AND strips dangerous protocols like javascript:",
        "{url} — Drupal follows PSR-3 brace interpolation",
      ],
      answerIndex: 2,
      explain:
        "The ':' prefix exists precisely for URL/attribute contexts: on top of escaping it filters dangerous protocols (javascript:, data:, vbscript:), making the value safe in an href. '@' escapes HTML but leaves a javascript: link's protocol intact; '%' just adds the <em class=\"placeholder\"> wrapper on top of '@' behaviour; and Drupal does not interpolate PSR-3 {braces} at all — messages use the @/%/: convention from FormattableMarkup.",
    },
    {
      question:
        "IncidentStatsBlock::build() calls a third-party stats API that starts throwing connection exceptions. What is the production-correct behaviour?",
      options: [
        "Let the exception bubble up so ops notices quickly",
        "Catch it and messenger()->addError() the exception message so users can report it",
        "Catch it, Error::logException() to the incident_tracker channel, and return fallback markup with a short cache max-age",
        "Catch it and return an empty array silently — logging every failure is noisy",
      ],
      answerIndex: 2,
      explain:
        "An uncaught exception in a block's build() doesn't just break the block — it can take down every page the block is placed on. Bubbling white-screens the site; flashing raw exception text at visitors leaks internals to the wrong audience and spams every user; swallowing it silently blinds ops. The pattern is catch + log (Error::logException, since watchdog_exception() is gone in D11) + graceful fallback markup, with a short max-age so the outage isn't cached for hours.",
    },
    {
      question:
        "In 'drush watchdog:show --type=incident_tracker --severity=Error', what does --type match against?",
      options: [
        "The module's package name from incident_tracker.info.yml",
        "The logger channel name — the string passed to logger.factory->get()",
        "The PHP class that emitted the log call",
        "The entity type the message relates to",
      ],
      answerIndex: 1,
      explain:
        "The 'type' column in the watchdog table stores the channel name — the argument to \\Drupal::logger('incident_tracker') or to your logger.channel.incident_tracker service definition. That is exactly why a per-module channel is worth the three lines of services.yml: it makes your module's entries filterable from drush and in the Reports > Recent log messages UI. It has nothing to do with info.yml metadata, class names, or entity types.",
    },
    {
      question:
        "Your Drupal 10.0 module calls watchdog_exception('incident_tracker', $e) in several catch blocks. What happens on Drupal 11?",
      options: [
        "Nothing — it is a stable procedural API",
        "It still logs, but without the file/line context",
        "Fatal error: it was deprecated in 10.1 and removed in 11.0 — replace it with Error::logException($logger, $e)",
        "It silently becomes a no-op",
      ],
      answerIndex: 2,
      explain:
        "watchdog_exception() carried D7-era naming into modern Drupal, was deprecated in drupal:10.1.0 and removed from drupal:11.0.0, so calls to it fatal on D11. The replacement, \\Drupal\\Core\\Utility\\Error::logException($logger, $e), takes a real logger channel (nudging you toward injection instead of a global function) and logs the standard '%type: @message in %function (line %line of %file).' message. Sweeping for deprecated calls like this — with drush or the Upgrade Status module — is exactly the polish-phase work this part of the course is about.",
    },
  ],
};

export default lesson;

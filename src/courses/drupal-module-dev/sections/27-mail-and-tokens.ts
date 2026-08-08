import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "mail-and-tokens",
  title: "Sending Mail & Providing Tokens",
  part: "Polish & Ship",
  estMinutes: 13,
  summary:
    "Notify on-call when an incident opens: define message templates with hook_mail keyed by $key, send through the plugin.manager.mail service, and expose [incident:*] tokens via hook_token_info/hook_tokens so site builders can compose the wording themselves.",

  concept: `
## Mail: your module builds the message, the site decides how it flies

In Symfony you compose a \`TemplatedEmail\`, render Twig, and hand it to
\`MailerInterface::send()\`; the transport comes from \`MAILER_DSN\`. Drupal
splits that in two. Your module **builds** messages in \`hook_mail()\`; a
**mail plugin** chosen by site configuration **delivers** them.

Calling code only asks the mail manager:

\`\`\`php
$this->mailManager->mail('incident_tracker', 'new_incident', $to, $langcode, $params);
\`\`\`

Inside, \`MailManager::doMail()\` assembles a \`$message\` array skeleton
(\`subject\`, a \`body\` **array** of parts, \`headers\`, \`to\`, \`from\`,
\`langcode\`, \`send\`), invokes \`hook_mail()\` on the **owning module only**
with your \`$key\` and \`$params\`, fires \`hook_mail_alter()\` on **every**
module, then reads \`system.mail\`'s \`interface\` map — most specific first:
\`incident_tracker_new_incident\`, then \`incident_tracker\`, then
\`default\` — and calls that plugin's \`format()\` and \`mail()\`.

So \`$key\` is the template name and \`hook_mail()\` is a \`switch\` over keys
that fills subject and body. It never sends. Any module can set
\`$message['send'] = FALSE\` in \`hook_mail_alter()\` to cancel delivery
(\`result\` comes back NULL rather than FALSE).

**Version reality check:** core's default plugin in both Drupal 10 and 11 is
still \`php_mail\` — PHP's \`mail()\`, plain text, no retries. Real projects
add contrib immediately: \`drupal/symfony_mailer\` (Symfony Mailer transports
plus Twig-templated HTML email), or \`drupal/smtp\` and \`drupal/mailsystem\`
if you only need a transport swap. On Drupal 11.1+ the hook can be a
\`#[Hook('mail')]\` method on your hook class instead of a \`.module\`
function.

## Tokens: because non-developers write the strings

Twig is a developer tool — you would never paste a site builder's textarea
into \`Twig\\Environment::createTemplate()\`. Tokens are Drupal's answer: a
tiny, sandboxed \`[type:name]\` substitution language that is safe to expose in
the UI. It powers Pathauto URL patterns, mail bodies, field default values,
Views rewrites and Rules — all edited by people who never see your code.

Providing tokens is two hooks:

- \`hook_token_info()\` **declares** them — a \`types\` array (ours:
  \`incident\`, with \`needs-data => 'incident'\`) and a \`tokens\` array of
  human-readable names. This is pure metadata: it is what the "Browse
  available tokens" UI lists, and it does no replacing at all.
- \`hook_tokens($type, $tokens, $data, $options, $bubbleable_metadata)\`
  **resolves** them. Core scans the text once, groups matches by type, then
  asks every module. Key your return by the **full original token string**:
  \`$replacements[$original] = $value\`. Register cacheability as you go with
  \`$bubbleable_metadata->addCacheableDependency($entity)\`.

Then anywhere: \`\\Drupal::token()->replace($text, ['incident' => $incident])\`
— the \`$data\` keys must match the \`needs-data\` you declared. Useful
\`$options\`: \`clear\` (delete unresolved tokens instead of leaving them
visible), \`langcode\`, \`callback\`. One escaping trap: \`replace()\` escapes
values for HTML, so for a plain-text mail body use \`replacePlain()\`.
`,

  comparisons: [
    {
      label: "Composing the message",
      intro:
        "Notify on-call that incident #42 opened. Symfony renders a Twig template into a TemplatedEmail; Drupal fills an array in hook_mail(), selected by the $key you passed to the mail manager.",
      php: `<?php
// Symfony: the message IS an object, rendered from Twig.
// src/Notifier/IncidentMail.php
use Symfony\\Bridge\\Twig\\Mime\\TemplatedEmail;
use Symfony\\Component\\Mime\\Address;

final class IncidentMail
{
    public function build(Incident $incident, string $to): TemplatedEmail
    {
        return (new TemplatedEmail())
            ->from(new Address('ops@example.com', 'Acme Ops'))
            ->to($to)
            ->subject(sprintf(
                '[%s] #%d: %s',
                strtoupper($incident->severity),
                $incident->id,
                $incident->title,
            ))
            ->htmlTemplate('mail/new_incident.html.twig')
            ->context(['incident' => $incident]);
    }
}

/* templates/mail/new_incident.html.twig
   <p>A new incident was logged on {{ site_name }}.</p>
   <p><a href="{{ url('incident_show', {id: incident.id}) }}">
     {{ incident.title }}</a></p>                              */`,
      ts: `<?php
// incident_tracker.module — hook_mail() BUILDS, it never sends.
// $key selects the template; $params is your context array.

use Drupal\\Core\\Url;

/**
 * Implements hook_mail().
 */
function incident_tracker_mail(string $key, array &$message, array $params): void {
  $token = \\Drupal::token();

  switch ($key) {
    case 'new_incident':
      $data = ['incident' => $params['incident']];
      // replacePlain() — no HTML escaping for a text/plain body.
      $message['subject'] = $token->replacePlain(
        '[[incident:severity]] #[incident:id]: [incident:title]', $data);
      $message['body'][] = $token->replacePlain(
        $params['intro_text'], $data);          // site-builder wording
      $message['body'][] = Url::fromRoute('incident_tracker.view',
        ['id' => $params['incident']['id']], ['absolute' => TRUE])->toString();
      break;

    case 'incident_resolved':
      $message['subject'] = t('Resolved: @title',
        ['@title' => $params['incident']['title']]);
      $message['body'][] = t('Closed after @mins minutes.',
        ['@mins' => $params['minutes']]);
      break;
  }
}

// Drupal 11.1+ alternative — src/Hook/IncidentTrackerHooks.php:
//   #[Hook('mail')]
//   public function mail(string $key, array &$message, array $params): void {…}`,
      note:
        "$message['body'] is an ARRAY of parts that the mail plugin joins and wraps — append to it, never assign a string. hook_mail runs only on the module named in the mail() call; hook_mail_alter() then runs on every module and can rewrite anything or set $message['send'] = FALSE to cancel.",
    },
    {
      label: "Sending it from a service",
      intro:
        "The send call itself. Symfony injects MailerInterface; Drupal injects the mail plugin manager — same constructor-injection habits, different service id.",
      php: `<?php
// Symfony: MailerInterface is autowired; the transport is
// whatever MAILER_DSN says. send() throws TransportException.
use Symfony\\Component\\Mailer\\MailerInterface;
use Symfony\\Component\\Mailer\\Exception\\TransportExceptionInterface;
use Psr\\Log\\LoggerInterface;

final class IncidentNotifier
{
    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly IncidentMail $factory,
        private readonly LoggerInterface $logger,
    ) {}

    public function notify(Incident $incident, string $to): bool
    {
        try {
            $this->mailer->send($this->factory->build($incident, $to));
            return true;
        }
        catch (TransportExceptionInterface $e) {
            $this->logger->error('Mail failed: {msg}', ['msg' => $e->getMessage()]);
            return false;
        }
    }
}`,
      ts: `<?php // src/IncidentMailer.php
namespace Drupal\\incident_tracker;

use Drupal\\Core\\Config\\ConfigFactoryInterface;
use Drupal\\Core\\Mail\\MailManagerInterface;
use Drupal\\Core\\Language\\LanguageManagerInterface;

final class IncidentMailer {

  public function __construct(
    private readonly MailManagerInterface $mailManager,
    private readonly ConfigFactoryInterface $configFactory,
    private readonly LanguageManagerInterface $languageManager,
  ) {}

  public function notify(array $incident): bool {
    $config = $this->configFactory->get('incident_tracker.settings');
    $to = $config->get('notify_email');
    // Send in the RECIPIENT's language so t() and tokens translate.
    $langcode = $this->languageManager->getDefaultLanguage()->getId();

    // mail($module, $key, $to, $langcode, $params, $reply = NULL, $send = TRUE)
    $result = $this->mailManager->mail(
      'incident_tracker',            // whose hook_mail() to invoke
      'new_incident',                // the $key -> the template
      $to,
      $langcode,
      [
        'incident'   => $incident,
        'intro_text' => $config->get('notify_body'),
      ],
    );

    // No exception on failure: check the boolean. MailManager already
    // logged the error to the 'mail' channel for you.
    return (bool) $result['result'];
  }

}

# incident_tracker.services.yml
#   incident_tracker.mailer:
#     class: Drupal\\incident_tracker\\IncidentMailer
#     arguments:
#       - '@plugin.manager.mail'
#       - '@config.factory'
#       - '@language_manager'`,
      note:
        "MailManagerInterface::mail() takes exactly seven arguments and returns the finished $message array with a 'result' key — TRUE/FALSE, or NULL when hook_mail_alter() cancelled the send. It does not throw, so never assume success. Sending is synchronous and slow: from hook_cron or a form submit, queue the send (section 23) rather than blocking the request.",
    },
    {
      label: "Tokens: the piece Symfony has no analogue for",
      intro:
        "Let a site builder type the notification wording into a settings form and still get real incident data substituted. In Symfony a developer writes the Twig template; in Drupal you publish a token vocabulary and the wording becomes config.",
      php: `<?php
// Symfony has no token layer — Twig fills the role, but only
// for DEVELOPER-authored templates. Rendering a string that
// came from a form field means an on-the-fly template:
$twig = new \\Twig\\Environment(new \\Twig\\Loader\\ArrayLoader());
$template = $twig->createTemplate($userSuppliedString);
echo $template->render(['incident' => $incident]);

// …which is why you would immediately reach for the sandbox
// extension, and why nobody does this in practice:
//   composer require twig/twig  # SandboxExtension
//   new SandboxExtension($policy, sandboxedByDefault: true);
//
// Twig is Turing-complete: {{ incident.repository.entityManager }}
// walks your whole object graph. Editors get a WYSIWYG or a
// developer-defined placeholder list instead — never raw Twig.`,
      ts: `<?php
// incident_tracker.module — DECLARE, then RESOLVE.

use Drupal\\Core\\Render\\BubbleableMetadata;
use Drupal\\Core\\Url;

/**
 * Implements hook_token_info().
 */
function incident_tracker_token_info(): array {
  return [
    'types' => [
      'incident' => [
        'name' => t('Incident'),
        'description' => t('Tokens for a logged incident.'),
        'needs-data' => 'incident',   // the $data key replace() must supply
      ],
    ],
    'tokens' => [
      'incident' => [
        'id'       => ['name' => t('ID')],
        'title'    => ['name' => t('Title')],
        'severity' => ['name' => t('Severity')],
        'url'      => ['name' => t('URL'), 'description' => t('Absolute link.')],
        'created'  => ['name' => t('Logged on'), 'type' => 'date'],
      ],
    ],
  ];
}

/**
 * Implements hook_tokens().
 */
function incident_tracker_tokens($type, $tokens, array $data, array $options,
                                 BubbleableMetadata $bubbleable_metadata): array {
  $replacements = [];
  if ($type !== 'incident' || empty($data['incident'])) {
    return $replacements;
  }
  $incident = $data['incident'];

  foreach ($tokens as $name => $original) {
    // $original is the FULL '[incident:title]' string — key by it.
    switch ($name) {
      case 'id':
        $replacements[$original] = $incident['id'];
        break;

      case 'title':
        $replacements[$original] = $incident['title'];
        break;

      case 'severity':
        $replacements[$original] = strtoupper($incident['severity']);
        break;

      case 'url':
        $replacements[$original] = Url::fromRoute('incident_tracker.view',
          ['id' => $incident['id']], ['absolute' => TRUE])->toString();
        break;

      case 'created':
        $replacements[$original] = \\Drupal::service('date.formatter')
          ->format($incident['created'], 'medium', '', NULL,
            $options['langcode'] ?? NULL);
        break;
    }
  }

  // Chained tokens: [incident:created:custom:Y-m-d] delegates to the
  // core 'date' token type instead of being handled here.
  if ($created = \\Drupal::token()->findWithPrefix($tokens, 'created')) {
    $replacements += \\Drupal::token()->generate('date', $created,
      ['date' => $incident['created']], $options, $bubbleable_metadata);
  }

  return $replacements;
}`,
      note:
        "hook_token_info() is metadata only — omit it and your tokens still resolve but nobody can discover them in the UI. Add the contrib Token module for the '#theme' => 'token_tree_link' browser next to your settings textarea, plus hundreds of extra core-entity tokens.",
      rightLang: "php",
    },
    {
      label: "Choosing the transport",
      intro:
        "Same goal — stop using PHP's mail() — reached from opposite directions: Symfony sets one DSN, Drupal maps module/key pairs onto mail plugins in config.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Symfony: one env var picks the transport; the framework
# ships adapters for SMTP, Sendmail, SES, Mailgun, Postmark…
#
# .env
#   MAILER_DSN=smtp://user:pass@smtp.example.com:587
#   # dev: MAILER_DSN=null://null

# config/packages/mailer.yaml
framework:
  mailer:
    dsn: '%env(MAILER_DSN)%'
    envelope:
      sender: 'ops@example.com'
    headers:
      from: 'Acme Ops <ops@example.com>'

# config/packages/messenger.yaml — async delivery is one line:
framework:
  messenger:
    routing:
      Symfony\\Component\\Mailer\\Messenger\\SendEmailMessage: async`,
      ts: `# Drupal: system.mail maps module (or module_key) -> mail
# plugin id. Core ships php_mail (PHP mail(), plain text) and
# test_mail_collector; everything better comes from contrib.
#
#   composer require drupal/symfony_mailer
#   drush en symfony_mailer

# config/sync/system.mail.yml
interface:
  default: php_mail                         # site-wide fallback
  incident_tracker: symfony_mailer          # all our mail
  incident_tracker_new_incident: smtp       # just this one $key
_core:
  default_config_hash: 7Q1Ky8sVJdBSnMPBHrpNIVLzUwMNbxsGZ2sScJcAV_I

# Lookup order in MailManager::getInstance():
#   1. interface['incident_tracker_new_incident']  (module_key)
#   2. interface['incident_tracker']               (module)
#   3. interface['default']
#
# Contrib mailsystem gives site builders a UI over this same map.
# In tests, KernelTestBase swaps in test_mail_collector and you
# assert on $this->getMails() — no transport needed.`,
      note:
        "Never hard-code a transport in your module: read config or, better, leave it alone entirely. Your module's job ends at hook_mail(); which plugin sends it is a site decision, exactly like MAILER_DSN being an env var rather than a constructor argument.",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "The whole pipeline in plain PHP: hook_token_info() as a declaration, hook_tokens() dispatched by type over every module, then MailManager building a $message through hook_mail() and hook_mail_alter(). Watch what happens to a token nobody claims.",
    code: `<?php
// Model Drupal's mail pipeline with no Drupal bootstrap:
// MailManager::mail() -> hook_mail() -> token replacement
// -> hook_mail_alter() -> the mail plugin's format()/mail().

// A row from {incident_log} — the thing our tokens describe.
$incident = [
    'id'       => 42,
    'title'    => 'Checkout 500s',
    'severity' => 'critical',
];

// --- hook_token_info(): DECLARE tokens so the UI can list them. -------------
function incident_tracker_token_info(): array {
    return [
        'types'  => ['incident' => ['name' => 'Incident', 'needs-data' => 'incident']],
        'tokens' => ['incident' => [
            'id'       => ['name' => 'ID'],
            'title'    => ['name' => 'Title'],
            'severity' => ['name' => 'Severity'],
            'url'      => ['name' => 'URL'],
        ]],
    ];
}

// --- hook_tokens(): RESOLVE only the tokens present in this text. -----------
function incident_tracker_tokens(string $type, array $tokens, array $data): array {
    $out = [];
    if ($type !== 'incident' || empty($data['incident'])) {
        return $out;
    }
    $incident = $data['incident'];
    foreach ($tokens as $name => $original) {
        $value = match ($name) {
            'id'       => (string) $incident['id'],
            'title'    => $incident['title'],
            'severity' => strtoupper($incident['severity']),
            'url'      => 'https://ops.example.com/incident/' . $incident['id'],
            default    => NULL,        // Not ours -> leave it for someone else.
        };
        if ($value !== NULL) {
            $out[$original] = $value;
        }
    }
    return $out;
}

// Core's [site:*] tokens, to prove several modules answer one scan.
function system_tokens(string $type, array $tokens, array $data): array {
    $out = [];
    foreach ($tokens as $name => $original) {
        if ($type === 'site' && $name === 'name') {
            $out[$original] = 'Acme Ops';
        }
    }
    return $out;
}

// --- Token::replace(): scan -> ask every module -> strtr. ------------------
function token_replace(string $text, array $data, array $options = []): string {
    // Token::scan() groups every [type:name] match by type.
    preg_match_all('/\\[([^\\s\\[\\]:]+):([^\\[\\]]+)\\]/', $text, $matches, PREG_SET_ORDER);
    $found = [];
    foreach ($matches as $match) {
        $found[$match[1]][$match[2]] = $match[0];
    }
    $replacements = [];
    foreach ($found as $type => $tokens) {
        foreach (['incident_tracker', 'system'] as $module) {
            $hook = $module . '_tokens';
            if (function_exists($hook)) {
                $replacements += $hook($type, $tokens, $data);
            }
        }
        // Nobody claimed it: blank it with 'clear', else leave it visible.
        foreach ($tokens as $original) {
            if (!isset($replacements[$original])) {
                $replacements[$original] = empty($options['clear']) ? $original : '';
            }
        }
    }
    return strtr($text, $replacements);
}

// --- hook_mail(): $key picks the template; it BUILDS, it never sends. ------
function incident_tracker_mail(string $key, array &$message, array $params): void {
    $data = ['incident' => $params['incident']];
    switch ($key) {
        case 'new_incident':
            $message['subject'] = token_replace(
                '[[incident:severity]] #[incident:id]: [incident:title]', $data);
            $message['body'][] = token_replace(
                'A new incident was logged on [site:name].', $data);
            $message['body'][] = token_replace(
                "Owner: [incident:owner]\\nDetails: [incident:url]", $data);
            break;
    }
}

// A different module edits every outgoing message.
function legal_footer_mail_alter(array &$message): void {
    $message['body'][] = '-- Confidential. Do not forward.';
}

// --- MailManagerInterface::mail() -----------------------------------------
function mail_manager_mail(string $module, string $key, string $to,
                           string $langcode, array $params): array {
    $message = [
        'id'       => $module . '_' . $key,
        'module'   => $module,
        'key'      => $key,
        'to'       => $to,
        'from'     => 'ops@example.com',
        'langcode' => $langcode,
        'headers'  => ['Content-Type' => 'text/plain; charset=UTF-8'],
        'subject'  => '',
        'body'     => [],
        'send'     => TRUE,
    ];
    // hook_mail() runs on the OWNING module only.
    $hook = $module . '_mail';
    if (function_exists($hook)) {
        $hook($key, $message, $params);
    }
    // hook_mail_alter() runs on EVERY module.
    foreach (['legal_footer'] as $other) {
        $alter = $other . '_mail_alter';
        if (function_exists($alter)) {
            $alter($message);
        }
    }
    // The mail plugin (php_mail) joins the body parts and delivers.
    $message['body'] = implode("\\n", $message['body']);
    $message['result'] = $message['send'];
    return $message;
}

$info = incident_tracker_token_info();
echo "Tokens the UI will offer for type '" .
    array_key_first($info['types']) . "':\\n";
foreach ($info['tokens']['incident'] as $name => $meta) {
    echo "  [incident:$name] - " . $meta['name'] . "\\n";
}

$message = mail_manager_mail('incident_tracker', 'new_incident',
    'oncall@example.com', 'en', ['incident' => $incident]);

echo "\\n=== " . $message['id'] . " -> " . $message['to'] . " ===\\n";
echo "Subject: " . $message['subject'] . "\\n\\n";
echo $message['body'] . "\\n";
echo "\\nresult: " . var_export($message['result'], TRUE) . "\\n";

echo "\\nSame body with ['clear' => TRUE]:\\n";
echo token_replace('Owner: [incident:owner] / Sev: [incident:severity]',
    ['incident' => $incident], ['clear' => TRUE]);`,
    output: `Tokens the UI will offer for type 'incident':
  [incident:id] - ID
  [incident:title] - Title
  [incident:severity] - Severity
  [incident:url] - URL

=== incident_tracker_new_incident -> oncall@example.com ===
Subject: [CRITICAL] #42: Checkout 500s

A new incident was logged on Acme Ops.
Owner: [incident:owner]
Details: https://ops.example.com/incident/42
-- Confidential. Do not forward.

result: true

Same body with ['clear' => TRUE]:
Owner:  / Sev: CRITICAL`,
  },

  keyPoints: [
    "Sending is two halves: \\Drupal::service('plugin.manager.mail')->mail('incident_tracker', 'new_incident', $to, $langcode, $params) requests a send, and hook_mail() in incident_tracker builds that message — omit the hook and the mail goes out empty.",
    "$key is the template name: hook_mail() switches on it and fills $message['subject'] plus $message['body'] (an ARRAY of parts you append to). hook_mail_alter() then runs on every module and can rewrite anything, or set $message['send'] = FALSE to cancel.",
    "mail() returns the $message array; check $result['result'] — TRUE/FALSE, NULL if cancelled. It never throws, and it sends synchronously, so queue it (section 23) rather than blocking a request.",
    "Delivery is a site decision, not a module decision: system.mail's 'interface' map resolves module_key, then module, then default to a mail plugin id. Core only ships php_mail and test_mail_collector — production sites add drupal/symfony_mailer or drupal/smtp + drupal/mailsystem.",
    "Tokens are a sandboxed [type:name] substitution language that exists because site builders — not developers — compose the strings in Pathauto patterns, mail bodies and field defaults; Twig plays that role in Symfony but is far too powerful to hand to an editor.",
    "hook_token_info() declares types and names for the 'Browse available tokens' UI; hook_tokens() resolves, keying $replacements by the full original token string and registering cacheability on the BubbleableMetadata argument. Call \\Drupal::token()->replace($text, ['incident' => $incident]) — or replacePlain() for text/plain mail — with $data keys matching your declared needs-data.",
  ],

  interview: [
    {
      q: "Walk me through sending an email from a custom Drupal module. Why can't you just call PHP's mail() or inject Symfony's MailerInterface?",
      a: "Two pieces. You call `$mailManager->mail('incident_tracker', 'new_incident', $to, $langcode, $params)` on the `plugin.manager.mail` service, and you implement `hook_mail()` in that module to fill `$message['subject']` and `$message['body']` for the given `$key`. Core then fires `hook_mail_alter()` so other modules can adjust or cancel the message, and picks a **mail plugin** from `system.mail`'s `interface` map (looking up `module_key`, then `module`, then `default`) to actually deliver it. Calling `mail()` directly skips all of that: no altering, no per-site transport choice, no `test_mail_collector` in tests, no logging. It's the same instinct as not calling `new PHPMailer` inside a Symfony controller — except Drupal's indirection also exists so a **site builder** can change the transport in config without touching code. In practice the first thing a real project does is `composer require drupal/symfony_mailer`, because core's default `php_mail` plugin is still just PHP's `mail()` with a plain-text body in Drupal 10 and 11.",
    },
    {
      q: "What are tokens, and why does Drupal need them when it already has Twig?",
      a: "Tokens are a deliberately tiny substitution language — `[incident:severity]`, `[site:name]`, `[node:title]` — resolved by `\\Drupal::token()->replace($text, $data)`. The reason they exist is **who writes the string**. Twig templates are authored by developers and live in version control; token-bearing strings are typed into admin forms by site builders — a Pathauto URL pattern, an email body in a settings form, a field's default value, a Views rewrite. You could never render a user-supplied string through Twig safely: it's Turing-complete and walks your whole object graph, so you'd need the sandbox extension and a whitelist policy. Tokens have no loops, no method calls and no object traversal — just a name resolved by whichever module claims that type. You provide them with `hook_token_info()` (declaration, feeds the token browser UI) and `hook_tokens()` (resolution).",
    },
    {
      q: "You implemented hook_tokens() for [incident:severity] and it works in your test, but the site builder can't find it in the token browser next to the settings form. What's wrong?",
      a: "`hook_tokens()` only resolves; `hook_token_info()` is what **advertises** the tokens, and it's easy to forget because everything still functions without it. Add a `types` entry for `incident` (with `needs-data => 'incident'`) and a `tokens` entry giving each token a human-readable `name` and `description`. Then clear caches, since token info is cached. The browser widget itself comes from the contrib **Token** module — render `['#theme' => 'token_tree_link', '#token_types' => ['incident']]` next to your textarea. Also check the token actually gets `$data` at replace time: if the caller doesn't pass `['incident' => $incident]`, your hook returns early and the raw `[incident:severity]` string is left in the output — unless `$options['clear']` is set, which blanks unresolved tokens instead.",
    },
    {
      q: "Your notification email is sent from a form submit handler and the form now takes eight seconds. What do you do?",
      a: "`MailManagerInterface::mail()` is synchronous — it blocks on the SMTP handshake inside the request. Don't send inline: push the payload onto a queue with `\\Drupal::queue('incident_tracker_notify')->createItem(['id' => $id])` and let a `QueueWorker` plugin call the mailer during cron or `drush queue:run`. That also gives you retry semantics for free, since an exception in the worker leaves the item claimed until the lease expires and it becomes claimable again. Separately, `mail()` returns FALSE rather than throwing on failure, so check `$result['result']` and log it — MailManager already logs to the `mail` channel, but your module usually wants its own record. If the project uses `drupal/symfony_mailer`, that module can also hand delivery to Symfony Messenger, which is the closest equivalent to routing `SendEmailMessage` to an async transport.",
    },
  ],

  quiz: [
    {
      question:
        "You call $mailManager->mail('incident_tracker', 'new_incident', $to, 'en', $params) and the email arrives with no subject and no body. What is the most likely cause?",
      options: [
        "system.mail's interface.default is set to php_mail",
        "incident_tracker has no hook_mail() implementation handling the 'new_incident' key",
        "The $params array must contain 'subject' and 'body' keys",
        "You must call ->format() on the message before sending",
      ],
      answerIndex: 1,
      explain:
        "MailManager builds an empty $message skeleton and then invokes hook_mail() on the module you named, passing your $key and $params. If that module has no hook_mail(), or its switch has no case for 'new_incident', nothing fills subject/body and an empty message goes out. $params is just your context array — it has no magic keys — and format() is called by the mail plugin for you.",
    },
    {
      question:
        "Which hook makes [incident:severity] appear in the site builder's 'Browse available tokens' list?",
      options: [
        "hook_tokens()",
        "hook_token_info()",
        "hook_theme()",
        "hook_entity_extra_field_info()",
      ],
      answerIndex: 1,
      explain:
        "hook_token_info() is pure metadata: it declares the token 'types' (with needs-data) and the human-readable name/description of each token, which is exactly what the token browser lists. hook_tokens() does the actual replacing at runtime — implement only that and your tokens work but are undiscoverable.",
    },
    {
      question:
        "In hook_tokens(), what should $replacements be keyed by?",
      options: [
        "The token name without brackets, e.g. 'severity'",
        "The token type, e.g. 'incident'",
        "The full original token string, e.g. '[incident:severity]'",
        "A numeric index in the order the tokens were scanned",
      ],
      answerIndex: 2,
      explain:
        "Core passes $tokens as name => original (e.g. 'severity' => '[incident:severity]') and finally runs the replacements through a str_replace-style pass over the source text, so the array must be keyed by the full original string: $replacements[$original] = $value. Keying by the bare name silently replaces nothing.",
    },
    {
      question:
        "A site needs all incident_tracker mail to go via SMTP while the rest of the site keeps the default. Where does that decision belong?",
      options: [
        "In incident_tracker's hook_mail(), by setting $message['transport']",
        "In the system.mail config's 'interface' map, keyed by the module name",
        "In incident_tracker.services.yml, by swapping the plugin.manager.mail service",
        "In settings.php, via $settings['mail_transport']",
      ],
      answerIndex: 1,
      explain:
        "MailManager::getInstance() reads system.mail's 'interface' map and resolves the most specific match first — 'incident_tracker_new_incident' (module_key), then 'incident_tracker' (module), then 'default'. Setting interface.incident_tracker to a plugin id routes exactly that module's mail. It's a site decision in config, the counterpart of MAILER_DSN being an env var; your module's job stops at hook_mail().",
    },
  ],
};

export default lesson;

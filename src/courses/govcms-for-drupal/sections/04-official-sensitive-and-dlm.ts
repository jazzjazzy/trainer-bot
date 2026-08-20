import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "official-sensitive-and-dlm",
  title: "OFFICIAL: Sensitive and the Line GovCMS Will Not Cross",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "GovCMS is certified up to OFFICIAL: Sensitive and no further, so classification is an input to your architecture rather than a label you attach to it at the end — and the three triggers that mean you talk to the platform before you draw anything.",

  concept: `
Every other section of this course is about what GovCMS does to your code. This
one is about the question that comes before code: **may this information live
here at all?** On a Drupal site you control, that question is yours to answer.
On GovCMS it is answered for you, in one published sentence:

> GovCMS is certified to host websites information with a classification level
> up to OFFICIAL: Sensitive.

The webforms guidance says the same thing about data in motion — the platform is
"certified to collect, store, and transmit information up to the OFFICIAL:
Sensitive classification". Above that line there is no GovCMS answer. Not a
module, not the private file scheme, not PaaS. PROTECTED and above is a
different platform, and that is a procurement conversation rather than a
technical one.

## Certified to hold it is not permission to hold it

The security page is blunt about the other half: "Although the platform supports
storing OFFICIAL: Sensitive information, this doesn't mean it's always
appropriate." The Privacy Act, the Australian Privacy Principles, your agency's
own legislation, the PSPF and the ISM all still bind you. GovCMS publishes a
Privacy Impact Assessment template with the GovCMS-specific sections pre-filled,
and says plainly that it does **not** review or approve your PIA.

The assurance splits the way the offerings do. The platform has completed an
IRAP assessment aligned with the 2019 ISM at OFFICIAL: Sensitive. On SaaS that
covers you. On PaaS it covers the infrastructure layer only — the Drupal
application layer you took back is yours to have assessed, at your cost.

### The three triggers

From govcms.gov.au: *"If your website uses authentication, collects personal
information or payments, talk to us early."* The onboarding page spells the same
three out as website authentication, collection of personal information (names,
addresses, dates of birth) and financial transactions.

Treat them as design-time gates, not disclaimers. Each one is already
constrained by the platform: \`simplesamlphp_auth\` and \`simple_oauth\` are
vendored by the distribution but are neither in the profile's install list nor
on the \`managed_modules\` allowlist, and the distribution vendors no commerce or
payment package at all. So "we'll just enable SSO in sprint three" is not a plan
you can make unilaterally.

## What govcms_dlm actually does

Almost every candidate over-claims this module. \`govcms_dlm\` is required by the
distribution at \`3.0.0\` and sits on the \`managed_modules\` allowlist, but the
profile does not install it. Its entire behaviour is one
\`hook_mail_alter()\` that appends a configured suffix to the **subject line** of
mail sent through Drupal:

\`\`\`php
function govcms_dlm_mail_alter(&$message) {
  $message['subject'] = t('@subject @dlm', [
    '@subject' => $message['subject'],
    '@dlm' => \\Drupal::config('govcms_dlm.settings')->get('suffix'),
  ]);
}
\`\`\`

Three options — \`[SEC=UNOFFICIAL]\`, \`[SEC=OFFICIAL]\`,
\`[SEC=OFFICIAL:Sensitive]\` — one site-wide value, default
\`[SEC=UNOFFICIAL]\`. It classifies no node, no file and no field, and the
module's own settings form warns that choosing a marker does not make the mail
transport secure. The format comes from Annex G of PSPF policy 8, the email protective
marking standard.

The name looks dated because the 2018 PSPF reforms collapsed the old marker set
— For Official Use Only, Sensitive, Sensitive: Personal, Sensitive: Legal —
into the single **OFFICIAL: Sensitive** classification plus optional information
management markers. But the framework still applies the AGRkMS "Dissemination
Limiting Marker" property to OFFICIAL: Sensitive information, so DLM is now one
value rather than a family. Know that distinction; interviewers use it.
`,

  comparisons: [
    {
      label: "Putting a protective marking on outgoing mail",
      intro:
        "Every email the site sends should carry a PSPF protective marking in its subject line. On your own site that is a small custom module; on GovCMS it is a module you enable and one select list.",
      php: `<?php

/**
 * @file
 * mymodule.module - on a site you control, marking mail is your own code, so
 * you can branch per sending module, per recipient, per anything.
 */

function mymodule_mail_alter(&$message) {
  $sensitive_senders = ['webform', 'contact'];

  $marker = in_array($message['module'], $sensitive_senders, TRUE)
    ? '[SEC=OFFICIAL:Sensitive]'
    : '[SEC=OFFICIAL]';

  $message['subject'] = $message['subject'] . ' ' . $marker;

  // Nothing stops you marking the body and headers too.
  $message['headers']['X-Protective-Marking'] = 'VER=2018.4, NS=gov.au, SEC=OFFICIAL';
}`,
      ts: `# core.extension.yml - govcms_dlm is required by the distribution at 3.0.0
# and sits on the managed_modules allowlist, but the profile does NOT install
# it. Enabling it is a config change you export like any other.
module:
  govcms_dlm: 0
  govcms_security: 0
  pathauto: 0
theme:
  claro: 0
  olivero: 0
profile: govcms

---
# govcms_dlm.settings.yml - the whole of the module's configuration. One
# site-wide suffix, chosen at /admin/config/system/dlm from exactly three
# values. There is no per-module branch and no per-recipient branch.
suffix: '[SEC=OFFICIAL:Sensitive]'`,
      rightLang: "yaml",
      note: "govcms_dlm appends one configured suffix to the subject line of mail sent through Drupal mail, and does nothing else — no headers, no body marking, no per-message logic. Mail sent by code that bypasses Drupal's mail system is unmarked.",
    },
    {
      label: "Trigger one: turning on authentication",
      intro:
        "The brief says the site needs logged-in users behind agency SSO. The module exists in both worlds; only one of them lets you enable it.",
      php: `# Vanilla Drupal: you own composer.json and the enabled-module list.
composer require drupal/simplesamlphp_auth:^4.1
drush en -y simplesamlphp_auth

drush config:set simplesamlphp_auth.settings activate 1 -y
drush config:set simplesamlphp_auth.settings auth_source default-sp -y
drush config:set simplesamlphp_auth.settings register_users 1 -y

drush cex -y
git add config/sync && git commit -m "Enable SAML authentication"`,
      ts: `# GovCMS: the module is already vendored by the distribution...
grep '"drupal/simplesamlphp_auth"' web/profiles/contrib/govcms/composer.json
#         "drupal/simplesamlphp_auth": "4.1.0",

# ...and Drupal can see it, disabled:
ahoy drush pm:list --status=disabled --filter=simplesamlphp

# ...but it is absent from the profile's install list, and absent from the
# managed_modules allowlist that module_permissions enforces:
grep -c "simplesamlphp_auth" \\
  vendor/govcms/scaffold-tooling/drupal/settings/security.settings.php
# 0

# And the roles that could have overridden that are themselves denied
# 'administer modules' and 'administer permissions'.
# So the next step is not a command. It is the published sentence:
#   "If your website uses authentication, collects personal information or
#    payments, talk to us early."  - govcms.gov.au/support/govcms-basics`,
      leftLang: "bash",
      rightLang: "bash",
      note: "Bundled is not the same as available. Verified: present in the distribution, not installed by the profile, not on the allowlist. Anything beyond that — whether GovCMS will turn it on for you, and how long that takes — is not published, so do not promise a client a date.",
    },
    {
      label: "Trigger two: taking a payment",
      intro:
        "A fee-paying registration. On a site you control this is Drupal Commerce and a gateway plugin; on GovCMS the platform ships no commerce stack, so the money has to leave the site before it becomes a transaction.",
      php: `<?php

namespace Drupal\\my_gateway\\Plugin\\Commerce\\PaymentGateway;

use Drupal\\commerce_payment\\Entity\\PaymentInterface;
use Drupal\\commerce_payment\\Plugin\\Commerce\\PaymentGateway\\OnsitePaymentGatewayBase;

/**
 * Vanilla Drupal: orders, payments and tokenised payment methods are entities
 * in your database, and the charge is made from your web container.
 */
class MyGateway extends OnsitePaymentGatewayBase {

  public function createPayment(PaymentInterface $payment, $capture = TRUE) {
    $this->assertPaymentState($payment, ['new']);
    $method = $payment->getPaymentMethod();

    $charge = $this->charge($method->getRemoteId(), $payment->getAmount()->getNumber());

    $payment->setRemoteId($charge['id']);
    $payment->setState($capture ? 'completed' : 'authorization');
    $payment->save();
  }

  protected function charge($token, $amount) {
    $response = $this->httpClient->post('https://gateway.example/v1/charges', [
      'json' => ['source' => $token, 'amount' => $amount, 'currency' => 'aud'],
    ]);
    return json_decode((string) $response->getBody(), TRUE);
  }

}`,
      ts: `<?php

/**
 * @file
 * mytheme.theme - GovCMS vendors no commerce or payment package, and no
 * payment module appears in managed_modules. Card data never reaches Drupal.
 * The site holds a reference and hands off to a service the agency already
 * operates and has already had assessed.
 */

function mytheme_preprocess_node(array &$variables) {
  $node = $variables['node'];

  if ($node->bundle() !== 'fee_paying_registration') {
    return;
  }

  $reference = $node->get('field_payment_reference')->value;

  $variables['pay_url'] = \\Drupal\\Core\\Url::fromUri(
    'https://payments.agency.gov.au/start',
    [
      'query' => ['ref' => $reference, 'return' => 'https://www.agency.gov.au/receipt'],
      'absolute' => TRUE,
    ]
  )->toString();

  // The only thing stored locally is the reference the gateway echoes back.
  $variables['#cache']['contexts'][] = 'url.query_args:ref';
}`,
      note: "Financial transactions are one of the three named early-conversation triggers, so even this off-platform pattern is something you raise with GovCMS before you build it — the redirect target, the return URL and what the site retains are all in scope.",
    },
    {
      label: "Trigger three: collecting personal information",
      intro:
        "A consultation form that takes names, addresses and an attachment. Webform's own default is already private in both worlds — the difference is that in vanilla Drupal the stream wrapper and the extension list stay yours to change, while GovCMS holds both of them shut, on SaaS and PaaS alike.",
      php: `<?php

/**
 * @file
 * my_forms.module - vanilla Drupal. Webform already ships the safe default:
 * WebformManagedFileBase::defineDefaultProperties() sets 'uri_scheme' =>
 * 'private', and getVisibleStreamWrappers() unsets 'public' entirely unless
 * webform.settings file.file_public is TRUE - and it ships FALSE. So private
 * is not something you switch on here; it is what you already get.
 *
 * What you own on your own site is the switch itself. Flip file_public and
 * 'public' reappears in the list, and nothing then stops you making it the
 * default for every upload:
 */

use Drupal\\Core\\Form\\FormStateInterface;

// drush config:set webform.settings file.file_public 1 -y

function my_forms_webform_element_default_properties_alter(array &$properties, array &$definition) {
  if ($definition['id'] === 'managed_file') {
    $properties['uri_scheme'] = 'public';
    $properties['file_extensions'] = 'txt pdf doc docx xls xlsx ppt';
    $properties['max_filesize'] = '20';
  }
}

function my_forms_form_alter(array &$form, FormStateInterface $form_state, $form_id) {
  // You decide whether anything scans the upload at all.
}`,
      ts: `<?php

/**
 * @file
 * govcms_security.module - shipped by the distribution. The difference is not
 * that GovCMS changes the default from public to private: Webform was already
 * private. It is that GovCMS takes the switch away. This hook re-asserts
 * private every time defaults are computed, so even on a site where someone
 * has flipped file_public back on, the default you get is still private.
 * You do not opt in and you cannot opt out.
 */

use Drupal\\Core\\Form\\FormStateInterface;
use Drupal\\webform\\Plugin\\WebformElement\\ManagedFile;

function govcms_security_webform_element_default_properties_alter(array &$properties, array &$definition) {
  $scheme_options = ManagedFile::getVisibleStreamWrappers();
  if (isset($scheme_options['private'])) {
    $properties['uri_scheme'] = 'private';
  }
}

// And for signature elements 'public' is removed from the options list
// outright, so it cannot be picked even one element at a time:
function govcms_security_webform_element_configuration_form_alter(array &$form, FormStateInterface $form_state) {
  $element_type = $form_state->getFormObject()->getWebformElementPlugin()->getTypeName();
  if ($element_type == 'webform_signature') {
    $scheme_options = $form['signature']['uri_scheme']['#options'];
    if (isset($scheme_options['private'])) {
      unset($scheme_options['public']);
      $form['signature']['uri_scheme']['#options'] = $scheme_options;
    }
  }
}

/**
 * And the extension gate is a constant on an interface, not a form setting:
 *
 * namespace Drupal\\govcms_security;
 *
 * interface GovcmsFileConstraintInterface {
 *   public const BLOCKED_EXTENSIONS = ['doc', 'xls', 'ppt', 'rtf'];
 * }
 *
 * Uploads are also scanned: the httpav module is force-enabled on every
 * deploy and required by the platform validators.
 */`,
      note: "The private stream resolves to sites/default/files/private, inside the public tree on the same Lagoon volume. Note also that webform.webform.* is in the config_ignore defaults, so the form definition itself is deliberately excluded from config deployment.",
    },
  ],

  playground: {
    intro:
      "A classification gate, as a pure function. Six workloads, each with a classification and the three trigger booleans. Watch the precedence: the ceiling is checked before the triggers, because no conversation rescues PROTECTED.",
    lang: "php",
    code: `<?php
// The decision that has to happen before anyone opens an IDE.
// No Drupal - just the rule, applied to six candidate workloads.

const CEILING = 'OFFICIAL: Sensitive';

$rank = [
  'UNOFFICIAL'          => 0,
  'OFFICIAL'            => 1,
  'OFFICIAL: Sensitive' => 2,
  'PROTECTED'           => 3,
  'SECRET'              => 4,
];

$workloads = [
  ['name' => 'Media releases',    'class' => 'OFFICIAL',            'login' => false, 'pii' => false, 'pay' => false],
  ['name' => 'Grant guidelines',  'class' => 'UNOFFICIAL',          'login' => false, 'pii' => false, 'pay' => false],
  ['name' => 'Draft budget pages','class' => 'OFFICIAL: Sensitive', 'login' => false, 'pii' => false, 'pay' => false],
  ['name' => 'Consultation form', 'class' => 'OFFICIAL',            'login' => false, 'pii' => true,  'pay' => false],
  ['name' => 'Event ticketing',   'class' => 'OFFICIAL',            'login' => true,  'pii' => true,  'pay' => true],
  ['name' => 'Case management',   'class' => 'PROTECTED',           'login' => true,  'pii' => true,  'pay' => false],
];

function gate(array $w, array $rank) {
  // 1. The ceiling is absolute. No module, role or setting raises it.
  if ($rank[$w['class']] > $rank[CEILING]) {
    return ['NOT PERMITTED', 'above ' . CEILING . ' - wrong platform'];
  }

  // 2. Any trigger outranks a comfortable classification.
  $triggers = [];
  if ($w['login']) { $triggers[] = 'authentication'; }
  if ($w['pii'])   { $triggers[] = 'personal info'; }
  if ($w['pay'])   { $triggers[] = 'payments'; }
  if ($triggers !== []) {
    return ['REFER TO GOVCMS FIRST', implode(' + ', $triggers)];
  }

  // 3. At the ceiling, mark what leaves the site by email.
  if ($w['class'] === CEILING) {
    return ['ALLOW-with-marker', 'govcms_dlm suffix [SEC=OFFICIAL:Sensitive]'];
  }

  return ['ALLOW', 'publicly available information'];
}

printf("%-22s %-20s %-22s %s\\n", 'WORKLOAD', 'CLASSIFICATION', 'VERDICT', 'WHY');
printf("%s\\n", str_repeat('-', 100));

$tally = [];
foreach ($workloads as $w) {
  list($verdict, $why) = gate($w, $rank);
  $tally[$verdict] = isset($tally[$verdict]) ? $tally[$verdict] + 1 : 1;
  printf("%-22s %-20s %-22s %s\\n", $w['name'], $w['class'], $verdict, $why);
}

printf("%s\\n", str_repeat('-', 100));
foreach ($tally as $verdict => $count) {
  printf("%-22s %d\\n", $verdict, $count);
}`,
    output: `WORKLOAD               CLASSIFICATION       VERDICT                WHY
----------------------------------------------------------------------------------------------------
Media releases         OFFICIAL             ALLOW                  publicly available information
Grant guidelines       UNOFFICIAL           ALLOW                  publicly available information
Draft budget pages     OFFICIAL: Sensitive  ALLOW-with-marker      govcms_dlm suffix [SEC=OFFICIAL:Sensitive]
Consultation form      OFFICIAL             REFER TO GOVCMS FIRST  personal info
Event ticketing        OFFICIAL             REFER TO GOVCMS FIRST  authentication + personal info + payments
Case management        PROTECTED            NOT PERMITTED          above OFFICIAL: Sensitive - wrong platform
----------------------------------------------------------------------------------------------------
ALLOW                  2
ALLOW-with-marker      1
REFER TO GOVCMS FIRST  2
NOT PERMITTED          1
`,
  },

  keyPoints: [
    "The published ceiling is one sentence: \"GovCMS is certified to host websites information with a classification level up to OFFICIAL: Sensitive.\" Above it there is no configuration answer — PROTECTED and above is a different platform, not a harder build.",
    "Certified to hold it is not permission to hold it. The Privacy Act, the APPs, the PSPF and the ISM still bind the agency; GovCMS supplies a pre-filled Privacy Impact Assessment template and states that it does not review or approve your PIA.",
    "Three triggers mean talk to GovCMS before you design: authentication, collection of personal information, and payments. All three are already constrained — SSO and OAuth modules are vendored but neither installed nor on the managed_modules allowlist, and no commerce package ships at all.",
    "govcms_dlm is required at 3.0.0 and is on the allowlist, but is not installed by the profile. Its whole behaviour is a hook_mail_alter() that appends one site-wide suffix — [SEC=UNOFFICIAL], [SEC=OFFICIAL] or [SEC=OFFICIAL:Sensitive], default [SEC=UNOFFICIAL] — to the email subject line. It classifies no content.",
    "The 2018 PSPF reforms collapsed the old marker set (For Official Use Only, Sensitive, Sensitive: Personal, Sensitive: Legal) into the single OFFICIAL: Sensitive classification plus optional information management markers, while keeping the AGRkMS \"Dissemination Limiting Marker\" property for OFFICIAL: Sensitive.",
    "IRAP coverage follows the offering: the platform's assessment is aligned with the 2019 ISM at OFFICIAL: Sensitive and covers SaaS customers entirely, but on PaaS it covers only the infrastructure layer — the Drupal application layer is assessed at the agency's cost.",
  ],

  interview: [
    {
      q: "A department wants to move a case-management system holding PROTECTED files onto GovCMS. How do you handle that conversation?",
      a: "I stop the technical discussion, because there is nothing to design. GovCMS is certified to host information up to **OFFICIAL: Sensitive** and no further, so PROTECTED is not a hardening problem — it is the wrong platform, and neither PaaS nor a private file scheme changes that. What I would offer instead is a split: the public-facing pages that are genuinely OFFICIAL or below go on GovCMS, and the case data stays in whatever accredited system already holds it, with the GovCMS site linking out rather than embedding. I have had this conversation land better when I bring the published sentence rather than paraphrasing it, because the agency's own security adviser recognises the wording and the discussion moves to their accreditation boundary instead of my opinion.",
    },
    {
      q: "What does the govcms_dlm module do, and when would you enable it?",
      a: "Less than the name suggests, and that is the point of the question. It implements a single `hook_mail_alter()` that appends one configured suffix to the **subject line** of mail sent through Drupal's mail system — `[SEC=UNOFFICIAL]`, `[SEC=OFFICIAL]` or `[SEC=OFFICIAL:Sensitive]`, defaulting to `[SEC=UNOFFICIAL]`, set once at `/admin/config/system/dlm`. It marks no node, no file and no field, there is no per-message branch, and the module's own help text warns that setting it does not make the transport secure. I would enable it on a site whose webform notifications carry OFFICIAL: Sensitive content, and in the same breath tell the agency to check their email gateway, because that is where the marking actually gets enforced. It is required by the distribution at 3.0.0 and is on the managed_modules allowlist, but the profile does not install it, so turning it on is a deliberate config change you export.",
    },
    {
      q: "A discovery brief lands: members' area, a webform collecting date of birth, and a paid event registration. What do you do first?",
      a: "That brief hits all three of GovCMS's published triggers — authentication, collection of personal information, and payments — so the first task in my plan is a conversation with GovCMS, not a story-point estimate. Concretely: `simplesamlphp_auth` and `simple_oauth` are vendored by the distribution but are neither in the install list nor on the `managed_modules` allowlist, and no commerce package ships at all, so two of the three cannot be delivered by me acting alone. In parallel I would get the agency's privacy officer engaged and start the PIA using the GovCMS template, since the DOB field is squarely personal information and GovCMS explicitly will not review or approve the assessment for us. The payment I would design as a redirect to a service the agency already operates, so card data never touches the Drupal site. Pricing that discovery conversation into sprint zero is the difference between a project that lands and one that discovers in week six that its login page cannot exist.",
    },
    {
      q: "On the compliance side, what actually changes between SaaS and PaaS?",
      a: "The platform's IRAP assessment is aligned with the 2019 ISM at OFFICIAL: Sensitive, and the offerings split where that coverage stops. On SaaS it covers the customer end to end — the agency still owns theme, content and user accounts, but does not need its own assessment. On PaaS the assessment covers the infrastructure layer only, so the Drupal application layer the agency has taken back is theirs to have assessed, at their own cost, along with security patching and module management. The line I would put in a proposal is that PaaS buys flexibility with assurance work, not with money alone — and I would say the same thing to the agency's own security adviser early, because the cost of an application-layer IRAP is the item most often missing from a PaaS business case.",
    },
  ],

  quiz: [
    {
      question: "What does govcms_dlm do when it is enabled and configured?",
      options: [
        "Applies a protective marking field to every node and enforces it on the rendered page",
        "Adds a per-field classification to media entities and blocks download of anything above the site's ceiling",
        "Appends one site-wide suffix to the subject line of mail sent through Drupal's mail system",
        "Injects an X-Protective-Marking header into every outgoing HTTP response",
      ],
      answerIndex: 2,
      explain:
        "Its entire implementation is a hook_mail_alter() that concatenates the configured suffix onto $message['subject']. One site-wide value chosen from three, default [SEC=UNOFFICIAL], and nothing outside the subject line — not nodes, not files, not HTTP headers.",
    },
    {
      question:
        "Which of these makes GovCMS the wrong platform outright, rather than something to discuss with the GovCMS team first?",
      options: [
        "The site needs to hold information classified PROTECTED",
        "The site needs authenticated user accounts behind agency SSO",
        "The site collects names, addresses and dates of birth through a webform",
        "The site needs to take a registration fee by card",
      ],
      answerIndex: 0,
      explain:
        "GovCMS is certified up to OFFICIAL: Sensitive; PROTECTED is above the ceiling and no offering, module or setting raises it. The other three are the published early-conversation triggers — authentication, collection of personal information, and payments — which constrain the design but do not rule the platform out.",
    },
    {
      question: "What did the 2018 PSPF reforms do to Dissemination Limiting Markers?",
      options: [
        "Abolished protective markings on email entirely in favour of transport-level controls",
        "Renamed OFFICIAL: Sensitive to For Official Use Only and kept the rest of the marker set",
        "Left the marker set unchanged but moved responsibility for it from the PSPF to the ISM",
        "Collapsed the old marker set into the single OFFICIAL: Sensitive classification, with optional information management markers alongside it",
      ],
      answerIndex: 3,
      explain:
        "For Official Use Only, Sensitive, Sensitive: Personal and Sensitive: Legal were consolidated into OFFICIAL: Sensitive, with optional information management markers (legislative secrecy, personal privacy, legal privilege). The AGRkMS 'Dissemination Limiting Marker' property still applies to OFFICIAL: Sensitive, which is why a module named govcms_dlm offers post-2018 [SEC=...] values.",
    },
    {
      question:
        "Under GovCMS's published IRAP position, who is responsible for assessing the Drupal application layer on a PaaS site?",
      options: [
        "GovCMS, because the platform's IRAP assessment covers every layer for both offerings",
        "The agency, at its own cost, because the platform assessment covers only the infrastructure layer on PaaS",
        "The agency's Drupal Services Panel supplier, as a mandatory deliverable of every PaaS engagement",
        "Nobody — application-layer assessment is waived while the site stays at or below OFFICIAL: Sensitive",
      ],
      answerIndex: 1,
      explain:
        "The security page states that for SaaS customers everything is covered, while for PaaS customers only the infrastructure layer is covered by the platform's IRAP assessment and the agency is responsible for assessing its Drupal application layer at its own cost.",
    },
  ],
};

export default lesson;

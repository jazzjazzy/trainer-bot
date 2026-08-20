import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 27,
  slug: "webform-and-personal-information",
  title: "Webform, Spam Controls and the Personal-Information Boundary",
  part: "Building on GovCMS & Interview Prep",
  estMinutes: 13,
  summary:
    "Webform is the collection surface of every government site, and on GovCMS it is simultaneously a configuration artefact you cannot deploy and a privacy decision you are not allowed to make on your own.",

  concept: `
You know Webform. What GovCMS changes is not the module — it is who owns the
form, where the form lives, and whether the submission is allowed to exist.

## The form is not in your repository

\`drupal/webform\` is vendored by the distribution at \`6.3.0\`, but it is not in
the profile's install list. It sits on the \`managed_modules\` allowlist next to
\`webform_access\`, \`webform_attachment\`, \`webform_image_select\`,
\`webform_node\` and \`webform_ui\` — enableable, not enabled.

Once enabled, the forms you build never reach \`config/default\`. The profile
ships this:

\`\`\`yaml
mode: simple
ignored_config_entities:
  - 'webform.webform.*'
  - 'webform.webform_options.*'
\`\`\`

So a webform is a production database artefact. It does not travel through the
rollout's \`Perform config import\` task and it never appears in a merge
request. Shipshape does not catch it either. Half of \`shipshape.yml\` is
\`[DATABASE]\` module and permission checks that read the live active
configuration through Drush — but every GovCMS invocation passes
\`--exclude-db\`, so on the platform only the \`[FILE]\` checks over
\`config/default\` ever run. Either way, no check in that file targets
\`webform.webform.*\`.
Building the form in production and pulling a database down is the workflow,
not a smell — say that out loud in an interview and you will sound like someone
who has done it.

## Collecting personal information is a platform conversation

From govcms.gov.au: *"If your website uses authentication, collects personal
information or payments, talk to us early."* The Webforms and privacy page adds
the ceiling: *"GovCMS is certified to collect, store, and transmit information
up to the OFFICIAL: Sensitive classification."* Certified to hold it is not
authority to collect it — that page's own worked example is that an agency
cannot collect Tax File Numbers unless it has legal authority to do so.

## The spam stack you inherit

\`honeypot\` is a hard dependency of \`govcms_security\`
(\`honeypot:honeypot\` in its \`info.yml\`), and \`govcms_security\` is the
profile's sole dependency and a validator-required module. Honeypot is
therefore on every GovCMS site and cannot be uninstalled. All three shipped
roles — site administrator, content approver, content author — carry
\`bypass honeypot protection\`, which is why editors never see it fire.

On top of that, \`captcha\`, \`image_captcha\` and \`recaptcha\` are on the
allowlist. \`recaptcha_v3\` is vendored by the distribution but is *not*
allowlisted.

## Files, and the private stream you did not ask for

\`govcms_security_webform_element_default_properties_alter()\` sets
\`$properties['uri_scheme'] = 'private';\`, which changes the *default* for
webform element types. Vanilla Webform already defaults \`managed_file\` to
private, so the hook mostly extends that default to element types that had
none. A default is not an override: \`WebformManagedFileBase::getUriScheme()\`
returns \`$element['#uri_scheme']\` first, so an element whose stored
configuration says \`public\` still uploads to public. That is exactly why a
*second* hook exists —
\`govcms_security_webform_element_configuration_form_alter()\` unsets
\`public\` from the signature element's option list, so an author cannot choose
it. Separately, a kernel \`REQUEST\` subscriber throws \`AccessDeniedHttpException\`
for any upload whose extension is in \`['doc', 'xls', 'ppt', 'rtf']\` — before
a single element validator runs. \`httpav\` is force-enabled on every deploy, so
uploads meet the scanner regardless of how the element is configured.

### Email-only, do-not-store is a real architecture

Webform's own settings give you the shape with no custom code, which matters
because on SaaS you cannot ship a module:

- \`results_disabled: true\` — no \`webform_submission\` row is written at all
- \`form_confidential: true\` — *"Confidential submissions have no recorded IP
  address and must be submitted while logged out."*
- \`purge: completed\` with \`purge_days\` — retention for forms that must store

Pair that with an email handler, and if the site enables \`govcms_dlm\` the
outgoing subject line carries its marker. The database that never held the
submission is the one you never have to explain.
`,

  comparisons: [
    {
      label: "Getting the form from your branch to production",
      intro:
        "You have built an enquiry form locally and want it live. On a site you control the form is config; on GovCMS it is data.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# config/sync/webform.webform.enquiry.yml -- exported, reviewed, deployed.
langcode: en
status: open
id: enquiry
title: Enquiry
elements: |-
  name:
    '#type': textfield
    '#title': 'Full name'
    '#required': true
  email:
    '#type': email
    '#title': 'Email address'
    '#required': true
settings:
  results_disabled: false
  purge: none
  purge_days: null

# Workflow:
#   drush config:export -y
#   git add config/sync && git commit -m "Add the enquiry form"
#   drush deploy        # config:import brings the form with it`,
      ts: `# web/profiles/contrib/govcms/config/install/config_ignore.settings.yml
mode: simple
ignored_config_entities:
  - 'clamav.settings'
  - 'login_security.settings'
  - 'password_policy.*'
  - 'seckit.settings'
  - 'system.menu.*'
  - 'webform.webform.*'
  - 'webform.webform_options.*'

# webform.webform.enquiry therefore never enters config/default.
# The rollout task "Perform config import" cannot see it. shipshape.yml declares
# [DATABASE] module and permission checks that read the running site via drush,
# but every GovCMS invocation passes --exclude-db, so only the [FILE] checks over
# config/default run -- and no check targets webform.webform.* in either place.
#
# Workflow:
#   build the form in production at /admin/structure/webform
#   pull a production database down and import it locally to inspect it`,
      note: "The form is an unversioned production artefact by platform design — plan review, backups and rollback around a database, not a diff.",
    },
    {
      label: "Retention, and choosing not to store at all",
      intro:
        "A form collects names and email addresses, and the agency wants resolved enquiries aged out while unresolved ones are kept. Webform's own purge/purge_days is plain Webform and works identically on both sides — but it ages every submission out on one clock, so the conditional rule is what vanilla reaches for a module to do. On GovCMS SaaS you cannot ship that module, so the requirement has to be designed down to what the settings express.",
      leftLang: "php",
      rightLang: "yaml",
      php: `<?php

// mymodule.module -- vanilla Drupal. Note what this is NOT for: a flat
// "delete everything after 30 days" is settings.purge = completed with
// purge_days: 30, stock Webform, no code, on any Drupal site. Code is only
// needed when retention depends on a submitted value.

/**
 * Implements hook_cron().
 */
function mymodule_cron() {
  $storage = \\Drupal::entityTypeManager()->getStorage('webform_submission');
  $cutoff = \\Drupal::time()->getRequestTime() - (30 * 86400);
  $ids = $storage->getQuery()
    ->accessCheck(FALSE)
    ->condition('webform_id', 'enquiry')
    ->condition('completed', $cutoff, '<')
    ->execute();
  $delete = [];
  foreach ($storage->loadMultiple($ids) as $submission) {
    // Keep anything an officer has not closed off, however old it is.
    if ($submission->getElementData('outcome') === 'resolved') {
      $delete[] = $submission;
    }
  }
  if ($delete) {
    $storage->delete($delete);
  }
}`,
      ts: `# webform.webform.enquiry -- edited in production, never exported.
settings:
  results_disabled: true
  results_disabled_ignore: false
  form_confidential: true
  form_disable_remote_addr: true
  purge: completed
  purge_days: 30
handlers:
  email_notification:
    id: email
    handler_id: email_notification
    label: 'Email notification'
    status: true
    weight: 0
    settings:
      to_mail: enquiries@agency.gov.au
      from_mail: '[site:mail]'
      subject: 'Website enquiry'
      body: '[webform_submission:values]'`,
      note: "Every setting on the right is stock Webform and behaves the same on a vanilla site — the GovCMS delta is that config_ignore keeps webform.webform.* out of your repository, so these lines can only be edited in production. results_disabled writes no webform_submission row at all; purge/purge_days is the fallback for forms that genuinely must store; Webform describes confidential submissions as having 'no recorded IP address' and requiring the user to be logged out. What you give up on SaaS is the conditional rule on the left, not the settings.",
    },
    {
      label: "Turning spam protection on (and off)",
      intro:
        "On your own site the spam stack is a decision. On GovCMS part of it is a fact of the distribution, and the rest is bounded by the module allowlist.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: you pick the stack, install it, configure it, ship it.
composer require drupal/honeypot:^2.2 drupal/captcha:^2.0
drush -y pm:install honeypot captcha image_captcha

drush -y config:set honeypot.settings protect_all_forms 1
drush -y config:set honeypot.settings time_limit 5
drush -y config:set honeypot.settings element_name url

drush config:export -y
git add config/sync && git commit -m "Add honeypot and captcha"

# And if you change your mind later, it just comes out:
drush -y pm:uninstall honeypot captcha image_captcha`,
      ts: `# GovCMS: honeypot is already there. Drush only runs inside the cli
# container -- ahoy drush is: docker compose exec -T cli drush "$@"
ahoy drush pm:list --status=enabled --filter=honeypot --format=list

ahoy drush -y pm:uninstall honeypot
# Refused: honeypot:honeypot is a dependency of govcms_security, which is the
# govcms profile's only dependency and is in GOVCMS_REQUIRED_MODULES.

# What you may add on top, from managed_modules in security.settings.php:
#   captcha, image_captcha, recaptcha
# Vendored by the distribution but NOT on that allowlist: recaptcha_v3

# honeypot.settings is not in config_ignore, so unlike the forms themselves
# this setting really does travel in config/default:
ahoy drush -y config:set honeypot.settings protect_all_forms 1
ahoy drush config:export -y`,
      note: "Three shipped roles carry 'bypass honeypot protection', so an editor testing the form will never trip it — always test spam controls logged out.",
    },
    {
      label: "A file-upload element on the form",
      intro:
        "The element declares a stream wrapper and an extension list. On GovCMS platform code moves the stream-wrapper default, removes the public option from the signature element's form, and blocks the extension outright at the request layer — only the last of those actually overrules a stored element setting.",
      leftLang: "yaml",
      rightLang: "php",
      php: `# Vanilla Drupal: the element decides where files land and what is allowed.
attachment:
  '#type': managed_file
  '#title': 'Supporting document'
  '#uri_scheme': public
  '#file_extensions': 'pdf doc docx xls xlsx'
  '#max_filesize': '10'
  '#required': false

# Result: /sites/default/files/webform/enquiry/attachment/report.doc
# is served straight off disk by the web server.`,
      ts: `<?php

// govcms_security.module -- the default_properties hook moves the DEFAULT.

use Drupal\\webform\\Plugin\\WebformElement\\ManagedFile;

/**
 * Implements hook_webform_element_default_properties_alter().
 */
function govcms_security_webform_element_default_properties_alter(array &$properties, array &$definition) {
  $scheme_options = ManagedFile::getVisibleStreamWrappers();
  if (isset($scheme_options['private'])) {
    $properties['uri_scheme'] = 'private';
  }
}

// A default only applies where the element stored nothing of its own --
// WebformManagedFileBase::getUriScheme() returns $element['#uri_scheme'] first,
// so the element on the left, which stored 'public', still resolves to public.
// Hence a SECOND hook, which takes the choice away for the signature element:
//   govcms_security_webform_element_configuration_form_alter()
//   -> unset($scheme_options['public']) on $form['signature']['uri_scheme']

// GovcmsSecurityEventsSubscriber, on KernelEvents::REQUEST -- this runs before
// any Webform element validator, on both form posts and API uploads.
protected function validateFile($name) {
  $extension = pathinfo($name, PATHINFO_EXTENSION);
  if ($extension && is_string($extension)) {
    if (in_array(strtolower($extension), GovcmsFileConstraintInterface::BLOCKED_EXTENSIONS, TRUE)) {
      $message = sprintf('\\'%s\\' file is blocked from uploading ', $extension);
      throw new AccessDeniedHttpException($message);
    }
  }
  return TRUE;
}`,
      note: "BLOCKED_EXTENSIONS is ['doc', 'xls', 'ppt', 'rtf'] and is enforced at the HTTP request layer, so 'we allowed .doc on the element' is not a fix — and private files still live under sites/default/files/private on the same Lagoon volume.",
    },
  ],

  playground: {
    intro:
      "A submission pipeline as a pure decision function: four submissions run through four ordered handlers, then a PII sweep classifies whatever survived and derives the storage recommendation.",
    lang: "php",
    code: `<?php

// Ordered handler stack. Each handler either stops the submission or passes.
$stack = ['honeypot', 'bot_score', 'required_email', 'route_to_email'];

$submissions = [
  ['id' => 'S1', 'trap' => 'http://spam.example', 'score' => 92,
   'values' => ['email' => 'a@b.gov.au', 'note' => 'buy pills']],
  ['id' => 'S2', 'trap' => '', 'score' => 12,
   'values' => ['email' => 'bot@example.com', 'note' => 'hello there']],
  ['id' => 'S3', 'trap' => '', 'score' => 88,
   'values' => ['email' => '', 'phone' => '0412 345 678']],
  ['id' => 'S4', 'trap' => '', 'score' => 95,
   'values' => ['email' => 'jo.citizen@example.gov.au',
                'phone' => '+61 2 6123 4567', 'ref' => '123 456 789']],
];

$patterns = [
  'email'    => '/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$/',
  'au-phone' => '/^(?:\\+61[ ]?|0)[2-478]([ -]?\\d){8}$/',
  'gov-id'   => '/^\\d{3}[ ]?\\d{3}[ ]?\\d{3}$/',
];

function run_stack(array $stack, array $sub) {
  foreach ($stack as $handler) {
    if ($handler === 'honeypot' && $sub['trap'] !== '') {
      return [$handler, 'discard', 'trap field populated'];
    }
    if ($handler === 'bot_score' && $sub['score'] < 50) {
      return [$handler, 'discard', 'score ' . $sub['score'] . ' below 50'];
    }
    if ($handler === 'required_email' && ($sub['values']['email'] ?? '') === '') {
      return [$handler, 'error', 'email element is empty'];
    }
    if ($handler === 'route_to_email') {
      return [$handler, 'route', 'handed to the email handler'];
    }
  }
  return ['none', 'route', 'no handler claimed it'];
}

function classify(array $values, array $patterns) {
  $found = [];
  foreach ($values as $value) {
    foreach ($patterns as $class => $regex) {
      if ($value !== '' && preg_match($regex, $value) === 1 && !in_array($class, $found, TRUE)) {
        $found[] = $class;
      }
    }
  }
  return $found;
}

function storage_rule(array $classes) {
  if (in_array('gov-id', $classes, TRUE)) {
    return 'do-not-collect';
  }
  return $classes === [] ? 'store+purge' : 'email-only';
}

echo "GovCMS webform pipeline: 4 submissions, 4 ordered handlers\\n\\n";
printf("%-4s %-15s %-8s %-28s %-22s %s\\n",
  'SUB', 'STOPPED AT', 'VERDICT', 'REASON', 'PII CLASSES', 'STORAGE RULE');

$risky = [];
foreach ($submissions as $sub) {
  [$who, $verdict, $why] = run_stack($stack, $sub);
  $classes = classify($sub['values'], $patterns);
  printf("%-4s %-15s %-8s %-28s %-22s %s\\n", $sub['id'], $who, $verdict, $why,
    $classes === [] ? '-' : implode(',', $classes), storage_rule($classes));
  foreach ($sub['values'] as $field => $value) {
    if ($value !== '' && preg_match($patterns['gov-id'], $value) === 1) {
      $risky[$field] = TRUE;
    }
  }
}

echo "\\nRule: gov-id shape present  -> do not collect without legal authority\\n";
echo "      other personal info   -> email-only (results_disabled: true)\\n";
echo "      nothing personal      -> storing is fine; still set purge_days\\n";
printf("\\nElements matching a government-identifier shape: %s\\n",
  implode(', ', array_keys($risky)));
echo "Recommendation: drop those elements, then run the form email-only.\\n";`,
    output: `GovCMS webform pipeline: 4 submissions, 4 ordered handlers

SUB  STOPPED AT      VERDICT  REASON                       PII CLASSES            STORAGE RULE
S1   honeypot        discard  trap field populated         email                  email-only
S2   bot_score       discard  score 12 below 50            email                  email-only
S3   required_email  error    email element is empty       au-phone               email-only
S4   route_to_email  route    handed to the email handler  email,au-phone,gov-id  do-not-collect

Rule: gov-id shape present  -> do not collect without legal authority
      other personal info   -> email-only (results_disabled: true)
      nothing personal      -> storing is fine; still set purge_days

Elements matching a government-identifier shape: ref
Recommendation: drop those elements, then run the form email-only.
`,
  },

  keyPoints: [
    "webform.webform.* and webform.webform_options.* are in the profile's config_ignore defaults, so forms are production database artefacts that never reach config/default, never pass through the rollout's config import, and are never seen by Shipshape's file checks.",
    "drupal/webform is vendored at 6.3.0 and sits on the managed_modules allowlist with webform_access, webform_attachment, webform_image_select, webform_node and webform_ui — it is enableable, not enabled by the profile.",
    "honeypot is a hard dependency of govcms_security, which is the profile's only dependency and a validator-required module, so it is on every GovCMS site and cannot be uninstalled; captcha, image_captcha and recaptcha are allowlisted, recaptcha_v3 is vendored but not.",
    "govcms_security sets $properties['uri_scheme'] = 'private' as the default for webform elements — a default, which an element that stored '#uri_scheme': public still beats — and a second hook strips the public option from the signature element's configuration form; the only hard block is a kernel REQUEST subscriber that rejects doc, xls, ppt and rtf uploads before any element validator runs.",
    "Email-only is a first-class Webform configuration, not a workaround: results_disabled writes no submission row, form_confidential means no recorded IP and logged-out-only submission, and purge/purge_days covers the forms that must store.",
    "Collecting personal information is one of the three published triggers — authentication, personal information, payments — for talking to GovCMS before you design anything.",
  ],

  interview: [
    {
      q: "How do you deploy a webform on GovCMS?",
      a: "You don't, in the config sense. The profile's `config_ignore.settings.yml` lists `webform.webform.*` and `webform.webform_options.*`, so form definitions are excluded from configuration deployment and live only in the database. In practice that means the form is built or edited in the production environment, and a database sync down is how it reaches a lower environment for testing. I plan for that explicitly: change notes rather than a diff, a pre-change database backup — the rollout takes one anyway in `Snapshot the database and store` — and a screenshot or an exported submission-free copy of the form as the record. The one thing I do keep in code is the surrounding config that *isn't* ignored, like `honeypot.settings`.",
    },
    {
      q: "A department wants a complaints form that captures a name, an email and an incident description. Walk me through the design conversation.",
      a: "First, before any element gets drawn, this hits a published trigger — govcms.gov.au says to talk to GovCMS early if a site collects personal information — so the platform conversation and the agency's privacy officer come before the build. GovCMS is certified to collect, store and transmit up to OFFICIAL: Sensitive, but certification is a ceiling, not authority to collect; the agency needs a legal basis, a privacy notice and usually a PIA, and GovCMS publishes a pre-filled PIA template while explicitly not reviewing or approving it. Then I'd argue for email-only: `results_disabled: true`, `form_confidential: true`, an email handler to a monitored mailbox. That removes the whole class of questions about retention, breach exposure and who can see submissions in the admin UI, and if the site has `govcms_dlm` enabled the outgoing subject line carries its marker. If the business genuinely needs submissions in the database, I fall back to `purge: completed` with a `purge_days` value the agency's records policy can defend.",
    },
    {
      q: "What spam protection do you get out of the box, and what would you add?",
      a: "Honeypot, unconditionally. It's declared as `honeypot:honeypot` in `govcms_security`'s dependencies, and `govcms_security` is the profile's sole dependency and one of the four modules the platform validators require, so it can't be uninstalled. The trap worth knowing is that all three shipped roles carry `bypass honeypot protection`, so an editor testing the form logged in will never see it fire — you test spam controls anonymously. Beyond honeypot, `captcha`, `image_captcha` and `recaptcha` are on the 73-name `managed_modules` allowlist; `recaptcha_v3` is vendored by the distribution but isn't on that list, which is exactly the kind of thing to check before you promise a client a score-based captcha.",
    },
    {
      q: "A client wants users to attach a Word document to a webform. What do you tell them?",
      a: "That the extension list on the element won't help. `govcms_security` runs a kernel `REQUEST` subscriber that inspects the uploaded filename and throws `AccessDeniedHttpException` when the extension is in `BLOCKED_EXTENSIONS`, which is `['doc', 'xls', 'ppt', 'rtf']` — that fires before Webform's own validators, and it covers API uploads as well as form posts. The workable answer is PDF or the modern OOXML extensions. Two related things I'd mention in the same breath: the platform sets the default `uri_scheme` to `private` for webform elements — a default rather than an override, which is why a second hook removes `public` from the signature element's options outright — so attachments normally land under `sites/default/files/private` and are served through Drupal rather than off disk, and `httpav` is force-enabled on every deploy, so every upload meets the antivirus endpoint regardless of element config.",
    },
  ],

  quiz: [
    {
      question:
        "Why does a webform you built in production not appear in your project's config/default directory?",
      options: [
        "Webform config entities are content entities, so they were never exportable in the first place",
        "Shipshape strips webform configuration during the platform validation task",
        "The profile's config_ignore defaults list webform.webform.* and webform.webform_options.*",
        "The module_permissions allowlist blocks webform_ui from writing configuration",
      ],
      answerIndex: 2,
      explain:
        "The GovCMS profile ships config_ignore.settings.yml in mode: simple with 'webform.webform.*' and 'webform.webform_options.*' among the ignored entities, so form definitions are deliberately excluded from configuration deployment and stay in the database. Webform entities are ordinary config entities, and Shipshape is not the mechanism: on GovCMS it reads only the exported files under config/default, because every invocation passes --exclude-db and drops the [DATABASE] checks; and no check in shipshape.yml targets webform.webform.* in either place — Shipshape never edits anything.",
    },
    {
      question: "Which statement about honeypot on a GovCMS site is correct?",
      options: [
        "It is a hard dependency of govcms_security, so it is installed on every site and cannot be uninstalled",
        "It is on the managed_modules allowlist, so a delegated site administrator can enable or disable it",
        "It is force-enabled on every deploy by PLATFORM_MODULES in govcms-enable_modules",
        "It is bundled by the distribution but not installed, like recaptcha_v3",
      ],
      answerIndex: 0,
      explain:
        "govcms_security.info.yml declares 'honeypot:honeypot' among its dependencies, and the profile depends on govcms_security, which the validators also require — so honeypot is present everywhere and Drupal refuses to uninstall it. It is not on the managed_modules allowlist and not in PLATFORM_MODULES; those are different mechanisms.",
    },
    {
      question:
        "A webform element is configured with '#uri_scheme': public and '#file_extensions': 'pdf doc'. What happens on GovCMS when a user uploads report.doc?",
      options: [
        "It uploads to the public stream because the element's explicit setting wins over the platform default",
        "Webform's element validator rejects it and shows a form error under the file field",
        "It uploads successfully to the private stream and is quarantined by httpav after the fact",
        "A kernel REQUEST subscriber in govcms_security throws AccessDeniedHttpException before element validation runs",
      ],
      answerIndex: 3,
      explain:
        "GovcmsSecurityEventsSubscriber listens on KernelEvents::REQUEST, extracts the filename from the request, and throws AccessDeniedHttpException when the extension is in BLOCKED_EXTENSIONS — ['doc', 'xls', 'ppt', 'rtf']. That happens before any Webform validator sees the submission, so the file never reaches Webform's own validator and never lands in any stream. Note what the platform did NOT do here: hook_webform_element_default_properties_alter() only changes the default uri_scheme, and getUriScheme() reads the element's stored '#uri_scheme' first — so this element really would have used the public stream had the extension been allowed. Defaults are why the signature element needs a second hook to remove 'public' from its options.",
    },
    {
      question:
        "Which Webform setting stops a submission row being written to the database at all?",
      options: [
        "form_confidential: true",
        "results_disabled: true",
        "purge: all with purge_days: 1",
        "form_disable_remote_addr: true",
      ],
      answerIndex: 1,
      explain:
        "results_disabled is the do-not-store lever: with it set, no webform_submission entity is saved, which is why email-only architectures are viable without custom code on SaaS. form_confidential suppresses the recorded IP and forces logged-out submission, form_disable_remote_addr only affects the IP, and purge deletes rows that were written in the first place.",
    },
  ],
};

export default lesson;

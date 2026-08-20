import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 6,
  slug: "procurement-and-contribute-back",
  title: "The Drupal Services Panel and Contribute-Back Economics",
  part: "Why GovCMS Exists",
  estMinutes: 13,
  summary:
    "GovCMS jobs are agency-side or panel-vendor-side because the Drupal Services Panel is how the work is bought, and the panel's own contract terms are what turn a one-agency module into a whole-of-government asset.",

  concept: `
## Why this is a technical topic

You will not sign the contract, but you will live inside it. On GovCMS the
purchasing vehicle decides who you work for, what you are allowed to build, and
who owns it afterwards. Interviewers ask about it because a developer who does
not know the panel exists will scope work the agency cannot legally buy.

## The Drupal Services Panel

The **Drupal Services Panel (DSP)** is a list of Finance-approved suppliers with
Drupal and GovCMS skills. Finance established it in October 2021; the current
arrangement was extended and operates until 30 September 2026. The published
supplier table currently lists 30 approved specialists — small digital agencies
through to large multinationals, including an Indigenous-owned company.

It now carries three service categories:

- **Category 1** — specialised skills billed as resources: Drupal developers,
  front-end developers and theme builders, solution and technical architects,
  testers, UX designers, content publishers, business analysts.
- **Category 2** — one, three and five day site-assessment workshops, plus
  predefined fixed-price service packages.
- **Category 3 (DXP)** — Digital Experience Platform and content-personalisation
  tools and services.

The exclusion is the sharp bit: the DSP **cannot** be used to procure services
for non-Drupal websites.

### Who is allowed to buy through it

The Head Agreement defines *Agency* as non-corporate Commonwealth entities,
corporate Commonwealth entities and Commonwealth companies under the PGPA Act,
**State, Territory and local government bodies**, and other organisations Finance
approves as eligible to use GovCMS — currently including some schools and
universities. That is every tier of government, which is why GovCMS work
concentrates on two sides of the table: inside an agency, or inside a panellist.

### The engagement loop

\`\`\`yaml
rfq: sent to as many panellists as you like   # GovCMS recommends 3+ quotes
prices: Products and Services Guide rates are MAXIMUMS, discounts negotiable
contract: GovCMS DSP Contract Order Form template
approval: emailed to govcms@finance.gov.au -> unique tracking number
invalid_without: the tracking number
change_order: same loop, new tracking number
admin_fee: 6% of contract value ex GST, charged to the supplier
\`\`\`

Scope is the **buyer's** responsibility, not the supplier's, not GovCMS's, not
Finance's. Finance charges suppliers 6%, which they may absorb or pass through
as a visible line item.

## The contribute-back engine

The panel's Statement of Requirements is where the economics live. On **SaaS**,
a contractor must obtain prior written approval from Finance before developing
any new modules for the distribution, and Finance may in its absolute discretion
decline them — Finance sits as Product Owner. On **PaaS** against a supported
GovCMS distribution, new or updated modules must be delivered to Finance at the
same time as to the agency, with the documentation and source and object code
Finance needs to make the module available to *all in the Drupal community*, and
under the Drupal open-source licence.

Pair that with the ownership position. Head Agreement cl 14.1 vests Intellectual
Property Rights in New Material in the Agency absolutely upon creation, unless a
Contract Order Form says otherwise. Clause 14.2 *would* grant the contractor a
licence back — but the Contract Order Form template GovCMS publishes for this
panel says, as standing text rather than an optional insert, that "clause 14.2
of the Head Agreement does not apply". So the agency pays once and takes the IP
outright, with no default licence back to the supplier, and the SOR pushes it
outward.

The distribution repo enforces the same instinct at code level: alterations to
Drupal core or a contributed module must have a drupal.org issue filed against
*that* project, and be fixed upstream and patched into GovCMS — not made against
GovCMS.

**The framing shift.** On a site you control, "we built something custom" is a
line item. On GovCMS it is a cost you have to justify, and "we contributed it
back" is the justification that survives the conversation.
`,

  comparisons: [
    {
      label: "Getting a developer under contract",
      intro:
        "You need three months of Drupal build work. On your own site you run a procurement; on GovCMS the market step has already been run for you.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Vanilla Drupal: you own the entire procurement.
approach: open approach to market
steps:
  - draft a statement of requirements
  - publish the approach to market and run the response period
  - assess supplier capability, probity and financial standing
  - evaluate responses against your own criteria
  - settle liability, indemnity and intellectual property terms
  - execute the contract yourself
prequalified_suppliers: none - anyone may respond
price_ceiling: none - whatever the market quotes
oversight: your delegate only`,
      ts: `# GovCMS: the Drupal Services Panel already ran the market step.
approach: request for quote to panellists
steps:
  - draft a statement of requirements
  - optionally seek expressions of interest to narrow the field
  - send the RFQ template to as many panellists as you choose
  - evaluate quotes (GovCMS recommends at least three)
  - complete the GovCMS DSP Contract Order Form template
  - email it to govcms@finance.gov.au and wait for a tracking number
  - countersign and return to the supplier within seven business days
prequalified_suppliers: 30 approved Drupal specialists
price_ceiling: Products and Services Guide rates are maximums
excluded: services for non-Drupal websites
admin_fee: 6% of contract value ex GST, charged to the supplier
invalid_without: the tracking number issued by Finance`,
      note: "Finance pre-ran capability, probity and terms once for every buyer — but a contract executed without the Finance tracking number is invalid, so the approval step is not optional paperwork.",
    },
    {
      label: "Where a module you paid for ends up",
      intro:
        "An agency funds a grants-finder feature. Follow the code from the developer's laptop to whoever else can use it.",
      leftLang: "bash",
      rightLang: "bash",
      php: `# Vanilla Drupal: the module lives in your repo and stops there.
mkdir -p web/modules/custom/agency_grants_finder
git add web/modules/custom/agency_grants_finder
git commit -m "feat(grants): build delivered under contract"

# Enabling it is entirely your call.
drush -y en agency_grants_finder
drush cr

# Publishing it is optional, unscheduled and nobody's obligation.
composer config repositories.agency vcs git@github.com:agency/grants-finder.git`,
      ts: `# GovCMS SaaS: get Finance's written approval BEFORE development starts.
# Finance may decline the module at its absolute discretion (SOR cl 9.2).

# The work is done as a drupal.org project, not a site-local folder.
git clone https://git.drupalcode.org/project/agency_grants_finder.git
cd agency_grants_finder && git checkout -b 1.0.x

# PaaS on a supported distribution: the module must reach Finance at the
# same time as the agency, with source, object code and documentation, so
# Finance can publish it to the whole Drupal community (SOR cl 11.2).
composer require drupal/agency_grants_finder:^1.0

# Once it is pinned in the distribution, every GovCMS site inherits it.
# Inheriting is not permission: enabling it is a separate question.
ahoy drush pm:list --filter=agency_grants_finder`,
      note: "The left column produces one module for one site. The right column produces one module for the distribution — which is exactly why Finance holds a veto over what enters it.",
    },
    {
      label: "Who owns what you paid to have written",
      intro:
        "Same deliverable, two contracts. The difference decides whether the next agency has to pay for it again.",
      leftLang: "yaml",
      rightLang: "yaml",
      php: `# Vanilla: every clause below is yours to negotiate, per contract.
contract:
  form: your own services agreement
  supplier_prequalification: done by you, for this procurement only
intellectual_property:
  new_material: whatever you negotiate - there is no default
  licence_back: whatever you negotiate
upstream_contribution:
  obligation: none
  publication: at the supplier's discretion, if at all
reuse_by_other_agencies: only if you choose to publish it`,
      ts: `# GovCMS DSP: the terms are settled before your project starts.
contract:
  form: GovCMS DSP Contract Order Form (Finance template)
  supplier_prequalification: done once, by Finance, for the whole panel
intellectual_property:
  new_material: >-
    vests in the Agency absolutely upon creation, unless the Contract
    Order Form says otherwise (Head Agreement cl 14.1)
  licence_back: >-
    none by default - the published DSP Contract Order Form template
    states as standing text that Head Agreement cl 14.2 does not apply
upstream_contribution:
  saas: prior written approval from Finance before developing new modules
  paas: >-
    new or updated modules delivered to Finance with documentation and
    source and object code, so Finance can make them available to all in
    the Drupal community, under the Drupal open-source licence
reuse_by_other_agencies: the default direction of travel, not an afterthought`,
      note: "\"IP vests in the Agency absolutely upon creation\" is the clause that makes contribute-back cheap to argue: the agency is giving away something it already owns.",
    },
    {
      label: "Solving a problem someone already funded",
      intro:
        "The agency wants a protective marker appended to the subject line of every email the site sends. Check what you inherit before you quote for building it.",
      php: `<?php

/**
 * @file
 * agency_mail_marker.module - hand-built, site-local, paid for once.
 */

/**
 * Implements hook_mail_alter().
 */
function agency_mail_marker_mail_alter(&$message) {
  $suffix = \\Drupal::config('agency_mail_marker.settings')->get('suffix');
  $message['subject'] = $message['subject'] . ' ' . $suffix;
}

// Plus: a settings form, a config schema, an install file, tests, a
// security review, and an upgrade path you now own forever.`,
      ts: `<?php

// GovCMS bundles drupal/govcms_dlm 3.0.0 - "Add optional DLM to emails
// sent from drupal mail." It is on the managed_modules allowlist but is
// not in the profile install list, so enabling it is a site decision.
//
// There is no module to write. The marker is a config value.

$config = \\Drupal::configFactory()->getEditable('govcms_dlm.settings');
$config->set('suffix', '[SEC=OFFICIAL]')->save();

// Exported to config/default/govcms_dlm.settings.yml as:
//   suffix: '[SEC=OFFICIAL]'
//
// Options are '[SEC=UNOFFICIAL]' (the shipped default), '[SEC=OFFICIAL]'
// and '[SEC=OFFICIAL:Sensitive]'. hook_mail_alter() appends the marker to
// the email SUBJECT line - it classifies nothing else on the site.`,
      note: "This is the contribute-back economy from the consuming end: the cheapest custom module is the one already sitting in the distribution because somebody else's build got pushed upstream.",
    },
  ],

  playground: {
    intro:
      "A two-part ledger. Part 1 counts the procurement steps a buying agency still performs once the Head Agreement has settled the rest. Part 2 runs four years of a twelve-agency platform where exactly one agency per year funds a module and everybody inherits it.",
    lang: "php",
    code: `<?php

// -------------------------------------------------------------------------
// PART 1. The rule: a step disappears when the Head Agreement settles it
// once, for every buyer, before any particular project exists.
// -------------------------------------------------------------------------

// [step label, settled once at panel level?]
$steps = [
  ['Define the statement of requirements', false],
  ['Advertise to the open market', true],
  ['Run the open response period', true],
  ['Assess capability, probity, tax record', true],
  ['Settle liability and indemnity terms', true],
  ['Settle intellectual property terms', true],
  ['Approach suppliers for a quote', false],
  ['Assess value for money', false],
  ['Execute the contract', false],
];

printf("PART 1  Steps the buying agency still performs itself\\n");
printf("%-42s  %-8s  %-6s\\n", 'Step', 'Open ATM', 'Panel');

$openCount = 0;
$panelCount = 0;
foreach ($steps as [$label, $settled]) {
  $openCount++;
  if (!$settled) {
    $panelCount++;
  }
  printf("%-42s  %-8s  %-6s\\n", $label, 'yes', $settled ? '-' : 'yes');
}

// One step exists only on the panel path, and skipping it voids the contract.
$panelCount++;
printf("%-42s  %-8s  %-6s\\n", 'Get a tracking number from Finance', '-', 'yes');
printf("TOTAL buyer steps: open ATM %d, panel %d\\n\\n", $openCount, $panelCount);

// -------------------------------------------------------------------------
// PART 2. The rule: for any (module, agency) pair the agency either FUNDS
// the build or INHERITS it. Never both, and never nobody.
// -------------------------------------------------------------------------

$agencies = [];
for ($i = 1; $i <= 12; $i++) {
  $agencies[] = sprintf('AG%02d', $i);
}

$modules = ['grants_finder', 'consultation_hub', 'annual_report', 'service_locator'];

$paidFor = array_fill_keys($agencies, 0);
$available = array_fill_keys($agencies, 0);
$builds = 0;
$avoided = 0;

printf("PART 2  One agency funds, every agency inherits\\n");
printf("%-5s  %-17s  %-7s  %-9s  %s\\n", 'Year', 'Module', 'Funder', 'Inherits', 'Cumulative');

foreach ($modules as $y => $module) {
  $funder = $agencies[$y];
  $builds++;
  $paidFor[$funder]++;
  $inherits = 0;
  foreach ($agencies as $agency) {
    $role = ($agency === $funder) ? 'funds' : 'inherits';
    $available[$agency]++;
    if ($role === 'inherits') {
      $inherits++;
      $avoided++;
    }
  }
  printf("%-5s  %-17s  %-7s  %-9d  %d\\n", 'Y' . ($y + 1), $module, $funder, $inherits, $y + 1);
}

printf("\\nLEDGER after %d years\\n", count($modules));
printf("%-8s  %-16s  %-17s\\n", 'Agency', 'Modules paid', 'Modules available');
foreach ($agencies as $agency) {
  printf("%-8s  %-16d  %-17d\\n", $agency, $paidFor[$agency], $available[$agency]);
}

printf("\\nBuilds performed : %d\\n", $builds);
printf("Rebuilds avoided : %d\\n", $avoided);
printf("Agency-modules delivered per build: %s\\n", number_format(array_sum($available) / $builds, 2));
printf("CAVEAT: availability is not permission. Finance decides what enters the\\n");
printf("distribution; the managed_modules allowlist decides what a site may enable.\\n");`,
    output: `PART 1  Steps the buying agency still performs itself
Step                                        Open ATM  Panel 
Define the statement of requirements        yes       yes   
Advertise to the open market                yes       -     
Run the open response period                yes       -     
Assess capability, probity, tax record      yes       -     
Settle liability and indemnity terms        yes       -     
Settle intellectual property terms          yes       -     
Approach suppliers for a quote              yes       yes   
Assess value for money                      yes       yes   
Execute the contract                        yes       yes   
Get a tracking number from Finance          -         yes   
TOTAL buyer steps: open ATM 9, panel 5

PART 2  One agency funds, every agency inherits
Year   Module             Funder   Inherits   Cumulative
Y1     grants_finder      AG01     11         1
Y2     consultation_hub   AG02     11         2
Y3     annual_report      AG03     11         3
Y4     service_locator    AG04     11         4

LEDGER after 4 years
Agency    Modules paid      Modules available
AG01      1                 4                
AG02      1                 4                
AG03      1                 4                
AG04      1                 4                
AG05      0                 4                
AG06      0                 4                
AG07      0                 4                
AG08      0                 4                
AG09      0                 4                
AG10      0                 4                
AG11      0                 4                
AG12      0                 4                

Builds performed : 4
Rebuilds avoided : 44
Agency-modules delivered per build: 12.00
CAVEAT: availability is not permission. Finance decides what enters the
distribution; the managed_modules allowlist decides what a site may enable.
`,
  },

  keyPoints: [
    "The Drupal Services Panel is a Finance-established list of approved Drupal/GovCMS suppliers, running since October 2021 and extended to operate until 30 September 2026, with 30 approved specialists currently listed and three service categories (skills, fixed-price packages and site assessments, and DXP).",
    "The Head Agreement's definition of Agency covers Commonwealth entities and companies under the PGPA Act, State, Territory and local government bodies, and other Finance-approved government-funded entities including some schools and universities — every tier of government can buy through it.",
    "The engagement loop is RFQ template, at least three quotes recommended, Contract Order Form, then email to govcms@finance.gov.au: without the tracking number Finance issues, the contract or change order is invalid.",
    "Prices in the Products and Services Guide are maximums, not fixed rates; discounts are negotiable per contract; and Finance charges suppliers a 6% administration fee that may be absorbed or passed through as a separate line item.",
    "On SaaS a contractor needs Finance's prior written approval before developing new modules for the distribution, and Finance may decline at its absolute discretion; on PaaS against a supported distribution, new or updated modules must reach Finance with the source, object code and documentation needed to publish them to the whole Drupal community.",
    "Head Agreement cl 14.1 vests Intellectual Property Rights in New Material in the Agency absolutely on creation, unless a Contract Order Form says otherwise — and the published GovCMS DSP Contract Order Form template switches cl 14.2 off as standing text, so there is no default licence back to the contractor, which is why contributing back costs the agency nothing it did not already own.",
  ],

  interview: [
    {
      q: "What is the Drupal Services Panel, and why would a GovCMS interviewer care whether you know about it?",
      a: "It is a panel of Finance-approved suppliers with Drupal and GovCMS skills, established in October 2021 and extended to run until 30 September 2026, currently listing 30 specialists across three categories: named skill sets billed as resources, fixed-price packages and site-assessment workshops, and a DXP category. It matters because it is the vehicle most GovCMS work is bought through, so almost every GovCMS role sits either inside a buying agency or inside a panellist. It also constrains scope — the panel explicitly cannot be used to procure services for non-Drupal websites, so a proposal that quietly includes a non-Drupal microsite has to be split off into a different procurement. The detail that shows you have actually been through it is the tracking number: the completed Contract Order Form goes to `govcms@finance.gov.au`, and a contract or change order without the number Finance returns is invalid, which means a project that starts work on a handshake has no contract at all.",
    },
    {
      q: "An agency on GovCMS SaaS wants a bespoke module. Walk me through what you tell them.",
      a: "First I check whether the distribution already solves it — the answer is often yes, and the cheapest custom module is the one you do not write. If it genuinely does not exist, the SaaS path is not \"build it and deploy it\": the panel's Statement of Requirements requires the contractor to obtain Finance's prior written approval before developing any new module for the distribution, and Finance may decline at its absolute discretion, sitting as Product Owner. So the conversation with Finance happens before the estimate, not after the build. I would also check whether the requirement can be met in the theme instead, because the theme is the code extension point that does not need anyone's approval. And I would be explicit with the agency that even if the module ships in the distribution, enabling it on their site is a separate question governed by the platform's module allowlist.",
    },
    {
      q: "Who owns code written for an agency under the panel, and what does that mean for contributing it upstream?",
      a: "Unless a Contract Order Form says otherwise, Head Agreement cl 14.1 vests Intellectual Property Rights in New Material in the Agency absolutely upon creation. Clause 14.2 would then grant the contractor an irrevocable, non-exclusive, world-wide, paid-up licence back for its own purposes — but I would not recite that as the panel position, because the Contract Order Form template GovCMS publishes for the DSP carries as standing text, not as an optional insert, that IP in New Material vests in the Agency absolutely on creation and that cl 14.2 of the Head Agreement does not apply. Since cl 14.1 is expressly subject to what the Contract Order Form says, the agency ends up owning the IP with no default licence back to the supplier. That is what makes the contribute-back conversation easy: the agency is publishing something it already owns, not surrendering a supplier's asset. On PaaS against a supported GovCMS distribution the SOR goes further and requires new or updated modules to be delivered to Finance at the same time as to the agency, with documentation and source and object code, specifically so Finance can make them available to all in the Drupal community under the Drupal open-source licence. In practice I still read the executed Contract Order Form rather than quoting the Head Agreement from memory, because the Contract Order Form is the document that decides the IP position for that particular contract.",
    },
    {
      q: "How do you justify custom development to a GovCMS budget holder who has been told the platform means they do not need developers?",
      a: "I reframe it from spend to amortisation. On a self-hosted site, custom work is a permanent liability for one agency — you own the security review, the upgrade path and the rebuild at the next major version. On GovCMS, work that lands in the distribution or on drupal.org is paid for once and inherited by every other agency on the platform, so the same dollar buys a whole-of-government capability instead of one site's feature. That is the sentence that survives an executive conversation: not \"we built something custom\", but \"we funded something the platform now carries\". I would also be honest about the limit — Finance decides what enters the distribution, so the amortisation argument is a reason to start the conversation with Finance early, not a guarantee of the outcome.",
    },
  ],

  quiz: [
    {
      question:
        "An agency has agreed scope and price with a panellist and both parties have signed the Contract Order Form. What still has to happen before the contract is valid?",
      options: [
        "The agency must publish a contract notice on AusTender before work starts.",
        "The completed form must go to govcms@finance.gov.au, which returns a unique tracking number.",
        "The GovCMS Service Desk must raise a change ticket against the agency's site.",
        "The supplier must lodge the 6% administration fee with Finance up front.",
      ],
      answerIndex: 1,
      explain:
        "GovCMS states that the contract is sent to govcms@finance.gov.au so the team can confirm it complies with the Panel Head Agreement, and that is when the unique tracking number is issued. Any contract without that number is invalid, and change orders go through the same loop. The 6% administration fee is real, but it is charged to the supplier on the contract value and is not a precondition of validity.",
    },
    {
      question:
        "Under the panel's Statement of Requirements, what must a contractor do before developing a new module for the GovCMS distribution for a SaaS site?",
      options: [
        "File a drupal.org issue and wait for a core committer to triage it.",
        "Run the module through Shipshape and attach the passing report to the work order.",
        "Obtain prior written approval from Finance, which may decline at its absolute discretion.",
        "Register the module on the managed_modules allowlist before the first commit.",
      ],
      answerIndex: 2,
      explain:
        "The SOR requires the contractor to obtain prior written approval from Finance before developing any new modules for the GovCMS distribution for inclusion on the SaaS platform, and states Finance may in its absolute discretion decide not to accept new or updated modules. Finance is named as Product Owner for SaaS development. The allowlist and the validators govern what a site may enable later — they are not the approval gate for creating the module.",
    },
    {
      question:
        "Which organisations can engage suppliers through the Drupal Services Panel?",
      options: [
        "Non-corporate Commonwealth entities only, since the panel sits under the PGPA Act.",
        "Commonwealth entities and State and Territory bodies, but not local government.",
        "Any organisation that already holds a GovCMS SaaS subscription.",
        "Commonwealth entities and companies, State, Territory and local government bodies, and other Finance-approved government-funded entities such as some schools and universities.",
      ],
      answerIndex: 3,
      explain:
        "The Head Agreement's definition of Agency lists non-corporate Commonwealth entities, corporate Commonwealth entities and Commonwealth companies under the PGPA Act, State, Territory and local government bodies, and other organisations Finance approves as eligible to use GovCMS, currently including some schools and universities. Holding a GovCMS subscription is not the test — the panel is a procurement vehicle, and GovCMS advises non-customers planning to host with it to make contact before scoping.",
    },
    {
      question:
        "The GovCMS distribution repo says alterations to Drupal core or a contributed module must be handled how?",
      options: [
        "By filing a drupal.org issue against that project, fixing it there, and patching the result into GovCMS rather than modifying GovCMS directly.",
        "By committing the change into the distribution's own src/ directory and referencing the upstream issue in the commit message.",
        "By adding a patch file under the project's web/modules/custom directory so it deploys with the site.",
        "By raising a Service Desk ticket so the GovCMS Ops team can apply the change on the agency's behalf.",
      ],
      answerIndex: 0,
      explain:
        "The distribution's README requires any alteration to Drupal core or a contributed module to have an associated drupal.org issue filed against that project, with modifications made to the project in question and patched into GovCMS rather than made against GovCMS. That rule is the code-level expression of the same contribute-back economics as the panel's contract terms: the fix belongs upstream, where every Drupal site benefits, not in a fork only GovCMS carries.",
    },
  ],
};

export default lesson;

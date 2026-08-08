import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 29,
  slug: "testing-phpunit",
  title: "Testing: Kernel/Functional Tests vs WebTestCase",
  part: "Rendering, Config & Shipping",
  estMinutes: 13,
  summary:
    "Map Symfony's KernelTestCase and WebTestCase onto Drupal's four-tier test ladder — UnitTestCase, KernelTestBase, BrowserTestBase, and WebDriverTestBase — including how you boot modules, create a node, and assert.",

  concept: `
Symfony gives you roughly two integration test bases: \`KernelTestCase\` (boots
the kernel/container, no HTTP) and \`WebTestCase\` (adds a BrowserKit \`$client\`
that sends requests through the kernel). Plain unit tests just extend PHPUnit's
\`TestCase\`. Drupal has the **same spectrum**, but as *four* explicit base
classes, each booting strictly more of the system — you pick the cheapest one
that still exercises what you need.

### The four tiers (cheapest to fullest)

- **\`Drupal\\Tests\\UnitTestCase\`** — pure PHPUnit, no container, no database.
  The equivalent of a Symfony test extending \`TestCase\`. You mock every
  dependency yourself. Milliseconds; use for algorithm-ish service logic.
- **\`Drupal\\KernelTests\\KernelTestBase\`** — the analogue of Symfony's
  \`KernelTestCase\`. It boots a **minimal** container and a **real (SQLite)
  test database**, but installs *only* the modules you list. Fast enough for
  hundreds of tests, real enough to save an entity.
- **\`Drupal\\Tests\\BrowserTestBase\`** — the analogue of \`WebTestCase\`. It
  installs a **full Drupal site** in an isolated DB prefix and drives it through
  a Mink session (a BrowserKit-like \`$this->drupalGet()\` / clicking / form
  submission). No JavaScript — the page is fetched server-side.
- **\`Drupal\\FunctionalJavascriptTests\\WebDriverTestBase\`** — like
  \`BrowserTestBase\` but through a **real headless Chrome** via WebDriver, so
  AJAX and JS run. Symfony's rough equivalent is Panther.

### Booting modules — the key difference

In Symfony the kernel loads whatever bundles \`registerBundles()\` returns. In
Drupal a test declares a \`protected static array $modules\` property, and the
base class enables exactly those. In a **kernel** test you must *also* explicitly
install the pieces of schema/config you touch — there is no full site install
happening for you:

- \`$this->installEntitySchema('node')\` — create that entity type's DB tables.
- \`$this->installConfig(['node', 'field'])\` — import a module's default config.
- \`$this->installSchema(...)\` — legacy key/value or other non-entity tables.

A **functional** (\`BrowserTestBase\`) test skips all that: listing the module in
\`$modules\` triggers the real installer, exactly like \`drush en\`.

### Assertions

Unit and kernel tests use plain PHPUnit assertions (\`assertSame\`,
\`assertEquals\`). Functional tests add a **WebAssert** object via
\`$this->assertSession()\`, the counterpart to Symfony's crawler assertions:
\`assertSession()->statusCodeEquals(200)\`,
\`assertSession()->pageTextContains('Hello')\`,
\`assertSession()->addressEquals('/node/1')\`.

### Running them

Drupal ships a PHPUnit config at **\`core/phpunit.xml.dist\`** — copy it to
\`core/phpunit.xml\`, set the \`SIMPLETEST_DB\` and \`SIMPLETEST_BASE_URL\` env
vars, then run \`vendor/bin/phpunit -c core/phpunit.xml <path>\`. Test files live
under \`modules/custom/<name>/tests/src/{Unit,Kernel,Functional,FunctionalJavascript}\`
and are namespaced \`Drupal\\Tests\\<module>\\<Type>\`. Drupal 10/11 are identical
here; both run PHPUnit 9/10-era APIs.
`,

  comparisons: [
    {
      label: "Container test: KernelTestCase vs KernelTestBase",
      intro:
        "Boot just enough of the framework to test a service that talks to real infrastructure. Symfony pulls the service from the test container; Drupal boots a minimal kernel and installs the schema it needs first.",
      php: `<?php
// Symfony 6.4 / 7 — extend KernelTestCase, grab a real service.
use Symfony\\Bundle\\FrameworkBundle\\Test\\KernelTestCase;

class GreetingServiceTest extends KernelTestCase
{
    public function testGreets(): void
    {
        self::bootKernel();
        $container = static::getContainer();

        $svc = $container->get(GreetingService::class);
        self::assertSame('Hi Ada', $svc->greet('Ada'));
    }
}`,
      ts: `<?php
// Drupal 10 / 11 — extend KernelTestBase; declare modules + schema.
namespace Drupal\\Tests\\my_module\\Kernel;

use Drupal\\KernelTests\\KernelTestBase;
use Drupal\\node\\Entity\\Node;

class NodeCreateTest extends KernelTestBase {

  protected static $modules = ['system', 'user', 'node', 'field'];

  protected function setUp(): void {
    parent::setUp();
    // No full install runs — wire up only what we touch.
    $this->installEntitySchema('user');
    $this->installEntitySchema('node');
    // node_access is a plain hook_schema table, not created by installEntitySchema();
    // saving a node acquires grants and writes to it, so install it explicitly.
    $this->installSchema('node', ['node_access']);
    $this->installConfig(['node', 'field']);
  }

  public function testSaveNode(): void {
    $node = Node::create(['type' => 'page', 'title' => 'Hi Ada']);
    $node->save();
    $this->assertNotNull($node->id());        // got a real DB id
    $this->assertSame('Hi Ada', $node->label());
  }
}`,
      note: "KernelTestBase ~ KernelTestCase, but you must installEntitySchema()/installConfig() by hand — the minimal kernel installs nothing you didn't ask for.",
    },
    {
      label: "Functional test: WebTestCase vs BrowserTestBase",
      intro:
        "Drive a full site over HTTP and assert on the rendered page. Symfony's BrowserKit client and Drupal's Mink session are near-identical in spirit.",
      php: `<?php
// Symfony — WebTestCase gives a BrowserKit client.
use Symfony\\Bundle\\FrameworkBundle\\Test\\WebTestCase;

class HomePageTest extends WebTestCase
{
    public function testHomepage(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/');

        self::assertResponseIsSuccessful();     // 2xx
        self::assertSelectorTextContains('h1', 'Welcome');
    }
}`,
      ts: `<?php
// Drupal — BrowserTestBase installs a real site and drives Mink.
namespace Drupal\\Tests\\my_module\\Functional;

use Drupal\\Tests\\BrowserTestBase;

class HomePageTest extends BrowserTestBase {

  protected static $modules = ['node', 'my_module'];
  protected $defaultTheme = 'stark';           // required in D10/11

  public function testHomepage(): void {
    $this->drupalGet('<front>');               // like $client->request('GET', '/')

    $assert = $this->assertSession();
    $assert->statusCodeEquals(200);            // ~ assertResponseIsSuccessful()
    $assert->pageTextContains('Welcome');      // ~ assertSelectorTextContains()
  }
}`,
      note: "BrowserTestBase ~ WebTestCase. Listing a module in $modules runs the real installer (like drush en); $defaultTheme is mandatory on modern Drupal.",
    },
    {
      label: "Logging in + creating content in the test",
      intro:
        "Functional tests routinely need a privileged user and some content. Symfony builds fixtures / logs in via the client; Drupal ships helper methods on the base class.",
      php: `<?php
// Symfony — create a user (fixtures/factory) and log the client in.
$user = UserFactory::createOne(['roles' => ['ROLE_ADMIN']]);
$client->loginUser($user->object());

$client->request('GET', '/admin/dashboard');
self::assertResponseIsSuccessful();`,
      ts: `<?php
// Drupal — base-class helpers create users, roles, nodes, content types.
$admin = $this->drupalCreateUser(['access administration pages']);
$this->drupalLogin($admin);

// Create a content type + a node of it, no UI clicking required.
$this->drupalCreateContentType(['type' => 'article', 'name' => 'Article']);
$node = $this->drupalCreateNode([
  'type'  => 'article',
  'title' => 'My first article',
]);

$this->drupalGet('/node/' . $node->id());
$this->assertSession()->pageTextContains('My first article');`,
      note: "drupalCreateUser/drupalLogin/drupalCreateNode/drupalCreateContentType are the fixture toolkit — the moral equivalent of a Symfony factory plus $client->loginUser().",
    },
    {
      label: "Running the suite",
      intro:
        "Both use PHPUnit under the hood. Symfony reads its root phpunit.xml.dist; Drupal ships one under core/ and needs a test DB + base URL in the environment.",
      php: `# Symfony — config auto-discovered at the project root.
vendor/bin/phpunit
vendor/bin/phpunit tests/Controller/HomePageTest.php
vendor/bin/phpunit --filter testHomepage`,
      ts: `# Drupal — copy core/phpunit.xml.dist -> core/phpunit.xml, set env, run.
export SIMPLETEST_DB="sqlite://localhost/sites/default/files/test.sqlite"
export SIMPLETEST_BASE_URL="http://localhost"
export BROWSERTEST_OUTPUT_DIRECTORY="/tmp"

# Point -c at Drupal's config; pass a path or a testsuite.
vendor/bin/phpunit -c core/phpunit.xml \\
  web/modules/custom/my_module/tests/src/Kernel/NodeCreateTest.php`,
      leftLang: "bash",
      rightLang: "bash",
      note: "Kernel/unit tests just need SIMPLETEST_DB; functional (BrowserTestBase) tests also need SIMPLETEST_BASE_URL to install and reach a real site.",
    },
  ],

  playground: {
    intro:
      "The defining trait of Drupal's ladder is that each tier boots strictly more of the system, and a kernel test only has the modules/schema you explicitly install. This pure-PHP model simulates a kernel test's setUp(): it 'enables' modules, 'installs' entity schema, then a save() that FAILS if the schema was never installed — exactly the class of error you hit when you forget installEntitySchema().",
    lang: "php",
    code: `<?php
// Minimal stand-in for a KernelTestBase environment.
class TestKernel {
  public array $modules = [];      // like protected static $modules
  public array $schema  = [];      // tables installed via installEntitySchema()

  function enable(array $modules): void {
    foreach ($modules as $m) { $this->modules[] = $m; }
  }
  function installEntitySchema(string $type): void {
    // In a real test this creates the entity's DB tables.
    $this->schema[$type] = [];
  }
  function saveNode(string $title): int {
    if (!in_array('node', $this->modules, true)) {
      throw new RuntimeException('node module not enabled');
    }
    if (!isset($this->schema['node'])) {
      // The classic kernel-test mistake: schema was never installed.
      throw new RuntimeException('no schema for node — call installEntitySchema()');
    }
    $this->schema['node'][] = $title;
    return count($this->schema['node']);   // fake auto-increment id
  }
}

// ---- setUp(): boot only what we declared ----
$kernel = new TestKernel();
$kernel->enable(['system', 'user', 'node', 'field']);
$kernel->installEntitySchema('user');
$kernel->installEntitySchema('node');

// ---- the test body ----
$id = $kernel->saveNode('Hi Ada');
echo "saved node id: {$id}\\n";
echo 'enabled modules: ', implode(', ', $kernel->modules), "\\n";

// Now show what happens WITHOUT installEntitySchema():
$bare = new TestKernel();
$bare->enable(['node']);
try {
  $bare->saveNode('boom');
} catch (RuntimeException $e) {
  echo 'error: ', $e->getMessage(), "\\n";
}`,
    output: `saved node id: 1
enabled modules: system, user, node, field
error: no schema for node — call installEntitySchema()`,
  },

  keyPoints: [
    "Drupal has four test bases in a cost ladder: UnitTestCase (pure PHPUnit) < KernelTestBase (minimal container + test DB) < BrowserTestBase (full site over Mink) < WebDriverTestBase (real Chrome/JS).",
    "Map to Symfony: KernelTestBase ~ KernelTestCase, BrowserTestBase ~ WebTestCase, WebDriverTestBase ~ Panther, UnitTestCase ~ plain PHPUnit TestCase.",
    "Enabled modules come from the protected static $modules property (Drupal's answer to registerBundles); the base class enables exactly those.",
    "Kernel tests install nothing implicitly: call installEntitySchema(), installConfig(), and installSchema() in setUp() for anything you touch. Functional tests run the real installer instead.",
    "Functional tests assert via $this->assertSession() (WebAssert): statusCodeEquals, pageTextContains, addressEquals — plus fixture helpers drupalCreateUser/drupalLogin/drupalCreateNode/drupalCreateContentType.",
    "Run with vendor/bin/phpunit -c core/phpunit.xml; set SIMPLETEST_DB (all tiers) and SIMPLETEST_BASE_URL (functional). Drupal 10 and 11 behave the same here.",
  ],

  interview: [
    {
      q: "A Symfony dev knows KernelTestCase and WebTestCase. How do Drupal's test base classes map onto those, and when would you reach for each?",
      a: "Drupal splits the spectrum into four explicit bases. \`UnitTestCase\` is plain PHPUnit with no container — use it for pure logic you can fully mock. \`KernelTestBase\` is the direct analogue of \`KernelTestCase\`: it boots a **minimal** container plus a real test database but only the modules you list, so it's the workhorse for anything touching entities, services, or config without needing HTTP. \`BrowserTestBase\` mirrors \`WebTestCase\` — it installs a **full site** and drives it through a Mink session (\`drupalGet()\`, form submits, \`assertSession()\`), but with no JavaScript. \`WebDriverTestBase\` is \`BrowserTestBase\` through real headless Chrome, the equivalent of Symfony Panther, for AJAX/JS. Pick the cheapest tier that still exercises the behaviour: kernel over functional whenever you can, because functional installs a whole site per test and is an order of magnitude slower.",
    },
    {
      q: "In a KernelTestBase test you call $node->save() and get a database error about a missing table. What did you forget, and why doesn't this happen in a functional test?",
      a: "A kernel test boots a **minimal** environment — it enables the modules in \`protected static $modules\` but does **not** run the site installer, so no entity tables or default config exist yet. You forgot to install the schema in \`setUp()\`: you need \`$this->installEntitySchema('node')\` (and usually \`'user'\`) to create the tables, plus \`$this->installConfig(['node', 'field'])\` to import the field/type config the entity relies on. In a \`BrowserTestBase\` test this never comes up because listing \`node\` in \`$modules\` triggers the real installer — exactly like \`drush en node\` — which creates all of that for you. That trade is the whole point: kernel tests are fast precisely because they install nothing you didn't explicitly ask for.",
    },
    {
      q: "How do you actually run Drupal's PHPUnit tests, and how is that different from a stock Symfony project?",
      a: "Symfony auto-discovers a \`phpunit.xml.dist\` at the project root, so \`vendor/bin/phpunit\` just works. Drupal ships its config under \`core/phpunit.xml.dist\`; you copy it to \`core/phpunit.xml\` and run \`vendor/bin/phpunit -c core/phpunit.xml <path>\`. Crucially you must supply environment variables first: \`SIMPLETEST_DB\` (a DB connection string — SQLite is fine for local/CI) for kernel and functional tests, and \`SIMPLETEST_BASE_URL\` plus \`BROWSERTEST_OUTPUT_DIRECTORY\` for functional/JS tests since they install and hit a live URL. Tests live under \`modules/custom/<name>/tests/src/{Unit,Kernel,Functional,FunctionalJavascript}\` and are namespaced \`Drupal\\Tests\\<module>\\<Type>\`, which is how the base class knows which tier to boot.",
    },
  ],

  quiz: [
    {
      question:
        "Which Drupal base class is the closest analogue of Symfony's WebTestCase?",
      options: [
        "UnitTestCase",
        "KernelTestBase",
        "BrowserTestBase",
        "EntityKernelTestBase",
      ],
      answerIndex: 2,
      explain:
        "BrowserTestBase installs a full site and drives it over HTTP through a Mink session (drupalGet, form submission, assertSession) — the same role WebTestCase's BrowserKit client plays. KernelTestBase maps to KernelTestCase (container + DB, no HTTP).",
    },
    {
      question:
        "In a KernelTestBase test, why must you call $this->installEntitySchema('node') in setUp()?",
      options: [
        "Because BrowserTestBase requires it too, for consistency",
        "Because a kernel test boots a minimal environment and does not run the site installer, so entity tables don't exist yet",
        "Because installEntitySchema is what enables the node module",
        "Because it logs the test user in as an administrator",
      ],
      answerIndex: 1,
      explain:
        "KernelTestBase only enables the modules in $modules; it does not run the full installer. You must explicitly install the schema (installEntitySchema), config (installConfig), and any legacy tables (installSchema) for anything the test touches. Functional tests skip this because they run the real installer.",
    },
    {
      question:
        "How do you assert that a functional (BrowserTestBase) test's response returned HTTP 200 and the page shows 'Welcome'?",
      options: [
        "self::assertResponseIsSuccessful(); self::assertSelectorTextContains('h1', 'Welcome');",
        "$this->assertSession()->statusCodeEquals(200); $this->assertSession()->pageTextContains('Welcome');",
        "$this->assertEquals(200, $node->id()); $this->assertContains('Welcome', $node);",
        "$this->installConfig(['system']); $this->assertTrue(true);",
      ],
      answerIndex: 1,
      explain:
        "Functional tests use the WebAssert object from $this->assertSession(): statusCodeEquals(200) checks the response code and pageTextContains('Welcome') checks the rendered body. The assertResponseIsSuccessful/assertSelectorTextContains form is Symfony's WebTestCase API.",
    },
  ],
};

export default lesson;

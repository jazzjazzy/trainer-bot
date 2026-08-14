import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 3,
  slug: "jsx-and-tsx",
  title: "JSX and TSX: Templates That Are Code",
  part: "Thinking in React",
  estMinutes: 11,
  summary:
    "JSX looks like a template but compiles to function calls — {} embeds real TypeScript expressions, output is auto-escaped, and the type checker reads your markup.",

  concept: `
JSX looks like HTML pasted into JavaScript, which triggers two decades of
"never mix logic and markup" alarm bells. Hold that thought: JSX is **not a
template language**. Each tag compiles to a plain function call that returns a
lightweight object describing an element:

\`\`\`tsx
const el = <h1 className="hero">Hi</h1>;
// compiles to roughly:
// const el = jsx('h1', { className: 'hero', children: 'Hi' });
\`\`\`

That object (a "React element") is a **value**. You can store it in a
variable, put it in an array, pass it to a function, return it. There is no
separate template file, no template syntax to learn beyond \`{}\` — and
because it's all TypeScript, the compiler type-checks your markup like any
other code. A \`.tsx\` file is just a \`.ts\` file where this syntax is enabled.

### \`{expression}\` is \`<?= ?>\` without the escaping chores

Inside JSX, curly braces embed **any TypeScript expression** — variables,
function calls, ternaries, \`.map()\` chains:

\`\`\`tsx
<p>{user.name} joined {formatDate(user.joined)} — {posts.length} posts</p>
\`\`\`

The PHP reflex here is \`<?= htmlspecialchars($user->name) ?>\` — and forgetting
\`htmlspecialchars\` once is an XSS hole. React inverts the default: **every
value rendered through \`{}\` is escaped automatically.** If \`user.name\` is
\`<script>alert(1)</script>\`, the user sees that literal text; nothing
executes. The escape hatch even shames you by name:
\`dangerouslySetInnerHTML\` — the moral equivalent of echoing raw input.

Note what \`{}\` takes: an **expression**, not a statement. \`{x ? a : b}\` is
fine; \`{if (x) ...}\` is a syntax error. That constraint shapes how
conditionals and loops look in JSX (next sections).

### The attribute differences you'll hit on day one

JSX attributes are camelCase JavaScript properties, not HTML attributes:

- \`class\` → \`className\`, \`for\` → \`htmlFor\` (both are reserved words in JS)
- \`onclick\` → \`onClick\`, \`tabindex\` → \`tabIndex\`
- \`style\` takes an **object**, not a string: \`style={{ color: 'red' }}\`
  — the outer braces say "expression", the inner ones are an object literal
- Attribute values: strings in quotes (\`type="text"\`), everything else in
  braces (\`disabled={isSaving}\`, \`value={count}\`)

TypeScript knows the full attribute schema per tag: \`<img src={123}>\` is a
type error (\`src\` must be a string), \`onClick\` on a \`<div>\` gets a typed
mouse event, and a typo like \`clasName\` is a compile error.

### One root, or a Fragment

A component returns **one** element — a function has one return value. When
you need siblings without inventing a wrapper \`<div>\`, use a *fragment*:

\`\`\`tsx
return (
  <>
    <dt>{term}</dt>
    <dd>{definition}</dd>
  </>
);
\`\`\`

\`<>...</>\` groups children but renders **no DOM element at all** — the
\`<dt>\`/\`<dd>\` land directly inside whatever \`<dl>\` renders this component.

### JSX is a value — use that

Because elements are values, "template logic" is ordinary code:

\`\`\`tsx
const banner = isTrial ? <TrialBanner daysLeft={days} /> : null;
return <main>{banner}<Dashboard /></main>;
\`\`\`

No \`{% block %}\`, no template inheritance — composition of values, checked
end-to-end by the compiler.
`,

  comparisons: [
    {
      label: "A profile card: escaping and loops",
      intro:
        "Render a user's name (untrusted input!) and their skill list. PHP escapes manually and loops with foreach; TSX escapes automatically and loops with an expression.",
      php: `<?php // profile.php ?>
<div class="profile">
  <h2><?= htmlspecialchars($user['name']) ?></h2>
  <!-- forget htmlspecialchars ONCE and it's an XSS hole -->
  <ul>
    <?php foreach ($user['skills'] as $skill): ?>
      <li><?= htmlspecialchars($skill) ?></li>
    <?php endforeach; ?>
  </ul>
</div>`,
      ts: `// Profile.tsx
interface User {
  name: string;
  skills: string[];
}

function Profile({ user }: { user: User }) {
  return (
    <div className="profile">
      <h2>{user.name}</h2> {/* escaped automatically */}
      <ul>
        {user.skills.map((skill) => (
          <li key={skill}>{skill}</li>
        ))}
      </ul>
    </div>
  );
}`,
      note:
        "React escapes every {} interpolation by default — the discipline PHP demands of you on every echo is the framework's job here; raw HTML requires opting in via dangerouslySetInnerHTML.",
    },
    {
      label: "Building markup from data in the browser",
      intro:
        "Produce a list of links from an array, client-side. Vanilla JS concatenates an HTML string and hands it to innerHTML; JSX builds structured, type-checked elements.",
      php: `// nav.js — stringly-typed markup
const links = [
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
];

let html = '<nav><ul>';
for (const l of links) {
  // No escaping, no structure checks — a '<' in l.label
  // becomes live HTML; a missing </li> is silently broken.
  html += '<li><a href="' + l.href + '">' + l.label + '</a></li>';
}
html += '</ul></nav>';
document.querySelector('#nav').innerHTML = html;`,
      ts: `// Nav.tsx — structured, escaped, type-checked
interface NavLink {
  href: string;
  label: string;
}

function Nav({ links }: { links: NavLink[] }) {
  return (
    <nav>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href}>{l.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}`,
      note:
        "innerHTML string-building is unescaped and structurally unchecked; JSX is parsed at compile time — unclosed tags are syntax errors, labels are escaped, and `hrefs` is a typo TypeScript catches.",
      leftLang: "js",
    },
    {
      label: "Attributes: strings vs typed properties",
      intro:
        "A styled, conditionally-disabled button. PHP interpolates strings into attributes; JSX assigns typed values to camelCase properties.",
      php: `<?php // button.php
$disabled = $saving ? 'disabled' : '';
$style    = 'color: ' . $theme_color . '; padding: 8px';
?>
<button class="btn primary" <?= $disabled ?>
        style="<?= $style ?>" onclick="save()">
  Save
</button>`,
      ts: `// SaveButton.tsx
function SaveButton({ saving, themeColor }: {
  saving: boolean;
  themeColor: string;
}) {
  return (
    <button
      className="btn primary"
      disabled={saving}
      style={{ color: themeColor, padding: 8 }}
      onClick={save}
    >
      Save
    </button>
  );
}`,
      note:
        "class→className, for→htmlFor, onclick→onClick; disabled takes a real boolean, style takes an object, and onClick takes a function reference — all validated per-tag by TypeScript.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read-and-predict: JSX stored in a variable, expressions in braces, a fragment, and a hostile string in {}. What HTML does <Profile /> render?",
    code: `function Badge({ label }: { label: string }) {
  return <span className="badge">{label}</span>;
}

function Profile() {
  const name = '<script>alert("pwned")</script>'; // hostile "user input"
  const years = 25;
  const skills = ['PHP', 'SQL', 'TypeScript'];

  // JSX is a value — build it, store it, use it later:
  const heading = <h1>Profile: {name}</h1>;

  return (
    <>
      {heading}
      <p>
        {years} years of experience ({years >= 20 ? 'veteran' : 'junior'})
      </p>
      <ul>
        {skills.map((s) => (
          <li key={s}>
            <Badge label={s} />
          </li>
        ))}
      </ul>
    </>
  );
}`,
    output: `Rendered DOM (the fragment <>...</> adds no wrapper element):

<h1>Profile: &lt;script&gt;alert("pwned")&lt;/script&gt;</h1>
<p>25 years of experience (veteran)</p>
<ul>
  <li><span class="badge">PHP</span></li>
  <li><span class="badge">SQL</span></li>
  <li><span class="badge">TypeScript</span></li>
</ul>

The hostile name renders as literal visible text — React escaped it
automatically, so no alert ever runs. The ternary evaluated to
'veteran' (25 >= 20), and className became class in the real DOM.`,
  },

  keyPoints: [
    "JSX isn't a template language — each tag compiles to a function call returning an element object, so markup is a first-class value you can assign, pass, and return.",
    "`{}` embeds any TypeScript *expression* (not statements) — it's `<?= ?>` where the escaping is automatic instead of your responsibility.",
    "React auto-escapes everything rendered through `{}`; raw HTML requires the deliberately scary `dangerouslySetInnerHTML`.",
    "Attribute renames to memorize: `class`→`className`, `for`→`htmlFor`, camelCase events like `onClick`; `style` takes an object, booleans and numbers go in braces.",
    "A component returns one root element; use a fragment `<>...</>` to group siblings without adding a wrapper node to the DOM.",
    "TSX means the compiler reads your markup: wrong attribute names, missing required props, and unclosed tags are build errors, not runtime surprises.",
  ],

  interview: [
    {
      q: "What is JSX, really — and how is it different from a template language like Blade or Twig?",
      a: "JSX is syntactic sugar: every tag compiles to a function call that returns a plain object describing an element, which React later reconciles into DOM. That makes it fundamentally different from Blade or Twig, which are separate languages with their own directives, parsed from template files at render time. In JSX there are no directives — conditionals are ternaries, loops are .map(), and 'includes' are function calls, all in one language. Because elements are ordinary values, I can store them in variables and compose them like data, and TypeScript type-checks the markup: attribute names, prop types, even which attributes a given tag accepts. The tradeoff PHP devs notice is that JSX must be compiled — but that compile step is what buys the static checking.",
    },
    {
      q: "How does React handle XSS compared to what you did in PHP?",
      a: "In PHP the default is dangerous: echo outputs raw, and the developer must remember htmlspecialchars on every untrusted value — one miss is an XSS vulnerability. React flips the default: any value rendered through {} in JSX is escaped automatically, so a string containing <script> tags renders as inert text. To inject raw HTML you must opt in explicitly with dangerouslySetInnerHTML, whose name is designed to fail code review. That doesn't make XSS impossible — raw HTML injection, javascript: URLs in href, and building HTML strings outside React are still risks — but the common case is safe by default rather than safe by discipline.",
    },
    {
      q: "Why does JSX use className instead of class, and what other attribute differences matter?",
      a: "JSX attributes become JavaScript object properties, and class and for are reserved words in JavaScript — so they're className and htmlFor, matching the DOM's own property names. The same property-based logic explains the rest: events are camelCase and take function references (onClick={save}, not an onclick string), style takes an object of camelCased CSS properties, and non-string values like disabled={isSaving} are real booleans in braces rather than attribute-presence strings. In TSX this is all typed per element, so a misspelled attribute or a string passed where a boolean belongs is a compile error.",
    },
  ],

  quiz: [
    {
      question: "What does <h1 className=\"hero\">Hi</h1> actually compile to?",
      options: [
        "An HTML string that gets concatenated into the document",
        "A function call returning a plain object that describes the element",
        "A DOM node created immediately via document.createElement",
        "A template file cached and rendered on the server",
      ],
      answerIndex: 1,
      explain:
        "JSX compiles to element-creating function calls that return lightweight description objects. No DOM is touched at that point — React renders/diffs those descriptions later. That's why JSX is a value you can store and pass around.",
    },
    {
      question:
        "user.name contains '<script>alert(1)</script>'. What does <h2>{user.name}</h2> render?",
      options: [
        "Nothing — React throws a security error",
        "The script executes, like echoing raw input in PHP",
        "The literal text '<script>alert(1)</script>' — escaped automatically",
        "It renders only if wrapped in htmlspecialchars()",
      ],
      answerIndex: 2,
      explain:
        "React escapes every {} interpolation by default, so the markup shows up as inert text. That inverts PHP's model, where escaping is opt-in via htmlspecialchars on every echo.",
    },
    {
      question: "Why can't you write {if (loggedIn) <p>Hi</p>} inside JSX?",
      options: [
        "JSX braces accept only expressions, and `if` is a statement — use a ternary or && instead",
        "if is a reserved word in JSX and must be capitalized",
        "Conditionals are only allowed in class components",
        "You can — it works fine",
      ],
      answerIndex: 0,
      explain:
        "A JSX slot is an expression position, like a function argument. Statements (if, for) don't produce values, so you use expression forms — ternaries, &&, or computing the JSX in a variable before the return.",
    },
    {
      question: "What does the fragment <>...</> render in the DOM?",
      options: [
        "A <fragment> element",
        "A <div> with no attributes",
        "Nothing — its children are placed directly in the parent with no wrapper node",
        "An HTML comment marking the boundary",
      ],
      answerIndex: 2,
      explain:
        "Fragments exist because a component must return a single element but you don't always want an extra wrapper — e.g. <dt>/<dd> pairs that must sit directly inside a <dl>. The fragment groups children at the JSX level only.",
    },
  ],
};

export default lesson;

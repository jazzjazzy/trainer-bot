import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 13,
  slug: "composition-and-children",
  title: "Composition and the children Prop",
  part: "State, Events & Forms",
  estMinutes: 11,
  summary:
    "children is the typed slot that lets components wrap arbitrary content — React's answer to template inheritance and, surprisingly often, to prop drilling.",

  concept: `
Some components don't know what they will contain — a \`Card\`, a \`Modal\`, a page
\`Layout\`. In PHP templating you solved this with layouts and blocks (Twig's
\`{% block content %}\`, Blade's \`@yield\`). React solves it with an ordinary prop
that happens to have special JSX syntax: **\`children\`**.

### children: the content between the tags

Whatever you write between a component's opening and closing tags arrives as
\`props.children\`:

\`\`\`tsx
interface CardProps {
  children: React.ReactNode;
}

function Card({ children }: CardProps) {
  return <section className="card">{children}</section>;
}

// Usage — the Card has no idea what it wraps, and doesn't care:
<Card>
  <h2>Invoice #1042</h2>
  <p>3 items — total $86.00</p>
</Card>
\`\`\`

The type is \`React.ReactNode\` — the widest "renderable thing" type: elements,
strings, numbers, arrays of those, \`null\`. Type \`children\` as \`ReactNode\` unless
you genuinely need to restrict it. This is Twig's \`{% block %}\` as a *function
parameter*: the layout is just a component, the block is just an argument.

### Multiple slots are just more props

Twig layouts have several blocks — header, content, footer. In React, extra
"slots" are simply extra props holding JSX, because JSX elements are ordinary
values:

\`\`\`tsx
interface PanelProps {
  header: React.ReactNode;
  children: React.ReactNode;   // the main slot keeps the nice syntax
  footer?: React.ReactNode;    // optional slot
}

function Panel({ header, children, footer }: PanelProps) {
  return (
    <section>
      <header>{header}</header>
      <div>{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  );
}

<Panel header={<h2>Settings</h2>} footer={<SaveButton />}>
  <SettingsForm />
</Panel>
\`\`\`

No special slot mechanism, no template inheritance hierarchy — just values
passed to a function.

### Composition beats prop drilling

Here is the non-obvious payoff. Suppose \`Page\` has the \`user\`, and an \`Avatar\`
four layers down needs it. Drilling passes \`user\` through \`Sidebar\` and
\`UserPanel\`, which never use it. Composition inverts the structure: let the
component that *has* the data build the JSX that *needs* it, and pass the
finished element down as \`children\`:

\`\`\`tsx
function Page({ user }: { user: User }) {
  return (
    <Sidebar>
      <UserPanel>
        <Avatar user={user} />   {/* data used where it lives */}
      </UserPanel>
    </Sidebar>
  );
}
\`\`\`

\`Sidebar\` and \`UserPanel\` now just render \`{children}\` — they never see \`user\`
at all. The intermediate layers became *layout*, not *plumbing*. Reach for this
before you reach for context: a lot of "prop drilling problems" are really
composition problems.

### Composition over inheritance — full stop

React favors composition over inheritance, full stop. You never write
\`class SpecialCard extends Card\`. A "special" card is a component that *renders*
\`Card\` and fills its slots. After decades of PHP class hierarchies this can feel
underpowered for a day — then you notice that every variation is just another
function, with no fragile base-class problem and no wondering which ancestor's
method actually runs. The official docs are blunt about it: there are no
recommended use cases for component inheritance.
`,

  comparisons: [
    {
      label: "Template inheritance vs a Layout component",
      intro:
        "A site-wide layout wrapping page-specific content. PHP does it with an inherited template and named blocks; React does it with a component whose 'block' is the children prop.",
      php: `{# layout.twig #}
<html>
  <body>
    <nav>…site nav…</nav>
    <main>
      {% block content %}{% endblock %}
    </main>
    <footer>{% block footer %}© 2026{% endblock %}</footer>
  </body>
</html>

{# invoice.twig #}
{% extends "layout.twig" %}
{% block content %}
  <h1>Invoice #1042</h1>
  <p>3 items — total $86.00</p>
{% endblock %}`,
      ts: `// Layout.tsx — the "base template" is just a component
interface LayoutProps {
  children: React.ReactNode;
  footer?: React.ReactNode; // a second, optional block
}

function Layout({ children, footer }: LayoutProps) {
  return (
    <>
      <nav>…site nav…</nav>
      <main>{children}</main>
      <footer>{footer ?? "© 2026"}</footer>
    </>
  );
}

// InvoicePage.tsx — "extends" is just rendering it
function InvoicePage() {
  return (
    <Layout>
      <h1>Invoice #1042</h1>
      <p>3 items — total $86.00</p>
    </Layout>
  );
}`,
      note: "Twig blocks are a template-engine feature with its own inheritance rules; in React the layout is a plain function and each 'block' is a plain argument — default values are just ?? fallbacks.",
      leftLang: "html",
    },
    {
      label: "Drilling a prop vs composing the content in",
      intro:
        "An Avatar three layers deep needs the current user. Left: every intermediate component relays a user prop it never uses. Right: the parent composes the Avatar in as children and the middle layers go back to knowing nothing.",
      php: `// Page.tsx — user drilled through two bystanders
function Page({ user }: { user: User }) {
  return <Sidebar user={user} />;
}

function Sidebar({ user }: { user: User }) {
  // doesn't use user — just passes it along
  return (
    <aside>
      <UserPanel user={user} />
    </aside>
  );
}

function UserPanel({ user }: { user: User }) {
  // doesn't use user either
  return (
    <div className="panel">
      <Avatar user={user} />
    </div>
  );
}`,
      ts: `// Page.tsx — the data is used where it lives
function Page({ user }: { user: User }) {
  return (
    <Sidebar>
      <UserPanel>
        <Avatar user={user} />
      </UserPanel>
    </Sidebar>
  );
}

function Sidebar({ children }: { children: React.ReactNode }) {
  return <aside>{children}</aside>;
}

function UserPanel({ children }: { children: React.ReactNode }) {
  return <div className="panel">{children}</div>;
}
// Sidebar and UserPanel no longer mention User at all —
// change the Avatar's props and only Page is touched.`,
      note: "Composition removes the middlemen from the data path: the component that owns user renders the component that needs it, and the layers in between become pure layout.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "One Card component with a children slot plus header/footer slot props, rendered twice with different content. Predict what each instance renders — including what happens to the missing footer.",
    code: `interface CardProps {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function Card({ header, children, footer }: CardProps) {
  return (
    <section className="card">
      <header className="card-header">{header}</header>
      <div className="card-body">{children}</div>
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}

export default function Dashboard() {
  return (
    <>
      <Card
        header={<h2>Invoice #1042</h2>}
        footer={<em>Due in 14 days</em>}
      >
        <p>3 items — total $86.00</p>
      </Card>

      <Card header={<h2>Quick note</h2>}>
        <p>The Card never knows what it wraps.</p>
        <button>Dismiss</button>
      </Card>
    </>
  );
}`,
    output: `Rendered HTML — one Card definition, two completely different fillings:

<section class="card">
  <header class="card-header"><h2>Invoice #1042</h2></header>
  <div class="card-body"><p>3 items — total $86.00</p></div>
  <footer class="card-footer"><em>Due in 14 days</em></footer>
</section>

<section class="card">
  <header class="card-header"><h2>Quick note</h2></header>
  <div class="card-body">
    <p>The Card never knows what it wraps.</p>
    <button>Dismiss</button>
  </div>
</section>

The second Card renders NO footer element at all: footer is undefined,
so {footer && <footer>…</footer>} short-circuits to nothing — the
optional slot pattern in one line.`,
  },

  keyPoints: [
    "Whatever sits between `<Card>` and `</Card>` arrives as `props.children` — type it `React.ReactNode`, the widest 'anything renderable' type.",
    "Multiple named slots are just more props holding JSX (`header={<h2>…</h2>}`) — elements are ordinary values, so no special slot mechanism exists or is needed.",
    "`children` is React's answer to Twig blocks / Blade `@yield`: the layout is a function, each block is an argument, defaults are `??` fallbacks.",
    "Composition defeats prop drilling: when the data owner composes `<Avatar user={user} />` in as children, the intermediate layers render `{children}` and never touch the data.",
    "Render optional slots with `{footer && <footer>{footer}</footer>}` so the wrapper element disappears entirely when the slot is empty.",
    "React favors composition over inheritance, full stop — you extend a component by wrapping it, never by subclassing it.",
  ],

  interview: [
    {
      q: "What is the children prop and how do you type it?",
      a: "`children` is a regular prop that JSX fills with whatever appears between a component's opening and closing tags, which is how wrapper components like Card, Modal, or Layout accept arbitrary content without knowing it in advance. I type it as `React.ReactNode`, the broadest renderable type — elements, strings, numbers, fragments, arrays, null. Coming from PHP templating, it is the direct equivalent of a Twig `{% block %}` or Blade `@yield`, except the layout is a plain function and the block is a plain argument, so it composes and type-checks like any other code.",
    },
    {
      q: "How does composition help with prop drilling, without using context?",
      a: "Drilling happens when intermediate components have to relay props they never use. Composition restructures that: the component that owns the data builds the JSX that needs it — `<Sidebar><UserPanel><Avatar user={user} /></UserPanel></Sidebar>` — and the intermediates just render `{children}`. The data goes straight from owner to consumer as an already-constructed element; the middle layers become pure layout and lose all knowledge of the data's type. I try this before reaching for context, because a lot of apparent drilling problems are really structure problems, and composition keeps the data flow explicit.",
    },
    {
      q: "Does React support component inheritance, like extending a base component class?",
      a: "Technically you could once subclass class components, but it has never been the React way and with function components it doesn't even arise — React favors composition over inheritance, and the docs state there are no recommended use cases for inheritance hierarchies. A 'specialized' component is one that renders the general one and fills its slots: a ConfirmModal renders Modal with specific children. After years of PHP class hierarchies the mental shift is that variation comes from wrapping and props, not extending — which eliminates fragile base-class problems entirely.",
    },
  ],

  quiz: [
    {
      question:
        "What ends up in props.children for `<Card><p>Hello</p></Card>`?",
      options: [
        "The string \"<p>Hello</p>\"",
        "The JSX element created from <p>Hello</p>",
        "An object mapping slot names to elements",
        "Nothing — content between tags is ignored unless the component opts in",
      ],
      answerIndex: 1,
      explain:
        "JSX between a component's tags is compiled to element values and passed as the children prop automatically — no opt-in needed. It arrives as real element objects (or an array of them), not as an HTML string, which is also why it composes and type-checks.",
    },
    {
      question:
        "You want a Panel with header, body, and footer areas. What is the idiomatic React design?",
      options: [
        "Subclass Panel three times, once per area",
        "children for the body, plus header and footer props typed React.ReactNode",
        "A defineSlots() API registered on the component",
        "Three separate children props separated by <slot> markers",
      ],
      answerIndex: 1,
      explain:
        "Named slots in React are just props that hold JSX, because elements are ordinary values. children keeps the nicest syntax for the main content; header and footer are passed as attributes. There is no slot registration API and no inheritance involved.",
    },
    {
      question:
        "An Avatar four levels deep needs `user`, and the three components in between don't. What should you try first?",
      options: [
        "Pass user through all three components as a prop",
        "Store user on window so Avatar can read it globally",
        "Have the component that owns user render <Avatar user={user} /> and pass it down as children",
        "Convert Avatar to a class component so it can inherit user",
      ],
      answerIndex: 2,
      explain:
        "Composition first: the data owner constructs the element that needs the data and hands it down as children, so the middle layers just render {children} and never learn about user. Context is the later tool for genuinely app-wide values; drilling through three bystanders and globals are exactly what this pattern avoids.",
    },
  ],
};

export default lesson;

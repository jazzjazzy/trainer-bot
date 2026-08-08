import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 4,
  slug: "components-and-props",
  title: "Components and Typed Props",
  part: "Thinking in React",
  estMinutes: 11,
  summary:
    "A component is a function returning JSX; props are its typed, read-only parameters — a template partial with an enforced signature instead of variables leaking in from scope.",

  concept: `
You've spent years composing pages from partials: \`include 'user-card.php'\`
and hope the right variables are in scope. A React component is that partial,
grown up: a **plain function** that takes a typed parameter object and returns
JSX.

\`\`\`tsx
interface UserCardProps {
  name: string;
  role: string;
}

function UserCard({ name, role }: UserCardProps) {
  return (
    <div className="card">
      <h3>{name}</h3>
      <p>{role}</p>
    </div>
  );
}

// usage — note the capital letter: <UserCard>, never <userCard>
<UserCard name="Ada" role="Engineer" />
\`\`\`

The capitalization matters: JSX treats lowercase tags as HTML elements and
capitalized tags as your components. And the JSX call
\`<UserCard name="Ada" ... />\` is exactly a function call — React invokes
\`UserCard({ name: 'Ada', role: 'Engineer' })\` when it renders.

### Props: the include that declares what it needs

A PHP partial's inputs are invisible: it reads whatever variables the includer
happened to define (or worse, whatever \`extract()\` sprayed into scope). The
convention was a comment at the top: \`// expects: $name, $role\`. Nothing
enforced it.

Props fix this with an **enforced signature**. The \`interface\` says exactly
what the component needs; the compiler rejects call sites that omit a required
prop, pass the wrong type, or misspell a name. The convention is one
\`interface XxxProps\` per component, destructured in the parameter list so the
body reads \`{name}\` instead of \`props.name\`.

### Optional props and defaults

\`\`\`tsx
interface BadgeProps {
  label: string;          // required
  color?: string;         // optional — string | undefined inside
  size?: 'sm' | 'md' | 'lg';
}

function Badge({ label, color = 'gray', size = 'md' }: BadgeProps) {
  return <span className={\`badge \${size}\`} style={{ background: color }}>{label}</span>;
}
\`\`\`

\`?\` marks a prop optional (PHP: a parameter with a default), and the
destructuring default fills it in. Union types shine here: \`size\` isn't "any
string", it's exactly \`'sm' | 'md' | 'lg'\` — \`size="xl"\` is a compile
error, which is like a parameter-level enum without writing one.

### Functions are props too

Props aren't just data. Passing a function is how a child talks back to its
parent — the foundation for event handling later:

\`\`\`tsx
interface RowProps {
  user: { id: number; name: string };
  onSelect: (id: number) => void;   // a typed callback prop
}

function Row({ user, onSelect }: RowProps) {
  return <li onClick={() => onSelect(user.id)}>{user.name}</li>;
}
\`\`\`

### Props are read-only, and they flow one way

Two rules with real teeth:

- **Props flow parent → child.** A parent passes data down; a child never
  reaches up and never edits what it was given. (When a child needs to cause
  a change, the parent hands it a callback — as above.)
- **Props are read-only.** Reassigning or mutating a prop inside a component
  is a bug (and TypeScript will block the obvious cases). If the value needs
  to change over time, that's *state*, owned by some component up the tree —
  the subject of the next part of this course.

This one-way flow is why React apps stay debuggable: any value on screen can
be traced up a straight line of parents to whoever owns it.
`,

  comparisons: [
    {
      label: "A partial with extract() vs a typed component",
      intro:
        "Render a user card from caller-supplied data. The PHP partial receives variables blindly through scope; the React component declares its inputs.",
      php: `<?php // user-card.php
// expects: $name, $role, $avatarUrl  (enforced by... this comment)
?>
<div class="card">
  <img src="<?= htmlspecialchars($avatarUrl) ?>" alt="">
  <h3><?= htmlspecialchars($name) ?></h3>
  <p><?= htmlspecialchars($role) ?></p>
</div>

<?php // caller.php — variables sprayed into scope
extract([
    'name'      => $user->name,
    'role'      => $user->role,
    'avatarUrl' => $user->avatar,
]);
include 'user-card.php';`,
      ts: `// UserCard.tsx — the signature IS the documentation
interface UserCardProps {
  name: string;
  role: string;
  avatarUrl: string;
}

function UserCard({ name, role, avatarUrl }: UserCardProps) {
  return (
    <div className="card">
      <img src={avatarUrl} alt="" />
      <h3>{name}</h3>
      <p>{role}</p>
    </div>
  );
}

// Caller — every prop checked at compile time:
// <UserCard name={u.name} role={u.role} avatarUrl={u.avatar} />`,
      note:
        "extract() + include means inputs arrive invisibly through shared scope; props make the contract explicit and machine-checked — nothing enters a component except through its parameter list.",
    },
    {
      label: "Forgetting an input: silence vs compile error",
      intro:
        "The caller forgets to provide the alert type. PHP renders something wrong (or logs a warning at runtime); TypeScript refuses to build.",
      php: `<?php // alert-box.php — silently expects $type
?>
<div class="alert alert-<?= $type ?? 'info' ?>">
  <?= htmlspecialchars($message) ?>
</div>

<?php // caller.php — forgot to set $type
$message = 'Payment failed!';
include 'alert-box.php';
// Renders as a calm blue "info" box. A payment failure.
// Nobody is told. The bug ships.`,
      ts: `// Alert.tsx
interface AlertProps {
  type: 'info' | 'warning' | 'error';
  message: string;
}

function Alert({ type, message }: AlertProps) {
  return <div className={'alert alert-' + type}>{message}</div>;
}

// <Alert message="Payment failed!" />
//  ^ TS2741: Property 'type' is missing in type
//    '{ message: string; }' but required in 'AlertProps'
// <Alert type="eror" message="..." />
//  ^ TS2322: '"eror"' is not assignable to
//    '"info" | "warning" | "error"'`,
      note:
        "The union type turns the alert level into a checked enum: missing and misspelled inputs are build failures instead of a wrongly-styled production incident.",
    },
    {
      label: "Optional inputs with defaults",
      intro:
        "A button component where size and variant are optional. PHP null-coalesces at the top of the partial; React defaults in the destructuring — but only React rejects invalid values.",
      php: `<?php // button.php
$size    = $size    ?? 'md';
$variant = $variant ?? 'primary';
// $size could be anything — 'mediumish' sails through
?>
<button class="btn btn-<?= $variant ?> btn-<?= $size ?>">
  <?= htmlspecialchars($label) ?>
</button>`,
      ts: `// Button.tsx
interface ButtonProps {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'danger';
}

function Button({
  label,
  size = 'md',
  variant = 'primary',
}: ButtonProps) {
  return (
    <button className={\`btn btn-\${variant} btn-\${size}\`}>
      {label}
    </button>
  );
}

// <Button label="Save" />              -> md / primary
// <Button label="Del" variant="danger" size="sm" />`,
      note:
        "Same ?? idea as PHP, but the union type also constrains what callers may pass — optional doesn't mean unvalidated.",
    },
  ],

  playground: {
    lang: "tsx",
    intro:
      "Read-and-predict: <UserBadge> has one required and two optional props, rendered three ways — plus a fourth usage that wouldn't compile. What does <Team /> render?",
    code: `interface UserBadgeProps {
  name: string;       // required
  role?: string;      // optional
  online?: boolean;   // optional
}

function UserBadge({ name, role = 'member', online = false }: UserBadgeProps) {
  return (
    <li>
      {online ? '[on]' : '[off]'} {name} — {role}
    </li>
  );
}

function Team() {
  return (
    <ul>
      <UserBadge name="Jason" role="admin" online={true} />
      <UserBadge name="Priya" online />
      <UserBadge name="Sam" />
      {/* <UserBadge role="admin" />  <- what happens here? */}
    </ul>
  );
}`,
    output: `<ul>
  <li>[on] Jason — admin</li>
  <li>[on] Priya — member</li>
  <li>[off] Sam — member</li>
</ul>

Line 2: a bare attribute (online) is JSX shorthand for online={true},
and role falls back to its destructuring default 'member'.
Line 3: both defaults apply.

The commented-out fourth badge would NOT compile:
  TS2741: Property 'name' is missing in type '{ role: string; }'
  but required in type 'UserBadgeProps'.
Required props are enforced before the code ever runs.`,
  },

  keyPoints: [
    "A component is a plain function: typed props object in, JSX out. Capitalized names are required — JSX treats lowercase tags as HTML.",
    "Define an `interface XxxProps` and destructure it in the parameter list; the compiler then enforces every call site — no more `// expects: $name` comments.",
    "`prop?: T` marks a prop optional; give it a value with a destructuring default like `{ size = 'md' }` — PHP's `$size ?? 'md'`, but type-checked.",
    "Union-typed props (`variant: 'primary' | 'danger'`) act as checked enums: invalid values are compile errors, not wrong CSS classes in production.",
    "Functions are props too — a typed callback like `onSelect: (id: number) => void` is how children communicate upward.",
    "Props are read-only and flow one way, parent to child; data that changes over time is state, owned higher in the tree.",
  ],

  interview: [
    {
      q: "What are props in React, and how do they compare to how PHP templates receive data?",
      a: "Props are the input parameters of a component — a single object of named, typed, read-only values that the parent passes at each render. A PHP partial gets its data implicitly, from variables in the including scope or an extract() call, with the expected inputs documented only by convention; nothing stops a caller from omitting one. Props invert that: the component declares an interface, JSX call sites are type-checked against it, and a missing or wrongly-typed prop is a compile error. They're also immutable from the component's perspective — a component never modifies what it received, which keeps rendering pure. When the data changes, the parent re-renders and passes new props; the child doesn't edit the old ones.",
    },
    {
      q: "What does one-way data flow mean, and why does React insist on it?",
      a: "Data flows down: a parent passes props to children, those children pass to their children, and no component ever writes to data it doesn't own. If a child needs to trigger a change, the parent passes down a callback and the child calls it — the change happens where the data lives, then flows back down as new props. The payoff is traceability: any value on screen has exactly one owner, findable by walking up the tree, so debugging is 'who owns this and who last set it' instead of hunting for whichever of thirty places mutated a shared value. Two-way or ad-hoc data flow is exactly what made large jQuery codebases unmaintainable.",
    },
    {
      q: "How do you type a component's props in TypeScript, and what patterns do you reach for?",
      a: "The standard pattern is an interface per component — interface ButtonProps — annotated on a destructured parameter: function Button({ label, size = 'md' }: ButtonProps). Optional props get ?, and defaults live in the destructuring rather than scattered through the body. I use union literal types for anything with a fixed set of values, like variant: 'primary' | 'danger', which gives enum-level safety for free, and function types for callbacks, like onSelect: (id: number) => void, so parent and child agree on the handler's shape. For components that wrap DOM elements I'll extend the built-in attribute types, but the interface-plus-destructuring core covers most components.",
    },
  ],

  quiz: [
    {
      question: "Why must React component names be capitalized in JSX?",
      options: [
        "It's only a style convention with no behavior attached",
        "Lowercase tags are treated as built-in HTML elements; capitalized tags are resolved as your components",
        "JavaScript requires class-like values to be capitalized",
        "React lowercases all output tags, so components need contrast",
      ],
      answerIndex: 1,
      explain:
        "The JSX compiler uses the case to decide: <usercard /> compiles to the string 'usercard' (an unknown HTML tag), while <UserCard /> compiles to a reference to your UserCard function. Wrong case means your component silently never renders.",
    },
    {
      question:
        "A component receives a prop it needs to change when the user clicks. What's the React-correct approach?",
      options: [
        "Reassign the prop inside the component",
        "Mutate the prop object so the parent sees the change",
        "The parent owns the value as state and passes the child a callback; the child calls it and receives the new value as a re-rendered prop",
        "Copy the prop into a global variable and update that",
      ],
      answerIndex: 2,
      explain:
        "Props are read-only and flow one way. Changes happen where the data is owned — the parent — via a callback prop; the new value then flows down as props on the next render. Mutating props breaks render purity and React's update model.",
    },
    {
      question:
        "What does `function Badge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' })` give you over PHP's `$size = $size ?? 'md';`?",
      options: [
        "Nothing — they are exactly equivalent",
        "The default plus a compile-time guarantee that callers can only pass 'sm', 'md', or 'lg'",
        "Runtime validation that throws on bad values",
        "The default is applied on every render instead of once",
      ],
      answerIndex: 1,
      explain:
        "Both supply a fallback, but the union literal type also constrains the input set: size=\"xl\" is a build error. PHP's ?? accepts any value that happens to be non-null — validation is still on you.",
    },
    {
      question: "How does JSX like <UserCard name=\"Ada\" /> relate to the UserCard function?",
      options: [
        "React calls UserCard({ name: 'Ada' }) when rendering — the JSX is a function call with a props object",
        "UserCard is instantiated with `new` and name becomes an instance property",
        "The JSX is parsed as an HTML template and name is string-replaced into it",
        "UserCard.render() is invoked with name as a global",
      ],
      answerIndex: 0,
      explain:
        "A component is literally a function and its props are literally its argument object. That's why props feel like function parameters — they are, complete with TypeScript checking at every 'call site' in JSX.",
    },
  ],
};

export default lesson;

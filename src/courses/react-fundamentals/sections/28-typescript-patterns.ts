import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 28,
  slug: "typescript-patterns",
  title: "TypeScript Patterns for React",
  part: "Patterns & Production",
  estMinutes: 12,
  summary:
    "The TS-in-React idioms hiring tests probe — ReactNode children, discriminated-union props, generic components, typed hooks, and ComponentProps — all in service of making illegal states unrepresentable.",

  concept: `
Every idiom in this section serves one instinct: **make illegal states
unrepresentable**. You already have this instinct from PHP 8 — enums instead
of magic strings, \`readonly\` instead of "please don't mutate" comments.
TypeScript lets you apply it at the UI layer: if a component can't be
misused without a compile error, a whole class of bugs and a whole class of
runtime validation code disappear.

### Typing children: \`ReactNode\`

\`React.ReactNode\` is the type of "anything React can render" — JSX,
strings, numbers, \`null\`, arrays of those. It's the right type for
\`children\` and for any slot-style prop:

\`\`\`tsx
interface CardProps {
  title: string;
  children: React.ReactNode;  // any renderable content
  footer?: React.ReactNode;   // slots are just ReactNode props
}
\`\`\`

### Discriminated-union props

The classic test: a \`Button\` that renders an \`<a href>\` **or** a
\`<button onClick>\` — never both, never neither. A props bag of optionals
(\`href?\`, \`onClick?\`) permits all four combinations; a discriminated
union permits exactly two, and TypeScript narrows to the right one when you
check the discriminant:

\`\`\`tsx
type ButtonProps =
  | { as: 'link'; href: string; label: string }
  | { as: 'button'; onClick: () => void; label: string };
\`\`\`

Inside \`if (props.as === 'link')\`, \`props.href\` exists and
\`props.onClick\` doesn't. Add an exhaustive \`switch\` with a \`never\`
check and adding a third variant later breaks the build until every
consumer handles it — the same payoff as \`match\` over a PHP enum.

### Generic components

A \`List\` that works for any item type without \`any\`:

\`\`\`tsx
function List<T>({ items, renderItem }: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>;
}

// T is inferred as User from the items prop:
<List items={users} renderItem={(u) => u.email} />
\`\`\`

One TSX quirk: in a \`.tsx\` file, an *arrow function's* \`<T>\` parses as a
JSX tag. Use a \`function\` declaration (as above), or write \`<T,>\` with a
trailing comma to disambiguate.

### Typing hooks

- \`useState<Status>('idle')\` — pin a union so widening doesn't bite; \`useState<User | null>(null)\` when the value arrives later.
- \`useRef<HTMLInputElement>(null)\` for DOM refs — \`ref.current\` is \`HTMLInputElement | null\`, so you null-check before use. Note: React 19's types require an argument to \`useRef\`; write \`useRef(undefined)\` if you truly have no initial value.

### Extending native elements: \`ComponentProps\`

Never hand-copy \`disabled\`, \`type\`, \`onClick\`, and forty aria
attributes onto your wrapper's props. \`React.ComponentProps<'button'>\` is
all of them at once:

\`\`\`tsx
type IconButtonProps = React.ComponentProps<'button'> & { icon: string };

function IconButton({ icon, children, ...rest }: IconButtonProps) {
  return <button {...rest}><Icon name={icon} />{children}</button>;
}
\`\`\`

### Event types, quickly

When you extract a handler out of the JSX, name the event yourself:
\`React.ChangeEvent<HTMLInputElement>\` for inputs,
\`React.FormEvent<HTMLFormElement>\` for submit (then
\`e.preventDefault()\`), \`React.MouseEvent<HTMLButtonElement>\` for clicks.
Written inline, they're inferred for free.
`,

  comparisons: [
    {
      label: "Optional-everything props bag vs a discriminated union",
      intro:
        "A Button component that is either a navigation link or an action button. Both versions type-check their own file — only one stops callers from passing nonsense.",
      php: `// Button.tsx — everything optional, so anything goes
interface ButtonProps {
  label: string;
  href?: string;
  onClick?: () => void;
}

function Button({ label, href, onClick }: ButtonProps) {
  // What if BOTH are set? Neither? The type allows it,
  // so the component needs runtime "which is it?" logic:
  if (href) return <a href={href}>{label}</a>;
  return <button onClick={onClick}>{label}</button>;
}

// All of these compile — two of them are bugs:
<Button label="Docs" href="/docs" />
<Button label="Save" onClick={save} />
<Button label="??" href="/docs" onClick={save} />
<Button label="Dead button" />`,
      ts: `// Button.tsx — the discriminant makes invalid combos unwritable
type ButtonProps =
  | { as: 'link'; href: string; label: string }
  | { as: 'button'; onClick: () => void; label: string };

function Button(props: ButtonProps) {
  if (props.as === 'link') {
    // narrowed: props.href exists, props.onClick doesn't
    return <a href={props.href}>{props.label}</a>;
  }
  return <button onClick={props.onClick}>{props.label}</button>;
}

// The two valid shapes compile:
<Button as="link" href="/docs" label="Docs" />
<Button as="button" onClick={save} label="Save" />

// Both bugs are now COMPILE errors:
// <Button as="link" href="/docs" onClick={save} label="?" />
// <Button as="button" label="Dead button" />`,
      note:
        "Optionals model 'may or may not exist'; a discriminated union models 'exactly one of these shapes' — the PHP-enum-plus-match instinct applied to props, with narrowing replacing runtime guessing.",
      leftLang: "tsx",
    },
    {
      label: "Hand-duplicated attributes vs ComponentProps<'button'>",
      intro:
        "An IconButton wrapper around a native button. The left version re-declares native attributes one by one; the right inherits all of them and adds its own.",
      php: `// IconButton.tsx — hand-copying the native surface
interface IconButtonProps {
  icon: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  // ...next week someone needs aria-label. Then form.
  // Then autoFocus. The wrapper lags the platform forever.
}

function IconButton({ icon, children, onClick, disabled, type }: IconButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled} type={type}>
      <Icon name={icon} />
      {children}
    </button>
  );
}`,
      ts: `// IconButton.tsx — inherit the whole native surface, add one prop
type IconButtonProps = React.ComponentProps<'button'> & {
  icon: string;
};

function IconButton({ icon, children, ...rest }: IconButtonProps) {
  return (
    <button {...rest}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

// Everything a real <button> accepts just works, fully typed:
<IconButton icon="trash" disabled aria-label="Delete" type="submit">
  Delete
</IconButton>
// (In React 19, ref is a normal prop too — it rides along in ...rest.)`,
      note:
        "ComponentProps<'button'> is the full typed attribute set of the native element; destructure your custom props and spread the rest — the wrapper never lags behind the platform.",
      leftLang: "tsx",
    },
  ],

  playground: {
    lang: "typescript",
    intro:
      "Discriminated-union props in plain TypeScript: a render() that switches on the discriminant and proves exhaustiveness with a never check. Run it, then add a third variant ({ as: 'submit'; form: string; label: string }) and watch the never line force you to handle it.",
    code: `// A Button that is EITHER a link OR an action button — never both.
type LinkButton = { as: 'link'; href: string; label: string };
type ActionButton = { as: 'button'; onClick: () => void; label: string };
type ButtonProps = LinkButton | ActionButton;

function render(props: ButtonProps): string {
  switch (props.as) {
    case 'link':
      // narrowed to LinkButton: props.href exists, props.onClick doesn't
      return \`<a href="\${props.href}">\${props.label}</a>\`;
    case 'button':
      // narrowed to ActionButton
      return \`<button>\${props.label}</button>\`;
    default: {
      // Exhaustiveness proof: if every variant is handled above,
      // props has type never here. Add a third variant to the union
      // and this line becomes a COMPILE error until you handle it.
      const unhandled: never = props;
      throw new Error('Unhandled variant: ' + JSON.stringify(unhandled));
    }
  }
}

// Both valid shapes render:
console.log(render({ as: 'link', href: '/pricing', label: 'See pricing' }));

const addToCart: ActionButton = {
  as: 'button',
  label: 'Add to cart',
  onClick: () => console.log('-> cart now has 1 item'),
};
console.log(render(addToCart));

// Narrowing works outside the component too:
const props: ButtonProps = addToCart;
if (props.as === 'button') {
  props.onClick(); // legal ONLY inside this branch
}

// These shapes are impossible to construct — uncomment to see TS refuse:
// const both: ButtonProps = { as: 'link', href: '/x', onClick: () => {}, label: '?' };
// const neither: ButtonProps = { as: 'button', label: 'Dead button' };`,
  },

  keyPoints: [
    "`React.ReactNode` types 'anything renderable' — the right type for `children` and for slot props like `footer`.",
    "Model either/or props as a discriminated union with a literal discriminant (`as: 'link' | 'button'`); TypeScript narrows in each branch and invalid combinations won't compile.",
    "An exhaustive `switch` ending in a `const x: never = props` check turns 'someone added a variant' into a compile error at every consumer.",
    "Generic components (`function List<T>({ items, renderItem })`) infer `T` from usage; in .tsx files prefer `function` declarations because an arrow function's `<T>` parses as JSX (or write `<T,>`).",
    "Type hooks at the seams: `useState<User | null>(null)`, `useRef<HTMLInputElement>(null)` — and note React 19's types require an argument to `useRef`.",
    "`React.ComponentProps<'button'> & { icon: string }` inherits the entire native attribute surface — destructure your props, spread `...rest`, and never hand-copy `disabled`/`aria-*` again.",
  ],

  interview: [
    {
      q: "How would you type a Button component that renders either a link or a real button, but never both?",
      a: "With a discriminated union rather than optional props. Something like `type ButtonProps = { as: 'link'; href: string } | { as: 'button'; onClick: () => void }`, plus the shared fields. The `as` literal is the discriminant: when I check `props.as === 'link'`, TypeScript narrows the type so `href` exists and `onClick` doesn't, and callers physically cannot pass both `href` and `onClick` or neither. It's the 'make illegal states unrepresentable' principle — the same reason I'd use an enum plus `match` in PHP 8 instead of two nullable fields and runtime checks. As a bonus, an exhaustive switch with a `never` check means adding a third variant later breaks the build everywhere it isn't handled, instead of silently falling through.",
    },
    {
      q: "How do you type a reusable List component that works for any item type?",
      a: "Make the component generic: `function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => React.ReactNode })`. When someone passes `items={users}`, TypeScript infers `T` as `User`, so inside their `renderItem` callback the item is fully typed — no `any`, no casting. Two practical notes: I'd also take a `getKey: (item: T) => string` prop rather than falling back to array indexes for keys, and in a .tsx file I write generics as `function` declarations because an arrow function's `<T>` is parsed as a JSX tag — the trailing-comma `<T,>` workaround exists but a named function is cleaner.",
    },
    {
      q: "Your design system wraps native elements — how do you type the wrappers without re-declaring every HTML attribute?",
      a: "`React.ComponentProps<'button'>` (or `'input'`, `'a'`, etc.) gives me the complete typed attribute set of the native element. I intersect it with my custom props — `type IconButtonProps = React.ComponentProps<'button'> & { icon: IconName }` — then destructure the custom ones and spread the rest onto the element: `({ icon, ...rest }) => <button {...rest}>`. Consumers get `disabled`, `type`, every `aria-*`, and full onClick typing for free, and the wrapper never lags behind the platform. In React 19 `ref` is just a normal prop on function components, so it flows through the same spread without `forwardRef` ceremony. It also works on components: `ComponentProps<typeof SomeComponent>` extracts another component's props when a library doesn't export the type.",
    },
  ],

  quiz: [
    {
      question: "What is the correct type for a `children` prop that accepts any renderable content?",
      options: [
        "JSX.Element",
        "React.ReactNode",
        "string | JSX.Element",
        "React.Component",
      ],
      answerIndex: 1,
      explain:
        "ReactNode covers everything React can render: elements, strings, numbers, null, undefined, booleans, and arrays of those. JSX.Element is only a single element — it would reject `<Card>plain text</Card>` or a mapped array. React.Component is the class-era base class, not a value type.",
    },
    {
      question:
        "In a discriminated-union `switch`, what does `const x: never = props;` in the `default` branch achieve?",
      options: [
        "It silences the TypeScript compiler in unreachable code",
        "It converts props to a safe empty value at runtime",
        "It proves exhaustiveness: if a new variant is added and not handled, this line becomes a compile error",
        "It marks the component as having no children",
      ],
      answerIndex: 2,
      explain:
        "If every union member is handled in the cases above, `props` is narrowed to `never` in `default`, so the assignment type-checks. Add an unhandled variant and `props` is that variant's type there — not assignable to `never` — and the build fails, pointing at exactly the switch that needs updating.",
    },
    {
      question: "Why does `const List = <T>(props: ListProps<T>) => ...` fail to parse in a .tsx file?",
      options: [
        "Arrow functions can't be generic in TypeScript",
        "The parser reads <T> as the start of a JSX tag",
        "Generics require a class component",
        "ListProps must extend ReactNode first",
      ],
      answerIndex: 1,
      explain:
        "In .tsx files, `<T>` in that position is ambiguous with JSX syntax, and the parser picks JSX. Fixes: use a `function List<T>(...)` declaration, or add a trailing comma — `<T,>` — to force the type-parameter reading. Generic arrow functions are otherwise perfectly legal in .ts files.",
    },
    {
      question: "What does `React.ComponentProps<'button'>` give you?",
      options: [
        "Only the event handler props of a button",
        "The full typed prop/attribute set of the native <button> element",
        "A runtime object containing a button's current props",
        "The default values a button renders with",
      ],
      answerIndex: 1,
      explain:
        "It's a type-level utility: the complete set of props a native <button> accepts — disabled, type, onClick, aria-*, and the rest. Intersect it with your custom props and spread `...rest` onto the element so your wrapper exposes the whole platform surface without hand-copying it.",
    },
  ],
};

export default lesson;

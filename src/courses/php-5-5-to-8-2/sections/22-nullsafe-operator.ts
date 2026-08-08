import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 22,
  slug: "nullsafe-operator",
  title: "The Nullsafe Operator: Chaining Without the Null Dance",
  part: "PHP 8.0: The Big Leap",
  estMinutes: 10,
  summary:
    "PHP 8.0's ?-> short-circuits a whole method/property chain to null the moment any link is null — replacing the pyramid of nested isset() and if checks from the 5.5 era.",

  concept: `
In PHP 5.5, reaching into a chain of objects that *might* be null was a chore.
Calling \`$session->getUser()->getAddress()->getCountry()\` blows up with a
fatal error the instant any link returns \`null\`. So you guarded every step —
and the guarding got ugly fast.

### The 5.5 problem: defensive pyramids

You had two bad options. Nested \`if\`/\`isset\` checks:

\`\`\`php
$country = null;
if ($session !== null) {
    $user = $session->getUser();
    if ($user !== null) {
        $address = $user->getAddress();
        if ($address !== null) {
            $country = $address->getCountry();
        }
    }
}
\`\`\`

…or a long boolean \`&&\` chain that re-walked the objects and was easy to get
subtly wrong. Either way, intent (*"give me the country if it exists"*) drowned
in ceremony.

### The 8.0 fix: \`?->\`

The **nullsafe operator** (PHP 8.0) is like \`->\` but with a built-in null
check. If the operand to its **left** is \`null\`, evaluation **short-circuits**:
the rest of the chain is skipped and the whole expression evaluates to \`null\`.

\`\`\`php
$country = $session?->getUser()?->getAddress()?->getCountry();
\`\`\`

If \`$session\`, \`getUser()\`, or \`getAddress()\` is \`null\`, you get \`null\` —
no fatal error, no notice. One line, intent intact.

### How short-circuiting really works

- It short-circuits the **entire chain**, not just the next access. The moment a
  \`?->\` left operand is \`null\`, **no further method calls or property reads
  happen** — side effects downstream simply don't run.
- It works for both **method calls** (\`?->method()\`) and **property reads**
  (\`?->prop\`).
- It is **not** a null-coalescing replacement. \`?->\` yields \`null\`; pair it
  with \`??\` for a default: \`$session?->getUser()?->name ?? 'guest'\`.

### Gotchas when upgrading

- You **cannot** use \`?->\` as an assignment target or to pass an argument
  by reference — short-circuiting would make the write meaningless.
- It guards \`null\`, not "key missing" on arrays — for arrays you still want
  \`??\`. \`?->\` is for **objects**.
- Don't sprinkle it everywhere: if a value should *never* be null, a plain
  \`->\` that fails loudly is better than a \`?->\` that hides a bug.
`,

  comparisons: [
    {
      label: "Reaching into a nullable chain",
      intro:
        "We want the country from a session, walking session to user to address to country, where any link along the way could be null. The goal is to end up with the country if every link exists, or null otherwise, without a fatal error.",
      php: `<?php
// PHP 5.5 — nested guards
$country = null;
if ($session !== null) {
    $user = $session->getUser();
    if ($user !== null) {
        $addr = $user->getAddress();
        if ($addr !== null) {
            $country = $addr->getCountry();
        }
    }
}`,
      ts: `<?php
// PHP 8.0 — nullsafe chain
$country = $session
    ?->getUser()
    ?->getAddress()
    ?->getCountry();`,
      note:
        "The nullsafe operator ?-> (PHP 8.0) collapses the whole defensive pyramid: any null link short-circuits the chain to null.",
    },
    {
      label: "Nullable property read",
      intro:
        "An order may or may not have a customer attached, and we want that customer's name. The result should be the name when a customer is present, or null when there is none.",
      php: `<?php
// PHP 5.5 — isset() ternary on a property
$name = isset($order->customer)
    ? $order->customer->name
    : null;`,
      ts: `<?php
// PHP 8.0 — ?-> reads the property safely
$name = $order->customer?->name;`,
      note:
        "?-> works for property access too, not just method calls — added in PHP 8.0.",
    },
    {
      label: "Chain plus a default value",
      intro:
        "We want a display name from the logged-in user, but the session, the user, or the name could each be missing. The aim is to show the user's name when available and fall back to 'guest' otherwise.",
      php: `<?php
// PHP 5.5 — check, then fall back
$user = $session->getUser();
$display = ($user !== null && $user->getName() !== null)
    ? $user->getName()
    : 'guest';`,
      ts: `<?php
// PHP 8.0 — ?-> for null, ?? for the default
$display = $session?->getUser()?->getName() ?? 'guest';`,
      note:
        "Combine ?-> (null-safe chaining, 8.0) with ?? (null coalescing, 7.0): the chain yields null, then ?? supplies the fallback.",
    },
    {
      label: "Short-circuiting skips side effects",
      intro:
        "We have an optional report object and want to log it and flush that log only when a report actually exists. When there is no report, none of that work should run at all.",
      php: `<?php
// PHP 5.5 — you must guard before calling, or
// log() runs even when there is nothing to log
if ($report !== null) {
    $report->log()->flush();
}`,
      ts: `<?php
// PHP 8.0 — if $report is null, log() is never called
$report?->log()->flush();`,
      note:
        "When the left operand of ?-> is null the rest of the chain is skipped entirely — no method after it executes (PHP 8.0).",
    },
  ],

  playground: {
    lang: "php",
    intro:
      "A nullable object graph. Predict what each line prints, then reveal the output.",
    code: `<?php
declare(strict_types=1);

class Address {
    public function __construct(public ?string $country) {}
}
class User {
    public function __construct(private ?Address $address) {}
    public function getAddress(): ?Address { return $this->address; }
}
class Session {
    public function __construct(private ?User $user) {}
    public function getUser(): ?User { return $this->user; }
}

$full = new Session(new User(new Address('Australia')));
$empty = new Session(null);

// Full chain resolves to the country string:
echo ($full?->getUser()?->getAddress()?->country ?? 'unknown') . "\\n";

// Middle link is null -> whole chain short-circuits to null -> '?? unknown':
echo ($empty?->getUser()?->getAddress()?->country ?? 'unknown') . "\\n";

// The chain itself is null (not the string), proven by var_dump:
var_dump($empty?->getUser()?->getAddress());`,
    output: `Australia
unknown
NULL`,
  },

  keyPoints: [
    "`?->` (PHP 8.0) is `->` with a built-in null check: if the left operand is `null`, the whole chain evaluates to `null`.",
    "It **short-circuits** — the moment a link is null, no further method calls or property reads in the chain execute.",
    "Use it for **objects**; for missing array keys keep using `??`. Combine the two: `$a?->b()?->c ?? $default`.",
    "It replaces the nested `isset()`/`if` pyramids you wrote in 5.5 with a single readable line.",
    "You can't use `?->` as an assignment target or pass its result by reference.",
    "Reach for it only where `null` is legitimately expected — don't let it silently hide real bugs.",
  ],

  interview: [
    {
      q: "What does the nullsafe operator `?->` do, and when did it arrive?",
      a: "It arrived in **PHP 8.0**. It behaves like `->` but if the operand to its left is `null`, the entire chain **short-circuits** and evaluates to `null` instead of throwing a fatal `Error`. So `$a?->getB()?->c` returns `null` if `$a`, `getB()`, or the intermediate object is null — no nested guards needed.",
    },
    {
      q: "How does `?->` differ from `??`, and how do you use them together?",
      a: "`??` (the null coalescing operator, **PHP 7.0**) supplies a **default** when its left side is null or undefined; it doesn't help you safely *traverse* a chain. `?->` (**8.0**) safely traverses but yields `null`, not a default. They compose: `$session?->getUser()?->getName() ?? 'guest'` — `?->` walks the chain safely, then `??` provides the fallback.",
    },
    {
      q: "What does \"short-circuiting the whole chain\" actually mean for side effects?",
      a: "Once a `?->` left operand is `null`, **the rest of the chain is skipped entirely** — subsequent method calls don't run. In `$report?->log()->flush()`, if `$report` is null then `log()` and `flush()` are never invoked. That's different from evaluating each call and checking afterward; the short-circuit prevents the downstream calls (and their side effects) from happening at all.",
    },
    {
      q: "Are there places you *can't* use `?->`?",
      a: "Yes. You can't use it on the **left side of an assignment** and you can't use it to pass a value **by reference**, because short-circuiting to `null` would make the write meaningless. It's also object-only: for possibly-missing **array keys** you still use `??` (or `isset`). And as a judgement call, don't use it where a value should never be null — a loud failure from `->` beats a silent `null` that masks a bug.",
    },
    {
      q: "Before 8.0, how did you write the equivalent of `$a?->b?->c`, and why was it worse?",
      a: "You nested `if`/`isset` checks or built a long `&&` chain like `$a !== null && $a->b !== null && ...`, often re-walking the same objects. It was verbose, easy to get subtly wrong (off-by-one in the chain, forgetting a level), and buried the intent. `?->` expresses the same guard in one line.",
    },
  ],

  quiz: [
    {
      question:
        "Given `$user` is `null`, what does `$user?->getProfile()?->bio` evaluate to in PHP 8.0?",
      options: [
        "A fatal Error is thrown",
        "An empty string",
        "null — the chain short-circuits",
        "false",
      ],
      answerIndex: 2,
      explain:
        "Because the left operand `$user` is null, `?->` short-circuits: `getProfile()` is never called and the whole expression evaluates to null — no error.",
    },
    {
      question: "Which statement about `?->` is TRUE?",
      options: [
        "It can be used as the target of an assignment, e.g. `$a?->b = 1`.",
        "It provides a default value when the chain is null.",
        "It only works for method calls, never property reads.",
        "If a link is null, no further method calls in the chain are executed.",
      ],
      answerIndex: 3,
      explain:
        "`?->` short-circuits the entire chain, so downstream methods/properties don't run. It can't be an assignment target, it yields null (not a default — that's `??`), and it works for both methods and properties.",
    },
    {
      question:
        "What's the idiomatic way to get a fallback string from a possibly-null chain?",
      options: [
        "`$a?->b()?->name`",
        "`$a?->b()?->name ?? 'default'`",
        "`isset($a->b) ? $a->b->name : 'default'`",
        "`$a->b()->name ?: 'default'`",
      ],
      answerIndex: 1,
      explain:
        "`?->` (8.0) safely walks the chain to null, then `??` (7.0) supplies the default. The bare `?->` version returns null with no fallback, and the others are either the old 5.5 pattern or unsafe if a link is null.",
    },
  ],
};

export default lesson;

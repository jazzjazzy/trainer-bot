import type { Lesson } from "../../../types";

const lesson: Lesson = {
  id: 12,
  slug: "exceptions",
  title: "Exceptions & EAFP",
  part: "Control Flow & Functions",
  estMinutes: 12,
  summary:
    "try/except/else/finally, raise ... from, the builtin exception tree — and the EAFP culture where Python uses exceptions where PHP would isset()-guard.",

  concept: `
Structurally this is the PHP exception system with different keywords. The real
adjustment is cultural: Python throws far more often than PHP does, and
catching is considered normal control flow, not a code smell.

### The keywords

\`\`\`python
try:
    value = risky()
except KeyError:                 # catch (KeyError $e) — but no binding needed
    handle_missing()
except (TypeError, ValueError) as e:   # one block, several types
    log(e)
else:                            # runs ONLY if no exception was raised
    use(value)
finally:                         # always runs — same as PHP's finally
    cleanup()
\`\`\`

Mapping for a PHP brain: \`except\` is \`catch\`, \`as e\` is the \`$e\` binding
(optional in Python), multiple \`except\` blocks work like multiple \`catch\`
blocks, and a **tuple of types** \`except (A, B):\` is PHP 8's \`catch (A | B $e)\`.
The stranger is \`else:\` — code that runs only when the \`try\` body succeeded.
PHP has no equivalent; it lets you keep the \`try\` block minimal so you don't
accidentally catch exceptions from your own follow-up code.

### Raising and chaining

\`raise ValueError("bad input")\` is \`throw new ValueError("bad input")\` — no
\`new\`, and \`raise\` on its own inside an \`except\` block **re-raises** the
current exception (PHP's \`throw $e;\`). Wrapping a low-level error in a
domain error uses \`from\`:

\`\`\`python
except ValueError as e:
    raise AppError("bad config") from e   # ≈ new AppError('...', 0, $e)
\`\`\`

That sets \`__cause__\` on the new exception — exactly PHP's \`$previous\`
constructor argument — and tracebacks print both, joined by
"The above exception was the direct cause of the following exception".

### The hierarchy (and the bare except: sin)

Python's tree: \`BaseException\` at the root, with \`Exception\` as the branch
you actually work with — think \`Throwable\` vs \`Exception\`. The builtins you'll
meet daily all extend \`Exception\`: \`ValueError\`, \`TypeError\`, \`KeyError\`,
\`IndexError\` (both under \`LookupError\`), \`FileNotFoundError\` (under
\`OSError\`), \`ZeroDivisionError\`. Unlike PHP, the **standard library raises
these constantly** — \`int("x")\` raises \`ValueError\`, \`d["missing"]\` raises
\`KeyError\` — so you know them by heart within a week.

A bare \`except:\` catches \`BaseException\` — including \`KeyboardInterrupt\`
(Ctrl-C) and \`SystemExit\` — so your script can't even be stopped. It's the
same sin as \`catch (\\Throwable $e) {}\` swallowing everything. Catch
\`Exception\` at the broadest, and prefer specific types.

### Custom exceptions are one-liners

\`\`\`python
class AppError(Exception):
    pass

class ConfigError(AppError):
    pass
\`\`\`

No constructor boilerplate: \`raise AppError("msg")\` just works, and \`str(e)\`
gives the message. Compare the ceremony of a PHP exception subclass with a
typed constructor. Domain hierarchies are cheap, so Python code defines them
freely.

### EAFP: ask forgiveness, not permission

PHP culture is **LBYL** — look before you leap: \`isset()\`, \`array_key_exists()\`,
\`file_exists()\`, then act. Python culture is **EAFP** — easier to ask
forgiveness than permission: just do it and catch the exception.

\`\`\`python
# LBYL (PHP instinct)          # EAFP (Python instinct)
if "role" in user:             try:
    role = user["role"]            role = user["role"]
else:                          except KeyError:
    role = "guest"                 role = "guest"
\`\`\`

Why EAFP wins in Python: exceptions are comparatively cheap, the try version
has no race window (the check and the use are one operation), and half the
LBYL checks would be wrong anyway (\`file_exists\` then \`open\` can still fail).
For the dict case specifically you'd really write \`user.get("role", "guest")\`
— but the pattern matters: \`StopIteration\` ends every \`for\` loop internally.
Exceptions ARE control flow in Python.
`,

  comparisons: [
    {
      label: "Catching, multiple types, finally",
      intro:
        "Parsing a user-supplied number with cleanup that must always run. Both catch two exception types in one handler and fall back to a default.",
      php: `<?php
// PHP 8.2 — union catch types
function parse(string $raw): int {
    try {
        return parseStrict($raw);
    } catch (ValueError | TypeError $e) {
        logger()->warning($e->getMessage());
        return 0;
    } finally {
        metrics()->increment('parse_calls');
    }
}`,
      ts: `# Python — tuple of types, plus an else clause
def parse(raw: str) -> int:
    try:
        value = int(raw)
    except (ValueError, TypeError) as e:
        log.warning(str(e))
        return 0
    else:
        # runs only if int() succeeded — no PHP equivalent
        log.debug("parsed ok")
        return value
    finally:
        metrics.increment("parse_calls")`,
      note:
        "except (A, B) as e ≈ catch (A | B $e); the extra else: block runs only when the try body raised nothing, keeping success-path code out of the try.",
    },
    {
      label: "Wrapping with the previous exception",
      intro:
        "Translating a low-level parse failure into a domain-level ConfigError while preserving the original cause for debugging.",
      php: `<?php
class ConfigError extends RuntimeException {}

try {
    $port = parsePort($raw);
} catch (ValueError $e) {
    // $previous rides along in the 3rd argument
    throw new ConfigError('Invalid port', 0, $e);
}`,
      ts: `class ConfigError(Exception):
    pass

try:
    port = int(raw)
except ValueError as e:
    # 'from e' sets __cause__ — Python's $previous
    raise ConfigError("Invalid port") from e`,
      note:
        "raise X from e chains exceptions like PHP's $previous; the traceback then prints BOTH, labelled 'the direct cause of the following exception'.",
    },
    {
      label: "EAFP vs LBYL",
      intro:
        "Reading an optional key from request data. PHP guards first; idiomatic Python attempts the access and handles the failure.",
      php: `<?php
// LBYL — check, then act
$role = isset($data['role'])
    ? $data['role']
    : 'guest';

// or the modern spelling
$role = $data['role'] ?? 'guest';`,
      ts: `# EAFP — act, then handle
try:
    role = data["role"]
except KeyError:
    role = "guest"

# for dicts there's also a direct ?? equivalent:
role = data.get("role", "guest")`,
      note:
        "d[k] raises KeyError on a missing key (no PHP-style notice-and-null). dict.get(k, default) is Python's ??, but try/except KeyError is idiomatic and not considered wasteful.",
    },
  ],

  playground: {
    lang: "python",
    intro:
      "Trace the three parse_age calls. Watch WHEN the finally line prints relative to each returned value, and what the chained exception exposes.",
    code: `class AppError(Exception):
    pass

def parse_age(data):
    try:
        age = int(data["age"])
    except KeyError:
        return "no age key"
    except (TypeError, ValueError) as e:
        raise AppError(f"bad age: {data['age']!r}") from e
    else:
        return f"age is {age}"
    finally:
        print(f"  checked {data}")

print(parse_age({"age": "42"}))
print(parse_age({"name": "Ada"}))

try:
    parse_age({"age": "ten"})
except AppError as e:
    print(f"caught: {e}")
    print(f"cause: {type(e.__cause__).__name__}")

print(issubclass(KeyError, LookupError))
print(issubclass(AppError, Exception))`,
    output: `  checked {'age': '42'}
age is 42
  checked {'name': 'Ada'}
no age key
  checked {'age': 'ten'}
caught: bad age: 'ten'
cause: ValueError
True
True`,
  },

  keyPoints: [
    "`try`/`except`/`else`/`finally` — `except` is `catch`, `as e` binds the exception, a tuple `except (A, B):` is PHP 8's `catch (A | B $e)`.",
    "`else:` runs only when the try body raised nothing — no PHP equivalent; it keeps success-path code from being accidentally caught.",
    "`raise ValueError(\"...\")` replaces `throw new`; bare `raise` re-throws; `raise X from e` is PHP's `$previous` chaining (stored on `__cause__`).",
    "Hierarchy: `BaseException` > `Exception` > builtins (`ValueError`, `KeyError`, `FileNotFoundError`...). Never write a bare `except:` — it swallows `KeyboardInterrupt`, like blindly catching `Throwable`.",
    "Custom exceptions are one-liners: `class AppError(Exception): pass` — far lighter than PHP subclassing, so domain hierarchies are cheap.",
    "EAFP over LBYL: attempt the operation and catch the failure instead of `isset()`-style guarding — exceptions are idiomatic control flow in Python.",
  ],

  interview: [
    {
      q: "Explain EAFP and how it differs from how you'd write PHP.",
      a: "EAFP — 'easier to ask forgiveness than permission' — means you perform the operation and handle the exception, instead of PHP's LBYL habit of `isset()`/`array_key_exists()`/`file_exists()` guards before acting. So `try: role = data['role'] except KeyError:` rather than an isset-ternary. It's preferred because the attempt and the check are a single atomic step (no race between `file_exists` and `open`), and because Python exceptions are cheap enough that this isn't a performance smell. The stdlib is built on it — even `for` loops terminate via `StopIteration` internally.",
    },
    {
      q: "What's wrong with a bare `except:` clause?",
      a: "A bare `except:` catches `BaseException`, the true root of the tree — which includes `KeyboardInterrupt` and `SystemExit`. So Ctrl-C and `sys.exit()` get swallowed and your process becomes unkillable-by-politeness, exactly like a PHP `catch (\\Throwable $e) {}` that eats engine errors. The widest you should go is `except Exception:` (and usually log or re-raise), but the real answer is catching the specific types you can actually handle.",
    },
    {
      q: "How do you preserve the original error when translating exceptions across layers?",
      a: "`raise DomainError('message') from original`. That stores the original on `__cause__` — the direct analogue of passing `$previous` as the third constructor argument in PHP — and the traceback prints both exceptions with 'the above exception was the direct cause of the following exception'. Even without `from`, an exception raised inside an `except` block gets the in-flight one attached as `__context__` automatically, which PHP doesn't do at all. `raise ... from None` suppresses the chain when the original is just noise.",
    },
    {
      q: "When does the `else` clause of a try statement run, and why use it?",
      a: "It runs only if the `try` body completed without raising — after `try`, before `finally`. PHP has no counterpart. Its point is scope discipline: if you put the success-path code inside the `try`, your `except ValueError:` might catch a `ValueError` from that follow-up code, masking a different bug. `else` lets the `try` block contain exactly the one risky operation and nothing else.",
    },
  ],

  quiz: [
    {
      question: "What is the Python equivalent of PHP's `catch (TypeError | ValueError $e)`?",
      options: [
        "except TypeError | ValueError as e:",
        "except (TypeError, ValueError) as e:",
        "except TypeError, ValueError as e:",
        "catch (TypeError, ValueError) as e:",
      ],
      answerIndex: 1,
      explain:
        "Multiple exception types are caught with a TUPLE: except (A, B) as e:. The pipe syntax is PHP's; except A, B was ancient Python 2 syntax and is an error in Python 3.",
    },
    {
      question: "Why is a bare `except:` considered dangerous?",
      options: [
        "It's a syntax error since Python 3.10",
        "It only catches Exception, missing OS errors",
        "It catches BaseException, including KeyboardInterrupt and SystemExit",
        "It silently converts errors to warnings",
      ],
      answerIndex: 2,
      explain:
        "Bare except: catches BaseException — the root above Exception — so Ctrl-C (KeyboardInterrupt) and sys.exit() (SystemExit) are swallowed too. It's the PHP equivalent of blindly catching Throwable. Use except Exception: at the very broadest.",
    },
    {
      question: "What does `raise AppError('boom') from e` do that `raise AppError('boom')` alone doesn't?",
      options: [
        "It re-raises e instead of AppError",
        "It sets e as __cause__ — like passing $previous in PHP — and the traceback shows both",
        "It suppresses e's traceback entirely",
        "It makes AppError a subclass of e's type",
      ],
      answerIndex: 1,
      explain:
        "from e performs explicit exception chaining: the original lands on __cause__ (PHP's getPrevious()), and tracebacks print both exceptions labelled as cause and effect. `from None` is the spelling that suppresses chaining.",
    },
    {
      question: "In the try/except/else/finally structure, when does `else` execute?",
      options: [
        "Always, after finally",
        "Only when an exception was caught",
        "Only when the try body raised no exception",
        "Only when no except clause matched",
      ],
      answerIndex: 2,
      explain:
        "else runs exactly when the try body completed cleanly — before finally. It exists so success-path code sits outside the try block and can't have its own exceptions accidentally caught by your handlers.",
    },
  ],
};

export default lesson;

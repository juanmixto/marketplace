# `test/contracts/`

Cross-cutting invariants. A test belongs here if **it is agnostic of any single feature** and would fire if any part of the repo violated a global rule.

Typical examples:

- i18n parity / no hardcoded literals
- Dark-mode compliance across surfaces
- Accessibility contracts (aria-busy, focus, etc.)
- SEO metadata, security headers, performance image rules
- Layout / footer / navigation invariants

Most contract tests read source files statically (`readFileSync`) and assert that patterns exist or do not exist. They run in the fast non-DB suite alongside `features/`.

## Adding a new contract test

1. The rule must apply to **the whole repo**, not a single feature. If deleting one feature would make the test irrelevant, it belongs in `features/` instead.
2. Prefer static source assertions over runtime — contracts should run fast and without I/O.
3. Failure messages should point the reader at the rule, not at one offending line.

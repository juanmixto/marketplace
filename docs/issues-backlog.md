# Technical issue backlog

This file is a planning aid for future work. Treat it as a list of likely follow-up areas, not as an up-to-the-minute task tracker.

## How to use it

- Prefer additive, backward-compatible changes.
- Do not change checkout, payments, or auth behavior without tests.
- Keep work small and reversible.
- If an item is no longer true, update or remove it instead of letting the backlog drift.

## Common follow-up areas

- Checkout reliability and idempotency
- Stripe webhook handling and replay safety
- Schema and migration hardening
- Auth and route protection
- Search, SEO, and content quality
- Analytics coverage
- PWA polish
- Internationalization and translation quality

## When adding a new issue

- Describe the problem clearly.
- Point to the relevant files or flow.
- State the expected behavior.
- Include tests or acceptance criteria.
- Keep the scope small enough for one PR or a short series of PRs.

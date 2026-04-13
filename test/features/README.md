# `test/features/`

Per-feature unit and feature tests. A test belongs here if **deleting the feature it covers would make the test irrelevant**.

Typical examples:

- Domain logic for orders, catalog, reviews, payments, vendors, admin
- Component contracts tied to a specific UI surface
- API route handlers tested with mocks (no real DB)
- Pure helpers (`utils`, `roles`, `cache-tags`, etc.)

These tests must **not** require a real database. Anything that hits Prisma/Postgres lives in `test/integration/`. Anything that asserts a global rule across the repo lives in `test/contracts/`.

## Adding a new feature test

1. Co-locate by the domain it covers when naming (`orders-…`, `catalog-…`, `vendor-…`).
2. Mock external dependencies. If you cannot, the test belongs in `integration/`.
3. Tests here should run in well under a second each.

# API contract tests

> Phase 6 of the contract-hardening plan. Frozen response shapes for `/api/**` route handlers.

These tests don't exercise behavior — `test/integration/` already does that. They lock the **shape** of what handlers return so accidental field renames, status changes, or envelope drift fail CI before they ship.

## Scope

- **In scope**: response envelope, status codes, error `code` discriminants, success-payload field presence, request-validation contracts.
- **Out of scope**: business logic, side effects on the database, cross-actor authorization (covered by `test/integration/api-*-auth.test.ts`).

## What's covered today

| File | Contract under test |
|------|---------------------|
| [`error-envelope.test.ts`](./error-envelope.test.ts) | `apiError(...)` and every helper in `src/lib/api-response.ts` produce the canonical `{ error, code, details?, fieldErrors? }` envelope, with the right status + headers. |

## How to add a route

Pattern (no DB required when you can mock the auth session and the handler's external deps):

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { POST } from '@/app/api/some/route'

const successSchema = z.object({
  id: z.string(),
  // ...whatever fields the handler currently returns
}).strict()

test('POST /api/some — happy path response shape', async () => {
  // arrange: build a Request, mock auth/db as needed
  const req = new Request('http://localhost/api/some', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ /* ... */ }),
  })
  const res = await POST(req)
  assert.equal(res.status, 201)
  successSchema.parse(await res.json())
})
```

For routes that genuinely need a live DB, put the contract test under `test/integration/contracts/<route>.contract.test.ts` instead — it shares the integration runner's DB fixture lifecycle.

## Convention: use `.strict()` on the success schema

Use Zod's `.strict()` (rejects extra keys) on success-response schemas so that adding a new field is an explicit choice with a corresponding test update. For tolerant evolutions (e.g. additive fields in webhook events), use `.passthrough()` and document why inline.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  openIncidentBodySchema,
  incidentMessageBodySchema,
  INCIDENT_DESCRIPTION_LIMITS,
  INCIDENT_MESSAGE_LIMITS,
} from '@/shared/types/incidents'
import { IncidentType } from '@/generated/prisma/enums'

/**
 * Schema-freeze for the buyer-facing incidents endpoints. Both bodies
 * cross the HTTP boundary (buyer client → server route) and are
 * consumed by:
 *
 *   - src/app/api/incidents/route.ts                 (POST /api/incidents)
 *   - src/app/api/incidents/[id]/messages/route.ts   (POST .../messages)
 *
 * The integration tests in test/integration/api-incidents-auth.test.ts
 * exercise the auth/ownership gate; this file pins the shape so a
 * silent rename of `description` → `body` (or similar) fails CI before
 * the buyer form notices.
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(actualKeys, expectedKeys, `${label}: schema key set drifted.`)

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()

  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

test('openIncidentBodySchema — frozen shape', () => {
  assertShape('openIncidentBodySchema', openIncidentBodySchema as never, {
    required: ['orderId', 'type', 'description'],
    optional: ['attachments'],
  })
})

test('INCIDENT_DESCRIPTION_LIMITS — frozen bounds', () => {
  assert.equal(INCIDENT_DESCRIPTION_LIMITS.min, 10)
  assert.equal(INCIDENT_DESCRIPTION_LIMITS.max, 5000)
})

test('openIncidentBodySchema — rejects short description', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'x'.repeat(INCIDENT_DESCRIPTION_LIMITS.min - 1),
  })
  assert.equal(result.success, false)
})

test('openIncidentBodySchema — rejects description over the cap', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'x'.repeat(INCIDENT_DESCRIPTION_LIMITS.max + 1),
  })
  assert.equal(result.success, false)
})

test('openIncidentBodySchema — rejects unknown incident type', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: 'TOTALLY_FAKE_TYPE',
    description: 'A perfectly long description that explains the issue.',
  })
  assert.equal(result.success, false)
})

test('incidentMessageBodySchema — frozen shape', () => {
  assertShape('incidentMessageBodySchema', incidentMessageBodySchema as never, {
    required: ['body'],
    optional: ['attachments'],
  })
})

test('INCIDENT_MESSAGE_LIMITS — frozen bounds', () => {
  assert.equal(INCIDENT_MESSAGE_LIMITS.min, 1)
  assert.equal(INCIDENT_MESSAGE_LIMITS.max, 5000)
})

test('incidentMessageBodySchema — rejects empty body', () => {
  const result = incidentMessageBodySchema.safeParse({ body: '' })
  assert.equal(result.success, false)
})

test('openIncidentBodySchema — accepts a local /uploads attachment URL', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'A perfectly long description that explains the issue.',
    attachments: ['/uploads/incidents/usr_1/abc.jpg'],
  })
  assert.equal(result.success, true)
})

test('openIncidentBodySchema — accepts a Vercel Blob attachment URL', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'A perfectly long description that explains the issue.',
    attachments: ['https://abc.public.blob.vercel-storage.com/incidents/usr_1/abc.jpg'],
  })
  assert.equal(result.success, true)
})

test('openIncidentBodySchema — rejects an attachment URL on a foreign host', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'A perfectly long description that explains the issue.',
    attachments: ['https://attacker.example.com/payload.jpg'],
  })
  assert.equal(result.success, false)
})

test('openIncidentBodySchema — rejects more than 5 attachments', () => {
  const result = openIncidentBodySchema.safeParse({
    orderId: 'ord_1',
    type: IncidentType.WRONG_ITEM,
    description: 'A perfectly long description that explains the issue.',
    attachments: Array.from({ length: 6 }, (_, i) => `/uploads/incidents/usr_1/${i}.jpg`),
  })
  assert.equal(result.success, false)
})

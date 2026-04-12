import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearOtherDefaults,
  enforceSingleDefault,
  promoteOldestAsDefault,
  type AddressTxClient,
} from '@/lib/address-defaults'

type Call = { method: string; args: unknown }

function createMockTx(options: {
  findFirstResult?: { id: string } | null
  findManyResult?: { id: string }[]
} = {}): { tx: AddressTxClient; calls: Call[] } {
  const calls: Call[] = []
  const tx: AddressTxClient = {
    address: {
      updateMany: async (args) => {
        calls.push({ method: 'updateMany', args })
        return { count: 1 }
      },
      findFirst: async (args) => {
        calls.push({ method: 'findFirst', args })
        return options.findFirstResult ?? null
      },
      findMany: async (args) => {
        calls.push({ method: 'findMany', args })
        return options.findManyResult ?? []
      },
      update: async (args) => {
        calls.push({ method: 'update', args })
        return {}
      },
    },
  }
  return { tx, calls }
}

test('clearOtherDefaults clears defaults for the user', async () => {
  const { tx, calls } = createMockTx()
  await clearOtherDefaults(tx, 'user-1')

  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.method, 'updateMany')
  assert.deepEqual(calls[0]!.args, {
    where: { userId: 'user-1', isDefault: true },
    data: { isDefault: false },
  })
})

test('clearOtherDefaults excludes the address being promoted', async () => {
  const { tx, calls } = createMockTx()
  await clearOtherDefaults(tx, 'user-1', 'addr-keep')

  assert.deepEqual(calls[0]!.args, {
    where: { userId: 'user-1', isDefault: true, id: { not: 'addr-keep' } },
    data: { isDefault: false },
  })
})

test('promoteOldestAsDefault returns null when no addresses remain', async () => {
  const { tx, calls } = createMockTx({ findFirstResult: null })
  const result = await promoteOldestAsDefault(tx, 'user-1')

  assert.equal(result, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.method, 'findFirst')
})

test('promoteOldestAsDefault sets the oldest remaining address as default', async () => {
  const { tx, calls } = createMockTx({ findFirstResult: { id: 'addr-2' } })
  const result = await promoteOldestAsDefault(tx, 'user-1')

  assert.equal(result, 'addr-2')
  assert.equal(calls.length, 2)
  assert.equal(calls[0]!.method, 'findFirst')
  assert.deepEqual(calls[0]!.args, {
    where: { userId: 'user-1' },
    orderBy: { createdAt: 'asc' },
  })
  assert.equal(calls[1]!.method, 'update')
  assert.deepEqual(calls[1]!.args, {
    where: { id: 'addr-2' },
    data: { isDefault: true },
  })
})

test('promoteOldestAsDefault picks ascending createdAt order', async () => {
  const { tx, calls } = createMockTx({ findFirstResult: { id: 'addr-x' } })
  await promoteOldestAsDefault(tx, 'user-9')

  const findCall = calls.find((c) => c.method === 'findFirst')!
  assert.deepEqual((findCall.args as { orderBy: unknown }).orderBy, { createdAt: 'asc' })
})

test('enforceSingleDefault returns null when user has no defaults', async () => {
  const { tx, calls } = createMockTx({ findManyResult: [] })
  const result = await enforceSingleDefault(tx, 'user-1')

  assert.equal(result, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.method, 'findMany')
  // Must order by updatedAt desc so the most recent wins.
  assert.deepEqual((calls[0]!.args as { orderBy: unknown }).orderBy, {
    updatedAt: 'desc',
  })
})

test('enforceSingleDefault no-ops when exactly one default exists', async () => {
  const { tx, calls } = createMockTx({ findManyResult: [{ id: 'addr-only' }] })
  const result = await enforceSingleDefault(tx, 'user-1')

  assert.equal(result, 'addr-only')
  // Only the read happens — no updateMany when invariant already holds.
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.method, 'findMany')
})

test('enforceSingleDefault keeps newest and clears the rest when multiple defaults', async () => {
  const { tx, calls } = createMockTx({
    findManyResult: [
      { id: 'addr-newest' },
      { id: 'addr-mid' },
      { id: 'addr-oldest' },
    ],
  })
  const result = await enforceSingleDefault(tx, 'user-1')

  assert.equal(result, 'addr-newest')
  assert.equal(calls.length, 2)
  assert.equal(calls[1]!.method, 'updateMany')
  assert.deepEqual(calls[1]!.args, {
    where: { userId: 'user-1', isDefault: true, id: { not: 'addr-newest' } },
    data: { isDefault: false },
  })
})

test('PUT-style flow heals when editing an already-default address', async () => {
  // Reproduces the bug: Address A is already default, but Address B is *also*
  // stuck as default in DB (legacy/race state). The PUT route now always
  // calls clearOtherDefaults when validated.isDefault is true, so editing A
  // (with isDefault still true) should still demote any other defaults.
  const { tx, calls } = createMockTx()
  await clearOtherDefaults(tx, 'user-7', 'addr-A')

  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.method, 'updateMany')
  assert.deepEqual(calls[0]!.args, {
    where: { userId: 'user-7', isDefault: true, id: { not: 'addr-A' } },
    data: { isDefault: false },
  })
})

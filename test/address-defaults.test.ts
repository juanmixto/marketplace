import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearOtherDefaults,
  promoteOldestAsDefault,
  type AddressTxClient,
} from '@/lib/address-defaults'

type Call = { method: string; args: unknown }

function createMockTx(options: {
  findFirstResult?: { id: string } | null
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

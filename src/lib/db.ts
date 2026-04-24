import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getServerEnv } from '@/lib/env'

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
  return new PrismaClient({ adapter })
}

declare global {
  var prismaGlobal: ReturnType<typeof createPrismaClient> | undefined
}

// Lazy instantiation. Calling `createPrismaClient()` at module load
// means `next build` page-data collection runs env validation before
// Vercel preview has a chance to inject DATABASE_URL — any route that
// imports `db` kills the whole build. The Proxy defers the client
// construction until the first property read, which only happens when
// a server action / route handler actually runs.
function getClient(): PrismaClient {
  if (!globalThis.prismaGlobal) {
    globalThis.prismaGlobal = createPrismaClient()
  }
  return globalThis.prismaGlobal
}

const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver)
  },
})

export { db }

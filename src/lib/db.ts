import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getServerEnv } from '@/lib/env'
import { slowQueryExtension } from '@/lib/db-slow-query'

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getServerEnv().databaseUrl })
  const base = new PrismaClient({ adapter })
  // #1216: every operation is timed and `db.query.slow` is logged for
  // anything that crosses `DB_SLOW_QUERY_MS` (default 500ms).
  // $extends returns a dynamic client whose surface is structurally
  // identical to PrismaClient for the model query methods the rest of
  // the codebase uses; the cast keeps consumers untouched.
  return base.$extends(slowQueryExtension) as unknown as PrismaClient
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

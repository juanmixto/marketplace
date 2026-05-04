// #1142: helper for any code path that must invalidate every active
// JWT for a user — anonimization (GDPR Article 17), administrative
// suspension, hard role change, password reset.
//
// The JWT callback in src/lib/auth.ts stamps `tokenVersion` onto the
// token at login and re-checks it on each refresh tick (~60s). A
// stale token has its identity claims stripped, so requireAuth /
// getActionSession reject it on the very next request.
//
// Always pass the Prisma TransactionClient when the bump must be
// atomic with the surrounding mutation (the canonical case is
// `/api/account/delete`, where the anonimization and the version
// bump must commit together — half-anonimized + still-logged-in is
// the worst outcome).

import type { Prisma } from '@/generated/prisma/client'
import { db as defaultDb } from '@/lib/db'

interface TokenVersionWriter {
  user: {
    update: (args: Prisma.UserUpdateArgs) => Promise<unknown>
  }
}

export async function bumpTokenVersion(
  userId: string,
  client?: TokenVersionWriter | Prisma.TransactionClient,
): Promise<void> {
  const writer = (client ?? defaultDb) as TokenVersionWriter
  await writer.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  })
}

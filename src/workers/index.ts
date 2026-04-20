/**
 * Worker entrypoint. Run with `npm run worker`.
 *
 * The worker is a separate Node process that shares the Postgres
 * instance (via pg-boss) with the web app but runs in its own
 * container / dyno. Heavy ingestion work lives here so the Next.js
 * request/response cycle stays untouched.
 *
 * Phase 1 scope: boot pg-boss, register no job handlers yet, stay
 * alive to prove the deployment story. Handlers land in PR-C
 * (telegram.sync, telegram.mediaDownload). The kill switch is
 * checked inside each handler, not at the worker level, so a flipped
 * flag stops work immediately without needing a redeploy.
 */

import { getQueue, stopQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'

async function main() {
  logger.info('worker.starting', {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    pid: process.pid,
  })

  await getQueue()

  // PR-C will register handlers here, e.g.:
  //   await registerHandler('telegram.sync', telegramSyncHandler)
  //   await registerHandler('telegram.mediaDownload', telegramMediaDownloadHandler)

  logger.info('worker.ready')

  const shutdown = async (signal: string) => {
    logger.info('worker.shutdown_signal', { signal })
    try {
      await stopQueue()
    } catch (err) {
      logger.error('worker.shutdown_error', { error: err })
    }
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error('worker.fatal', { error: err })
  process.exit(1)
})

import PgBoss from 'pg-boss'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Thin wrapper around pg-boss so the rest of the app never imports
 * the library directly. Responsibilities:
 *
 *   - Lazy singleton — only constructed on demand so Next.js build
 *     (which transitively loads server modules) stays cheap.
 *   - Uniform retry policy for ingestion jobs (exponential backoff,
 *     max 5 attempts before DLQ).
 *   - Singleton key support so per-chat / per-file jobs can't stack.
 *
 * pg-boss creates its own `pgboss` schema in the same Postgres
 * database; no extra infra. This module does NOT start the worker
 * loop — that's the job of `src/workers/index.ts`. Server actions
 * use `enqueue()`; workers use `registerHandler()` + `start()`.
 */

let instance: PgBoss | null = null
let startPromise: Promise<PgBoss> | null = null
const ensuredQueues = new Set<string>()

async function ensureQueue(boss: PgBoss, name: string): Promise<void> {
  if (ensuredQueues.has(name)) return
  // pg-boss v10 made queues an explicit registration: send()/work()
  // silently no-op when the queue does not exist. createQueue is
  // idempotent — it throws if the queue already exists, which we treat
  // as success.
  try {
    await boss.createQueue(name)
  } catch {
    // already exists; fine
  }
  ensuredQueues.add(name)
}

async function createInstance(): Promise<PgBoss> {
  const { databaseUrl } = getServerEnv()
  const boss = new PgBoss({
    connectionString: databaseUrl,
    // Defaults; individual jobs can override at send time.
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    // Keep completed jobs around long enough for the admin panel to
    // display them; DLQ-like inspection lives in `IngestionJob`.
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,
  })
  boss.on('error', (err) => {
    logger.error('queue.pgboss_error', { error: err })
  })
  return boss
}

export async function getQueue(): Promise<PgBoss> {
  if (instance) return instance
  if (!startPromise) {
    startPromise = (async () => {
      const boss = await createInstance()
      await boss.start()
      instance = boss
      logger.info('queue.started')
      return boss
    })()
  }
  return startPromise
}

export interface EnqueueOptions {
  /**
   * When set, pg-boss will reject a second enqueue of the same name
   * with an identical singletonKey if one is already active. Use this
   * for "one sync per chat" and "one download per file" semantics.
   */
  singletonKey?: string
  /**
   * Override default retry policy (useful for jobs that shouldn't
   * retry, e.g. jobs that are expected to be idempotent per-trigger).
   */
  retryLimit?: number
  retryDelay?: number
  startAfterSeconds?: number
}

export async function enqueue<TData extends Record<string, unknown>>(
  name: string,
  data: TData,
  opts: EnqueueOptions = {},
): Promise<string | null> {
  const boss = await getQueue()
  await ensureQueue(boss, name)
  const options: PgBoss.SendOptions = {}
  if (opts.singletonKey) options.singletonKey = opts.singletonKey
  if (opts.retryLimit !== undefined) options.retryLimit = opts.retryLimit
  if (opts.retryDelay !== undefined) options.retryDelay = opts.retryDelay
  if (opts.startAfterSeconds !== undefined) {
    options.startAfter = opts.startAfterSeconds
  }
  const jobId = await boss.send(name, data, options)
  logger.info('queue.enqueued', { name, jobId, singletonKey: opts.singletonKey })
  return jobId
}

export type JobHandler<TData = Record<string, unknown>> = (
  job: PgBoss.Job<TData>,
) => Promise<void>

export interface RegisterHandlerOptions {
  /**
   * Max jobs fetched per poll AND executed concurrently. pg-boss v10
   * dropped the v9 `teamSize` knob; concurrency is now expressed
   * through `batchSize` + parallel handling of the returned array.
   * Default 1 preserves the old serial behaviour for callers that
   * do not opt in. Raise for CPU-bound, idempotent handlers (Phase 2
   * processor) to drain backlog faster. Do not raise for handlers
   * that talk to a rate-limited external service (Telegram sync).
   */
  batchSize?: number
  /**
   * How often pg-boss polls `pgboss.job` for new work, in seconds.
   * Lower = lower latency on the first job after a queue goes empty;
   * higher = less idle DB load. Default 2 (pg-boss native default).
   */
  pollingIntervalSeconds?: number
}

export async function registerHandler<TData = Record<string, unknown>>(
  name: string,
  handler: JobHandler<TData>,
  options: RegisterHandlerOptions = {},
): Promise<void> {
  const boss = await getQueue()
  await ensureQueue(boss, name)
  const workOpts: PgBoss.WorkOptions = {}
  if (options.batchSize !== undefined) workOpts.batchSize = options.batchSize
  if (options.pollingIntervalSeconds !== undefined) {
    workOpts.pollingIntervalSeconds = options.pollingIntervalSeconds
  }
  await boss.work<TData>(name, workOpts, async (job) => {
    // pg-boss v10 delivers an array of jobs (size 1 by default,
    // up to `batchSize` if set). Run them concurrently so a higher
    // batchSize translates into real throughput, not just larger
    // serial batches. Per-job errors do not poison the batch —
    // pg-boss retries each job independently based on its own
    // failure status.
    const jobs = Array.isArray(job) ? job : [job]
    await Promise.all(jobs.map((j) => handler(j)))
  })
  logger.info('queue.handler_registered', {
    name,
    batchSize: options.batchSize ?? 1,
    pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2,
  })
}

/**
 * Graceful shutdown. Called by the worker on SIGTERM so in-flight
 * jobs finish before the process exits.
 */
export async function stopQueue(): Promise<void> {
  if (!instance) return
  await instance.stop({ graceful: true, timeout: 30_000 })
  instance = null
  startPromise = null
  ensuredQueues.clear()
  logger.info('queue.stopped')
}

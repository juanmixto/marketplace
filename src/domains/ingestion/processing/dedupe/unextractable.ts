import { logger } from '@/lib/logger'
import { isStageEnabled } from '../flags'

/**
 * Dedupe scanner for `PRODUCT_NO_PRICE` (and PRODUCT-classified but
 * zero-drafts) extractions. Lives in its own module and persists
 * into its own table `IngestionUnextractableDedupeCandidate` so the
 * product-draft dedupe stays clean (user rejected polymorphic
 * target columns in the existing table).
 *
 * Policy:
 *   - STRONG match: same `tgAuthorId` AND same normalised first-line
 *     text → LOW risk → auto-resolve the `UNEXTRACTABLE_PRODUCT`
 *     review queue item (ENQUEUED → AUTO_RESOLVED). The newer
 *     extraction is recorded as `autoApplied=true` on the candidate
 *     row; no draft exists so no canonical pointer is needed —
 *     `leftExtractionId` / `rightExtractionId` carry the lineage.
 *   - HEURISTIC match: different authors, same normalised first-line
 *     → MEDIUM risk → candidate row with `autoApplied=false`.
 *     Happens with forwarded posts; requires human review.
 *   - Anything weaker: no candidate.
 */

const LOG_SCOPE = 'ingestion.processing.unextractable-dedupe'

export interface UnextractableExtractionRow {
  id: string
  extractorVersion: string
  classification: string | null
  // `inputSnapshot` is a JSON blob — we only read its `text` and
  // `tgAuthorId` fields. Typed loosely to avoid binding this module
  // to the Prisma generated type graph.
  inputSnapshot: { text?: unknown; tgAuthorId?: unknown } | null
}

export interface UnextractableScannerDb {
  ingestionExtractionResult: {
    findUnique(args: {
      where: { id: string }
    }): Promise<UnextractableExtractionRow | null>
    findMany(args: {
      where: {
        id: { not: string }
        extractorVersion: string
        classification: { in: Array<'PRODUCT_NO_PRICE'> }
      }
      select: {
        id: true
        extractorVersion: true
        classification: true
        inputSnapshot: true
      }
      take?: number
    }): Promise<UnextractableExtractionRow[]>
  }
  ingestionUnextractableDedupeCandidate: {
    upsert(args: {
      where: {
        leftExtractionId_rightExtractionId_kind: {
          leftExtractionId: string
          rightExtractionId: string
          kind: 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
        }
      }
      create: {
        leftExtractionId: string
        rightExtractionId: string
        kind: 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
        riskClass: 'LOW' | 'MEDIUM' | 'HIGH'
        reasonJson: unknown
        autoApplied: boolean
        autoAppliedAt: Date | null
      }
      update: Record<string, never>
    }): Promise<{ id: string; autoApplied: boolean }>
    update(args: {
      where: { id: string }
      data: { autoApplied: true; autoAppliedAt: Date }
    }): Promise<unknown>
  }
  ingestionReviewQueueItem: {
    update(args: {
      where: {
        kind_targetId: {
          kind: 'UNEXTRACTABLE_PRODUCT'
          targetId: string
        }
      }
      data: {
        state: 'AUTO_RESOLVED'
        autoResolvedAt: Date
        autoResolvedReason: string
      }
    }): Promise<unknown>
  }
  $transaction<T>(fn: (tx: UnextractableScannerDb) => Promise<T>): Promise<T>
}

export interface UnextractableScanInput {
  extractionId: string
  correlationId: string
}

export interface UnextractableScanResult {
  status: 'OK' | 'KILLED' | 'EXTRACTION_NOT_FOUND' | 'ALREADY_MERGED' | 'NOT_UNEXTRACTABLE'
  extractionId: string
  candidatesCreated: number
  autoMerged: number
  enqueuedForReview: number
  correlationId: string
}

export interface UnextractableScannerDeps {
  db: UnextractableScannerDb
  now: () => Date
  maxCandidatesPerScan?: number
  isStageEnabledFn?: (correlationId: string) => Promise<boolean>
}

const DEFAULT_MAX = 200

export async function scanUnextractableDedupe(
  input: UnextractableScanInput,
  deps: UnextractableScannerDeps,
): Promise<UnextractableScanResult> {
  const enabled = await (deps.isStageEnabledFn ?? defaultStageProbe)(
    input.correlationId,
  )
  if (!enabled) return empty(input, 'KILLED')

  const target = await deps.db.ingestionExtractionResult.findUnique({
    where: { id: input.extractionId },
  })
  if (!target) {
    logger.warn(`${LOG_SCOPE}.extraction_not_found`, {
      extractionId: input.extractionId,
      correlationId: input.correlationId,
    })
    return empty(input, 'EXTRACTION_NOT_FOUND')
  }
  if (target.classification !== 'PRODUCT_NO_PRICE') {
    // Scanner is intentionally narrow to PRODUCT_NO_PRICE. If the
    // classifier said PRODUCT but drafts=0 (the other UNEXTRACTABLE
    // source) we currently do NOT dedupe those — iter-2 stops here.
    // Iter-3 can extend if metrics justify it.
    return empty(input, 'NOT_UNEXTRACTABLE')
  }

  const { text: targetText, author: targetAuthor } = readSnap(target.inputSnapshot)
  if (!targetText) {
    // No text means nothing to compare. Dedupe cannot fire safely.
    return empty(input, 'NOT_UNEXTRACTABLE')
  }

  const max = deps.maxCandidatesPerScan ?? DEFAULT_MAX
  const peers = await deps.db.ingestionExtractionResult.findMany({
    where: {
      id: { not: target.id },
      extractorVersion: target.extractorVersion,
      classification: { in: ['PRODUCT_NO_PRICE'] },
    },
    select: {
      id: true,
      extractorVersion: true,
      classification: true,
      inputSnapshot: true,
    },
    take: max,
  })

  let candidatesCreated = 0
  let autoMerged = 0
  let enqueuedForReview = 0

  const targetFirst = normaliseFirstLine(targetText)
  if (targetFirst.length === 0) {
    return empty(input, 'NOT_UNEXTRACTABLE')
  }

  for (const peer of peers) {
    const { text: peerText, author: peerAuthor } = readSnap(peer.inputSnapshot)
    if (!peerText) continue
    const peerFirst = normaliseFirstLine(peerText)
    if (peerFirst !== targetFirst) continue

    const sameAuthor = peerAuthor !== null && targetAuthor !== null && peerAuthor === targetAuthor

    const kind: 'STRONG' | 'HEURISTIC' = sameAuthor ? 'STRONG' : 'HEURISTIC'
    const risk: 'LOW' | 'MEDIUM' = sameAuthor ? 'LOW' : 'MEDIUM'
    const reason = sameAuthor
      ? 'sameAuthorSameNormalisedFirstLine'
      : 'differentAuthorSameNormalisedFirstLine'

    await deps.db.$transaction(async (tx) => {
      const candidate = await tx.ingestionUnextractableDedupeCandidate.upsert({
        where: {
          leftExtractionId_rightExtractionId_kind: {
            leftExtractionId: target.id,
            rightExtractionId: peer.id,
            kind,
          },
        },
        create: {
          leftExtractionId: target.id,
          rightExtractionId: peer.id,
          kind,
          riskClass: risk,
          reasonJson: { reason, firstLine: targetFirst },
          autoApplied: false,
          autoAppliedAt: null,
        },
        update: {},
      })
      candidatesCreated += 1

      if (sameAuthor && !candidate.autoApplied) {
        // Mark candidate row auto-applied and transition the target
        // extraction's UNEXTRACTABLE_PRODUCT queue item to
        // AUTO_RESOLVED. The older peer stays canonical (its own
        // queue row untouched).
        await tx.ingestionUnextractableDedupeCandidate.update({
          where: { id: candidate.id },
          data: { autoApplied: true, autoAppliedAt: deps.now() },
        })
        await tx.ingestionReviewQueueItem.update({
          where: {
            kind_targetId: {
              kind: 'UNEXTRACTABLE_PRODUCT',
              targetId: target.id,
            },
          },
          data: {
            state: 'AUTO_RESOLVED',
            autoResolvedAt: deps.now(),
            autoResolvedReason: `unextractableDedupe:${reason}`,
          },
        })
        autoMerged += 1
      } else if (!sameAuthor) {
        // HEURISTIC: leave autoApplied=false. We do NOT enqueue a new
        // review queue item for the candidate itself — the target
        // extraction already has an UNEXTRACTABLE_PRODUCT queue item
        // (created by the builder), and the admin UI (Phase 3) will
        // surface the candidate alongside it via the cross reference.
        enqueuedForReview += 1
      }
    })

    // Once we auto-merged this extraction, further comparisons are
    // meaningless — it's no longer canonical.
    if (sameAuthor) break
  }

  logger.info(`${LOG_SCOPE}.scan_complete`, {
    extractionId: input.extractionId,
    candidatesCreated,
    autoMerged,
    enqueuedForReview,
    correlationId: input.correlationId,
  })

  return {
    status: 'OK',
    extractionId: input.extractionId,
    candidatesCreated,
    autoMerged,
    enqueuedForReview,
    correlationId: input.correlationId,
  }
}

function normaliseFirstLine(text: unknown): string {
  if (typeof text !== 'string') return ''
  const first = text.split(/\r?\n/)[0] ?? ''
  return first
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9€\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readSnap(snap: UnextractableExtractionRow['inputSnapshot']): {
  text: string | null
  author: string | null
} {
  if (!snap) return { text: null, author: null }
  const text = typeof snap.text === 'string' ? snap.text : null
  const rawAuthor = snap.tgAuthorId
  const author =
    rawAuthor === null || rawAuthor === undefined ? null : String(rawAuthor)
  return { text, author }
}

function empty(
  input: UnextractableScanInput,
  status: UnextractableScanResult['status'],
): UnextractableScanResult {
  return {
    status,
    extractionId: input.extractionId,
    candidatesCreated: 0,
    autoMerged: 0,
    enqueuedForReview: 0,
    correlationId: input.correlationId,
  }
}

async function defaultStageProbe(correlationId: string): Promise<boolean> {
  return isStageEnabled('dedupe', undefined, {
    correlationId,
    stage: 'dedupe',
    jobKind: 'ingestion.processing.unextractable-dedupe',
  })
}

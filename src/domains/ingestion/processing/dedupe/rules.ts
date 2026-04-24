/**
 * Dedupe classification rules.
 *
 * Three kinds with hard-wired risk classes — the mapping
 * `kind → risk` is locked (see #679 comment 4281108530) and may not
 * drift:
 *
 *   STRONG     → LOW risk    → auto-merge permitted
 *   HEURISTIC  → MEDIUM risk → human review required (no auto)
 *   SIMILARITY → HIGH risk   → human review required (no auto)
 *
 * Every classification carries:
 *   - `kind` + `risk` (closed enums)
 *   - `score` ∈ [0,1] — unique deterministic value per rule
 *   - `signals[]` — named rules that fired, with the comparison they
 *     made; this is what the admin UI will surface so operators can
 *     explain each auto-merge or review decision
 *   - `reason` — short machine-readable bucket describing WHY the
 *     risk tier was chosen
 *
 * Phase 2 intentionally stays simple: no Levenshtein, no embeddings,
 * no multi-message correlation. Every signal here is a discrete
 * equality check on normalised fields. "Entendible y auditable."
 */

export type DedupeKind = 'STRONG' | 'HEURISTIC' | 'SIMILARITY'
export type DedupeRisk = 'LOW' | 'MEDIUM' | 'HIGH'

export const RISK_FOR_KIND: Record<DedupeKind, DedupeRisk> = {
  STRONG: 'LOW',
  HEURISTIC: 'MEDIUM',
  SIMILARITY: 'HIGH',
}

export interface DedupeSignal {
  rule: string
  matched: unknown
  compared: unknown
}

export interface DedupeClassification {
  kind: DedupeKind
  risk: DedupeRisk
  score: number
  reason: string
  signals: DedupeSignal[]
}

// ─── Vendor comparison input ─────────────────────────────────────────────────

export interface VendorDraftRow {
  id: string
  externalId: string | null
  displayName: string
  extractorVersion: string
  canonicalDraftId: string | null
}

// ─── Product comparison input ────────────────────────────────────────────────

export interface ProductDraftRow {
  id: string
  vendorDraftId: string | null
  productName: string | null
  unit: string | null
  weightGrams: number | null
  priceCents: number | null
  extractorVersion: string
  canonicalDraftId: string | null
}

// ─── Normalisation helpers ───────────────────────────────────────────────────

export function normaliseProductName(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation / emoji → space
    .replace(/\s+/g, ' ')
    .trim()
  return trimmed.length > 0 ? trimmed : null
}

export function weightBucket(grams: number | null): string {
  if (grams === null) return 'none'
  // Narrow bands so 500g and 510g do not collide but 500g and 500g do.
  if (grams <= 100) return `≤100`
  if (grams <= 500) return `≤500`
  if (grams <= 1000) return `≤1000`
  if (grams <= 2500) return `≤2500`
  return `>2500`
}

// ─── Vendor dedupe ───────────────────────────────────────────────────────────

export function classifyVendorDedupe(
  a: VendorDraftRow,
  b: VendorDraftRow,
): DedupeClassification | null {
  if (a.id === b.id) return null
  // Never pull in a draft that is already part of a merge chain —
  // dedupe always compares canonical against canonical.
  if (a.canonicalDraftId !== null || b.canonicalDraftId !== null) return null

  // STRONG: explicit stable identifier on both sides.
  if (a.externalId && b.externalId && a.externalId === b.externalId) {
    return {
      kind: 'STRONG',
      risk: RISK_FOR_KIND.STRONG,
      score: 1,
      reason: 'sameExternalId',
      signals: [
        {
          rule: 'vendor.externalId.equal',
          matched: a.externalId,
          compared: b.externalId,
        },
      ],
    }
  }

  // Vendors without a stable identifier are deliberately NOT compared
  // further in Phase 2. They remain separate draft rows until an
  // operator merges them manually via the review queue (Phase 3).
  return null
}

// ─── Product dedupe ──────────────────────────────────────────────────────────

export function classifyProductDedupe(
  a: ProductDraftRow,
  b: ProductDraftRow,
): DedupeClassification | null {
  if (a.id === b.id) return null
  if (a.canonicalDraftId !== null || b.canonicalDraftId !== null) return null

  const nameA = normaliseProductName(a.productName)
  const nameB = normaliseProductName(b.productName)
  if (!nameA || !nameB) return null

  const sameVendor =
    a.vendorDraftId !== null &&
    b.vendorDraftId !== null &&
    a.vendorDraftId === b.vendorDraftId
  const nameEqual = nameA === nameB
  const unitEqual = a.unit === b.unit
  const weightEqual = weightBucket(a.weightGrams) === weightBucket(b.weightGrams)
  const priceEqual = a.priceCents === b.priceCents

  // STRONG: same seller + every discriminating field matches. This is
  // the "literally the same listing posted twice" case.
  if (sameVendor && nameEqual && unitEqual && weightEqual && priceEqual) {
    return {
      kind: 'STRONG',
      risk: RISK_FOR_KIND.STRONG,
      score: 1,
      reason: 'identicalAcrossAllFields',
      signals: [
        { rule: 'product.vendor.equal', matched: a.vendorDraftId, compared: b.vendorDraftId },
        { rule: 'product.name.equal', matched: nameA, compared: nameB },
        { rule: 'product.unit.equal', matched: a.unit, compared: b.unit },
        {
          rule: 'product.weightBucket.equal',
          matched: weightBucket(a.weightGrams),
          compared: weightBucket(b.weightGrams),
        },
        { rule: 'product.priceCents.equal', matched: a.priceCents, compared: b.priceCents },
      ],
    }
  }

  // HEURISTIC: same seller + same name + same unit, but price or
  // weight differs. Typical "I updated the price today" case — never
  // auto-merge, operator picks which draft survives.
  if (sameVendor && nameEqual && unitEqual) {
    const differing: DedupeSignal[] = []
    if (!priceEqual) {
      differing.push({
        rule: 'product.priceCents.differs',
        matched: a.priceCents,
        compared: b.priceCents,
      })
    }
    if (!weightEqual) {
      differing.push({
        rule: 'product.weightBucket.differs',
        matched: weightBucket(a.weightGrams),
        compared: weightBucket(b.weightGrams),
      })
    }
    return {
      kind: 'HEURISTIC',
      risk: RISK_FOR_KIND.HEURISTIC,
      score: 0.7,
      reason: 'sameSellerSameProductDifferentAttributes',
      signals: [
        { rule: 'product.vendor.equal', matched: a.vendorDraftId, compared: b.vendorDraftId },
        { rule: 'product.name.equal', matched: nameA, compared: nameB },
        { rule: 'product.unit.equal', matched: a.unit, compared: b.unit },
        ...differing,
      ],
    }
  }

  // SIMILARITY: same normalised name across different sellers. Not a
  // fuzzy match — we require exact normalised equality. Anything
  // weaker stays uncompared in Phase 2.
  if (!sameVendor && nameEqual) {
    return {
      kind: 'SIMILARITY',
      risk: RISK_FOR_KIND.SIMILARITY,
      score: 0.4,
      reason: 'sameNormalisedNameDifferentSeller',
      signals: [
        { rule: 'product.name.equal', matched: nameA, compared: nameB },
        {
          rule: 'product.vendor.differs',
          matched: a.vendorDraftId,
          compared: b.vendorDraftId,
        },
      ],
    }
  }

  return null
}

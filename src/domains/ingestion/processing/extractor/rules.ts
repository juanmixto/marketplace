import type {
  ExtractedProduct,
  ExtractionMetaEntry,
  ExtractionPayload,
  ExtractionVendorHint,
} from './schema'
import { EXTRACTION_SCHEMA_VERSION } from './schema'
import { normaliseConfidence } from '../confidence'

/**
 * Rules-based extractor. Deterministic, traceable, conservative.
 *
 * Every extracted field records the rule that produced it and the
 * source substring — operators can explain any value on any draft
 * without re-running the pipeline.
 *
 * When in doubt, we emit `null` with low per-field confidence rather
 * than guess. The classifier already filtered the message to
 * PRODUCT, so we're allowed to assume there's SOMETHING worth
 * extracting — but not allowed to invent associations.
 */

export interface ExtractorInput {
  text: string
  vendorHint?: {
    authorDisplayName?: string | null
    authorExternalId?: string | null
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function extractRules(input: ExtractorInput): ExtractionPayload {
  const rulesFired = new Set<string>()

  const vendorHint = buildVendorHint(input)
  rulesFired.add(vendorHint.meta.rule)

  const products = splitIntoProductSegments(input.text).flatMap(
    (segment, ordinal) => {
      const product = extractSingleProduct(segment, ordinal)
      if (!product) return []
      for (const rule of product.extractionMeta
        ? Object.values(product.extractionMeta)
        : []) {
        if (rule) rulesFired.add(rule.rule)
      }
      return [product]
    },
  )

  // Overall confidence: mean of per-product confidence, or 0 if empty.
  const confidenceOverall = normaliseConfidence(
    products.length === 0
      ? 0
      : products.reduce((acc, p) => acc + p.confidenceOverall, 0) / products.length,
  )

  return {
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    products,
    vendorHint,
    confidenceOverall,
    rulesFired: [...rulesFired],
  }
}

// ─── Segmentation ────────────────────────────────────────────────────────────

/**
 * Split the message into candidate product segments. A segment is a
 * coherent piece of text that could describe exactly one product.
 * Conservative: if we can't cleanly split, return the whole text as
 * a single segment rather than inventing splits.
 */
export function splitIntoProductSegments(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  // Line-based list: a blank line or a leading bullet/number marks a
  // new product. This is the common "producer posts a menu" pattern.
  const lines = trimmed.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean)
  const bulletRegex = /^(?:[-*•·]\s+|\d+[.)]\s+)/
  if (lines.length > 1 && lines.some((l) => bulletRegex.test(l))) {
    const segments = lines
      .filter((l) => bulletRegex.test(l))
      .map((l) => l.replace(bulletRegex, '').trim())
    if (segments.length > 0) return segments
  }
  if (lines.length > 1) {
    // If every line has its own price, treat each as a segment.
    const priceRe = /(\d+[.,]?\d*)\s*(?:€|eur)/i
    const linesWithPrice = lines.filter((l) => priceRe.test(l))
    if (linesWithPrice.length >= 2 && linesWithPrice.length === lines.length) {
      return lines
    }
  }
  return [trimmed]
}

// ─── Per-product extraction ──────────────────────────────────────────────────

function extractSingleProduct(segment: string, ordinal: number): ExtractedProduct | null {
  const meta: ExtractedProduct['extractionMeta'] = {}
  const confidenceByField: Record<string, number> = {}

  const price = extractPrice(segment)
  if (price) {
    meta.priceCents = price.meta
    confidenceByField.priceCents = price.confidence
    meta.currencyCode = { rule: 'currencyFromPrice', source: price.meta.source }
    confidenceByField.currencyCode = price.confidence
  }

  const unit = extractUnit(segment)
  if (unit) {
    meta.unit = unit.meta
    confidenceByField.unit = unit.confidence
  }

  const weight = extractWeightGrams(segment)
  if (weight) {
    meta.weightGrams = weight.meta
    confidenceByField.weightGrams = weight.confidence
  }

  const availability = extractAvailability(segment)
  meta.availability = availability.meta
  confidenceByField.availability = availability.confidence

  const name = extractProductName(segment)
  if (name) {
    meta.productName = name.meta
    confidenceByField.productName = name.confidence
  }

  // Conservative: require a price. Without a price, a "product" is
  // just a noun — we prefer to skip it and let the review queue stay
  // empty rather than build a draft from a single word.
  if (!price) return null

  // rules-1.2.0: weighted mean per field criticality (A in iter-2).
  //
  // Confidence contract (locked — any shift is a cross-phase change):
  //   - Critical fields (priceCents, productName) double-weighted.
  //   - Low-signal fields (availability, categorySlug) half-weighted.
  //   - `availability` is EXCLUDED when it's the default "UNKNOWN"
  //     reading (confidence 0.3) so a missing signal doesn't drag
  //     the overall score down.
  //   - +0.05 bonus when every critical + unit signal fires AND no
  //     promo marker was detected (isolated caller hint is
  //     `priceWithPerUnit`). Cap still 1.0 via clamp.
  //
  // `confidenceModel` persists the exact calculation so operators
  // can reconstruct any score from the stored row later.
  const weights: Record<string, number> = {
    priceCents: 2.0,
    productName: 2.0,
    unit: 1.0,
    weightGrams: 1.0,
    currencyCode: 1.0,
    availability: 0.5,
    categorySlug: 0.5,
  }
  const excludedFields: string[] = []
  // Exclude availability when it fell back to the default
  // (no explicit signal fired — rule `availDefault`).
  if (meta.availability?.rule === 'availDefault') {
    excludedFields.push('availability')
  }

  // Bonus: pricePerUnit rule fired (`priceWithPerUnit`) AND unit AND
  // name all present, and no promo rule fired (already enforced by
  // the fact that `isLikelyPromo` returns null for price).
  const bonusEligible =
    meta.priceCents?.rule === 'priceWithPerUnit' &&
    meta.unit !== undefined &&
    meta.productName !== undefined
  const bonusAmount = bonusEligible ? 0.05 : 0
  const bonus = bonusEligible
    ? { rule: 'priceWithPerUnit+unit+name', amount: bonusAmount }
    : null

  const rawWeighted = weightedConfidence(confidenceByField, weights, excludedFields)
  const confidenceOverall = normaliseConfidence(rawWeighted + bonusAmount)

  return {
    productOrdinal: ordinal,
    productName: name?.value ?? null,
    categorySlug: null,
    unit: unit?.value ?? null,
    weightGrams: weight?.value ?? null,
    priceCents: price?.value ?? null,
    currencyCode: price ? 'EUR' : null,
    availability: availability.value,
    confidenceOverall,
    confidenceByField,
    extractionMeta: meta,
    confidenceModel: {
      method: 'weightedMean' as const,
      weights,
      excludedFields,
      bonus,
    },
  }
}

function weightedConfidence(
  byField: Record<string, number>,
  weights: Record<string, number>,
  excluded: string[],
): number {
  const excludedSet = new Set(excluded)
  let num = 0
  let denom = 0
  for (const [k, v] of Object.entries(byField)) {
    if (excludedSet.has(k)) continue
    const w = weights[k] ?? 1.0
    num += v * w
    denom += w
  }
  if (denom === 0) return 0
  return num / denom
}

// ─── Field extractors ────────────────────────────────────────────────────────

interface Extracted<T> {
  value: T
  confidence: number
  meta: ExtractionMetaEntry
}

// rules-1.2.0: optionally capture the "/kg" tail so `m[0]` includes
// it. Fixes a latent v1.0.0 bug where `hasPerUnit` downstream never
// fired because `m[0]` only held "2,50€" regardless of trailing
// per-unit indicator. Without this fix the bonus path in
// weightedConfidence could not be reached.
const PRICE_REGEX_FULL =
  /(\d+[.,]?\d*)\s*(?:€|eur(?:os?)?)(?:\s*\/\s*(?:kg|g|l|ml|ud|uds|unidades?))?/i
const PRICE_RANGE_REGEX =
  /(\d+[.,]?\d*)\s*-\s*(\d+[.,]?\d*)\s*(?:€|eur(?:os?)?)/i

// rules-1.1.0: promotional copy regularly mentions "10€ de descuento"
// / "hasta 5€" / "DESCUENTO" near the main price. Those numbers are
// not product prices; we block extraction and let the operator
// decide via the review queue. The classifier has already decided
// this is PRODUCT-like, so we don't reject the whole extraction —
// we just decline to set a price.
const PROMO_MARKERS = /\b(?:PROMOCI[OÓ]N|DESCUENTO|OFERTA)\b|\bhasta\s+\d+\s*(?:€|eur|%)/i

function isLikelyPromo(segment: string): boolean {
  return PROMO_MARKERS.test(segment)
}

function extractPrice(segment: string): Extracted<number> | null {
  if (isLikelyPromo(segment)) {
    return null
  }
  // Price ranges ("4-6€/kg") are deliberately NOT extracted as a
  // single value: picking either bound is wrong for at least some
  // buyers. Conservative policy: take the lower bound with halved
  // confidence, record the range in `extractionMeta`.
  const range = PRICE_RANGE_REGEX.exec(segment)
  if (range) {
    const raw = (range[1] ?? '').replace(',', '.')
    const euros = Number.parseFloat(raw)
    if (!Number.isFinite(euros) || euros <= 0) return null
    return {
      value: Math.round(euros * 100),
      confidence: 0.4,
      meta: { rule: 'priceRangeLowerBound', source: range[0] },
    }
  }
  const m = PRICE_REGEX_FULL.exec(segment)
  if (!m) return null
  const raw = (m[1] ?? '').replace(',', '.')
  const euros = Number.parseFloat(raw)
  if (!Number.isFinite(euros) || euros <= 0) return null
  const priceCents = Math.round(euros * 100)
  // Price with an adjacent unit / per-unit indicator is more trustable
  // than a bare number; give a slight bump.
  const hasPerUnit = /(?:€|eur(?:os?)?)\s*\/\s*(?:kg|g|l|ml|ud|uds|unidades?)/i.test(m[0])
  const confidence = hasPerUnit ? 0.9 : 0.75
  return {
    value: priceCents,
    confidence,
    meta: {
      rule: hasPerUnit ? 'priceWithPerUnit' : 'priceBare',
      source: m[0],
    },
  }
}

const UNIT_TOKEN_REGEX = /\b(\d+[.,]?\d*)?\s*(kg|g|l|ml|ud|uds|unidades?|kilos?|gramos?|litros?|mililitros?)\b/i

function extractUnit(segment: string): Extracted<ExtractedProduct['unit']> | null {
  const m = UNIT_TOKEN_REGEX.exec(segment)
  if (!m) return null
  const token = (m[2] ?? '').toLowerCase()
  const unit = canonicaliseUnit(token)
  if (!unit) return null
  return {
    value: unit,
    confidence: 0.8,
    meta: { rule: 'unitToken', source: m[0] },
  }
}

function canonicaliseUnit(token: string): ExtractedProduct['unit'] | null {
  if (token === 'kg' || token.startsWith('kilo')) return 'KG'
  if (token === 'g' || token.startsWith('gramo')) return 'G'
  if (token === 'l' || token.startsWith('litro')) return 'L'
  if (token === 'ml' || token.startsWith('mililitro')) return 'ML'
  if (/^(ud|uds|unidad|unidades)$/i.test(token)) return 'UNIT'
  return null
}

const WEIGHT_REGEX = /\b(\d+[.,]?\d*)\s*(kg|g|kilos?|gramos?)\b/i

function extractWeightGrams(segment: string): Extracted<number> | null {
  const m = WEIGHT_REGEX.exec(segment)
  if (!m) return null
  const raw = (m[1] ?? '').replace(',', '.')
  const qty = Number.parseFloat(raw)
  if (!Number.isFinite(qty) || qty <= 0) return null
  const isKg = /kg|kilo/i.test(m[2] ?? '')
  const grams = Math.round(isKg ? qty * 1000 : qty)
  return {
    value: grams,
    confidence: 0.75,
    meta: { rule: isKg ? 'weightKilograms' : 'weightGrams', source: m[0] },
  }
}

const AVAILABILITY_HINTS: Array<{
  re: RegExp
  value: ExtractedProduct['availability']
  rule: string
}> = [
  { re: /\bagotado\b|\bsold out\b|\bno queda\b/i, value: 'SOLD_OUT', rule: 'availSoldOut' },
  { re: /\bquedan (?:pocos|pocas)\b|\bultim[oa]s\b|\bstock limitado\b/i, value: 'LIMITED', rule: 'availLimited' },
  { re: /\bdisponibl[eé]\b|\bhoy\b|\bfresco\b/i, value: 'AVAILABLE', rule: 'availAvailable' },
]

function extractAvailability(segment: string): Extracted<ExtractedProduct['availability']> {
  for (const hint of AVAILABILITY_HINTS) {
    const m = hint.re.exec(segment)
    if (m) {
      return {
        value: hint.value,
        confidence: 0.7,
        meta: { rule: hint.rule, source: m[0] },
      }
    }
  }
  return {
    value: 'UNKNOWN',
    confidence: 0.3,
    meta: { rule: 'availDefault', source: '' },
  }
}

function extractProductName(segment: string): Extracted<string> | null {
  // rules-1.1.0: real-world producer posts put the product name in
  // a short opening line (often all-caps or emoji-bracketed) and
  // then drop into a long marketing paragraph. The old rule took
  // "everything before the first price/unit token" which in long
  // posts captured the whole paragraph.
  //
  // New rule, in priority order:
  //   1. If the first line is short (≤ 60 chars) and has at least one
  //      letter, use it (strip bullets / emojis-only tails).
  //   2. Otherwise, fall back to the first 5 "useful" words of the
  //      opening line, joined with spaces.
  //   3. Always single-line output (no \n).
  const firstLineRaw = segment.split(/\r?\n/)[0] ?? ''
  const firstLine = firstLineRaw
    .replace(/^[-*•·\s]+/, '') // bullet prefix
    .replace(/[:,.\s-]+$/, '') // trailing punctuation
    .trim()
  if (firstLine.length === 0) return null
  // Reject lines that are pure emoji / symbols (no letter).
  if (!/[a-záéíóúñ]/i.test(firstLine)) return null

  let candidate = firstLine
  if (candidate.length > 60) {
    // Too long: take up to 5 meaningful word tokens.
    const words = candidate.split(/\s+/).filter((w) => /[a-záéíóúñ]/i.test(w))
    candidate = words.slice(0, 5).join(' ')
  }
  // If there's a price/unit token inside the short opening line,
  // trim to what precedes it (same behaviour as before, now safely
  // scoped to one line).
  const priceIdx = searchIndex(candidate, PRICE_REGEX_FULL)
  const unitIdx = searchIndex(candidate, UNIT_TOKEN_REGEX)
  const cutoffs = [priceIdx, unitIdx].filter((n): n is number => n > 0)
  if (cutoffs.length > 0) {
    candidate = candidate.slice(0, Math.min(...cutoffs)).trim()
  }
  candidate = candidate.replace(/[:,.\s-]+$/, '').trim()

  if (candidate.length < 2) return null
  // Final hard cap; this should be rare after the first-line logic
  // above but stays as a safety net.
  if (candidate.length > 60) candidate = candidate.slice(0, 60).trim()
  // Clean emoji-only strings (ASCII letter check to reject
  // decorative headers that slipped past the accented-letter gate).
  if (!/[a-záéíóúñ]/i.test(candidate)) return null
  return {
    value: candidate,
    confidence: 0.65,
    meta: { rule: 'firstLineOpeningWords', source: candidate },
  }
}

function searchIndex(text: string, re: RegExp): number {
  const m = re.exec(text)
  return m ? m.index : -1
}

// ─── Vendor hint ─────────────────────────────────────────────────────────────

function buildVendorHint(input: ExtractorInput): ExtractionVendorHint {
  const authorId = input.vendorHint?.authorExternalId ?? null
  const authorName = input.vendorHint?.authorDisplayName ?? null
  if (authorId) {
    return {
      externalId: authorId,
      displayName: authorName,
      meta: { rule: 'telegramAuthorExternalId', source: `author:${authorId}` },
    }
  }
  if (authorName) {
    return {
      externalId: null,
      displayName: authorName,
      meta: { rule: 'telegramAuthorDisplayName', source: `author:${authorName}` },
    }
  }
  return {
    externalId: null,
    displayName: null,
    meta: { rule: 'vendorUnknown', source: '' },
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────
//
// `meanConfidence` was removed in rules-1.2.0 in favour of
// `weightedConfidence`. Keep this comment so grep / history
// searches find the transition.

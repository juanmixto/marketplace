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

  const confidenceOverall = normaliseConfidence(
    meanConfidence(confidenceByField),
  )

  return {
    productOrdinal: ordinal,
    productName: name?.value ?? null,
    categorySlug: null, // Phase 2 leaves categorySlug to admin review.
    unit: unit?.value ?? null,
    weightGrams: weight?.value ?? null,
    priceCents: price?.value ?? null,
    currencyCode: price ? 'EUR' : null,
    availability: availability.value,
    confidenceOverall,
    confidenceByField,
    extractionMeta: meta,
  }
}

// ─── Field extractors ────────────────────────────────────────────────────────

interface Extracted<T> {
  value: T
  confidence: number
  meta: ExtractionMetaEntry
}

const PRICE_REGEX_FULL =
  /(\d+[.,]?\d*)\s*(?:€|eur(?:os?)?)/i
const PRICE_RANGE_REGEX =
  /(\d+[.,]?\d*)\s*-\s*(\d+[.,]?\d*)\s*(?:€|eur(?:os?)?)/i

function extractPrice(segment: string): Extracted<number> | null {
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
  // Take everything before the first price / unit token, up to 80
  // chars, strip bullets + trailing punctuation. If empty, null.
  const priceIdx = searchIndex(segment, PRICE_REGEX_FULL)
  const unitIdx = searchIndex(segment, UNIT_TOKEN_REGEX)
  const cutoffs = [priceIdx, unitIdx].filter((n): n is number => n > 0)
  const cutoff = cutoffs.length > 0 ? Math.min(...cutoffs) : segment.length
  let candidate = segment.slice(0, cutoff).trim()
  candidate = candidate.replace(/^[-*•·]\s*/, '').replace(/[:,.\s-]+$/, '').trim()
  if (candidate.length < 2) return null
  // Cap length to avoid swallowing emoji-heavy headers.
  if (candidate.length > 80) candidate = candidate.slice(0, 80).trim()
  // Clean emoji-only strings.
  if (!/[a-z]/i.test(candidate)) return null
  return {
    value: candidate,
    confidence: 0.6,
    meta: { rule: 'firstSegmentBeforePriceOrUnit', source: candidate },
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

function meanConfidence(byField: Record<string, number>): number {
  const values = Object.values(byField)
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

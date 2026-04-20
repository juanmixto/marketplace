/**
 * Conservative classifier rules.
 *
 * Philosophy (locked in #679 comment 4281108530): favour false
 * negatives over false positives. A message reaches the extractor
 * only when we have strong signals for `PRODUCT`. Everything else
 * falls back to `OTHER` or `CONVERSATION`.
 *
 * Weights are additive, never multiplicative — a single weak signal
 * cannot elevate confidence on its own. Two independent signals at
 * 0.3 still produce a 0.6 score, not a 0.09 one.
 *
 * If you add a rule, also add:
 *   1. A fixture case in `test/fixtures/ingestion-messages/` exercising it.
 *   2. A short comment here explaining *why* the signal is
 *      producer-speech rather than conversation or spam.
 */

export type MessageClass = 'PRODUCT' | 'CONVERSATION' | 'SPAM' | 'OTHER'

export interface ClassifierSignal {
  rule: string
  weight: number
  match: string
}

export interface ClassifierResult {
  kind: MessageClass
  confidence: number
  signals: ClassifierSignal[]
}

export interface ClassifierInput {
  text: string | null
}

// ─── Signal vocabulary ───────────────────────────────────────────────────────

const PRICE_REGEX =
  /(\d+[.,]?\d*)\s*(?:€|eur(?:os?)?)(?:\s*\/\s*(?:kg|g|l|ml|ud|uds|unidades?|pieza|pza))?/i
const UNIT_REGEX = /\b(\d+[.,]?\d*)\s*(kg|g|l|ml|ud|uds|unidades?|gramos?|kilos?|litros?|mililitros?)\b/i
// Minimal produce vocabulary. Conservative: missing categories are
// safer than over-broad ones; admin can grow the list later.
const PRODUCE_WORDS = [
  // Fruits
  'manzana', 'manzanas', 'pera', 'peras', 'naranja', 'naranjas',
  'limon', 'limones', 'fresa', 'fresas', 'uva', 'uvas',
  // Vegetables
  'tomate', 'tomates', 'lechuga', 'pimiento', 'pimientos', 'cebolla',
  'cebollas', 'ajo', 'ajos', 'patata', 'patatas', 'zanahoria', 'zanahorias',
  // Dairy
  'queso', 'quesos', 'leche', 'yogur', 'mantequilla',
  // Meat / fish
  'pollo', 'cerdo', 'ternera', 'cordero', 'pescado', 'atun', 'bacalao',
  // Pantry
  'aceite', 'vinagre', 'miel', 'harina', 'pan', 'huevos',
]

const CONVERSATION_MARKERS = [
  /\?$/, // ends with question mark
  /\b(gracias|hola|buenos dias|buenas|saludos)\b/i,
  /\b(alguien|alguno|quien|donde|cuando|puedo|podemos|sabes|sabeis)\b/i,
]

const SPAM_HINTS = [
  /https?:\/\//i,
  /\b(click aqui|pincha aqui|gana|premio|promocion exclusiva)\b/i,
  /\bt\.me\/|bit\.ly/i,
]

// ─── Weights ─────────────────────────────────────────────────────────────────
//
// Each signal contributes one additive term. A message needs signals
// totalling >= 0.6 to reach the PRODUCT class. That threshold is
// deliberately tight to push ambiguous messages into OTHER.

const W_PRICE = 0.4
const W_UNIT = 0.25
const W_PRODUCE_WORD = 0.25
const W_CONVERSATION_MARKER = 0.3
const W_SPAM_URL = 0.35
const W_SPAM_PHRASE = 0.35

const PRODUCT_THRESHOLD = 0.6
const CONVERSATION_THRESHOLD = 0.3
const SPAM_THRESHOLD = 0.6

// ─── Public API ──────────────────────────────────────────────────────────────

export function classifyMessage(input: ClassifierInput): ClassifierResult {
  const text = (input.text ?? '').trim()
  if (text.length === 0) {
    return {
      kind: 'OTHER',
      confidence: 0,
      signals: [{ rule: 'emptyOrWhitespace', weight: 0, match: '' }],
    }
  }

  const productSignals: ClassifierSignal[] = []
  const convSignals: ClassifierSignal[] = []
  const spamSignals: ClassifierSignal[] = []

  // Product signals
  const priceMatch = PRICE_REGEX.exec(text)
  if (priceMatch) {
    const includesPerUnit = /\/\s*(?:kg|g|l|ml|ud|uds|unidades?|pieza|pza)/i.test(
      priceMatch[0],
    )
    productSignals.push({
      rule: includesPerUnit ? 'pricePerUnitToken' : 'priceToken',
      // A price with an adjacent per-unit indicator is strong enough
      // to corroborate itself. A bare price still needs a second signal.
      weight: includesPerUnit ? W_PRICE + W_UNIT : W_PRICE,
      match: priceMatch[0],
    })
  }
  const unitMatch = UNIT_REGEX.exec(text)
  if (unitMatch) {
    productSignals.push({ rule: 'unitToken', weight: W_UNIT, match: unitMatch[0] })
  }
  const normalized = normaliseForProduceLookup(text)
  for (const word of PRODUCE_WORDS) {
    if (normalized.includes(word)) {
      productSignals.push({ rule: 'produceWord', weight: W_PRODUCE_WORD, match: word })
      break // first match is enough; don't double-count synonyms
    }
  }

  // Conversation signals
  for (const re of CONVERSATION_MARKERS) {
    const m = re.exec(text)
    if (m) {
      convSignals.push({ rule: re.source, weight: W_CONVERSATION_MARKER, match: m[0] })
    }
  }

  // Spam signals
  for (const re of SPAM_HINTS) {
    const m = re.exec(text)
    if (m) {
      const isUrl = /https?:\/\//i.test(m[0]) || /t\.me|bit\.ly/i.test(m[0])
      spamSignals.push({
        rule: isUrl ? 'spamUrl' : 'spamPhrase',
        weight: isUrl ? W_SPAM_URL : W_SPAM_PHRASE,
        match: m[0],
      })
    }
  }

  const productScore = sumWeights(productSignals)
  const convScore = sumWeights(convSignals)
  const spamScore = sumWeights(spamSignals)

  // SPAM wins over PRODUCT when both fire — a link to a promo page
  // plus a price is spam, not a legitimate listing.
  if (spamScore >= SPAM_THRESHOLD) {
    return {
      kind: 'SPAM',
      confidence: clamp01(spamScore),
      signals: spamSignals,
    }
  }

  // PRODUCT requires both a price signal AND at least one corroborating
  // signal (unit or produce word). Price alone can be a quote or a
  // memory; we demand confirmation.
  const hasPrice = productSignals.some(
    (s) => s.rule === 'priceToken' || s.rule === 'pricePerUnitToken',
  )
  const hasCorroboration = productSignals.some(
    (s) =>
      s.rule === 'unitToken' ||
      s.rule === 'produceWord' ||
      s.rule === 'pricePerUnitToken', // per-unit is self-corroborating
  )
  if (hasPrice && hasCorroboration && productScore >= PRODUCT_THRESHOLD) {
    return {
      kind: 'PRODUCT',
      confidence: clamp01(productScore),
      signals: productSignals,
    }
  }

  if (convScore >= CONVERSATION_THRESHOLD) {
    return {
      kind: 'CONVERSATION',
      confidence: clamp01(convScore),
      signals: convSignals,
    }
  }

  return {
    kind: 'OTHER',
    confidence: 0,
    signals: [],
  }
}

function sumWeights(signals: ClassifierSignal[]): number {
  return signals.reduce((acc, s) => acc + s.weight, 0)
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function normaliseForProduceLookup(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "manzána" matches
}

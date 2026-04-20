/**
 * Conservative classifier rules — rules-1.1.0.
 *
 * Philosophy (locked in #679 comment 4281108530): favour false
 * negatives over false positives. But after the Phase 2.x dry run
 * on real producer traffic we learned that requiring an explicit
 * price token pushed ~45 legitimate producer posts into OTHER with
 * zero visibility. rules-1.1.0 introduces a new intermediate class
 * `PRODUCT_NO_PRICE` and a `producerTone` signal so that
 * producer-flavoured posts without a price still enter the pipeline
 * as audit rows + review queue items (never as drafts, to avoid
 * fabricating data).
 *
 * Gate (rules-1.1.0):
 *   PRODUCT         = priceToken AND corroboration
 *   PRODUCT_NO_PRICE= producerTone AND produceWord  (no price required)
 *   SPAM            = URL/phrase above spam threshold
 *   CONVERSATION    = question / greeting / thanks markers
 *   OTHER           = nothing reaches thresholds above
 *
 * Weights are still additive. A single weak signal cannot by itself
 * elevate confidence.
 */

export type MessageClass =
  | 'PRODUCT'
  | 'PRODUCT_NO_PRICE'
  | 'CONVERSATION'
  | 'SPAM'
  | 'OTHER'

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
const PRODUCE_WORDS = [
  // Fruits
  'manzana', 'manzanas', 'pera', 'peras', 'naranja', 'naranjas',
  'limon', 'limones', 'fresa', 'fresas', 'uva', 'uvas',
  'clementina', 'clementinas', 'mandarina', 'mandarinas',
  'aguacate', 'aguacates',
  // Vegetables
  'tomate', 'tomates', 'lechuga', 'pimiento', 'pimientos', 'cebolla',
  'cebollas', 'ajo', 'ajos', 'patata', 'patatas', 'zanahoria', 'zanahorias',
  'pebrot', // catalan pepper — seen in the dry run
  // Dairy
  'queso', 'quesos', 'leche', 'yogur', 'mantequilla',
  // Meat / fish / jamón
  'pollo', 'cerdo', 'ternera', 'cordero', 'pescado', 'atun', 'bacalao',
  'jamon', 'jamones', 'embutido', 'embutidos', 'chorizo', 'salchichon',
  // Pantry
  'aceite', 'vinagre', 'miel', 'harina', 'pan', 'huevos',
  'espirulina', 'polen',
]

// Producer-tone markers. Each match is strong evidence that the
// message is a producer speaking about their own offering. These are
// HAND-CURATED from the Phase 2.x dry run on the "AGRICULTOR A
// CONSUMIDOR" group — the list is Spanish / Catalan flavoured and
// should grow only with fixture-backed evidence.
//
// ─── rules-1.2.0 design note on multi-language expansion (item C) ───
//
// Iter-2 user decision: multi-language producer-tone support is
// DESIGNED but NOT IMPLEMENTED. When real data arrives in catalan /
// galician / basque / english:
//   1. Move the current array into an object keyed by language
//      (`spanish`, `catalan`, `galician`, `basque`, `english`).
//   2. Require a new test file `ingestion-producer-tone-coverage.test.ts`
//      that fails when any pattern has zero matching fixtures in
//      `test/fixtures/ingestion-messages/cases.json`. Rule: no pattern
//      without fixture.
//   3. Keep the cumulative weight cap (W_PRODUCER_TONE_CAP = 0.5)
//      unchanged — adding languages should not let a multi-language
//      post double-score.
//
// Until there's real non-Spanish data to test against, adding patterns
// is speculative expansion that the user explicitly rejected. Do not
// ship language buckets before fixtures exist.
// ────────────────────────────────────────────────────────────────────
const PRODUCER_TONE_PATTERNS: RegExp[] = [
  /\bsomos (?:una? )?(?:peque[ñn]a? )?(?:empresa )?(?:familiar|productor[ae]s?)\b/i,
  /\bsomos productores\b/i,
  /\bproducci[oó]n (?:propia|artesanal|limitada|familiar)\b/i,
  /\benv[ií]os? a toda la pen[ií]nsula\b/i,
  /\benv[ií]os? a (?:espa[ñn]a|peninsula)\b/i,
  /\bdirectamente de (?:nuestr[ao]s?|la huerta|el campo|mi huerta|la granja)\b/i,
  /\b(?:nuestr[ao]s?) (?:frutas?|verduras?|huert[ao]s?|granjas?|aceites?|mieles?|quesos?)\b/i,
  /\bnueva campa[ñn]a\b/i,
  /\btemporada\b/i,
  /\bapicultura artesanal\b/i,
  /\barte?sanal(?:es|mente)?\b/i,
  /\bde (?:nuestro|nuestra|mi) (?:huerta|huerto|granja|campo|finca)\b/i,
  /\bcultivad[ao]s? (?:por|en)\b/i,
  /\bseleccion(?:ados?|ado|ada|adas?)\b/i,
  /\bde temporada\b/i,
  /\bpedidos\b/i,
  /\bfresco\b/i,
  /\bdisponibles? (?:hoy|ahora|esta semana)\b/i,
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

const W_PRICE = 0.4
const W_UNIT = 0.25
const W_PRODUCE_WORD = 0.25
const W_PRODUCER_TONE = 0.2 // per matched pattern, capped below
const W_PRODUCER_TONE_CAP = 0.5
const W_CONVERSATION_MARKER = 0.3
const W_SPAM_URL = 0.35
const W_SPAM_PHRASE = 0.35

const PRODUCT_THRESHOLD = 0.6
// PRODUCT_NO_PRICE needs producerTone AND produceWord but no price;
// threshold is deliberately lower so a single clear producer-post
// with a produce mention qualifies.
const PRODUCT_NO_PRICE_THRESHOLD = 0.35
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
  const producerToneSignals: ClassifierSignal[] = []
  const convSignals: ClassifierSignal[] = []
  const spamSignals: ClassifierSignal[] = []

  // Price signal
  const priceMatch = PRICE_REGEX.exec(text)
  if (priceMatch) {
    const includesPerUnit = /\/\s*(?:kg|g|l|ml|ud|uds|unidades?|pieza|pza)/i.test(
      priceMatch[0],
    )
    productSignals.push({
      rule: includesPerUnit ? 'pricePerUnitToken' : 'priceToken',
      weight: includesPerUnit ? W_PRICE + W_UNIT : W_PRICE,
      match: priceMatch[0],
    })
  }
  const unitMatch = UNIT_REGEX.exec(text)
  if (unitMatch) {
    productSignals.push({ rule: 'unitToken', weight: W_UNIT, match: unitMatch[0] })
  }

  const normalized = normaliseForProduceLookup(text)
  let produceMatched = false
  for (const word of PRODUCE_WORDS) {
    if (normalized.includes(word)) {
      productSignals.push({ rule: 'produceWord', weight: W_PRODUCE_WORD, match: word })
      produceMatched = true
      break
    }
  }

  // Producer-tone signals (cap the cumulative weight so many matches
  // don't push the score beyond a reasonable ceiling).
  let producerToneWeight = 0
  for (const re of PRODUCER_TONE_PATTERNS) {
    const m = re.exec(text)
    if (m && producerToneWeight < W_PRODUCER_TONE_CAP) {
      const weight = Math.min(W_PRODUCER_TONE, W_PRODUCER_TONE_CAP - producerToneWeight)
      producerToneSignals.push({ rule: 'producerTone', weight, match: m[0] })
      producerToneWeight += weight
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
  const producerToneScore = sumWeights(producerToneSignals)
  const convScore = sumWeights(convSignals)
  const spamScore = sumWeights(spamSignals)

  // SPAM wins over PRODUCT.
  if (spamScore >= SPAM_THRESHOLD) {
    return { kind: 'SPAM', confidence: clamp01(spamScore), signals: spamSignals }
  }

  // PRODUCT (strict): price + corroboration.
  const hasPrice = productSignals.some(
    (s) => s.rule === 'priceToken' || s.rule === 'pricePerUnitToken',
  )
  const hasCorroboration = productSignals.some(
    (s) =>
      s.rule === 'unitToken' ||
      s.rule === 'produceWord' ||
      s.rule === 'pricePerUnitToken',
  )
  if (hasPrice && hasCorroboration && productScore >= PRODUCT_THRESHOLD) {
    return {
      kind: 'PRODUCT',
      confidence: clamp01(productScore),
      signals: productSignals,
    }
  }

  // PRODUCT_NO_PRICE (new in 1.1.0): producerTone + produceWord with
  // no price signal. Must not fire when conversation markers dominate
  // — greetings + "alguien sabe si queda" + "fresco" shouldn't become
  // PRODUCT_NO_PRICE just because "fresco" is a producer-tone word.
  const noPriceScore = producerToneScore + (produceMatched ? W_PRODUCE_WORD : 0)
  if (
    produceMatched &&
    producerToneSignals.length > 0 &&
    !hasPrice &&
    noPriceScore >= PRODUCT_NO_PRICE_THRESHOLD &&
    noPriceScore > convScore // producer evidence must exceed conversation evidence
  ) {
    return {
      kind: 'PRODUCT_NO_PRICE',
      confidence: clamp01(noPriceScore),
      signals: [...productSignals, ...producerToneSignals],
    }
  }

  if (convScore >= CONVERSATION_THRESHOLD) {
    return {
      kind: 'CONVERSATION',
      confidence: clamp01(convScore),
      signals: convSignals,
    }
  }

  return { kind: 'OTHER', confidence: 0, signals: [] }
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
    .replace(/[\u0300-\u036f]/g, '')
}

// Pragmatic CSS `sizes` transformer used by SafeImage to apply an
// adaptive downscale on slow networks / Save-Data (#1053). Not a full
// CSS parser — only `vw` and `px` numeric values are scaled. Anything
// else (calc(), em, %, named tokens) passes through untouched.

const VW_RE = /(-?\d*\.?\d+)\s*vw/gi
const PX_RE = /(-?\d*\.?\d+)\s*px/gi

const scaleNumeric = (raw: string, factor: number, unit: 'vw' | 'px'): string => {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return `${raw}${unit}`
  if (n === 0) return `0${unit}`
  // Round to the nearest integer, but never below 1 — a 0vw/0px
  // request would defeat the purpose and may confuse the browser
  // picker into requesting the largest variant.
  const scaled = Math.max(1, Math.round(n * factor))
  return `${scaled}${unit}`
}

// Split the input into top-level chunks. Bare parenthesized groups
// — `(max-width: 640px)` — are media-query conditions where `px`
// values are breakpoints and must NOT be scaled. Function-call groups
// like `calc(...)` are math expressions where `px` values are real
// lengths and SHOULD be scaled. The discriminator is whether the
// opening `(` is preceded by an identifier character.
type Chunk = { text: string; isCondition: boolean }

const splitByParens = (s: string): Chunk[] => {
  const out: Chunk[] = []
  let buf = ''
  let depth = 0
  let isCondition = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') {
      if (depth === 0) {
        if (buf) {
          out.push({ text: buf, isCondition: false })
          buf = ''
        }
        // `(` preceded by a word character → function call (calc, min, max…).
        const prev = i > 0 ? s[i - 1] ?? '' : ''
        isCondition = !/[A-Za-z0-9_-]/.test(prev)
      }
      buf += c
      depth++
    } else if (c === ')') {
      buf += c
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        out.push({ text: buf, isCondition })
        buf = ''
        isCondition = false
      }
    } else {
      buf += c
    }
  }
  if (buf) out.push({ text: buf, isCondition: false })
  return out
}

/**
 * Apply an adaptive downscale factor (e.g. 0.66, 0.5) to numeric
 * `vw` and `px` values in a CSS `sizes` attribute. `vw` is scaled
 * everywhere; `px` is scaled only outside parenthesized regions, so
 * media-query breakpoints like `(max-width: 640px)` are preserved
 * verbatim. Anything else (em, %, named tokens) passes through.
 *
 * Examples:
 *   transformSizesWithDownscale('(max-width: 640px) 50vw, 25vw', 0.66)
 *     // → '(max-width: 640px) 33vw, 17vw'
 *   transformSizesWithDownscale('80px', 0.5) // → '40px'
 *   transformSizesWithDownscale('100vw', 1.0) // → '100vw' (no-op)
 */
export const transformSizesWithDownscale = (
  sizes: string,
  factor: number,
): string => {
  if (!sizes) return sizes
  if (!Number.isFinite(factor) || factor >= 1) return sizes
  if (factor <= 0) return sizes

  return splitByParens(sizes)
    .map(({ text, isCondition }) => {
      // `vw` is always part of the requested width — scale it everywhere
      // (including inside calc(...) and even inside conditions, although
      // `vw` in a media-query condition is exotic). `px` is scaled
      // outside conditions, so `(max-width: 640px)` survives intact but
      // `calc(100vw - 32px)` and bare `80px` get scaled.
      const withVw = text.replace(VW_RE, (_m, num: string) =>
        scaleNumeric(num, factor, 'vw'),
      )
      if (isCondition) return withVw
      return withVw.replace(PX_RE, (_m, num: string) =>
        scaleNumeric(num, factor, 'px'),
      )
    })
    .join('')
}

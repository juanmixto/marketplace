import { NextResponse, type NextRequest } from 'next/server'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { trackServer } from '@/lib/analytics.server'

/**
 * CSP violation report sink (#1248 / HU7).
 *
 * Browsers POST violation reports here in two payload shapes:
 *
 *   1. Legacy `application/csp-report` — the original CSP1 wrapper:
 *      `{ "csp-report": { documentURI, violatedDirective, ... } }`
 *      Still used by Chrome / Edge for the `report-uri` directive.
 *
 *   2. Reporting-API `application/reports+json` — the modern envelope:
 *      `[ { type: "csp-violation", body: { documentURL, ... } } ]`
 *      Used when the `Report-To` header (and `report-to` directive in
 *      the CSP) is honoured.
 *
 * Both shapes are normalised into a single `security.csp.violation`
 * PostHog event so dashboards don't need to know about the protocol
 * fork. The route always returns 204 — even on parse failure or rate
 * limit — because failing-loudly here would just teach the browser to
 * stop reporting (it'd back off the endpoint).
 *
 * Defenses against log-flood:
 *   - Per-IP rate limit (10 reports / min). Bursts during a botched
 *     deploy easily generate thousands of reports per second from one
 *     buyer's tab; the cap keeps us from drowning PostHog.
 *   - 16 KB body size cap. Anything larger is dropped at the read
 *     boundary, before parse — same shape as accepting an empty body.
 *   - Field-by-field allow-list when forwarding to PostHog: we never
 *     forward `original-policy` past 512 chars, and never forward
 *     anything outside the documented field set.
 *
 * The route is exempt from CSRF in `src/proxy.ts::CSRF_EXEMPT_PREFIXES`
 * because browser-originated reports do not include an Origin header
 * (they go through the user agent's background reporting queue, not a
 * fetch from page JS).
 */

export const runtime = 'nodejs'
// Each report is processed independently; no caching makes sense here.
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 16 * 1024 // 16 KB
const RATE_LIMIT_PER_MINUTE = 10
const TRUNCATE_AT = 512 // chars, applied to free-text fields

interface NormalisedReport {
  documentURI?: string
  violatedDirective?: string
  effectiveDirective?: string
  blockedURI?: string
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
  disposition?: string
  originalPolicy?: string
  statusCode?: number
}

function trunc(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.length > TRUNCATE_AT ? value.slice(0, TRUNCATE_AT) + '…' : value
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normaliseLegacy(payload: unknown): NormalisedReport | null {
  if (typeof payload !== 'object' || payload === null) return null
  const wrapped = (payload as { 'csp-report'?: unknown })['csp-report']
  if (typeof wrapped !== 'object' || wrapped === null) return null
  const r = wrapped as Record<string, unknown>
  return {
    documentURI: trunc(r['document-uri']),
    violatedDirective: trunc(r['violated-directive']),
    effectiveDirective: trunc(r['effective-directive']),
    blockedURI: trunc(r['blocked-uri']),
    sourceFile: trunc(r['source-file']),
    lineNumber: asNumber(r['line-number']),
    columnNumber: asNumber(r['column-number']),
    disposition: trunc(r['disposition']),
    originalPolicy: trunc(r['original-policy']),
    statusCode: asNumber(r['status-code']),
  }
}

function normaliseReportingApi(payload: unknown): NormalisedReport[] {
  if (!Array.isArray(payload)) return []
  const out: NormalisedReport[] = []
  for (const entry of payload) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    if (e.type !== 'csp-violation') continue
    const body = e.body
    if (typeof body !== 'object' || body === null) continue
    const r = body as Record<string, unknown>
    out.push({
      documentURI: trunc(r.documentURL),
      violatedDirective: trunc(r.effectiveDirective),
      effectiveDirective: trunc(r.effectiveDirective),
      blockedURI: trunc(r.blockedURL),
      sourceFile: trunc(r.sourceFile),
      lineNumber: asNumber(r.lineNumber),
      columnNumber: asNumber(r.columnNumber),
      disposition: trunc(r.disposition),
      originalPolicy: trunc(r.originalPolicy),
      statusCode: asNumber(r.statusCode),
    })
  }
  return out
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Always 204 from this endpoint. Returning anything else just trains
  // the browser to back off the reporting endpoint, which costs us
  // visibility for no operational gain.
  const ack = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

  const ip = getClientIP(req)
  const limit = await checkRateLimit('csp-report', ip, RATE_LIMIT_PER_MINUTE, 60)
  if (!limit.success) {
    // Don't even read the body — we'd just throw it away.
    return ack
  }

  // Read the body with a hard cap. NextRequest.text() is the simplest
  // path; we cap by checking length post-read because the platform
  // doesn't expose a streaming length-bounded reader.
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return ack
  }
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
    return ack
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return ack
  }

  const contentType = req.headers.get('content-type') ?? ''
  const reports: NormalisedReport[] = []
  if (contentType.includes('application/csp-report')) {
    const single = normaliseLegacy(payload)
    if (single) reports.push(single)
  } else {
    // Reporting-API uses application/reports+json; default to it for
    // anything we don't explicitly recognise as legacy.
    reports.push(...normaliseReportingApi(payload))
  }

  if (reports.length === 0) return ack

  for (const report of reports) {
    const dedupeKey =
      `${report.effectiveDirective ?? 'unknown'}::${report.blockedURI ?? 'unknown'}::${report.documentURI ?? 'unknown'}`

    // Log structurally so oncall can see it without leaving the logger
    // pivot pattern, and forward to PostHog so the violation lives in
    // the same dashboard surface as funnel events. Fail-quiet: the
    // analytics wrapper already swallows errors.
    logger.warn('security.csp.violation', {
      directive: report.effectiveDirective,
      violated: report.violatedDirective,
      blocked: report.blockedURI,
      document: report.documentURI,
      sourceFile: report.sourceFile,
      lineNumber: report.lineNumber,
      disposition: report.disposition,
    })

    trackServer(
      'security.csp.violation',
      {
        document_uri: report.documentURI,
        violated_directive: report.violatedDirective,
        effective_directive: report.effectiveDirective,
        blocked_uri: report.blockedURI,
        source_file: report.sourceFile,
        line_number: report.lineNumber,
        column_number: report.columnNumber,
        disposition: report.disposition,
        // Truncate at 512 already via trunc(); this is the longest field.
        original_policy: report.originalPolicy,
      },
      {
        // CSP reports have no authenticated identity. Group by the
        // violation signature so per-rule anomalies surface as
        // distinct distinctIds instead of one mega-bucket.
        distinctId: `csp:${dedupeKey.slice(0, 200)}`,
        dedupeKey,
      },
    )
  }

  return ack
}

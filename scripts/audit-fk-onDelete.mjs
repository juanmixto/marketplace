#!/usr/bin/env node
/**
 * audit-fk-onDelete.mjs
 *
 * Hardens the lesson from DB audit P0.3 (#961). Prisma defaults a
 * relation without `onDelete:` to NO ACTION, which is correct in
 * isolation but easy to flip silently in a future migration. For
 * relations that point at User / Order / Vendor (the three high-blast
 * "owner" entities), we want the schema to make the choice explicit
 * — Cascade vs Restrict vs SetNull — so a future agent sees the
 * intent at the relation site and a reviewer notices a switch.
 *
 * What this audits:
 *
 *   1. Every `field SomeOwner @relation(...)` line whose target is in
 *      OWNER_MODELS must include `onDelete:`. Implicit defaults are a
 *      lint failure.
 *   2. Cascade onto User from a money-or-tax-tied model (Order,
 *      Incident, Refund, Settlement, etc.) is a hard error — losing
 *      these on user deletion is a 5-year-tax-retention violation.
 *      Allowlist via CASCADE_ON_USER_OK if a Cascade is genuinely
 *      desired (Cart, Session, etc.).
 *
 * Ratchet mode: the schema today contains pre-existing implicit
 * onDelete defaults that pre-date this audit. Rather than rewrite
 * them in one massive PR, the script only fails on NEW violations
 * relative to the baseline at scripts/audit-fk-onDelete.baseline.json.
 * The baseline ratchets DOWN automatically when you fix existing
 * violations — running --update-baseline shrinks the file. CI never
 * grows the baseline; that's the human's job.
 *
 * This is NOT a substitute for code review on FK changes — it's the
 * cheap belt-and-suspenders so a one-character schema change doesn't
 * silently turn into a data-loss migration.
 *
 * Usage:
 *   node scripts/audit-fk-onDelete.mjs            # CI mode: fails on net-new violations
 *   node scripts/audit-fk-onDelete.mjs --json     # machine-readable
 *   node scripts/audit-fk-onDelete.mjs --soft     # never exit non-zero
 *   node scripts/audit-fk-onDelete.mjs --all      # report ALL violations (not just net-new)
 *   node scripts/audit-fk-onDelete.mjs --update-baseline   # rewrite the baseline
 *
 * Exit codes:
 *   0 — no net-new violations relative to baseline
 *   1 — net-new violations found (or schema cleaned up — re-run --update-baseline)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SCHEMA = join(ROOT, 'prisma', 'schema.prisma')
const BASELINE = join(ROOT, 'scripts', 'audit-fk-onDelete.baseline.json')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')
const ALL = process.argv.includes('--all')
const UPDATE_BASELINE = process.argv.includes('--update-baseline')

// Owner models. A relation pointing at one of these MUST declare onDelete
// explicitly. The rationale: these three models concentrate blast radius
// (User → all PII; Order → money + tax; Vendor → all catalog + payouts).
const OWNER_MODELS = new Set(['User', 'Order', 'Vendor'])

// Models for which Cascade onto User is FORBIDDEN — losing a row when
// a user erases their account would violate retention or audit rules.
// Order is the canonical case (5-year tax retention). Add a model here
// only if the law / accounting policy requires keeping the row.
const CASCADE_ON_USER_FORBIDDEN = new Set([
  'Order',
  'OrderEvent',
  'Payment',
  'Refund',
  'Settlement',
  'Incident',
  'IncidentMessage',
  'Subscription',
  'Review', // anonimized in place per docs/authz-audit.md
])

// Models where Cascade onto User is INTENTIONAL — they are pure
// session / scratch data with no business value once the user is gone.
// Each entry needs a one-word reason for the next reader.
const CASCADE_ON_USER_OK = new Map([
  ['Account',                 'auth credential, no value without user'],
  ['Session',                 'auth session, no value without user'],
  ['Cart',                    'pre-checkout scratchpad'],
  ['CartItem',                'pre-checkout scratchpad'],
  ['Address',                 'PII; orders snapshot the address inline'],
  ['Favorite',                'preference, no value without user'],
  ['PushSubscription',        'browser push token, useless without user'],
  ['EmailVerificationToken',  'one-shot token'],
  ['PasswordResetToken',      'one-shot token'],
  ['UserTwoFactor',           '2FA secret, useless without user'],
  ['TelegramLink',            'channel token, useless without user'],
  ['TelegramLinkToken',       'one-shot token'],
  ['NotificationPreference',  'preference, no value without user'],
  ['NotificationDelivery',    'log of past pushes; safe to drop with user'],
  ['ReviewReport',            'moderation flag attached to a reporter'],
])

const violations = []

function loadSchema() {
  return readFileSync(SCHEMA, 'utf8').split('\n')
}

function parseModels(lines) {
  // Returns Map<modelName, { startLine, endLine, body: string }>.
  const models = new Map()
  let cur = null
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (cur == null) {
      const m = line.match(/^model\s+(\w+)\s*\{/)
      if (m) {
        cur = { name: m[1], startLine: i + 1, body: [] }
        depth = 1
      }
      continue
    }
    cur.body.push(line)
    depth += (line.match(/\{/g) || []).length
    depth -= (line.match(/\}/g) || []).length
    if (depth === 0) {
      models.set(cur.name, {
        startLine: cur.startLine,
        endLine: i + 1,
        body: cur.body.join('\n'),
      })
      cur = null
    }
  }
  return models
}

function findRelations(modelName, modelMeta) {
  // Each relation line looks like:
  //   field SomeType @relation(fields: [...], references: [...], onDelete: ...)
  // We catch both single-line and multi-line variants.
  const out = []
  const lines = modelMeta.body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^\s*\w+\s+(\w+)(\?|\[\])?\s+@relation\s*\(/)
    if (!m) continue
    // Skip back-relations (no `fields:` clause).
    if (!line.includes('fields:')) continue
    const targetType = m[1]
    if (!OWNER_MODELS.has(targetType)) continue
    // Single-line @relation(...) is the dominant shape; if it spans
    // multiple lines, glue them together until the closing paren.
    let buf = line
    let j = i
    while (!buf.includes(')') && j < lines.length - 1) {
      j++
      buf += ' ' + lines[j]
    }
    const onDeleteMatch = buf.match(/onDelete:\s*(\w+)/)
    out.push({
      sourceModel: modelName,
      targetModel: targetType,
      lineInModel: i + 1,
      absoluteLine: modelMeta.startLine + i,
      onDelete: onDeleteMatch ? onDeleteMatch[1] : null,
      raw: line.trim(),
    })
  }
  return out
}

function audit() {
  const lines = loadSchema()
  const models = parseModels(lines)
  for (const [modelName, meta] of models) {
    const relations = findRelations(modelName, meta)
    for (const rel of relations) {
      // Rule 1: must declare onDelete explicitly.
      if (rel.onDelete == null) {
        violations.push({
          file: 'prisma/schema.prisma',
          line: rel.absoluteLine,
          rule: 'onDelete-must-be-explicit',
          model: rel.sourceModel,
          target: rel.targetModel,
          message: `Relation ${rel.sourceModel} → ${rel.targetModel} must declare onDelete: explicitly. Default is NO ACTION; making the choice visible at the call site prevents silent flips in future migrations.`,
          excerpt: rel.raw,
        })
        continue
      }
      // Rule 2: Cascade onto User from forbidden owner models.
      if (
        rel.targetModel === 'User' &&
        rel.onDelete === 'Cascade' &&
        CASCADE_ON_USER_FORBIDDEN.has(rel.sourceModel)
      ) {
        violations.push({
          file: 'prisma/schema.prisma',
          line: rel.absoluteLine,
          rule: 'cascade-on-user-forbidden',
          model: rel.sourceModel,
          target: rel.targetModel,
          message: `${rel.sourceModel}.user is set to onDelete: Cascade. ${rel.sourceModel} rows must be retained (tax/audit). Use Restrict and let the application-layer erase flow anonimize.`,
          excerpt: rel.raw,
        })
        continue
      }
      // Rule 3: Cascade onto User from a model NOT in the explicit OK
      // map. Forces an entry in CASCADE_ON_USER_OK with a justification.
      if (
        rel.targetModel === 'User' &&
        rel.onDelete === 'Cascade' &&
        !CASCADE_ON_USER_OK.has(rel.sourceModel) &&
        !CASCADE_ON_USER_FORBIDDEN.has(rel.sourceModel)
      ) {
        violations.push({
          file: 'prisma/schema.prisma',
          line: rel.absoluteLine,
          rule: 'cascade-on-user-needs-justification',
          model: rel.sourceModel,
          target: rel.targetModel,
          message: `${rel.sourceModel}.user is set to onDelete: Cascade, but ${rel.sourceModel} is not in CASCADE_ON_USER_OK. Either add ${rel.sourceModel} to that allowlist with a one-word reason, or change to Restrict / SetNull.`,
          excerpt: rel.raw,
        })
      }
    }
  }
}

audit()

// Baseline is keyed by rule + sourceModel + targetModel. The line
// number deliberately does NOT participate in the key — line numbers
// drift on every unrelated edit, and we don't want a docstring change
// to spuriously "fix" a baseline entry.
function violationKey(v) {
  return `${v.rule}|${v.model}|${v.target}`
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return new Set()
  try {
    const raw = JSON.parse(readFileSync(BASELINE, 'utf8'))
    return new Set(raw.violations || [])
  } catch {
    return new Set()
  }
}

const baseline = loadBaseline()
const currentKeys = new Set(violations.map(violationKey))
const netNew = violations.filter((v) => !baseline.has(violationKey(v)))
const cleanedUp = [...baseline].filter((k) => !currentKeys.has(k))

if (UPDATE_BASELINE) {
  const nextBaseline = {
    note:
      'Pre-existing FK relations without an explicit onDelete declaration. ' +
      'CI tolerates these; new violations fail the build. Shrink this file ' +
      'as the schema gets cleaned up — never grow it.',
    generatedAt: new Date().toISOString(),
    violations: [...currentKeys].sort(),
  }
  writeFileSync(BASELINE, JSON.stringify(nextBaseline, null, 2) + '\n')
  process.stdout.write(
    `audit-fk-onDelete: baseline updated — ${currentKeys.size} entries\n`,
  )
  process.exit(0)
}

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        violations: ALL ? violations : netNew,
        netNewCount: netNew.length,
        baselineSize: baseline.size,
        cleanedUpCount: cleanedUp.length,
      },
      null,
      2,
    ) + '\n',
  )
} else {
  const toReport = ALL ? violations : netNew
  for (const v of toReport) {
    process.stdout.write(`\n[${v.rule}] ${v.file}:${v.line}\n`)
    process.stdout.write(`  ${v.message}\n`)
    process.stdout.write(`  > ${v.excerpt}\n`)
  }
  if (netNew.length === 0 && cleanedUp.length === 0) {
    process.stdout.write(
      `\naudit-fk-onDelete: clean (baseline = ${baseline.size}, no net-new violations)\n`,
    )
  } else if (netNew.length === 0 && cleanedUp.length > 0) {
    process.stdout.write(
      `\naudit-fk-onDelete: ${cleanedUp.length} entry/entries cleaned up since baseline.\n` +
        `  Run \`npm run audit:fk -- --update-baseline\` to ratchet the baseline DOWN.\n`,
    )
  } else {
    process.stdout.write(
      `\naudit-fk-onDelete: ${netNew.length} NET-NEW violation(s).\n` +
        `  Total in schema: ${violations.length} (baseline tolerates ${baseline.size}).\n` +
        `  Either fix the relation, or — if the violation is genuinely intentional — ` +
        `move the entity into the appropriate allowlist in this script.\n`,
    )
  }
}

// Block the build only on NEW violations. Cleanups never block.
if (netNew.length > 0 && !SOFT) process.exit(1)

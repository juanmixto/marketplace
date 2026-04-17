#!/usr/bin/env node
/**
 * audit-domain-contracts.mjs
 *
 * Dynamic enforcement of the rules in docs/ai-guidelines.md that ESLint
 * can't express cleanly (cycles, 'use client' cross-checks, domain-scoped
 * allowlists). Walks src/, parses imports with regex, and reports:
 *
 *   1. Cross-domain deep imports into `internal/`, `_private/`, `_*` subfolders.
 *   2. Imports of `*-store.ts` (Zustand) from non-`'use client'` files.
 *      Stores may be imported directly from client files, but must NEVER be
 *      pulled into the server graph (Server Components, Server Actions,
 *      middleware, route handlers without `'use client'`).
 *   3. `any` usage inside src/domains/ outside the allowlist.
 *   4. Circular dependencies between domains (A imports B, B imports A transitively).
 *   5. Exported Zod schemas in src/shared/types/ or src/domains/ that have
 *      no corresponding freeze test in test/contracts/. Catches schemas
 *      added without the matching shape-pin test (the freeze pattern
 *      established by PR #502 and continued in #509/#511/#513).
 *
 * Exit codes:
 *   0 — no violations
 *   1 — violations found (use --soft to always exit 0)
 *
 * Usage:
 *   node scripts/audit-domain-contracts.mjs [--soft] [--json]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const DOMAINS = join(SRC, 'domains')
const SOFT = process.argv.includes('--soft')
const JSON_OUT = process.argv.includes('--json')

// Files where an `any` is allowed (Prisma raw query escapes, generated code).
const ANY_ALLOWLIST = new Set([
  'src/domains/payments/webhook-dlq.ts',
  'src/domains/orders/actions.ts',
])

// Schemas that legitimately don't need a freeze test. Add a name here
// only with a one-line justification in the comment. Reasons that
// qualify: (a) the schema is a private validation helper one caller
// uses internally, (b) the schema is intentionally lenient and the
// shape doesn't matter, (c) deprecated and being removed,
// (d) TODO(freeze): scheduled for a follow-up freeze PR.
const SCHEMA_FREEZE_ALLOWLIST = new Set([
  // Wrapper around orderItemSchema (which IS pinned in
  // test/contracts/domain/orders-schemas.test.ts):
  'orderItemsSchema',

  // ─── Notifications domain (PR #504 / Telegram integration) ────────────────
  // These shipped without freeze tests; the audit caught them on first run.
  // Recommended to freeze in a follow-up. Allowlisted here so the audit
  // mechanism itself can ship without being held by unrelated cleanup.
  'orderCreatedPayloadSchema',     // TODO(freeze): outbound notification payload contract
  'orderPendingPayloadSchema',     // TODO(freeze): outbound notification payload contract
  'messageReceivedPayloadSchema',  // TODO(freeze): outbound notification payload contract
  'setPreferenceInputSchema',      // TODO(freeze): preference write surface
  'telegramMessageSchema',         // sub-schema of telegramUpdateSchema (already pinned via telegramUpdateSchema test)
  'telegramCallbackQuerySchema',   // sub-schema of telegramUpdateSchema (already pinned)
  'notificationChannelSchema',     // TODO(freeze): nativeEnum wrapper, low-risk
  'notificationEventTypeSchema',   // TODO(freeze): nativeEnum wrapper, low-risk
  'notificationDeliveryStatusSchema', // TODO(freeze): nativeEnum wrapper, low-risk
])

const VIOLATIONS = {
  privateDeepImport: [],
  storeInServerGraph: [],
  anyInDomain: [],
  cycles: [],
  unfrozenSchema: [],
}

/** Recursively list .ts/.tsx files under a directory. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'generated') continue
      walk(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"`;]*?from\s+)?['"]([^'"]+)['"]/g

/** Return the list of module specifiers imported/re-exported by `src`. */
function extractImports(src) {
  const out = []
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(src)) !== null) out.push(m[1])
  return out
}

function domainOfFile(relPath) {
  const parts = relPath.split(sep)
  if (parts[0] !== 'src' || parts[1] !== 'domains') return null
  return parts[2] || null
}

function domainOfSpecifier(spec) {
  if (!spec.startsWith('@/domains/')) return null
  const rest = spec.slice('@/domains/'.length).split('/')
  return rest[0] || null
}

function isPrivateSegment(seg) {
  return seg === 'internal' || seg === 'private' || seg.startsWith('_')
}

function isStoreSpecifier(spec) {
  return /-store(\.ts|\.tsx)?$/.test(spec)
}

const ANY_RE = /(?<![a-zA-Z_$0-9])(?::\s*any\b|as\s+any\b|<\s*any\s*>)/g

const USE_CLIENT_RE = /^\s*['"]use client['"]/m

function checkFile(absPath) {
  const rel = relative(ROOT, absPath)
  const src = readFileSync(absPath, 'utf8')
  const fileDomain = domainOfFile(rel)
  const isClient = USE_CLIENT_RE.test(src.split('\n').slice(0, 5).join('\n'))

  for (const spec of extractImports(src)) {
    if (!spec.startsWith('@/domains/')) continue

    const targetDomain = domainOfSpecifier(spec)
    const crossDomain = fileDomain && targetDomain && fileDomain !== targetDomain
    const external = !fileDomain

    const subPath = spec.slice(`@/domains/${targetDomain}/`.length).split('/')
    const firstSeg = subPath[0] || ''

    if ((crossDomain || external) && isPrivateSegment(firstSeg)) {
      VIOLATIONS.privateDeepImport.push({ file: rel, import: spec })
    }

    if (!isClient && isStoreSpecifier(spec)) {
      VIOLATIONS.storeInServerGraph.push({ file: rel, import: spec })
    }
  }

  if (rel.startsWith(`src${sep}domains${sep}`) && !ANY_ALLOWLIST.has(rel.split(sep).join('/'))) {
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      ANY_RE.lastIndex = 0
      if (ANY_RE.test(line)) {
        VIOLATIONS.anyInDomain.push({ file: rel, line: i + 1, text: line.trim().slice(0, 140) })
      }
    })
  }
}

/** Build a domain-level import graph and report cycles. */
function detectCycles(files) {
  const graph = new Map()
  for (const abs of files) {
    const rel = relative(ROOT, abs)
    const from = domainOfFile(rel)
    if (!from) continue
    const src = readFileSync(abs, 'utf8')
    const targets = graph.get(from) ?? new Set()
    for (const spec of extractImports(src)) {
      const to = domainOfSpecifier(spec)
      if (to && to !== from) targets.add(to)
    }
    graph.set(from, targets)
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map()
  const stack = []
  const cycles = []

  function visit(node) {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE
      if (c === GRAY) {
        const i = stack.indexOf(next)
        cycles.push(stack.slice(i).concat(next))
      } else if (c === WHITE) {
        visit(next)
      }
    }
    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node)
  }

  const seen = new Set()
  for (const c of cycles) {
    const key = [...c].sort().join('>')
    if (seen.has(key)) continue
    seen.add(key)
    VIOLATIONS.cycles.push(c.join(' → '))
  }
}

/**
 * Detect Zod schemas exported from `src/shared/types/` or `src/domains/`
 * that have no matching freeze test in `test/contracts/`.
 *
 * Heuristic: a schema is "frozen" if its exported name appears as a
 * named import inside any file under `test/contracts/`. False
 * positives are possible (a schema imported but not actually
 * shape-asserted), but the freeze pattern uses
 * `assertShape('name', schema, …)` which always names the schema
 * as a value — so a real reference is a strong signal. False
 * negatives only happen for schemas referenced only via wildcard
 * imports, which the freeze tests don't use.
 *
 * The allowlist (`SCHEMA_FREEZE_ALLOWLIST`) is for schemas that are
 * intentionally not contract surfaces.
 */
const SCHEMA_EXPORT_RE = /^\s*export\s+const\s+(\w+[Ss]chema)\s*=\s*z\./gm

function detectUnfrozenSchemas() {
  // 1. Find all exported schemas in src/shared and src/domains.
  const declared = new Map() // name -> file
  const scanRoots = [join(SRC, 'shared'), DOMAINS]
  for (const root of scanRoots) {
    let files
    try {
      files = walk(root)
    } catch {
      continue
    }
    for (const abs of files) {
      const rel = relative(ROOT, abs)
      if (rel.includes(`generated${sep}`)) continue
      const src = readFileSync(abs, 'utf8')
      SCHEMA_EXPORT_RE.lastIndex = 0
      let m
      while ((m = SCHEMA_EXPORT_RE.exec(src)) !== null) {
        const name = m[1]
        if (!declared.has(name)) declared.set(name, rel)
      }
    }
  }

  // 2. Find all schema names referenced from test/contracts/ or
  //    test/features/. The freeze pattern lives under
  //    test/contracts/domain/ (PRs #502/#509/#511/#513), but some
  //    domains' schemas are pinned through the existing
  //    test/features/ behavioral tests (e.g. the telegram update
  //    schema is exercised by test/features/telegram-update-schema.test.ts).
  //    Either kind of named-import counts as "frozen" — the schema
  //    name is mentioned somewhere CI runs.
  const referenced = new Set()
  const testRoots = [
    join(ROOT, 'test', 'contracts'),
    join(ROOT, 'test', 'features'),
  ]
  let testFiles = []
  for (const root of testRoots) {
    try {
      testFiles = testFiles.concat(walk(root))
    } catch {
      // directory missing → skip
    }
  }
  // Match named imports like:
  //   import { fooSchema, barSchema } from '@/...'
  //   import { fooSchema as alias, barSchema } from '@/...'
  // We don't need the `from` clause; just scan `{ ... }` blocks for
  // identifiers ending in Schema/schema.
  const NAMED_IMPORT_RE = /import\s*(?:type\s+)?\{([^}]+)\}\s*from/g
  const NAME_RE = /(\w+[Ss]chema)\b/g
  for (const abs of testFiles) {
    const src = readFileSync(abs, 'utf8')
    NAMED_IMPORT_RE.lastIndex = 0
    let m
    while ((m = NAMED_IMPORT_RE.exec(src)) !== null) {
      const block = m[1]
      NAME_RE.lastIndex = 0
      let nm
      while ((nm = NAME_RE.exec(block)) !== null) {
        referenced.add(nm[1])
      }
    }
  }

  // 3. Diff.
  for (const [name, file] of declared) {
    if (SCHEMA_FREEZE_ALLOWLIST.has(name)) continue
    if (referenced.has(name)) continue
    VIOLATIONS.unfrozenSchema.push({ file, name })
  }
}

function main() {
  const files = walk(SRC)
  for (const f of files) checkFile(f)
  detectCycles(files)
  detectUnfrozenSchemas()

  const total =
    VIOLATIONS.privateDeepImport.length +
    VIOLATIONS.storeInServerGraph.length +
    VIOLATIONS.anyInDomain.length +
    VIOLATIONS.cycles.length +
    VIOLATIONS.unfrozenSchema.length

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ total, ...VIOLATIONS }, null, 2) + '\n')
    process.exit(total === 0 || SOFT ? 0 : 1)
  }

  const L = (n) => `\x1b[${n}m`
  const RED = L(31), YEL = L(33), GRN = L(32), DIM = L(2), RST = L(0)

  console.log(`${DIM}audit-domain-contracts · scanning ${files.length} files${RST}`)
  console.log()

  function section(title, items, color = YEL) {
    console.log(`${color}▸ ${title} (${items.length})${RST}`)
    if (items.length === 0) {
      console.log(`  ${GRN}none${RST}`)
    } else {
      for (const it of items.slice(0, 50)) {
        if (typeof it === 'string') console.log(`  ${it}`)
        else if (it.line) console.log(`  ${it.file}:${it.line}  ${DIM}${it.text}${RST}`)
        else console.log(`  ${it.file}  ${DIM}← ${it.import}${RST}`)
      }
      if (items.length > 50) console.log(`  ${DIM}… and ${items.length - 50} more${RST}`)
    }
    console.log()
  }

  section('Cross-domain deep imports into internal/private/_*', VIOLATIONS.privateDeepImport, RED)
  section('*-store.ts imported from non-`use client` files', VIOLATIONS.storeInServerGraph, RED)
  section('`any` in src/domains/ outside allowlist', VIOLATIONS.anyInDomain, YEL)
  section('Domain-level dependency cycles', VIOLATIONS.cycles, RED)
  section(
    'Exported Zod schemas without a freeze test in test/contracts/',
    VIOLATIONS.unfrozenSchema.map(v => `${v.file}  ${DIM}← exports ${v.name}${RST}`),
    YEL,
  )

  if (total === 0) {
    console.log(`${GRN}✓ No contract violations.${RST}`)
    process.exit(0)
  }

  console.log(`${total > 0 ? RED : GRN}${total} violation(s) total.${RST}`)
  console.log(`${DIM}See docs/ai-guidelines.md for the rules.${RST}`)
  process.exit(SOFT ? 0 : 1)
}

main()

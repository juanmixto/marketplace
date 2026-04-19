import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const DEV_ROOT = path.join(process.cwd(), 'src', 'app', 'dev')

function listDevPages(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listDevPages(full))
    } else if (entry === 'page.tsx' || entry === 'page.ts') {
      out.push(full)
    }
  }
  return out
}

test('dev routes are explicitly blocked in production', () => {
  const pages = listDevPages(DEV_ROOT)
  const violations: string[] = []

  for (const file of pages) {
    const content = readFileSync(file, 'utf-8')
    const hasProdGuard =
      content.includes("process.env.NODE_ENV === 'production'") &&
      content.includes('notFound()')

    if (!hasProdGuard) {
      violations.push(path.relative(process.cwd(), file))
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Dev-only route(s) missing an explicit production guard:\n${violations.map(v => `  - ${v}`).join('\n')}`
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const SCRIPT = join(process.cwd(), 'scripts', 'audit-status-write.mjs')

function runScript(cwd: string) {
  const out = execFileSync('node', [SCRIPT, '--json', '--soft'], { cwd, encoding: 'utf8' })
  return JSON.parse(out) as {
    violations: Array<{ file: string; model: string; excerpt: string }>
    netNewCount: number
    baselineSize: number
    cleanedUpCount: number
  }
}

test('audit-status-write reports direct status writes outside the allowlist', () => {
  const root = mkdtempSync(join(tmpdir(), 'audit-status-write-'))
  try {
    mkdirSync(join(root, 'src', 'domains', 'orders'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'domains', 'orders', 'writers.ts'),
      "await db.order.update({ where: { id }, data: { status: 'PLACED' } })\n",
    )
    writeFileSync(join(root, 'scripts', 'audit-status-write.baseline.json'), '{"violations":[]}\n')

    const result = runScript(root)
    assert.equal(result.netNewCount, 1)
    assert.equal(result.violations.length, 1)
    assert.equal(result.violations[0]!.file, 'src/domains/orders/writers.ts')
    assert.equal(result.violations[0]!.model, 'order')
    assert.match(result.violations[0]!.excerpt, /status/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('audit-status-write ignores writes in state-machine modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'audit-status-write-'))
  try {
    mkdirSync(join(root, 'src', 'domains', 'orders'), { recursive: true })
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'domains', 'orders', 'state-machine.ts'),
      "await tx.order.update({ where: { id }, data: { status: next } })\n",
    )
    writeFileSync(join(root, 'scripts', 'audit-status-write.baseline.json'), '{"violations":[]}\n')

    const result = runScript(root)
    assert.equal(result.netNewCount, 0)
    assert.equal(result.violations.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

#!/usr/bin/env node
// Generates public/sw.js from public/sw.template.js by substituting
// __BUILD_ID__ with a per-deploy identifier. Runs in `prebuild`.
//
// Precedence for the build ID:
//   1. VERCEL_GIT_COMMIT_SHA (Vercel builds)
//   2. GITHUB_SHA (CI)
//   3. `git rev-parse --short HEAD` (local)
//   4. `dev-<timestamp>` fallback

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

function resolveBuildId() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12)
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return `dev-${Date.now()}`
  }
}

const root = resolve(import.meta.dirname ?? '.', '..')
const templatePath = resolve(root, 'public/sw.template.js')
const outPath = resolve(root, 'public/sw.js')

const buildId = resolveBuildId()
const template = readFileSync(templatePath, 'utf8')
const out = template.replace(/__BUILD_ID__/g, buildId)
writeFileSync(outPath, out)

console.log(`[build-sw] public/sw.js generated with SW_VERSION=${buildId}`)

export function shouldBypassAppCache() {
  return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_E2E === '1'
}

/**
 * Spanish municipalities dataset (source: GeoNames ES.txt, 2026).
 * ~6.7k rows; loaded lazily to keep the initial JS bundle lean.
 *
 * Shape is intentionally flat so the dataset can be filtered in-memory
 * without a DB trip. Province is referenced by its 2-digit INE prefix
 * (same prefix used in `spain-provinces.ts`).
 */
import { normalizeProvinceName, getPrefixForProvince } from '@/domains/shipping/spain-provinces'

export interface Municipality {
  name: string
  prefix: string
  postalCodes: string[]
}

let cached: Municipality[] | null = null
let inflight: Promise<Municipality[]> | null = null

async function loadAll(): Promise<Municipality[]> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = import('./data/spain-municipalities.json').then(mod => {
    cached = ((mod as { default?: Municipality[] }).default ?? mod) as Municipality[]
    inflight = null
    return cached
  })
  return inflight
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export interface SearchOptions {
  query: string
  province?: string
  limit?: number
}

/**
 * Filters municipalities by province (name or prefix) and a fuzzy
 * query. Results are ranked: prefix-match first, then substring. Async
 * because the dataset is lazy-loaded on first call.
 */
export async function searchMunicipalities(
  opts: SearchOptions,
): Promise<Municipality[]> {
  const all = await loadAll()
  const limit = opts.limit ?? 10
  const q = normalize(opts.query)
  const prefix = opts.province
    ? opts.province.length === 2
      ? opts.province
      : getPrefixForProvince(opts.province)
    : null

  const pool = prefix ? all.filter(m => m.prefix === prefix) : all
  if (!q) return pool.slice(0, limit)

  const starts: Municipality[] = []
  const contains: Municipality[] = []
  for (const m of pool) {
    const n = normalize(m.name)
    if (n.startsWith(q)) starts.push(m)
    else if (n.includes(q)) contains.push(m)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

/** Exact-name lookup within a province (by name or prefix). */
export async function findMunicipality(
  province: string,
  name: string,
): Promise<Municipality | null> {
  const all = await loadAll()
  const prefix =
    province.length === 2 ? province : getPrefixForProvince(province)
  if (!prefix) return null
  const target = normalizeProvinceName(name)
  return (
    all.find(m => m.prefix === prefix && normalizeProvinceName(m.name) === target) ??
    null
  )
}

/** Test-only: reset the module cache. */
export function _resetMunicipalityCache(): void {
  cached = null
  inflight = null
}

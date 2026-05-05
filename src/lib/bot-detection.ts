import dns from 'node:dns/promises'
import net from 'node:net'

type HeaderStore = Pick<Headers, 'get'>

interface BotRule {
  userAgent: RegExp
  allowedHostSuffixes: string[]
}

interface BotDnsDeps {
  reverse?: (ip: string) => Promise<string[]>
  lookupAddresses?: (hostname: string) => Promise<string[]>
  timeoutMs?: number
}

const SEARCH_BOT_RULES: BotRule[] = [
  {
    userAgent: /googlebot/i,
    allowedHostSuffixes: ['googlebot.com', 'google.com'],
  },
  {
    userAgent: /bingbot/i,
    allowedHostSuffixes: ['search.msn.com'],
  },
]

async function lookupAddresses(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true })
  return records.map(record => record.address)
}

function isAllowedHostname(hostname: string, suffixes: string[]): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return suffixes.some(suffix => normalized === suffix || normalized.endsWith(`.${suffix}`))
}

function normalizeIp(ip: string): string {
  return ip.trim().toLowerCase()
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('bot-detection timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/**
 * Returns true when the request looks like a verified crawler that passed
 * reverse-DNS + forward-DNS validation.
 */
export async function isVerifiedSearchBot(
  headerStore: HeaderStore,
  ip: string | null,
  deps: BotDnsDeps = {},
): Promise<boolean> {
  if (!ip || net.isIP(ip) === 0) return false

  const userAgent = headerStore.get('user-agent') ?? ''
  const rule = SEARCH_BOT_RULES.find(candidate => candidate.userAgent.test(userAgent))
  if (!rule) return false

  const reverse = deps.reverse ?? dns.reverse
  const lookup = deps.lookupAddresses ?? lookupAddresses
  const timeoutMs = deps.timeoutMs ?? 1_000

  let hostnames: string[]
  try {
    hostnames = await withTimeout(reverse(ip), timeoutMs)
  } catch {
    return false
  }

  for (const hostname of hostnames) {
    if (!isAllowedHostname(hostname, rule.allowedHostSuffixes)) continue

    let addresses: string[]
    try {
      addresses = await withTimeout(lookup(hostname), timeoutMs)
    } catch {
      continue
    }

    if (addresses.some(address => normalizeIp(address) === normalizeIp(ip))) {
      return true
    }
  }

  return false
}

/**
 * Spanish provinces keyed by the 2-digit postal-code prefix (the
 * "código INE"). Re-exported so both the shipping calculator and the
 * vendor-address UI share a single source of truth.
 *
 * Phone/postal validation elsewhere in the shipping domain uses this map
 * to enforce that a postal code starts with the prefix of the selected
 * province.
 */
export const SPAIN_PROVINCE_BY_PREFIX: Record<string, string> = {
  '01': 'Álava',
  '02': 'Albacete',
  '03': 'Alicante',
  '04': 'Almería',
  '05': 'Ávila',
  '06': 'Badajoz',
  '07': 'Illes Balears',
  '08': 'Barcelona',
  '09': 'Burgos',
  '10': 'Cáceres',
  '11': 'Cádiz',
  '12': 'Castellón',
  '13': 'Ciudad Real',
  '14': 'Córdoba',
  '15': 'A Coruña',
  '16': 'Cuenca',
  '17': 'Girona',
  '18': 'Granada',
  '19': 'Guadalajara',
  '20': 'Gipuzkoa',
  '21': 'Huelva',
  '22': 'Huesca',
  '23': 'Jaén',
  '24': 'León',
  '25': 'Lleida',
  '26': 'La Rioja',
  '27': 'Lugo',
  '28': 'Madrid',
  '29': 'Málaga',
  '30': 'Murcia',
  '31': 'Navarra',
  '32': 'Ourense',
  '33': 'Asturias',
  '34': 'Palencia',
  '35': 'Las Palmas',
  '36': 'Pontevedra',
  '37': 'Salamanca',
  '38': 'Santa Cruz de Tenerife',
  '39': 'Cantabria',
  '40': 'Segovia',
  '41': 'Sevilla',
  '42': 'Soria',
  '43': 'Tarragona',
  '44': 'Teruel',
  '45': 'Toledo',
  '46': 'Valencia',
  '47': 'Valladolid',
  '48': 'Bizkaia',
  '49': 'Zamora',
  '50': 'Zaragoza',
  '51': 'Ceuta',
  '52': 'Melilla',
}

export interface SpainProvince {
  prefix: string
  name: string
}

export const SPAIN_PROVINCES: SpainProvince[] = Object.entries(SPAIN_PROVINCE_BY_PREFIX)
  .map(([prefix, name]) => ({ prefix, name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'))

export function getPrefixForProvince(name: string): string | null {
  const match = SPAIN_PROVINCES.find(
    p => normalizeProvinceName(p.name) === normalizeProvinceName(name),
  )
  return match?.prefix ?? null
}

export function normalizeProvinceName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Whether a 5-digit Spanish postal code matches the given province name.
 * Returns true for empty postal codes so validation can be split from
 * required-checks in the caller.
 */
export function postalCodeMatchesProvince(postalCode: string, provinceName: string): boolean {
  if (!postalCode) return true
  if (!/^\d{5}$/.test(postalCode)) return false
  const expected = getPrefixForProvince(provinceName)
  if (!expected) return false
  return postalCode.slice(0, 2) === expected
}

/**
 * E.164-ish Spanish-friendly phone validation: accepts digits, spaces,
 * a leading plus, parentheses and hyphens, with at least 9 digit
 * characters total. Rejects anything containing letters.
 */
const PHONE_ALLOWED_CHARS = /^[+\d\s()\-]+$/
const MIN_PHONE_DIGITS = 9
const MAX_PHONE_DIGITS = 15

export function isValidPhone(value: string): boolean {
  if (!value) return false
  if (!PHONE_ALLOWED_CHARS.test(value)) return false
  const digits = value.replace(/\D/g, '')
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS
}

/**
 * Lenient phone check for forms where we don't want to gate submission
 * on micro-formatting. Accepts anything with at least 7 digits and not
 * more than 15, regardless of spacing/punctuation. Letters still bounce.
 */
const LENIENT_MIN_PHONE_DIGITS = 7

export function isPlausiblePhone(value: string): boolean {
  if (!value) return false
  if (!PHONE_ALLOWED_CHARS.test(value)) return false
  const digits = value.replace(/\D/g, '')
  return digits.length >= LENIENT_MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS
}

/**
 * Collapses a user-typed phone into a canonical form for storage:
 * strips any character that isn't a digit or leading '+', then
 * collapses runs of whitespace. Preserves the plus so international
 * prefixes survive ("+34 600-000-000" → "+34600000000").
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

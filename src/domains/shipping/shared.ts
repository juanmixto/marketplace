export interface ShippingRateLike {
  id?: string
  zoneId: string
  name: string
  minOrderAmount?: number | null
  price: number
  freeAbove?: number | null
  isActive: boolean
}

export interface ShippingZoneLike {
  id: string
  name: string
  provinces: string[]
  isActive: boolean
}

const PROVINCE_BY_POSTAL_PREFIX: Record<string, string> = {
  '01': 'Araba',
  '02': 'Albacete',
  '03': 'Alicante',
  '04': 'Almeria',
  '05': 'Avila',
  '06': 'Badajoz',
  '07': 'Illes Balears',
  '08': 'Barcelona',
  '09': 'Burgos',
  '10': 'Caceres',
  '11': 'Cadiz',
  '12': 'Castellon',
  '13': 'Ciudad Real',
  '14': 'Cordoba',
  '15': 'A Coruna',
  '16': 'Cuenca',
  '17': 'Girona',
  '18': 'Granada',
  '19': 'Guadalajara',
  '20': 'Gipuzkoa',
  '21': 'Huelva',
  '22': 'Huesca',
  '23': 'Jaen',
  '24': 'Leon',
  '25': 'Lleida',
  '26': 'La Rioja',
  '27': 'Lugo',
  '28': 'Madrid',
  '29': 'Malaga',
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

function normalizeProvince(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function getProvinceFromPostalCode(postalCode: string) {
  const prefix = postalCode.slice(0, 2)
  return PROVINCE_BY_POSTAL_PREFIX[prefix] ?? 'Desconocida'
}

export function getPostalCodePrefix(postalCode: string) {
  return postalCode.slice(0, 2)
}

export function findShippingZone(
  postalCode: string,
  zones: ShippingZoneLike[]
) {
  const province = getProvinceFromPostalCode(postalCode)
  const prefix = getPostalCodePrefix(postalCode)

  return zones.find(zone => {
    if (!zone.isActive) return false

    return zone.provinces.some(provinceEntry => {
      const normalizedEntry = normalizeProvince(provinceEntry)
      return normalizedEntry === normalizeProvince(province) || normalizedEntry === prefix
    })
  }) ?? null
}

export function resolveShippingRate(
  subtotal: number,
  zoneId: string,
  rates: ShippingRateLike[]
) {
  const activeRates = rates
    .filter(rate => rate.isActive && rate.zoneId === zoneId)
    .sort((left, right) => (Number(right.minOrderAmount ?? 0) - Number(left.minOrderAmount ?? 0)))

  return activeRates.find(rate => subtotal >= Number(rate.minOrderAmount ?? 0)) ?? activeRates[0] ?? null
}

export function calculateShippingCostFromTables({
  postalCode,
  subtotal,
  zones,
  rates,
  fallbackCost,
}: {
  postalCode: string
  subtotal: number
  zones: ShippingZoneLike[]
  rates: ShippingRateLike[]
  fallbackCost: number
}) {
  const zone = findShippingZone(postalCode, zones)
  if (!zone) return roundCurrency(fallbackCost)

  const rate = resolveShippingRate(subtotal, zone.id, rates)
  if (!rate) return roundCurrency(fallbackCost)

  if (rate.freeAbove != null && subtotal >= rate.freeAbove) {
    return 0
  }

  return roundCurrency(rate.price)
}

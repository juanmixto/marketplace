export interface OrderLineSnapshot {
  id: string
  name: string
  slug: string
  images: string[]
  unit: string
  vendorName: string
  variantName?: string | null
}

export function parseOrderLineSnapshot(value: unknown): OrderLineSnapshot | null {
  if (!value || typeof value !== 'object') return null

  const snapshot = value as Record<string, unknown>
  if (
    typeof snapshot.id !== 'string' ||
    typeof snapshot.name !== 'string' ||
    typeof snapshot.slug !== 'string' ||
    !Array.isArray(snapshot.images) ||
    typeof snapshot.unit !== 'string' ||
    typeof snapshot.vendorName !== 'string'
  ) {
    return null
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    slug: snapshot.slug,
    images: snapshot.images.filter((image): image is string => typeof image === 'string'),
    unit: snapshot.unit,
    vendorName: snapshot.vendorName,
    variantName: typeof snapshot.variantName === 'string' ? snapshot.variantName : null,
  }
}

export const FAVORITES_UNAVAILABLE_MESSAGE =
  'La lista de favoritos no está disponible temporalmente. Aplica las migraciones pendientes e inténtalo de nuevo.'

type PrismaLikeError = {
  code?: unknown
  meta?: { modelName?: unknown }
  message?: unknown
}

export function isFavoritesTableMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as PrismaLikeError
  const message = typeof candidate.message === 'string' ? candidate.message : ''

  return (
    candidate.code === 'P2021' &&
    (candidate.meta?.modelName === 'Favorite' ||
     candidate.meta?.modelName === 'VendorFavorite' ||
     message.includes('Favorite') ||
     message.includes('VendorFavorite'))
  )
}

export async function withFavoritesGuard<T>(
  operation: () => Promise<T>,
  fallbackValue: T
): Promise<{ value: T; unavailable: boolean }> {
  try {
    return {
      value: await operation(),
      unavailable: false,
    }
  } catch (error) {
    if (isFavoritesTableMissingError(error)) {
      console.warn('[favorites] Favorite table unavailable; returning fallback data until migrations are applied.')
      return {
        value: fallbackValue,
        unavailable: true,
      }
    }

    throw error
  }
}

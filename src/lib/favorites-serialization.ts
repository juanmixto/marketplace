export type FavoriteProductItem = {
  id: string
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    basePrice: number
    stock: number
    vendor: {
      displayName: string
      slug: string
    }
  }
  createdAt: string
}

type FavoriteRow = {
  id: string
  createdAt: Date
  product: {
    id: string
    name: string
    slug: string
    images: string[]
    basePrice: number | { toString(): string }
    stock: number
    vendor: {
      displayName: string
      slug: string
    }
  }
}

export function serializeFavoriteProduct(favorite: FavoriteRow): FavoriteProductItem {
  return {
    id: favorite.id,
    createdAt: favorite.createdAt.toISOString(),
    product: {
      id: favorite.product.id,
      name: favorite.product.name,
      slug: favorite.product.slug,
      images: [...favorite.product.images],
      basePrice: Number(favorite.product.basePrice),
      stock: favorite.product.stock,
      vendor: {
        displayName: favorite.product.vendor.displayName,
        slug: favorite.product.vendor.slug,
      },
    },
  }
}

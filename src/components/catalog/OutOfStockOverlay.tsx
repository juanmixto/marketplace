import { cn } from '@/lib/utils'

interface OutOfStockOverlayProps {
  label: string
  className?: string
}

/**
 * Canonical "Sin stock" treatment over a product image: dim the
 * image with a translucent black wash and center a small pill so
 * the buyer sees the state without losing the photo. Use this in
 * every catalog-style card (catalog grid, favorites, vendor
 * profile) so the same product reads identically across surfaces.
 */
export function OutOfStockOverlay({ label, className }: OutOfStockOverlayProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px]',
        className,
      )}
    >
      <span className="rounded-full border border-white/20 bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow dark:border-white/10 dark:bg-black/80 dark:text-gray-200">
        {label}
      </span>
    </div>
  )
}

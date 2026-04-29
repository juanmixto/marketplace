import { SITE_NAME } from '@/lib/constants'

type BrandMarkProps = {
  size?: number
  className?: string
}

export function BrandMark({ size = 36, className }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.svg"
      alt={SITE_NAME}
      width={size}
      height={size}
      className={className}
    />
  )
}

import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid'

interface Props {
  rating: number
  size?: 'sm' | 'md'
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
}

export function StarRating({ rating, size = 'md' }: Props) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)))
  const sizeClass = SIZE_CLASSES[size]

  return (
    <div className="flex items-center gap-1" aria-label={`${rounded} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, index) => {
        const Icon = index < rounded ? StarSolidIcon : StarOutlineIcon
        return (
          <Icon
            key={index}
            aria-hidden="true"
            className={`${sizeClass} ${index < rounded ? 'text-amber-400' : 'text-amber-200 dark:text-amber-700'}`}
          />
        )
      })}
    </div>
  )
}

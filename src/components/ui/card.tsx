import { cn } from '@/lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: CardProps) {
  return (
    <div
      className={cn('border-b border-[var(--border)] px-5 py-4', className)}
      {...props}
    />
  )
}

function CardBody({ className, ...props }: CardProps) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

function CardFooter({ className, ...props }: CardProps) {
  return (
    <div
      className={cn('border-t border-[var(--border)] px-5 py-4', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardBody, CardFooter }

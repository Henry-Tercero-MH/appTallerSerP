import { cn } from '@/lib/utils'

/**
 * Primitivos de Card como funciones planas. Omitimos forwardRef porque
 * ningun consumidor del proyecto toma ref a estos divs y el `@type` cast
 * sobre React.forwardRef en JSDoc se propaga de forma inconsistente,
 * perdiendo `children`. Mantener simple.
 */

/** @param {React.HTMLAttributes<HTMLDivElement>} props */
export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
}

/** @param {React.HTMLAttributes<HTMLDivElement>} props */
export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLHeadingElement>} props */
export function CardTitle({ className, ...props }) {
  return <h3 className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLParagraphElement>} props */
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLDivElement>} props */
export function CardContent({ className, ...props }) {
  return <div className={cn('p-6 pt-0', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLDivElement>} props */
export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />
}

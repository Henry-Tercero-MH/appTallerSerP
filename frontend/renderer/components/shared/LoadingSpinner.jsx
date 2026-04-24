import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * @param {{ size?: number, className?: string, label?: string }} props
 */
export function LoadingSpinner({ size = 20, className, label }) {
  return (
    <div className={cn('flex items-center gap-2 text-muted-foreground', className)} role="status" aria-live="polite">
      <Loader2 className="animate-spin" size={size} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

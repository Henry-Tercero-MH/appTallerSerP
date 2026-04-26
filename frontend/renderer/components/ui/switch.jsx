import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * @param {{
 *   checked?: boolean
 *   onCheckedChange?: (checked: boolean) => void
 *   disabled?: boolean
 *   className?: string
 * }} props
 * @param {React.Ref<HTMLButtonElement>} ref
 */
function SwitchInner({ className, checked, onCheckedChange, disabled }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      style={checked ? { background: 'var(--primary)' } : { background: 'var(--gray-300)' }}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

const Switch = React.forwardRef(SwitchInner)
Switch.displayName = 'Switch'

export { Switch }

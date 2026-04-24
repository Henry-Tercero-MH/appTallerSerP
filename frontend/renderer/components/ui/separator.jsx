import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

/** @type {React.ForwardRefExoticComponent<React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & React.RefAttributes<React.ComponentRef<typeof SeparatorPrimitive.Root>>>} */
const Separator = React.forwardRef(function Separator(
  { className, orientation = 'horizontal', decorative = true, ...props },
  ref
) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
})

export { Separator }

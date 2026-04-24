import { cn } from '@/lib/utils'

/**
 * Primitivos de Table como funciones planas (sin forwardRef) por la misma
 * razon que card.jsx: no necesitamos refs y evita la flakiness del cast
 * JSDoc sobre React.forwardRef con checkJs.
 */

/** @param {React.HTMLAttributes<HTMLTableElement>} props */
export function Table({ className, ...props }) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

/** @param {React.HTMLAttributes<HTMLTableSectionElement>} props */
export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLTableSectionElement>} props */
export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

/** @param {React.HTMLAttributes<HTMLTableRowElement>} props */
export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      {...props}
    />
  )
}

/** @param {React.ThHTMLAttributes<HTMLTableCellElement>} props */
export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn('h-10 px-3 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}

/** @param {React.TdHTMLAttributes<HTMLTableCellElement>} props */
export function TableCell({ className, ...props }) {
  return (
    <td
      className={cn('p-3 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}

/** @param {React.HTMLAttributes<HTMLTableCaptionElement>} props */
export function TableCaption({ className, ...props }) {
  return <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
}

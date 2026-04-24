import { Toaster as SonnerToaster } from 'sonner'

/**
 * Wrapper de Sonner con los tokens del tema. Se monta una vez en main.jsx.
 * richColors=true usa colores semanticos (success/error/warning) del paquete;
 * los pintamos sobre nuestros tokens via la prop `style`.
 *
 * @param {React.ComponentProps<typeof SonnerToaster>} props
 */
export function Toaster(props) {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'bg-card text-card-foreground border border-border shadow-md',
          title: 'font-semibold',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

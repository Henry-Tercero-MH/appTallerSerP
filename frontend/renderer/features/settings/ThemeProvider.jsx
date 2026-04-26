import { useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { applyTheme, applyThemeEarly, DEFAULT_THEME_ID } from '@/lib/themes'

applyThemeEarly() // síncrono — aplica desde localStorage antes del primer render

/** @param {{ children: import('react').ReactNode }} p */
export function ThemeProvider({ children }) {
  const { data } = useSettings()

  useEffect(() => {
    const themeId = /** @type {string|undefined} */ (data?.app?.app_theme)
    if (themeId) applyTheme(themeId)
  }, [data?.app?.app_theme])

  // Guarda nombre de empresa para que reports.js lo lea sin pasar props
  useEffect(() => {
    const name = data?.business?.business_name
    if (name) localStorage.setItem('app-name', name)
  }, [data?.business?.business_name])

  return children
}

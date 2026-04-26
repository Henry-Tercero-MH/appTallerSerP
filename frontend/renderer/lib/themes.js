/**
 * Cada tema define las variables CSS que se inyectan en :root.
 * Cubre tanto el sistema legacy (--blue-*, --red-*, --sidebar-bg, etc.)
 * como los tokens Tailwind (--tw-primary-*, --tw-destructive-*, etc.).
 *
 * @typedef {{
 *   id: string
 *   name: string
 *   description: string
 *   preview: { primary: string, accent: string, sidebar: string }
 *   vars: Record<string, string>
 * }} Theme
 */

/** @type {Theme[]} */
export const THEMES = [
  {
    id: 'crimson',
    name: 'Carmesí',
    description: 'Navy profundo + rojo carmesí (por defecto)',
    preview: { primary: '#112060', accent: '#e5001f', sidebar: '#071030' },
    vars: {
      '--blue-500': '#1a2f7a', '--blue-600': '#112060', '--blue-700': '#0d1a50',
      '--blue-800': '#0a1340', '--blue-900': '#071030',
      '--red-400':  '#ff4d66', '--red-500':  '#ff1a33',
      '--red-600':  '#e5001f', '--red-700':  '#cc001b',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#eef0f8',
      '--danger':        'var(--red-600)',
      '--danger-hover':  'var(--red-700)',
      '--danger-light':  '#fff0f2',
      '--sidebar-bg':    '#071030',
      '--sidebar-text':  '#8a9ec4',
      '--sidebar-active':'var(--blue-600)',
      // Tailwind HSL
      '--tw-primary-500': '222 60% 28%',
      '--tw-primary-600': '222 65% 22%',
      '--tw-primary-700': '222 70% 17%',
      '--tw-primary':     'var(--tw-primary-700)',
      '--tw-destructive': 'var(--tw-destructive-600)',
      '--tw-accent':      'var(--tw-destructive-600)',
    },
  },
  {
    id: 'ocean',
    name: 'Océano',
    description: 'Azul cielo + cian vibrante',
    preview: { primary: '#0369a1', accent: '#0891b2', sidebar: '#0c2340' },
    vars: {
      '--blue-500': '#0ea5e9', '--blue-600': '#0369a1', '--blue-700': '#075985',
      '--blue-800': '#0c4a6e', '--blue-900': '#0c2340',
      '--red-400':  '#22d3ee', '--red-500':  '#06b6d4',
      '--red-600':  '#0891b2', '--red-700':  '#0e7490',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#e0f2fe',
      '--danger':        'var(--red-600)',
      '--danger-hover':  'var(--red-700)',
      '--danger-light':  '#ecfeff',
      '--sidebar-bg':    '#0c2340',
      '--sidebar-text':  '#7dd3fc',
      '--sidebar-active':'var(--blue-600)',
      '--tw-primary-500': '199 89% 48%',
      '--tw-primary-600': '200 98% 39%',
      '--tw-primary-700': '201 96% 32%',
      '--tw-primary':     'var(--tw-primary-600)',
      '--tw-destructive': '189 94% 43%',
      '--tw-accent':      '189 94% 43%',
    },
  },
  {
    id: 'forest',
    name: 'Bosque',
    description: 'Verde profundo + lima',
    preview: { primary: '#166534', accent: '#16a34a', sidebar: '#052e16' },
    vars: {
      '--blue-500': '#22c55e', '--blue-600': '#16a34a', '--blue-700': '#15803d',
      '--blue-800': '#166534', '--blue-900': '#052e16',
      '--red-400':  '#4ade80', '--red-500':  '#22c55e',
      '--red-600':  '#16a34a', '--red-700':  '#15803d',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#dcfce7',
      '--danger':        '#dc2626',
      '--danger-hover':  '#b91c1c',
      '--danger-light':  '#fee2e2',
      '--sidebar-bg':    '#052e16',
      '--sidebar-text':  '#86efac',
      '--sidebar-active':'var(--blue-600)',
      '--tw-primary-500': '142 71% 45%',
      '--tw-primary-600': '142 72% 37%',
      '--tw-primary-700': '142 72% 29%',
      '--tw-primary':     'var(--tw-primary-600)',
      '--tw-destructive': '0 74% 42%',
      '--tw-accent':      '142 71% 45%',
    },
  },
  {
    id: 'violet',
    name: 'Violeta',
    description: 'Púrpura corporativo + fucsia',
    preview: { primary: '#6d28d9', accent: '#9333ea', sidebar: '#1e0a3c' },
    vars: {
      '--blue-500': '#8b5cf6', '--blue-600': '#6d28d9', '--blue-700': '#5b21b6',
      '--blue-800': '#4c1d95', '--blue-900': '#1e0a3c',
      '--red-400':  '#c084fc', '--red-500':  '#a855f7',
      '--red-600':  '#9333ea', '--red-700':  '#7e22ce',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#f3e8ff',
      '--danger':        '#dc2626',
      '--danger-hover':  '#b91c1c',
      '--danger-light':  '#fee2e2',
      '--sidebar-bg':    '#1e0a3c',
      '--sidebar-text':  '#d8b4fe',
      '--sidebar-active':'var(--blue-600)',
      '--tw-primary-500': '263 70% 64%',
      '--tw-primary-600': '263 70% 50%',
      '--tw-primary-700': '263 70% 42%',
      '--tw-primary':     'var(--tw-primary-600)',
      '--tw-destructive': '0 74% 42%',
      '--tw-accent':      '271 81% 56%',
    },
  },
  {
    id: 'slate',
    name: 'Pizarra',
    description: 'Gris neutro profesional',
    preview: { primary: '#334155', accent: '#475569', sidebar: '#0f172a' },
    vars: {
      '--blue-500': '#64748b', '--blue-600': '#475569', '--blue-700': '#334155',
      '--blue-800': '#1e293b', '--blue-900': '#0f172a',
      '--red-400':  '#94a3b8', '--red-500':  '#64748b',
      '--red-600':  '#475569', '--red-700':  '#334155',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#f1f5f9',
      '--danger':        '#dc2626',
      '--danger-hover':  '#b91c1c',
      '--danger-light':  '#fee2e2',
      '--sidebar-bg':    '#0f172a',
      '--sidebar-text':  '#94a3b8',
      '--sidebar-active':'var(--blue-600)',
      '--tw-primary-500': '215 16% 47%',
      '--tw-primary-600': '215 19% 35%',
      '--tw-primary-700': '215 25% 27%',
      '--tw-primary':     'var(--tw-primary-600)',
      '--tw-destructive': '0 74% 42%',
      '--tw-accent':      '215 16% 47%',
    },
  },
  {
    id: 'amber',
    name: 'Ámbar',
    description: 'Naranja cálido + marrón oscuro',
    preview: { primary: '#b45309', accent: '#d97706', sidebar: '#1c0a00' },
    vars: {
      '--blue-500': '#f59e0b', '--blue-600': '#d97706', '--blue-700': '#b45309',
      '--blue-800': '#92400e', '--blue-900': '#1c0a00',
      '--red-400':  '#fbbf24', '--red-500':  '#f59e0b',
      '--red-600':  '#d97706', '--red-700':  '#b45309',
      '--primary':       'var(--blue-600)',
      '--primary-hover': 'var(--blue-700)',
      '--primary-light': '#fffbeb',
      '--danger':        '#dc2626',
      '--danger-hover':  '#b91c1c',
      '--danger-light':  '#fee2e2',
      '--sidebar-bg':    '#1c0a00',
      '--sidebar-text':  '#fcd34d',
      '--sidebar-active':'var(--blue-600)',
      '--tw-primary-500': '38 92% 50%',
      '--tw-primary-600': '32 95% 44%',
      '--tw-primary-700': '26 90% 37%',
      '--tw-primary':     'var(--tw-primary-600)',
      '--tw-destructive': '0 74% 42%',
      '--tw-accent':      '38 92% 50%',
    },
  },
]

export const THEME_MAP = Object.fromEntries(THEMES.map(t => [t.id, t]))
export const DEFAULT_THEME_ID = 'crimson'

const LS_KEY = 'app-theme'

/**
 * Aplica un tema inyectando sus variables en :root y lo persiste en localStorage.
 * @param {string} themeId
 */
export function applyTheme(themeId) {
  const theme = THEME_MAP[themeId] ?? THEME_MAP[DEFAULT_THEME_ID]
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value)
  }
  root.setAttribute('data-theme', theme.id)
  try { localStorage.setItem(LS_KEY, theme.id) } catch { /* private mode */ }
}

/**
 * Lee el tema guardado en localStorage y lo aplica sincrónicamente.
 * Llamar antes de que React monte para evitar flash de colores incorrectos.
 */
export function applyThemeEarly() {
  try {
    const saved = localStorage.getItem(LS_KEY) ?? DEFAULT_THEME_ID
    applyTheme(saved)
  } catch {
    applyTheme(DEFAULT_THEME_ID)
  }
}

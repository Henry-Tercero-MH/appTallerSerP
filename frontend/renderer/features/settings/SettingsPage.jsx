import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Building2, Check, Palette, Printer, ShieldCheck, Database, Download } from 'lucide-react'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch }   from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { PageHeader }     from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import { useSettings }        from '@/hooks/useSettings'
import * as settingsService   from '@/services/settingsService.js'
import { settingsKeys }       from '@/hooks/queryKeys.js'
import { THEMES, THEME_MAP, applyTheme } from '@/lib/themes'

const THEME_GROUPS = [
  { label: 'Clásicos',  ids: ['crimson','ocean','forest','violet','slate','amber','rose','teal','indigo','emerald','coral','carbon'] },
  { label: 'Claros',    ids: ['light-sky','light-sand'] },
  { label: 'Mate',      ids: ['matte-steel','matte-earth'] },
  { label: 'Neón',      ids: ['neon-cyan','neon-magenta'] },
]

// ─────────────────────────────────────────────────────────────────────────────

/** @param {Record<string, Record<string,unknown>>} grouped */
function flat(grouped) {
  /** @type {Record<string,unknown>} */
  const out = {}
  for (const cat of Object.values(grouped ?? {})) Object.assign(out, cat)
  return out
}

// ── hooks ────────────────────────────────────────────────────────────────────

function useSetSetting() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {{ key: string, value: unknown }} p */
    mutationFn: (p) => settingsService.set(p.key, p.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
    onError: (/** @type {unknown} */ e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  })
}

function useUpsertSetting() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {{ key: string, value: string }} p */
    mutationFn: (p) => settingsService.upsert(p.key, p.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.all }),
    onError: (/** @type {unknown} */ e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  })
}

// ── componentes base ──────────────────────────────────────────────────────────

/**
 * @param {{ label: string, hint?: string, children: import('react').ReactNode }} p
 */
function Field({ label, hint, children }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── sección selector de paleta ────────────────────────────────────────────────

/**
 * @param {{
 *   currentTheme: string
 *   appName: string
 *   setMut: ReturnType<typeof useSetSetting>
 *   upsertMut: ReturnType<typeof useUpsertSetting>
 * }} p
 */
function ThemeSection({ currentTheme, appName, setMut, upsertMut }) {
  const [open, setOpen]       = useState(false)
  const [preview, setPreview] = useState(currentTheme)
  const qc = useQueryClient()

  function handleOpen() { setPreview(currentTheme); setOpen(true) }

  /** @param {string} id */
  function handleSelect(id) { setPreview(id); applyTheme(id) }

  async function handleSave() {
    await upsertMut.mutateAsync({ key: 'app_theme', value: preview })
    await upsertMut.mutateAsync({ key: 'app_name',  value: appName  })
    qc.invalidateQueries({ queryKey: settingsKeys.all })
    toast.success('Tema aplicado')
    setOpen(false)
  }

  function handleCancel() { applyTheme(currentTheme); setOpen(false) }

  const active = THEMES.find(t => t.id === currentTheme) ?? THEMES[0]
  const saving = upsertMut.isPending

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Apariencia de la app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Nombre en sidebar / título">
            <Input
              defaultValue={appName}
              onBlur={async (e) => {
                const v = e.target.value.trim()
                if (v && v !== appName) {
                  await upsertMut.mutateAsync({ key: 'app_name', value: v })
                  toast.success('Nombre guardado')
                }
              }}
            />
          </Field>

          <div className="grid gap-1.5">
            <Label>Paleta de colores</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5">
                {[active.preview.sidebar, active.preview.primary, active.preview.accent].map((c, i) => (
                  <span key={i} className="block h-6 w-6 rounded-full border border-black/10" style={{ background: c }} />
                ))}
              </div>
              <span className="text-sm font-medium">{active.name}</span>
              <span className="text-xs text-muted-foreground">— {active.description}</span>
            </div>
            <Button size="sm" variant="outline" className="mt-1 w-fit" onClick={handleOpen}>
              <Palette className="mr-1.5 h-3.5 w-3.5" /> Cambiar paleta
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" /> Elegir paleta de colores
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4 py-1">
            {THEME_GROUPS.map(({ label, ids }) => {
              const themes = ids.map(id => THEME_MAP[id]).filter(Boolean)
              return (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-0.5">{label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {themes.map((theme) => {
                      const selected = preview === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handleSelect(theme.id)}
                          className={[
                            'relative flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-muted-foreground/40',
                          ].join(' ')}
                        >
                          <div className="flex gap-1 shrink-0">
                            {[theme.preview.sidebar, theme.preview.primary, theme.preview.accent].map((c, i) => (
                              <span key={i} className="block h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight truncate">{theme.name}</p>
                            <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-2">{theme.description}</p>
                          </div>
                          {selected && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Aplicar paleta'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── sección genérica con formulario ──────────────────────────────────────────

/**
 * @param {{
 *   title: string
 *   icon: import('react').ComponentType<{ className?: string }>
 *   fields: Array<{ key: string, label: string, hint?: string, type: 'string'|'number'|'boolean' }>
 *   defaults: Record<string, unknown>
 *   mut: ReturnType<typeof useSetSetting>
 * }} p
 */
function SettingsSection({ title, icon: Icon, fields, defaults, mut }) {
  const form = useForm({ defaultValues: defaults })

  useEffect(() => {
    form.reset(defaults)
  }, [JSON.stringify(defaults)]) // eslint-disable-line react-hooks/exhaustive-deps

  /** @param {Record<string,unknown>} values */
  async function onSubmit(values) {
    for (const [key, value] of Object.entries(values)) {
      await mut.mutateAsync({ key, value })
    }
    toast.success('Configuración guardada')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {fields.map(({ key, label, hint, type }) => (
            <Field key={key} label={label} hint={hint}>
              {type === 'boolean' ? (
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={!!form.watch(key)}
                    onCheckedChange={(v) => form.setValue(key, v, { shouldDirty: true })}
                  />
                </div>
              ) : type === 'number' ? (
                <Input type="number" step="any" {...form.register(key, { valueAsNumber: true })} />
              ) : (
                <Input {...form.register(key)} />
              )}
            </Field>
          ))}
          <div className="flex justify-end pt-2">
            <Button type="submit" size="sm" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ── sección logo ──────────────────────────────────────────────────────────────

/** @param {{ current: string, mut: ReturnType<typeof useSetSetting> }} p */
function LogoSection({ current, mut }) {
  const [preview, setPreview] = useState(current || null)
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  useEffect(() => { setPreview(current || null) }, [current])

  /** @param {import('react').ChangeEvent<HTMLInputElement>} e */
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300 * 1024) { toast.error('El logo no debe superar 300 KB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(/** @type {string} */ (ev.target?.result))
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!preview) return
    await mut.mutateAsync({ key: 'business_logo_base64', value: preview })
    toast.success('Logo guardado')
  }

  async function handleRemove() {
    setPreview(null)
    await mut.mutateAsync({ key: 'business_logo_base64', value: '' })
    toast.success('Logo eliminado')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Logo del negocio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20 overflow-hidden">
            {preview
              ? <img src={preview} alt="Logo" className="h-full w-full object-contain p-1" />
              : <span className="text-xs text-muted-foreground text-center px-2">Sin logo</span>
            }
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">PNG, JPG o SVG · máx. 300 KB</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                Seleccionar archivo
              </Button>
              {preview && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemove}>
                  Quitar
                </Button>
              )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        </div>
        {preview !== current && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={mut.isPending}>
              {mut.isPending ? 'Guardando...' : 'Guardar logo'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── página principal ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data, isLoading, isError } = useSettings()
  const setMut    = useSetSetting()
  const upsertMut = useUpsertSetting()

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  if (isError)   return <div className="p-6 text-destructive">Error al cargar configuración.</div>

  const s = flat(data ?? {})

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Configuración" subtitle="Personaliza la aplicación para tu negocio" />

      <div className="grid gap-6 lg:grid-cols-2">

        <SettingsSection
          title="Datos del negocio"
          icon={Building2}
          mut={setMut}
          defaults={{
            business_name:    s.business_name    ?? '',
            business_nit:     s.business_nit     ?? '',
            business_address: s.business_address ?? '',
            business_phone:   s.business_phone   ?? '',
            business_email:   s.business_email   ?? '',
            business_website: s.business_website ?? '',
            business_city:    s.business_city    ?? '',
            business_country: s.business_country ?? 'Guatemala',
          }}
          fields={[
            { key: 'business_name',    label: 'Nombre / Razón social', type: 'string' },
            { key: 'business_nit',     label: 'NIT',                   type: 'string' },
            { key: 'business_address', label: 'Dirección',             type: 'string' },
            { key: 'business_phone',   label: 'Teléfono',              type: 'string' },
            { key: 'business_email',   label: 'Correo',                type: 'string' },
            { key: 'business_website', label: 'Sitio web',             type: 'string' },
            { key: 'business_city',    label: 'Ciudad',                type: 'string' },
            { key: 'business_country', label: 'País',                  type: 'string' },
          ]}
        />

        <LogoSection
          current={typeof s.business_logo_base64 === 'string' ? s.business_logo_base64 : ''}
          mut={setMut}
        />

        <ThemeSection
          currentTheme={typeof s.app_theme === 'string' ? s.app_theme : 'crimson'}
          appName={typeof s.app_name  === 'string' ? s.app_name  : 'SerProMec'}
          setMut={setMut}
          upsertMut={upsertMut}
        />

        <SettingsSection
          title="Moneda e impuestos"
          icon={ShieldCheck}
          mut={setMut}
          defaults={{
            currency_code:         s.currency_code         ?? 'GTQ',
            currency_symbol:       s.currency_symbol       ?? 'Q',
            decimal_places:        s.decimal_places        ?? 2,
            tax_rate:              s.tax_rate              ?? 0.12,
            tax_included_in_price: s.tax_included_in_price ?? false,
          }}
          fields={[
            { key: 'currency_code',        label: 'Código moneda (ISO 4217)', type: 'string', hint: 'GTQ, USD, MXN…' },
            { key: 'currency_symbol',      label: 'Símbolo',                  type: 'string' },
            { key: 'decimal_places',       label: 'Decimales',                type: 'number' },
            { key: 'tax_rate',             label: 'Tasa de IVA (decimal)',    type: 'number', hint: '0.12 = 12 %' },
            { key: 'tax_included_in_price',label: 'Precio ya incluye IVA',   type: 'boolean' },
          ]}
        />

        <SettingsSection
          title="Ticket / Impresión"
          icon={Printer}
          mut={setMut}
          defaults={{
            ticket_footer_line1: s.ticket_footer_line1 ?? '',
            ticket_footer_line2: s.ticket_footer_line2 ?? '',
            ticket_show_logo:    s.ticket_show_logo    ?? true,
            ticket_show_tax:     s.ticket_show_tax     ?? true,
            ticket_copies:       s.ticket_copies       ?? 1,
          }}
          fields={[
            { key: 'ticket_footer_line1', label: 'Pie de ticket — línea 1', type: 'string', hint: 'Ej. ¡Gracias por su preferencia!' },
            { key: 'ticket_footer_line2', label: 'Pie de ticket — línea 2', type: 'string' },
            { key: 'ticket_show_logo',    label: 'Mostrar logo en ticket',  type: 'boolean' },
            { key: 'ticket_show_tax',     label: 'Desglosar IVA en ticket', type: 'boolean' },
            { key: 'ticket_copies',       label: 'Copias por venta',        type: 'number' },
          ]}
        />

        <BackupSection />

      </div>
    </div>
  )
}

// ── Sección: Respaldo de base de datos ───────────────────────────────────────
function BackupSection() {
  const [loading, setLoading] = useState(false)

  async function handleBackup() {
    setLoading(true)
    try {
      const res = await window.api.db.backup()
      if (!res.ok) { toast.error(res.error.message); return }
      if (res.data) toast.success(`Respaldo guardado en:\n${res.data}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear respaldo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Respaldo de datos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Exporta una copia de la base de datos SQLite. Guárdala en un lugar seguro para recuperar
          todos tus datos en caso de pérdida.
        </p>
        <Button variant="outline" size="sm" onClick={handleBackup} disabled={loading}>
          <Download className="mr-1.5 h-4 w-4" />
          {loading ? 'Generando respaldo...' : 'Descargar respaldo (.sqlite)'}
        </Button>
      </CardContent>
    </Card>
  )
}

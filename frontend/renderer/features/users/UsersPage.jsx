import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Camera, KeyRound, Pencil, Plus, Power, PowerOff, ShieldCheck, UserRound, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import * as usersService from '@/services/usersService.js'
import {
  userInputSchema, userPatchSchema, changePasswordSchema, ROLE_LABELS,
} from '@/schemas/user.schema.js'
import { useAuthContext } from '@/features/auth/AuthContext'

const ROLE_OPTIONS = [
  { value: 'admin',     label: 'Administrador' },
  { value: 'cashier',   label: 'Cajero' },
  { value: 'mechanic',  label: 'Mecánico' },
  { value: 'warehouse', label: 'Bodeguero' },
]

const ROLE_BADGE = {
  admin:     'default',
  cashier:   'secondary',
  mechanic:  'outline',
  warehouse: 'outline',
}

const userKeys = { all: ['users'], list: ['users', 'list'] }

/**
 * @param {{ user: import('@/types/api').UserRow|null|undefined, size?: number, className?: string }} p
 */
function UserAvatar({ user, size = 32, className = '' }) {
  const style = { width: size, height: size, minWidth: size, fontSize: size * 0.4 }
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.full_name}
        className={`rounded-full object-cover ${className}`}
        style={style}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${className}`}
      style={style}
    >
      {user?.full_name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

export default function UsersPage() {
  const qc = useQueryClient()
  const { user: me } = useAuthContext()

  const [modal, setModal] = useState(/** @type {any} */ (null))

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: userKeys.list,
    queryFn:  usersService.list,
    staleTime: 30_000,
  })

  const createMut = useMutation({
    mutationFn: usersService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: userKeys.all }); setModal(null) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al crear usuario'),
  })

  const updateMut = useMutation({
    mutationFn: /** @param {{ id: number, patch: any }} v */ (v) => usersService.update(v.id, v.patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: userKeys.all }); setModal(null) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
  })

  const pwdMut = useMutation({
    mutationFn: /** @param {{ id: number, password: string }} v */ (v) => usersService.changePassword(v.id, v.password),
    onSuccess: () => { toast.success('Contraseña actualizada'); setModal(null) },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al cambiar contraseña'),
  })

  const activeMut = useMutation({
    mutationFn: /** @param {{ id: number, active: boolean }} v */ (v) => usersService.setActive(v.id, v.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  })

  const { patchUser } = useAuthContext()

  const avatarMut = useMutation({
    mutationFn: /** @param {{ id: number, avatar: string|null }} v */ (v) => usersService.updateAvatar(v.id, v.avatar),
    onSuccess: (_updated, v) => {
      toast.success('Foto actualizada')
      qc.invalidateQueries({ queryKey: userKeys.all })
      if (v.id === me?.id) patchUser({ avatar: v.avatar ?? null })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al guardar foto'),
  })

  if (isLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  if (isError)   return <div className="p-6"><EmptyState title="Error al cargar usuarios" description="Reinicia la aplicación." /></div>

  return (
    <div className="p-6">
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de accesos y roles del sistema"
        actions={
          <Button size="sm" onClick={() => setModal('create')}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo usuario
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : users.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <TableRow key={u.id} className={u.active === 0 ? 'opacity-50' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <AvatarUploadCell
                          user={u}
                          onUpload={(avatar) => avatarMut.mutate({ id: u.id, avatar })}
                          onRemove={() => avatarMut.mutate({ id: u.id, avatar: null })}
                          loading={avatarMut.isPending && avatarMut.variables?.id === u.id}
                        />
                        <span className="font-medium">{u.full_name}</span>
                        {isMe && <Badge variant="outline" className="text-xs">Tú</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[u.role] ?? 'outline'}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active === 1 ? 'success' : 'destructive'}>
                        {u.active === 1 ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setModal({ edit: u })}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ pwd: u })}>
                          <KeyRound className="mr-1 h-3.5 w-3.5" /> Contraseña
                        </Button>
                        {!isMe && (
                          u.active === 1 ? (
                            <Button
                              size="sm" variant="ghost"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => activeMut.mutate({ id: u.id, active: false })}
                            >
                              <PowerOff className="mr-1 h-3.5 w-3.5" /> Desactivar
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost"
                              onClick={() => activeMut.mutate({ id: u.id, active: true })}
                            >
                              <Power className="mr-1 h-3.5 w-3.5" /> Activar
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog crear */}
      <Dialog open={modal === 'create'} onOpenChange={(o) => { if (!o) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Nuevo usuario
            </DialogTitle>
          </DialogHeader>
          <UserForm
            initial={null}
            onSubmit={async (/** @type {any} */ data) => {
              const { avatar, ...rest } = data
              const created = await usersService.create(rest)
              if (avatar && created?.id) {
                await usersService.updateAvatar(created.id, avatar)
              }
              qc.invalidateQueries({ queryKey: userKeys.all })
              setModal(null)
            }}
            loading={createMut.isPending}
            onCancel={() => setModal(null)}
            showPassword
          />
        </DialogContent>
      </Dialog>

      {/* Dialog editar */}
      <Dialog open={modal?.edit != null} onOpenChange={(o) => { if (!o) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" /> Editar usuario
            </DialogTitle>
          </DialogHeader>
          {modal?.edit && (
            <UserForm
              initial={modal.edit}
              onSubmit={async (/** @type {any} */ data) => {
                const { avatar, ...rest } = data
                await usersService.update(modal.edit.id, rest)
                await usersService.updateAvatar(modal.edit.id, avatar ?? null)
                if (modal.edit.id === me?.id) patchUser({ avatar: avatar ?? null })
                qc.invalidateQueries({ queryKey: userKeys.all })
                setModal(null)
              }}
              loading={updateMut.isPending}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog cambiar contraseña */}
      <Dialog open={modal?.pwd != null} onOpenChange={(o) => { if (!o) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Cambiar contraseña
            </DialogTitle>
            <DialogDescription>
              Usuario: <strong>{modal?.pwd?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>
          {modal?.pwd && (
            <PasswordForm
              onSubmit={(/** @type {{ password: string }} */ { password }) => pwdMut.mutate({ id: modal.pwd.id, password })}
              loading={pwdMut.isPending}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Avatar con botón de subir foto ───────────────────────────────────────────

/**
 * @param {{ user: import('@/types/api').UserRow, onUpload: (a: string) => void, onRemove: () => void, loading: boolean }} p
 */
function AvatarUploadCell({ user, onUpload, onRemove, loading }) {
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  function handleFile(/** @type {React.ChangeEvent<HTMLInputElement>} */ e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300_000) { alert('Imagen demasiado grande. Máximo 300 KB.'); return }
    const reader = new FileReader()
    reader.onload = () => onUpload(/** @type {string} */ (reader.result))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="usr-avatar-wrap">
      <UserAvatar user={user} size={34} />
      <div className="usr-avatar-actions">
        <button
          className="usr-av-btn"
          title="Cambiar foto"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          <Camera size={11} />
        </button>
        {user.avatar && (
          <button
            className="usr-av-btn usr-av-remove"
            title="Quitar foto"
            onClick={onRemove}
            disabled={loading}
          >
            <X size={11} />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ── Sub-forms ────────────────────────────────────────────────────────────────

/**
 * @param {{ initial: import('@/types/api').UserRow|null, onSubmit: (d: any) => void, loading: boolean, onCancel: () => void, showPassword?: boolean }} p
 */
function UserForm({ initial, onSubmit, loading, onCancel, showPassword = false }) {
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const [avatarPreview, setAvatarPreview] = useState(/** @type {string|null} */ (initial?.avatar ?? null))

  const schema = showPassword ? userInputSchema : userPatchSchema.extend({
    full_name: userInputSchema.shape.full_name,
    role:      userInputSchema.shape.role,
  })

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      email:     initial?.email     ?? '',
      full_name: initial?.full_name ?? '',
      role:      initial?.role      ?? 'cashier',
      password:  '',
    },
  })

  function handleAvatarFile(/** @type {React.ChangeEvent<HTMLInputElement>} */ e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 300_000) { alert('Imagen demasiado grande. Máximo 300 KB.'); return }
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(/** @type {string} */ (reader.result))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSubmit(/** @type {any} */ data) {
    onSubmit({ ...data, avatar: avatarPreview })
  }

  const initials = (form.watch('full_name') || initial?.full_name || '?')[0]?.toUpperCase()

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">

      {/* ── Foto de perfil ── */}
      <div className="usr-form-avatar-row">
        <div className="usr-form-avatar-wrap" onClick={() => fileRef.current?.click()}>
          {avatarPreview
            ? <img src={avatarPreview} alt="avatar" className="usr-form-avatar-img" />
            : <span className="usr-form-avatar-initial">{initials}</span>
          }
          <div className="usr-form-avatar-overlay">
            <Camera size={16} />
            <span>Foto</span>
          </div>
        </div>
        {avatarPreview && (
          <button type="button" className="usr-form-avatar-remove" onClick={() => setAvatarPreview(null)}>
            <X size={12} /> Quitar foto
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
      </div>

      {showPassword && (
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input {...form.register('email')} type="email" placeholder="usuario@taller.local" />
        </Field>
      )}
      <Field label="Nombre completo" error={form.formState.errors.full_name?.message}>
        <Input {...form.register('full_name')} placeholder="Juan Pérez" />
      </Field>
      <Field label="Rol" error={form.formState.errors.role?.message}>
        <select
          {...form.register('role')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {ROLE_OPTIONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </Field>
      {showPassword && (
        <Field label="Contraseña" error={form.formState.errors.password?.message}>
          <Input {...form.register('password')} type="password" placeholder="Mínimo 6 caracteres" />
        </Field>
      )}
      <DialogFooter className="gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * @param {{ onSubmit: (d: any) => void, loading: boolean, onCancel: () => void }} p
 */
function PasswordForm({ onSubmit, loading, onCancel }) {
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Field label="Nueva contraseña" error={form.formState.errors.password?.message}>
        <Input {...form.register('password')} type="password" placeholder="Mínimo 6 caracteres" />
      </Field>
      <Field label="Confirmar contraseña" error={form.formState.errors.confirmPassword?.message}>
        <Input {...form.register('confirmPassword')} type="password" placeholder="Repite la contraseña" />
      </Field>
      <DialogFooter className="gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Cambiar contraseña'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * @param {{ label: string, error?: string, children: React.ReactNode }} p
 */
function Field({ label, error, children }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

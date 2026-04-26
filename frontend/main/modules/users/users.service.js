import { createHash } from 'node:crypto'

export const ROLES = /** @type {const} */ (['admin', 'cashier', 'mechanic', 'warehouse'])

/** @param {string} password */
function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex')
}

/**
 * @param {ReturnType<typeof import('./users.repository.js').createUsersRepository>} repo
 */
export function createUsersService(repo) {
  function assertId(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error(`user id invalido: ${id}`), { code: 'USER_INVALID_ID' })
    }
  }

  function assertExists(id) {
    assertId(id)
    const row = repo.findById(id)
    if (!row) throw Object.assign(new Error(`usuario no encontrado: ${id}`), { code: 'USER_NOT_FOUND' })
    return row
  }

  return {
    /** Lista todos los usuarios sin exponer password_hash. */
    list() {
      return repo.findAll()
    },

    /** @param {number} id */
    getById(id) {
      assertId(id)
      return repo.findById(id) ?? null
    },

    /**
     * Login: valida credenciales y devuelve el usuario sin hash.
     * @param {string} email
     * @param {string} password
     */
    login(email, password) {
      if (!email || !password) {
        throw Object.assign(new Error('Email y contraseña requeridos'), { code: 'AUTH_MISSING_FIELDS' })
      }
      const user = repo.findByEmailWithHash(email.trim())
      if (!user) {
        throw Object.assign(new Error('Credenciales incorrectas'), { code: 'AUTH_INVALID' })
      }
      if (user.active === 0) {
        throw Object.assign(new Error('Usuario desactivado'), { code: 'AUTH_INACTIVE' })
      }
      if (user.password_hash !== hashPassword(password)) {
        throw Object.assign(new Error('Credenciales incorrectas'), { code: 'AUTH_INVALID' })
      }
      const { password_hash: _, ...safeUser } = user
      return safeUser
    },

    /**
     * @param {{ email: string, full_name: string, role: string, password: string }} input
     */
    create(input) {
      const email     = (input.email ?? '').trim().toLowerCase()
      const full_name = (input.full_name ?? '').trim()
      const role      = input.role

      if (!email)     throw Object.assign(new Error('Email requerido'),     { code: 'USER_MISSING_EMAIL' })
      if (!full_name) throw Object.assign(new Error('Nombre requerido'),    { code: 'USER_MISSING_NAME' })
      if (!ROLES.includes(/** @type {any} */ (role))) {
        throw Object.assign(new Error(`Rol invalido: ${role}`), { code: 'USER_INVALID_ROLE' })
      }
      if (!input.password || input.password.length < 6) {
        throw Object.assign(new Error('Contraseña minimo 6 caracteres'), { code: 'USER_WEAK_PASSWORD' })
      }

      // Verificar email único
      const existing = repo.findByEmailWithHash(email)
      if (existing) throw Object.assign(new Error('El email ya está en uso'), { code: 'USER_EMAIL_TAKEN' })

      const id = repo.create({ email, full_name, role, password_hash: hashPassword(input.password) })
      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {{ full_name?: string, role?: string }} patch
     */
    update(id, patch) {
      const row = assertExists(id)
      const full_name = (patch.full_name ?? row.full_name).trim()
      const role      = patch.role ?? row.role

      if (!full_name) throw Object.assign(new Error('Nombre requerido'), { code: 'USER_MISSING_NAME' })
      if (!ROLES.includes(/** @type {any} */ (role))) {
        throw Object.assign(new Error(`Rol invalido: ${role}`), { code: 'USER_INVALID_ROLE' })
      }
      // Proteger: no degradar al último admin
      if (row.role === 'admin' && role !== 'admin') {
        const admins = repo.findAll().filter(u => u.role === 'admin' && u.active === 1)
        if (admins.length <= 1) {
          throw Object.assign(new Error('Debe existir al menos un administrador activo'), { code: 'USER_LAST_ADMIN' })
        }
      }

      repo.update(id, { full_name, role })
      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {string} newPassword
     */
    changePassword(id, newPassword) {
      assertExists(id)
      if (!newPassword || newPassword.length < 6) {
        throw Object.assign(new Error('Contraseña minimo 6 caracteres'), { code: 'USER_WEAK_PASSWORD' })
      }
      repo.updatePassword(id, hashPassword(newPassword))
      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL (max ~300 KB) o null
     */
    updateAvatar(id, avatar) {
      assertExists(id)
      if (avatar !== null && typeof avatar !== 'string') {
        throw Object.assign(new Error('Avatar invalido'), { code: 'USER_INVALID_AVATAR' })
      }
      if (avatar && avatar.length > 400_000) {
        throw Object.assign(new Error('Imagen demasiado grande (max 300 KB)'), { code: 'USER_AVATAR_TOO_LARGE' })
      }
      repo.updateAvatar(id, avatar)
      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(id, active) {
      const row = assertExists(id)
      if (!active && row.role === 'admin') {
        const admins = repo.findAll().filter(u => u.role === 'admin' && u.active === 1)
        if (admins.length <= 1) {
          throw Object.assign(new Error('Debe existir al menos un administrador activo'), { code: 'USER_LAST_ADMIN' })
        }
      }
      repo.setActive(id, active ? 1 : 0)
      return repo.findById(id)
    },
  }
}

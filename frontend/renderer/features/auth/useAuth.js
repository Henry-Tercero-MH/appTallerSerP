import { useState, useEffect } from 'react'
import * as usersService from '@/services/usersService.js'

const SESSION_KEY = 'erp_session'

/**
 * @typedef {Object} SessionUser
 * @property {number}      id
 * @property {string}      email
 * @property {string}      full_name
 * @property {string}      role
 * @property {string|null} [avatar]
 */

/**
 * @typedef {Object} AuthValue
 * @property {SessionUser | null} user
 * @property {boolean} loading
 * @property {(email: string, password: string) => Promise<SessionUser>} login
 * @property {() => void} logout
 * @property {(patch: Partial<SessionUser>) => void} patchUser
 */

/** @returns {AuthValue} */
export function useAuth() {
  const [user, setUser] = useState(/** @type {SessionUser | null} */ (null))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch { sessionStorage.removeItem(SESSION_KEY) }
    }
    setLoading(false)
  }, [])

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<SessionUser>}
   */
  async function login(email, password) {
    const dbUser = await usersService.login(email, password)
    const session = /** @type {SessionUser} */ ({
      id:        dbUser.id,
      email:     dbUser.email,
      full_name: dbUser.full_name,
      role:      dbUser.role,
      avatar:    dbUser.avatar ?? null,
    })
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
    return session
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  /** Actualiza campos del usuario en sesión (ej: avatar) sin re-login */
  function patchUser(patch) {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
      return next
    })
  }

  return { user, loading, login, logout, patchUser }
}

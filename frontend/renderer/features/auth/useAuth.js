import { useState, useEffect } from 'react'
import { MOCK_USERS } from '../../lib/mockData'

const SESSION_KEY = 'erp_session'

/**
 * Forma del usuario tras despojar la password. Alineado con MOCK_USERS
 * en lib/mockData.js. Cuando auth se conecte a DB real, re-tipar aqui.
 *
 * @typedef {Object} SessionUser
 * @property {string} id
 * @property {string} email
 * @property {string} fullName
 * @property {string} role
 */

/**
 * @typedef {Object} AuthValue
 * @property {SessionUser | null} user
 * @property {boolean} loading
 * @property {(email: string, password: string) => SessionUser} login
 * @property {() => void} logout
 */

/**
 * @returns {AuthValue}
 */
export function useAuth() {
  const [user, setUser] = useState(/** @type {SessionUser | null} */ (null))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) setUser(JSON.parse(saved))
    setLoading(false)
  }, [])

  /**
   * @param {string} email
   * @param {string} password
   */
  function login(email, password) {
    const found = MOCK_USERS.find(
      (u) => u.email === email && u.password === password
    )
    if (!found) throw new Error('Credenciales incorrectas')
    const { password: _password, ...safeUser } = found
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser))
    setUser(safeUser)
    return safeUser
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  return { user, loading, login, logout }
}

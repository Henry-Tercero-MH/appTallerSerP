import { createContext, useContext } from 'react'
import { useAuth } from './useAuth'

/** @typedef {import('./useAuth').AuthValue} AuthValue */

/**
 * createContext(null) por runtime, pero tipamos con `AuthValue | null` para
 * que useContext devuelva el shape real y `login` no termine como `never`
 * tras el narrow del guard en useAuthContext.
 */
const AuthContext = /** @type {React.Context<AuthValue | null>} */ (createContext(null))

/** @param {{ children: React.ReactNode }} props */
export function AuthProvider({ children }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider')
  return ctx
}

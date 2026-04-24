import { useState, useEffect } from 'react';
import { MOCK_USERS } from '../../lib/mockData';

const SESSION_KEY = 'erp_session';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setUser(JSON.parse(saved));
    setLoading(false);
  }, []);

  function login(email, password) {
    const found = MOCK_USERS.find(
      (u) => u.email === email && u.password === password
    );
    if (!found) throw new Error('Credenciales incorrectas');
    const { password: _, ...safeUser } = found;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    setUser(safeUser);
    return safeUser;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }

  return { user, loading, login, logout };
}

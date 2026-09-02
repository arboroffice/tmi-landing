import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, auth } from './api';

interface AuthState { authed: boolean; login: (password: string) => Promise<boolean>; logout: () => void; }
const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(!!auth.token());
  useEffect(() => {
    const onUnauth = () => setAuthed(false);
    window.addEventListener('tmi-unauthorized', onUnauth);
    return () => window.removeEventListener('tmi-unauthorized', onUnauth);
  }, []);
  async function login(password: string): Promise<boolean> {
    try {
      const r = await api.post<{ token: string }>('/api/auth', { password });
      auth.setToken(r.token);
      setAuthed(true);
      return true;
    } catch { return false; }
  }
  function logout() { auth.clear(); setAuthed(false); }
  return <AuthContext.Provider value={{ authed, login, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

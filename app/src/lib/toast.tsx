import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = { id: number; msg: string; type: 'success' | 'error' };
const ToastCtx = createContext<(msg: string, type?: 'success' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div id="toast-root">
        {toasts.map((t) => <div key={t.id} className={`toast visible ${t.type}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

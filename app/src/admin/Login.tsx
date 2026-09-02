import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await login(pw);
    setBusy(false);
    if (!ok) toast('Invalid password', 'error');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <form onSubmit={submit} className="card" style={{ padding: 32, width: 360 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>TMI Admin</div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>Sign in to continue.</p>
        <input className="form-input" type="password" placeholder="Password" value={pw}
          onChange={(e) => setPw(e.target.value)} autoFocus />
        <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

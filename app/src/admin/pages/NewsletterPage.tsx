import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { shortDate } from '../../lib/format';
import { StatusBadge } from '../components/ListPage';

interface Issue {
  id?: string; title?: string; subject?: string; preheader?: string;
  format?: string; body?: string; audience_tag?: string;
  status?: string; sent_at?: string; recipient_count?: number; created_at?: string;
}
const FORMATS = ['standard', 'long-read', 'digest', 'announcement'];
const blank: Issue = { title: '', subject: '', preheader: '', format: 'standard', body: '', audience_tag: '' };

export function NewsletterPage() {
  const toast = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [subs, setSubs] = useState(0);
  const [form, setForm] = useState<Issue>(blank);
  const [preview, setPreview] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const r = await api.get<{ issues: Issue[]; subscriber_count: number }>('/api/newsletter').catch(() => null);
    if (r) { setIssues(r.issues || []); setSubs(r.subscriber_count || 0); }
  }
  useEffect(() => { load(); }, []);

  const set = (k: keyof Issue, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(): Promise<string | null> {
    if (!form.title && !form.subject) { toast('Add a title or subject first', 'error'); return null; }
    setBusy('save');
    const saved = await api.post<Issue>('/api/newsletter', form).catch(() => null);
    setBusy('');
    if (!saved?.id) { toast('Save failed', 'error'); return null; }
    setForm(saved); await load(); toast('Draft saved');
    return saved.id;
  }

  async function doPreview() {
    setBusy('preview');
    const r = await api.post<{ html: string }>('/api/newsletter', { action: 'preview', ...form }).catch(() => null);
    setBusy('');
    if (r?.html) setPreview(r.html);
  }

  async function sendTest() {
    if (!testEmail) { toast('Enter a test email', 'error'); return; }
    const id = form.id || (await save());
    if (!id) return;
    setBusy('test');
    const r = await api.post<{ ok: boolean; error?: string }>('/api/newsletter', { action: 'send', id, test_email: testEmail }).catch((e): { ok: boolean; error?: string } => ({ ok: false, error: e.message }));
    setBusy('');
    toast(r?.ok ? `Test sent to ${testEmail}` : (r?.error || 'Test failed'), r?.ok ? 'success' : 'error');
  }

  async function sendAll() {
    const id = form.id || (await save());
    if (!id) return;
    if (!confirm(`Send "${form.subject || form.title}" to all ${subs} subscribers? This cannot be undone.`)) return;
    setBusy('send');
    const r = await api.post<{ ok: boolean; sent?: number; error?: string }>('/api/newsletter', { action: 'send', id }).catch((e): { ok: boolean; sent?: number; error?: string } => ({ ok: false, error: e.message }));
    setBusy('');
    if (r?.ok) { toast(`Sent to ${r.sent ?? 0} subscribers`); await load(); }
    else toast(r?.error || 'Send failed', 'error');
  }

  return (
    <div style={{ padding: '20px 22px' }}>
      <div className="sec-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>Founders of the Future</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{subs.toLocaleString()} subscribers</span>
          <button className="btn" onClick={() => { setForm(blank); setPreview(''); }}>New letter</button>
        </div>
      </div>

      <div className="nl-grid">
        {/* Compose */}
        <div className="card" style={{ padding: 18 }}>
          <div className="form-group"><label className="form-label">Title</label>
            <input className="form-input" value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="This week's headline" /></div>
          <div className="form-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 180 }}><label className="form-label">Subject line</label>
              <input className="form-input" value={form.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="What lands in the inbox" /></div>
            <div className="form-group" style={{ width: 150 }}><label className="form-label">Format</label>
              <select className="form-input" value={form.format || 'standard'} onChange={(e) => set('format', e.target.value)}>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Preheader</label>
            <input className="form-input" value={form.preheader || ''} onChange={(e) => set('preheader', e.target.value)} placeholder="Preview text shown after the subject" /></div>
          <div className="form-group"><label className="form-label">Body</label>
            <textarea className="form-input" rows={14} value={form.body || ''} onChange={(e) => set('body', e.target.value)}
              placeholder={'## Section label\n\nA paragraph.\n\n> A pull quote.\n\n1. A numbered point\n- A bullet\n\n**bold** *italic* [link](https://…)'} style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, lineHeight: 1.5 }} /></div>
          <div className="form-hint">Markdown-ish: ## section, &gt; quote, 1. numbered, - bullet, **bold**, *italic*, [text](url). Or paste raw HTML.</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
            <button className="btn" onClick={doPreview} disabled={!!busy}>{busy === 'preview' ? 'Rendering…' : 'Preview'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="you@tmitechai.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <button className="btn" onClick={sendTest} disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send test'}</button>
            <button className="btn btn-primary" onClick={sendAll} disabled={!!busy}>{busy === 'send' ? 'Sending…' : `Send to all (${subs})`}</button>
          </div>
        </div>

        {/* Preview */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 420 }}>
          {preview
            ? <iframe title="Email preview" srcDoc={preview} style={{ width: '100%', height: '100%', minHeight: 560, border: 0 }} />
            : <div style={{ padding: 24, color: 'var(--muted)' }}>Press Preview to see the on-brand email.</div>}
        </div>
      </div>

      {/* History */}
      <div className="sec-head" style={{ marginTop: 26 }}><h2 style={{ fontSize: 17 }}>Past letters</h2></div>
      <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>
        {issues.map((it, i) => (
          <button key={it.id ?? i} onClick={() => { setForm(it); setPreview(''); }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '12px 16px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div><div style={{ fontWeight: 600 }}>{it.title || it.subject || 'Untitled'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.status === 'sent' ? `Sent ${shortDate(it.sent_at)} · ${it.recipient_count ?? 0}` : `Draft · ${shortDate(it.created_at)}`}</div></div>
            <StatusBadge value={it.status || 'draft'} color={it.status === 'sent' ? 'var(--green)' : 'var(--muted)'} />
          </button>
        ))}
        {!issues.length && <div style={{ padding: 16, color: 'var(--muted)' }}>No letters yet.</div>}
      </div>
    </div>
  );
}

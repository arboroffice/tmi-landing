import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { contactName, type Contact } from '../lib/format';
import { Icons } from './icons';

interface Row { id?: string; title?: string; company?: string; email?: string; first_name?: string; last_name?: string; contacts?: Contact }
interface Hit { label: string; sub: string; group: string; to: string }

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ leads: Row[]; clients: Row[]; contacts: Row[] }>({ leads: [], clients: [], contacts: [] });

  useEffect(() => {
    Promise.all([
      api.get<Row[]>('/api/leads').catch(() => [] as Row[]),
      api.get<Row[]>('/api/clients').catch(() => [] as Row[]),
      api.get<Row[]>('/api/contacts').catch(() => [] as Row[]),
    ]).then(([l, c, ct]) => setData({ leads: l || [], clients: c || [], contacts: ct || [] }));
  }, []);

  const ql = q.trim().toLowerCase();
  const results = useMemo<Hit[]>(() => {
    if (!ql) return [];
    const hit = (t: string) => t.toLowerCase().includes(ql);
    const out: Hit[] = [];
    data.leads.filter((l) => hit([contactName(l.contacts), l.contacts?.company, l.contacts?.email].filter(Boolean).join(' ')))
      .slice(0, 6).forEach((l) => out.push({ label: contactName(l.contacts, l.title), sub: l.contacts?.company || '', group: 'Leads', to: '/admin/sales' }));
    data.clients.filter((c) => hit([contactName(c.contacts), c.contacts?.company].filter(Boolean).join(' ')))
      .slice(0, 6).forEach((c) => out.push({ label: contactName(c.contacts), sub: c.contacts?.company || 'Client', group: 'Clients', to: '/admin/clients' }));
    data.contacts.filter((c) => hit([c.first_name, c.last_name, c.company, c.email].filter(Boolean).join(' ')))
      .slice(0, 6).forEach((c) => out.push({ label: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'Contact', sub: c.company || c.email || '', group: 'Contacts', to: '/admin/people' }));
    return out;
  }, [ql, data]);

  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ov-panel">
        <div className="ov-search">
          {Icons.search}
          <input autoFocus placeholder="Search leads, clients, contacts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={onClose}>Cancel</button>
        </div>
        <div className="ov-results">
          {ql && !results.length && <div className="ov-empty">No results for “{q}”.</div>}
          {results.map((r, i) => (
            <button key={i} className="ov-item" onClick={() => { nav(r.to); onClose(); }}>
              <span className="ov-item-main">{r.label}</span>
              <span className="ov-item-sub">{r.group}{r.sub ? ' · ' + r.sub : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

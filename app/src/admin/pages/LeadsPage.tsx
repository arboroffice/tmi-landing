import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';

interface Contact { first_name?: string; last_name?: string; company?: string; email?: string; phone?: string }
interface Lead { id: string; title?: string; status?: string; source?: string; contacts?: Contact }

const STATUS_COLORS: Record<string, string> = {
  new: 'var(--blue)', contacted: 'var(--amber)', qualified: 'var(--purple)',
  proposal: 'var(--chart-dark)', won: 'var(--green)', lost: 'var(--red)',
};

function name(l: Lead) {
  const c = l.contacts || {};
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || l.title || 'Unknown';
}

export function LeadsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    api.get<Lead[]>('/api/leads')
      .then((rows) => { if (live) setLeads(Array.isArray(rows) ? rows : []); })
      .catch((e) => { if (live) { setErr(e.message || 'Failed to load'); toast(e.message || 'Failed to load leads', 'error'); } });
    return () => { live = false; };
  }, [toast]);

  const filtered = useMemo(() => {
    if (!leads) return [];
    const ql = q.trim().toLowerCase();
    if (!ql) return leads;
    return leads.filter((l) => {
      const c = l.contacts || {};
      return [name(l), c.company, c.email, l.status].filter(Boolean).join(' ').toLowerCase().includes(ql);
    });
  }, [leads, q]);

  const badge = (s?: string) => (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
      background: 'var(--bg)', color: STATUS_COLORS[s || ''] || 'var(--ink-2)', border: '1px solid var(--line)' }}>
      {s || 'new'}
    </span>
  );

  return (
    <div style={{ padding: '20px 22px' }}>
      <div className="sec-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>Leads {leads ? <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 15 }}>({filtered.length})</span> : null}</h1>
        <input className="form-input" placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 260 }} />
      </div>

      {err && <div className="card" style={{ padding: 20, color: 'var(--red)' }}>{err}</div>}
      {!leads && !err && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>}
      {leads && !filtered.length && !err && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No leads{q ? ' match your search' : ' yet'}.</div>}

      {!!filtered.length && (
        <>
          {/* Desktop table */}
          <div className="rec-table-wrap card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Name</th><th style={{ padding: '12px 16px' }}>Company</th>
                  <th style={{ padding: '12px 16px' }}>Status</th><th style={{ padding: '12px 16px' }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{name(l)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-2)' }}>{l.contacts?.company || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{badge(l.status)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-2)' }}>{l.contacts?.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="rec-cards" style={{ marginTop: 12 }}>
            {filtered.map((l) => (
              <div key={l.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{name(l)}</span>{badge(l.status)}
                </div>
                {l.contacts?.company && <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{l.contacts.company}</div>}
                {l.contacts?.email && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{l.contacts.email}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { useApiList } from '../../lib/useApiList';

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode }

interface Props<T> {
  title: string;
  endpoint: string;
  columns: Column<T>[];
  card: (row: T) => ReactNode;
  search: (row: T) => string;
  right?: ReactNode;
}

// Responsive list: desktop table + phone cards, with search and states.
export function ListPage<T extends { id?: string }>({ title, endpoint, columns, card, search, right }: Props<T>) {
  const { data, loading, error } = useApiList<T>(endpoint);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    return ql ? data.filter((r) => search(r).toLowerCase().includes(ql)) : data;
  }, [data, q, search]);

  return (
    <div style={{ padding: '20px 22px' }}>
      <div className="sec-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>{title} {data ? <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 15 }}>({rows.length})</span> : null}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="form-input" placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          {right}
        </div>
      </div>

      {error && <div className="card" style={{ padding: 20, color: 'var(--red)' }}>{error}</div>}
      {loading && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>}
      {data && !rows.length && !error && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>No {title.toLowerCase()}{q ? ' match your search' : ' yet'}.</div>}

      {!!rows.length && (
        <>
          <div className="rec-table-wrap card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {columns.map((c) => <th key={c.key} style={{ padding: '12px 16px' }}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? i} style={{ borderTop: '1px solid var(--line)' }}>
                    {columns.map((c) => <td key={c.key} style={{ padding: '12px 16px', color: 'var(--ink-2)' }}>{c.render(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rec-cards" style={{ marginTop: 12 }}>
            {rows.map((r, i) => <div key={r.id ?? i} className="card" style={{ padding: 14 }}>{card(r)}</div>)}
          </div>
        </>
      )}
    </div>
  );
}

export function StatusBadge({ value, color }: { value?: string; color?: string }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
      background: 'var(--bg)', color: color || 'var(--ink-2)', border: '1px solid var(--line)' }}>
      {value || '—'}
    </span>
  );
}

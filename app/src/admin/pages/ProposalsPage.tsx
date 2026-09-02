import { ListPage, StatusBadge } from '../components/ListPage';
import { contactName, money, statusColor, type Contact } from '../../lib/format';

interface Proposal { id: string; title?: string; status?: string; total?: number; contacts?: Contact }

export function ProposalsPage() {
  return (
    <ListPage<Proposal>
      title="Proposals"
      endpoint="/api/proposals"
      search={(p) => [p.title, contactName(p.contacts, ''), p.status].filter(Boolean).join(' ')}
      columns={[
        { key: 'title', label: 'Proposal', render: (p) => <b>{p.title || 'Untitled'}</b> },
        { key: 'client', label: 'Client', render: (p) => contactName(p.contacts, '—') },
        { key: 'total', label: 'Total', render: (p) => money(p.total) },
        { key: 'status', label: 'Status', render: (p) => <StatusBadge value={p.status || 'draft'} color={statusColor(p.status)} /> },
      ]}
      card={(p) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <b>{p.title || 'Untitled'}</b><StatusBadge value={p.status || 'draft'} color={statusColor(p.status)} />
          </div>
          <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{contactName(p.contacts, '—')} · {money(p.total)}</div>
        </>
      )}
    />
  );
}

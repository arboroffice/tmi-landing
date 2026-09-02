import { ListPage, StatusBadge } from '../components/ListPage';
import { contactName, statusColor, type Contact } from '../../lib/format';

interface Lead { id: string; title?: string; status?: string; contacts?: Contact }

export function LeadsPage() {
  return (
    <ListPage<Lead>
      title="Leads"
      endpoint="/api/leads"
      search={(l) => [contactName(l.contacts), l.contacts?.company, l.contacts?.email, l.status].filter(Boolean).join(' ')}
      columns={[
        { key: 'name', label: 'Name', render: (l) => <b>{contactName(l.contacts, l.title || 'Unknown')}</b> },
        { key: 'company', label: 'Company', render: (l) => l.contacts?.company || '—' },
        { key: 'status', label: 'Status', render: (l) => <StatusBadge value={l.status || 'new'} color={statusColor(l.status)} /> },
        { key: 'email', label: 'Email', render: (l) => l.contacts?.email || '—' },
      ]}
      card={(l) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <b>{contactName(l.contacts, l.title || 'Unknown')}</b><StatusBadge value={l.status || 'new'} color={statusColor(l.status)} />
          </div>
          {l.contacts?.company && <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{l.contacts.company}</div>}
          {l.contacts?.email && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{l.contacts.email}</div>}
        </>
      )}
    />
  );
}

import { ListPage, StatusBadge } from '../components/ListPage';
import { contactName, statusColor, type Contact } from '../../lib/format';

interface Client { id: string; plan?: string; status?: string; contacts?: Contact }

export function ClientsPage() {
  return (
    <ListPage<Client>
      title="Clients"
      endpoint="/api/clients"
      search={(c) => [contactName(c.contacts), c.contacts?.company, c.contacts?.email, c.plan, c.status].filter(Boolean).join(' ')}
      columns={[
        { key: 'name', label: 'Client', render: (c) => <b>{contactName(c.contacts)}</b> },
        { key: 'company', label: 'Company', render: (c) => c.contacts?.company || '—' },
        { key: 'plan', label: 'Plan', render: (c) => c.plan || '—' },
        { key: 'status', label: 'Status', render: (c) => <StatusBadge value={c.status || 'active'} color={statusColor(c.status)} /> },
      ]}
      card={(c) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <b>{contactName(c.contacts)}</b><StatusBadge value={c.status || 'active'} color={statusColor(c.status)} />
          </div>
          {c.contacts?.company && <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{c.contacts.company}</div>}
          {c.plan && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{c.plan}</div>}
        </>
      )}
    />
  );
}

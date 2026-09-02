import { ListPage, StatusBadge } from '../components/ListPage';
import { shortDate, statusColor } from '../../lib/format';

interface Meeting { id: string; title?: string; company?: string; account_label?: string; sales_stage?: string; met_on?: string; status?: string; duration_sec?: number }

export function MeetingsPage() {
  return (
    <ListPage<Meeting>
      title="Meetings"
      endpoint="/api/meetings"
      search={(m) => [m.title, m.company, m.account_label, m.sales_stage].filter(Boolean).join(' ')}
      columns={[
        { key: 'title', label: 'Meeting', render: (m) => <b>{m.title || 'Call'}</b> },
        { key: 'company', label: 'Account', render: (m) => m.company || m.account_label || '—' },
        { key: 'stage', label: 'Stage', render: (m) => m.sales_stage || '—' },
        { key: 'date', label: 'Date', render: (m) => shortDate(m.met_on) },
      ]}
      card={(m) => (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <b>{m.title || 'Call'}</b><StatusBadge value={m.status || 'recorded'} color={statusColor(m.status)} />
          </div>
          <div style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 4 }}>{m.company || m.account_label || '—'}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{m.sales_stage || ''} {m.met_on ? '· ' + shortDate(m.met_on) : ''}</div>
        </>
      )}
    />
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { contactName, money, statusColor, type Contact } from '../../lib/format';
import { StatusBadge } from '../components/ListPage';

interface Lead { id: string; title?: string; status?: string; contacts?: Contact }
interface Client { id: string; status?: string }
interface Invoice { id: string; amount?: number; status?: string }
interface Data { leads: Lead[]; clients: Client[]; contacts: unknown[]; invoices: Invoice[] }

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function DashboardPage() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      api.get<Lead[]>('/api/leads').catch(() => [] as Lead[]),
      api.get<Client[]>('/api/clients').catch(() => [] as Client[]),
      api.get<unknown[]>('/api/contacts').catch(() => [] as unknown[]),
      api.get<Invoice[]>('/api/invoices').catch(() => [] as Invoice[]),
    ]).then(([leads, clients, contacts, invoices]) => {
      if (live) setD({ leads: leads || [], clients: clients || [], contacts: contacts || [], invoices: invoices || [] });
    });
    return () => { live = false; };
  }, []);

  if (!d) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading…</div>;
  const activeClients = d.clients.filter((c) => (c.status || 'active') !== 'churned').length;
  const openInv = d.invoices.filter((i) => (i.status || '') !== 'paid');
  const openAmt = openInv.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const wonLeads = d.leads.filter((l) => l.status === 'won').length;

  return (
    <div style={{ padding: '20px 22px' }}>
      <div className="sec-head"><h1>Dashboard</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginTop: 12 }}>
        <Tile label="Total leads" value={String(d.leads.length)} hint={`${wonLeads} won`} />
        <Tile label="Active clients" value={String(activeClients)} />
        <Tile label="Contacts" value={String(d.contacts.length)} />
        <Tile label="Open invoices" value={money(openAmt)} hint={`${openInv.length} open`} />
      </div>

      <div className="sec-head" style={{ marginTop: 28 }}><h2 style={{ fontSize: 17 }}>Recent leads</h2></div>
      <div className="card" style={{ padding: 0, marginTop: 10, overflow: 'hidden' }}>
        {d.leads.slice(0, 6).map((l, i) => (
          <div key={l.id ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{contactName(l.contacts, l.title || 'Unknown')}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.contacts?.company || ''}</div>
            </div>
            <StatusBadge value={l.status || 'new'} color={statusColor(l.status)} />
          </div>
        ))}
        {!d.leads.length && <div style={{ padding: 16, color: 'var(--muted)' }}>No leads yet.</div>}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from './api';
import { money } from './format';

export interface Alert { id: string; kind: 'followup' | 'application' | 'invoice'; title: string; sub?: string; when?: string; to: string }
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const ms = (v: unknown) => { const t = new Date(str(v)).getTime(); return isNaN(t) ? 0 : t; };

// Aggregate a live alerts feed from real sources: overdue/due follow-ups, new
// applications, and overdue invoices. No new backend needed.
export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([
      api.get<Row[]>('/api/followups').catch(() => [] as Row[]),
      api.get<Row[]>('/api/applications').catch(() => [] as Row[]),
      api.get<Row[]>('/api/invoices').catch(() => [] as Row[]),
    ]).then(([fu, apps, inv]) => {
      if (!live) return;
      const now = Date.now();
      const out: Alert[] = [];
      (fu || []).filter((f) => f.due_at && ms(f.due_at) <= now + 864e5 && f.status !== 'done')
        .forEach((f) => out.push({ id: 'fu' + str(f.id), kind: 'followup', title: str(f.title) || 'Follow-up due', sub: str(f.notes), when: str(f.due_at), to: '/admin/home' }));
      (apps || []).filter((a) => (str(a.status) || 'new') === 'new')
        .forEach((a) => out.push({ id: 'ap' + str(a.id), kind: 'application', title: 'New application', sub: str(a.company) || str(a.name), when: str(a.created_at), to: '/admin/inbox' }));
      (inv || []).filter((i) => str(i.status) === 'overdue' || (i.due_date && ms(i.due_date) < now && i.status !== 'paid'))
        .forEach((i) => out.push({ id: 'in' + str(i.id), kind: 'invoice', title: 'Invoice overdue', sub: money(i.amount as number), when: str(i.due_date), to: '/admin/delivery' }));
      out.sort((a, b) => ms(b.when) - ms(a.when));
      setAlerts(out.slice(0, 40));
    });
    return () => { live = false; };
  }, []);
  return alerts;
}

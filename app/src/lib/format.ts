export interface Contact { first_name?: string; last_name?: string; company?: string; email?: string; phone?: string }

export function contactName(c?: Contact, fallback = 'Unknown'): string {
  if (!c) return fallback;
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || fallback;
}
export function money(n?: number | string | null): string {
  const v = Number(n);
  return isNaN(v) ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
export function shortDate(d?: string | null): string {
  if (!d) return '—';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const COLORS: Record<string, string> = {
  new: 'var(--blue)', contacted: 'var(--amber)', qualified: 'var(--purple)', proposal: 'var(--chart-dark)',
  won: 'var(--green)', lost: 'var(--red)', active: 'var(--green)', accepted: 'var(--green)', draft: 'var(--muted)',
  sent: 'var(--blue)', paid: 'var(--green)', overdue: 'var(--red)', recorded: 'var(--blue)', pending: 'var(--amber)',
};
export const statusColor = (s?: string) => COLORS[(s || '').toLowerCase()] || 'var(--ink-2)';

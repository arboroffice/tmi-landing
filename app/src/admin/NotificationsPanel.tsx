import { useNavigate } from 'react-router-dom';
import type { Alert } from '../lib/useAlerts';
import { shortDate } from '../lib/format';

export function NotificationsPanel({ alerts, onClose }: { alerts: Alert[]; onClose: () => void }) {
  const nav = useNavigate();
  return (
    <div className="ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ov-panel sheet">
        <div className="sheet-head"><b>Alerts</b><button aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="ov-results">
          {!alerts.length && <div className="ov-empty">All clear. Nothing needs attention.</div>}
          {alerts.map((a) => (
            <button key={a.id} className="ov-item" onClick={() => { nav(a.to); onClose(); }}>
              <span className="ov-item-main">{a.title}</span>
              <span className="ov-item-sub">{a.kind}{a.sub ? ' · ' + a.sub : ''}{a.when ? ' · ' + shortDate(a.when) : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

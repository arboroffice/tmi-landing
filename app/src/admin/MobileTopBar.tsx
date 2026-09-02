import { Icons } from './icons';

interface Props { title: string; alertCount: number; onSearch: () => void; onAlerts: () => void; onSettings: () => void }
export function MobileTopBar({ title, alertCount, onSearch, onAlerts, onSettings }: Props) {
  return (
    <div className="mobile-topbar">
      <span className="mt-title">{title}</span>
      <div className="mt-actions">
        <button className="mt-ic" aria-label="Search" onClick={onSearch}>{Icons.search}</button>
        <button className="mt-ic" aria-label="Alerts" onClick={onAlerts}>
          {Icons.bell}{alertCount > 0 && <span className="mt-badge">{alertCount > 9 ? '9+' : alertCount}</span>}
        </button>
        <button className="mt-ic" aria-label="Settings" onClick={onSettings}>{Icons.settings}</button>
      </div>
    </div>
  );
}

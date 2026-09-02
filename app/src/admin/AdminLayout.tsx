import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { BottomNav } from './BottomNav';
import { SearchOverlay } from './SearchOverlay';
import { NotificationsPanel } from './NotificationsPanel';
import { RecordModal } from './RecordModal';
import { workspaceByKey } from './workspaces';
import { useAlerts } from '../lib/useAlerts';
import { Icons } from './icons';

export function AdminLayout() {
  const { workspace } = useParams();
  const ws = workspace ? workspaceByKey(workspace) : null;
  const nav = useNavigate();
  const loc = useLocation();
  const alerts = useAlerts();

  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [notif, setNotif] = useState(false);
  const [record, setRecord] = useState(false);

  useEffect(() => { setDrawer(false); }, [loc.pathname]);
  useEffect(() => {
    const lock = drawer || search || notif || record;
    document.body.style.overflow = lock ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer, search, notif, record]);

  const title = ws?.label ?? 'TMI Admin';

  return (
    <div className={'layout' + (drawer ? ' menu-open' : '')}>
      <MobileTopBar title={title} alertCount={alerts.length}
        onSearch={() => setSearch(true)} onAlerts={() => setNotif(true)} onSettings={() => nav('/admin/settings')} />

      <Sidebar open={drawer} />
      {drawer && <div className="sb-backdrop" onClick={() => setDrawer(false)} />}

      <div className="main">
        <div className="topbar">
          <div className="topbar-crumb">
            <span>TMI Admin</span>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" strokeWidth={2} strokeLinecap="round" /></svg>
            <span className="page">{title}</span>
          </div>
          <div className="topbar-actions">
            <button className="mt-ic" aria-label="Search" onClick={() => setSearch(true)}>{Icons.search}</button>
            <button className="mt-ic" aria-label="Alerts" onClick={() => setNotif(true)}>
              {Icons.bell}{alerts.length > 0 && <span className="mt-badge">{alerts.length > 9 ? '9+' : alerts.length}</span>}
            </button>
          </div>
        </div>
        <Outlet />
      </div>

      {/* Desktop corner record button (hidden on mobile; bottom-nav center replaces it) */}
      <div id="qa-fab"><button id="qa-btn" aria-label="Record" onClick={() => setRecord(true)}>＋</button></div>

      <BottomNav onQuick={() => setRecord(true)} onMore={() => setDrawer(true)} />

      {search && <SearchOverlay onClose={() => setSearch(false)} />}
      {notif && <NotificationsPanel alerts={alerts} onClose={() => setNotif(false)} />}
      {record && <RecordModal onClose={() => setRecord(false)} />}
    </div>
  );
}

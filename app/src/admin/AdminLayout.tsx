import { useEffect, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { workspaceByKey } from './workspaces';

export function AdminLayout() {
  const { workspace } = useParams();
  const ws = workspace ? workspaceByKey(workspace) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <div className={'layout' + (menuOpen ? ' menu-open' : '')}>
      {/* Mobile top bar (hidden on desktop via CSS) */}
      <div className="mobile-topbar">
        <button className="burger" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <span className="mt-title">{ws?.label ?? 'TMI Admin'}</span>
      </div>

      <Sidebar open={menuOpen} />
      {menuOpen && <div className="sb-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <div className="topbar-crumb">
            <span>TMI Admin</span>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" strokeWidth={2} strokeLinecap="round" /></svg>
            <span className="page">{ws?.label ?? 'Admin'}</span>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

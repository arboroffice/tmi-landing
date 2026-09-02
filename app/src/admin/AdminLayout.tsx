import { Outlet, useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { workspaceByKey } from './workspaces';

export function AdminLayout() {
  const { workspace } = useParams();
  const ws = workspace ? workspaceByKey(workspace) : null;
  return (
    <div className="layout">
      <Sidebar />
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

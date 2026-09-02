import { NavLink } from 'react-router-dom';
import { WORKSPACES } from './workspaces';
import { useAuth } from '../lib/auth';

export function Sidebar({ open = false }: { open?: boolean }) {
  const { logout } = useAuth();
  return (
    <aside className={'sidebar' + (open ? ' open' : '')}>
      <div className="sb-brand">
        <img src="/logo.svg" alt="TMI" />
        <div><div className="sb-brand-label">TMI</div><div className="sb-brand-sub">Admin</div></div>
      </div>
      <nav className="sb-nav">
        <div className="sb-group-label">Workspaces</div>
        {WORKSPACES.filter((w) => w.key !== 'settings').map((w) => (
          <NavLink key={w.key} to={`/admin/${w.key}`} className={({ isActive }) => 'sb-item' + (isActive ? ' active' : '')}>
            {w.label}
          </NavLink>
        ))}
        <div className="sb-sep" />
        <div className="sb-group-label">System</div>
        <NavLink to="/admin/settings" className={({ isActive }) => 'sb-item' + (isActive ? ' active' : '')}>Settings</NavLink>
      </nav>
      <div className="sb-foot">
        <button className="sb-logout" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
}

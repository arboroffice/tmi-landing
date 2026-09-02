import { NavLink } from 'react-router-dom';
import { Icons } from './icons';

export function BottomNav({ onQuick, onMore }: { onQuick: () => void; onMore: () => void }) {
  return (
    <nav className="bottom-nav">
      <NavLink to="/admin/home" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}>{Icons.home}<span>Home</span></NavLink>
      <NavLink to="/admin/sales" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}>{Icons.sales}<span>Sales</span></NavLink>
      <div className="bn-center"><button className="bn-plus" aria-label="Quick action" onClick={onQuick}>＋</button></div>
      <NavLink to="/admin/clients" className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}>{Icons.clients}<span>Clients</span></NavLink>
      <button className="bn-item" onClick={onMore}>{Icons.grid}<span>More</span></button>
    </nav>
  );
}

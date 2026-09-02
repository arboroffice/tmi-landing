import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AdminLayout } from './admin/AdminLayout';
import { WorkspacePage } from './admin/WorkspacePage';
import { Login } from './admin/Login';

function AdminGuard() {
  const { authed } = useAuth();
  if (!authed) return <Login />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/home" replace />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/home" replace />} />
          <Route path=":workspace" element={<WorkspacePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin/home" replace />} />
    </Routes>
  );
}

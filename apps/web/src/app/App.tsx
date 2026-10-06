import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ExplorePage } from '../features/explore/ExplorePage';
import { AuthPage } from '../features/auth/AuthPage';
import { OtpPage, ForgotPasswordPage } from '../features/auth/OtpPage';
import {
  SavedPage,
  ActivityPage,
  OrganizationsPage,
} from '../features/harnesses/HarnessLibraryPages';
import {
  HarnessEditorPage,
  HarnessWorkspacePage,
  NewHarnessPage,
} from '../features/harnesses/HarnessPages';
import { useAppSelector } from './hooks';
import { transport } from '../lib/http';
import { Loading, Empty } from '../components/ui';
import { applyTheme } from './theme';
import { DeviceApprovalPage, ConnectedDevicesPage } from '../features/devices/DevicePages';
import { HarnessHistoryPage } from '../features/harnesses/HarnessHistory';
import { HarnessCliPage } from '../features/harnesses/HarnessCliPage';
import { HarnessCollaborationPage } from '../features/harnesses/HarnessCollaborationPage';
import { ProfilePage, EditProfilePage } from '../features/profile/ProfilePage';
import { returnPath } from '../features/auth/return-path';
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((module) => ({ default: module.AdminPage })),
);
function AdminProtected() {
  const auth = useAppSelector((s) => s.auth);
  if (!auth.ready) return <Loading />;
  if (!auth.user) return <Navigate to="/login?returnTo=/admin" replace />;
  if (auth.user.role !== 'admin')
    return (
      <Empty
        title="Administrator access required"
        description="Your account has the user role. Contact an administrator if you need access."
        action={
          <Link className="btn btn-secondary" to="/harnesses">
            My Harnesses
          </Link>
        }
      />
    );
  return (
    <Suspense fallback={<Loading />}>
      <AdminPage />
    </Suspense>
  );
}
function Protected({ children }: { children: ReactNode }) {
  const auth = useAppSelector((s) => s.auth);
  const location = useLocation();
  if (!auth.ready) return <Loading />;
  const destination = returnPath(location.pathname + location.search);
  const login =
    destination === '/harnesses' ? '/login' : `/login?returnTo=${encodeURIComponent(destination)}`;
  return auth.user ? children : <Navigate to={login} replace />;
}
export function App() {
  const theme = useAppSelector((s) => s.ui.theme);
  useEffect(() => applyTheme(theme), [theme]);
  const location = useLocation(),
    ready = useAppSelector((s) => s.auth.ready);
  useEffect(() => {
    void transport.restore().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (location.pathname === '/')
      sessionStorage.setItem('skillshare-search', location.search.slice(1));
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  if (!ready) return <Loading />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ExplorePage />} />
        <Route path="login" element={<AuthPage />} />
        <Route path="admin" element={<AdminProtected />} />
        <Route path="users/me" element={<Navigate to="/profile" replace />} />
        <Route path="users/:id" element={<ProfilePage />} />
        <Route
          path="profile"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route
          path="profile/edit"
          element={
            <Protected>
              <EditProfilePage />
            </Protected>
          }
        />
        <Route path="device" element={<DeviceApprovalPage />} />
        <Route
          path="devices"
          element={
            <Protected>
              <ConnectedDevicesPage />
            </Protected>
          }
        />
        <Route
          path="harnesses/:id/history"
          element={
            <Protected>
              <HarnessHistoryPage />
            </Protected>
          }
        />
        <Route path="harnesses/:id/cli" element={<HarnessCliPage />} />
        <Route
          path="harnesses/:id/changes"
          element={
            <Protected>
              <HarnessCollaborationPage />
            </Protected>
          }
        />
        <Route path="verify-email" element={<OtpPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="harnesses"
          element={
            <Protected>
              <HarnessWorkspacePage />
            </Protected>
          }
        />
        <Route
          path="harnesses/new"
          element={
            <Protected>
              <NewHarnessPage />
            </Protected>
          }
        />
        <Route path="harnesses/:id/edit" element={<HarnessEditorPage />} />
        <Route path="workspace" element={<Navigate to="/harnesses" replace />} />
        <Route
          path="saved"
          element={
            <Protected>
              <SavedPage />
            </Protected>
          }
        />
        <Route
          path="activity"
          element={
            <Protected>
              <ActivityPage />
            </Protected>
          }
        />
        <Route
          path="organizations"
          element={
            <Protected>
              <OrganizationsPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <Empty
              title="This page isn't here"
              description="Open a Harness to edit agents, skills, MCP, hooks, and settings."
            />
          }
        />
      </Route>
    </Routes>
  );
}

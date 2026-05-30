import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import { ROUTES } from './lib/constants';
import ErrorBoundary from './components/shared/ErrorBoundary';
import PageLoader from './components/shared/PageLoader';
import FloatingHearts from './components/shared/FloatingHearts';
import CookieBanner from './components/shared/CookieBanner';
import Shell from './components/layout/Shell';
import Landing from './pages/Landing';
import Pairing from './pages/Pairing';
import Connected from './pages/Connected';
import Privacy from './pages/Privacy';
import Impressum from './pages/Impressum';
import Terms from './pages/Terms';

const Catalog  = lazy(() => import('./pages/Catalog'));
const Matches  = lazy(() => import('./pages/Matches'));
const Mood     = lazy(() => import('./pages/Mood'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin    = lazy(() => import('./pages/Admin'));
const Experts  = lazy(() => import('./pages/Experts'));

// ── Route guards ──────────────────────────────────────────────────────────────

/** Root "/" — nginx serves download.html for fresh loads; this handles client-side nav */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  if (user.coupleId) return <Navigate to={ROUTES.BROWSE} replace />;
  return <Navigate to={ROUTES.PAIR} replace />;
}

/** /login — shows login/register form; redirects logged-in users to the app */
function LoginRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  if (user.coupleId) return <Navigate to={ROUTES.BROWSE} replace />;
  return <Navigate to={ROUTES.PAIR} replace />;
}

/** Requires an authenticated session */
function AuthGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  return <Outlet />;
}

/** Requires active pairing (no solo mode on desktop) */
function PairGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user?.coupleId) return <Navigate to={ROUTES.PAIR} replace />;
  return <Outlet />;
}

/** Requires admin role */
function AdminGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user?.isAdmin) return <Navigate to={ROUTES.BROWSE} replace />;
  return <Outlet />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <FloatingHearts />
      <CookieBanner />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader full />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<RootRedirect />} />
        <Route path={ROUTES.LOGIN} element={<LoginRedirect />} />
        <Route path="/impressum"   element={<Impressum />} />
        <Route path="/privacy"     element={<Privacy />} />
        <Route path="/terms"       element={<Terms />} />

        {/* Authenticated */}
        <Route element={<AuthGuard />}>
          <Route path={ROUTES.PAIR}           element={<Pairing />} />
          <Route path={`${ROUTES.JOIN}/:code?`} element={<Pairing />} />
          <Route path={ROUTES.CONNECTED}      element={<Connected />} />

          {/* Admin only */}
          <Route element={<AdminGuard />}>
            <Route path={ROUTES.ADMIN} element={<Admin />} />
          </Route>

          {/* Paired (or solo) */}
          <Route element={<PairGuard />}>
            <Route element={<Shell />}>
              <Route path={ROUTES.BROWSE}   element={<Catalog />} />
              <Route path={ROUTES.MATCHES}  element={<Matches />} />
              <Route path={ROUTES.MOOD}     element={<Mood />} />
              <Route path={ROUTES.SETTINGS} element={<Settings />} />
              <Route path="/privacy"        element={<Privacy />} />
              <Route path="/impressum"     element={<Impressum />} />
              <Route path="/terms"         element={<Terms />} />
              <Route path="/experts"        element={<Experts />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}

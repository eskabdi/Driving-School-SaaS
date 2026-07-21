import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner';
import { RouteError } from '@/features/misc/RouteError';
import { ForbiddenPage } from '@/features/misc/ForbiddenPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';
import { RootRedirect } from '@/features/misc/RootRedirect';

/**
 * Application routes (blueprint §6). All app routes are tenant-scoped; the URL
 * never lets you operate on the wrong tenant. Feature pages are lazy-loaded so
 * each module's code is only paid for when first visited (blueprint §11).
 * Role gating uses RequireRole (UX-only; RLS is the real boundary).
 */

// Lazy feature pages. Each becomes its own chunk.
const LoginPage = lazy(() => named(import('@/features/auth/LoginPage'), 'LoginPage'));
const DashboardPage = lazy(() => named(import('@/features/dashboard/DashboardPage'), 'DashboardPage'));
const LearnersPage = lazy(() => named(import('@/features/learners/LearnersPage'), 'LearnersPage'));
const ReviewQueuePage = lazy(() =>
  named(import('@/features/registrations/ReviewQueuePage'), 'ReviewQueuePage'),
);
const PackagesPage = lazy(() => named(import('@/features/packages/PackagesPage'), 'PackagesPage'));
const InstructorsPage = lazy(() =>
  named(import('@/features/instructors/InstructorsPage'), 'InstructorsPage'),
);
const VehiclesPage = lazy(() => named(import('@/features/vehicles/VehiclesPage'), 'VehiclesPage'));
const LessonsPage = lazy(() => named(import('@/features/lessons/LessonsPage'), 'LessonsPage'));
const FinancePage = lazy(() => named(import('@/features/finance/FinancePage'), 'FinancePage'));
const CertificatesPage = lazy(() =>
  named(import('@/features/certificates/CertificatesPage'), 'CertificatesPage'),
);
const SettingsPage = lazy(() => named(import('@/features/settings/SettingsPage'), 'SettingsPage'));
const PublicRegistrationPage = lazy(() =>
  named(import('@/features/public-registration/PublicRegistrationPage'), 'PublicRegistrationPage'),
);
const PlatformConsole = lazy(() =>
  named(import('@/features/platform/PlatformConsole'), 'PlatformConsole'),
);

// Adapt a named export to React.lazy's default-export contract.
function named<T extends Record<string, unknown>, K extends keyof T>(
  p: Promise<T>,
  key: K,
): Promise<{ default: T[K] }> {
  return p.then((m) => ({ default: m[key] }));
}

function lazyPage(node: ReactNode): ReactNode {
  return <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;
}

const moduleRoutes = [
  { index: true, element: <Navigate to="dashboard" replace /> },
  { path: 'dashboard', element: lazyPage(<DashboardPage />) },
  { path: 'learners', element: lazyPage(<LearnersPage />) },
  { path: 'registrations', element: lazyPage(<ReviewQueuePage />) },
  { path: 'packages', element: lazyPage(<PackagesPage />) },
  { path: 'instructors', element: lazyPage(<InstructorsPage />) },
  { path: 'vehicles', element: lazyPage(<VehiclesPage />) },
  { path: 'lessons', element: lazyPage(<LessonsPage />) },
  { path: 'finance', element: lazyPage(<FinancePage />) },
  { path: 'certificates', element: lazyPage(<CertificatesPage />) },
  { path: 'settings', element: lazyPage(<SettingsPage />) },
];

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: lazyPage(<LoginPage />), errorElement: <RouteError /> },
  { path: '/r/:slug', element: lazyPage(<PublicRegistrationPage />), errorElement: <RouteError /> },
  { path: '/forbidden', element: <ForbiddenPage /> },

  {
    // Super Admin platform console — separate tree, never mixed with tenant UI.
    path: '/platform',
    element: (
      <RequireAuth>
        <RequireRole roles={['super_admin']}>{lazyPage(<PlatformConsole />)}</RequireRole>
      </RequireAuth>
    ),
    errorElement: <RouteError />,
  },

  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: moduleRoutes,
  },
  {
    // Explicit tenant-scoped tree for multi-tenant staff (blueprint §6).
    path: '/app/manage/:tenantSlug',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: moduleRoutes,
  },

  { path: '*', element: <NotFoundPage /> },
]);

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppShell } from '@/components/layout/AppShell';
import { RouteError } from '@/features/misc/RouteError';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LearnersPage } from '@/features/learners/LearnersPage';
import { ReviewQueuePage } from '@/features/registrations/ReviewQueuePage';
import { PackagesPage } from '@/features/packages/PackagesPage';
import { InstructorsPage } from '@/features/instructors/InstructorsPage';
import { VehiclesPage } from '@/features/vehicles/VehiclesPage';
import { LessonsPage } from '@/features/lessons/LessonsPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { CertificatesPage } from '@/features/certificates/CertificatesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PublicRegistrationPage } from '@/features/public-registration/PublicRegistrationPage';
import { ForbiddenPage } from '@/features/misc/ForbiddenPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';

/**
 * Application routes (blueprint §6). All app routes are tenant-scoped; the
 * URL never lets you operate on the wrong tenant. Role gating is done with
 * RequireRole around the relevant branches (UX-only; RLS is the real boundary).
 */

const moduleRoutes = [
  { index: true, element: <Navigate to="dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'learners', element: <LearnersPage /> },
  { path: 'registrations', element: <ReviewQueuePage /> },
  { path: 'packages', element: <PackagesPage /> },
  { path: 'instructors', element: <InstructorsPage /> },
  { path: 'vehicles', element: <VehiclesPage /> },
  { path: 'lessons', element: <LessonsPage /> },
  { path: 'finance', element: <FinancePage /> },
  { path: 'certificates', element: <CertificatesPage /> },
  { path: 'settings', element: <SettingsPage /> },
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: '/r/:slug', element: <PublicRegistrationPage />, errorElement: <RouteError /> },
  { path: '/forbidden', element: <ForbiddenPage /> },

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

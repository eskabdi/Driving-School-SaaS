import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Car,
  CalendarClock,
  Wallet,
  BadgeCheck,
  Settings,
  ClipboardList,
  Package,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { to: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: 'learners', labelKey: 'nav.learners', icon: GraduationCap },
  { to: 'registrations', labelKey: 'nav.registrations', icon: ClipboardList },
  { to: 'packages', labelKey: 'nav.packages', icon: Package },
  { to: 'instructors', labelKey: 'nav.instructors', icon: Users },
  { to: 'vehicles', labelKey: 'nav.vehicles', icon: Car },
  { to: 'lessons', labelKey: 'nav.lessons', icon: CalendarClock },
  { to: 'finance', labelKey: 'nav.finance', icon: Wallet },
  { to: 'certificates', labelKey: 'nav.certificates', icon: BadgeCheck },
  { to: 'settings', labelKey: 'nav.settings', icon: Settings },
];

export function AppShell() {
  const { t } = useTranslation();
  const { claims, signOut } = useAuth();
  const { tenantSlug } = useParams();
  const base = tenantSlug ? `/app/manage/${tenantSlug}` : '/app';

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center border-b px-6 font-semibold">
          {t('app.name')}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={`${base}/${to}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <div className="text-sm text-muted-foreground">
            {claims?.role && <span className="capitalize">{claims.role.replace('_', ' ')}</span>}
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              {t('action.signOut')}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, CalendarClock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatIsoAsEthiopian } from '@/lib/eth-calendar';
import type { SupportedLocale } from '@/lib/i18n';
import { useUpcomingLessons, type LessonStatus } from './api';
import { ScheduleLessonDialog } from './ScheduleLessonDialog';

const STATUS_VARIANT: Record<LessonStatus, BadgeProps['variant']> = {
  draft: 'outline',
  scheduled: 'secondary',
  confirmed: 'default',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  no_show: 'destructive',
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Addis_Ababa',
  });
}

export function LessonsPage() {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useUpcomingLessons(claims?.tenant_id ?? null);
  const [scheduling, setScheduling] = useState(false);
  const canSchedule = roleHasCapability(claims?.role, 'lessons.schedule');
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.lessons')}
        description={t('lessons.subtitle')}
        actions={
          canSchedule ? (
            <Button onClick={() => setScheduling(true)}>
              <Plus className="h-4 w-4" />
              {t('lessons.schedule')}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <CalendarClock className="h-8 w-8" />
              <p className="text-sm">{t('lessons.empty')}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('lessons.date')}</th>
                  <th className="px-4 py-3 font-medium">{t('lessons.time')}</th>
                  <th className="px-4 py-3 font-medium">{t('lessons.type')}</th>
                  <th className="px-4 py-3 font-medium">{t('lessons.instructor')}</th>
                  <th className="px-4 py-3 font-medium">{t('lessons.statusLabel')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">{formatIsoAsEthiopian(l.scheduled_start, locale)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {timeOf(l.scheduled_start)}–{timeOf(l.scheduled_end)}
                    </td>
                    <td className="px-4 py-3">{t(`schedule.${l.lesson_type}`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {l.instructor?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[l.status]}>
                        {t(`lessonStatus.${l.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {scheduling && <ScheduleLessonDialog open={scheduling} onOpenChange={setScheduling} />}
    </div>
  );
}

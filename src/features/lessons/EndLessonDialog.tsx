import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppError } from '@/lib/errors';
import type { SupportedLocale } from '@/lib/i18n';
import {
  useLessonParticipants,
  useSkills,
  useCompleteLesson,
  type LessonRow,
} from './api';

type AttendanceStatus = 'present' | 'late' | 'absent';

/**
 * End-Lesson wizard (spec §5.3.4, condensed). Captures attendance + hours per
 * learner and per-skill evaluations, then calls the lesson-complete EF which
 * recomputes the hour bank server-side.
 */
export function EndLessonDialog({
  lesson,
  open,
  onOpenChange,
}: {
  lesson: LessonRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { claims } = useAuth();
  const locale = (i18n.resolvedLanguage ?? 'en') as SupportedLocale;
  const { data: participants, isLoading } = useLessonParticipants(lesson.id);
  const { data: skills } = useSkills(claims?.tenant_id ?? null);
  const complete = useCompleteLesson();
  const [error, setError] = useState<string | null>(null);

  const defaultHours = useMemo(() => {
    const ms = new Date(lesson.scheduled_end).getTime() - new Date(lesson.scheduled_start).getTime();
    return Math.round((ms / 3_600_000) * 100) / 100;
  }, [lesson.scheduled_start, lesson.scheduled_end]);

  // attendance state keyed by learnerId
  const [att, setAtt] = useState<Record<string, { status: AttendanceStatus; hours: number }>>({});
  // evaluation scores keyed by skillId (applied to the single learner)
  const [scores, setScores] = useState<Record<string, number>>({});

  const rows = participants ?? [];
  const single = rows.length === 1;

  function attFor(id: string) {
    return att[id] ?? { status: 'present' as AttendanceStatus, hours: defaultHours };
  }
  function setAttFor(id: string, patch: Partial<{ status: AttendanceStatus; hours: number }>) {
    setAtt((s) => ({ ...s, [id]: { ...attFor(id), ...patch } }));
  }

  function skillName(s: { name_en: string; name_am: string | null; name_om: string | null }) {
    if (locale === 'am') return s.name_am ?? s.name_en;
    if (locale === 'om') return s.name_om ?? s.name_en;
    return s.name_en;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const attendance = rows.map((p) => {
      const a = attFor(p.learnerId);
      return {
        learner_id: p.learnerId,
        enrollment_id: p.enrollmentId ?? undefined,
        status: a.status,
        // Absent learners never consume hours.
        hours_logged: a.status === 'absent' ? 0 : a.hours,
      };
    });
    const evaluations =
      single && rows[0]
        ? Object.entries(scores).map(([skill_id, score]) => ({
            learner_id: rows[0].learnerId,
            skill_id,
            score,
          }))
        : [];
    try {
      await complete.mutateAsync({ lessonId: lesson.id, attendance, evaluations });
      onOpenChange(false);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('endLesson.title')}</DialogTitle>
        <DialogDescription>{t('endLesson.subtitle')}</DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('endLesson.attendance')}</p>
            {rows.map((p) => {
              const a = attFor(p.learnerId);
              return (
                <div key={p.learnerId} className="grid grid-cols-3 items-center gap-2">
                  <span className="truncate text-sm">{p.learnerName}</span>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={a.status}
                    onChange={(e) =>
                      setAttFor(p.learnerId, { status: e.target.value as AttendanceStatus })
                    }
                  >
                    <option value="present">{t('endLesson.present')}</option>
                    <option value="late">{t('endLesson.late')}</option>
                    <option value="absent">{t('endLesson.absent')}</option>
                  </select>
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    aria-label={t('endLesson.hours')}
                    disabled={a.status === 'absent'}
                    value={a.hours}
                    onChange={(e) => setAttFor(p.learnerId, { hours: Number(e.target.value) })}
                  />
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">{t('endLesson.hoursHint')}</p>
          </div>

          {single && skills && skills.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('endLesson.skills')}</p>
              {skills.map((s) => (
                <div key={s.id} className="grid grid-cols-2 items-center gap-2">
                  <Label className="truncate">{skillName(s)}</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    value={scores[s.id] ?? ''}
                    onChange={(e) =>
                      setScores((sc) => {
                        const next = { ...sc };
                        if (e.target.value === '') delete next[s.id];
                        else next[s.id] = Number(e.target.value);
                        return next;
                      })
                    }
                  >
                    <option value="">{t('endLesson.notScored')}</option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={complete.isPending}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={complete.isPending || rows.length === 0}>
              {complete.isPending ? t('endLesson.completing') : t('endLesson.complete')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Textarea } from '@/components/ui/textarea';
import type { AppError } from '@/lib/errors';
import { useCreateAnnouncement, type Audience } from './api';

const AUDIENCES: Audience[] = ['all', 'learners', 'instructors', 'staff'];

export function ComposeAnnouncementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ title, body, audience });
      onOpenChange(false);
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('comms.composeTitle')}</DialogTitle>
        <DialogDescription>{t('comms.composeSubtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ann-title">{t('comms.subject')}</Label>
          <Input id="ann-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-audience">{t('comms.audience')}</Label>
          <select
            id="ann-audience"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value as Audience)}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t(`comms.audienceValue.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-body">{t('comms.message')}</Label>
          <Textarea
            id="ann-body"
            required
            className="min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('action.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t('comms.publishing') : t('comms.publish')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

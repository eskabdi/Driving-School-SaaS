import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AppError } from '@/lib/errors';
import { useBranchList, useCreateBranch } from './branches-api';

/** Branch management (spec §3.5). Inline add + list on the Settings screen. */
export function BranchesCard() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading } = useBranchList(claims?.tenant_id ?? null);
  const create = useCreateBranch();
  const canManage = roleHasCapability(claims?.role, 'settings.edit');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), city: city.trim() || undefined });
      setName('');
      setCity('');
    } catch (err) {
      setError((err as AppError).detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('branches.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {(data ?? []).map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground">{b.city ?? '—'}</span>
              </li>
            ))}
            {(!data || data.length === 0) && (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t('branches.empty')}</li>
            )}
          </ul>
        )}

        {canManage && (
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="branch-name">
                {t('branches.name')}
              </label>
              <Input
                id="branch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('branches.namePlaceholder')}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="branch-city">
                {t('branches.city')}
              </label>
              <Input id="branch-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              <Plus className="h-4 w-4" />
              {t('branches.add')}
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

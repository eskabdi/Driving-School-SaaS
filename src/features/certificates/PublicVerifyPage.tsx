import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { verifyCertificate, type VerifyResult } from './api';

/**
 * Public certificate verification page (spec §2.12). Unauthenticated: calls the
 * verify-certificate Edge Function which returns only a minimal status payload.
 */
export function PublicVerifyPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setPending(true);
    setResult(null);
    try {
      setResult(await verifyCertificate(code.trim()));
    } catch {
      setResult({ status: 'not_found' });
    } finally {
      setPending(false);
    }
  }

  const icon = {
    valid: <CheckCircle2 className="h-6 w-6 text-green-600" />,
    expired: <AlertTriangle className="h-6 w-6 text-amber-600" />,
    revoked: <XCircle className="h-6 w-6 text-destructive" />,
    not_found: <XCircle className="h-6 w-6 text-muted-foreground" />,
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('verify.title')}</CardTitle>
            <CardDescription>{t('verify.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('verify.placeholder')}
                aria-label={t('verify.placeholder')}
              />
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('verify.check')}
              </Button>
            </form>

            {result && (
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-2">
                  {icon[result.status]}
                  <span className="font-medium">{t(`verify.status.${result.status}`)}</span>
                </div>
                {result.status !== 'not_found' && (
                  <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {result.certificate_type && (
                      <div className="flex justify-between">
                        <dt>{t('verify.type')}</dt>
                        <dd>{t(`certificateType.${result.certificate_type}`)}</dd>
                      </div>
                    )}
                    {result.holder_initial && (
                      <div className="flex justify-between">
                        <dt>{t('verify.holder')}</dt>
                        <dd>{result.holder_initial}.</dd>
                      </div>
                    )}
                    {result.school_name && (
                      <div className="flex justify-between">
                        <dt>{t('verify.school')}</dt>
                        <dd>{result.school_name}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

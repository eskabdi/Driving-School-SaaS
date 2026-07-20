import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { EthDatePicker } from '@/components/ethiopian-calendar/EthDatePicker';

/**
 * Public, unauthenticated, tenant-aware registration form (blueprint §14,
 * spec §5.2.1) at `/r/:slug`. This scaffold renders the first step; the full
 * multi-step wizard + Turnstile + `submit-public-registration` EF land per spec.
 */
export function PublicRegistrationPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<string>('');

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('publicReg.title')}</CardTitle>
            <CardDescription>
              {t('publicReg.subtitle', { school: slug ?? '' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                // Wired to submit-public-registration EF per spec §5.2.1.
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('publicReg.fullName')}</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('publicReg.phone')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+2519…"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">{t('publicReg.dob')}</Label>
                <EthDatePicker id="dob" value={dob} onChange={setDob} displayCalendar="ethiopian" />
              </div>
              <Button type="submit" className="w-full">
                {t('publicReg.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

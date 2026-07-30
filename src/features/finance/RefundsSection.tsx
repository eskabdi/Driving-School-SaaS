import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth-context';
import { roleHasCapability } from '@/lib/roles';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { AppError } from '@/lib/errors';
import {
  useRefundablePayments,
  useRefunds,
  useRequestRefund,
  useDecideRefund,
  type RefundablePayment,
  type RefundStatus,
} from './api';

const STATUS_VARIANT: Record<RefundStatus, BadgeProps['variant']> = {
  requested: 'secondary',
  approved: 'warning',
  processing: 'warning',
  completed: 'success',
  rejected: 'destructive',
  failed: 'destructive',
};

/** Refunds (spec §2.7.4): request against a paid payment; approve/reject/complete. */
export function RefundsSection() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const tenantId = claims?.tenant_id ?? null;
  const canApprove = roleHasCapability(claims?.role, 'refunds.approve');
  const { data: payments } = useRefundablePayments(tenantId);
  const { data: refunds } = useRefunds(tenantId);
  const decide = useDecideRefund();
  const [requesting, setRequesting] = useState<RefundablePayment | null>(null);

  if (!canApprove) return null;

  return (
    <>
      {payments && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('refunds.refundable')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.paymentId} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{p.learnerName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.invoiceNumber ?? '—'}
                    </td>
                    <td className="px-4 py-3">{p.amount.toLocaleString()} ETB</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setRequesting(p)}>
                        {t('refunds.request')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {refunds && refunds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('refunds.pending')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-3">{r.amount.toLocaleString()} ETB</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {t(`refunds.status.${r.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {r.status === 'requested' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ refundId: r.id, decision: 'reject' })}
                            >
                              {t('refunds.reject')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ refundId: r.id, decision: 'approve' })}
                            >
                              {t('refunds.approve')}
                            </Button>
                          </>
                        )}
                        {(r.status === 'approved' || r.status === 'processing') && (
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ refundId: r.id, decision: 'complete' })}
                          >
                            {t('refunds.complete')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {requesting && (
        <RequestRefundDialog
          payment={requesting}
          open={!!requesting}
          onOpenChange={(o) => !o && setRequesting(null)}
        />
      )}
    </>
  );
}

function RequestRefundDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: RefundablePayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const request = useRequestRefund();
  const [amount, setAmount] = useState(payment.amount);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'provider_reversal'>('cash');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await request.mutateAsync({ paymentId: payment.paymentId, amount, reason, method });
      onOpenChange(false);
    } catch (err) {
      const ae = err as AppError;
      setError(ae.fields?.amount ?? ae.detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('refunds.requestTitle')}</DialogTitle>
        <DialogDescription>
          {t('refunds.requestSubtitle', { learner: payment.learnerName })}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rf-amount">{t('refunds.amount')}</Label>
          <Input
            id="rf-amount"
            type="number"
            min={0.01}
            max={payment.amount}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rf-method">{t('refunds.method')}</Label>
          <select
            id="rf-method"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="cash">{t('finance.cash')}</option>
            <option value="bank_transfer">{t('finance.bankTransfer')}</option>
            <option value="provider_reversal">{t('refunds.providerReversal')}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rf-reason">{t('refunds.reason')}</Label>
          <Textarea
            id="rf-reason"
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={request.isPending}
          >
            {t('action.cancel')}
          </Button>
          <Button type="submit" disabled={request.isPending}>
            {request.isPending ? t('refunds.requesting') : t('refunds.request')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

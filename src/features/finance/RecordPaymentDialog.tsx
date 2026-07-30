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
import type { AppError } from '@/lib/errors';
import { useRecordPayment, type InvoiceRow } from './api';

/**
 * Record Payment dialog (spec §5.4.2). Cash/bank/cheque path. Amount defaults to
 * the balance; overpayment is blocked server-side. A per-attempt idempotency key
 * makes a retried submit safe (spec §2.7).
 */
export function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const record = useRecordPayment();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(invoice.balance);
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (method !== 'cash' && !reference.trim()) {
      setError(t('finance.referenceRequired'));
      return;
    }
    try {
      const res = await record.mutateAsync({
        invoiceId: invoice.id,
        amount,
        method,
        idempotencyKey,
        reference: reference || undefined,
      });
      setReceipt(res.receipt_number);
    } catch (err) {
      const ae = err as AppError;
      setError(ae.fields?.amount ?? ae.detail ?? t('errors.INTERNAL'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>{t('finance.recordTitle')}</DialogTitle>
        <DialogDescription>
          {t('finance.recordSubtitle', {
            learner: invoice.learner?.full_name ?? '',
            balance: invoice.balance.toLocaleString(),
          })}
        </DialogDescription>
      </DialogHeader>

      {receipt ? (
        <div className="space-y-2">
          <p className="text-sm">{t('finance.recorded')}</p>
          <p className="text-sm text-muted-foreground">
            {t('finance.receipt')}: <span className="font-mono">{receipt}</span>
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('action.cancel')}</Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">{t('finance.amount')}</Label>
            <Input
              id="pay-amount"
              type="number"
              min={0.01}
              max={invoice.balance}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-method">{t('finance.method')}</Label>
            <select
              id="pay-method"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="cash">{t('finance.cash')}</option>
              <option value="bank_transfer">{t('finance.bankTransfer')}</option>
              <option value="cheque">{t('finance.cheque')}</option>
            </select>
          </div>
          {method !== 'cash' && (
            <div className="space-y-2">
              <Label htmlFor="pay-ref">{t('finance.reference')}</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={record.isPending}
            >
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? t('finance.recording') : t('finance.record')}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}

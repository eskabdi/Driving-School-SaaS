import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeError } from '@/lib/errors';
import { invokeFunction } from '@/lib/functions';

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'refunded';

export interface InvoiceRow {
  id: string;
  number: string | null;
  amount: number;
  status: InvoiceStatus;
  learner: { full_name: string } | null;
  paid: number;
  balance: number;
}

const OPEN: InvoiceStatus[] = ['issued', 'partially_paid', 'overdue'];

/** Open invoices with their outstanding balance (paid = sum of succeeded payments). */
export function useOpenInvoices(tenantId: string | null) {
  return useQuery({
    queryKey: ['invoices', 'open', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, number, amount, status, learner:learners(full_name), payments(amount, status)')
        .in('status', OPEN)
        .order('created_at', { ascending: false })
        .range(0, 99);
      if (error) throw normalizeError(error);

      const rows = (data ?? []) as unknown as Array<{
        id: string;
        number: string | null;
        amount: number;
        status: InvoiceStatus;
        learner: { full_name: string } | null;
        payments: Array<{ amount: number; status: string }> | null;
      }>;

      return rows.map((r) => {
        const paid = (r.payments ?? [])
          .filter((p) => p.status === 'succeeded')
          .reduce((s, p) => s + Number(p.amount), 0);
        return {
          id: r.id,
          number: r.number,
          amount: Number(r.amount),
          status: r.status,
          learner: r.learner,
          paid,
          balance: Number(r.amount) - paid,
        };
      });
    },
  });
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'cheque';
  idempotencyKey: string;
  reference?: string;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      invokeFunction<{ receipt_number: string; invoice_status: string }>('record-payment', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['learners'] });
    },
  });
}

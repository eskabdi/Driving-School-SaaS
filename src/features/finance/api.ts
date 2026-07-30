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

// --- Refunds (spec §2.7.4) --------------------------------------------------

export interface RefundablePayment {
  paymentId: string;
  invoiceNumber: string | null;
  learnerName: string;
  amount: number;
}

/** Succeeded payments on paid invoices that can be refunded. */
export function useRefundablePayments(tenantId: string | null) {
  return useQuery({
    queryKey: ['refundable-payments', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<RefundablePayment[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, status, invoice:invoices(number, status, learner:learners(full_name))')
        .eq('status', 'succeeded')
        .order('paid_at', { ascending: false })
        .range(0, 99);
      if (error) throw normalizeError(error);
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        amount: number;
        invoice: { number: string | null; status: string; learner: { full_name: string } | null } | null;
      }>;
      return rows
        .filter((r) => r.invoice && ['paid', 'partially_paid'].includes(r.invoice.status))
        .map((r) => ({
          paymentId: r.id,
          invoiceNumber: r.invoice?.number ?? null,
          learnerName: r.invoice?.learner?.full_name ?? '—',
          amount: Number(r.amount),
        }));
    },
  });
}

export type RefundStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'completed'
  | 'failed';

export interface RefundRow {
  id: string;
  amount: number;
  reason: string;
  method: string;
  status: RefundStatus;
  requested_by: string;
}

export function useRefunds(tenantId: string | null) {
  return useQuery({
    queryKey: ['refunds', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<RefundRow[]> => {
      const { data, error } = await supabase
        .from('refunds')
        .select('id, amount, reason, method, status, requested_by')
        .in('status', ['requested', 'approved', 'processing'])
        .order('created_at', { ascending: false });
      if (error) throw normalizeError(error);
      return (data ?? []) as RefundRow[];
    },
  });
}

export function useRequestRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      paymentId: string;
      amount: number;
      reason: string;
      method: 'cash' | 'bank_transfer' | 'provider_reversal';
    }) => invokeFunction<{ refund_id: string }>('request-refund', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['refunds'] });
      void qc.invalidateQueries({ queryKey: ['refundable-payments'] });
    },
  });
}

export function useDecideRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { refundId: string; decision: 'approve' | 'reject' | 'complete' }) =>
      invokeFunction<{ status: string }>('decide-refund', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['refunds'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

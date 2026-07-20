import { QueryClient } from '@tanstack/react-query';
import { normalizeError } from './errors';

/**
 * TanStack Query client (blueprint §6, §11; spec §7.3).
 * - 5-minute staleTime for lists, 30-minute gcTime.
 * - Retry only retryable error codes / network errors, max 2, exponential.
 * - Mutations never auto-retry (idempotency-keyed ones handle their own retry).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        return normalizeError(error).retryable;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      retry: false,
    },
  },
});

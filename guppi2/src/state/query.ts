import { QueryClient } from '@tanstack/react-query';
import { GameApiError, UncertainOutcomeError } from '@/core/errors';
import { ValidationError } from '@/core/catalog';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The scheduler already retries transient read failures with backoff.
      retry: (count, error) =>
        count < 1 && !(error instanceof GameApiError && error.status < 500) && !(error instanceof ValidationError) && !(error instanceof UncertainOutcomeError),
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      gcTime: 10 * 60_000,
    },
    mutations: { retry: false },
  },
});

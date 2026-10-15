import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BoardPoller } from '../polling/BoardPoller';
import { useGuestTelemetry } from './guest-telemetry-context';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: { retry: 0 },
    },
  });
}
/** One query client and one board owner for the mounted guest application. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createAppQueryClient);
  const telemetry = useGuestTelemetry();
  return (
    <QueryClientProvider client={client}>
      <BoardPoller audience="guest" onRecovery={telemetry.recovered} />
      {children}
    </QueryClientProvider>
  );
}

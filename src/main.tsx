import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './index.css';

// Supabase appends #access_token=...&type=recovery to the redirectTo URL.
// HashRouter also uses # for routing — they conflict.
// Fix: import the supabase client first (it processes & stores the token from
// window.location.hash into localStorage), then replace the URL with a clean
// HashRouter-compatible route before React mounts.
import { supabase as _supabase } from './lib/supabase'; // initialises client, stores session
void _supabase; // suppress unused warning

if (window.location.hash.includes('type=recovery')) {
  window.location.replace(
    window.location.pathname + window.location.search + '#/reset-password'
  );
} else {
  mountApp();
}

function mountApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:           1000 * 60 * 5,
        retry:               1,
        refetchOnWindowFocus: false,
      },
    },
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

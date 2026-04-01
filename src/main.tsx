import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { supabase } from './lib/supabase';
import './index.css';

async function init() {
  // Supabase password recovery emails redirect here with the token in the URL hash
  // e.g. #access_token=...&type=recovery
  // HashRouter also uses # for routing — they conflict, so we intercept early.
  // We wait for Supabase to fully process & store the session FIRST, then
  // replace the URL with a clean HashRouter route.
  if (window.location.hash.includes('type=recovery')) {
    await new Promise<void>((resolve) => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          subscription.unsubscribe();
          resolve();
        }
      });
      setTimeout(resolve, 5000); // safety fallback
    });
    window.location.replace(window.location.pathname + '#/reset-password');
    return; // page will reload with the clean URL
  }

  mountApp();
}

function mountApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            1000 * 60 * 5,
        retry:                1,
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

init();

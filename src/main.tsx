import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { supabase } from './lib/supabase';
import './index.css';

async function init() {
  // Supabase recovery emails redirect with #access_token=...&type=recovery
  // which conflicts with HashRouter. Wait for Supabase to store the session,
  // then swap the hash to the reset-password route and mount the app.
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
    // Replace the hash so HashRouter sees /reset-password (no page reload)
    window.location.hash = '#/reset-password';
  }

  // Always mount the app (whether we redirected or not)
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

// Attach the current Supabase access token to all /_serverFn/* requests
// so server functions guarded by `requireSupabaseAuth` receive a valid bearer.
import { supabase } from '@/integrations/supabase/client';

if (typeof window !== 'undefined' && !(window as any).__serverFnFetchPatched) {
  (window as any).__serverFnFetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url && url.includes('/_serverFn/')) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has('authorization')) {
            headers.set('authorization', `Bearer ${token}`);
          }
          init = { ...(init ?? {}), headers };
        }
      }
    } catch {
      // ignore — fall through to original fetch
    }
    return originalFetch(input as any, init);
  };
}

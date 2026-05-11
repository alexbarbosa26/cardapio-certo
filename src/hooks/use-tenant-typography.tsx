import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

const LINK_ID = 'tenant-fonts-link';

function buildGoogleFontsUrl(fonts: { family: string; weights: string }[]) {
  const families = fonts
    .filter((f) => f.family && f.family !== 'system')
    .map((f) => `family=${encodeURIComponent(f.family)}:wght@${f.weights || '400;500;600;700'}`)
    .join('&');
  if (!families) return null;
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function applyFonts(display: string, body: string, displayWeights: string, bodyWeights: string) {
  const url = buildGoogleFontsUrl([
    { family: display, weights: displayWeights },
    ...(display !== body ? [{ family: body, weights: bodyWeights }] : []),
  ]);
  if (url) {
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;
  }
  const root = document.documentElement;
  const stack = (f: string) =>
    f === 'system' ? 'ui-sans-serif, system-ui, sans-serif' : `"${f}", ui-sans-serif, system-ui, sans-serif`;
  root.style.setProperty('--font-sans', stack(body));
  root.style.setProperty('--font-display', stack(display));
}

export function useTenantTypography() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('settings')
        .select('font_display, font_body, font_display_weights, font_body_weights')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (cancelled) return;
      applyFonts(
        data?.font_display ?? 'Inter',
        data?.font_body ?? 'Inter',
        data?.font_display_weights ?? '400;500;600;700',
        data?.font_body_weights ?? '400;500;600;700',
      );
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id]);
}

export function applyTenantFontsPreview(
  display: string, body: string, displayWeights: string, bodyWeights: string,
) {
  applyFonts(display, body, displayWeights, bodyWeights);
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface TenantBranding {
  loaded: boolean;
  logoUrl: string | null;
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  enableTables: boolean;
  enableTabs: boolean;
  enableKitchen: boolean;
  enablePrinting: boolean;
  enableServiceFee: boolean;
  enableCreditAccounts: boolean;
  digitalMenuContracted: boolean;
  digitalMenuEnabled: boolean;
  digitalMenuSlug: string | null;
  tabNumberingMode: 'manual' | 'auto';
  receiptMessage: string | null;
  establishmentData: Record<string, unknown>;
  plan: {
    name: string | null;
    allowTables: boolean;
    allowTabs: boolean;
    allowKitchen: boolean;
    allowAdvancedDashboard: boolean;
  };
  refresh: () => Promise<void>;
}

const DEFAULTS: Omit<TenantBranding, 'refresh'> = {
  loaded: false,
  logoUrl: null,
  displayName: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  enableTables: true,
  enableTabs: true,
  enableKitchen: true,
  enablePrinting: true,
  enableServiceFee: true,
  enableCreditAccounts: false,
  digitalMenuContracted: false,
  digitalMenuEnabled: false,
  digitalMenuSlug: null,
  tabNumberingMode: 'manual',
  receiptMessage: null,
  establishmentData: {},
  plan: { name: null, allowTables: true, allowTabs: true, allowKitchen: true, allowAdvancedDashboard: true },
};

const Ctx = createContext<TenantBranding>({ ...DEFAULTS, refresh: async () => {} });

/** Convert a hex (#RRGGBB) to "H S% L%" suitable for HSL CSS vars. */
function hexToHslTuple(hex: string): string | null {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return `${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%`;
}

function applyCssColors(primary?: string | null, accent?: string | null, secondary?: string | null) {
  const root = document.documentElement;
  // We keep oklch tokens as the default. When a tenant provides hex colors, we
  // override the few key vars used across the UI.
  const setVar = (name: string, hex?: string | null) => {
    if (!hex) { root.style.removeProperty(name); return; }
    const hsl = hexToHslTuple(hex);
    if (!hsl) return;
    root.style.setProperty(name, `hsl(${hsl})`);
  };
  setVar('--primary', primary);
  setVar('--sidebar-primary', accent ?? primary);
  setVar('--accent', accent);
  setVar('--ring', accent);
  setVar('--sidebar-ring', accent);
  setVar('--secondary', secondary);
}

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const { profile, subscription } = useAuth();
  const [state, setState] = useState<Omit<TenantBranding, 'refresh'>>(DEFAULTS);

  const load = async () => {
    if (!profile?.company_id) { setState(DEFAULTS); return; }
    const [{ data: settings }, { data: company }, plan] = await Promise.all([
      supabase.from('settings').select('*').eq('company_id', profile.company_id).maybeSingle(),
      supabase.from('companies').select('logo_url, primary_color, secondary_color, accent_color, trade_name, name, digital_menu_contracted, digital_menu_enabled, digital_menu_slug').eq('id', profile.company_id).maybeSingle(),
      subscription?.plan_id
        ? supabase.from('plans').select('*').eq('id', subscription.plan_id).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);

    const next: Omit<TenantBranding, 'refresh'> = {
      loaded: true,
      logoUrl: company?.logo_url ?? null,
      displayName: settings?.display_name ?? company?.trade_name ?? company?.name ?? null,
      primaryColor: company?.primary_color ?? null,
      secondaryColor: settings?.secondary_color ?? company?.secondary_color ?? null,
      accentColor: settings?.accent_color ?? company?.accent_color ?? null,
      enableTables: settings?.enable_tables_module ?? true,
      enableTabs: settings?.enable_tabs_module ?? true,
      enableKitchen: settings?.enable_kitchen_module ?? true,
      enablePrinting: settings?.enable_printing ?? true,
      enableServiceFee: settings?.enable_service_fee ?? true,
      enableCreditAccounts: (settings as any)?.enable_credit_accounts ?? false,
      tabNumberingMode: (settings?.tab_numbering_mode as 'manual' | 'auto') ?? 'manual',
      receiptMessage: settings?.receipt_message ?? null,
      establishmentData: (settings?.establishment_data as Record<string, unknown>) ?? {},
      plan: {
        name: plan?.name ?? subscription?.plan_name ?? null,
        allowTables: plan?.allow_tables_module ?? true,
        allowTabs: plan?.allow_tabs_module ?? true,
        allowKitchen: plan?.allow_kitchen_module ?? true,
        allowAdvancedDashboard: plan?.allow_advanced_dashboard ?? true,
      },
    };
    setState(next);
    applyCssColors(next.primaryColor, next.accentColor, next.secondaryColor);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.company_id, subscription?.plan_id]);

  return <Ctx.Provider value={{ ...state, refresh: load }}>{children}</Ctx.Provider>;
}

export function useTenantBranding() {
  return useContext(Ctx);
}

export function applyTenantColorsPreview(primary?: string | null, accent?: string | null, secondary?: string | null) {
  applyCssColors(primary, accent, secondary);
}

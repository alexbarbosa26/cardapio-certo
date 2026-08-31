import { supabase } from '@/integrations/supabase/client';

export interface DigitalMenuSettings {
  company_id: string;
  display_name: string | null;
  presentation: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  instagram: string | null;
  cover_url: string | null;
  primary_color: string | null;
  avg_prep_min: number;
  min_order_amount: number;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  accepting_orders: boolean;
  delivery_fee: number;
  free_delivery_min: number | null;
  notes: string | null;
}

export interface DigitalMenuHour {
  weekday: number;
  is_open: boolean;
  period1_start: string | null;
  period1_end: string | null;
  period2_start: string | null;
  period2_end: string | null;
}

export interface DigitalMenuCategory {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export interface DigitalMenuItem {
  id: string;
  company_id: string;
  category_id: string | null;
  product_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  available_delivery: boolean;
  featured: boolean;
  sold_out: boolean;
  sort_order: number;
  extra_prep_min: number;
}

export interface PublicMenuResponse {
  found: boolean;
  available?: boolean;
  company?: {
    id?: string;
    name: string;
    slug?: string;
    logo_url: string | null;
    primary_color: string | null;
  };
  settings?: Partial<DigitalMenuSettings>;
  hours?: DigitalMenuHour[];
  categories?: Array<{
    id: string;
    name: string;
    description: string | null;
    sort_order: number;
    items: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      image_url: string | null;
      featured: boolean;
      sold_out: boolean;
      sort_order: number;
    }>;
  }>;
}

export async function fetchPublicMenu(slug: string): Promise<PublicMenuResponse> {
  const { data, error } = await supabase.rpc('get_public_menu', { _slug: slug.toLowerCase() });
  if (error) throw error;
  return (data as unknown as PublicMenuResponse) ?? { found: false };
}

/** Rótulo amigável para o dia da próxima abertura. */
function nextDayLabel(offset: number, weekday: number): string {
  if (offset === 0) return 'hoje';
  if (offset === 1) return 'amanhã';
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][weekday];
}

function isWithin(hhmm: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  return hhmm >= start.slice(0, 5) && hhmm <= end.slice(0, 5);
}

function isOpenNow(today: DigitalMenuHour | undefined, hhmm: string): boolean {
  if (!today?.is_open) return false;
  return isWithin(hhmm, today.period1_start, today.period1_end) || isWithin(hhmm, today.period2_start, today.period2_end);
}

function findNextOpening(hours: DigitalMenuHour[], wd: number, hhmm: string): string | null {
  for (let i = 0; i < 8; i++) {
    const d = (wd + i) % 7;
    const h = hours.find((x) => x.weekday === d);
    if (!h?.is_open) continue;
    const start = h.period1_start ?? h.period2_start;
    if (!start) continue;
    if (i === 0 && start.slice(0, 5) <= hhmm) continue;
    return `${nextDayLabel(i, d)} às ${start.slice(0, 5)}`;
  }
  return null;
}

/** Determine open status right now using cached hours (client-side). */
export function computeOpenStatus(hours: DigitalMenuHour[] | undefined, now = new Date()) {
  if (!hours || hours.length === 0) return { open: false, next: null as string | null };
  const wd = now.getDay(); // 0=sun
  const hhmm = now.toTimeString().slice(0, 5);
  if (isOpenNow(hours.find((h) => h.weekday === wd), hhmm)) {
    return { open: true, next: null };
  }
  return { open: false, next: findNextOpening(hours, wd, hhmm) };
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

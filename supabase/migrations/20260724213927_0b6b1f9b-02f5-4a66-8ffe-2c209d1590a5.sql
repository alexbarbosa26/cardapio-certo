
-- 1) Companies: flags + slug
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS digital_menu_contracted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digital_menu_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digital_menu_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_digital_menu_slug_key
  ON public.companies (digital_menu_slug)
  WHERE digital_menu_slug IS NOT NULL;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_digital_menu_slug_format
  CHECK (digital_menu_slug IS NULL OR digital_menu_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$');

-- 2) digital_menu_settings (1:1)
CREATE TABLE IF NOT EXISTS public.digital_menu_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name text,
  presentation text,
  phone text,
  whatsapp text,
  address text,
  instagram text,
  cover_url text,
  primary_color text,
  avg_prep_min int NOT NULL DEFAULT 30,
  min_order_amount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_enabled boolean NOT NULL DEFAULT true,
  pickup_enabled boolean NOT NULL DEFAULT true,
  accepting_orders boolean NOT NULL DEFAULT true,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  free_delivery_min numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_settings TO authenticated;
GRANT ALL ON public.digital_menu_settings TO service_role;
ALTER TABLE public.digital_menu_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dms_tenant_all ON public.digital_menu_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id());
CREATE TRIGGER trg_dms_updated BEFORE UPDATE ON public.digital_menu_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) hours
CREATE TABLE IF NOT EXISTS public.digital_menu_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT false,
  period1_start time,
  period1_end time,
  period2_start time,
  period2_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, weekday)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_hours TO authenticated;
GRANT ALL ON public.digital_menu_hours TO service_role;
ALTER TABLE public.digital_menu_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY dmh_tenant_all ON public.digital_menu_hours
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id());
CREATE TRIGGER trg_dmh_updated BEFORE UPDATE ON public.digital_menu_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) categories
CREATE TABLE IF NOT EXISTS public.digital_menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dmc_company_idx ON public.digital_menu_categories(company_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_categories TO authenticated;
GRANT ALL ON public.digital_menu_categories TO service_role;
ALTER TABLE public.digital_menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY dmc_tenant_all ON public.digital_menu_categories
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id());
CREATE TRIGGER trg_dmc_updated BEFORE UPDATE ON public.digital_menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) items
CREATE TABLE IF NOT EXISTS public.digital_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.digital_menu_categories(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  available_delivery boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sold_out boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  extra_prep_min int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dmi_company_idx ON public.digital_menu_items(company_id, category_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_items TO authenticated;
GRANT ALL ON public.digital_menu_items TO service_role;
ALTER TABLE public.digital_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY dmi_tenant_all ON public.digital_menu_items
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id());
CREATE TRIGGER trg_dmi_updated BEFORE UPDATE ON public.digital_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Public RPC — sanitized read for anon
CREATE OR REPLACE FUNCTION public.get_public_menu(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company companies%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_company FROM public.companies
   WHERE digital_menu_slug = lower(_slug)
   LIMIT 1;
  IF v_company.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF NOT (v_company.digital_menu_contracted AND v_company.digital_menu_enabled) THEN
    RETURN jsonb_build_object(
      'found', true,
      'available', false,
      'company', jsonb_build_object(
        'name', COALESCE(v_company.trade_name, v_company.name),
        'logo_url', v_company.logo_url,
        'primary_color', v_company.primary_color
      )
    );
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'available', true,
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', COALESCE(v_company.trade_name, v_company.name),
      'slug', v_company.digital_menu_slug,
      'logo_url', v_company.logo_url,
      'primary_color', v_company.primary_color
    ),
    'settings', COALESCE((
      SELECT to_jsonb(s) - 'company_id' - 'created_at' - 'updated_at'
      FROM public.digital_menu_settings s WHERE s.company_id = v_company.id
    ), '{}'::jsonb),
    'hours', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) - 'company_id' - 'created_at' - 'updated_at' - 'id' ORDER BY h.weekday)
      FROM public.digital_menu_hours h WHERE h.company_id = v_company.id
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(cat ORDER BY sort_order, name) FROM (
        SELECT jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'sort_order', c.sort_order,
          'items', COALESCE((
            SELECT jsonb_agg(it ORDER BY sort_order, name) FROM (
              SELECT jsonb_build_object(
                'id', i.id,
                'name', i.name,
                'description', i.description,
                'price', i.price,
                'image_url', i.image_url,
                'featured', i.featured,
                'sold_out', i.sold_out,
                'sort_order', i.sort_order
              ) AS it, i.sort_order, i.name
              FROM public.digital_menu_items i
              WHERE i.company_id = v_company.id
                AND i.category_id = c.id
                AND i.active = true
                AND i.available_delivery = true
            ) sub
          ), '[]'::jsonb),
          sort_order, name
        ) AS cat, c.sort_order, c.name
        FROM public.digital_menu_categories c
        WHERE c.company_id = v_company.id AND c.active = true
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_public_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu(text) TO anon, authenticated;

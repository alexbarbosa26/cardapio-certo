-- Make option_groups reusable: product_id becomes optional, association via join table
ALTER TABLE public.option_groups ALTER COLUMN product_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  option_group_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, option_group_id)
);

ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view product_option_groups same company"
ON public.product_option_groups FOR SELECT
USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_option_groups.product_id AND p.company_id = current_company_id()));

CREATE POLICY "admin manages product_option_groups"
ON public.product_option_groups FOR ALL
USING (is_admin() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_option_groups.product_id AND p.company_id = current_company_id()))
WITH CHECK (is_admin() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_option_groups.product_id AND p.company_id = current_company_id()));

-- Backfill: for any existing option_groups with product_id, create the join row and clear product_id
INSERT INTO public.product_option_groups (product_id, option_group_id)
SELECT product_id, id FROM public.option_groups WHERE product_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.option_groups SET product_id = NULL WHERE product_id IS NOT NULL;
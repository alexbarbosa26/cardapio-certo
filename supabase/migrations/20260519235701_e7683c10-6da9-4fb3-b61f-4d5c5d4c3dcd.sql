
-- Extend settings with branding + operational toggles
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS enable_tables_module boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_tabs_module boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_kitchen_module boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_printing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_service_fee boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tab_numbering_mode text NOT NULL DEFAULT 'manual' CHECK (tab_numbering_mode IN ('manual','auto')),
  ADD COLUMN IF NOT EXISTS receipt_message text,
  ADD COLUMN IF NOT EXISTS establishment_data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow staff to read minimal branding & module flags so menu/branding works for everyone
DROP POLICY IF EXISTS "company members view settings" ON public.settings;
CREATE POLICY "company members view settings" ON public.settings
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());


-- Customer name on table orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Weighted items in order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS weight_grams numeric,
  ADD COLUMN IF NOT EXISTS price_per_kg numeric;

-- Allow quantity to be 0 for weighted items (we'll always use >=1, but be safe)
-- nothing else needed.

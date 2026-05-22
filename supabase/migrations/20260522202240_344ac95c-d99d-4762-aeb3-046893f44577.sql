CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_unique_ci
  ON public.plans (lower(slug))
  WHERE slug IS NOT NULL;

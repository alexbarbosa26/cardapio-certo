ALTER TABLE public.product_option_groups
  ADD CONSTRAINT product_option_groups_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT product_option_groups_option_group_id_fkey
    FOREIGN KEY (option_group_id) REFERENCES public.option_groups(id) ON DELETE CASCADE;
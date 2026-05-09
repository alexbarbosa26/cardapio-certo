-- ================================
-- ENUMS
-- ================================
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
CREATE TYPE public.table_status AS ENUM ('livre', 'ocupada', 'aguardando', 'preparo', 'pronto', 'fechamento');
CREATE TYPE public.order_status AS ENUM ('aberto', 'fechado', 'cancelado');
CREATE TYPE public.kitchen_status AS ENUM ('pendente', 'aguardando', 'preparo', 'pronto', 'entregue', 'cancelado');
CREATE TYPE public.option_selection_type AS ENUM ('unica', 'multipla');

-- ================================
-- COMPANIES
-- ================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trade_name TEXT,
  document TEXT,
  logo_url TEXT,
  primary_color TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- PROFILES
-- ================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_company ON public.profiles(company_id);

-- ================================
-- USER ROLES
-- ================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Helper functions (SECURITY DEFINER) to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- ================================
-- CATEGORIES
-- ================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_company ON public.categories(company_id);

-- ================================
-- PRODUCTS
-- ================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  sends_to_kitchen BOOLEAN NOT NULL DEFAULT true,
  average_preparation_time INT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_company ON public.products(company_id);

-- ================================
-- OPTION GROUPS / ITEMS
-- ================================
CREATE TABLE public.option_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  selection_type public.option_selection_type NOT NULL DEFAULT 'multipla',
  min_options INT NOT NULL DEFAULT 0,
  max_options INT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_option_groups_product ON public.option_groups(product_id);

CREATE TABLE public.option_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo',
  sort_order INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_option_items_group ON public.option_items(option_group_id);

-- ================================
-- TABLES (mesas)
-- ================================
CREATE TABLE public.tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number INT NOT NULL,
  status public.table_status NOT NULL DEFAULT 'livre',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tables_company ON public.tables(company_id);

-- ================================
-- ORDERS
-- ================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id),
  order_number SERIAL,
  status public.order_status NOT NULL DEFAULT 'aberto',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 10,
  service_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_company ON public.orders(company_id);
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- ================================
-- ORDER ITEMS
-- ================================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  kitchen_status public.kitchen_status NOT NULL DEFAULT 'pendente',
  sends_to_kitchen BOOLEAN NOT NULL DEFAULT true,
  sent_to_kitchen_at TIMESTAMPTZ,
  started_preparation_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_kitchen ON public.order_items(kitchen_status);

CREATE TABLE public.order_item_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_group_name TEXT NOT NULL,
  option_item_name TEXT NOT NULL,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_oio_item ON public.order_item_options(order_item_id);

-- ================================
-- SETTINGS
-- ================================
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  service_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 10,
  debit_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 1.37,
  credit_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 3.17,
  kitchen_warning_minutes INT NOT NULL DEFAULT 10,
  kitchen_danger_minutes INT NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- RLS
-- ================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Companies: o usuário vê apenas a própria empresa
CREATE POLICY "view own company" ON public.companies FOR SELECT
  USING (id = public.current_company_id());
CREATE POLICY "admin updates own company" ON public.companies FOR UPDATE
  USING (id = public.current_company_id() AND public.is_admin());

-- Profiles
CREATE POLICY "view profiles same company" ON public.profiles FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages profiles same company" ON public.profiles FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- User roles
CREATE POLICY "view own roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "admin manages roles" ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Categories
CREATE POLICY "view categories same company" ON public.categories FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages categories" ON public.categories FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- Products
CREATE POLICY "view products same company" ON public.products FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages products" ON public.products FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- Option groups
CREATE POLICY "view option_groups same company" ON public.option_groups FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages option_groups" ON public.option_groups FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- Option items
CREATE POLICY "view option_items same company" ON public.option_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.option_groups og WHERE og.id = option_group_id AND og.company_id = public.current_company_id()));
CREATE POLICY "admin manages option_items" ON public.option_items FOR ALL
  USING (public.is_admin() AND EXISTS (SELECT 1 FROM public.option_groups og WHERE og.id = option_group_id AND og.company_id = public.current_company_id()))
  WITH CHECK (public.is_admin() AND EXISTS (SELECT 1 FROM public.option_groups og WHERE og.id = option_group_id AND og.company_id = public.current_company_id()));

-- Tables
CREATE POLICY "view tables same company" ON public.tables FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages tables" ON public.tables FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());
CREATE POLICY "staff updates table status" ON public.tables FOR UPDATE
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- Orders: admin e staff podem operar
CREATE POLICY "view orders same company" ON public.orders FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "insert orders same company" ON public.orders FOR INSERT
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "update orders same company" ON public.orders FOR UPDATE
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "delete orders admin" ON public.orders FOR DELETE
  USING (company_id = public.current_company_id() AND public.is_admin());

-- Order items
CREATE POLICY "view order_items same company" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = public.current_company_id()));
CREATE POLICY "insert order_items same company" ON public.order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = public.current_company_id()));
CREATE POLICY "update order_items same company" ON public.order_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = public.current_company_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = public.current_company_id()));
CREATE POLICY "delete order_items same company" ON public.order_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.company_id = public.current_company_id()));

-- Order item options
CREATE POLICY "view oio same company" ON public.order_item_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = order_item_id AND o.company_id = public.current_company_id()));
CREATE POLICY "insert oio same company" ON public.order_item_options FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = order_item_id AND o.company_id = public.current_company_id()));
CREATE POLICY "delete oio same company" ON public.order_item_options FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = order_item_id AND o.company_id = public.current_company_id()));

-- Settings
CREATE POLICY "view settings same company" ON public.settings FOR SELECT
  USING (company_id = public.current_company_id());
CREATE POLICY "admin manages settings" ON public.settings FOR ALL
  USING (company_id = public.current_company_id() AND public.is_admin())
  WITH CHECK (company_id = public.current_company_id() AND public.is_admin());

-- ================================
-- Realtime
-- ================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
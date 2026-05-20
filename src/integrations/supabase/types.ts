export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          id: string
          notes: string | null
          register_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          user_id: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          register_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
          user_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          register_id?: string
          type?: Database["public"]["Enums"]["cash_movement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          company_id: string
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          status: Database["public"]["Enums"]["cash_register_status"]
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          company_id: string
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          status?: Database["public"]["Enums"]["cash_register_status"]
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          company_id?: string
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          status?: Database["public"]["Enums"]["cash_register_status"]
        }
        Relationships: []
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          amount: number
          billing_cycle: string
          checkout_url: string | null
          company_id: string
          created_at: string
          expires_at: string | null
          external_session_id: string | null
          id: string
          plan_id: string
          provider: string
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          checkout_url?: string | null
          company_id: string
          created_at?: string
          expires_at?: string | null
          external_session_id?: string | null
          id?: string
          plan_id: string
          provider?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          checkout_url?: string | null
          company_id?: string
          created_at?: string
          expires_at?: string | null
          external_session_id?: string | null
          id?: string
          plan_id?: string
          provider?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          accent_color: string | null
          city: string | null
          created_at: string
          document: string | null
          id: string
          internal_notes: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          responsible_email: string | null
          responsible_name: string | null
          responsible_phone: string | null
          secondary_color: string | null
          state: string | null
          status: string
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          id?: string
          internal_notes?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          secondary_color?: string | null
          state?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          id?: string
          internal_notes?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          secondary_color?: string | null
          state?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_tabs: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          customer_name: string | null
          discount: number
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          paid_amount: number
          service_fee_amount: number
          service_fee_percentage: number
          status: Database["public"]["Enums"]["customer_tab_status"]
          subtotal: number
          tab_number: number
          total: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          customer_name?: string | null
          discount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          paid_amount?: number
          service_fee_amount?: number
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["customer_tab_status"]
          subtotal?: number
          tab_number?: number
          total?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          customer_name?: string | null
          discount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          paid_amount?: number
          service_fee_amount?: number
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["customer_tab_status"]
          subtotal?: number
          tab_number?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      option_groups: {
        Row: {
          company_id: string
          created_at: string
          id: string
          max_options: number | null
          min_options: number
          name: string
          product_id: string | null
          required: boolean
          selection_type: Database["public"]["Enums"]["option_selection_type"]
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          max_options?: number | null
          min_options?: number
          name: string
          product_id?: string | null
          required?: boolean
          selection_type?: Database["public"]["Enums"]["option_selection_type"]
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          max_options?: number | null
          min_options?: number
          name?: string
          product_id?: string | null
          required?: boolean
          selection_type?: Database["public"]["Enums"]["option_selection_type"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      option_items: {
        Row: {
          additional_price: number
          id: string
          name: string
          option_group_id: string
          sort_order: number
          status: string
        }
        Insert: {
          additional_price?: number
          id?: string
          name: string
          option_group_id: string
          sort_order?: number
          status?: string
        }
        Update: {
          additional_price?: number
          id?: string
          name?: string
          option_group_id?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_items_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          additional_price: number
          id: string
          option_group_name: string
          option_item_name: string
          order_item_id: string
        }
        Insert: {
          additional_price?: number
          id?: string
          option_group_name: string
          option_item_name: string
          order_item_id: string
        }
        Update: {
          additional_price?: number
          id?: string
          option_group_name?: string
          option_item_name?: string
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          canceled_at: string | null
          created_at: string
          delivered_at: string | null
          id: string
          kitchen_status: Database["public"]["Enums"]["kitchen_status"]
          notes: string | null
          order_id: string
          paid_quantity: number
          payment_status: Database["public"]["Enums"]["item_payment_status"]
          product_id: string
          product_name: string
          quantity: number
          ready_at: string | null
          sends_to_kitchen: boolean
          sent_to_kitchen_at: string | null
          started_preparation_at: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          notes?: string | null
          order_id: string
          paid_quantity?: number
          payment_status?: Database["public"]["Enums"]["item_payment_status"]
          product_id: string
          product_name: string
          quantity?: number
          ready_at?: string | null
          sends_to_kitchen?: boolean
          sent_to_kitchen_at?: string | null
          started_preparation_at?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          kitchen_status?: Database["public"]["Enums"]["kitchen_status"]
          notes?: string | null
          order_id?: string
          paid_quantity?: number
          payment_status?: Database["public"]["Enums"]["item_payment_status"]
          product_id?: string
          product_name?: string
          quantity?: number
          ready_at?: string | null
          sends_to_kitchen?: boolean
          sent_to_kitchen_at?: string | null
          started_preparation_at?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_allocations: {
        Row: {
          amount_allocated: number
          company_id: string
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          payment_id: string
          quantity_paid: number
        }
        Insert: {
          amount_allocated?: number
          company_id: string
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          payment_id: string
          quantity_paid?: number
        }
        Update: {
          amount_allocated?: number
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          payment_id?: string
          quantity_paid?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          closed_at: string | null
          company_id: string
          discount: number
          id: string
          opened_at: string
          order_number: number
          paid_amount: number
          service_fee_amount: number
          service_fee_percentage: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string
          total: number
          user_id: string | null
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          discount?: number
          id?: string
          opened_at?: string
          order_number?: number
          paid_amount?: number
          service_fee_amount?: number
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id: string
          total?: number
          user_id?: string | null
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          discount?: number
          id?: string
          opened_at?: string
          order_number?: number
          paid_amount?: number
          service_fee_amount?: number
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_mock: boolean
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_mock?: boolean
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_mock?: boolean
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          change_amount: number
          company_id: string
          created_at: string
          fee_amount: number
          fee_percentage: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          net_amount: number
          order_id: string
          person_label: string | null
          received_amount: number
          register_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          user_id: string | null
        }
        Insert: {
          amount: number
          canceled_at?: string | null
          canceled_by?: string | null
          change_amount?: number
          company_id: string
          created_at?: string
          fee_amount?: number
          fee_percentage?: number
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          order_id: string
          person_label?: string | null
          received_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          user_id?: string | null
        }
        Update: {
          amount?: number
          canceled_at?: string | null
          canceled_by?: string | null
          change_amount?: number
          company_id?: string
          created_at?: string
          fee_amount?: number
          fee_percentage?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          order_id?: string
          person_label?: string | null
          received_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          allow_advanced_dashboard: boolean
          allow_cash_register_module: boolean
          allow_kitchen_module: boolean
          allow_reports: boolean
          allow_tables_module: boolean
          allow_tabs_module: boolean
          allow_visual_customization: boolean
          annual_price: number
          created_at: string
          description: string | null
          display_order: number
          full_description: string | null
          id: string
          is_featured: boolean
          max_open_tabs: number | null
          max_products: number | null
          max_tables: number | null
          max_users: number | null
          monthly_price: number
          name: string
          short_description: string | null
          show_on_landing_page: boolean
          slug: string | null
          status: string
          support_level: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          allow_advanced_dashboard?: boolean
          allow_cash_register_module?: boolean
          allow_kitchen_module?: boolean
          allow_reports?: boolean
          allow_tables_module?: boolean
          allow_tabs_module?: boolean
          allow_visual_customization?: boolean
          annual_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          full_description?: string | null
          id?: string
          is_featured?: boolean
          max_open_tabs?: number | null
          max_products?: number | null
          max_tables?: number | null
          max_users?: number | null
          monthly_price?: number
          name: string
          short_description?: string | null
          show_on_landing_page?: boolean
          slug?: string | null
          status?: string
          support_level?: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          allow_advanced_dashboard?: boolean
          allow_cash_register_module?: boolean
          allow_kitchen_module?: boolean
          allow_reports?: boolean
          allow_tables_module?: boolean
          allow_tabs_module?: boolean
          allow_visual_customization?: boolean
          annual_price?: number
          created_at?: string
          description?: string | null
          display_order?: number
          full_description?: string | null
          id?: string
          is_featured?: boolean
          max_open_tabs?: number | null
          max_products?: number | null
          max_tables?: number | null
          max_users?: number | null
          monthly_price?: number
          name?: string
          short_description?: string | null
          show_on_landing_page?: boolean
          slug?: string | null
          status?: string
          support_level?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_option_groups: {
        Row: {
          created_at: string
          id: string
          option_group_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          option_group_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          option_group_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_preparation_time: number | null
          category_id: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_weighted: boolean
          name: string
          price: number
          price_per_kg: number
          sends_to_kitchen: boolean
          status: string
          updated_at: string
        }
        Insert: {
          average_preparation_time?: number | null
          category_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_weighted?: boolean
          name: string
          price?: number
          price_per_kg?: number
          sends_to_kitchen?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          average_preparation_time?: number | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_weighted?: boolean
          name?: string
          price?: number
          price_per_kg?: number
          sends_to_kitchen?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          accent_color: string | null
          company_id: string
          created_at: string
          credit_fee_percentage: number
          debit_fee_percentage: number
          display_name: string | null
          enable_kitchen_module: boolean
          enable_printing: boolean
          enable_service_fee: boolean
          enable_tables_module: boolean
          enable_tabs_module: boolean
          establishment_data: Json
          font_body: string
          font_body_weights: string
          font_display: string
          font_display_weights: string
          id: string
          kitchen_danger_minutes: number
          kitchen_warning_minutes: number
          receipt_message: string | null
          secondary_color: string | null
          service_fee_percentage: number
          tab_numbering_mode: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          company_id: string
          created_at?: string
          credit_fee_percentage?: number
          debit_fee_percentage?: number
          display_name?: string | null
          enable_kitchen_module?: boolean
          enable_printing?: boolean
          enable_service_fee?: boolean
          enable_tables_module?: boolean
          enable_tabs_module?: boolean
          establishment_data?: Json
          font_body?: string
          font_body_weights?: string
          font_display?: string
          font_display_weights?: string
          id?: string
          kitchen_danger_minutes?: number
          kitchen_warning_minutes?: number
          receipt_message?: string | null
          secondary_color?: string | null
          service_fee_percentage?: number
          tab_numbering_mode?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          company_id?: string
          created_at?: string
          credit_fee_percentage?: number
          debit_fee_percentage?: number
          display_name?: string | null
          enable_kitchen_module?: boolean
          enable_printing?: boolean
          enable_service_fee?: boolean
          enable_tables_module?: boolean
          enable_tabs_module?: boolean
          establishment_data?: Json
          font_body?: string
          font_body_weights?: string
          font_display?: string
          font_display_weights?: string
          id?: string
          kitchen_danger_minutes?: number
          kitchen_warning_minutes?: number
          receipt_message?: string | null
          secondary_color?: string | null
          service_fee_percentage?: number
          tab_numbering_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          company_id: string
          created_at: string
          created_by_user_id: string | null
          description: string | null
          event_type: string
          id: string
          new_plan_id: string | null
          new_status: string | null
          old_plan_id: string | null
          old_status: string | null
          subscription_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          event_type: string
          id?: string
          new_plan_id?: string | null
          new_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          subscription_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          event_type?: string
          id?: string
          new_plan_id?: string | null
          new_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          checkout_session_id: string | null
          company_id: string
          created_at: string
          currency: string
          due_date: string | null
          external_payment_id: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          provider: string
          raw_response: Json | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          checkout_session_id?: string | null
          company_id: string
          created_at?: string
          currency?: string
          due_date?: string | null
          external_payment_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          raw_response?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_session_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          external_payment_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          raw_response?: Json | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_reason: string | null
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          external_subscription_id: string | null
          id: string
          last_payment_status: string | null
          next_billing_date: string | null
          payment_provider: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          suspended_at: string | null
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_reason?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          id?: string
          last_payment_status?: string | null
          next_billing_date?: string | null
          payment_provider?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspended_at?: string | null
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_reason?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          external_subscription_id?: string | null
          id?: string
          last_payment_status?: string | null
          next_billing_date?: string | null
          payment_provider?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspended_at?: string | null
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_items: {
        Row: {
          canceled_at: string | null
          category_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item_type: Database["public"]["Enums"]["tab_item_type"]
          notes: string | null
          price_per_kg: number | null
          product_id: string | null
          product_name: string
          quantity: number
          tab_id: string
          total_price: number
          unit_price: number
          weight_grams: number | null
        }
        Insert: {
          canceled_at?: string | null
          category_name?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["tab_item_type"]
          notes?: string | null
          price_per_kg?: number | null
          product_id?: string | null
          product_name: string
          quantity?: number
          tab_id: string
          total_price?: number
          unit_price?: number
          weight_grams?: number | null
        }
        Update: {
          canceled_at?: string | null
          category_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["tab_item_type"]
          notes?: string | null
          price_per_kg?: number | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          tab_id?: string
          total_price?: number
          unit_price?: number
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "customer_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_payments: {
        Row: {
          amount: number
          canceled_at: string | null
          canceled_by: string | null
          change_amount: number
          company_id: string
          created_at: string
          fee_amount: number
          fee_percentage: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          net_amount: number
          person_label: string | null
          received_amount: number
          register_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tab_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          canceled_at?: string | null
          canceled_by?: string | null
          change_amount?: number
          company_id: string
          created_at?: string
          fee_amount?: number
          fee_percentage?: number
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          person_label?: string | null
          received_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tab_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          canceled_at?: string | null
          canceled_by?: string | null
          change_amount?: number
          company_id?: string
          created_at?: string
          fee_amount?: number
          fee_percentage?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          person_label?: string | null
          received_amount?: number
          register_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tab_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_payments_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "customer_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          number: number
          status: Database["public"]["Enums"]["table_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          number: number
          status?: Database["public"]["Enums"]["table_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          number?: number
          status?: Database["public"]["Enums"]["table_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string
          external_id: string | null
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_type: string
          external_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          event_type?: string
          external_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_plan_limits: {
        Args: { _company: string }
        Returns: {
          max_open_tabs: number
          max_tables: number
          max_users: number
        }[]
      }
      current_company_id: { Args: never; Returns: string }
      current_open_register: { Args: { _company: string }; Returns: string }
      get_public_settings: {
        Args: never
        Returns: {
          font_body: string
          font_body_weights: string
          font_display: string
          font_display_weights: string
          kitchen_danger_minutes: number
          kitchen_warning_minutes: number
          service_fee_percentage: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      recalc_customer_tab: { Args: { _tab_id: string }; Returns: undefined }
      recalc_order_payments: { Args: { _order_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "staff" | "super_admin"
      cash_movement_type: "suprimento" | "sangria"
      cash_register_status: "aberto" | "fechado"
      customer_tab_status:
        | "aberta"
        | "aguardando_pagamento"
        | "paga"
        | "cancelada"
      item_payment_status: "pendente" | "parcial" | "pago"
      kitchen_status:
        | "pendente"
        | "aguardando"
        | "preparo"
        | "pronto"
        | "entregue"
        | "cancelado"
      option_selection_type: "unica" | "multipla"
      order_status: "aberto" | "fechado" | "cancelado"
      payment_method: "dinheiro" | "pix" | "debito" | "credito"
      payment_status: "ativo" | "cancelado"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "suspended"
        | "canceled"
        | "expired"
        | "pending_payment"
        | "failed"
      tab_item_type: "fixo" | "peso" | "manual"
      table_status:
        | "livre"
        | "ocupada"
        | "aguardando"
        | "preparo"
        | "pronto"
        | "fechamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "super_admin"],
      cash_movement_type: ["suprimento", "sangria"],
      cash_register_status: ["aberto", "fechado"],
      customer_tab_status: [
        "aberta",
        "aguardando_pagamento",
        "paga",
        "cancelada",
      ],
      item_payment_status: ["pendente", "parcial", "pago"],
      kitchen_status: [
        "pendente",
        "aguardando",
        "preparo",
        "pronto",
        "entregue",
        "cancelado",
      ],
      option_selection_type: ["unica", "multipla"],
      order_status: ["aberto", "fechado", "cancelado"],
      payment_method: ["dinheiro", "pix", "debito", "credito"],
      payment_status: ["ativo", "cancelado"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "suspended",
        "canceled",
        "expired",
        "pending_payment",
        "failed",
      ],
      tab_item_type: ["fixo", "peso", "manual"],
      table_status: [
        "livre",
        "ocupada",
        "aguardando",
        "preparo",
        "pronto",
        "fechamento",
      ],
    },
  },
} as const

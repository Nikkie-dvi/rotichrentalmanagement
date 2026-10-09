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
      app_branding: {
        Row: {
          id: string
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          id: string
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          auto_penalties_enabled: boolean
          auto_reconcile_enabled: boolean
          default_due_day: number
          email_enabled: boolean
          email_subject: string
          email_template: string
          grace_days: number
          owner_id: string
          penalty_max: number | null
          penalty_type: string
          penalty_value: number
          reminder_after_template: string
          reminder_before_template: string
          reminder_days_after: number
          reminder_days_before: number
          reminder_push_enabled: boolean
          reminder_sms_enabled: boolean
          rent_reminders_enabled: boolean
          sms_enabled: boolean
          sms_template: string
          updated_at: string
        }
        Insert: {
          auto_penalties_enabled?: boolean
          auto_reconcile_enabled?: boolean
          default_due_day?: number
          email_enabled?: boolean
          email_subject?: string
          email_template?: string
          grace_days?: number
          owner_id?: string
          penalty_max?: number | null
          penalty_type?: string
          penalty_value?: number
          reminder_after_template?: string
          reminder_before_template?: string
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_push_enabled?: boolean
          reminder_sms_enabled?: boolean
          rent_reminders_enabled?: boolean
          sms_enabled?: boolean
          sms_template?: string
          updated_at?: string
        }
        Update: {
          auto_penalties_enabled?: boolean
          auto_reconcile_enabled?: boolean
          default_due_day?: number
          email_enabled?: boolean
          email_subject?: string
          email_template?: string
          grace_days?: number
          owner_id?: string
          penalty_max?: number | null
          penalty_type?: string
          penalty_value?: number
          reminder_after_template?: string
          reminder_before_template?: string
          reminder_days_after?: number
          reminder_days_before?: number
          reminder_push_enabled?: boolean
          reminder_sms_enabled?: boolean
          rent_reminders_enabled?: boolean
          sms_enabled?: boolean
          sms_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          kind: string
          owner_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          kind?: string
          owner_id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_remaining: number
          base_rent: number
          created_at: string
          due_date: string | null
          electricity_amount: number
          garbage_amount: number
          id: string
          kind: string
          late_penalty_amount: number
          month_year: string
          other_amount: number
          other_label: string | null
          owner_id: string
          penalty_applied_at: string | null
          penalty_waive_reason: string | null
          penalty_waived: boolean
          status: string
          tenant_id: string
          total_due: number
          utility_amount: number
          water_amount: number
        }
        Insert: {
          balance_remaining?: number
          base_rent?: number
          created_at?: string
          due_date?: string | null
          electricity_amount?: number
          garbage_amount?: number
          id?: string
          kind?: string
          late_penalty_amount?: number
          month_year: string
          other_amount?: number
          other_label?: string | null
          owner_id?: string
          penalty_applied_at?: string | null
          penalty_waive_reason?: string | null
          penalty_waived?: boolean
          status?: string
          tenant_id: string
          total_due?: number
          utility_amount?: number
          water_amount?: number
        }
        Update: {
          balance_remaining?: number
          base_rent?: number
          created_at?: string
          due_date?: string | null
          electricity_amount?: number
          garbage_amount?: number
          id?: string
          kind?: string
          late_penalty_amount?: number
          month_year?: string
          other_amount?: number
          other_label?: string | null
          owner_id?: string
          penalty_applied_at?: string | null
          penalty_waive_reason?: string | null
          penalty_waived?: boolean
          status?: string
          tenant_id?: string
          total_due?: number
          utility_amount?: number
          water_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_accounts: {
        Row: {
          approved_at: string | null
          billing_plan: string
          created_at: string
          declined_reason: string | null
          discount_percent: number
          email: string | null
          full_name: string | null
          id: string
          landlord_code: string | null
          last_payment_amount: number | null
          last_payment_at: string | null
          last_payment_reference: string | null
          lease_clauses: string | null
          lease_document_name: string | null
          lease_document_path: string | null
          lease_document_uploaded_at: string | null
          lease_footer: string | null
          lease_intro: string | null
          lease_landlord_name: string | null
          monthly_fee: number
          offer_note: string | null
          paid_until: string | null
          payment_method: string
          payment_number: string | null
          payment_reference: string | null
          phone: string | null
          rent_payment_method: string
          rent_payment_note: string | null
          rent_payment_number: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          billing_plan?: string
          created_at?: string
          declined_reason?: string | null
          discount_percent?: number
          email?: string | null
          full_name?: string | null
          id?: string
          landlord_code?: string | null
          last_payment_amount?: number | null
          last_payment_at?: string | null
          last_payment_reference?: string | null
          lease_clauses?: string | null
          lease_document_name?: string | null
          lease_document_path?: string | null
          lease_document_uploaded_at?: string | null
          lease_footer?: string | null
          lease_intro?: string | null
          lease_landlord_name?: string | null
          monthly_fee?: number
          offer_note?: string | null
          paid_until?: string | null
          payment_method?: string
          payment_number?: string | null
          payment_reference?: string | null
          phone?: string | null
          rent_payment_method?: string
          rent_payment_note?: string | null
          rent_payment_number?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          billing_plan?: string
          created_at?: string
          declined_reason?: string | null
          discount_percent?: number
          email?: string | null
          full_name?: string | null
          id?: string
          landlord_code?: string | null
          last_payment_amount?: number | null
          last_payment_at?: string | null
          last_payment_reference?: string | null
          lease_clauses?: string | null
          lease_document_name?: string | null
          lease_document_path?: string | null
          lease_document_uploaded_at?: string | null
          lease_footer?: string | null
          lease_intro?: string | null
          lease_landlord_name?: string | null
          monthly_fee?: number
          offer_note?: string | null
          paid_until?: string | null
          payment_method?: string
          payment_number?: string | null
          payment_reference?: string | null
          phone?: string | null
          rent_payment_method?: string
          rent_payment_note?: string | null
          rent_payment_number?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      landlord_subscription_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          landlord_account_id: string
          months_covered: number
          note: string | null
          payment_date: string
          recorded_by: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          landlord_account_id: string
          months_covered?: number
          note?: string | null
          payment_date?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          landlord_account_id?: string
          months_covered?: number
          note?: string | null
          payment_date?: string
          recorded_by?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_subscription_payments_landlord_account_id_fkey"
            columns: ["landlord_account_id"]
            isOneToOne: false
            referencedRelation: "landlord_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      landlord_subscription_stk: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          landlord_account_id: string
          merchant_request_id: string | null
          months_covered: number
          mpesa_receipt_no: string | null
          phone_number: string
          result_desc: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          landlord_account_id: string
          merchant_request_id?: string | null
          months_covered?: number
          mpesa_receipt_no?: string | null
          phone_number: string
          result_desc?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          landlord_account_id?: string
          merchant_request_id?: string | null
          months_covered?: number
          mpesa_receipt_no?: string | null
          phone_number?: string
          result_desc?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landlord_subscription_stk_landlord_account_id_fkey"
            columns: ["landlord_account_id"]
            isOneToOne: false
            referencedRelation: "landlord_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          landlord_note: string | null
          owner_id: string
          status: string
          tenant_id: string
          updated_at: string
          urgency: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          landlord_note?: string | null
          owner_id: string
          status?: string
          tenant_id: string
          updated_at?: string
          urgency: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          landlord_note?: string | null
          owner_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_accounts: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          monthly_fee: number | null
          paid_until: string | null
          phone: string | null
          property_count: number
          rate_per_property: number
          trial_ends_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          monthly_fee?: number | null
          paid_until?: string | null
          phone?: string | null
          property_count?: number
          rate_per_property?: number
          trial_ends_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          monthly_fee?: number | null
          paid_until?: string | null
          phone?: string | null
          property_count?: number
          rate_per_property?: number
          trial_ends_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      move_out_requests: {
        Row: {
          created_at: string
          id: string
          landlord_response: string | null
          owner_id: string
          reason: string
          requested_date: string | null
          responded_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_response?: string | null
          owner_id: string
          reason: string
          requested_date?: string | null
          responded_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_response?: string | null
          owner_id?: string
          reason?: string
          requested_date?: string | null
          responded_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "move_out_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          merchant_request_id: string | null
          mpesa_receipt_no: string | null
          owner_id: string
          phone_number: string
          result_desc: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          mpesa_receipt_no?: string | null
          owner_id?: string
          phone_number: string
          result_desc?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          merchant_request_id?: string | null
          mpesa_receipt_no?: string | null
          owner_id?: string
          phone_number?: string
          result_desc?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          invoice_id: string | null
          message: string
          owner_id: string
          recipient: string | null
          status: string
          subject: string | null
          tenant_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          message: string
          owner_id: string
          recipient?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          invoice_id?: string | null
          message?: string
          owner_id?: string
          recipient?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_corrections: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_amount: number
          old_amount: number
          owner_id: string
          payment_id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_amount: number
          old_amount: number
          owner_id: string
          payment_id: string
          reason: string
          tenant_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_amount?: number
          old_amount?: number
          owner_id?: string
          payment_id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_corrections_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          invoice_id: string | null
          mpesa_receipt_no: string | null
          mpesa_status: string | null
          owner_id: string
          payment_date: string
          payment_method: string
          recorded_by: string | null
          reference_no: string | null
          tenant_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          mpesa_receipt_no?: string | null
          mpesa_status?: string | null
          owner_id?: string
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          reference_no?: string | null
          tenant_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          mpesa_receipt_no?: string | null
          mpesa_status?: string | null
          owner_id?: string
          payment_date?: string
          payment_method?: string
          recorded_by?: string | null
          reference_no?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_pricing: {
        Row: {
          annual_discount_percent: number
          base_monthly: number
          id: string
          loyalty_after_months: number
          loyalty_discount_percent: number
          offer_note: string | null
          support_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          annual_discount_percent?: number
          base_monthly?: number
          id?: string
          loyalty_after_months?: number
          loyalty_discount_percent?: number
          offer_note?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          annual_discount_percent?: number
          base_monthly?: number
          id?: string
          loyalty_after_months?: number
          loyalty_discount_percent?: number
          offer_note?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          created_at: string
          id: string
          landlord_email: string | null
          landlord_name: string | null
          landlord_phone: string | null
          location: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          landlord_email?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          location?: string | null
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          landlord_email?: string | null
          landlord_name?: string | null
          landlord_phone?: string | null
          location?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      property_managers: {
        Row: {
          active: boolean
          can_edit_units: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          landlord_user_id: string
          manager_user_id: string | null
          phone: string | null
          property_names: string[]
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          can_edit_units?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          landlord_user_id: string
          manager_user_id?: string | null
          phone?: string | null
          property_names?: string[]
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          can_edit_units?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          landlord_user_id?: string
          manager_user_id?: string | null
          phone?: string | null
          property_names?: string[]
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          owner_id?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      signup_attempts: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
        }
        Relationships: []
      }
      sms_ledger: {
        Row: {
          balance_after: number
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          owner_id: string
          reason: string
          sms_count: number
        }
        Insert: {
          balance_after?: number
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          owner_id: string
          reason: string
          sms_count?: number
        }
        Update: {
          balance_after?: number
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          owner_id?: string
          reason?: string
          sms_count?: number
        }
        Relationships: []
      }
      sms_topup_requests: {
        Row: {
          admin_note: string | null
          amount: number
          approved_amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          approved_amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          approved_amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_wallets: {
        Row: {
          balance: number
          created_at: string
          owner_id: string
          rate_per_sms: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          owner_id: string
          rate_per_sms?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          owner_id?: string
          rate_per_sms?: number
          updated_at?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_credit_events: {
        Row: {
          acknowledged: boolean
          amount: number
          created_at: string
          created_by: string | null
          delta: number
          id: string
          kind: string
          note: string | null
          owner_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          amount?: number
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          owner_id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          amount?: number
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          owner_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_credit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_login_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          active: boolean
          approval_status: string
          auth_user_id: string | null
          created_at: string
          declined_reason: string | null
          deposit_paid: number
          email: string | null
          full_name: string
          id: string
          lease_signature: string | null
          lease_signed_at: string | null
          move_in_date: string | null
          move_out_date: string | null
          owner_id: string
          phone_number: string | null
          rent_due_day: number | null
          signed_lease_name: string | null
          signed_lease_path: string | null
          signed_lease_uploaded_at: string | null
          unit_id: string | null
        }
        Insert: {
          active?: boolean
          approval_status?: string
          auth_user_id?: string | null
          created_at?: string
          declined_reason?: string | null
          deposit_paid?: number
          email?: string | null
          full_name: string
          id?: string
          lease_signature?: string | null
          lease_signed_at?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          owner_id?: string
          phone_number?: string | null
          rent_due_day?: number | null
          signed_lease_name?: string | null
          signed_lease_path?: string | null
          signed_lease_uploaded_at?: string | null
          unit_id?: string | null
        }
        Update: {
          active?: boolean
          approval_status?: string
          auth_user_id?: string | null
          created_at?: string
          declined_reason?: string | null
          deposit_paid?: number
          email?: string | null
          full_name?: string
          id?: string
          lease_signature?: string | null
          lease_signed_at?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          owner_id?: string
          phone_number?: string | null
          rent_due_day?: number | null
          signed_lease_name?: string | null
          signed_lease_path?: string | null
          signed_lease_uploaded_at?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          property_id: string
          rent_amount: number
          status: string
          unit_number: string
          unit_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          property_id: string
          rent_amount?: number
          status?: string
          unit_number: string
          unit_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          property_id?: string
          rent_amount?: number
          status?: string
          unit_number?: string
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      utility_readings: {
        Row: {
          created_at: string
          current_reading: number
          id: string
          owner_id: string
          previous_reading: number
          reading_date: string
          tenant_id: string
          total_amount: number
          unit_rate: number
        }
        Insert: {
          created_at?: string
          current_reading?: number
          id?: string
          owner_id?: string
          previous_reading?: number
          reading_date?: string
          tenant_id: string
          total_amount?: number
          unit_rate?: number
        }
        Update: {
          created_at?: string
          current_reading?: number
          id?: string
          owner_id?: string
          previous_reading?: number
          reading_date?: string
          tenant_id?: string
          total_amount?: number
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "utility_readings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      correct_assistant_payment: {
        Args: {
          _expected_amount: number
          _new_amount: number
          _payment_id: string
          _reason: string
        }
        Returns: Json
      }
      generate_landlord_code: { Args: never; Returns: string }
      manager_can_edit: { Args: { _owner: string }; Returns: boolean }
      manages_owner: { Args: { _owner: string }; Returns: boolean }
      sms_charge: {
        Args: {
          _count: number
          _note?: string
          _owner: string
          _reason: string
        }
        Returns: number
      }
      sms_credit: {
        Args: {
          _amount: number
          _by?: string
          _note?: string
          _owner: string
          _reason: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

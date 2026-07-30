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
      invoices: {
        Row: {
          balance_remaining: number
          base_rent: number
          created_at: string
          id: string
          month_year: string
          owner_id: string
          status: string
          tenant_id: string
          total_due: number
          utility_amount: number
        }
        Insert: {
          balance_remaining?: number
          base_rent?: number
          created_at?: string
          id?: string
          month_year: string
          owner_id?: string
          status?: string
          tenant_id: string
          total_due?: number
          utility_amount?: number
        }
        Update: {
          balance_remaining?: number
          base_rent?: number
          created_at?: string
          id?: string
          month_year?: string
          owner_id?: string
          status?: string
          tenant_id?: string
          total_due?: number
          utility_amount?: number
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
      properties: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          owner_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          owner_id?: string
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
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          property_id: string
          rent_amount?: number
          status?: string
          unit_number: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          property_id?: string
          rent_amount?: number
          status?: string
          unit_number?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const

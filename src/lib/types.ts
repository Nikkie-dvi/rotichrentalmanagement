export type Property = { id: string; name: string; location: string | null; created_at: string };
export type Unit = {
  id: string;
  property_id: string;
  unit_number: string;
  rent_amount: number;
  status: "vacant" | "occupied";
  created_at: string;
};
export type Tenant = {
  id: string;
  unit_id: string | null;
  full_name: string;
  phone_number: string | null;
  deposit_paid: number;
  move_in_date: string | null;
  move_out_date: string | null;
  rent_due_day: number | null;
  active: boolean;
  created_at: string;
};
export type UtilityReading = {
  id: string;
  tenant_id: string;
  reading_date: string;
  previous_reading: number;
  current_reading: number;
  unit_rate: number;
  total_amount: number;
  created_at: string;
};
export type Invoice = {
  id: string;
  tenant_id: string;
  month_year: string;
  base_rent: number;
  utility_amount: number;
  total_due: number;
  balance_remaining: number;
  status: "unpaid" | "partial" | "paid";
  created_at: string;
};
export type Payment = {
  id: string;
  invoice_id: string | null;
  tenant_id: string;
  amount_paid: number;
  payment_method: "mpesa" | "bank" | "cash";
  reference_no: string | null;
  payment_date: string;
  created_at: string;
};

export const money = (n: number) =>
  `KES ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0)}`;

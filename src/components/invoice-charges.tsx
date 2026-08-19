import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

export type InvoiceLike = {
  id?: string;
  base_rent?: number | string | null;
  utility_amount?: number | string | null;
  water_amount?: number | string | null;
  electricity_amount?: number | string | null;
  garbage_amount?: number | string | null;
  other_amount?: number | string | null;
  other_label?: string | null;
  late_penalty_amount?: number | string | null;
};

export type LineItem = { id: string; category: string; amount: number; description: string | null; kind: string };

/** Extra charges + penalties stored as invoice line items. */
export function useInvoiceLineItems(invoiceId?: string | null) {
  return useQuery({
    queryKey: ["invoice-line-items", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoice_line_items")
        .select("id, category, amount, description, kind")
        .eq("invoice_id", invoiceId!)
        .order("created_at");
      return (data ?? []) as LineItem[];
    },
  });
}

/** Builds the itemised charge lines for an invoice (rent, water, power, garbage, other). */
export function invoiceLines(inv: InvoiceLike) {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const water = n(inv.water_amount);
  const power = n(inv.electricity_amount);
  const garbage = n(inv.garbage_amount);
  const other = n(inv.other_amount);
  const metered = Math.max(0, n(inv.utility_amount) - (water + power + garbage + other));
  const lines: { label: string; amount: number }[] = [
    { label: "Base rent", amount: n(inv.base_rent) },
  ];
  if (water) lines.push({ label: "Water bill", amount: water });
  if (power) lines.push({ label: "Electricity", amount: power });
  if (garbage) lines.push({ label: "Garbage / service", amount: garbage });
  if (other) lines.push({ label: inv.other_label?.trim() || "Other charge", amount: other });
  if (metered) lines.push({ label: "Metered utilities", amount: metered });
  return lines;
}

export function InvoiceCharges({ invoice, className = "" }: { invoice: InvoiceLike; className?: string }) {
  const lines = invoiceLines(invoice);
  const { data: items } = useInvoiceLineItems(invoice.id);
  const extras = (items ?? []).filter((i) => i.kind !== "penalty");
  const penalties = (items ?? []).filter((i) => i.kind === "penalty");
  const penaltyTotal = Number(invoice.late_penalty_amount ?? 0) || 0;

  return (
    <div className={`space-y-1 text-sm ${className}`}>
      {lines.map((l) => (
        <div key={l.label} className="flex justify-between">
          <span className="text-muted-foreground">{l.label}</span>
          <span>{money(l.amount)}</span>
        </div>
      ))}
      {extras.map((i) => (
        <div key={i.id} className="flex justify-between">
          <span className="text-muted-foreground">{i.category}</span>
          <span>{money(Number(i.amount))}</span>
        </div>
      ))}
      {penalties.length > 0
        ? penalties.map((i) => (
            <div key={i.id} className="flex justify-between text-destructive">
              <span>{i.category}</span>
              <span>{money(Number(i.amount))}</span>
            </div>
          ))
        : penaltyTotal > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Late payment fee</span>
              <span>{money(penaltyTotal)}</span>
            </div>
          )}
    </div>
  );
}

import { money } from "@/lib/types";

export type InvoiceLike = {
  base_rent?: number | string | null;
  utility_amount?: number | string | null;
  water_amount?: number | string | null;
  electricity_amount?: number | string | null;
  garbage_amount?: number | string | null;
  other_amount?: number | string | null;
  other_label?: string | null;
};

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
  return (
    <div className={`space-y-1 text-sm ${className}`}>
      {lines.map((l) => (
        <div key={l.label} className="flex justify-between">
          <span className="text-muted-foreground">{l.label}</span>
          <span>{money(l.amount)}</span>
        </div>
      ))}
    </div>
  );
}

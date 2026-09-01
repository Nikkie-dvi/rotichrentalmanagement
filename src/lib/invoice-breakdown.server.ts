// Builds a human readable, itemised breakdown of an invoice for SMS/push text,
// e.g. "Rent 12,000, Water 500, Garbage 200, Late fee 600".
const money = (n: number) => `KES ${Math.round(n).toLocaleString("en-US")}`;
const num = (n: any) => Number(n ?? 0) || 0;

export type BreakdownParts = { text: string; total: number; balance: number };

/** `client` can be the admin client or an RLS-scoped client — both expose .from(). */
export async function invoiceBreakdown(client: any, invoiceId: string): Promise<BreakdownParts | null> {
  const { data: inv } = await client
    .from("invoices")
    .select(
      "id, month_year, kind, base_rent, water_amount, electricity_amount, garbage_amount, other_amount, other_label, late_penalty_amount, total_due, balance_remaining",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return null;


  const { data: items } = await client
    .from("invoice_line_items")
    .select("category, amount, kind")
    .eq("invoice_id", invoiceId);

  const extras = (items ?? []) as any[];
  const extrasTotal = extras.filter((i) => i.kind !== "penalty").reduce((s, i) => s + num(i.amount), 0);

  const parts: string[] = [];
  const push = (label: string, amount: number) => {
    if (amount > 0) parts.push(`${label} ${money(amount)}`);
  };

  push("Rent", num(inv.base_rent));
  push("Water", num(inv.water_amount));
  push("Electricity", num(inv.electricity_amount));
  push("Garbage", num(inv.garbage_amount));

  // `other_amount` also carries itemised extra charges; list those by name instead.
  for (const i of extras.filter((i) => i.kind !== "penalty")) push(String(i.category), num(i.amount));
  const otherLeft = num(inv.other_amount) - extrasTotal;
  if (otherLeft > 0) push(String(inv.other_label || "Other charges"), otherLeft);

  push("Late fee", num(inv.late_penalty_amount));

  // Fall back to a plain utility line when nothing itemised is present.
  if (parts.length === 0) push("Total charges", num(inv.total_due));

  return {
    text: parts.join(", "),
    total: num(inv.total_due),
    balance: num(inv.balance_remaining),
  };
}

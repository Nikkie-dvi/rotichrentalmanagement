export type UtilityInvoice = {
  id: string; month_year: string; kind: string; total_due: number; balance_remaining: number;
  water_amount: number; electricity_amount: number; garbage_amount: number; other_amount: number; utility_amount: number;
};
export function utilitySummary(invoices: UtilityInvoice[], month: string) {
  const services = invoices.filter(i => i.kind === "service");
  const selected = services.filter(i => i.month_year === month);
  const billed = selected.reduce((s, i) => s + Number(i.total_due), 0);
  const outstanding = services.reduce((s, i) => s + Math.max(0, Number(i.balance_remaining)), 0);
  // Invoice settlement includes applied prepaid credit; it is not a dated cash receipt.
  const settled = selected.reduce((s, i) => s + Math.max(0, Number(i.total_due) - Math.max(0, Number(i.balance_remaining))), 0);
  const rows = [
    { label: "Electricity", key: "electricity_amount" },
    { label: "Water", key: "water_amount" },
    { label: "Garbage", key: "garbage_amount" },
    { label: "Other", key: "other_amount" },
  ].map(({ label, key }) => ({ label, billed: selected.reduce((s, i) => s + Number(i[key as keyof UtilityInvoice] || 0), 0) }));
  const metered = selected.reduce((s, i) => s + Math.max(0, Number(i.utility_amount) - Number(i.water_amount) - Number(i.electricity_amount) - Number(i.garbage_amount) - Number(i.other_amount)), 0);
  if (metered) rows.push({ label: "Metered", billed: metered });
  const remaining = Math.max(0, billed - rows.reduce((s, r) => s + r.billed, 0));
  if (remaining) rows.push({ label: "Other service charges", billed: remaining });
  return { billed, settled, outstanding, rows: rows.filter(r => r.billed > 0), selected, services };
}
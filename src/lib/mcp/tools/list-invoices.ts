import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_invoices",
  title: "List invoices and arrears",
  description:
    "List the signed-in landlord's rent invoices with amounts due, remaining balance and payment status. Use status 'unpaid' or 'partial' to review arrears.",
  inputSchema: {
    status: z.enum(["all", "unpaid", "partial", "paid"]).default("all").describe("Filter invoices by payment status."),
    month_year: z.string().optional().describe("Optional month filter, e.g. '2026-08'."),
    limit: z.number().int().min(1).max(200).default(100).describe("Maximum number of invoices to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, month_year, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("invoices")
      .select("id, tenant_id, month_year, base_rent, utility_amount, total_due, balance_remaining, status, tenants(full_name)")
      .order("month_year", { ascending: false })
      .limit(limit ?? 100);
    if (status && status !== "all") query = query.eq("status", status);
    if (month_year) query = query.eq("month_year", month_year);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const outstanding = (data ?? []).reduce((sum, row) => sum + Number(row.balance_remaining ?? 0), 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ outstanding_total: outstanding, invoices: data ?? [] }) }],
      structuredContent: { outstanding_total: outstanding, invoices: data ?? [] },
    };
  },
});

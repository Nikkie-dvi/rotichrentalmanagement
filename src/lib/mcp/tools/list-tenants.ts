import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tenants",
  title: "List tenants",
  description: "List the signed-in landlord's tenants, including unit, move-in date, rent due day and approval status.",
  inputSchema: {
    active_only: z.boolean().default(true).describe("Only return currently active tenants."),
    search: z.string().optional().describe("Optional case-insensitive filter on tenant name."),
    limit: z.number().int().min(1).max(200).default(100).describe("Maximum number of tenants to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("tenants")
      .select(
        "id, full_name, phone_number, unit_id, deposit_paid, move_in_date, move_out_date, rent_due_day, active, approval_status, units(unit_number, rent_amount)",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (active_only !== false) query = query.eq("active", true);
    if (search) query = query.ilike("full_name", `%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tenants: data ?? [] },
    };
  },
});

import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_maintenance_tickets",
  title: "List maintenance tickets",
  description: "List maintenance/issue tickets raised by the signed-in landlord's tenants, with category, urgency and status.",
  inputSchema: {
    status: z.enum(["all", "pending", "in_progress", "resolved"]).default("all").describe("Filter tickets by status."),
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of tickets to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("maintenance_tickets")
      .select("id, tenant_id, category, urgency, description, status, landlord_note, created_at, tenants(full_name)")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { tickets: data ?? [] },
    };
  },
});

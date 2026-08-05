import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_properties",
  title: "List properties and units",
  description: "List the signed-in landlord's properties with their units, rent amounts and occupancy status.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Maximum number of properties to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("properties")
      .select("id, name, location, created_at, units(id, unit_number, rent_amount, status)")
      .order("created_at", { ascending: true })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { properties: data ?? [] },
    };
  },
});

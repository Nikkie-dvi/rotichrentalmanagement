import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPropertiesTool from "./tools/list-properties";
import listTenantsTool from "./tools/list-tenants";
import listInvoicesTool from "./tools/list-invoices";
import listMaintenanceTicketsTool from "./tools/list-maintenance-tickets";
import recordPaymentTool from "./tools/record-payment";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "homebase-manager",
  title: "HomeBase Manager",
  version: "0.1.0",
  instructions:
    "Tools for a rental property management app. Read properties, units, tenants, invoices/arrears and maintenance tickets, and record rent payments. All data is scoped to the signed-in landlord.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listPropertiesTool,
    listTenantsTool,
    listInvoicesTool,
    listMaintenanceTicketsTool,
    recordPaymentTool,
  ],
});

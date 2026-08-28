// Called by the landlord UI right after an invoice is saved manually.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notifyInvoiceCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string }) => {
    if (!data?.invoiceId) throw new Error("Missing invoice");
    return data;
  })
  .handler(async ({ data, context }) => {
    // RLS makes sure the caller can actually see this invoice.
    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, owner_id, tenant_id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!inv) return { ok: false };

    const { notifyLandlordOfInvoice } = await import("@/lib/invoice-notify.server");
    return notifyLandlordOfInvoice({
      ownerId: (inv as any).owner_id,
      invoiceId: (inv as any).id,
      tenantId: (inv as any).tenant_id,
    });
  });

// Billing server functions: extra charges, late-fee runs, waivers and
// tenant alerts (SMS via SMS Leopard + phone push).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Adds an extra charge (watchman, water, service fee...) to an invoice. */
export const addInvoiceCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string; category: string; amount: number; description?: string; notify?: boolean }) => {
    const category = (data?.category ?? "").trim();
    const amount = Number(data?.amount);
    if (!data?.invoiceId) throw new Error("Invoice is required");
    if (!category) throw new Error("Give the charge a name");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
    return {
      invoiceId: data.invoiceId,
      category: category.slice(0, 60),
      amount: Math.round(amount),
      description: (data.description ?? "").trim().slice(0, 200) || null,
      notify: data.notify !== false,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, owner_id, tenant_id, month_year, total_due, balance_remaining, other_amount")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice not found");

    const { error: itemErr } = await supabase.from("invoice_line_items").insert({
      invoice_id: invoice.id,
      owner_id: (invoice as any).owner_id,
      category: data.category,
      amount: data.amount,
      description: data.description,
      kind: "extra",
    });
    if (itemErr) throw new Error(itemErr.message);

    const newTotal = Number((invoice as any).total_due) + data.amount;
    const newBalance = Number((invoice as any).balance_remaining) + data.amount;
    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        total_due: newTotal,
        balance_remaining: newBalance,
        other_amount: Number((invoice as any).other_amount ?? 0) + data.amount,
        status: newBalance > 0 ? "unpaid" : "paid",
      })
      .eq("id", invoice.id);
    if (upErr) throw new Error(upErr.message);

    let smsSkippedNoCredit = false;
    if (data.notify) {
      const { notifyTenantOfCharge } = await import("@/lib/billing-notify.server");
      const r = await notifyTenantOfCharge({
        ownerId: (invoice as any).owner_id,
        tenantId: (invoice as any).tenant_id,
        invoiceId: invoice.id,
        label: data.category,
        amount: data.amount,
        balance: newBalance,
        month: (invoice as any).month_year,
      });
      smsSkippedNoCredit = !!(r as any)?.smsSkippedNoCredit;
    }

    return { ok: true, total: newTotal, balance: newBalance, smsSkippedNoCredit };
  });

/** Adds several extra charges to one invoice at once, with a single tenant alert. */
export const addInvoiceCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    invoiceId: string;
    items: { category: string; amount: number; description?: string }[];
    notify?: boolean;
  }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    const items = (data?.items ?? [])
      .map((i) => ({
        category: (i?.category ?? "").trim().slice(0, 60),
        amount: Math.round(Number(i?.amount)),
        description: (i?.description ?? "").trim().slice(0, 200) || null,
      }))
      .filter((i) => i.category && Number.isFinite(i.amount) && i.amount > 0);
    if (items.length === 0) throw new Error("Add at least one charge with a name and amount");
    return { invoiceId: data.invoiceId, items, notify: data.notify !== false };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, owner_id, tenant_id, month_year, total_due, balance_remaining, other_amount")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice not found");

    const sum = data.items.reduce((s, i) => s + i.amount, 0);

    const { error: itemErr } = await supabase.from("invoice_line_items").insert(
      data.items.map((i) => ({
        invoice_id: invoice.id,
        owner_id: (invoice as any).owner_id,
        category: i.category,
        amount: i.amount,
        description: i.description,
        kind: "extra",
      })) as never,
    );
    if (itemErr) throw new Error(itemErr.message);

    const newTotal = Number((invoice as any).total_due) + sum;
    const newBalance = Number((invoice as any).balance_remaining) + sum;
    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        total_due: newTotal,
        balance_remaining: newBalance,
        other_amount: Number((invoice as any).other_amount ?? 0) + sum,
        status: newBalance > 0 ? "unpaid" : "paid",
      })
      .eq("id", invoice.id);
    if (upErr) throw new Error(upErr.message);

    let smsSkippedNoCredit = false;
    if (data.notify) {
      const { notifyTenantOfCharge } = await import("@/lib/billing-notify.server");
      const label = data.items.map((i) => i.category).join(", ");
      const r = await notifyTenantOfCharge({
        ownerId: (invoice as any).owner_id,
        tenantId: (invoice as any).tenant_id,
        invoiceId: invoice.id,
        label,
        amount: sum,
        balance: newBalance,
        month: (invoice as any).month_year,
      });
      smsSkippedNoCredit = !!(r as any)?.smsSkippedNoCredit;
    }

    return { ok: true, added: data.items.length, total: newTotal, balance: newBalance, smsSkippedNoCredit };
  });

/** Removes an extra charge and rolls the invoice totals back. */
export const removeInvoiceCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string }) => {
    if (!data?.itemId) throw new Error("Charge is required");
    return { itemId: data.itemId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: item, error } = await supabase
      .from("invoice_line_items")
      .select("id, invoice_id, amount, kind")
      .eq("id", data.itemId)
      .maybeSingle();
    if (error || !item) throw new Error(error?.message ?? "Charge not found");

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, total_due, balance_remaining, other_amount, late_penalty_amount")
      .eq("id", (item as any).invoice_id)
      .maybeSingle();
    if (!invoice) throw new Error("Invoice not found");

    const amount = Number((item as any).amount);
    const isPenalty = (item as any).kind === "penalty";
    const newTotal = Math.max(0, Number((invoice as any).total_due) - amount);
    const newBalance = Math.max(0, Number((invoice as any).balance_remaining) - amount);

    await supabase.from("invoice_line_items").delete().eq("id", data.itemId);
    await supabase
      .from("invoices")
      .update({
        total_due: newTotal,
        balance_remaining: newBalance,
        other_amount: isPenalty
          ? Number((invoice as any).other_amount ?? 0)
          : Math.max(0, Number((invoice as any).other_amount ?? 0) - amount),
        late_penalty_amount: isPenalty
          ? Math.max(0, Number((invoice as any).late_penalty_amount ?? 0) - amount)
          : Number((invoice as any).late_penalty_amount ?? 0),
        status: newBalance > 0 ? "unpaid" : "paid",
      })
      .eq("id", (invoice as any).id);

    return { ok: true };
  });

/** Waives all late fees on an invoice and stops future automatic penalties on it. */
export const waiveLateFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoiceId: string; reason?: string }) => {
    if (!data?.invoiceId) throw new Error("Invoice is required");
    return { invoiceId: data.invoiceId, reason: (data.reason ?? "").trim().slice(0, 200) || null };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, total_due, balance_remaining, late_penalty_amount")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!invoice) throw new Error("Invoice not found");

    const penalty = Number((invoice as any).late_penalty_amount ?? 0);
    await supabase.from("invoice_line_items").delete().eq("invoice_id", data.invoiceId).eq("kind", "penalty");
    const { error } = await supabase
      .from("invoices")
      .update({
        late_penalty_amount: 0,
        total_due: Math.max(0, Number((invoice as any).total_due) - penalty),
        balance_remaining: Math.max(0, Number((invoice as any).balance_remaining) - penalty),
        penalty_waived: true,
        penalty_waive_reason: data.reason,
        status: Math.max(0, Number((invoice as any).balance_remaining) - penalty) > 0 ? "unpaid" : "paid",
      })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true, waived: penalty };
  });

/** Runs the late-fee engine right now for the signed-in landlord. */
export const runLateFeesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: managed } = await context.supabase
      .from("property_managers")
      .select("landlord_user_id")
      .eq("manager_user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    const ownerId = (managed as any)?.landlord_user_id ?? context.userId;
    const { runLatePenalties } = await import("@/lib/late-penalties.server");
    return runLatePenalties({ ownerId });
  });

/** Sends a one-off SMS to a tenant and logs it. */
export const smsTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenantId: string; message: string }) => {
    const message = (data?.message ?? "").trim();
    if (!data?.tenantId) throw new Error("Tenant is required");
    if (!message) throw new Error("Write a message first");
    return { tenantId: data.tenantId, message: message.slice(0, 400) };
  })
  .handler(async ({ data, context }) => {
    const { data: tenant, error } = await context.supabase
      .from("tenants")
      .select("id, owner_id, full_name, phone_number")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error || !tenant) throw new Error(error?.message ?? "Tenant not found");

    const { sendSms } = await import("@/lib/sms.server");
    const res = await sendSms((tenant as any).phone_number, data.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notification_logs").insert({
      owner_id: (tenant as any).owner_id,
      tenant_id: tenant.id,
      channel: "sms",
      recipient: (tenant as any).phone_number ?? null,
      message: data.message,
      status: res.ok ? "delivered" : "failed",
      error: res.error ?? null,
    });

    if (!res.ok) throw new Error(res.error ?? "SMS could not be sent");
    return { ok: true };
  });

/** Sends the before-due / after-due rent reminders for the caller's tenants now. */
export const runRentRemindersNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runRentReminders } = await import("@/lib/rent-reminders.server");
    return runRentReminders({ ownerId: context.userId });
  });

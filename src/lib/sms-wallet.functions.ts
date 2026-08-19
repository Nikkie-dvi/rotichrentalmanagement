// SMS credit wallet: landlords are billed a flat rate per SMS recipient
// (length does not matter). They request a recharge; the main admin approves it.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SMS_RATE = 1.2;

/** The landlord whose wallet applies to the caller (managers bill their landlord). */
async function effectiveOwnerId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("property_managers")
    .select("landlord_user_id")
    .eq("manager_user_id", userId)
    .eq("active", true)
    .maybeSingle();
  return (data?.landlord_user_id as string | undefined) ?? userId;
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Main account only");
}

export const getSmsWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await effectiveOwnerId(context.supabase, context.userId);
    const { data: wallet } = await context.supabase
      .from("sms_wallets")
      .select("owner_id, balance, rate_per_sms")
      .eq("owner_id", ownerId)
      .maybeSingle();
    const { data: ledger } = await context.supabase
      .from("sms_ledger")
      .select("id, delta, sms_count, balance_after, reason, note, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: requests } = await context.supabase
      .from("sms_topup_requests")
      .select("id, amount, note, status, admin_note, approved_amount, created_at, decided_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(10);

    const rate = Number((wallet as any)?.rate_per_sms ?? SMS_RATE);
    const balance = Number((wallet as any)?.balance ?? 0);
    return {
      ownerId,
      balance,
      rate,
      messagesLeft: Math.floor(balance / rate),
      ledger: (ledger ?? []) as any[],
      requests: (requests ?? []) as any[],
    };
  });

export const requestSmsRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { amount: number; note?: string }) => {
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount you want to top up");
    return { amount: Math.min(amount, 1_000_000), note: (data.note ?? "").trim().slice(0, 300) || null };
  })
  .handler(async ({ data, context }) => {
    const ownerId = await effectiveOwnerId(context.supabase, context.userId);
    if (ownerId !== context.userId) throw new Error("Only the landlord can request a recharge");
    const { data: existing } = await context.supabase
      .from("sms_topup_requests")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) throw new Error("You already have a recharge request waiting for approval");

    const { error } = await context.supabase
      .from("sms_topup_requests")
      .insert({ owner_id: ownerId, amount: data.amount, note: data.note, status: "pending" } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Main account: every recharge request plus each landlord's balance. */
export const listSmsRecharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: requests } = await supabaseAdmin
      .from("sms_topup_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    const { data: wallets } = await supabaseAdmin.from("sms_wallets").select("*");
    const { data: accounts } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id, full_name, email, landlord_code");

    const nameOf = (uid: string) => {
      const a = (accounts ?? []).find((x: any) => x.user_id === uid) as any;
      return { name: a?.full_name ?? a?.email ?? "Landlord", email: a?.email ?? null, code: a?.landlord_code ?? null };
    };

    return {
      requests: ((requests ?? []) as any[]).map((r) => ({ ...r, landlord: nameOf(r.owner_id) })),
      wallets: ((wallets ?? []) as any[]).map((w) => ({
        ...w,
        landlord: nameOf(w.owner_id),
        messagesLeft: Math.floor(Number(w.balance) / Number(w.rate_per_sms || SMS_RATE)),
      })),
    };
  });

/** Main account: approve (credits the wallet) or decline a recharge request. */
export const decideSmsRecharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; approve: boolean; amount?: number; note?: string }) => {
    if (!data?.id) throw new Error("Missing request");
    return {
      id: data.id,
      approve: !!data.approve,
      amount: data.amount != null ? Number(data.amount) : undefined,
      note: (data.note ?? "").trim().slice(0, 300) || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin.from("sms_topup_requests").select("*").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Request not found");
    if ((req as any).status !== "pending") throw new Error("This request was already handled");

    let balance: number | null = null;
    if (data.approve) {
      const amount = data.amount && data.amount > 0 ? data.amount : Number((req as any).amount);
      const { data: bal, error } = await supabaseAdmin.rpc("sms_credit" as never, {
        _owner: (req as any).owner_id,
        _amount: amount,
        _reason: "recharge",
        _note: data.note ?? `Approved recharge request`,
        _by: context.userId,
      } as never);
      if (error) throw new Error(error.message);
      balance = Number(bal);
      await supabaseAdmin
        .from("sms_topup_requests")
        .update({
          status: "approved",
          approved_amount: amount,
          admin_note: data.note,
          decided_at: new Date().toISOString(),
          decided_by: context.userId,
        } as never)
        .eq("id", data.id);
    } else {
      await supabaseAdmin
        .from("sms_topup_requests")
        .update({
          status: "declined",
          admin_note: data.note,
          decided_at: new Date().toISOString(),
          decided_by: context.userId,
        } as never)
        .eq("id", data.id);
    }
    return { ok: true, balance };
  });

/** Main account: credit or debit a landlord's SMS wallet directly. */
export const adjustSmsBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ownerId: string; amount: number; note?: string }) => {
    if (!data?.ownerId) throw new Error("Missing landlord");
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter an amount");
    return { ownerId: data.ownerId, amount, note: (data.note ?? "").trim().slice(0, 300) || null };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bal, error } = await supabaseAdmin.rpc("sms_credit" as never, {
      _owner: data.ownerId,
      _amount: data.amount,
      _reason: data.amount > 0 ? "manual_credit" : "manual_debit",
      _note: data.note,
      _by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, balance: Number(bal) };
  });

/** Main account: top up every landlord's SMS wallet in one go. */
export const creditAllSmsWallets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { amount: number; note?: string; onlyEmpty?: boolean }) => {
    const amount = Number(data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount to credit");
    return {
      amount: Math.min(amount, 1_000_000),
      note: (data.note ?? "").trim().slice(0, 300) || null,
      onlyEmpty: !!data.onlyEmpty,
    };
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: accounts, error } = await supabaseAdmin
      .from("landlord_accounts")
      .select("user_id, status");
    if (error) throw new Error(error.message);

    const { data: wallets } = await supabaseAdmin.from("sms_wallets").select("owner_id, balance, rate_per_sms");
    const walletOf = new Map(((wallets ?? []) as any[]).map((w) => [w.owner_id as string, w]));

    const targets = ((accounts ?? []) as any[])
      .filter((a) => a.status === "approved")
      .map((a) => a.user_id as string)
      .filter((uid) => {
        if (!data.onlyEmpty) return true;
        const w = walletOf.get(uid);
        const rate = Number(w?.rate_per_sms ?? SMS_RATE);
        return Math.floor(Number(w?.balance ?? 0) / rate) < 1;
      });

    let credited = 0;
    for (const uid of targets) {
      const { error: err } = await supabaseAdmin.rpc("sms_credit" as never, {
        _owner: uid,
        _amount: data.amount,
        _reason: "manual_credit",
        _note: data.note ?? "Bulk recharge",
        _by: context.userId,
      } as never);
      if (!err) credited++;
    }
    return { ok: true, credited, total: targets.length };
  });

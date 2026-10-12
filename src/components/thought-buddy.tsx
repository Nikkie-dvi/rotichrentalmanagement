import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { compareCollections, comparisonPeriod } from "@/lib/collection-comparison";

type Thought = {
  id: string; emoji: string; text: string; to: string; weight: number;
  cta?: string; // tap-here label for guidance thoughts
  remind?: { tenantId: string; name: string; amount: string; dueDate: string };
  guide?: boolean; // onboarding tip: shown first and longer
};

const DISMISS_KEY = "rms-buddy-off-until";
const FIRST_DELAY = 20_000;
const SHOW_FOR = 8_000;

// Each day gets its own "mood" — some days the buddy is chatty, some days quiet.
function dayMood(): number {
  const day = new Date().toISOString().slice(0, 10);
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 0.5 + (h % 100) / 100; // 0.5 (quiet day) … 1.5 (active day)
}

// Urgent data (lots of overdue rent) shortens the gap; calm data stretches it.
function nextDelay(urgency: number): number {
  const base = urgency >= 8 ? 60_000 : urgency >= 4 ? 120_000 : urgency >= 1 ? 300_000 : 600_000;
  return (base / dayMood()) * (0.6 + Math.random() * 1.3);
}
const corners = [
  "bottom-24 left-5",
  "top-20 right-5",
  "top-20 left-5",
];

const VACANT_TIPS = [
  "Try sharing your tenant sign-up link with people looking for a house.",
  "Ask your current tenants if they know anyone looking — referrals fill units fast.",
  "Check the rent is in line with similar units nearby.",
  "A quick clean-up and fresh photos can help it rent faster.",
  "Put up a 'To let' sign with your phone number at the gate.",
];
const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
const first = (n: string) => (n || "Someone").split(" ")[0];

async function loadThoughts(): Promise<Thought[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: acct } = await supabase.from("landlord_accounts").select("created_at").eq("user_id", auth.user.id).maybeSingle();
  const { data: mgr } = acct ? { data: null } : await supabase.from("manager_accounts").select("created_at").eq("user_id", auth.user.id).maybeSingle();
  if (!acct && !mgr) return []; // tenants and others: no buddy
  const [{ data: inv }, { data: units }, { data: tickets }, { count: propCount }, { count: tenantCount }, { count: mgrCount }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id,tenant_id,due_date,balance_remaining,tenants(full_name,active)")
      .gt("balance_remaining", 0)
      .limit(200),
    supabase.from("units").select("id,unit_number,status,properties(name)").eq("status", "vacant").limit(50),
    supabase.from("maintenance_tickets").select("id,category,created_at,status").in("status", ["open", "in_progress", "pending"]).limit(50),
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase.from("tenants").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("property_managers").select("id", { count: "exact", head: true }),
  ]);
  const out: Thought[] = [];
  const unitTotal = (await supabase.from("units").select("id", { count: "exact", head: true })).count ?? 0;
  const period = comparisonPeriod();
  const { data: pays, error: comparisonError } = await supabase.from("payments").select("amount_paid, payment_date").gte("payment_date", period.start).lt("payment_date", period.end);
  const c = compareCollections(pays ?? []);
  if (!comparisonError && (c.currentCount || c.previousCount)) {
    out.push({ id: `stats-${c.cutoff}`, emoji: "📊", to: "/performance", weight: c.difference < 0 ? 2 : 1, cta: "Review portfolio",
      text: `By ${c.previousCutoff} you had collected ${money(c.previousCollected)}. So far this month: ${money(c.collected)}${c.difference < 0 ? ` — ${money(-c.difference)} behind the same date last month. Check outstanding rent.` : c.difference > 0 ? ` — ${money(c.difference)} ahead of the same date last month.` : " — matching the same date last month."}` });
  }
  const ageDays = daysSince(((acct ?? mgr) as any).created_at);
  const today = new Date().toISOString().slice(0, 10);
  for (const i of (inv ?? []) as any[]) {
    if (!i.tenants?.active || !i.due_date) continue;
    const name = first(i.tenants.full_name);
    const bal = money(Number(i.balance_remaining));
    if (i.due_date < today) {
      const d = daysSince(i.due_date);
      out.push({
        id: `late-${i.id}`,
        emoji: d > 7 ? "😬" : "🤔",
        text: `Psst… ${name} hasn't paid for ${d} day${d === 1 ? "" : "s"} (${bal}). Want me to send a reminder?`,
        to: "/tenants",
        remind: { tenantId: i.tenant_id, name: i.tenants.full_name, amount: bal, dueDate: i.due_date },
        weight: d > 7 ? 4 : 3, // overdue rent is the most urgent
      });
    } else {
      const d = -daysSince(i.due_date);
      if (d <= 3) out.push({ id: `soon-${i.id}`, emoji: "👀", text: `Heads up — ${name}'s rent (${bal}) is due ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}.`, to: "/tenants", weight: 2 });
    }
  }
  for (const u of (units ?? []) as any[]) {
    out.push({ id: `vac-${u.id}`, emoji: "🏠", text: `Unit ${u.unit_number}${u.properties?.name ? ` at ${u.properties.name}` : ""} is still empty. ${VACANT_TIPS[Math.floor(Math.random() * VACANT_TIPS.length)]}`, cta: "See vacant units", to: "/properties", weight: 1 });
  }
  for (const t of (tickets ?? []) as any[]) {
    const d = daysSince(t.created_at);
    if (d >= 2) out.push({ id: `tk-${t.id}`, emoji: "🔧", text: `That ${t.category} repair has been waiting ${d} days. Just saying…`, to: "/maintenance", weight: d >= 5 ? 2 : 1 });
  }
  return out;
}

export function ThoughtBuddy() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const notify = useServerFn(notifyMyTenants);
  const [sending, setSending] = useState(false);
  const { data: thoughts = [] } = useQuery({ queryKey: ["thought-buddy"], queryFn: loadThoughts, staleTime: 5 * 60_000 });
  const [current, setCurrent] = useState<Thought | null>(null);
  const [corner, setCorner] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!thoughts.length) return;
    const urgency = thoughts.reduce((s, t) => s + t.weight, 0);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const off = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() < off || document.hidden || document.body.dataset.tour === "on") return schedule(nextDelay(urgency));
        const guide = thoughts.find((t) => t.guide && !seen.current.has(t.id));
        let pool = guide ? [guide] : thoughts.filter((t) => !seen.current.has(t.id));
        if (!pool.length) {
          seen.current.clear();
          pool = thoughts;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        seen.current.add(pick.id);
        setCorner(Math.floor(Math.random() * corners.length));
        setLeaving(false);
        setCurrent(pick);
        timer = setTimeout(() => {
          setLeaving(true);
          timer = setTimeout(() => {
            setCurrent(null);
            schedule(nextDelay(urgency));
          }, 400);
        }, pick.guide || pick.remind ? SHOW_FOR * 2 : SHOW_FOR);
      }, delay);
    };
    schedule(thoughts.some((t) => t.guide) ? 4_000 : FIRST_DELAY);
    return () => clearTimeout(timer);
  }, [thoughts]);

  if (!current || path.startsWith("/tenant") || path.startsWith("/auth")) return null;
  const close = () => setLeaving(true);
  const sendReminder = async () => {
    const r = current.remind!;
    setSending(true);
    try {
      const due = new Date(`${r.dueDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
      const res: any = await notify({ data: {
        title: "Rent reminder",
        body: `Dear ${first(r.name)}, our records show your rent balance of ${r.amount}, due on ${due}, is still outstanding. Kindly settle it at your earliest convenience. View your account at homebasemanager.app/tenant/login using your phone number.`,
        sms: true, push: true, tenantIds: [r.tenantId],
      } });
      if (res?.smsSkippedNoCredit) toast.warning("Not enough SMS credit — only a phone alert was sent.");
      else toast.success(`Reminder sent to ${first(r.name)}`);
      close();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the reminder");
    } finally { setSending(false); }
  };

  return (
    <div
      role="status"
      className={`fixed z-50 flex max-w-[18rem] items-end gap-2 ${corners[corner]} ${leaving ? "thought-out" : "thought-in"}`}
    >
      <div className="thought-bob grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-xl shadow-lg" aria-hidden>
        {current.emoji}
      </div>
      <div className="relative rounded-2xl rounded-bl-sm border bg-card p-3 pr-7 text-sm text-card-foreground shadow-xl">
        <button
          className="text-left"
          onClick={() => {
            navigate({ to: current.to as any });
            close();
          }}
        >
          {current.text}
        </button>
        {current.remind && (
          <div className="mt-2 flex gap-2">
            <button disabled={sending} onClick={sendReminder} className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
              {sending ? "Sending…" : "Yes, send reminder"}
            </button>
            <button onClick={close} className="rounded-full border px-3 py-1 text-xs">Not now</button>
          </div>
        )}
        {current.cta && (
          <button onClick={() => { navigate({ to: current.to as any }); close(); }}
            className={`mt-2 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground ${current.guide ? "animate-pulse" : ""}`}>
            👆 {current.cta}
          </button>
        )}
        <button onClick={close} aria-label="Dismiss" className="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 3_600_000));
            close();
          }}
          className="mt-1 block text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Quiet for 3 hours
        </button>
      </div>
    </div>
  );
}

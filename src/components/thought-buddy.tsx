import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

type Thought = { id: string; emoji: string; text: string; to: string; weight: number };

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
  "bottom-5 right-5",
  "bottom-5 left-5 md:left-[calc(var(--sidebar-width,16rem)+1.25rem)]",
  "top-20 right-5",
  "top-20 left-5 md:left-[calc(var(--sidebar-width,16rem)+1.25rem)]",
];

const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
const first = (n: string) => (n || "Someone").split(" ")[0];

async function loadThoughts(): Promise<Thought[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const [{ data: inv }, { data: units }, { data: tickets }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id,due_date,balance_remaining,tenants(full_name,active)")
      .gt("balance_remaining", 0)
      .limit(200),
    supabase.from("units").select("id,unit_number,status,properties(name)").eq("status", "vacant").limit(50),
    supabase.from("maintenance_tickets").select("id,category,created_at,status").in("status", ["open", "in_progress", "pending"]).limit(50),
  ]);
  const out: Thought[] = [];
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
        text: `Psst… ${name} hasn't paid for ${d} day${d === 1 ? "" : "s"} (${bal}). Hope you remember!`,
        to: "/tenants",
      });
    } else {
      const d = -daysSince(i.due_date);
      if (d <= 3) out.push({ id: `soon-${i.id}`, emoji: "👀", text: `Heads up — ${name}'s rent (${bal}) is due ${d === 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}.`, to: "/tenants" });
    }
  }
  for (const u of (units ?? []) as any[]) {
    out.push({ id: `vac-${u.id}`, emoji: "🏠", text: `Unit ${u.unit_number}${u.properties?.name ? ` at ${u.properties.name}` : ""} is still empty… someone should live there!`, to: "/properties" });
  }
  for (const t of (tickets ?? []) as any[]) {
    const d = daysSince(t.created_at);
    if (d >= 2) out.push({ id: `tk-${t.id}`, emoji: "🔧", text: `That ${t.category} repair has been waiting ${d} days. Just saying…`, to: "/maintenance" });
  }
  return out;
}

export function ThoughtBuddy() {
  const navigate = useNavigate();
  const { data: thoughts = [] } = useQuery({ queryKey: ["thought-buddy"], queryFn: loadThoughts, staleTime: 5 * 60_000 });
  const [current, setCurrent] = useState<Thought | null>(null);
  const [corner, setCorner] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!thoughts.length) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        const off = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() < off || document.hidden) return schedule(60_000);
        let pool = thoughts.filter((t) => !seen.current.has(t.id));
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
            schedule(60_000 + Math.random() * 120_000);
          }, 400);
        }, SHOW_FOR);
      }, delay);
    };
    schedule(FIRST_DELAY);
    return () => clearTimeout(timer);
  }, [thoughts]);

  if (!current) return null;
  const close = () => setLeaving(true);

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

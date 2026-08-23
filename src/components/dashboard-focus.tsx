import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Target, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ModeTabs } from "@/components/mode-tabs";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

const TARGET_KEY = "rms.rent-target";

/** Tickets that still need the landlord's attention. */
const OPEN_STATUSES = ["open", "in_progress", "pending"];

function urgencyTone(urgency: string) {
  if (urgency === "high" || urgency === "urgent") return "bg-destructive/15 text-destructive";
  if (urgency === "medium") return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

/**
 * Two dashboard panels — rent collection progress and open maintenance —
 * behind an iPhone-camera style switcher, so the landlord flicks between
 * "am I collecting enough?" and "what needs fixing?".
 */
export function DashboardFocus({ collected }: { collected: number }) {
  const [mode, setMode] = useState<"collection" | "maintenance">("collection");
  const monthKey = new Date().toISOString().slice(0, 7);

  const billing = useQuery({
    queryKey: ["dashboard-month-billed", monthKey],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("total_due,balance_remaining")
        .eq("month_year", monthKey);
      const billed = (data ?? []).reduce((s, i: any) => s + Number(i.total_due || 0), 0);
      const outstanding = (data ?? []).reduce((s, i: any) => s + Number(i.balance_remaining || 0), 0);
      return { billed, outstanding, invoices: data?.length ?? 0 };
    },
  });

  const tickets = useQuery({
    queryKey: ["dashboard-open-tickets"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("maintenance_tickets")
        .select("id,category,urgency,status,description,created_at,tenants(full_name,units(unit_number))")
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  // The landlord can override the target; otherwise it's this month's billed rent.
  const [customTarget, setCustomTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(TARGET_KEY) : null;
    if (saved && Number(saved) > 0) setCustomTarget(Number(saved));
  }, []);

  const target = customTarget ?? billing.data?.billed ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  const shortfall = Math.max(0, target - collected);

  const saveTarget = () => {
    const n = Number(draft);
    if (!n || n <= 0) {
      window.localStorage.removeItem(TARGET_KEY);
      setCustomTarget(null);
    } else {
      window.localStorage.setItem(TARGET_KEY, String(n));
      setCustomTarget(n);
    }
    setEditing(false);
  };

  const openTickets = tickets.data ?? [];
  const byUrgency = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of openTickets) m.set(t.urgency, (m.get(t.urgency) ?? 0) + 1);
    return m;
  }, [openTickets]);

  const dir = mode === "maintenance" ? 1 : -1;

  return (
    <div className="space-y-3">
      <ModeTabs
        layoutId="dashboard-focus-pill"
        value={mode}
        onChange={(k) => setMode(k as typeof mode)}
        items={[
          { key: "collection", label: "Rent progress" },
          { key: "maintenance", label: `Issues${openTickets.length ? ` (${openTickets.length})` : ""}` },
        ]}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -40 }}
          transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.6 }}
        >
          {mode === "collection" ? (
            <Card className="glass-card glow-green">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4" />Rent collection this month
                </CardTitle>
                <CardDescription>
                  {customTarget ? "Your custom monthly target." : "Target is the total rent billed this month."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="text-2xl font-bold tracking-tight">{money(collected)}</div>
                    <div className="text-sm text-muted-foreground">of {money(target)}</div>
                  </div>
                  <Progress value={pct} className="mt-2 h-3" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">{pct}% collected</span>
                    <span className={shortfall > 0 ? "text-destructive" : "text-primary"}>
                      {shortfall > 0 ? `${money(shortfall)} still to collect` : "Target reached 🎉"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="floating-panel rounded-xl p-2 text-center">
                    <div className="text-[11px] uppercase text-muted-foreground">Invoices</div>
                    <div className="text-sm font-bold">{billing.data?.invoices ?? 0}</div>
                  </div>
                  <div className="floating-panel rounded-xl p-2 text-center">
                    <div className="text-[11px] uppercase text-muted-foreground">Billed</div>
                    <div className="text-sm font-bold">{money(billing.data?.billed ?? 0)}</div>
                  </div>
                  <div className="floating-panel rounded-xl p-2 text-center">
                    <div className="text-[11px] uppercase text-muted-foreground">Unpaid</div>
                    <div className="text-sm font-bold">{money(billing.data?.outstanding ?? 0)}</div>
                  </div>
                </div>

                {editing ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor="rent-target" className="text-xs">Monthly target (KES)</Label>
                      <Input
                        id="rent-target"
                        type="number"
                        inputMode="numeric"
                        value={draft}
                        placeholder="Leave empty to use billed rent"
                        onChange={(e) => setDraft(e.target.value)}
                        className="h-9 w-44"
                      />
                    </div>
                    <Button size="sm" onClick={saveTarget}><Check className="h-4 w-4" />Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft(customTarget ? String(customTarget) : "");
                      setEditing(true);
                    }}
                  >
                    {customTarget ? "Change target" : "Set my own target"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card glow-red">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4" />Open maintenance issues
                </CardTitle>
                <CardDescription>Reports from tenants that still need your attention.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {["high", "medium", "low"].map((u) => (
                    <div key={u} className={`rounded-xl p-2 text-center ${urgencyTone(u)}`}>
                      <div className="text-[11px] uppercase tracking-wide">{u}</div>
                      <div className="text-lg font-bold">{byUrgency.get(u) ?? 0}</div>
                    </div>
                  ))}
                </div>

                {tickets.isLoading ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
                ) : openTickets.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nothing open — every reported issue has been resolved.
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {openTickets.map((t: any) => (
                      <li key={t.id} className="floating-panel rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold capitalize">{String(t.category).replace("_", " ")}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.tenants?.full_name ?? "Tenant"} · Unit {t.tenants?.units?.unit_number ?? "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 capitalize ${urgencyTone(t.urgency)}`}>
                            {t.urgency}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Reported {new Date(t.created_at).toLocaleDateString()} · {String(t.status).replace("_", " ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to="/maintenance">
                    <AlertTriangle className="h-4 w-4" />Manage all issues
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

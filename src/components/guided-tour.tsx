import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, Hand, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Step = { key: string; title: string; what: string; tap: string; page: string; target: string };

const STEPS: Step[] = [
  { key: "property", title: "Add your first property", page: "/properties", target: "add-property",
    what: "A property is a building or plot you rent out — for example “Sunrise Apartments, Kaplong”. Everything else (units, tenants, rent) sits inside a property.",
    tap: "Tap the highlighted “Add Property” button, type the name and location, then save." },
  { key: "unit", title: "Add a unit", page: "/properties", target: "add-unit",
    what: "A unit is one room, house or shop inside your property that a tenant rents — like “A1” or “Shop 2”. Each unit has its own monthly rent.",
    tap: "Tap the highlighted “Add Unit” button, pick your property, enter the unit name and rent, then save." },
  { key: "tenant", title: "Add your first tenant", page: "/tenants", target: "add-tenant",
    what: "A tenant is the person living in a unit. Once added, the app bills them every month, tracks what they owe and texts them reminders.",
    tap: "Tap the highlighted button, choose the empty unit, enter their name and phone number, and save." },
  { key: "payment", title: "Record a rent payment", page: "/", target: "assistant",
    what: "When a tenant pays, record it so their balance stays correct. The quickest way: copy the M-Pesa message and paste it to the rent assistant.",
    tap: "Tap the highlighted assistant button in the corner, paste the M-Pesa message, then confirm." },
  { key: "managers", title: "Get help from a property manager (optional)", page: "/settings/managers", target: "add-manager",
    what: "A property manager can record payments and handle tenants for you. You stay in control and can switch their permissions on or off.",
    tap: "Add a manager here whenever you're ready — or tap “Finish tour”." },
];

export function GuidedTour() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [hidden, setHidden] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["guided-tour"],
    refetchInterval: 6000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      if (localStorage.getItem(`rms-tour-done:${auth.user.id}`)) return null;
      const { data: acct } = await supabase.from("landlord_accounts").select("created_at").eq("user_id", auth.user.id).maybeSingle();
      if (!acct || Date.now() - new Date(acct.created_at).getTime() > 30 * 86_400_000) return null;
      const c = async (t: "properties" | "units" | "tenants" | "payments" | "property_managers") =>
        (await supabase.from(t).select("id", { count: "exact", head: true })).count ?? 0;
      const [p, u, t, pay, m] = await Promise.all([c("properties"), c("units"), c("tenants"), c("payments"), c("property_managers")]);
      const done = [p > 0, u > 0, t > 0, pay > 0, m > 0];
      const idx = done.findIndex((d) => !d);
      return { uid: auth.user.id, idx };
    },
  });

  const step = data && data.idx >= 0 ? STEPS[data.idx] : null;
  const onPage = step ? path === step.page : false;

  useEffect(() => {
    document.body.dataset.tour = step && !hidden ? "on" : "";
    if (!step || hidden) return;
    const tick = () => {
      setDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]'));
      const el = onPage ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    tick();
    const iv = setInterval(tick, 400);
    return () => clearInterval(iv);
  }, [step, onPage, hidden]);

  if (!data || !step || hidden || path.startsWith("/tenant") || path.startsWith("/auth")) return null;
  const finish = () => { localStorage.setItem(`rms-tour-done:${data.uid}`, "1"); setHidden(true); };
  if (dialogOpen) return null; // let them fill the form

  return (
    <>
      {rect && (
        <div className="pointer-events-none fixed z-[60]" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}>
           <div className="guide-focus absolute inset-0" />
           <div className={`guide-pointer absolute ${rect.top > 110 ? "bottom-full mb-3" : "top-full mt-3"} right-0 flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg`}>
             <Hand className="h-5 w-5" /> Tap here
          </div>
        </div>
      )}
      <div className="thought-in fixed bottom-24 left-4 z-[61] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-primary/40 bg-card p-4 text-card-foreground shadow-2xl md:left-[calc(var(--sidebar-width,16rem)+1rem)]">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Step {data.idx + 1} of {STEPS.length}</span>
           <Button size="icon-sm" variant="ghost" onClick={() => setHidden(true)} aria-label="Hide guide for now"><X className="h-4 w-4" /></Button>
        </div>
        <div className="mb-2 flex gap-1">
          {STEPS.map((s, i) => <span key={s.key} className={`h-1.5 flex-1 rounded-full ${i < data.idx ? "bg-primary" : i === data.idx ? "bg-primary/60" : "bg-muted"}`} />)}
        </div>
        <h3 className="font-semibold">{step.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{step.what}</p>
        <p className="mt-2 text-sm font-medium">{onPage ? step.tap : "First, let's go to the right page."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
           {!onPage && <Button size="sm" onClick={() => navigate({ to: step.page as any })}><ArrowRight className="h-4 w-4" /> Take me there</Button>}
          {step.key === "managers" && <Button size="sm" variant="outline" onClick={finish}>Finish tour</Button>}
          <Button size="sm" variant="ghost" onClick={finish}>Skip tour</Button>
        </div>
      </div>
    </>
  );
}

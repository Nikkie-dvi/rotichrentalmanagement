import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ArrowLeft, ChevronRight, FileSignature, Loader2, LogOut, MessageSquareText, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccountBillingSettings } from "@/components/account-billing-settings";
import { AccountLeaseTemplate } from "@/components/account-lease-template";
import { ReminderTrackerPanel } from "@/components/reminder-tracker-panel";
import { supabase } from "@/integrations/supabase/client";

const settings = [
  { id: "automatic-invoicing", title: "Automatic invoicing", note: "Due-day invoices & prepaid rent", icon: ReceiptText },
  { id: "late-fees", title: "Late fees", note: "Grace period, penalties & alerts", icon: AlarmClock },
  { id: "lease-template", title: "Lease template", note: "Agreement wording & lease copy", icon: FileSignature },
  { id: "automatic-texting", title: "Automatic texting", note: "Reminder days, messages & delivery", icon: MessageSquareText },
] as const;
type Setting = typeof settings[number]["id"];

export function AccountControls({ manager = false }: { manager?: boolean }) {
  const [active, setActive] = useState<Setting | null>(null);
  useEffect(() => {
    const readHash = () => {
      const id = window.location.hash.slice(1);
      const match = settings.find(item => item.id === id);
      setActive(match?.id ?? null);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    return () => { window.removeEventListener("hashchange", readHash); window.removeEventListener("popstate", readHash); };
  }, []);
  const open = (id: Setting | null) => {
    setActive(id);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${id ? `#${id}` : ""}`);
  };
  const selected = settings.find(item => item.id === active);
  return <section id="account-settings" className="scroll-mt-20 space-y-4">
    <h2 className="text-lg font-semibold">Rental settings</h2>
    <div className="divide-y rounded-lg border bg-card shadow-sm">
      {settings.filter(item => !manager || item.id === "automatic-invoicing" || item.id === "automatic-texting").map(item => <Button key={item.id} variant="ghost" className={`h-auto w-full justify-start gap-3 rounded-none px-4 py-4 text-left ${active === item.id ? "bg-accent" : ""}`} onClick={() => open(active === item.id ? null : item.id)} aria-expanded={active === item.id} aria-controls="account-setting-content">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary"><item.icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1 whitespace-normal"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{item.note}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>)}
    </div>
    {selected && (!manager || active === "automatic-invoicing" || active === "automatic-texting") && <div id="account-setting-content" className="min-w-0 space-y-4">
      <div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label="Close rental settings" onClick={() => open(null)}><ArrowLeft /></Button><h3 className="text-base font-semibold">{selected.title}</h3></div>
      {active === "automatic-invoicing" && <AccountBillingSettings key={active} section="invoicing" />}
      {active === "late-fees" && <AccountBillingSettings key={active} section="fees" />}
      {active === "lease-template" && <AccountLeaseTemplate />}
      {active === "automatic-texting" && <><AccountBillingSettings key={active} section="texting" /><ReminderTrackerPanel /></>}
    </div>}
  </section>;
}

export function AccountLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await qc.cancelQueries();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      qc.clear();
      await navigate({ to: "/auth", replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not log out"); }
    finally { setBusy(false); }
  };
  return <Button variant="outline" className="h-12 w-full justify-start gap-3 border-destructive/25 text-destructive hover:text-destructive" onClick={logout} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Log out</Button>;
}
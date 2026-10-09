import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/types";

export function VacancyNotices() {
  const send = useServerFn(notifyMyTenants);
  const [unitId, setUnitId] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["vacancy-notices"], queryFn: async () => {
    const [units, tenants] = await Promise.all([
      supabase.from("units").select("id,unit_number,property_id,rent_amount,properties(name)").eq("status", "vacant"),
      supabase.from("tenants").select("id,units(property_id)").eq("active", true),
    ]);
    if (units.error) throw units.error; if (tenants.error) throw tenants.error;
    return { units: units.data ?? [], tenants: tenants.data ?? [] };
  } });
  const unit = q.data?.units.find(u => u.id === unitId);
  const count = unit ? q.data?.tenants.filter(t => t.units?.property_id === unit.property_id).length ?? 0 : 0;
  const choose = (id: string) => {
    setUnitId(id); setConfirming(false);
    const u = q.data?.units.find(v => v.id === id);
    setMessage(u ? `Dear tenant, unit ${u.unit_number} at ${u.properties?.name ?? "your property"} is now available at ${money(Number(u.rent_amount))} per month. If you are interested or know someone looking, please contact your landlord to arrange a viewing.` : "");
  };
  const submit = async () => {
    if (!unit || !message.trim()) return;
    setBusy(true);
    try {
      // Recheck that it is still vacant before sending; never broaden this property audience.
      const { data: current, error } = await supabase.from("units").select("status,property_id").eq("id", unit.id).single();
      if (error || current?.status !== "vacant" || current.property_id !== unit.property_id) throw new Error("This vacancy has changed. Refresh before sending.");
      const r = await send({ data: { title: "Available unit", body: message.trim(), propertyId: unit.property_id, sms: true, push: true, url: "/tenant/dashboard" } });
      toast.success(`${r.smsSent} texts and ${r.sent} phone alerts sent to tenants in this property.`);
      if (r.smsFailed || r.smsSkippedNoCredit || r.pushFailed) toast.warning(`${r.smsFailed} texts failed; ${r.smsSkippedNoCredit} skipped due to SMS credit.${r.pushFailed ? " Phone alerts were unavailable." : ""}`);
      setConfirming(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send the notice"); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t pt-5">
    <h3 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="h-5 w-5 text-primary" /> Notify tenants about a vacant unit</h3>
    {q.isError ? <p className="text-sm text-destructive">Vacancies could not be loaded.</p> : !q.isPending && !q.data?.units.length ? <p className="text-sm text-muted-foreground">No vacant units right now.</p> : <>
      <Select value={unitId} onValueChange={choose}><SelectTrigger><SelectValue placeholder="Choose a vacant unit" /></SelectTrigger><SelectContent>
        {q.data?.units.map(u => <SelectItem key={u.id} value={u.id}>{u.properties?.name} · {u.unit_number}</SelectItem>)}
      </SelectContent></Select>
      {unit && <><p className="text-sm text-muted-foreground">Only {count} active tenant{count === 1 ? "" : "s"} at {unit.properties?.name} will receive this notice. Texts use your SMS credit.</p>
        <Textarea aria-label="Vacancy message" value={message} maxLength={400} onChange={e => { setMessage(e.target.value); setConfirming(false); }} rows={3} />
        {confirming ? <div className="flex flex-wrap items-center gap-2"><p className="w-full text-sm font-medium">Send this notice to this property's tenants?</p><Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm and send</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button></div> : <Button disabled={!count || !message.trim()} onClick={() => setConfirming(true)}><Send className="h-4 w-4" /> Review notice</Button>}
      </>}
    </>}
  </section>;
}
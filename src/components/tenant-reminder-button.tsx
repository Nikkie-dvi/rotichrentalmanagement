import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { notifyMyTenants } from "@/lib/notify-tenants.functions";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export function TenantReminderButton({ tenantId, name, balance }: { tenantId: string; name: string; balance: number }) {
  const send = useServerFn(notifyMyTenants);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const body = `Dear ${name}, your rent account has an outstanding balance of ${money(balance)}. Please arrange payment or contact your landlord if you have already paid. View your invoices and balance at homebasemanager.app/tenant/dashboard. Sign in with your phone number and the code sent by SMS.`;
  const submit = async () => {
    setBusy(true);
    try {
      const result = await send({ data: { title: "Rent balance reminder", body, tenantIds: [tenantId], sms: true, push: true, url: "/tenant/dashboard" } });
      if (result.smsSent || result.sent) toast.success(`${result.smsSent} text and ${result.sent} phone alert sent`);
      else toast.warning("No reminder delivered. Check SMS credit and the tenant's phone number.");
      if (result.smsFailed || result.smsSkippedNoCredit || result.pushFailed) toast.warning("Some alerts were not delivered. Check recent alerts in SMS Tenants.");
      setOpen(false);
    } catch { toast.error("Could not send the reminder. Please try again."); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
    <Button size="sm" variant="outline" className="min-w-0 flex-1" onClick={() => setOpen(true)}><BellRing className="h-4 w-4 shrink-0" /> Send reminder</Button>
    <DialogContent><DialogHeader><DialogTitle>Remind {name}</DialogTitle><DialogDescription>Sends a text and an app alert where available.</DialogDescription></DialogHeader>
      <p className="text-sm leading-relaxed break-words">{body}</p>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Confirm and send</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
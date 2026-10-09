import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function TenantInvoicesButton({ tenantId, name }: { tenantId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["tenant-card-invoices", tenantId], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.from("invoices").select("id,month_year,total_due,balance_remaining").eq("tenant_id", tenantId).order("month_year", { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button size="sm" variant="outline" className="min-w-0 flex-1" onClick={() => setOpen(true)}><FileText className="h-4 w-4 shrink-0" /> View invoices</Button>
    <DialogContent><DialogHeader><DialogTitle className="break-words">Invoices · {name}</DialogTitle></DialogHeader>
      <div className="max-h-96 overflow-y-auto">
        {query.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {query.isError && <p className="text-sm text-destructive">Could not load invoices.</p>}
        {query.data?.length === 0 && <p className="text-sm text-muted-foreground">No invoices recorded yet.</p>}
        {query.data?.map(invoice => <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b py-3"><div className="min-w-0"><p className="font-semibold">{invoice.month_year}</p><p className="text-xs text-muted-foreground">Total {money(Number(invoice.total_due))}</p></div><div className="text-right"><p className={Number(invoice.balance_remaining) > 0 ? "font-semibold text-arrears-foreground" : "font-semibold text-paid-ahead-foreground"}>{money(Number(invoice.balance_remaining))}</p><p className="text-xs text-muted-foreground">{Number(invoice.balance_remaining) > 0 ? "Remaining" : "Settled"}</p></div></div>)}
      </div>
    </DialogContent>
  </Dialog>;
}
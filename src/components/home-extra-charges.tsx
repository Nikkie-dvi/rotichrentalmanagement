import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ReceiptText, Droplets, Zap, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceExtrasDialog } from "@/components/invoice-extras-dialog";

export function HomeExtraCharges() {
  const [choosing, setChoosing] = useState(false);
  const [invoice, setInvoice] = useState<unknown>(null);
  const { data: invoices, isPending } = useQuery({
    queryKey: ["home-charge-invoices"],
    enabled: choosing,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("*,tenants(full_name,units(unit_number))")
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return <section>
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Extra charges</h2><Button asChild variant="link" className="h-auto p-0 text-xs"><Link to="/billing">View bills</Link></Button></div>
    <div className="grid grid-cols-4 gap-2 sm:gap-4">{[
      { label: "Add charges", icon: ReceiptText, tone: "text-primary" },
      { label: "Water", icon: Droplets, tone: "text-primary" },
      { label: "Electricity", icon: Zap, tone: "text-warning" },
      { label: "Service fees", icon: Shield, tone: "text-success" },
    ].map(item => <Button key={item.label} variant="secondary" onClick={() => setChoosing(true)} className="h-24 min-w-0 flex-col gap-2 whitespace-normal rounded-lg p-2 text-center text-[11px] sm:text-sm"><item.icon className={`!h-7 !w-7 ${item.tone}`} /><span>{item.label}</span></Button>)}</div>
    <Dialog open={choosing} onOpenChange={setChoosing}>
      <DialogContent className="max-h-[80svh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Choose a bill for extra charges</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {isPending && <p className="text-sm text-muted-foreground">Loading bills…</p>}
          {invoices?.map(row => <Button key={row.id} variant="outline" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => { setChoosing(false); setInvoice(row); }}>
            <ReceiptText /><span>{row.tenants?.full_name ?? "Tenant"}<span className="block text-xs text-muted-foreground">Unit {row.tenants?.units?.unit_number ?? "—"} · {row.month_year}</span></span>
          </Button>)}
          {!isPending && invoices?.length === 0 && <><p className="text-sm text-muted-foreground">No bills yet.</p><Button asChild><Link to="/billing" onClick={() => setChoosing(false)}>Create a bill</Link></Button></>}
        </div>
      </DialogContent>
    </Dialog>
    <InvoiceExtrasDialog invoice={invoice} onOpenChange={open => { if (!open) setInvoice(null); }} />
  </section>;
}
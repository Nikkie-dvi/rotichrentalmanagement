import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReceiptText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getAutoInvoicingFn, setAutoInvoicingFn } from "@/lib/invoicing.functions";

export function AutomaticInvoicing() {
  const qc = useQueryClient();
  const { data: auto, isLoading, isError } = useQuery({ queryKey: ["auto-invoicing"], queryFn: () => getAutoInvoicingFn() });
  const save = useMutation({
    mutationFn: (enabled: boolean) => setAutoInvoicingFn({ data: { enabled } }),
    onSuccess: (_result, enabled) => {
      qc.invalidateQueries({ queryKey: ["auto-invoicing"] });
      qc.invalidateQueries({ queryKey: ["billing-settings"] });
      toast.success(enabled ? "Automatic invoicing is on" : "Automatic invoicing is off");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/25 p-4">
    <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="h-4 w-4 shrink-0 text-primary" />Automatic invoicing</p><p className="mt-1 text-xs text-muted-foreground">Rent invoices on each tenant’s due day, with prepaid rent applied.</p></div>
    <Switch aria-label="Automatic invoicing" checked={auto?.enabled !== false} disabled={isLoading || isError || save.isPending} onCheckedChange={enabled => save.mutate(enabled)} />
  </div>;
}
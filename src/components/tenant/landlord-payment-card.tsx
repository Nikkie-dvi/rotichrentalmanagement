import { useQuery } from "@tanstack/react-query";
import { Copy, Info, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getMyLandlordInfo } from "@/lib/tenant.functions";
import { paymentMethodLabel } from "@/hooks/use-landlord-account";

/** Shows the payment instructions and notice the landlord set for their tenants. */
export function LandlordPaymentCard() {
  const { data } = useQuery({
    queryKey: ["tenant", "landlord-info"],
    queryFn: () => getMyLandlordInfo(),
    staleTime: 60_000,
  });

  if (!data || (!data.paymentNumber && !data.note)) return null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Card className="mb-4 glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" /> How to pay your rent
        </CardTitle>
        <CardDescription>{data.landlordName ? `From ${data.landlordName}` : "From your landlord"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {data.paymentNumber && (
          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{paymentMethodLabel(data.paymentMethod)}</div>
              <div className="truncate font-semibold tracking-wide">{data.paymentNumber}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => copy(data.paymentNumber!)}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
        )}
        {data.note && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="whitespace-pre-wrap">{data.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

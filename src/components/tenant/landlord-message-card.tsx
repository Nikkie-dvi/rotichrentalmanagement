import { useQuery } from "@tanstack/react-query";
import { Megaphone, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyLandlordInfo } from "@/lib/tenant.functions";

/**
 * Message the landlord wrote for their tenants. Pinned near the top of the
 * dashboard because it usually carries important instructions.
 */
export function LandlordMessageCard() {
  const { data } = useQuery({
    queryKey: ["tenant", "landlord-info"],
    queryFn: () => getMyLandlordInfo(),
    staleTime: 60_000,
  });

  if (!data?.note) return null;

  return (
    <Card className="mb-4 glass-card glow-amber border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/25">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-full bg-amber-500/15 p-2">
          <Megaphone className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Message from your landlord
          </div>
          <div className="text-sm text-muted-foreground">{data.landlordName ?? "Your landlord"}</div>
          <p className="mt-2 whitespace-pre-wrap text-base font-medium leading-relaxed">{data.note}</p>
          {data.landlordPhone && (
            <Button asChild size="sm" variant="outline" className="mt-3 glass-btn">
              <a href={`tel:${data.landlordPhone}`}>
                <Phone className="mr-1 h-4 w-4" /> Call {data.landlordPhone}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

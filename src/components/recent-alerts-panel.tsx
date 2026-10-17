import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export function RecentAlertsPanel() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_logs")
        .select("id, channel, recipient, message, status, error, created_at, tenants(full_name)")
        .neq("channel", "push")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">Recent alerts</CardTitle>
        <CardDescription>Every SMS and app alert sent to your tenants.</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
        {!isLoading && (logs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No alerts sent yet.</p>}
        {(logs ?? []).map((l: any) => (
          <div key={l.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="uppercase">{l.channel}</Badge>
              <Badge
                className={
                  l.status === "delivered"
                    ? "bg-primary text-primary-foreground"
                    : l.status === "failed"
                      ? "bg-destructive text-destructive-foreground"
                      : ""
                }
                variant={l.status === "skipped" ? "secondary" : "default"}
              >
                {l.status}
              </Badge>
              <span className="font-medium">{l.tenants?.full_name ?? l.recipient ?? "—"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 break-words text-muted-foreground">{l.message}</p>
            {l.error && <p className="mt-1 text-xs text-destructive">{l.error}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

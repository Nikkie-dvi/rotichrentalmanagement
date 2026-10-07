import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Home, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listMyUnits, switchMyUnit } from "@/lib/tenant-otp.functions";

/** Shown only to tenants renting more than one unit with the same phone number. */
export function UnitSwitcher() {
  const qc = useQueryClient();
  const list = useServerFn(listMyUnits);
  const swap = useServerFn(switchMyUnit);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["tenant", "my-units"], queryFn: () => list(), staleTime: 60_000 });
  if (!data || data.units.length < 2) return null;

  const change = async (id: string) => {
    if (id === data.currentId) return;
    setBusy(true);
    try {
      const session = await swap({ data: { tenantId: id } });
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
      qc.clear();
      toast.success("Switched unit");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not switch unit");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Home className="h-4 w-4 text-primary" />}
      <span className="text-xs text-muted-foreground">Viewing</span>
      <Select value={data.currentId ?? undefined} onValueChange={change} disabled={busy}>
        <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          {data.units.map((u) => <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

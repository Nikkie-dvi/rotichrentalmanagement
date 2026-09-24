import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

type ManagerAcct = {
  user_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  property_count: number;
  rate_per_property: number;
  monthly_fee: number | null;
  paid_until: string | null;
  trial_ends_at: string;
};

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function Row({ m }: { m: ManagerAcct }) {
  const qc = useQueryClient();
  const [months, setMonths] = useState("1");
  const [busy, setBusy] = useState(false);
  const fee = Number(m.monthly_fee ?? m.property_count * Number(m.rate_per_property));
  const paidUntil = m.paid_until ? new Date(m.paid_until) : null;
  const today = new Date();
  const active = (paidUntil && paidUntil >= today) || new Date(m.trial_ends_at) >= today;

  const record = async () => {
    const n = Math.max(1, Math.min(24, Number(months) || 1));
    setBusy(true);
    const start = paidUntil && paidUntil > today ? paidUntil : today;
    const { error } = await (supabase as any)
      .from("manager_accounts")
      .update({ paid_until: addMonths(start, n) })
      .eq("user_id", m.user_id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Recorded ${money(fee * n)} for ${m.full_name}`);
    qc.invalidateQueries({ queryKey: ["admin-manager-accounts"] });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          {m.full_name}
          <Badge variant={active ? "secondary" : "outline"}>{active ? "Active" : "Unpaid"}</Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {m.property_count} properties · {money(fee)}/month · {m.phone ?? m.email}
        </div>
        <div className="text-xs text-muted-foreground">
          Paid until: {m.paid_until ?? "—"} · Trial ends {m.trial_ends_at.slice(0, 10)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input className="w-16" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} aria-label="Months paid" />
        <Button size="sm" onClick={record} disabled={busy}>Record payment</Button>
      </div>
    </div>
  );
}

export function ManagerFeesAdmin() {
  const { data } = useQuery({
    queryKey: ["admin-manager-accounts"],
    queryFn: async (): Promise<ManagerAcct[]> => {
      const { data, error } = await (supabase as any).from("manager_accounts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Property manager fees</CardTitle>
        <CardDescription>KES 250 per property each month. Record payments to extend their access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No property managers have signed up yet.</p>}
        {(data ?? []).map((m) => <Row key={m.user_id} m={m} />)}
      </CardContent>
    </Card>
  );
}

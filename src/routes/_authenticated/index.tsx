import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Users, DollarSign, AlertCircle, Plus, Gauge, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rotich rental management new" },
      { name: "description", content: "Overview of your rental portfolio: units, occupancy, collections and arrears." },
      { property: "og:title", content: "Rotich rental management new" },
      { property: "og:description", content: "Overview of your rental portfolio: units, occupancy, collections and arrears." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("invoices").select("balance_remaining,total_due"),
        supabase.from("payments").select("amount_paid,payment_date"),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const occupancy = totalUnits ? Math.round((occupied / totalUnits) * 100) : 0;
      const collected =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      const arrears = invoices?.reduce((s: number, i: any) => s + Number(i.balance_remaining), 0) ?? 0;
      return { totalUnits, occupied, occupancy, collected, arrears };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id,amount_paid,payment_method,reference_no,payment_date,tenant_id,tenants(full_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const kpis = [
    { label: "Total Units", value: stats?.totalUnits ?? 0, icon: Building2, tone: "bg-secondary" },
    { label: "Occupancy Rate", value: `${stats?.occupancy ?? 0}%`, sub: `${stats?.occupied ?? 0} occupied`, icon: Users, tone: "bg-accent" },
    { label: "Collected (This Month)", value: money(stats?.collected ?? 0), icon: DollarSign, tone: "bg-primary/10 text-primary" },
    { label: "Outstanding Arrears", value: money(stats?.arrears ?? 0), icon: AlertCircle, tone: "bg-destructive/10 text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
              <div className={`flex h-8 w-8 items-center justify-center rounded-md ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tracking-tight">{k.value}</div>
              {k.sub && <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/payments"><Plus className="h-4 w-4" />Log Payment</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/meters"><Gauge className="h-4 w-4" />Add Meter Reading</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/billing"><FileText className="h-4 w-4" />Generate Monthly Bills</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.payment_date}</TableCell>
                  <TableCell className="font-medium">{p.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{p.payment_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.reference_no ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{money(Number(p.amount_paid))}</TableCell>
                </TableRow>
              ))}
              {(!recent || recent.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payments yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

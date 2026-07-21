import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { money } from "@/lib/types";

export function AppHeader() {
  const { theme, toggle } = useTheme();

  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const monthKey = new Date().toISOString().slice(0, 7);
      const [{ data: units }, { data: invoices }, { data: payments }] = await Promise.all([
        supabase.from("units").select("id,status"),
        supabase.from("invoices").select("balance_remaining,total_due,status,month_year"),
        supabase.from("payments").select("amount_paid,payment_date"),
      ]);
      const totalUnits = units?.length ?? 0;
      const occupied = units?.filter((u: any) => u.status === "occupied").length ?? 0;
      const collectedThisMonth =
        payments?.filter((p: any) => (p.payment_date ?? "").startsWith(monthKey)).reduce((s: number, p: any) => s + Number(p.amount_paid), 0) ?? 0;
      const arrears = invoices?.reduce((s: number, i: any) => s + Number(i.balance_remaining), 0) ?? 0;
      return { totalUnits, occupied, collectedThisMonth, arrears };
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div>
        <h1 className="text-base font-semibold leading-tight">Rental Dashboard</h1>
        <p className="text-xs text-muted-foreground">Manage properties, tenants & payments</p>
      </div>
      <div className="ml-auto flex items-center gap-2 overflow-x-auto">
        <Badge variant="secondary" className="hidden sm:inline-flex">
          Units: <span className="ml-1 font-semibold">{summary?.totalUnits ?? 0}</span>
        </Badge>
        <Badge variant="secondary" className="hidden md:inline-flex">
          Occupied: <span className="ml-1 font-semibold">{summary?.occupied ?? 0}</span>
        </Badge>
        <Badge className="hidden md:inline-flex bg-primary text-primary-foreground">
          Collected: <span className="ml-1 font-semibold">{money(summary?.collectedThisMonth ?? 0)}</span>
        </Badge>
        <Badge variant="destructive" className="hidden lg:inline-flex">
          Arrears: <span className="ml-1 font-semibold">{money(summary?.arrears ?? 0)}</span>
        </Badge>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

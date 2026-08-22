import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, ShieldAlert, Loader2, CalendarClock, Wallet, ChevronDown, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmsRechargeAdmin } from "@/components/sms-recharge-admin";

import { SectionSwitcher, ADMIN_TABS } from "@/components/section-switcher";
import {
  useIsSuperAdmin,
  subscriptionState,
  MONTHLY_FEE,
  PAYMENT_NUMBER,
  PAYMENT_METHODS,
  type LandlordAccount,
} from "@/hooks/use-landlord-account";

export const Route = createFileRoute("/_authenticated/landlords")({
  head: () => ({
    meta: [
      { title: "Landlord accounts — Rotich Management Systems" },
      { name: "description", content: "Review, approve or decline landlord accounts and their monthly subscription." },
      { property: "og:title", content: "Landlord accounts — Rotich Management Systems" },
      { property: "og:description", content: "Review, approve or decline landlord accounts and their monthly subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandlordsPage,
});

function LandlordsPage() {
  const isSuper = useIsSuperAdmin();
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  type PayDraft = { amount: string; date: string; months: string; reference: string };
  const [payDrafts, setPayDrafts] = useState<Record<string, PayDraft>>({});

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["landlord-accounts-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landlord_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LandlordAccount[];
    },
  });

  const setStatus = async (row: LandlordAccount, status: "approved" | "declined" | "pending") => {
    setBusy(row.id);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
        declined_reason: status === "declined" ? (reasons[row.id] ?? null) : null,
      })
      .eq("id", row.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved" ? "Landlord approved" : status === "declined" ? "Landlord declined" : "Set back to pending",
    );
    qc.invalidateQueries({ queryKey: ["landlord-accounts-all"] });
    qc.invalidateQueries({ queryKey: ["landlord-account"] });
  };

  if (!isSuper) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" /> Main account only
          </CardTitle>
          <CardDescription>Only the main account can review landlord registrations.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (accounts ?? []).filter((a) =>
    !q
      ? true
      : [a.email, a.full_name, a.landlord_code, a.payment_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
  );
  const pending = visible.filter((a) => a.status === "pending");
  const approved = visible.filter((a) => a.status === "approved");
  const declined = visible.filter((a) => a.status === "declined");



  return (
    <div className="space-y-4">
      <SectionSwitcher items={ADMIN_TABS} />
      <div>
        <h1 className="text-2xl font-semibold">Landlord accounts</h1>
        <p className="text-sm text-muted-foreground">
          New landlords stay locked out until you confirm them. They are shown to send {money(MONTHLY_FEE)} monthly to{" "}
          {PAYMENT_NUMBER}.
        </p>
      </div>

      <SmsRechargeAdmin />



      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email, name or code"
              aria-label="Search landlord accounts"
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
                <TabsTrigger value="declined">Declined ({declined.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                <List rows={pending} />
              </TabsContent>
              <TabsContent value="approved" className="mt-4">
                <List rows={approved} />
              </TabsContent>
              <TabsContent value="declined" className="mt-4">
                <List rows={declined} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

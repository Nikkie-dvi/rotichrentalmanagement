import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wallet, Save, BellRing } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { PAYMENT_METHODS, useLandlordAccount } from "@/hooks/use-landlord-account";

export const Route = createFileRoute("/_authenticated/settings/payments")({
  head: () => ({
    meta: [
      { title: "Rent payment details — Eden Point Real Estate" },
      { name: "description", content: "Set how your tenants should pay rent." },
      { property: "og:title", content: "Rent payment details — Eden Point Real Estate" },
      { property: "og:description", content: "Payment number, method and notice shown in your tenants' app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentPaymentSettingsPage,
});

function RentPaymentSettingsPage() {
  const { data: account, isLoading } = useLandlordAccount();
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [method, setMethod] = useState("mpesa_send_money");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!account) return;
    setNumber((account as any).rent_payment_number ?? "");
    setMethod((account as any).rent_payment_method ?? "mpesa_send_money");
    setNote((account as any).rent_payment_note ?? "");
  }, [account]);

  const save = async () => {
    if (!account) return;
    setSaving(true);
    const { error } = await supabase
      .from("landlord_accounts")
      .update({
        rent_payment_number: number.trim() || null,
        rent_payment_method: method,
        rent_payment_note: note.trim() || null,
      } as any)
      .eq("id", account.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["landlord-account"] });

    toast.success("Payment details saved");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }


  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Rent payment details</h1>
        <p className="text-sm text-muted-foreground">
          This is shown to every one of your tenants inside their portal.
        </p>
      </div>

      <div className="space-y-4">
      <Card className="glass-card">

        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> How tenants pay you
          </CardTitle>
          <CardDescription>Update this any time — it reflects instantly in the tenant app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-method">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-number">Payment number (phone, till, paybill or account)</Label>
            <Input
              id="pay-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="e.g. 0706747498"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-note">Important note to tenants</Label>
            <Textarea
              id="pay-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Always use your unit number as the reference. Water bills are due on the 5th."
            />
          </div>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save details
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-medium"><BellRing className="h-4 w-4 text-primary" /> Texting your tenants?</p>
            <p className="text-sm text-muted-foreground">Messages, notices, receipts and automatic reminders all live in SMS Tenants.</p>
          </div>
          <Button asChild variant="outline"><Link to="/messages">Open SMS Tenants</Link></Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
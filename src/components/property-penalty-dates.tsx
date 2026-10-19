import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Apartment = { id: string; name: string; penalty_start_day: number | null };

function ApartmentDate({ apartment }: { apartment: Apartment }) {
  const qc = useQueryClient();
  const [custom, setCustom] = useState(apartment.penalty_start_day != null);
  const [day, setDay] = useState(String(apartment.penalty_start_day ?? 10));
  const [saving, setSaving] = useState(false);
  const dirty = (custom ? Number(day) : null) !== apartment.penalty_start_day;
  const save = async () => {
    const value = custom ? Number(day) : null;
    if (value != null && (!Number.isInteger(value) || value < 1 || value > 31)) {
      toast.error("Choose a day from 1 to 31"); return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("properties").update({ penalty_start_day: value }).eq("id", apartment.id).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Apartment date could not be saved");
      await qc.invalidateQueries({ queryKey: ["property-penalty-dates"] });
      toast.success(`${apartment.name} penalty date saved`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save penalty date"); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3 border-b py-4 last:border-b-0">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`custom-${apartment.id}`} className="min-w-0 break-words">{apartment.name}</Label>
      <Switch id={`custom-${apartment.id}`} aria-label={`Custom penalty date for ${apartment.name}`} checked={custom} onCheckedChange={setCustom} disabled={saving} />
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      {custom ? <div className="grid gap-1.5">
        <Label htmlFor={`day-${apartment.id}`} className="text-xs text-muted-foreground">Penalty starts on day</Label>
        <Input id={`day-${apartment.id}`} aria-label={`Penalty start day for ${apartment.name}`} className="w-24" type="number" min={1} max={31} step={1} value={day} onChange={(e) => setDay(e.target.value)} disabled={saving} />
      </div> : <span className="text-xs text-muted-foreground">Account due date + grace period</span>}
      <Button size="sm" variant="outline" disabled={saving || !dirty} onClick={save} aria-label={`Save penalty date for ${apartment.name}`}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save date
      </Button>
    </div>
  </div>;
}

export function PropertyPenaltyDates() {
  const { data, isPending, error } = useQuery({
    queryKey: ["property-penalty-dates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id, name, penalty_start_day").order("name");
      if (error) throw error;
      return data;
    },
  });
  return <section className="border-t pt-4">
    <h3 className="text-sm font-semibold">Apartment penalty dates</h3>
    <p className="mt-1 text-xs text-muted-foreground">Custom dates replace the grace period for that apartment. Dates on or before rent is due apply the following month; day 31 uses the last day in shorter months.</p>
    {isPending ? <Loader2 className="mt-3 h-4 w-4 animate-spin" /> : error ? <p className="mt-3 text-sm text-destructive">{error.message}</p> : !data?.length ? <p className="mt-3 text-sm text-muted-foreground">No apartments added yet.</p> : data.map((apartment) => <ApartmentDate key={`${apartment.id}-${apartment.penalty_start_day}`} apartment={apartment} />)}
  </section>;
}
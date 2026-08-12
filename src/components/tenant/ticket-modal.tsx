import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

type Props = {
  tenantId: string;
  ownerId: string;
};

const CATEGORIES = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "structural", label: "Structural" },
  { value: "security", label: "Security" },
  { value: "other", label: "Other" },
];

const URGENCIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function TicketModal({ tenantId, ownerId }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("plumbing");
  const [urgency, setUrgency] = useState("medium");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (description.trim().length < 5) throw new Error("Please describe the issue (min 5 chars)");
      if (description.trim().length > 1000) throw new Error("Description too long (max 1000)");

      let image_url: string | null = null;
      if (image) {
        if (image.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
        const ext = image.name.split(".").pop()?.toLowerCase() || "jpg";
        const key = `${tenantId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("maintenance-attachments")
          .upload(key, image, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        image_url = key;
      }

      const { error } = await supabase.from("maintenance_tickets").insert({
        tenant_id: tenantId,
        owner_id: ownerId,
        category,
        urgency,
        description: description.trim(),
        image_url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket submitted");
      qc.invalidateQueries({ queryKey: ["tenant", "tickets"] });
      setOpen(false);
      setDescription("");
      setImage(null);
      setCategory("plumbing");
      setUrgency("medium");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to submit"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full glass-btn glow-blue">
          <Wrench className="mr-2 h-4 w-4" /> Raise an issue / maintenance request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New maintenance request</DialogTitle>
          <DialogDescription>Tell us what needs fixing. Your landlord will be notified.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Urgency</Label>
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {URGENCIES.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1000} placeholder="e.g. Kitchen sink is leaking under the cabinet…" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="img">Photo (optional)</Label>
            <Input id="img" type="file" accept="image/*" capture="environment" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

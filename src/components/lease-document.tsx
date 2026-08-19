import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { fillLeaseText, resolveLeaseTemplate, type LeaseTemplate } from "@/lib/lease-template";

export type LeaseData = {
  full_name: string;
  phone_number?: string | null;
  email?: string | null;
  deposit_paid?: number | null;
  move_in_date?: string | null;
  rent_due_day?: number | null;
  lease_signature?: string | null;
  lease_signed_at?: string | null;
  unit_number?: string | null;
  rent_amount?: number | null;
  property_name?: string | null;
  property_location?: string | null;
};

const KES = (n: number | null | undefined) =>
  `KES ${Math.round(Number(n ?? 0)).toLocaleString()}`;

function SignatureView({ signature, name }: { signature?: string | null; name: string }) {
  if (!signature) {
    return <p className="text-sm text-muted-foreground">No signature on file.</p>;
  }
  if (signature.startsWith("data:image")) {
    return (
      <img
        src={signature}
        alt={`Digital signature of ${name}`}
        className="max-h-32 w-full rounded-md border bg-white object-contain p-2"
      />
    );
  }
  return (
    <div className="rounded-md border bg-white p-3 font-serif text-2xl italic text-black">{signature}</div>
  );
}

/** Full, printable lease agreement with the tenant's details and signature. */
export function LeaseDocument({
  lease,
  template,
}: {
  lease: LeaseData;
  template?: LeaseTemplate | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tpl = template ?? resolveLeaseTemplate(null);
  const introText = fillLeaseText(tpl.intro, {
    landlord: tpl.landlordName,
    tenant: lease.full_name,
    unit: lease.unit_number ?? "—",
    property: lease.property_name ?? "—",
    rent: KES(lease.rent_amount),
  });

  const print = () => {
    const html = ref.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "noopener,width=800,height=900");
    if (!w) return;
    w.document.write(
      `<html><head><title>Lease Agreement — ${lease.full_name}</title>` +
        `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;line-height:1.6;color:#111}
         img{max-height:140px}ol{padding-left:20px}h1{font-size:18px}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="grid gap-3">
      <div ref={ref} className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 p-4 text-sm leading-relaxed">
        <h1 className="text-center font-semibold uppercase tracking-wide">Residential Lease Agreement</h1>
        <p className="mt-3 whitespace-pre-wrap">{introText}</p>

        <p className="mt-3 font-semibold">Tenant details</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Name: <b>{lease.full_name}</b></li>
          <li>Phone: {lease.phone_number || "—"}</li>
          <li>Email: {lease.email || "—"}</li>
          <li>Move-in date: {lease.move_in_date ? new Date(lease.move_in_date).toLocaleDateString() : "—"}</li>
          <li>Deposit paid: {KES(lease.deposit_paid)}</li>
        </ul>

        <p className="mt-3 font-semibold">Premises &amp; rent</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Property: {lease.property_name || "—"}{lease.property_location ? `, ${lease.property_location}` : ""}</li>
          <li>Unit: <b>{lease.unit_number || "—"}</b></li>
          <li>Monthly rent: <b>{KES(lease.rent_amount)}</b></li>
          <li>Rent due day: {lease.rent_due_day ?? "—"} of each calendar month</li>
        </ul>

        <p className="mt-3 font-semibold">Standard clauses</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {tpl.clauses.map((c, i) => (
            <li key={i}>
              {fillLeaseText(c, {
                landlord: tpl.landlordName,
                tenant: lease.full_name,
                unit: lease.unit_number ?? "—",
                property: lease.property_name ?? "—",
                rent: KES(lease.rent_amount),
              })}
            </li>
          ))}
        </ol>

        <p className="mt-3 whitespace-pre-wrap">{tpl.footer}</p>

        <p className="mt-4 font-semibold">Signed by the Tenant</p>
        <div className="mt-1">
          <SignatureView signature={lease.lease_signature} name={lease.full_name} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {lease.full_name}
          {lease.lease_signed_at ? ` · Signed ${new Date(lease.lease_signed_at).toLocaleString()}` : " · Not yet signed"}
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={print}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save PDF
        </Button>
      </div>
    </div>
  );
}

export function LeaseDialog({
  lease,
  template,
  open,
  onOpenChange,
}: {
  lease: LeaseData | null;
  template?: LeaseTemplate | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lease agreement — {lease?.full_name ?? ""}</DialogTitle>
          <DialogDescription>
            {lease?.unit_number ? `Unit ${lease.unit_number}` : "No unit"}
            {lease?.lease_signed_at ? ` · Signed ${new Date(lease.lease_signed_at).toLocaleString()}` : ""}
          </DialogDescription>
        </DialogHeader>
        {lease ? <LeaseDocument lease={lease} /> : null}
      </DialogContent>
    </Dialog>
  );
}

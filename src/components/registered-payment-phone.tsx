import { LockKeyhole, Smartphone } from "lucide-react";

export function RegisteredPaymentPhone({ phone }: { phone?: string | null }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/40 p-3">
    <Smartphone className="h-5 w-5 shrink-0 text-primary" />
    <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Registered account number</p><p className="break-words text-sm font-semibold">{phone || "No phone saved"}</p></div>
    <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Locked to account phone" />
  </div>;
}
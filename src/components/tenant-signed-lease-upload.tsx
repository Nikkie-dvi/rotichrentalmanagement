import { useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, FileCheck2, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landlord-side upload of a hard-copy lease the tenant already signed on paper.
 * Each tenant gets their own file; uploading marks that tenant as signed.
 */
export function TenantSignedLeaseUpload({
  tenantId,
  tenantName,
  path,
  name,
  uploadedAt,
  compact,
}: {
  tenantId: string;
  tenantName: string;
  path: string | null;
  name?: string | null;
  uploadedAt?: string | null;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leases"] });
    qc.invalidateQueries({ queryKey: ["tenants"] });
  };

  const upload = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) return toast.error("File must be under 15MB");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const key = `${uid}/tenants/${tenantId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("lease-documents")
        .upload(key, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw new Error(upErr.message);
      if (path) await supabase.storage.from("lease-documents").remove([path]);
      const { error } = await supabase
        .from("tenants")
        .update({
          signed_lease_path: key,
          signed_lease_name: file.name,
          signed_lease_uploaded_at: new Date().toISOString(),
        } as any)
        .eq("id", tenantId);
      if (error) throw new Error(error.message);
      toast.success(`${tenantName} is now marked as signed`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async () => {
    if (!path) return;
    const { data } = await supabase.storage.from("lease-documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("Could not open the file");
  };

  const remove = async () => {
    if (!path) return;
    setBusy(true);
    try {
      await supabase.storage.from("lease-documents").remove([path]);
      const { error } = await supabase
        .from("tenants")
        .update({ signed_lease_path: null, signed_lease_name: null, signed_lease_uploaded_at: null } as any)
        .eq("id", tenantId);
      if (error) throw new Error(error.message);
      toast.success("Uploaded copy removed");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove the file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*"
        aria-label={`Choose signed lease file for ${tenantName}`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
       <Button size="sm" variant={path ? "outline" : "default"} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
         {path ? "Replace lease file" : "Choose lease file"}
      </Button>
      {path && (
        <>
          <Button size="sm" variant="outline" onClick={openFile}>
            <ExternalLink className="mr-2 h-4 w-4" /> View
          </Button>
           <Button size="sm" variant="ghost" disabled={busy} onClick={remove} aria-label={`Remove uploaded lease for ${tenantName}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
      {path && !compact && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileCheck2 className="h-3 w-3" />
          {name ?? "Signed copy"}
          {uploadedAt ? ` · ${new Date(uploadedAt).toLocaleDateString()}` : ""}
        </span>
      )}
    </div>
  );
}

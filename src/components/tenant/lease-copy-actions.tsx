import { useState } from "react";
import { toast } from "sonner";
import { Download, Printer, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Open / download / print actions for the landlord's uploaded lease copy.
 * The file lives on a signed URL, so downloads and printing go through a
 * fetched blob (the `download` attribute is ignored cross-origin).
 */
export function LeaseCopyActions({ url, name }: { url: string; name?: string | null }) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const fetchBlob = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load the lease file");
    return await res.blob();
  };

  const download = async () => {
    setBusy("download");
    try {
      const blob = await fetchBlob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name || "lease-agreement.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    setBusy("print");
    try {
      const blob = await fetchBlob();
      const href = URL.createObjectURL(blob);

      if (blob.type.startsWith("image/")) {
        const w = window.open("", "_blank", "noopener,width=800,height=900");
        if (!w) throw new Error("Allow pop-ups to print");
        w.document.write(
          `<html><head><title>${name || "Lease agreement"}</title></head>` +
            `<body style="margin:0"><img src="${href}" style="width:100%" onload="window.focus();window.print()"/></body></html>`,
        );
        w.document.close();
        setTimeout(() => URL.revokeObjectURL(href), 60_000);
        return;
      }

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.src = href;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(url, "_blank", "noopener");
        }
      };
      document.body.appendChild(frame);
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(href);
      }, 60_000);
    } catch (e: any) {
      toast.error(e?.message ?? "Printing failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button asChild variant="outline" size="sm" className="glass-btn glow-amber">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-1 h-4 w-4" /> Open uploaded lease copy
        </a>
      </Button>
      <Button variant="outline" size="sm" className="glass-btn" onClick={download} disabled={busy !== null}>
        {busy === "download" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
        Download
      </Button>
      <Button variant="outline" size="sm" className="glass-btn" onClick={print} disabled={busy !== null}>
        {busy === "print" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />}
        Print
      </Button>
    </>
  );
}

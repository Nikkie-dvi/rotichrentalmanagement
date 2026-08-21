import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageUp, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsSuperAdmin } from "@/hooks/use-landlord-account";
import { useAppLogo, DEFAULT_LOGO_URL } from "@/hooks/use-branding";
import { SectionSwitcher, ADMIN_TABS } from "@/components/section-switcher";

export const Route = createFileRoute("/_authenticated/settings/branding")({
  head: () => ({
    meta: [
      { title: "App branding — Rotich Management Systems" },
      { name: "description", content: "Upload and switch the app logo used across the landlord and tenant apps." },
      { property: "og:title", content: "App branding — Rotich Management Systems" },
      { property: "og:description", content: "Upload and switch the app logo without editing code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BrandingPage,
});

/** Shrinks any picked image to a small square PNG so it loads fast everywhere. */
function toSquarePng(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a valid image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Image processing is not supported here"));
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function BrandingPage() {
  const isSuper = useIsSuperAdmin();
  const current = useAppLogo();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSuper) {
    return (
      <Card className="glass-card mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Main account only
          </CardTitle>
          <CardDescription>Only the main account can change the app logo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const saveLogo = async (dataUrl: string | null) => {
    setBusy(true);
    const { error } = await (supabase as any)
      .from("app_branding")
      .upsert({ id: "default", logo_url: dataUrl, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["app-branding"] });
    toast.success(dataUrl ? "Logo updated everywhere" : "Reverted to the original logo");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SectionSwitcher items={ADMIN_TABS} />
      <div>
        <h1 className="text-2xl font-semibold">App branding</h1>
        <p className="text-sm text-muted-foreground">
          Upload a logo and it appears in the sidebar, header and tenant app instantly — no code changes.
        </p>
      </div>

      <Card className="glass-card glow-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageUp className="h-4 w-4" /> App logo
          </CardTitle>
          <CardDescription>Square images work best. Anything you pick is trimmed to a square.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-center">
              <img
                src={current}
                alt="Current app logo"
                className="h-20 w-20 rounded-xl border object-cover shadow-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">In use now</p>
            </div>
            {preview && (
              <div className="text-center">
                <img src={preview} alt="New logo preview" className="h-20 w-20 rounded-xl border object-cover shadow-sm" />
                <p className="mt-1 text-xs text-muted-foreground">New</p>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                setPreview(await toSquarePng(file));
              } catch (err: any) {
                toast.error(err?.message ?? "Could not use that image");
              }
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="glass-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImageUp className="h-4 w-4" /> Choose image
            </Button>
            <Button disabled={!preview || busy} onClick={() => preview && saveLogo(preview)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Use this logo
            </Button>
            {current !== DEFAULT_LOGO_URL && (
              <Button variant="ghost" disabled={busy} onClick={() => saveLogo(null)}>
                <RotateCcw className="h-4 w-4" /> Reset to original
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Play, Trash2, Upload, Volume2, VolumeX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  addTone,
  deleteTone,
  getSelectedToneId,
  isSoundEnabled,
  listTones,
  previewTone,
  setSelectedToneId,
  setSoundEnabled,
  type ToneMeta,
} from "@/lib/notification-sounds";
import { notify, requestNotificationPermission } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Tones — Rotich Management Systems" },
      { name: "description", content: "Upload custom notification sounds from your phone for rent reminders and payment alerts." },
      { property: "og:title", content: "Notification Tones — Rotich Management Systems" },
      { property: "og:description", content: "Personalize your rental alerts with your own sounds." },
    ],
  }),
  component: NotificationTonesPage,
});

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function NotificationTonesPage() {
  const [tones, setTones] = useState<ToneMeta[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [enabled, setEnabledState] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushPerm, setPushPerm] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [pushBusy, setPushBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setTones(await listTones());
    setSelectedIdState(getSelectedToneId());
    setEnabledState(isSoundEnabled());
    setPushPerm(await pushStatus());
    setPushOn(await hasActiveSubscription());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function togglePush(v: boolean) {
    setPushBusy(true);
    try {
      if (v) {
        const res = await enablePush();
        if (!res.ok) {
          if (res.reason === "unsupported") toast.error("This browser doesn't support push notifications");
          else if (res.reason === "denied") toast.error("Notifications blocked — enable them in your browser settings");
          else toast.error("Couldn't enable push notifications");
        } else {
          toast.success("Background push notifications enabled");
        }
      } else {
        await disablePush();
        toast.success("Background push notifications disabled");
      }
    } catch (e: any) {
      toast.error(e?.message || "Push toggle failed");
    } finally {
      await refresh();
      setPushBusy(false);
    }
  }


  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/")) {
        toast.error(`${file.name} is not an audio file`);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is over 8 MB`);
        continue;
      }
      try {
        const meta = await addTone(file);
        if (!getSelectedToneId()) setSelectedToneId(meta.id);
        toast.success(`Added "${meta.name}"`);
      } catch {
        toast.error(`Couldn't save ${file.name}`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  }

  function choose(id: string) {
    setSelectedToneId(id);
    setSelectedIdState(id);
    toast.success("Notification tone updated");
  }

  async function remove(id: string) {
    await deleteTone(id);
    refresh();
  }

  async function testAlert() {
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      toast.error("Enable notifications first (bell icon in the header)");
      return;
    }
    notify({ title: "Test alert", body: "This is how new notifications will sound.", tag: "test-tone" });
  }

  function toggleEnabled(v: boolean) {
    setSoundEnabled(v);
    setEnabledState(v);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notification Tones</h1>
        <p className="text-sm text-muted-foreground">
          Upload sounds from your phone to play with rent reminders and payment alerts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4" /> Background notifications
          </CardTitle>
          <CardDescription>
            Get rent reminders in your phone's notification bar even when the app is closed.
            Install this app to your Home Screen first (iPhone: Share → Add to Home Screen).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="min-w-0">
              <Label htmlFor="push-toggle" className="cursor-pointer font-medium">
                Enable push notifications on this device
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {pushPerm === "unsupported"
                  ? "This browser doesn't support push notifications."
                  : pushPerm === "denied"
                  ? "Notifications are blocked. Enable them in your browser or phone settings."
                  : pushOn
                  ? "You're subscribed on this device. Daily rent reminders will arrive automatically."
                  : "Turn on to receive alerts when rent is due or overdue."}
              </p>
            </div>
            <Switch
              id="push-toggle"
              checked={pushOn}
              disabled={pushBusy || pushPerm === "unsupported" || !pushSupported()}
              onCheckedChange={togglePush}
            />
          </div>
        </CardContent>
      </Card>

      <Card>

        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> Add a tone
          </CardTitle>
          <CardDescription>
            Pick any audio file from your device (MP3, M4A, WAV, OGG). Tones are stored on this device only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Choose from device
            </Button>
            <Button variant="outline" onClick={testAlert}>
              <Bell className="mr-2 h-4 w-4" /> Test notification
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-2">
              {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <Label htmlFor="sound-toggle" className="cursor-pointer">
                Play sound with notifications
              </Label>
            </div>
            <Switch id="sound-toggle" checked={enabled} onCheckedChange={toggleEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your tones</CardTitle>
          <CardDescription>Tap a tone to set it as the active notification sound.</CardDescription>
        </CardHeader>
        <CardContent>
          {tones.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No tones yet — add one above.
            </div>
          ) : (
            <ul className="divide-y">
              {tones.map((t) => {
                const active = t.id === selectedId;
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <button
                      onClick={() => choose(t.id)}
                      className="flex-1 text-left"
                      aria-label={`Use ${t.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        {active && <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.type || "audio"} · {formatSize(t.size)}
                      </div>
                    </button>
                    <Button size="icon" variant="ghost" onClick={() => previewTone(t.id)} aria-label="Preview">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(t.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

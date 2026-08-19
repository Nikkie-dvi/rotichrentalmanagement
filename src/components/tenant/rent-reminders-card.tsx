import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { disablePush, enablePush, hasActiveSubscription, pushSupported } from "@/lib/push";

/**
 * Lets a tenant opt in to background rent reminders (Web Push) so alerts land
 * in the phone's notification tray a few days before rent is due.
 */
export function RentRemindersCard() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(pushSupported());
    hasActiveSubscription().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success("Rent reminders turned off");
      } else {
        const res = await enablePush();
        if (!res.ok) {
          toast.error(
            res.reason === "denied"
              ? "Notifications are blocked in your browser settings."
              : "Notifications aren't supported on this device/browser.",
          );
        } else {
          setEnabled(true);
          toast.success("Rent reminders enabled");
        }
      }
    } catch (e: any) {
      // Background push failed (blocked in preview iframe, SW timeout, etc.).
      // Fall back to the same on-device alerts the landlord app uses.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        setEnabled(true);
        toast.success("Reminders on for this device", {
          description: "Background delivery is unavailable here, so alerts show while the app is open.",
        });
      } else {
        toast.error(e?.message ?? "Could not update reminders");
      }
    } finally {
      setBusy(false);
    }
  };


  return (
    <Card className="mb-4 glass-card floating-panel glow-green border-2 border-emerald-500/60 bg-emerald-500/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-emerald-700 dark:text-emerald-300">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
            <BellRing className="h-4 w-4" />
          </span>
          Rent reminders
          <Badge className="ml-auto bg-emerald-600 text-white hover:bg-emerald-600">
            {enabled ? "On" : "Off"}
          </Badge>
        </CardTitle>
        <CardDescription className="text-foreground/80">
          Get a notification on this device 3 days before, on the due day, and when rent is overdue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser can't show background notifications. Install the app to your home screen and try again.
          </p>
        ) : (
          <Button
            onClick={toggle}
            disabled={busy}
            className="w-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 sm:w-auto"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enabled ? <BellOff className="mr-2 h-4 w-4" /> : <BellRing className="mr-2 h-4 w-4" />}
            {enabled ? "Turn off reminders" : "Enable rent reminders"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}


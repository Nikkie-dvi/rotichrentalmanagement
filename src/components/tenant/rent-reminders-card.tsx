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
      toast.error(e?.message ?? "Could not update reminders");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" /> Rent reminders
        </CardTitle>
        <CardDescription>
          Get a notification on this device 3 days before, on the due day, and when rent is overdue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This browser can't show background notifications. Install the app to your home screen and try again.
          </p>
        ) : (
          <Button variant={enabled ? "outline" : "default"} onClick={toggle} disabled={busy} className="w-full sm:w-auto">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : enabled ? <BellOff className="mr-2 h-4 w-4" /> : <BellRing className="mr-2 h-4 w-4" />}
            {enabled ? "Turn off reminders" : "Enable rent reminders"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

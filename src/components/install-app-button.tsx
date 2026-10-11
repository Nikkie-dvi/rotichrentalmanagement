import { useEffect, useState } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * "Install app" button for the header. On Android/Chrome it triggers the
 * native install prompt; on iPhone it shows Share → Add to Home Screen steps.
 * Hidden once the app is already installed.
 */
export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setDeferred(null);
        return;
      }
    }
    setHelpOpen(true);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label="Install app"
        title="Install app on this device"
      >
        <Download className="h-4 w-4" />
      </Button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install the app</DialogTitle>
            <DialogDescription>
              Add Rotich Management to your home screen so it opens like a normal app.
            </DialogDescription>
          </DialogHeader>
          {isIos() ? (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Tap the <strong>Share</strong> button in Safari (bottom of the screen).
              </li>
              <li className="flex items-start gap-2">
                <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li className="flex items-start gap-2">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Tap <strong>Add</strong> — the app icon appears on your home screen.
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Open this site in <strong>Chrome</strong>, then tap the <strong>⋮ menu</strong> (top right).
              </li>
              <li className="flex items-start gap-2">
                <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </li>
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Confirm — the app icon appears on your home screen and works offline.
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

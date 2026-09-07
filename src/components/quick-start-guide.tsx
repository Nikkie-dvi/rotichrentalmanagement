import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, HelpCircle, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type GuideStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function QuickStartGuide({
  audience,
  steps,
  compact = false,
}: {
  audience: "landlord" | "tenant";
  steps: GuideStep[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const key = `quick-start:${audience}:v1:${data.user.id}`;
      setStorageKey(key);
      if (localStorage.getItem(key) !== "done") setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [audience]);

  const close = () => {
    if (storageKey) localStorage.setItem(storageKey, "done");
    setOpen(false);
  };

  const current = steps[step];
  if (!current) return null;
  const Icon = current.icon;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        aria-label="Open quick guide"
        title="Quick guide"
      >
        <HelpCircle className="h-4 w-4" />
        {!compact && <span>Guide</span>}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
          else setOpen(true);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <DialogTitle>{current.title}</DialogTitle>
            <DialogDescription className="min-h-12 leading-relaxed">{current.description}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <span
                key={item.title}
                className={`h-1.5 rounded-full transition-all ${index === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>

          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between sm:space-x-0">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={close}>Skip</Button>
            )}
            {step < steps.length - 1 ? (
              <Button type="button" onClick={() => setStep((value) => value + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={close}>
                <Check className="h-4 w-4" /> Start using the app
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
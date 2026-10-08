import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TenantAiAssistant } from "@/components/tenant-ai-assistant";

const HINT_KEY = "rms-assistant-hint-seen";

/** Always-available corner assistant for landlords and managers. */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const { data: allowed } = useQuery({
    queryKey: ["assistant-dock-allowed"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const [{ data: a }, { data: m }] = await Promise.all([
        supabase.from("landlord_accounts").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
        supabase.from("manager_accounts").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
      ]);
      return !!(a || m);
    },
  });
  useEffect(() => {
    if (allowed && !localStorage.getItem(HINT_KEY)) {
      const t = setTimeout(() => setHint(true), 6000);
      return () => clearTimeout(t);
    }
  }, [allowed]);
  if (!allowed) return null;

  const toggle = () => { setOpen((o) => !o); setHint(false); localStorage.setItem(HINT_KEY, "1"); };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="thought-in w-[min(24rem,calc(100vw-2.5rem))] max-h-[75vh] overflow-y-auto rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-primary" /> Rent assistant</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy an M-Pesa message and paste it here, e.g. “Jane paid” + the message. I'll find the tenant, work out how many months it covers, and ask you before recording anything.
              </p>
            </div>
            <button onClick={toggle} aria-label="Close assistant" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <TenantAiAssistant bare />
        </div>
      )}
      {hint && !open && (
        <div className="thought-in max-w-[15rem] rounded-2xl rounded-br-sm border bg-card p-3 text-xs shadow-xl">
          💡 Got an M-Pesa message? Copy it and paste it to me — I'll record the payment after you confirm.
          <button onClick={() => { setHint(false); localStorage.setItem(HINT_KEY, "1"); }} className="ml-1 underline">OK</button>
        </div>
      )}
      <button data-tour="assistant" onClick={toggle} aria-label={open ? "Close rent assistant" : "Open rent assistant"}
        className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl ring-4 ring-primary/20 transition-transform hover:scale-105">
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </div>
  );
}

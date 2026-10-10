import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";

// A presentation preference only; notification authorization remains server-side.
export function useVacancyNoticesEnabled() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const key = `vacancy-notices-enabled:${user.id}`;
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try { setEnabled(localStorage.getItem(key) === "true"); }
    catch { setEnabled(false); }
  }, [key]);
  const update = (value: boolean) => {
    setEnabled(value);
    try { localStorage.setItem(key, String(value)); } catch { /* Remains usable for this visit. */ }
  };
  return [enabled, update] as const;
}
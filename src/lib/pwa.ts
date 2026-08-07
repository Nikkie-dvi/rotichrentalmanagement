// Recovers from stale cached HTML pointing at chunks removed by a newer deploy.
// Clears caches + service workers, then reloads once (guarded by sessionStorage).
export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  const KEY = "chunk-reload-at";

  const recover = async () => {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return; // avoid reload loops
    sessionStorage.setItem(KEY, String(Date.now()));
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) for (const reg of regs) await reg.unregister();
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const isChunkError = (msg: string) =>
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
      msg,
    );

  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
    if (isChunkError(msg)) void recover();
  });
  window.addEventListener("error", (e) => {
    if (isChunkError(String(e.message ?? ""))) void recover();
  });
}

// Guarded service worker registration. Only runs in production, at the top-level
// browser window (not inside Lovable preview iframes), and respects a ?sw=off
// kill switch.
export async function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";

  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");

  const shouldRefuse = !import.meta.env.PROD || inIframe || isPreview || killSwitch;

  if (shouldRefuse) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (reg.active?.scriptURL.includes("/sw.js")) await reg.unregister();
      }
    } catch {
      // ignore
    }
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch {
    // no-op
  }
}

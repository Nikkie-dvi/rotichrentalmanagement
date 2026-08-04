// Browser-side Web Push helpers: registers a dedicated push service worker,
// subscribes with the project's VAPID public key, and persists the
// subscription server-side so cron jobs can send background notifications.
import { savePushSubscription, deletePushSubscription } from "./push.functions";

// Public VAPID key — safe to embed in client code by design.
export const VAPID_PUBLIC_KEY =
  "BPiCaBeZVWLBN07-jzH6RQp6kbgl5pc1_8mgYgCEBg20aHbFtPAppv-V8Yt1v_E8Kr9g4daftvP6PqTfWmQI8tw";

const PUSH_SW_URL = "/push-sw.js";
const PUSH_SW_SCOPE = "/push-scope/";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function bufferToBase64Url(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  const reg =
    existing ?? (await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE }));

  // Wait for THIS registration to become active. Never use
  // navigator.serviceWorker.ready here: the page isn't in PUSH_SW_SCOPE, so
  // that promise never resolves and the button spins forever.
  if (reg.active) return reg;
  await withTimeout(
    new Promise<void>((resolve) => {
      const worker = reg.installing ?? reg.waiting;
      if (!worker) return resolve();
      const onChange = () => {
        if (worker.state === "activated" || worker.state === "redundant") {
          worker.removeEventListener("statechange", onChange);
          resolve();
        }
      };
      worker.addEventListener("statechange", onChange);
    }),
    10000,
    "Service worker activation",
  );
  return reg;
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };

  const perm = await withTimeout(Notification.requestPermission(), 60000, "Permission prompt");
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const reg = await ensureRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await withTimeout(
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }),
      20000,
      "Push subscribe",
    );
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = sub.endpoint || json.endpoint || "";
  const p256dh = json.keys?.p256dh || bufferToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth || bufferToBase64Url(sub.getKey("auth"));

  await savePushSubscription({
    data: {
      endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent.slice(0, 200),
    },
  });

  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await deletePushSubscription({ data: { endpoint: sub.endpoint } });
  } catch {}
  await sub.unsubscribe();
}

export async function pushStatus(): Promise<"granted" | "denied" | "default" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function hasActiveSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

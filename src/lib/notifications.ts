// Lightweight browser notifications helper + rent-due reminder scheduling.
// Uses the Web Notifications API (no push server). Falls back silently when
// unsupported or permission is denied.
import { playSelectedTone } from "./notification-sounds";

const LS_PERMISSION_ASKED = "bomahut.notif.asked";
const LS_REMINDED_PREFIX = "bomahut.reminded."; // + tenantId + ":" + YYYY-MM-DD

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  try {
    localStorage.setItem(LS_PERMISSION_ASKED, "1");
  } catch {}
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export function hasAskedPermission() {
  try {
    return localStorage.getItem(LS_PERMISSION_ASKED) === "1";
  } catch {
    return false;
  }
}

type NotifyOpts = {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
};

export function notify({ title, body, tag, icon = "/apple-touch-icon.png" }: NotifyOpts) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  // Play the user's chosen tone (if any) alongside the system notification.
  playSelectedTone();
  try {
    // Prefer the service worker registration when available so notifications
    // survive tab focus loss on Android/desktop.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && "showNotification" in reg) {
          reg.showNotification(title, { body, tag, icon, badge: icon });
        } else {
          new Notification(title, { body, tag, icon });
        }
      }).catch(() => {
        new Notification(title, { body, tag, icon });
      });
    } else {
      new Notification(title, { body, tag, icon });
    }
  } catch {}
}

export function markReminded(tenantId: string, dateKey: string) {
  try {
    localStorage.setItem(LS_REMINDED_PREFIX + tenantId + ":" + dateKey, "1");
  } catch {}
}

export function wasReminded(tenantId: string, dateKey: string) {
  try {
    return localStorage.getItem(LS_REMINDED_PREFIX + tenantId + ":" + dateKey) === "1";
  } catch {
    return false;
  }
}

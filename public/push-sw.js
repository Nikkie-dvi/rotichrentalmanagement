// Dedicated Web Push service worker for Eden Point Real Estate.
// Handles push events and notification clicks. Separate from the app-shell
// service worker so it never interferes with offline caching.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Eden Point Real Estate", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Payment reminder";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/apple-touch-icon.png",
    badge: payload.badge || "/apple-touch-icon.png",
    tag: payload.tag || "rms-reminder",
    renotify: true,
    vibrate: payload.vibrate || [200, 100, 200, 100, 300],
    requireInteraction: payload.requireInteraction ?? false,
    data: { url: payload.url || "/", ...payload.data },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) await client.navigate(targetUrl);
            return;
          }
        } catch {}
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

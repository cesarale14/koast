/* ============================================================================
 * THROWAWAY DE-RISKING SPIKE — Koast for Cleaners PWA + web-push proof.
 * NOT production. Lives only on the spike branch; delete with it.
 *
 * Root-scoped service worker. Served from /sw.js so its scope is "/" and it
 * controls /clean/* (the cleaner job page). Handles:
 *   - push            → show the notification
 *   - notificationclick → open the deep link to the job page
 * ==========================================================================*/

self.addEventListener("install", () => {
  // Activate immediately so the spike is testable without a reload dance.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Koast for Cleaners", body: "You have a job", url: "/" };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) {
    // non-JSON payload — keep defaults
  }
  const title = payload.title || "Koast for Cleaners";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/spike/icon-192.png",
      badge: "/icons/spike/icon-192.png",
      data: { url: payload.url || "/" },
      tag: "koast-cleaner-spike",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        // Focus an already-open job window if we have one.
        if ("focus" in client && client.url.indexOf(target) !== -1) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })()
  );
});

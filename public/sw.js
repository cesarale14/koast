/* ============================================================================
 * Koast service worker — root-scoped (served from /sw.js so its scope is "/"
 * and it controls /clean/*, the cleaner job portal).
 *
 * Productionized from the cleaner-PWA spike (TURN-S2-send). Handles:
 *   - push              → show the job notification
 *   - notificationclick → focus an open job window or open the deep link
 *
 * Icons reference the unified teal Koast mark (public/icon-192.png).
 * ==========================================================================*/

self.addEventListener("install", () => {
  // Activate immediately so a freshly-installed PWA receives push without a
  // manual reload cycle.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Koast", body: "You have a new job", url: "/" };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) {
    // Non-JSON payload — keep defaults.
  }
  const title = payload.title || "Koast";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
      tag: payload.tag || "koast-cleaning-job",
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
        // Focus an already-open job window if its URL matches the target.
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

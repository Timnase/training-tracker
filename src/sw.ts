/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Inject the precache manifest from vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// ─── Rest timer background notifications ─────────────────────────────────────
// The app posts SCHEDULE_NOTIFICATION when a timer starts and
// CANCEL_NOTIFICATION when it's stopped/skipped. This lets the SW fire a
// local notification even if the browser has throttled the page's timers.

let pendingNotification: ReturnType<typeof setTimeout> | null = null;

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type: string; delayMs?: number } | undefined;
  if (!data) return;

  if (data.type === 'SCHEDULE_NOTIFICATION' && typeof data.delayMs === 'number') {
    if (pendingNotification !== null) clearTimeout(pendingNotification);
    const delayMs = data.delayMs;
    // event.waitUntil keeps the SW alive for the full timer duration so the
    // browser cannot terminate it before the notification fires.
    event.waitUntil(
      new Promise<void>(resolve => {
        pendingNotification = setTimeout(async () => {
          pendingNotification = null;
          await self.registration.showNotification('Rest over! 💪', {
            body: 'Time to get back to it.',
            icon: '/training-tracker/icons/icon-192.png',
            badge: '/training-tracker/icons/icon-192.png',
            tag: 'rest-timer',
          });
          resolve();
        }, delayMs);
      }),
    );
  }

  if (data.type === 'CANCEL_NOTIFICATION') {
    if (pendingNotification !== null) { clearTimeout(pendingNotification); pendingNotification = null; }
  }
});

// Bring app to foreground when the notification is tapped
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const focused = clients.find(c => 'focus' in c);
      if (focused) return (focused as WindowClient).focus();
      return self.clients.openWindow('/training-tracker/');
    }),
  );
});

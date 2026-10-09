// CricketNow service worker placeholder.
// Previously served a third-party ad loader; replaced 2026-10-09.
// Unregister any previously installed worker and take no action.
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(self.registration.unregister().then(function () { return self.clients.claim(); }));
});

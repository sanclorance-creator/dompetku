// Self-clearing Service Worker: hanya menghapus cache milik DompetKu, lalu unregister dirinya sendiri
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.toLowerCase().startsWith('dompetku')).map((k) => caches.delete(k))
      ))
      .then(() => self.registration.unregister())
  );
});

const CACHE_NAME = "ff-companion-v1";

const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/images/FF Landing Pic.png",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

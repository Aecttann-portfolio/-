const CACHE_VERSION = "pizza-pwa-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=motion-1",
  "./scripts/app.js?v=motion-1",
  "./manifest.webmanifest?v=motion-1",
  "./assets/fonts/Figtree-Regular.ttf",
  "./assets/fonts/Figtree-SemiBold.ttf",
  "./assets/fonts/Figtree-ExtraBold.ttf",
  "./assets/images/banana_scale.png",
  "./assets/images/splash_pizza.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.origin === self.location.origin) {
    if (
      request.mode === "navigate" ||
      request.destination === "script" ||
      request.destination === "style" ||
      url.pathname.endsWith(".webmanifest")
    ) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(cacheFirst(request));
    }
    return;
  }

  if (url.origin === "https://oursongapp.com") {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_VERSION);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

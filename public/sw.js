// ホーム画面のアイコンから開けるようにするための最小限のservice worker
// (データをキャッシュせず、毎回サーバーから最新のものを取りに行く)
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

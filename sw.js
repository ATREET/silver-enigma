const CACHE = 'piano-v7';
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "chord.js",
  "mpc-logic.js",
  "mpc-presets.js",
  "mpc-synth.js",
  "mpc.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "samples/A0.mp3",
  "samples/A1.mp3",
  "samples/A2.mp3",
  "samples/A3.mp3",
  "samples/A4.mp3",
  "samples/A5.mp3",
  "samples/A6.mp3",
  "samples/A7.mp3",
  "samples/C1.mp3",
  "samples/C2.mp3",
  "samples/C3.mp3",
  "samples/C4.mp3",
  "samples/C5.mp3",
  "samples/C6.mp3",
  "samples/C7.mp3",
  "samples/C8.mp3",
  "samples/Ds1.mp3",
  "samples/Ds2.mp3",
  "samples/Ds3.mp3",
  "samples/Ds4.mp3",
  "samples/Ds5.mp3",
  "samples/Ds6.mp3",
  "samples/Ds7.mp3",
  "samples/Fs1.mp3",
  "samples/Fs2.mp3",
  "samples/Fs3.mp3",
  "samples/Fs4.mp3",
  "samples/Fs5.mp3",
  "samples/Fs6.mp3",
  "samples/Fs7.mp3"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 音色檔：快取優先；其他檔案：先用快取（秒開、可離線），同時背景更新
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const fromNet = () => fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  });
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    if (hit && url.pathname.includes('/samples/')) return hit;
    const net = fromNet().catch(() => hit || caches.match('./'));
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});

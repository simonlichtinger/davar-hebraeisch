const VERSION = "77bd733dc3a7c62c";
const PREFIX = 'davar-' + new URL(self.registration.scope).pathname.replace(/[^a-z0-9]/gi, '_') + '-';
const CACHE = PREFIX + VERSION;
const ASSETS = [{"url":"./app.js","integrity":"sha256-GVJ+/m9SRBdNJiUD2FE29/QVW2fFh6WxQwqy/ZvQSUY="},{"url":"./auth.js","integrity":"sha256-YH87POX/+ztW+aw3sPMc0Iqkk23C/ZZhC+5W1Td3hes="},{"url":"./daily-limit.js","integrity":"sha256-Eo5c+j16A0XpQ1wWSAfsjTlO8CI1HKFZ2wFjNhjkweI="},{"url":"./data/course.enc.json","integrity":"sha256-3afFm4b2Pmx5OTD8nFr9vXgHj0fVo6cvNE9336UHUgY="},{"url":"./fonts/OFL.txt","integrity":"sha256-m5/gKLW6dNIxZZobuvDtCbEedZ0cpqBwmZ4W0VFha0c="},{"url":"./fonts/hebrew.ttf","integrity":"sha256-qarMoLsHI0WZgrTZGviaCaiEV3L51s8UnYbecQf+y4o="},{"url":"./icons/icon-192.png","integrity":"sha256-H7WIbzju8xRdRajHOfxK8+rsI+ScGUj3JPT62qe9MLw="},{"url":"./icons/icon-512.png","integrity":"sha256-PYEOlOilUn9gqjNC1oh7wWHm5mAZ4PKm1A7QWOARn7g="},{"url":"./icons/icon.svg","integrity":"sha256-N1TFEKiKldApGB27Oc5PMjcgup4M+uqsXPO3slGXd60="},{"url":"./icons/maskable-512.png","integrity":"sha256-PYEOlOilUn9gqjNC1oh7wWHm5mAZ4PKm1A7QWOARn7g="},{"url":"./index.html","integrity":"sha256-lFBY/HyBWZtLmgL3Y/XRz/SyMM+5dOQrcoQ5q1wVTdk="},{"url":"./","integrity":"sha256-lFBY/HyBWZtLmgL3Y/XRz/SyMM+5dOQrcoQ5q1wVTdk="},{"url":"./manifest.webmanifest","integrity":"sha256-e/ZyuT/n6Q1B5jaBc5ojAt+lx/zyFqUYIS7FcN2mhvE="},{"url":"./pwa.js","integrity":"sha256-9h9WG1maOBAAh04QTCm2bb658tEToA/Z3AN0OdkGSPQ="},{"url":"./scheduler.js","integrity":"sha256-s2IS+VGuWe1OhxepeTZSvea58gPxmYZvG6TMRShrGJQ="},{"url":"./storage.js","integrity":"sha256-f1GegqNMAGTsj+gVg4WKVV4njXwv1RZeLPpoYgLWD9g="},{"url":"./styles.css","integrity":"sha256-vGMwCusKX1FO1iwUccX/wp2Zc4/imvh5o58ZE2BID88="},{"url":"./training.js","integrity":"sha256-ANysiXQ0mvi+2RtUj1mKRY6WuPWEL5wSq+CtYfhjxvo="},{"url":"./transliteration.js","integrity":"sha256-Gv2mHzdMcqqLBq1ReRgsMefy/qKsl5cdrS2pXAlzNLA="},{"url":"./welcome.js","integrity":"sha256-QYySsginGk+WCKPutyd4svmp9zHPsAKV5fK1qM4FWS4="},{"url":"./release.js","integrity":"sha256-wbQOU80Jmiq8LiMZERrOaeJZCuMbwyV4xUJRB4m6SYU="}];
const scope = new URL(self.registration.scope);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Integrity prevents a partially published release from mixing old and new files.
      await cache.addAll(ASSETS.map(asset => new Request(new URL(asset.url, scope), {
        cache: 'reload', integrity: asset.integrity,
      })));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const hits = await Promise.all(ASSETS.map(asset => cache.match(new URL(asset.url, scope).href)));
    event.ports[0]?.postMessage({ ready: hits.every(Boolean), version: VERSION });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // A cached release descriptor could incorrectly claim that an old app is current.
  if (url.pathname === new URL('./version.json', scope).pathname) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === 'navigate') return cache.match(new URL('./index.html', scope).href);
      throw error;
    }
  })());
});

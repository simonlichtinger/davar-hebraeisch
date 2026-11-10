const VERSION = "a6584f167e7a7227";
const PREFIX = 'davar-' + new URL(self.registration.scope).pathname.replace(/[^a-z0-9]/gi, '_') + '-';
const CACHE = PREFIX + VERSION;
const ASSETS = [{"url":"./app.js","integrity":"sha256-Le3+1zpRVu6vbBI1MejowcAlcKFGeKRAkIjgtF/xv5o="},{"url":"./auth.js","integrity":"sha256-JXvtsgWrr8m7KqU5Oca65ThVihOaQq87rxGy7NxFxBE="},{"url":"./daily-limit.js","integrity":"sha256-Eo5c+j16A0XpQ1wWSAfsjTlO8CI1HKFZ2wFjNhjkweI="},{"url":"./data/course.enc.json","integrity":"sha256-4ilNzVx2bwuCeOmUszGsIzCy2/R0eefVo9cJoxKfNlk="},{"url":"./fonts/OFL.txt","integrity":"sha256-m5/gKLW6dNIxZZobuvDtCbEedZ0cpqBwmZ4W0VFha0c="},{"url":"./fonts/hebrew.ttf","integrity":"sha256-qarMoLsHI0WZgrTZGviaCaiEV3L51s8UnYbecQf+y4o="},{"url":"./grammar.js","integrity":"sha256-cb37CEZRHyUkBDx3vODCfOldO7CLPw9w83ApB1xIIWc="},{"url":"./icons/icon-192.png","integrity":"sha256-H7WIbzju8xRdRajHOfxK8+rsI+ScGUj3JPT62qe9MLw="},{"url":"./icons/icon-512.png","integrity":"sha256-PYEOlOilUn9gqjNC1oh7wWHm5mAZ4PKm1A7QWOARn7g="},{"url":"./icons/icon.svg","integrity":"sha256-N1TFEKiKldApGB27Oc5PMjcgup4M+uqsXPO3slGXd60="},{"url":"./icons/maskable-512.png","integrity":"sha256-PYEOlOilUn9gqjNC1oh7wWHm5mAZ4PKm1A7QWOARn7g="},{"url":"./index.html","integrity":"sha256-lFBY/HyBWZtLmgL3Y/XRz/SyMM+5dOQrcoQ5q1wVTdk="},{"url":"./","integrity":"sha256-lFBY/HyBWZtLmgL3Y/XRz/SyMM+5dOQrcoQ5q1wVTdk="},{"url":"./lesson-scope.js","integrity":"sha256-rQ3AEW6UKEZxvZSzxmXfdBQeWd2elAiaWgEjpwEu6uc="},{"url":"./manifest.webmanifest","integrity":"sha256-e/ZyuT/n6Q1B5jaBc5ojAt+lx/zyFqUYIS7FcN2mhvE="},{"url":"./pwa.js","integrity":"sha256-9h9WG1maOBAAh04QTCm2bb658tEToA/Z3AN0OdkGSPQ="},{"url":"./scheduler.js","integrity":"sha256-DmtPCOKO+MAUKSDlWOk/Oh2WSSGh8lj1xcDRgRv9JD4="},{"url":"./storage.js","integrity":"sha256-us7Mre/6sKINnO2/TlXWVix7AGVCfMwTzUqUT2nLULE="},{"url":"./styles.css","integrity":"sha256-gpCJwn20Av1gQptm4wCJuTamx9dDFcGmNeGX2J21Nq0="},{"url":"./training.js","integrity":"sha256-ANysiXQ0mvi+2RtUj1mKRY6WuPWEL5wSq+CtYfhjxvo="},{"url":"./transliteration.js","integrity":"sha256-Gv2mHzdMcqqLBq1ReRgsMefy/qKsl5cdrS2pXAlzNLA="},{"url":"./welcome.js","integrity":"sha256-sT5Sg8HwVkwUquxDQ0DsVSY82IeS26SYnW6ixzTr/a8="},{"url":"./release.js","integrity":"sha256-kSca1xhTjd4MQ809RRFYQ3/toUog3Tt0ZJN84fuXipw="}];
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

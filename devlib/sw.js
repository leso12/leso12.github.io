const CACHE='devlib-mobile-v272';
const ASSETS=['./','./index.html','./app.js','./app.payload.txt','./guideline-history-addon.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.includes('/functions/v1/')||u.pathname.startsWith('/api/'))return;if(e.request.mode==='navigate'||/\/(app\.js|app\.payload\.txt|guideline-history-addon\.js|index\.html)$/.test(u.pathname)){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});

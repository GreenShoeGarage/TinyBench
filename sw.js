const CACHE='tinybench-1.0.0';
const FILES=['./','./index.html','./style.css','./engine.js','./dsp.js','./classifier.js','./export.js','./firmware.js','./serial.js','./acquisition.js','./app.js','./audio.js','./audio-worklet.js','./worker.js','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tinybench-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok&&FILES.some(f=>new URL(f,self.registration.scope).href===e.request.url)){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Promise.reject(new Error('Not cached')))));});

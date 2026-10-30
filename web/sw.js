// Cache names are scoped to this repository path, not the whole github.io origin.
const PREFIX='iobot-static:'+new URL(self.registration.scope).pathname+':';
const CACHE=PREFIX+'__VERSION__';
const SHELL=__SHELL__;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// Existing tabs finish using their current app version. The next visit activates
// the new worker; we do not force a reload in the middle of a passing period.
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const current=await caches.open(CACHE);
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE){
    const old=await caches.open(key);
    for(const request of await old.keys())if(new URL(request.url).pathname.startsWith(new URL('data/',self.registration.scope).pathname)&&!await current.match(request)){
      const saved=await old.match(request);if(saved)await current.put(request,saved);
    }
    await caches.delete(key);
  }
  await self.clients.claim();
})()));
async function checkedNetwork(request,cache){
  const response=await fetch(request);
  if(!response.ok)throw new Error('Network returned '+response.status);
  const data=await response.clone().json();
  if(!data||typeof data!=='object')throw new Error('Invalid JSON response');
  // Do not replace useful cached status with an HTML error or malformed response.
  if(new URL(request.url).pathname.endsWith('/status.json')&&(!data.scheduleFile||!data.checkedAt))throw new Error('Invalid status response');
  await cache.put(request,response.clone());return response;
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{try{const response=await fetch(request);if(!response.ok)throw new Error('Navigation failed');return response;}catch{return (await caches.open(CACHE)).match(new URL('./index.html',scope).href);}})());return;
  }
  if(url.pathname.endsWith('/data/status.json')||url.pathname.endsWith('/data/lunch.json')){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);try{return await checkedNetwork(request,cache);}catch{
      const saved=await cache.match(request);if(!saved)return new Response(JSON.stringify({error:'Offline and no saved data'}),{status:503,headers:{'Content-Type':'application/json'}});
      const headers=new Headers(saved.headers);headers.set('X-Iobot-Offline','1');return new Response(saved.body,{status:200,headers});
    }})());return;
  }
  // Hash-named schedule generations and assets never change at the same URL.
  event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(request);if(saved)return saved;
    const response=await fetch(request);if(response.ok){await cache.put(request,response.clone());
      if(/\/schedule\.[a-f0-9]+\.json$/.test(url.pathname)){
        const schedules=(await cache.keys()).filter(key=>/\/schedule\.[a-f0-9]+\.json$/.test(new URL(key.url).pathname));
        for(const old of schedules.slice(0,-4))await cache.delete(old);
      }
    }return response;
  })());
});

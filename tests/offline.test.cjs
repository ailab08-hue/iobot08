const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function worker(fetcher){
  const listeners={},entries=new Map();
  const cache={async match(request){const saved=entries.get(typeof request==='string'?request:request.url);return saved?.clone();},async put(request,response){entries.set(request.url,response.clone());},async keys(){return [...entries.keys()].map(url=>new Request(url));},async delete(request){return entries.delete(request.url);}};
  const context={URL,Headers,Request,Response,fetch:fetcher,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},self:{registration:{scope:'https://example.com/iobot/'},addEventListener:(name,listener)=>listeners[name]=listener}};
  vm.runInNewContext(fs.readFileSync('web/sw.js','utf8').replace('__VERSION__','test').replace('__SHELL__','[]'),context);
  return {entries,async fetch(request){let result;listeners.fetch({request,respondWith:value=>result=value});return result?await result:undefined;}};
}
test('offline status uses a previously successful response and identifies it as saved',async()=>{
 let online=true;const app=worker(async()=>{if(!online)throw new Error('offline');return Response.json({checkedAt:'2026-10-29T18:00:00Z',scheduleFile:'schedule.0123456789abcdef.json'});});
 const request=new Request('https://example.com/iobot/data/status.json');
 assert.equal((await app.fetch(request)).status,200);online=false;
 const saved=await app.fetch(request);assert.equal(saved.headers.get('X-Iobot-Offline'),'1');assert.equal((await saved.json()).scheduleFile,'schedule.0123456789abcdef.json');
});
test('an HTML server error cannot replace saved JSON; unrelated sites are not intercepted',async()=>{
 const app=worker(async()=>new Response('<html>Error</html>',{status:502}));
 app.entries.set('https://example.com/iobot/data/status.json',Response.json({checkedAt:'2026-10-29',scheduleFile:'schedule.0123456789abcdef.json'}));
 const response=await app.fetch(new Request('https://example.com/iobot/data/status.json'));assert.equal(response.status,200);assert.equal(response.headers.get('X-Iobot-Offline'),'1');
 assert.equal(await app.fetch(new Request('https://example.com/another-site/file.js')),undefined);
});

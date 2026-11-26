// Keep only the public application shell offline. Family data lives in IndexedDB.
const cacheName = 'lili-homecare-shell-2.0.1126.18';
const scope = self.registration.scope;
const build = '?v=2.0.1126.18';
const paths = ['assets/lili-serif.woff2','manifest.webmanifest?v=2.0.1126.18','assets/crm-black-cat.svg','config.js',
  ...['workspace.css','workspace.mjs','workspace-model.mjs','model.mjs','brand.mjs','tab-grant.mjs','drive.mjs','drafts.mjs','plan-pdf.mjs','quote.mjs'].map(p => p+build),
  ...['cat','ig','line','icon-192','icon-512'].map(name => 'assets/'+name+'.png')];
const urls = new Set(paths.map(path => new URL(path,scope).href));
async function installShell(){
  const cache=await caches.open(cacheName);
  const index=new URL('index.html',scope).href;
  const response=await fetch(index+build,{cache:'reload'});
  if(!response.ok || !(await response.clone().text()).includes('workspace.mjs'+build)){
    throw Error('新版首頁尚未就緒');
  }
  await cache.addAll([...urls].map(url=>new Request(url,{cache:'reload'})));
  await cache.put(index,response);
  await self.skipWaiting();
}
self.addEventListener('install',event=>event.waitUntil(installShell()));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lili-homecare-shell-')&&key!==cacheName).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET')return;
  const page=new URL(req.url);
  const index=new URL('index.html',scope).href;
  if(req.mode==='navigate'&&(page.href.split('?')[0]===scope||page.href.split('?')[0]===index)){
    event.respondWith((async()=>{try{const fresh=await fetch(req,{cache:'no-store'});if(fresh.ok)return fresh;}catch{}const cached=await (await caches.open(cacheName)).match(index);return cached||Response.error();})());return;
  }
  if(urls.has(req.url))event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(req))||fetch(req)));
});
// Memory only. A refresh can reuse an unexpired grant while this worker is alive.
let session=null;
self.addEventListener('message',event=>{
  if(!event.source?.url.startsWith(scope)||!event.ports[0])return;
  if(event.data?.type==='remember')session=event.data.value;
  if(!session||session.expires<=Date.now()+5000)session=null;
  event.ports[0].postMessage(event.data?.type==='recall'?session:null);
});

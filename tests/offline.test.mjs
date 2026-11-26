import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DriveStore} from '../docs/drive.mjs';

test('offline shell can restore the app and every versioned import; private URLs bypass cache',async()=>{
 const events={},cache=new Map();let mode='stale';
 const scope='https://example.test/lili-homecare/';
 const storage={
  async addAll(urls){
   for(const req of urls){const url=req.url;const path=new URL(url).pathname.slice('/lili-homecare/'.length);
    const file=await readFile(new URL('../docs/'+path,import.meta.url));
    cache.set(url,file);}
  },
  async put(url,response){cache.set(url,await response.text());},
  async match(req){return cache.get(typeof req==='string'?req:req.url);}
 };
 const self={registration:{scope},addEventListener:(type,callback)=>{events[type]=callback;},skipWaiting:async()=>{}};
 vm.runInNewContext(await readFile(new URL('../docs/sw.js',import.meta.url),'utf8'),{
  URL,Request,self,caches:{open:async()=>storage},fetch:async()=>{
   if(mode==='offline')throw Error('test network offline');
   return new Response(mode==='stale'?'old app':await readFile(new URL('../docs/index.html',import.meta.url)));
  }
 });
 let installed;
 const install=()=>{events.install({waitUntil:p=>{installed=p;}});return installed;};
 await assert.rejects(install(),/新版首頁尚未就緒/);assert.equal(cache.size,0);
 mode='current';await install();mode='offline';
 function respond(url,mode){let response;events.fetch({request:{url,method:'GET',mode},respondWith:p=>{response=p;}});return response;}
 const html=(await respond(scope+'?home','navigate')).toString();
 const script=html.match(/type="module" src="([^"]+)"/)[1];
 const entry=(await respond(new URL(script,scope).href,'cors')).toString();
 for(const match of entry.matchAll(/from '([^']+)'/g))assert.ok(await respond(new URL(match[1],scope).href,'cors'));
 assert.equal(respond('https://www.googleapis.com/drive/v3/files/not-a-real-id?alt=media','cors'),undefined);
 assert.equal(respond('https://accounts.google.com/gsi/client','cors'),undefined);
});

test('expired background grant cannot start interactive OAuth',async()=>{
 const drive=new DriveStore();
 await assert.rejects(drive.connect('unused',{token:'test-only',expires:Date.now()-1}),/授權已到期/);
 assert.equal(drive.token,null);
});

test('tab grant survives a page reload but rejects tampering and expiration',async()=>{
 const {rememberGrant,recallGrant}=await import('../docs/tab-grant.mjs');
 const session=new Map(),keys=new Map();
 const db={get:async(_,k)=>keys.get(k),getOrInsert:async(_,k,v)=>{keys.set(k,keys.get(k)||v);return keys.get(k);}};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  setItem:(k,v)=>session.set(k,v),getItem:k=>session.get(k),removeItem:k=>session.delete(k)
 }});
 try{
  const grant={token:'synthetic-for-test',expires:Date.now()+60000};
  await rememberGrant(db,grant);assert.deepEqual(await recallGrant(db),grant);
  const [slot,value]=[...session][0];assert.ok(!value.includes(grant.token));assert.equal([...keys.values()][0].extractable,false);
  const changed=JSON.parse(value);changed.expires+=10000;session.set(slot,JSON.stringify(changed));
  assert.equal(await recallGrant(db),null);assert.equal(session.size,0);
  session.set(slot,JSON.stringify({...changed,expires:Date.now()-1}));assert.equal(await recallGrant(db),null);
 }finally{if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete globalThis.sessionStorage;}
});

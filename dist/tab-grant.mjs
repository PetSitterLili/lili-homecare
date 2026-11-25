// The OAuth grant expires on Google's schedule. Only its encrypted envelope
// lives in this tab. The non-exportable device key is outside all family backups.
const slot='lili-homecare.tab-grant.v1';
const keyName='drive-tab-encryption-v1';
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));

export function forgetGrant(){try{sessionStorage.removeItem(slot);}catch{}}

export async function rememberGrant(db,{token,expires}){
 if(!token||!Number.isFinite(expires)||expires<=Date.now())return;
 let key=await db.get('settings',keyName);
 if(!key){
  const candidate=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  key=await db.getOrInsert('settings',keyName,candidate);
 }
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plain=new TextEncoder().encode(JSON.stringify({token,expires}));
 const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
 sessionStorage.setItem(slot,JSON.stringify({expires,iv:encode(iv),sealed:encode(sealed)}));
}

export async function recallGrant(db){
 try{
  const envelope=JSON.parse(sessionStorage.getItem(slot)||'null');
  if(!envelope||envelope.expires<=Date.now()+5000){forgetGrant();return null;}
  const key=await db.get('settings',keyName);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv)},key,decode(envelope.sealed));
  const grant=JSON.parse(new TextDecoder().decode(plain));
  if(typeof grant.token==='string'&&grant.expires===envelope.expires&&grant.expires>Date.now()+5000)return grant;
 }catch{}
 forgetGrant();return null;
}

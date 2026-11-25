
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
export async function openDB(){return new Promise((ok,no)=>{const r=indexedDB.open('lili-homecare',1);r.onupgradeneeded=()=>{r.result.createObjectStore('families',{keyPath:'id'});r.result.createObjectStore('photos');r.result.createObjectStore('settings');};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});}
export function storeDB(db){return {async getOrInsert(kind,key,value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(kind,'readwrite'),store=tx.objectStore(kind),read=store.get(key);
  let result;read.onsuccess=()=>{result=read.result??value;if(read.result===undefined)store.add(value,key);};
  tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('無法保存設定'));
 });
},async all(){return request(db.transaction('families').objectStore('families').getAll());},async get(kind,key){return request(db.transaction(kind).objectStore(kind).get(key));},async put(kind,value,key){return new Promise((ok,no)=>{const tx=db.transaction(kind,'readwrite');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error||Error('儲存中斷'));const os=tx.objectStore(kind);if(key===undefined)os.put(value);else os.put(value,key);});}};}

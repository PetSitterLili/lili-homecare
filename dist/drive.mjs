function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export async function digest(value){
 const bytes=new TextEncoder().encode(JSON.stringify(canonical(value)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
const ROOT='https://www.googleapis.com/drive/v3';
export class DriveStore {
 constructor(){this.token=null;this.root=null;this.backupTimes=new Map();}
 async connect(clientId,session){
  if(session?.expires>Date.now()+5000){this.token=session.token;this.expires=session.expires;}else{
  if(!window.google?.accounts?.oauth2)throw Error('Google 連線元件尚未載入，請確認網路後再試。');
  const auth=await new Promise((resolve,reject)=>{const c=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',hint:'petsitterlili2025@gmail.com',callback:r=>r.error?reject(Error(r.error_description||r.error)):resolve(r),error_callback:()=>reject(Error('Google 授權未完成。'))});c.requestAccessToken({prompt:''});});
  this.token=auth.access_token;this.expires=Date.now()+Number(auth.expires_in)*1000;
  }
  try{const info=await this.request('/about?fields=user(emailAddress),storageQuota');if(info.user?.emailAddress!=='petsitterlili2025@gmail.com')throw Error('請使用保姆帳號 petsitterlili2025@gmail.com 連線。');
   this.email=info.user.emailAddress;this.quota=info.storageQuota;
   const folders=await this.list("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='liliRole' and value='root-v1' }");
   if(folders.length>1)throw Error('找到多個 App 資料夾，需要先確認正確的資料夾。');
   this.root=folders[0]?.id||(await this.request('/files?fields=id',{method:'POST',body:JSON.stringify({name:'ㄌㄌ保姆_家庭照護檔案',mimeType:'application/vnd.google-apps.folder',appProperties:{liliRole:'root-v1'}}),headers:{'Content-Type':'application/json'}})).id;
  }catch(e){this.token=null;throw e;}
 }
 async request(path,options={}){if(!this.token||Date.now()>this.expires)throw Error('Google 連線已到期，請重新連接。畫面上的修改仍保留。');const res=await fetch(path.startsWith('https:')?path:ROOT+path,{...options,cache:'no-store',headers:{Authorization:`Bearer ${this.token}`,...options.headers}});if(!res.ok){if(res.status===401)this.token=null;if(res.status===412)throw Object.assign(Error('資料衝突：同步途中另一份修改已存入 Drive，本機草稿保留'),{status:412});let message;try{message=(await res.json()).error?.message;}catch{}throw Object.assign(Error(res.status===401?'Google 連線已到期，請重新連接。':`雲端操作未完成（${res.status}）${message?`：${message}`:''}`),{status:res.status});}if(res.status===204)return null;if(options.raw)return res;return res.json();}
 async list(q){let files=[],pageToken;do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,version,modifiedTime)',pageSize:'1000',...(pageToken?{pageToken}:{})});const result=await this.request('/files?'+params);files.push(...result.files);pageToken=result.nextPageToken;}while(pageToken);return files;}
 async families(){return this.list(`'${this.root}' in parents and trashed = false and appProperties has { key='liliRole' and value='family-v1' }`);}
 async load(id,attempt=0){
  const path='/files/'+encodeURIComponent(id);
  const before=await this.request(path+'?fields=id,version',{raw:true});
  const meta=await before.json();
  const response=await this.request(path+'?alt=media',{raw:true});
  const data=await response.json();
  const after=await this.request(path+'?fields=id,version');
  if(meta.version!==after.version&&attempt<2)return this.load(id,attempt+1);
  if(meta.version!==after.version)throw Error('檔案正在更新，稍候會自動重試');
  return {data,version:meta.version,etag:before.headers.get('etag')||response.headers.get('etag'),base:await digest(data)};
 }
 async photo(id){return (await this.request(`/files/${encodeURIComponent(id)}?alt=media`,{raw:true})).blob();}
 async upload(name,blob,role,familyId,reservedId){const metadata={...(reservedId?{id:reservedId}:{}),name,parents:[this.root],appProperties:{liliRole:role,familyId}};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',blob,name);return this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version',{method:'POST',body:form});}
 async reserve(){return (await this.request('/files/generateIds?count=1&space=drive')).ids[0];}
 async save(data,remote,role='family-v1',reservedId,previousAttempt,retry=true){
  if(!remote){
   if(!/^[a-zA-Z0-9_-]+$/.test(data.id))throw Error('無法安全辨識家庭 ID');
   const matches=await this.list("'"+this.root+"' in parents and trashed=false and appProperties has {key='familyId' and value='"+data.id+"'} and appProperties has {key='liliRole' and value='"+role+"'}");
   if(matches.length>1)throw Error('資料衝突：找到多份同一家庭檔案');
   if(matches.length)remote={id:matches[0].id};
  }
  if(remote){
   const current=await this.load(remote.id);
   if(current.base===await digest(data))return {id:remote.id,version:current.version};
   if(!remote.base&&current.base!==previousAttempt&&remote.version!==current.version)throw Object.assign(Error('資料衝突待確認：舊草稿缺少可比較的基準，請保留副本再載入雲端'),{remoteId:remote.id});
   if(current.data.id!==data.id || (current.base!==previousAttempt&&(remote.base?remote.base!==current.base:remote.version!==current.version)))
    throw Error('資料衝突：雲端內容與上次同步基準不同，已保留兩邊資料');
   if(!current.etag)throw Error('無法確認雲端條件寫入，已保留草稿');
   let copy=null;if(!this.conditionalVerified||Date.now()-(this.backupTimes.get(remote.id)||0)>60*60*1000){copy=await this.request(`/files/${encodeURIComponent(remote.id)}/copy?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${data.name}＿還原副本＿${new Date().toISOString()}.json`,appProperties:{liliRole:'recovery-v1',familyId:data.id}})});this.backupTimes.set(remote.id,Date.now());}
   if(!this.conditionalVerified){
    if(!copy)throw Error('無法確認條件寫入，請重新連接 Drive');
    const probe=new FormData();probe.append('metadata',new Blob(['{}'],{type:'application/json'}));probe.append('file',new Blob([JSON.stringify(current.data)],{type:'application/json'}));
    try{await this.request('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(copy.id)+'?uploadType=multipart&fields=id',{method:'PATCH',headers:{'If-Match':'"lili-invalid-precondition"'},body:probe});}
    catch(error){if(error.status!==412)throw error;this.conditionalVerified=true;}
    if(!this.conditionalVerified)throw Error('Drive 未執行條件寫入保護，更新已暫停，本機草稿保留');
   }
   const form=new FormData();form.append('metadata',new Blob([JSON.stringify({name:`${data.name}＿照護資料.json`})],{type:'application/json'}));form.append('file',new Blob([JSON.stringify(data)],{type:'application/json'}));let r;try{r=await this.request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(remote.id)}?uploadType=multipart&fields=id,version`,{method:'PATCH',headers:{'If-Match':current.etag},body:form});}catch(error){if(error.status===412&&retry)return this.save(data,{...remote,base:current.base},role,reservedId,previousAttempt,false);throw error;}
   return {id:r.id,version:r.version,recoveryId:copy?.id};
  }
  const r=await this.upload(`${data.name||'未命名家庭'}＿照護資料.json`,new Blob([JSON.stringify(data)],{type:'application/json'}),role,data.id,reservedId);return {id:r.id,version:r.version};
 }
}

const ROOT='https://www.googleapis.com/drive/v3';
export class DriveStore {
 constructor(){this.token=null;this.root=null;this.backupTimes=new Map();}
 async connect(clientId){
  if(!window.google?.accounts?.oauth2)throw Error('Google 連線元件尚未載入，請確認網路後再試。');
  const auth=await new Promise((resolve,reject)=>{const c=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',hint:'petsitterlili2025@gmail.com',callback:r=>r.error?reject(Error(r.error_description||r.error)):resolve(r),error_callback:()=>reject(Error('Google 授權未完成。'))});c.requestAccessToken({prompt:'select_account'});});
  this.token=auth.access_token;this.expires=Date.now()+Number(auth.expires_in)*1000;
  try{const info=await this.request('/about?fields=user(emailAddress),storageQuota');if(info.user?.emailAddress!=='petsitterlili2025@gmail.com')throw Error('請使用保姆帳號 petsitterlili2025@gmail.com 連線。');
   this.email=info.user.emailAddress;this.quota=info.storageQuota;
   const folders=await this.list("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='liliRole' and value='root-v1' }");
   if(folders.length>1)throw Error('找到多個 App 資料夾，需要先確認正確的資料夾。');
   this.root=folders[0]?.id||(await this.request('/files?fields=id',{method:'POST',body:JSON.stringify({name:'ㄌㄌ保姆_家庭照護檔案',mimeType:'application/vnd.google-apps.folder',appProperties:{liliRole:'root-v1'}}),headers:{'Content-Type':'application/json'}})).id;
  }catch(e){this.token=null;throw e;}
 }
 async request(path,options={}){if(!this.token||Date.now()>this.expires)throw Error('Google 連線已到期，請重新連接。畫面上的修改仍保留。');const res=await fetch(path.startsWith('https:')?path:ROOT+path,{...options,headers:{Authorization:`Bearer ${this.token}`,...options.headers}});if(!res.ok){if(res.status===401)this.token=null;if(res.status===412)throw Error('雲端資料已更新，已停止覆寫。請先下載目前修改的備份，再重新開啟雲端檔案。');let message;try{message=(await res.json()).error?.message;}catch{}throw Error(res.status===401?'Google 連線已到期，請重新連接。':`雲端操作未完成（${res.status}）${message?`：${message}`:''}`);}if(res.status===204)return null;if(options.raw)return res;return res.json();}
 async list(q){let files=[],pageToken;do{const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,version,modifiedTime)',pageSize:'1000',...(pageToken?{pageToken}:{})});const result=await this.request('/files?'+params);files.push(...result.files);pageToken=result.nextPageToken;}while(pageToken);return files;}
 async families(){return this.list(`'${this.root}' in parents and trashed = false and appProperties has { key='liliRole' and value='family-v1' }`);}
 async load(id){const meta=await this.request(`/files/${encodeURIComponent(id)}?fields=id,version`);const response=await this.request(`/files/${encodeURIComponent(id)}?alt=media`,{raw:true});return {data:await response.json(),version:meta.version,etag:response.headers.get('etag')};}
 async photo(id){return (await this.request(`/files/${encodeURIComponent(id)}?alt=media`,{raw:true})).blob();}
 async upload(name,blob,role,familyId){const metadata={name,parents:[this.root],appProperties:{liliRole:role,familyId}};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',blob,name);return this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,version',{method:'POST',body:form});}
 async save(data,remote){
  if(remote){const current=await this.request(`/files/${encodeURIComponent(remote.id)}?fields=version`);if(current.version!==remote.version)throw Error('這份雲端檔案已在別處修改，已停止覆寫。請先下載目前修改的備份，再重新開啟雲端版本。');
   let copy=null;if(Date.now()-(this.backupTimes.get(remote.id)||0)>60*60*1000){copy=await this.request(`/files/${encodeURIComponent(remote.id)}/copy?fields=id`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${data.name}＿還原副本＿${new Date().toISOString()}.json`,appProperties:{liliRole:'recovery-v1',familyId:data.id}})});this.backupTimes.set(remote.id,Date.now());}
   const form=new FormData();form.append('metadata',new Blob([JSON.stringify({name:`${data.name}＿照護資料.json`})],{type:'application/json'}));form.append('file',new Blob([JSON.stringify(data)],{type:'application/json'}));const r=await this.request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(remote.id)}?uploadType=multipart&fields=id,version`,{method:'PATCH',headers:{...(remote.etag?{'If-Match':remote.etag}:{})},body:form});
   return {id:r.id,version:r.version,recoveryId:copy?.id};
  }
  const r=await this.upload(`${data.name||'未命名家庭'}＿照護資料.json`,new Blob([JSON.stringify(data)],{type:'application/json'}),'family-v1',data.id);return {id:r.id,version:r.version};
 }
}


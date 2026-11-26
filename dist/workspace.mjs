import {rememberGrant,recallGrant,forgetGrant} from './tab-grant.mjs?v=2.0.1126.4';
import {brandDefaults,readBrand} from './brand.mjs?v=2.0.1126.4';

import {serviceName,fresh,blanks,fields,titles,day,filename,mediaLabel,warnings,publicBlocks,tasks,sourceKey,normalize,migrate} from './workspace-model.mjs?v=2.0.1126.4';
import {makeText as legacyText} from './model.mjs?v=2.0.1126.4';
import {DriveStore,digest} from './drive.mjs?v=2.0.1126.4';
import {openDB,storeDB} from './drafts.mjs?v=2.0.1126.4';
import {buildPDF} from './plan-pdf.mjs?v=2.0.1126.5';
const $=id=>document.getElementById(id),drive=new DriveStore(),db=storeDB(await openDB().catch(error=>{$('main').innerHTML='<div class="panel"><h1>目前無法啟用草稿保存</h1><p>此瀏覽器未能開啟本機資料庫，請換外部瀏覽器或檢查儲存空間；尚未開放填寫，避免資料遺失。</p></div>';throw error;}));
let records=await db.all(),entry=null,view='service',kind='cat',petIndex=0,undo=[],syncTimer,localChain=Promise.resolve(),syncBusy=false,photoBusy=false,pdf=null,photoUrl=null,localFailure=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let brandState=await db.get('settings','brandSync')||{};
let archiveView=false; const failures=new Map(); const pending=new Map();
let brand=readBrand(await db.get('settings','brand'));
let draining=false,connecting=false; const blocked=new Set();
function ready(){return navigator.onLine&&drive.token&&Date.now()<drive.expires&&!connecting;}
function schedule(){clearTimeout(syncTimer);if(ready())syncTimer=setTimeout(drain,1500);}
async function drain(){if(draining||!ready())return;draining=true;try{for(const r of records){if(!ready())break;if(r.rev!==r.syncedRev&&(r.f.name.trim()||r.f.archived)&&!blocked.has(r.id))await sync(r);}if(ready()&&brandState.dirty)await syncBrand();}finally{draining=false;status();}}
let toastTimer;function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function confirmAction(title,text,yes='確認'){return new Promise(resolve=>{$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('yesConfirm').textContent=yes;const d=$('confirm');const finish=result=>{d.close();d.oncancel=null;$('yesConfirm').onclick=null;$('cancelConfirm').onclick=null;resolve(result);};$('yesConfirm').onclick=()=>finish(true);$('cancelConfirm').onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();});}
function snapshot(){undo.push(JSON.stringify(entry.f));if(undo.length>40)undo.shift();}
function dirty(){showConsent();entry.rev=(entry.rev||0)+1;entry.f.updatedAt=new Date().toISOString();pdf=null;persist(entry);const state=$('saveState');if(state)state.textContent='正在保存原瀏覽器草稿…';schedule();list();}
function persist(record){
 const copy=structuredClone(record);pending.set(record.id,(pending.get(record.id)||0)+1);
 localChain=localChain.then(async()=>{
  try{await db.put('families',copy);failures.delete(copy.id);}
  catch(e){failures.set(copy.id,e.message);}
  finally{pending.set(copy.id,pending.get(copy.id)-1);localFailure=failures.size>0;status();}
 });return localChain;
}
function status(){
 const connected=!!drive.token && Date.now()<drive.expires;
 const expired=!!drive.expires&&!connected;
 $('cloud').textContent=connected?'Drive 已連線':expired?'重新連接 Drive':'連接 Google Drive';
 $('cloud').disabled=connected||connecting;
 $('connection').textContent=!navigator.onLine?'離線':connected?'已連接保姆 Google Drive':expired?'Google 授權已到期':'Google Drive 尚未連線';
 const el=$('saveState');if(!el||!entry)return;
 el.textContent=failures.has(entry.id)?'本機儲存失敗，請先下載備份':pending.get(entry.id)?'正在儲存本機草稿':blocked.has(entry.id)?'已存本機 · '+(entry.syncError||'雲端待處理'):!navigator.onLine?'離線 · 已存本機':syncBusy&&entry.syncedRev!==entry.rev?'已存本機 · 正在同步':entry.syncedRev===entry.rev&&entry.remote?'已同步至 Google Drive · '+(entry.syncedAt?new Date(entry.syncedAt).toLocaleString():'完成'):connected?'已存本機 · 等待雲端同步':'已存本機 · 請連接 Drive 同步';
}
function list(){const term=$('search').value.toLowerCase();$('families').innerHTML=records.filter(r=>!!r.f.archived===archiveView).filter(r=>(r.f.name+' '+Object.values(r.f.groups).flatMap(g=>g.pets.map(p=>p.name)).join(' ')).toLowerCase().includes(term)).map(r=>'<button data-id="'+esc(r.id)+'" class="'+(r.id===entry?.id?'active':'')+'">'+esc(r.f.name||'未命名家庭')+'<small>'+(r.syncedRev===r.rev&&r.remote?'Drive 已同步':'原瀏覽器草稿')+'</small></button>').join('');}
async function openRecord(id){await localChain;entry=records.find(r=>r.id===id);if(!entry)return;undo=[];kind=Object.keys(entry.f.groups)[0];petIndex=0;view='service';pdf=null;await db.put('settings',id,'lastFamily');render();}
async function newRecord(demo=false){archiveView=false;$('archive').textContent='已刪除家庭';if(photoBusy){toast('請等待照片保存完成');return;}const f=fresh();if(demo){f.name='姆姆家四貓（操作範例）';f.groups.cat.pets=[{name:'姆姆',identity:'白底虎斑',personality:'慢熟，依他的步調靠近'}];f.groups.cat.food.dry={item:'範例飼料',amount:'三分之一',unit:'杯',location:'廚房右側下櫃',leftover:'移出洗碗後放回'};}const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);view='edit';render();}
function button(text,fn,cl=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cl;b.onclick=fn;return b;}
function heading(text){const h=document.createElement('h3');h.textContent=text;return h;}
function field(obj,key,label,{long=false,options=null,compact=false,placeholder=''}={}){const wrap=document.createElement('div');wrap.className='field'+(compact?' compact':'');const head=document.createElement('div');head.className='fieldhead';const l=document.createElement('span');l.textContent=label;head.append(l,button('清除',async()=>{if(!obj[key])return;if(await confirmAction('清除此欄？','只清除「'+label+'」，其他資料不變。','確認清除')){snapshot();obj[key]='';dirty();input.value='';}},'clear'));let input=document.createElement(options?'select':long?'textarea':'input');input.setAttribute('aria-label',label);input.placeholder=placeholder;
if(options){const values=['',...new Set([...options,...(obj[key]&&!options.includes(obj[key])?[obj[key]]:[])])];for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v||'尚未確認';input.append(o);}input.onchange=()=>{snapshot();obj[key]=input.value;dirty();};}else input.oninput=()=>{snapshot();obj[key]=input.value;dirty();};input.value=obj[key]||'';wrap.append(head,input);return wrap;}
function check(label,checked,fn){const l=document.createElement('label');l.className='check';const i=document.createElement('input');i.type='checkbox';i.checked=checked;i.onchange=()=>fn(i.checked);l.append(i,document.createTextNode(label));return l;}
function grid(){const e=document.createElement('div');e.className='grid';return e;}
function section(title,open=true){const e=document.createElement('details');e.open=open;const s=document.createElement('summary');s.textContent=title;const body=document.createElement('div');body.className='body';e.append(s,body);return {e,body};}
function quantity(o){const w=document.createElement('div');w.className='field';const h=document.createElement('div');h.className='fieldhead';h.textContent='每次份量';const row=document.createElement('div');row.className='amount';for(const [key,ph]of[['amount','三分之一'],['unit','杯']]){const input=document.createElement('input');input.value=o[key]||'';input.placeholder=ph;input.setAttribute('aria-label',key==='amount'?'份量':'份量單位');input.oninput=()=>{snapshot();o[key]=input.value;dirty();};const container=document.createElement('div');container.append(input,button('清除',async()=>{if(o[key]&&await confirmAction('清除這一格？','只清除'+(key==='amount'?'份量':'單位')+'，不影響其他資料。','確認清除')){snapshot();o[key]='';input.value='';dirty();}},'clear'));row.append(container);}w.append(h,row);return w;}
function showConsent(){
 const el=$('mediaBadge');if(!el||!entry)return;
 const media=entry.f.media;
 el.dataset.consent=media.status;
 const label=document.createElement('span');label.textContent='服務影像對外分享';
 const state=document.createElement('strong');state.textContent=({yes:'我願意分享',no:'我不願意分享'})[media.status]||'尚未確認';
 el.replaceChildren(label,state);
 if(media.note?.trim()){const note=document.createElement('small');note.textContent='拍攝與分享備註　'+media.note;el.append(note);}
}
function frame(){const f=entry.f;$('main').innerHTML='<div class="filehead"><div><h1>'+esc(f.name||'未命名家庭')+'</h1><span class="muted">'+esc(f.booking.dates||'本次預約尚未填寫')+'</span></div><div class="badge" id="mediaBadge"></div></div><span id="saveState" class="save" role="status"></span><div id="nav" class="nav"></div><div id="content"></div><div id="foot" class="foot"></div>';showConsent();for(const [v,t]of[['service','本次照護'],['edit','編輯家訪資料'],['photos','內部照片'],['plan','A4 計畫書']])$('nav').append(button(t,async()=>{if(photoBusy){toast('照片正在保存，請稍候。');return;}await localChain;view=v;render();},view===v?'active':''));$('foot').append(button('立即同步 Drive',()=>{if(!ready()){toast('目前無法同步，請確認網路或重新連接 Google Drive。');return;}blocked.delete(entry.id);entry.syncError='';schedule();}),button('下載完整備份（內部）',backup),button('復原上一步',()=>{if(!undo.length){toast('目前沒有可復原的修改');return;}entry.f=JSON.parse(undo.pop());dirty();render();}));$('foot').append(button(f.archived?'復原家庭':'刪除家庭',async()=>{
 const r=entry;const verb=r.f.archived?'復原':'刪除';
 if(!await confirmAction(verb+'「'+(r.f.name||'未命名家庭')+'」？','家庭與照片保留於已刪除家庭，可復原。','確認'+verb))return;
 r.f.archived=!r.f.archived;dirty();await localChain;entry=null;render();
 }));if(entry.syncError?.includes('衝突'))$('foot').append(button('保留本機副本並載入雲端版本',resolveConflict));status();}
async function resolveConflict(){
 const r=entry;if(!ready()||!r.remote)return toast('請先連接 Drive');
 if(!await confirmAction('保留兩份家庭資料？','將目前填寫的內容留下獨立副本，原家庭重新載入雲端版本。','保留兩份'))return;
 const rev=r.rev;try{const latest=await drive.load(r.remote.id);
 if(rev!==r.rev)return toast('資料仍在編輯，請再試一次');
 const copy=structuredClone(r.f);copy.id=crypto.randomUUID();copy.name+='（本機修改副本）';
 const next={id:copy.id,f:copy,remote:null,rev:1,syncedRev:0};await db.put('families',next);records.push(next);
 const f=latest.data.schema===2?normalize(latest.data):migrate(latest.data,legacyText(latest.data));
 Object.assign(r,{f,syncError:'',remote:{id:r.remote.id,base:latest.base,version:latest.version},rev:rev+1,syncedRev:rev+1});blocked.delete(r.id);await persist(r);render();schedule();
 }catch(e){toast(e.message);}
}
function render(){if(!entry){list();$('main').replaceChildren();return;}list();frame();const content=$('content');if(view==='edit')renderEdit(content);if(view==='service')renderService(content);if(view==='photos')renderPhotos(content);if(view==='plan')renderPlan(content);}
function renderEdit(content){const f=entry.f;
if(!f.groups[kind]){kind=Object.keys(f.groups)[0];petIndex=0;}
let s=section('本次預約與家長資料');let g=grid();for(const[k,l]of[['name','家庭代表名（也用於檔名）']])g.append(field(f,k,l));g.append(field(f.booking,'dates','預約日期'),field(f.booking,'times','每日次數與預計時段'));s.body.append(g);const checks=document.createElement('div');checks.className='checks';const options=['生活照顧','陪伴專案'];if((f.groups.cat&&f.groups.dog)||f.booking.services.includes('犬喵同住家庭方案'))options.push('犬喵同住家庭方案');for(const service of options)checks.append(check(serviceName(service,f.groups),f.booking.services.includes(service),yes=>{snapshot();f.booking.services=yes?[...new Set([...f.booking.services,service])]:f.booking.services.filter(x=>x!==service);dirty();}));s.body.append(checks);g=grid();for(const[k,l]of[['name','家長姓名／稱呼'],['phone','電話'],['emergency','緊急聯絡人與電話'],['address','服務地址'],['guide','位置指引（選填）']])g.append(field(f.contact,k,l));s.body.append(g);content.append(s.e);
s=section('影像分享意願',false);g=grid();g.append(field(f.media,'status','家長是否同意對外分享服務照片／影片',{options:['pending','yes','no']}));const select=g.querySelector('select');for(const o of select.options)o.textContent=({'pending':'尚未確認','yes':'同意','no':'不同意','':'尚未確認'})[o.value]||o.textContent;select.onchange=()=>{snapshot();f.media.status=select.value||'pending';dirty();};g.append(field(f.media,'note','附帶條件／避拍內容',{long:true}));s.body.append(g);content.append(s.e);
const species=document.createElement('div');
species.className='species';
const names={cat:'喵寶',dog:'犬寶'};
for(const k of Object.keys(f.groups)){
 species.append(button(names[k]+'資料',()=>{kind=k;petIndex=0;render();},kind===k?'active':''));
}
for(const k of ['cat','dog']){
 if(f.groups[k])continue;
 const current=kind;
 const canReplace=JSON.stringify(f.groups[current])===JSON.stringify(blanks());
 const label=canReplace?'先填'+names[k]+'資料':'新增'+names[k]+'分頁';
 species.append(button(label,()=>{
  snapshot();
  if(canReplace&&JSON.stringify(f.groups[current])===JSON.stringify(blanks()))delete f.groups[current];
  f.groups[k]=blanks();kind=k;petIndex=0;dirty();render();
 }));
}
content.append(species);
const group=f.groups[kind];
s=section('毛寶的小活頁');const petnav=document.createElement('div');petnav.className='petnav';group.pets.forEach((p,i)=>petnav.append(button(p.name||'毛寶 '+(i+1),()=>{petIndex=i;render();},petIndex===i?'active':'')));petnav.append(button('新增一位毛寶',()=>{snapshot();group.pets.push({id:crypto.randomUUID(),name:''});petIndex=group.pets.length-1;dirty();render();}));s.body.append(petnav);if(group.pets.length){petIndex=Math.min(petIndex,group.pets.length-1);const p=group.pets[petIndex];g=grid();for(const[k,l]of[['name','名字'],['identity','辨識介紹（花色／品種等）'],['personality','個性、喜好與禁忌'],['area','活動／躲藏位置'],['age','年齡'],['sex','性別／稱呼'],['neuter','結紮狀態'],['health','個別健康狀況'],['intro','自由補充的完整介紹']])g.append(field(p,k,l,{long:k==='intro'}));s.body.append(g,button('刪除這位毛寶',async()=>{if(await confirmAction('刪除這位毛寶？','只移除此毛寶的個別檔案，共用照護流程仍保留。','確認刪除')){snapshot();group.pets.splice(petIndex,1);petIndex=0;dirty();render();}}));}content.append(s.e);
for(const type of['health','dry','wet','snack','water','wash','play','toilet','walk']){if(type==='walk'&&kind!=='dog')continue;const o=group.food[type]||group[type];s=section(titles[type],['dry','wet','snack'].includes(type));if(['dry','wet','snack'].includes(type)){s.body.append(check('本次提供',o.enabled!==false,yes=>{snapshot();o.enabled=yes;dirty();render();}));if(o.enabled===false){content.append(s.e);continue;}}g=grid();for(const[k,l]of fields[type]){if(['amount','unit'].includes(k)){if(k==='amount')g.append(quantity(o));continue;}if(k==='waste'&&!o.waste){const details=document.createElement('details');const label=document.createElement('summary');label.textContent='特殊垃圾處理';details.append(label,field(o,k,'這家的特殊交代'));g.append(details);continue;}const opts=k==='leftover'?['清掉換新','留到下一趟整理','移出洗碗後放回','沿用並補新糧','集中處理，詳見補充']:type==='health'&&k==='status'?['目前無需處置','需要處置','觀察即可','待家長提供']:type==='wash'&&['sponge','soap'].includes(k)?['有，寵物專用','與人共用','無','待家長提供']:null;g.append(field(o,k,l,{long:['note','returnNote'].includes(k),options:opts,compact:!!opts}));}s.body.append(g);
if(type==='dry'){s.body.append(check('需要混糧',!!o.mix,yes=>{snapshot();o.mix=yes;dirty();render();}));if(o.mix){g=grid();g.append(field(o,'mixItem','另一款飼料'),field(o,'mixAmount','兩款比例／各自份量'));s.body.append(g);}}
if(type==='walk'){s.body.append(heading('返家清潔檢查'));const c=document.createElement('div');c.className='checks';for(const part of['臉／眼周','嘴巴','前腳','後腳','屁股／外陰','身體／雨天擦乾'])c.append(check(part,(o.parts||[]).includes(part),yes=>{snapshot();o.parts=yes?[...new Set([...(o.parts||[]),part])]:(o.parts||[]).filter(x=>x!==part);dirty();}));s.body.append(c);}
content.append(s.e);}
s=section('進出、WiFi 與環境',false);g=grid();for(const[k,l]of[['pickup','鑰匙取得'],['door','門鎖操作與防逃脫'],['return','鑰匙歸還'],['wifi','WiFi 名稱與密碼']])g.append(field(f.entry,k,l));g.append(field(f,'environment','門窗與電器安排',{long:true}),field(f,'extra','其他任務／本次特殊交代',{long:true}));s.body.append(g);content.append(s.e);
const review=document.createElement('div');review.className='panel';review.append(heading('填完後，快速確認'));review.append(button('檢查還有沒有需要補問的資料',()=>{review.querySelectorAll('.issue').forEach(e=>e.remove());const w=warnings(f);if(!w.length){const p=document.createElement('p');p.textContent='目前沒有偵測到關鍵缺漏，仍請依家訪確認內容為準。';review.append(p);}for(const text of w){const p=document.createElement('div');p.className='issue';p.textContent=text;review.append(p);}}));content.append(review);}
function renderService(content){const f=entry.f;const p=document.createElement('div');p.className='panel';p.append(heading('本次照護'));const desc=document.createElement('p');desc.textContent=[f.booking.dates,f.booking.times,f.booking.services.map(s=>serviceName(s,f.groups)).join('、')].filter(Boolean).join(' ｜ ')||'先到編輯家訪資料填寫本次預約。';p.append(desc);const issues=warnings(f);for(const t of issues){const el=document.createElement('div');el.className='issue';el.textContent=t;p.append(el);}content.append(p);
const run=f.runs.at(-1);content.append(button(run?'建立下一趟勾選':'建立本趟照護小卡',async()=>{const warn=warnings(f);if(warn.length&&!await confirmAction('還有資料待確認','目前有 '+warn.length+' 項待確認。仍可建立小卡，現場請勿自行推測缺漏指示。','仍建立小卡'))return;const d=day();snapshot();f.runs.push({id:crypto.randomUUID(),label:d.year+'/'+d.month+'/'+d.day+' 第 '+(f.runs.length+1)+' 趟',createdAt:new Date().toISOString(),source:sourceKey(f),tasks:tasks(f),checks:{}});dirty();render();},'primary'));
if(!run){const q=document.createElement('p');q.className='muted';q.textContent='小卡由最新主資料產生，勾選記錄按趟保留。';content.append(q);return;}
const head=document.createElement('div');head.className='panel';head.append(heading(run.label));const stale=run.source!==sourceKey(f);if(stale){const el=document.createElement('div');el.className='issue';el.textContent='主資料已修改，這張小卡需要更新。已完成勾選不會套用到新的指示。';head.append(el,button('依最新資料更新本趟小卡',async()=>{if(await confirmAction('更新本趟小卡？','本趟原始小卡會保留為上一筆記錄，另建更新版；勾選從頭確認。','建立更新版')){snapshot();f.runs.push({id:crypto.randomUUID(),label:run.label+'（更新）',createdAt:new Date().toISOString(),source:sourceKey(f),tasks:tasks(f),checks:{}});dirty();render();}}));}
for(const t of run.tasks){const l=document.createElement('label');l.className='task'+(run.checks[t.id]?' done':'');const c=document.createElement('input');c.type='checkbox';c.checked=!!run.checks[t.id];c.onchange=()=>{snapshot();run.checks[t.id]=c.checked;dirty();l.classList.toggle('done',c.checked);};const body=document.createElement('div');const title=document.createElement('strong');title.textContent=t.title;const detail=document.createElement('p');detail.textContent=t.detail;body.append(title,detail);l.append(c,body);head.append(l);}content.append(head);
if(f.runs.length>1){const old=section('先前趟次記錄',false);for(const r of f.runs.slice(0,-1).reverse()){const d=document.createElement('div');d.className='panel';d.append(heading(r.label));for(const t of r.tasks){const q=document.createElement('p');q.textContent=(r.checks[t.id]?'已完成 · ':'未勾選 · ')+t.title;d.append(q);}old.body.append(d);}content.append(old.e);}}
async function photoBlob(p){
 const local=await db.get('photos',p.id);if(local)return local;
 if(!p.driveId||!ready())throw Error('此原圖尚未存入這台裝置，連線後可在照片區備妥。');
 const blob=await drive.photo(p.driveId);
 if(blob.size!==p.size)throw Error('原圖下載不完整，請稍後再試。');
 await db.put('photos',blob,p.id);return blob;
}
function offlinePhotos(photos){
 const el=document.createElement('p');el.className='muted';el.setAttribute('role','status');
 const save=button('備妥本家離線原圖',async()=>{
  save.disabled=true;let count=0;
  try{for(const photo of photos){await photoBlob(photo);el.textContent='已備妥 '+(++count)+'／'+photos.length+' 張原圖';}}
  catch(error){el.textContent='這台裝置已備妥 '+count+'／'+photos.length+' 張。'+error.message;}
  finally{save.disabled=false;}
 });
 return [save,el];
}
function renderPhotos(content){const intro=document.createElement('div');intro.className='panel';intro.append(heading('這一家的內部照片'));const p=document.createElement('p');p.textContent='位置、用品與空間細節都放這裡；說明可留白。點縮圖查看原檔，不會出現在家長 PDF。';intro.append(p,button('加入照片',()=>{if(photoBusy)return;$('photoFiles').click();},'primary'));if(entry.f.photos.length)intro.append(...offlinePhotos([...entry.f.photos]));content.append(intro);const photos=document.createElement('div');photos.className='photos';for(const p of entry.f.photos){const card=document.createElement('article');card.className='photo';const b=button('',async()=>{try{const owner=entry;const blob=await photoBlob(p);if(entry!==owner||!content.isConnected)return;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(blob);$('fullPhoto').src=photoUrl;$('fullPhoto').alt=p.caption||p.name;$('fullCaption').textContent=p.caption;$('lightbox').showModal();}catch(e){toast(e.message);}});b.setAttribute('aria-label','放大照片 '+(p.caption||p.name));const img=document.createElement('img');img.src=p.thumb;img.alt=p.caption||p.name;img.loading='lazy';b.append(img);card.append(b,field(p,'caption','說明（可留白）',{long:true}),button('移除照片',async()=>{if(await confirmAction('移除此照片？','只從這家的照片區移除，雲端原檔保留。可復原上一步。','確認移除')){snapshot();entry.f.photos=entry.f.photos.filter(x=>x.id!==p.id);dirty();render();}}));photos.append(card);}content.append(photos);}
async function thumbnail(blob){const url=URL.createObjectURL(blob);try{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('照片無法讀取'));i.src=url;});const factor=Math.min(1,400/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*factor));c.height=Math.max(1,Math.round(img.height*factor));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.72);}finally{URL.revokeObjectURL(url);}}
async function addPhotos(files){if(photoBusy||!entry)return;photoBusy=true;status();const target=entry;try{snapshot();for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>40*1024*1024)throw Error('支援 40 MB 以下 JPG、PNG、WebP');const p={id:crypto.randomUUID(),name:file.name,caption:'',mime:file.type,size:file.size,thumb:await thumbnail(file)};await db.put('photos',file,p.id);target.f.photos.push(p);target.rev++;await persist(target);if(failures.has(target.id))throw Error('照片資料尚未完整保存，請檢查本機空間');}schedule();toast('照片已保存原瀏覽器草稿；雲端狀態請看上方提示。');}catch(e){toast(e.message);}finally{photoBusy=false;$('photoFiles').value='';render();}}
async function renderPlan(content){let currentPDF;const owner=entry;const intro=document.createElement('div');intro.className='panel';intro.append(heading('家長的 A4 照護計畫書'));const p=document.createElement('p');p.className='pdfnote';p.textContent='只包含照護文字與品牌插圖，沒有內部照片。檔名日期依台灣下載當天自動帶入。';intro.append(p);const name=document.createElement('input');name.value=filename(entry.f);name.setAttribute('aria-label','PDF 檔名');intro.append(name);const preview=document.createElement('div');preview.className='preview';preview.hidden=true;
async function generate(){const warn=warnings(entry.f);if(warn.length&&!await confirmAction('有 '+warn.length+' 項資料待確認',warn.join('\n')+'\n\n這份提醒只供保姆補問。仍可預覽給家長的計畫書。','仍產生預覽'))return null;if(owner!==entry||!content.isConnected)return null;const revision=owner.rev,settings=brand;
const result=await buildPDF(structuredClone(owner.f),{...settings});
if(owner!==entry||owner.rev!==revision||brand!==settings||!content.isConnected)return null;
currentPDF={result,revision,settings};preview.replaceChildren();for(const data of result.pages){const img=document.createElement('img');img.src=data;img.alt='A4 照護計畫書預覽';preview.append(img);}preview.hidden=false;return result;}
const actions=document.createElement('div');actions.className='actions';actions.append(button('產生／更新 A4 預覽',async()=>{try{await generate();}catch(e){toast('PDF 產生失敗：'+e.message);}},'primary'),button('下載 PDF',async()=>{try{const result=currentPDF?.revision===owner.rev&&currentPDF.settings===brand&&owner===entry?currentPDF.result:await generate();if(!result)return;const finalName=name.value.trim().replace(/[\\/:*?"<>]/g,'_')||result.name;await saveFile(result.blob,finalName.endsWith('.pdf')?finalName:finalName+'.pdf');}catch(e){if(e.name!=='AbortError')toast('下載未完成：'+e.message);}}));intro.append(actions);content.append(intro,preview);}
async function saveFile(blob,name){if('showSaveFilePicker'in window){try{const handle=await window.showSaveFilePicker({suggestedName:name,startIn:'downloads',types:[{description:'PDF 照護計畫書',accept:{'application/pdf':['.pdf']}}]});const writable=await handle.createWritable();await writable.write(blob);await writable.close();toast('PDF 已儲存到你選擇的位置。');return;}catch(e){if(e.name==='AbortError')return;if(e.name!=='SecurityError'&&e.name!=='NotAllowedError')throw e;}}download(blob,name);toast('PDF 已交給瀏覽器下載。請在系統下載／儲存畫面選擇你的照護計畫書資料夾。');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function sync(record){if(!record)return;if(!ready()){status();return;}if(syncBusy){schedule();return;}if(!record.f.name.trim()&&!record.f.archived){toast('請先填家庭名稱，再同步 Drive。');return;}if(record.remote&&record.syncedRev===record.rev)return;syncBusy=true;status();const rev=record.rev;const snapshot=structuredClone(record.f);try{await localChain;if(failures.has(record.id))throw Error('本機儲存失敗');for(const p of snapshot.photos)if(!p.driveId){const upload=await drive.upload(p.name,await photoBlob(p),'photo-v1',snapshot.id);p.driveId=upload.id;const live=record.f.photos.find(x=>x.id===p.id);if(live)live.driveId=p.driveId;}if(!record.remote&&!record.reservedId){record.reservedId=await drive.reserve();await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');}const previousAttempt=record.attemptBase;record.attemptBase=await digest(snapshot);await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');const saved=await drive.save(snapshot,record.remote,'family-v1',record.reservedId,previousAttempt);const loaded=await drive.load(saved.id);if(loaded.data.id!==snapshot.id||loaded.base!==await digest(snapshot))throw Error('雲端讀回不一致，未標記同步成功');record.remote={id:saved.id,version:loaded.version,etag:loaded.etag,base:loaded.base};record.syncError='';blocked.delete(record.id);record.syncedAt=Date.now();record.syncedRev=rev;await persist(record);}catch(e){record.syncError=e.message;if(e.status===401){forgetGrant();sessionMessage('remember',null);}if(!record.remote&&e.remoteId)record.remote={id:e.remoteId};if(/衝突|條件寫入|儲存失敗|無法安全|權限/.test(e.message)||e.status===403)blocked.add(record.id);else if(ready()){clearTimeout(syncTimer);syncTimer=setTimeout(drain,15000);}if(blocked.has(record.id)&&entry===record&&e.message.includes('衝突')&&!$('foot').textContent.includes('保留本機副本'))$('foot').append(button('保留本機副本並載入雲端版本',resolveConflict));}finally{syncBusy=false;status();list();if(record.rev>rev&&!blocked.has(record.id))schedule();}}
async function connect(session=null){const id=$('clientId').value.trim()||window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';if(!id.endsWith('.apps.googleusercontent.com')){toast('需先設定 App 專用的 Google OAuth 用戶端 ID。');return;}if(connecting||syncBusy)return;connecting=true;try{localStorage.setItem('liliOAuthClientId',id);await drive.connect(id,session);const grant={token:drive.token,expires:drive.expires};sessionMessage('remember',grant);await rememberGrant(db,grant).catch(()=>{});$('setup').close();$('connection').textContent='已連接保姆 Google Drive';const files=await drive.families();for(const file of files){const known=records.find(r=>r.remote?.id===file.id);if(known&&(known.rev!==known.syncedRev||known.remote.base&&known.remote.version===file.version))continue;const loaded=await drive.load(file.id);const f=loaded.data.schema===2?normalize(loaded.data):migrate(loaded.data,legacyText(loaded.data));let r=known||records.find(x=>x.id===f.id);if(r&&r.rev!==r.syncedRev){toast('發現同一家庭的本機未同步修改，保留草稿，沒有覆寫。');continue;}if(!r){r={id:f.id};records.push(r);}Object.assign(r,{f,remote:{id:file.id,version:loaded.version,etag:loaded.etag,base:loaded.base},rev:1,syncedRev:loaded.data.schema===2?1:0});await persist(r);}list();if(entry){entry=records.find(x=>x.id===entry.id);if(entry?.f.archived&&!archiveView)entry=null;render();}await syncBrand(true);blocked.clear();toast('已載入雲端資料，未同步的原瀏覽器草稿會依序同步。');}catch(e){if(e.status===401){forgetGrant();sessionMessage('remember',null);}toast('連線未完成：'+e.message);}finally{connecting=false;schedule();status();}}
function dataURL(blob){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});}
async function backup(){if(!entry)return;try{await localChain;const f=structuredClone(entry.f),originals={};for(const p of f.photos)originals[p.id]=await dataURL(await photoBlob(p));download(new Blob([JSON.stringify({format:'lili-homecare-backup',version:2,family:f,originals,brand})],{type:'application/json'}),(f.name||'家庭')+'_完整內部備份.json');toast('完整備份已交給瀏覽器下載，內含原始照片，請勿傳給家長。');}catch(e){toast('備份未完成：'+e.message);}}
async function restore(file){try{const b=JSON.parse(await file.text());if(b.format!=='lili-homecare-backup'||![1,2].includes(b.version)||!b.originals)throw Error('不是完整備份');const f=b.version===2?normalize(b.family):migrate(b.family,legacyText(b.family));const staged=[];for(const p of f.photos){const data=b.originals[p.id];if(typeof data!=='string'||!data.startsWith('data:'+p.mime+';base64,'))throw Error('照片原檔缺漏：'+p.name);const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));if(bytes.length!==p.size)throw Error('照片原檔大小不符');const newId=crypto.randomUUID();staged.push([newId,new Blob([bytes],{type:p.mime})]);p.id=newId;delete p.driveId;}if(!await confirmAction('還原成獨立家庭副本？','會保留現有資料，不會覆蓋同名家庭。','確認還原'))return;for(const[id,blob]of staged)await db.put('photos',blob,id);f.id=crypto.randomUUID();f.name+='（還原副本）';const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);if(b.brand&&Object.keys(brandDefaults).every(k=>typeof b.brand[k]==='string')&&await confirmAction('也還原共用品牌設定？','這會更新本機及後續同步的全家庭共用設定。','還原品牌設定')){brand=readBrand({service:b.brand.service,promise:b.brand.promise,contact:b.brand.contact});brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',brand,'brand');}schedule();toast('已還原為原瀏覽器草稿，請確認內容後同步 Drive。');}catch(e){toast('還原失敗：'+e.message);}finally{$('restoreFile').value='';}}
$('new').onclick=()=>newRecord();$('demo').onclick=()=>newRecord(true);$('search').oninput=list;$('families').onclick=e=>{const b=e.target.closest('[data-id]');if(b){if(photoBusy){toast('請等待照片保存完成');return;}openRecord(b.dataset.id);}};$('cloud').onclick=()=>{$('clientId').value=window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';$('setup').showModal();};$('closeSetup').onclick=()=>$('setup').close();$('connectSetup').onclick=()=>connect();$('restore').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);};$('photoFiles').onchange=e=>addPhotos([...e.target.files]);$('closePhoto').onclick=()=>$('lightbox').close();$('lightbox').onclose=()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('fullPhoto').removeAttribute('src');};window.addEventListener('online',()=>{if(ready())schedule();else resumeConnection();status();});window.addEventListener('offline',status);window.addEventListener('beforeunload',e=>{if(localFailure||photoBusy||[...pending.values()].some(Boolean)){e.preventDefault();e.returnValue='';}});list();const last=await db.get('settings','lastFamily');if(last&&records.some(r=>r.id===last&&!r.f.archived))await openRecord(last);

$('archive').onclick=()=>{archiveView=!archiveView;$('archive').textContent=archiveView?'返回家庭檔案':'已刪除家庭';entry=null;render();};
$('brandEdit').onclick=()=>{for(const key of Object.keys(brandDefaults))$(key).value=brand[key];$('brandStatus').textContent=brandState.error|| (brandState.dirty?'已存本機，等待雲端同步':brandState.remote?'已同步至 Drive':'此裝置的設定');$('brandDialog').showModal();};
$('brandClose').onclick=()=>$('brandDialog').close();
async function syncBrand(pull=false){
 try{
  const role='brand-v1',id='shared-brand';if(!brandState.remote||pull){
   const files=await drive.list("'"+drive.root+"' in parents and trashed=false and appProperties has {key='liliRole' and value='brand-v1'}");
   if(files.length>1)throw Error('品牌設定有多份，請先保留本機備份');
   if(files.length){const remote=await drive.load(files[0].id);
    if(!brandState.dirty){brand=readBrand(remote.data.settings);await db.put('settings',brand,'brand');pdf=null;}
    else if(remote.base!==brandState.remote?.base&&remote.base!==await digest({id,name:'共用品牌設定',settings:brand}))throw Error('品牌設定有其他裝置的修改，兩邊內容均已保留');
    brandState.remote={id:files[0].id,version:remote.version,base:remote.base};
   }
  }
  if(brandState.dirty){const savedBrand=structuredClone(brand),data={id,name:'共用品牌設定',settings:savedBrand};
   if(!brandState.reservedId){brandState.reservedId=await drive.reserve();await db.put('settings',brandState,'brandSync');}
   const saved=await drive.save(data,brandState.remote,role,brandState.reservedId),read=await drive.load(saved.id);
   if(read.base!==await digest(data))throw Error('品牌設定讀回不一致');
   brandState.remote={id:saved.id,base:read.base,version:read.version};brandState.dirty=JSON.stringify(savedBrand)!==JSON.stringify(brand);
  }
  brandState.error='';await db.put('settings',brandState,'brandSync');
 }catch(e){brandState.error=e.message;}
 $('brandEdit').title=brandState.error||'全家庭共用設定';
}
$('brandSave').onclick=async()=>{const next=Object.fromEntries(Object.keys(brandDefaults).map(k=>[k,$(k).value]));try{brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',next,'brand');brand=next;pdf=null;$('brandDialog').close();render();schedule();toast('品牌設定已存本機，連線後同步到保姆 Drive');}catch(e){toast('品牌設定未保存：'+e.message);}};
async function sessionMessage(type,value){
 try{if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.ready,worker=reg.active;if(!worker)return;
 const channel=new MessageChannel();return await new Promise(resolve=>{const t=setTimeout(()=>resolve(null),800);channel.port1.onmessage=e=>{clearTimeout(t);resolve(e.data);};worker.postMessage({type,value},[channel.port2]);});}catch{return null;}
}
async function resumeConnection(){
 if(!navigator.onLine||ready()||connecting)return;
 const session=await recallGrant(db)||await sessionMessage('recall');
 if(session?.expires>Date.now()+5000&&navigator.onLine&&!connecting)await connect(session);
}
if('serviceWorker' in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(ready())sessionMessage('remember',{token:drive.token,expires:drive.expires});
 });
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(resumeConnection).catch(()=>{});
}
setInterval(status,15000);status();

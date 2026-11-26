import {rememberGrant,recallGrant,forgetGrant} from './tab-grant.mjs?v=2.0.1126.16';
import {mixedPlan,mixedCare,mixedService,defaultRates,readRates,days,travel,rate,holidayRows,quoteKey,savedQuote,quoteLines,money,overtimeText} from './quote.mjs?v=2.0.1126.16';
import {brandDefaults,readBrand} from './brand.mjs?v=2.0.1126.16';

import {matchesFamily,prepareLegacyBatch,noteSpecs,noteRows,writeNoteRows,noteCycle,noteActive,bindPendingNotes,activeFamily,bookingSegments,bookingLines,serviceName,fresh,blanks,fields,titles,day,filename,mediaLabel,warnings,publicBlocks,tasks,sourceKey,normalize,migrate} from './workspace-model.mjs?v=2.0.1126.16';
import {makeText as legacyText} from './model.mjs?v=2.0.1126.16';
import {DriveStore,digest} from './drive.mjs?v=2.0.1126.16';
import {openDB,storeDB} from './drafts.mjs?v=2.0.1126.16';
import {buildPDF} from './plan-pdf.mjs?v=2.0.1126.16';
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
function list(){const term=$('search').value;$('families').innerHTML=records.filter(r=>!!r.f.archived===archiveView).filter(r=>matchesFamily(r.f,term)).map(r=>'<button data-id="'+esc(r.id)+'" class="'+(r.id===entry?.id?'active':'')+'">'+esc(r.f.name||'未命名家庭')+'<small>'+(r.syncedRev===r.rev&&r.remote?'Drive 已同步':'原瀏覽器草稿')+'</small>'+(r.f.importReview?'<small class="import-review-tag">◷ 舊資料待複核</small>':'')+'</button>').join('');}
async function openRecord(id){await localChain;entry=records.find(r=>r.id===id);if(!entry)return;undo=[];kind=Object.keys(entry.f.groups)[0];petIndex=0;view='service';pdf=null;await db.put('settings',id,'lastFamily');render();}
async function newRecord(demo=false){archiveView=false;$('archive').textContent='已刪除家庭';if(photoBusy){toast('請等待照片保存完成');return;}const f=fresh();if(demo){f.name='姆姆家四貓（操作範例）';f.groups.cat.pets=[{name:'姆姆',identity:'白底虎斑',personality:'慢熟，依他的步調靠近'}];f.groups.cat.food.dry={item:'範例飼料',amount:'三分之一',unit:'杯',location:'廚房右側下櫃',leftover:'移出洗碗後放回'};}const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);view='edit';render();}
function button(text,fn,cl=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cl;b.onclick=fn;return b;}
function heading(text){return labelText(document.createElement('h3'),text);}
function field(obj,key,label,{long=false,options=null,compact=false,placeholder=''}={}){const spec=!options&&entry&&noteSpecs(entry.f).find(s=>s.obj===obj&&s.key===key);if(spec)return careNoteField(spec,label,placeholder);const wrap=document.createElement('div');wrap.className='field'+(compact?' compact':'');const head=document.createElement('div');head.className='fieldhead';const l=document.createElement('span');labelText(l,label);head.append(l,button('清除',async()=>{if(!obj[key])return;if(await confirmAction('清除此欄？','只清除「'+label+'」，其他資料不變。','確認清除')){snapshot();obj[key]='';dirty();input.value='';}},'clear'));let input=document.createElement(options?'select':long?'textarea':'input');input.setAttribute('aria-label',label);input.placeholder=placeholder;
if(options){const values=['',...new Set([...options,...(obj[key]&&!options.includes(obj[key])?[obj[key]]:[])])];for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v||'尚未確認';input.append(o);}input.onchange=()=>{snapshot();obj[key]=input.value;dirty();};}else input.oninput=()=>{snapshot();obj[key]=input.value;dirty();};input.value=obj[key]||'';wrap.append(head,input);return wrap;}

function resizeCareNote(t){t.style.height='auto';t.style.height=Math.max(t.scrollHeight+2,44)+'px';}
document.addEventListener('click',e=>{if(!e.target.closest?.('.care-note-flag-group'))document.querySelectorAll('.care-note-menu').forEach(m=>{m.hidden=true;m.parentElement.querySelector('.care-note-arrow')?.setAttribute('aria-expanded','false');});});
document.addEventListener('toggle',e=>{if(e.target instanceof HTMLDetailsElement&&e.target.open)requestAnimationFrame(()=>e.target.querySelectorAll('.care-note-body textarea').forEach(resizeCareNote));},true);
window.addEventListener('resize',()=>document.querySelectorAll('.care-note-body textarea').forEach(resizeCareNote));
function careNoteField(spec,label,placeholder){
 const f=entry.f,wrap=document.createElement('div');wrap.className='field care-note-field';
 const head=document.createElement('div');head.className='fieldhead';const title=document.createElement('span');labelText(title,label);head.append(title);wrap.append(head);
 const list=document.createElement('div');list.className='care-note-list';wrap.append(list);
 let rows=noteRows(spec);
 // An empty initial row is only persisted if the user interacts with it.
 const blank=()=>({id:crypto.randomUUID(),text:'',flag:spec.flag,temp:false,cycle:'',closed:false});
 if(!rows.length)rows=[blank()];
 const save=()=>{writeNoteRows(spec,rows);dirty();};
 const resize=resizeCareNote;
 const draw=focus=>{
  list.replaceChildren();
  for(const n of rows){
   const line=document.createElement('div');line.className='care-note-row';
   const body=document.createElement('div');body.className='care-note-body';
   const input=document.createElement('textarea');input.rows=1;input.value=n.text;input.placeholder=placeholder||'輸入一項交代';input.setAttribute('aria-label',label);body.append(input);
   const state=document.createElement('small');state.className='care-note-state';body.append(state);
   const actions=document.createElement('div');actions.className='care-note-actions';
   const flagGroup=document.createElement('div');flagGroup.className='care-note-flag-group';
   const flag=button('',()=>{snapshot();n.flag=!n.flag;save();paint();},'care-note-flag');
   const flagIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');flagIcon.setAttribute('viewBox','0 0 28 28');flagIcon.setAttribute('aria-hidden','true');
   flagIcon.innerHTML='<path d="M6 25V4 M6 5C12 0 17 10 23 4V17C17 23 12 12 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><g class="care-note-clock"><circle cx="21" cy="21" r="6.5" fill="#F8F5EE" stroke="currentColor" stroke-width="1.3"/><path d="M21 17V21L24 22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></g>';
   flag.append(flagIcon);
   const arrow=button('⌄',()=>toggleMenu(),'care-note-arrow');arrow.setAttribute('aria-label','旗標與有效期限');arrow.setAttribute('aria-expanded','false');
   const menu=document.createElement('div');menu.className='care-note-menu';menu.hidden=true;
   const toggleMenu=()=>{const open=menu.hidden;document.querySelectorAll('.care-note-menu').forEach(e=>{e.hidden=true;e.parentElement.querySelector('.care-note-arrow')?.setAttribute('aria-expanded','false');});menu.hidden=!open;arrow.setAttribute('aria-expanded',String(open));};
   const options=[['不加入小卡',false,false],['長期複核',true,false],['僅限本期複核',true,true],['僅限本期備註',false,true]];
   for(const [caption,flagged,temp] of options){menu.append(button(caption,()=>{snapshot();Object.assign(n,{flag:flagged,temp,cycle:temp?noteCycle(f):'',closed:false});save();menu.hidden=true;arrow.setAttribute('aria-expanded','false');paint();}));}
   const end=button('結束本期事項（保留歷史）',()=>{snapshot();n.closed=true;save();menu.hidden=true;arrow.setAttribute('aria-expanded','false');paint();});menu.append(end);
   let timer=null,longPress=false;
   flag.addEventListener('pointerdown',()=>{longPress=false;timer=setTimeout(()=>{longPress=true;toggleMenu();},480);});
   const stop=()=>clearTimeout(timer);for(const event of ['pointerup','pointercancel','pointerleave'])flag.addEventListener(event,stop);
   flag.addEventListener('contextmenu',e=>e.preventDefault());flag.addEventListener('click',e=>{if(longPress){longPress=false;e.preventDefault();e.stopImmediatePropagation();}},true);
   flagGroup.append(flag,arrow,menu);actions.append(flagGroup);
   const remove=button('×',async()=>{if(n.text.trim()&&!await confirmAction('刪除此項備註？','只移除這一項，不影響其他交代。','確認刪除'))return;snapshot();rows=rows.filter(r=>r.id!==n.id);if(!rows.length)rows=[blank()];save();draw();},'care-note-remove');remove.setAttribute('aria-label','刪除此項備註');actions.append(remove);
   function paint(){
    const active=noteActive(f,n);
    flagGroup.dataset.flag=n.flag?'yes':'no';flagGroup.dataset.temp=n.temp?'yes':'no';
    flag.setAttribute('aria-pressed',String(n.flag));flag.setAttribute('aria-label',n.flag?'取消加入照護小卡':'加入照護小卡');flag.title=(n.flag?'取消旗標':'加入小卡')+(n.temp?'・僅限本期':'');
    state.textContent=n.closed?'已結束・保留歷史':!active?'上期事項・待重新確認':'';
    state.hidden=!state.textContent;line.classList.toggle('care-note-expired',!active);end.hidden=!n.temp||n.closed;
    for(let i=0;i<options.length;i++){const [,v,t]=options[i];menu.children[i].classList.toggle('active',!n.closed&&active&&v===n.flag&&t===n.temp);}
   }
   input.oninput=()=>{snapshot();n.text=input.value;save();resize(input);};
   line.append(body,actions);list.append(line);paint();requestAnimationFrame(()=>{resize(input);if(focus===n.id)input.focus();});
  }
 };
 const add=button('＋ 新增備註',()=>{const n=blank();rows.push(n);draw(n.id);},'care-note-add');wrap.append(add);draw();return wrap;
}

function check(label,checked,fn){const l=document.createElement('label');l.className='check';const i=document.createElement('input');i.type='checkbox';i.checked=checked;i.onchange=()=>fn(i.checked);l.append(i);labelText(l,label);return l;}
function grid(){const e=document.createElement('div');e.className='grid';return e;}
function section(title,open=true){const e=document.createElement('details');e.open=open;const s=document.createElement('summary');s.textContent=title;const body=document.createElement('div');body.className='body';e.append(s,body);return {e,body};}
function quantity(o){const w=document.createElement('div');w.className='field';const h=document.createElement('div');h.className='fieldhead';h.textContent='每次份量';const row=document.createElement('div');row.className='amount';for(const [key,ph]of[['amount','三分之一'],['unit','杯']]){const input=document.createElement('input');input.value=o[key]||'';input.placeholder=ph;input.setAttribute('aria-label',key==='amount'?'份量':'份量單位');input.oninput=()=>{snapshot();o[key]=input.value;dirty();};const container=document.createElement('div');container.append(input,button('清除',async()=>{if(o[key]&&await confirmAction('清除這一格？','只清除'+(key==='amount'?'份量':'單位')+'，不影響其他資料。','確認清除')){snapshot();o[key]='';input.value='';dirty();}},'clear'));row.append(container);}w.append(h,row);return w;}
function showConsent(){
 const el=$('mediaBadge');if(!el||!entry)return;
 const media=entry.f.media;const spec={obj:media,key:'note',flag:false,prefix:''};const noteText=noteRows(spec).filter(r=>noteActive(entry.f,r)&&r.text.trim()).map(r=>r.text).join('\n');
 el.dataset.consent=media.status;
 const label=document.createElement('span');label.textContent='服務影像對外分享';
 const state=document.createElement('strong');state.textContent=({yes:'我願意分享',no:'我不願意分享'})[media.status]||'尚未確認';
 el.replaceChildren(label,state);
 if(noteText.trim()){const note=document.createElement('small');note.textContent='拍攝與分享備註　'+noteText;el.append(note);}
}
function frame(){const f=entry.f;$('main').innerHTML='<div class="filehead"><div><h1>'+esc(f.name||'未命名家庭')+'</h1><span class="muted">'+esc((bookingSegments(f.booking).length?bookingSegments(f.booking).map(r=>r.a+(r.a===r.b?'':'～'+r.b)).join('、'):f.booking.dates)||'本次預約尚未填寫')+'</span></div><div class="badge" id="mediaBadge"></div></div><span id="saveState" class="save" role="status"></span><div id="nav" class="nav"></div><div id="content"></div><div id="foot" class="foot"></div>';showConsent();if(f.importReview){const banner=document.createElement('div');banner.className='issue import-review-banner';banner.textContent='◷ 舊資料待複核｜請與家長確認最新醫囑、飲食、安全、預約及價格。';banner.append(button('確認本期資料已複核',async()=>{if(!await confirmAction('確認已複核舊資料？','請先核對毛寶身分、醫囑、餵食份量、門窗安全及本期預約。此動作只移除待複核標記，不修改內容。','確認已複核'))return;snapshot();f.importReview=false;f.importReviewedAt=new Date().toISOString();dirty();render();}));$('content').before(banner);}for(const [v,t]of[['service','本次照護'],['edit','編輯家訪資料'],['photos','內部照片'],['plan','A4 計畫書']])$('nav').append(button(t,async()=>{if(photoBusy){toast('照片正在保存，請稍候。');return;}await localChain;view=v;render();},view===v?'active':''));$('foot').append(button('立即同步 Drive',()=>{if(!ready()){toast('目前無法同步，請確認網路或重新連接 Google Drive。');return;}blocked.delete(entry.id);entry.syncError='';schedule();}),button('下載完整備份（內部）',backup),button('復原上一步',()=>{if(!undo.length){toast('目前沒有可復原的修改');return;}entry.f=JSON.parse(undo.pop());dirty();render();}));$('foot').append(button(f.archived?'復原家庭':'刪除家庭',async()=>{
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
function renderEdit(content){const f=entry.f;if(f.importOriginal&&!f.importReview){const revisit=crmEl('div','','row');revisit.append(button('重新標為舊資料待複核',async()=>{if(!await confirmAction('重新標為待複核？','資料與歷史報價都會保留。','確認'))return;snapshot();f.importReview=true;delete f.importReviewedAt;dirty();render();}));content.append(revisit);}if(f.importOriginal){const archive=section('舊版家訪原始紀錄（內部）',false);const pre=document.createElement('pre');pre.className='legacy-original';pre.textContent=f.importOriginal;archive.body.append(pre);content.append(archive.e);}
if(!f.groups[kind]){kind=Object.keys(f.groups)[0];petIndex=0;}
let s=section('本次預約與家長資料');let g=grid();for(const[k,l]of[['name','家庭代表名（也用於檔名）']])g.append(field(f,k,l));s.body.append(g);if(f.booking.dates||f.booking.times){const old=section('舊版預約紀錄',false);old.body.append(field(f.booking,'dates','舊版預約日期'),field(f.booking,'times','舊版時段'));s.body.append(old.e);}s.body.append(bookingEditor(f.booking,f.groups),quotePanel(f));g=grid();for(const[k,l]of[['name','家長姓名／稱呼'],['phone','電話'],['emergency','緊急聯絡人與電話'],['address','服務地址'],['guide','位置指引（選填）']])g.append(field(f.contact,k,l));s.body.append(g);content.append(s.e);
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
function renderService(content){const f=entry.f;const p=document.createElement('div');p.className='panel';p.append(heading('本次照護'));const desc=document.createElement('p');desc.textContent=bookingLines(f.booking,f.groups).join('\n')||'先到編輯家訪資料填寫本次預約。';desc.style.whiteSpace='pre-line';p.append(desc);const issues=warnings(f);for(const t of issues){const el=document.createElement('div');el.className='issue';el.textContent=t;p.append(el);}content.append(p);
if(f.importReview){const q=document.createElement('p');q.className='muted';q.textContent='請先複核舊資料，再建立本期照護小卡。';content.append(q,button('前往編輯家訪資料',()=>{view='edit';render();}));return;}const run=f.runs.at(-1);content.append(button(run?'建立下一趟勾選':'建立本趟照護小卡',async()=>{const warn=warnings(f);if(warn.length&&!await confirmAction('還有資料待確認','目前有 '+warn.length+' 項待確認。仍可建立小卡，現場請勿自行推測缺漏指示。','仍建立小卡'))return;const d=day();snapshot();f.runs.push({id:crypto.randomUUID(),label:d.year+'/'+d.month+'/'+d.day+' 第 '+(f.runs.length+1)+' 趟',createdAt:new Date().toISOString(),source:sourceKey(f),tasks:tasks(f),checks:{}});dirty();render();},'primary'));
if(!run){const q=document.createElement('p');q.className='muted';q.textContent='離場前複核小卡只顯示已插旗的個別交代，勾選記錄按趟保留。';content.append(q);return;}
const head=document.createElement('div');head.className='panel';head.append(heading(run.label));const stale=run.source!==sourceKey(f);if(stale){const el=document.createElement('div');el.className='issue';el.textContent='主資料已修改，這張小卡需要更新。已完成勾選不會套用到新的指示。';head.append(el,button('依最新資料更新本趟小卡',async()=>{if(await confirmAction('更新本趟小卡？','本趟原始小卡會保留為上一筆記錄，另建更新版；勾選從頭確認。','建立更新版')){snapshot();f.runs.push({id:crypto.randomUUID(),label:run.label+'（更新）',createdAt:new Date().toISOString(),source:sourceKey(f),tasks:tasks(f),checks:{}});dirty();render();}}));}
if(!run.tasks.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='本趟無特殊複核事項。';head.append(empty);}for(const t of run.tasks){const l=document.createElement('label');l.className='task'+(run.checks[t.id]?' done':'');const c=document.createElement('input');c.type='checkbox';c.checked=!!run.checks[t.id];c.onchange=()=>{snapshot();run.checks[t.id]=c.checked;dirty();l.classList.toggle('done',c.checked);};const body=document.createElement('div');const title=document.createElement('strong');title.textContent=t.title;const detail=document.createElement('p');detail.textContent=t.detail;body.append(title,detail);l.append(c,body);head.append(l);}content.append(head);
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
async function generate(){if(owner.f.importReview){toast('請先複核舊資料，再產生本期計畫書。');return null;}const warn=warnings(entry.f);if(savedQuote(entry.f)&&savedQuote(entry.f).key!==quoteKey(entry.f))warn.push('本次報價已失效，需重新確認（PDF 不會帶入舊報價）');if(warn.length&&!await confirmAction('有 '+warn.length+' 項資料待確認',warn.join('\n')+'\n\n這份提醒只供保姆補問。仍可預覽給家長的計畫書。','仍產生預覽'))return null;if(owner!==entry||!content.isConnected)return null;const revision=owner.rev,settings=brand;
const result=await buildPDF(structuredClone(owner.f),{...settings});
if(owner!==entry||owner.rev!==revision||brand!==settings||!content.isConnected)return null;
currentPDF={result,revision,settings};preview.replaceChildren();for(const data of result.pages){const img=document.createElement('img');img.src=data;img.alt='A4 照護計畫書預覽';preview.append(img);}preview.hidden=false;return result;}
const actions=document.createElement('div');actions.className='actions';actions.append(button('產生／更新 A4 預覽',async()=>{try{await generate();}catch(e){toast('PDF 產生失敗：'+e.message);}},'primary'),button('下載 PDF',async()=>{try{const result=currentPDF?.revision===owner.rev&&currentPDF.settings===brand&&owner===entry?currentPDF.result:await generate();if(!result)return;const finalName=name.value.trim().replace(/[\\/:*?"<>]/g,'_')||result.name;await saveFile(result.blob,finalName.endsWith('.pdf')?finalName:finalName+'.pdf');}catch(e){if(e.name!=='AbortError')toast('下載未完成：'+e.message);}}));intro.append(actions);content.append(intro,preview);}
async function saveFile(blob,name){if('showSaveFilePicker'in window){try{const handle=await window.showSaveFilePicker({suggestedName:name,startIn:'downloads',types:[{description:'PDF 照護計畫書',accept:{'application/pdf':['.pdf']}}]});const writable=await handle.createWritable();await writable.write(blob);await writable.close();toast('PDF 已儲存到你選擇的位置。');return;}catch(e){if(e.name==='AbortError')return;if(e.name!=='SecurityError'&&e.name!=='NotAllowedError')throw e;}}download(blob,name);toast('PDF 已交給瀏覽器下載。請在系統下載／儲存畫面選擇你的照護計畫書資料夾。');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function sync(record){if(!record)return;if(!ready()){status();return;}if(syncBusy){schedule();return;}if(!record.f.name.trim()&&!record.f.archived){toast('請先填家庭名稱，再同步 Drive。');return;}if(record.remote&&record.syncedRev===record.rev)return;syncBusy=true;status();const rev=record.rev;const snapshot=structuredClone(record.f);try{await localChain;if(failures.has(record.id))throw Error('本機儲存失敗');for(const p of snapshot.photos)if(!p.driveId){const upload=await drive.upload(p.name,await photoBlob(p),'photo-v1',snapshot.id);p.driveId=upload.id;const live=record.f.photos.find(x=>x.id===p.id);if(live)live.driveId=p.driveId;}if(!record.remote&&!record.reservedId){record.reservedId=await drive.reserve();await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');}const previousAttempt=record.attemptBase;record.attemptBase=await digest(snapshot);await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');const saved=await drive.save(snapshot,record.remote,'family-v1',record.reservedId,previousAttempt);const loaded=await drive.load(saved.id);if(loaded.data.id!==snapshot.id||loaded.base!==await digest(snapshot))throw Error('雲端讀回不一致，未標記同步成功');record.remote={id:saved.id,version:loaded.version,etag:loaded.etag,base:loaded.base};record.syncError='';blocked.delete(record.id);record.syncedAt=Date.now();record.syncedRev=rev;await persist(record);}catch(e){record.syncError=e.message;if(e.status===401){forgetGrant();sessionMessage('remember',null);}if(!record.remote&&e.remoteId)record.remote={id:e.remoteId};if(/衝突|條件寫入|儲存失敗|無法安全|權限/.test(e.message)||e.status===403)blocked.add(record.id);else if(ready()){clearTimeout(syncTimer);syncTimer=setTimeout(drain,15000);}if(blocked.has(record.id)&&entry===record&&e.message.includes('衝突')&&!$('foot').textContent.includes('保留本機副本'))$('foot').append(button('保留本機副本並載入雲端版本',resolveConflict));}finally{syncBusy=false;status();list();if(record.rev>rev&&!blocked.has(record.id))schedule();}}
async function connect(session=null){const id=$('clientId').value.trim()||window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';if(!id.endsWith('.apps.googleusercontent.com')){toast('需先設定 App 專用的 Google OAuth 用戶端 ID。');return;}if(connecting||syncBusy)return;connecting=true;try{localStorage.setItem('liliOAuthClientId',id);await drive.connect(id,session);const grant={token:drive.token,expires:drive.expires};sessionMessage('remember',grant);await rememberGrant(db,grant).catch(()=>{});$('setup').close();$('connection').textContent='已連接保姆 Google Drive';const files=await drive.families();for(const file of files){const known=records.find(r=>r.remote?.id===file.id);if(known&&(known.rev!==known.syncedRev||known.remote.base&&known.remote.version===file.version))continue;const loaded=await drive.load(file.id);const f=loaded.data.schema===2?normalize(loaded.data):migrate(loaded.data,legacyText(loaded.data));let r=known||records.find(x=>x.id===f.id);if(r&&r.rev!==r.syncedRev){toast('發現同一家庭的本機未同步修改，保留草稿，沒有覆寫。');continue;}if(!r){r={id:f.id};records.push(r);}Object.assign(r,{f,remote:{id:file.id,version:loaded.version,etag:loaded.etag,base:loaded.base},rev:1,syncedRev:loaded.data.schema===2?1:0});await persist(r);}list();if(entry){entry=records.find(x=>x.id===entry.id);if(entry?.f.archived&&!archiveView)entry=null;render();}await syncBrand(true);blocked.clear();toast('已載入雲端資料，未同步的原瀏覽器草稿會依序同步。');}catch(e){if(e.status===401){forgetGrant();sessionMessage('remember',null);}toast('連線未完成：'+e.message);}finally{connecting=false;schedule();status();}}
function dataURL(blob){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});}

let importingLegacy=false;
async function importLegacy(file){
 if(importingLegacy||photoBusy)return toast('目前有其他資料正在處理，請稍後再操作。');
 importingLegacy=true;
 try{
  if(file.size>20*1024*1024)throw Error('匯入檔太大，請分批處理');
  if(!ready())throw Error('請先連接 Google Drive 並完成雲端家庭載入，避免重複匯入');
  await localChain;
  const packet=JSON.parse(await file.text());
  let plan=prepareLegacyBatch(packet,records.map(r=>r.f));
  const dlg=document.createElement('dialog');dlg.className='crm-modal';
  const title=document.createElement('h2');title.textContent='舊客批次匯入預覽';
  const desc=document.createElement('p');desc.textContent='可新增 '+plan.accepted.length+' 戶，略過 '+plan.skipped.length+' 戶。只新增、不覆蓋；全部標記舊資料待複核。';
  dlg.append(title,desc);
  const details=document.createElement('div');details.className='legacy-preview';
  for(const f of plan.accepted){const p=document.createElement('p');p.textContent='新增｜'+f.name;details.append(p);}
  for(const s of plan.skipped){const p=document.createElement('p');p.textContent='略過｜'+s.name+'：'+s.reason;details.append(p);}
  dlg.append(details);
  const actions=document.createElement('div');actions.className='row';
  const proceed=button('確認匯入 '+plan.accepted.length+' 戶',()=>dlg.close('yes'),'primary');proceed.disabled=!plan.accepted.length;
  actions.append(button('取消',()=>dlg.close('no')),proceed);dlg.append(actions);document.body.append(dlg);
  const answer=await new Promise(resolve=>{dlg.addEventListener('close',()=>resolve(dlg.returnValue==='yes'),{once:true});dlg.showModal();});dlg.remove();
  if(!answer)return;
  if(!ready())throw Error('雲端連線已失效，請重新連接後再匯入');
  plan=prepareLegacyBatch(packet,records.map(r=>r.f));
  let count=0;const failed=[];
  for(const f of plan.accepted){
   const r={id:f.id,f,remote:null,rev:1,syncedRev:0};
   try{await db.put('families',r);records.push(r);count++;}catch(e){failed.push(f.name);}
  }
  list();schedule();
  toast('已新增 '+count+' 戶本機家庭草稿，略過 '+plan.skipped.length+' 戶；將沿用既有 Drive 同步流程。'+(failed.length?'\n未保存：'+failed.join('、'):'')+'\n請確認同步完成後再進行跨瀏覽器驗收。');
 }catch(e){toast('匯入未完成：'+e.message);}finally{importingLegacy=false;$('legacyImportFile').value='';}
}
async function backup(){if(!entry)return;try{await localChain;const f=structuredClone(entry.f),originals={};for(const p of f.photos)originals[p.id]=await dataURL(await photoBlob(p));download(new Blob([JSON.stringify({format:'lili-homecare-backup',version:2,family:f,originals,brand})],{type:'application/json'}),(f.name||'家庭')+'_完整內部備份.json');toast('完整備份已交給瀏覽器下載，內含原始照片，請勿傳給家長。');}catch(e){toast('備份未完成：'+e.message);}}
async function restore(file){try{const b=JSON.parse(await file.text());if(b.format!=='lili-homecare-backup'||![1,2].includes(b.version)||!b.originals)throw Error('不是完整備份');const f=b.version===2?normalize(b.family):migrate(b.family,legacyText(b.family));const staged=[];for(const p of f.photos){const data=b.originals[p.id];if(typeof data!=='string'||!data.startsWith('data:'+p.mime+';base64,'))throw Error('照片原檔缺漏：'+p.name);const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));if(bytes.length!==p.size)throw Error('照片原檔大小不符');const newId=crypto.randomUUID();staged.push([newId,new Blob([bytes],{type:p.mime})]);p.id=newId;delete p.driveId;}if(!await confirmAction('還原成獨立家庭副本？','會保留現有資料，不會覆蓋同名家庭。','確認還原'))return;for(const[id,blob]of staged)await db.put('photos',blob,id);f.id=crypto.randomUUID();f.name+='（還原副本）';const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);if(b.brand&&['service','promise','contact'].every(k=>typeof b.brand[k]==='string')&&await confirmAction('也還原共用品牌設定？','這會更新本機及後續同步的全家庭共用設定。','還原品牌設定')){brand=readBrand({service:b.brand.service,promise:b.brand.promise,contact:b.brand.contact,rates:b.brand.rates||brandDefaults.rates});brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',brand,'brand');}schedule();toast('已還原為原瀏覽器草稿，請確認內容後同步 Drive。');}catch(e){toast('還原失敗：'+e.message);}finally{$('restoreFile').value='';}}
$('new').onclick=()=>newRecord();$('demo').onclick=()=>newRecord(true);$('search').oninput=list;$('families').onclick=e=>{const b=e.target.closest('[data-id]');if(b){if(photoBusy){toast('請等待照片保存完成');return;}openRecord(b.dataset.id);}};$('cloud').onclick=()=>{$('clientId').value=window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';$('setup').showModal();};$('closeSetup').onclick=()=>$('setup').close();$('connectSetup').onclick=()=>connect();$('legacyImport').onclick=()=>$('legacyImportFile').click();$('legacyImportFile').onchange=e=>{if(e.target.files[0])importLegacy(e.target.files[0]);};$('restore').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);};$('photoFiles').onchange=e=>addPhotos([...e.target.files]);$('closePhoto').onclick=()=>$('lightbox').close();$('lightbox').onclose=()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('fullPhoto').removeAttribute('src');};window.addEventListener('online',()=>{if(ready())schedule();else resumeConnection();status();});window.addEventListener('offline',status);window.addEventListener('beforeunload',e=>{if(localFailure||photoBusy||[...pending.values()].some(Boolean)){e.preventDefault();e.returnValue='';}});list();const last=await db.get('settings','lastFamily');if(last&&records.some(r=>r.id===last&&!r.f.archived))await openRecord(last);

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
$('brandSave').onclick=async()=>{const next={...brand,...Object.fromEntries(['service','promise','contact'].map(k=>[k,$(k).value]))};try{brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',next,'brand');brand=next;pdf=null;$('brandDialog').close();render();schedule();toast('品牌設定已存本機，連線後同步到保姆 Drive');}catch(e){toast('品牌設定未保存：'+e.message);}};
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
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});return resumeConnection();}).catch(()=>{});
}
setInterval(status,15000);status();

function bookingEditor(b,groups){
 const outer=document.createElement('div');const root=document.createElement('div');root.className='booking-editor';let a='',z='',edit=-1;let month=new Date();month.setDate(1);const mixed=Boolean(groups.cat&&groups.dog);
 const services=mixed?[mixedPlan]:groups.dog?['生活照顧','照顧＋散步']:['生活照顧','陪伴專案'];
 const blank=()=>({service:services[0],minutes:mixed?String(rate(groups.cat.pets.length,groups.dog.pets.length,mixedPlan,currentRates())?.min??''):'30',start:'',end:'',note:''});
 let visits=[blank()];
 const el=(tag,t,cl)=>{const n=document.createElement(tag);if(t)n.textContent=t;if(cl)n.className=cl;return n;};
 const line=()=>el('div','','row');
 const save=rs=>{snapshot();b.segments=rs.map(r=>JSON.stringify(r));if(rs.length){b.services=[...new Set(rs.flatMap(r=>r.visits.map(v=>v.service)))];}else if(!b.dates&&!b.times)b.services=[];bindPendingNotes(entry.f);dirty();if(modal.open)modal.close();render();};
 const wheel=(v,key)=>{const w=el('div','','booking-wheel');const val=v[key]||'';let h=val?Number(val.slice(0,2)):null,m=val?Number(val.slice(3)):null;const sync=()=>{v[key]=h===null||m===null?'':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');};for(const [values,get,set,label] of [[Array.from({length:24},(_,i)=>i),()=>h,x=>{h=x;sync();},'小時'],[[0,15,30,45],()=>m,x=>{m=x;sync();},'分鐘']]){const sc=el('div','','booking-scroll');sc.setAttribute('aria-label',label);const choices=[null,...values];for(const x of choices){const item=el('button',x===null?'—':String(x).padStart(2,'0'));item.type='button';item.onclick=()=>{sc.scrollTop=choices.indexOf(x)*32;set(x);};sc.append(item);}w.append(sc);let timer;sc.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{set(choices[Math.max(0,Math.min(choices.length-1,Math.round(sc.scrollTop/32)))]);},100);});requestAnimationFrame(()=>{sc.scrollTop=Math.max(0,choices.indexOf(get()))*32;});}return w;};
 const modal=crmDialog('新增／編輯預約',root);function draw(){root.replaceChildren();const nav=line();nav.append(button('‹',()=>{month.setMonth(month.getMonth()-1);draw();}),el('strong',month.getFullYear()+' 年 '+(month.getMonth()+1)+' 月'),button('›',()=>{month.setMonth(month.getMonth()+1);draw();}));root.append(nav);const cal=el('div','','booking-calendar');for(const d of ['日','一','二','三','四','五','六'])cal.append(el('small',d));for(let i=0;i<month.getDay();i++)cal.append(el('span'));for(let d=1;d<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();d++){const iso=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');cal.append(button(String(d),()=>{if(!a||z){a=iso;z='';}else{z=iso;if(z<a)[a,z]=[z,a];}draw();},iso===a||iso===z?'active':a&&z&&iso>a&&iso<z?'booking-between':''));}root.append(cal,el('p',a?(z?a+(a===z?'':' ～ '+z):a+'｜請選結束日期'):'選擇開始及結束日期，單日點兩次','muted'),el('strong','每日出勤次數'));const counts=line();for(let n=1;n<=4;n++)counts.append(button(n+' 次',()=>{while(visits.length<n)visits.push(blank());visits=visits.slice(0,n);draw();},visits.length===n?'active':''));root.append(counts);
 visits.forEach((v,i)=>{const card=el('div','','booking-visit');const top=line();top.append(el('strong','第 '+(i+1)+' 趟'));if(i)top.append(button('同第一趟方案',()=>{v.service=visits[0].service;v.minutes=visits[0].minutes;draw();}));card.append(top,el('small','預計抵達時段（選填）'));const times=line();for(const [key,label] of [['start','開始'],['end','結束']]){const part=el('div','','booking-time');part.append(el('small',label),wheel(v,key));times.append(part);}card.append(times);const note=el('input');note.placeholder='補充說明（選填）';note.value=v.note;note.oninput=()=>v.note=note.value;card.append(note,el('small','服務方案'));const options=line();for(const s of services)options.append(button(s,()=>{v.service=s;draw();},v.service===s||mixed&&mixedService(v.service)?'active':''));if(mixed)options.append(el('small',mixedCare));card.append(options,el('small','服務時間'));const mins=line();for(const m of ['30','40','45','50','60','70','75','80','90','120','180'])mins.append(button(m+' 分',()=>{v.minutes=m;draw();},v.minutes===m?'active':''));card.append(mins);const custom=crmInput(card,'自訂服務分鐘（選填）',v.minutes);custom.min='1';custom.max='720';custom.oninput=()=>v.minutes=custom.value;root.append(card);});
 root.append(button(edit<0?'＋ 新增此段預約':'儲存修改',()=>{if(!a||!z)return toast('請選擇完整日期區間');if(visits.some(v=>!/^\d+$/.test(v.minutes)||Number(v.minutes)<1||Number(v.minutes)>720))return toast('服務分鐘須為 1～720 的整數');if(visits.some(v=>!!v.start!==!!v.end||v.start&&v.end<=v.start))return toast('請確認每趟抵達時段的開始及結束時間');const rs=bookingSegments(b);if(rs.some((r,i)=>i!==edit&&a<=r.b&&z>=r.a))return toast('日期區間重疊，請編輯既有區段');const r={a,b:z,visits:structuredClone(visits)};if(edit<0)rs.push(r);else rs[edit]=r;rs.sort((x,y)=>x.a.localeCompare(y.a));edit=-1;a=z='';visits=[blank()];save(rs);},'active'));if(edit>=0)root.append(button('取消修改',()=>{edit=-1;a=z='';visits=[blank()];modal.close();}));
 }
 function summary(){outer.replaceChildren(button('＋ 新增預約',()=>{edit=-1;a=z='';visits=[blank()];draw();modal.showModal();},'primary'));const rs=bookingSegments(b);if(rs.length){outer.append(heading('已建立的預約'));rs.forEach((r,i)=>{const card=el('div','','booking-visit');const [period,...details]=bookingLines({segments:[JSON.stringify(r)]},groups);card.append(el('strong',period));for(const t of details.slice(0,-1))card.append(el('div',t));const actions=line();actions.append(button('編輯',()=>{edit=i;a=r.a;z=r.b;visits=structuredClone(r.visits);month=new Date(Number(a.slice(0,4)),Number(a.slice(5,7))-1,1);draw();modal.showModal();}),button('移除',async()=>{if(await confirmAction('移除此段預約？','其他預約不變。')){edit=-1;a=z='';visits=[blank()];save(rs.filter((_,j)=>j!==i));}}));card.append(actions);outer.append(card);});outer.append(el('strong',bookingLines(b,groups).at(-1)));}}
 summary();return outer;
}

function labelText(e,t){const m=String(t).match(/^(.*?)([（(][^（）()]+[）)])$/s);if(m&&m[1].trim())e.append(document.createTextNode(m[1]),crmEl('small',m[2],'label-qualifier'));else e.append(document.createTextNode(t));return e;}
function crmEl(tag,t='',cl=''){const e=document.createElement(tag);e.textContent=t;e.className=cl;return e;}
function crmDialog(title,body){const d=crmEl('dialog','','crm-modal');d.append(heading(title),body,button('關閉／取消',()=>d.close()));d.addEventListener('close',()=>{if(!d.open)d.remove();});const show=d.showModal.bind(d);d.showModal=()=>{if(!d.isConnected)document.body.append(d);show();};return d;}
function crmInput(parent,label,value='',type='number',step='1'){const l=labelText(crmEl('label'),label);const i=crmEl('input');i.type=type;if(type==='number')i.step=step;i.value=value;l.append(i);parent.append(l);return i;}
function crmCheck(parent,label,value){const l=crmEl('label');const i=crmEl('input');i.type='checkbox';i.checked=value;l.append(i,document.createTextNode(label));parent.append(l);return i;}
function currentRates(){try{return readRates(brand.rates);}catch{return structuredClone(defaultRates);}}
function quotePanel(f){const root=crmEl('div','','panel');const q=savedQuote(f);root.append(heading('本次照護報價'),crmEl('p',q?(q.key!==quoteKey(f)?'預約或毛寶數量已變更，請重新確認報價':money(q.total)+'｜已確認報價'):'尚未確認報價'),button('開啟報價試算器',()=>quoteDialog(f),'primary'),button('加時照護費用'+(f.booking.overtime?'｜每15分 '+money(Number(f.booking.overtimeFee)):'｜未啟用'),()=>overtimeDialog(f)),button('歷史報價紀錄',()=>historyDialog(f)));return root;}

function quoteDialog(f){
 const b=f.booking,rs=bookingSegments(b),r=currentRates(),old=savedQuote(f),c=f.groups.cat?.pets.length||0,d=f.groups.dog?.pets.length||0,same=old?.key===quoteKey(f);
 const body=crmEl('div'),dlg=crmDialog('本次照護報價',body);body.className='quote-body';
 body.append(crmEl('p',c+' 喵寶／'+d+' 犬寶 · 依家庭毛寶活頁統計'));if(f.importReview)body.append(crmEl('p','舊資料待複核不影響試算；未確認保存不會改動正式報價。','muted'));
 if(!c&&!d)body.append(crmEl('p','尚未建立毛寶活頁，無法自動判定費率。請先補毛寶資料，或自行設定本次價格。','issue'));
 let special={};try{special=JSON.parse(b.familyRates||'{}')||{};}catch{}
 if(typeof special!=='object'||Array.isArray(special))special={};
 const items=new Map();for(const seg of rs)for(const v of seg.visits){const k=v.service+'|'+v.minutes;if(!items.has(k))items.set(k,{k,service:v.service,min:Number(v.minutes),n:0});items.get(k).n+=days(seg.a,seg.b);}
 const modeBox=crmEl('div','','booking-visit');modeBox.append(heading('計價方式'));body.append(modeBox);
 const mode=crmEl('select');mode.setAttribute('aria-label','計價方式');
 const options=[['standard','依現行標準費率'],['manual','自行設定本次價格'],['special','沿用家庭專屬價']];
 for(const [v,t] of options){const o=crmEl('option',t);o.value=v;mode.append(o);}modeBox.append(mode);
 const modeHint=crmEl('p','','muted');modeBox.append(modeHint);const statusBox=crmEl('div','','quote-status'),totalValue=crmEl('strong','尚未完成'),hourValue=crmEl('div','照護時薪：待試算'),blocker=crmEl('p','','quote-blocker');statusBox.append(crmEl('small','本次報價合計'),totalValue,hourValue,blocker);body.append(statusBox);
 const form=crmEl('div','','crm-fields');body.append(form);
 const km=crmInput(form,'單程機車導航公里',old?.km??'','number','0.1');km.min='0';km.placeholder='例如 5.3';
 const travelText=crmEl('p','','muted');body.append(travelText);if(!rs.length){body.append(crmEl('p','尚未建立本期預約。請先新增日期、服務方案、時間及趟數。','issue'),button('返回編輯預約',()=>{dlg.close();view='edit';render();}));}
 if(c&&d)body.append(crmEl('p',mixedCare));
 const rows=[];
 for(const x of items.values()){
  const std=rate(c,d,x.service,r),box=crmEl('div','','booking-visit');
  const label=x.min+' 分鐘'+(c&&d?mixedPlan:x.service==='生活照顧'?'生活照顧方案':x.service);
  if(c&&d&&x.service===mixedPlan&&special[x.k]===undefined){const fees=Object.entries(special).filter(([k])=>k.split('|')[1]===String(x.min)&&mixedService(k.split('|')[0])).map(([,v])=>v);if(fees.length&&new Set(fees.map(Number)).size===1)special[x.k]=fees[0];}
  box.append(crmEl('strong',label+' × '+x.n+' 趟'));
  const priceText=crmEl('p');box.append(priceText);
  const override=crmInput(box,'單趟照護費（不含車馬）','');override.min='0';
  const sub=crmEl('p','','muted'),fix=button('改為自行設定本次價格',()=>{applyMode('manual');override.focus();});box.append(sub,fix);body.append(box);
  rows.push({...x,label,std,override,priceText,sub,fix});
 }
 const adjBox=crmEl('div','','booking-visit');adjBox.append(heading('額外費用調整（本期）'));body.append(adjBox);
 const adjMode=crmEl('select');adjMode.setAttribute('aria-label','額外費用調整方式');
 for(const [v,t]of[['none','無'],['add','額外加收'],['discount','優惠折抵']]){const o=crmEl('option',t);o.value=v;adjMode.append(o);}
 adjBox.append(adjMode);
 const adjForm=crmEl('div','','crm-fields');adjBox.append(adjForm);
 const oldAdj=same?Number(old.adjust)||0:0;
 adjMode.value=oldAdj<0?'discount':oldAdj>0?'add':'none';
 const adjust=crmInput(adjForm,'調整金額',Math.abs(oldAdj));adjust.min='0';
 const reason=crmInput(adjForm,'調整原因',same?old.reason||'':'','text');
 const advanced=document.createElement('details');advanced.className='quote-advanced';const summary=crmEl('summary','進階報價設定');advanced.append(summary);body.append(advanced);
 const af=crmEl('div','','crm-fields');advanced.append(af);
 const travelOverride=crmInput(af,'自訂每趟車馬費（選填）',same?old.travel??'':'');travelOverride.min='0';travelOverride.placeholder='留空依公里自動計算';
 const diff=labelText(crmEl('label'),'照護難度（內部）'),select=crmEl('select');for(const x of ['易','中','偏難']){const o=crmEl('option',x);o.value=x;select.append(o);}select.value=old?.difficulty||'易';diff.append(select);af.append(diff);
 const individual=c&&d?crmCheck(advanced,'本次需個別報價（較長散步或特殊複雜環境）',same&&old.individual===true):null;
 const exclude=crmCheck(advanced,'本次排除特殊檔期加價',same&&old.exclude===true);
 const reference=crmEl('div','內部定價參考線（非正式費率）\nNT$800／小時：一般基礎照護\nNT$950／小時：理想勞務報酬\nNT$1,050～1,100／小時：高負荷照護\nNT$1,100～1,200／小時：低承接意願、高不確定性','crm-ref');const referenceActual=crmEl('strong','本次實際照護時薪：待試算','quote-reference-actual');reference.prepend(referenceActual);advanced.append(reference);
 const result=crmEl('div','','crm-result');body.append(result);
 const keep=crmCheck(body,'將本次單趟費率保留為家庭專屬價（不含本期優惠與加收）',false);
 const clearSpecial=button('清除家庭專屬價',async()=>{if(!await confirmAction('清除家庭專屬價？','歷史成交價不變。'))return;snapshot();b.familyRates='';special={};dirty();if(mode.value==='special')applyMode('standard');refreshOptions();calc();toast('已清除家庭專屬價');});
 advanced.append(clearSpecial);
 const actions=crmEl('div','','crm-actions');body.append(actions);
 let calculated=null,useSavedHolidays=!!same;
 const confirm=button('確認並保存本次報價',()=>{if(!calculated)return;const previous=savedQuote(f);snapshot();if(previous){b.quoteHistory=[...(b.quoteHistory||[]),JSON.stringify(previous)].slice(-100);}b.quote=JSON.stringify(calculated);if(keep.checked&&mode.value==='manual'){const next={...special};for(const x of calculated.rows)next[x.k]=x.fee;if(travelOverride.value.trim()!=='')next.travel=calculated.travel;b.familyRates=JSON.stringify(next);}dirty();dlg.close();render();},'primary');actions.append(confirm);
 const validFee=x=>x!==''&&x!==undefined&&x!==null&&Number.isSafeInteger(Number(x))&&Number(x)>=0;
 const hasSpecial=()=>rows.some(x=>validFee(special[x.k]))||validFee(special.travel);
 const standardFee=x=>x.std&&x.min===x.std.min&&!individual?.checked?x.std.fee:undefined;
 function refreshOptions(){mode.options[2].disabled=!hasSpecial();mode.options[2].textContent=hasSpecial()?'沿用家庭專屬價':'沿用家庭專屬價（尚無適用價格）';clearSpecial.hidden=!Object.keys(special).length;}
 function applyMode(v){mode.value=v;useSavedHolidays=false;if(v==='standard'||v==='special'){if(individual)individual.checked=false;if(v==='special'&&validFee(special.travel))travelOverride.value=special.travel;for(const x of rows)x.override.value=v==='special'&&validFee(special[x.k])?special[x.k]:(standardFee(x)??'');}else{for(const x of rows)if(x.override.value.trim()==='')x.override.value=x.std?.fee??'';}keep.checked=false;calc();}
 function calc(){
  calculated=null;confirm.disabled=true;totalValue.textContent='尚未完成';hourValue.textContent='照護時薪：待試算';referenceActual.textContent='本次實際照護時薪：待試算';blocker.hidden=false;const fail=msg=>{blocker.textContent=msg;result.textContent=msg;};
  adjForm.hidden=adjMode.value==='none';
  keep.parentElement.hidden=mode.value!=='manual';
  modeHint.textContent=mode.value==='manual'?'輸入每種服務的單趟價格；勾選保留才會成為下次專屬價。':mode.value==='special'?'已建立專屬價的項目優先使用；其他項目使用符合條件的現行標準費率。':'依毛寶數量與服務時間套用現行標準費率。';
  const k=Number(km.value),tv=travelOverride.value.trim()===''?travel(k):Number(travelOverride.value),rawA=Number(adjust.value),a=adjMode.value==='none'?0:rawA*(adjMode.value==='discount'?-1:1);
  const validTravel=km.value!==''&&Number.isFinite(k)&&k>=0&&Math.abs(k*10-Math.round(k*10))<=1e-8&&tv!==null&&Number.isSafeInteger(tv)&&tv>=0;
  travelText.textContent=validTravel?'每趟車馬費：'+money(tv)+(travelOverride.value.trim()?'（自訂）':'（自動計算）'):'請輸入單程公里；30.1 公里以上請在進階設定填車馬費。';
  let missing='';
  const output=[];
  for(const x of rows){
   const std=standardFee(x),sp=validFee(special[x.k]),manual=mode.value==='manual',chosen=manual?(x.override.value.trim()===''?undefined:Number(x.override.value)):mode.value==='special'&&sp?Number(special[x.k]):std;
   x.override.parentElement.hidden=!manual;
   x.fix.hidden=manual||validFee(chosen);x.priceText.textContent=manual?(x.std?'現行標準參考 '+money(x.std.fee)+'／'+x.std.min+' 分鐘':'需個別報價'):chosen===undefined?(x.std?'預約 '+x.min+' 分鐘；標準為 '+x.std.min+' 分鐘／'+money(x.std.fee)+'。請改用標準時間或自行定價。':'此家庭或方案無自動標準費率，請自行定價。'):(mode.value==='special'&&sp?'家庭專屬價 ':'標準照護費 ')+money(chosen)+'／趟';
   x.sub.textContent=validTravel&&validFee(chosen)?'含車馬費小計 '+money((chosen+tv)*x.n):'';
   if(!validFee(chosen)){missing ||= x.label;continue;}
   output.push({k:x.k,label:x.label,n:x.n,min:x.min,fee:Number(chosen),unit:Number(chosen)+tv,override:manual?x.override.value:mode.value==='special'&&sp?String(chosen):''});
  }
  if(!rs.length){fail('尚未建立本期預約，請先新增日期與趟數。');return;}if(km.value===''){fail('尚未填寫單程導航公里（同地點可填 0）。');return;}if(!validTravel){fail('請確認公里數及車馬費；30.1 公里以上須自訂車馬費。');return;}
  if(adjMode.value!=='none'&&(!Number.isSafeInteger(rawA)||rawA<0||!reason.value.trim()&&rawA)){fail('請填寫有效的調整金額及原因。');return;}
  if(missing){fail('「'+missing+'」未有可用單趟費率。請確認毛寶數量與預約分鐘，或點該項的自行設定價格。');return;}
  const holidays=useSavedHolidays?old.holidays:holidayRows(rs,r),holidayTotal=exclude.checked?0:holidays.reduce((sum,x)=>sum+x.total,0),normal=output.reduce((sum,x)=>sum+x.unit*x.n,0),total=normal+a+holidayTotal,minutes=output.reduce((sum,x)=>sum+x.min*x.n,0),trips=output.reduce((sum,x)=>sum+x.n,0);
  if(total<0||normal+a<tv*trips){fail('一般服務費不可低於車馬費。');return;}
  const rateHour=Math.round((normal+a-tv*trips)*60/minutes),actualHour=Math.round((total-tv*trips)*60/minutes);totalValue.textContent=money(total);hourValue.textContent='扣車馬費後照護時薪 '+money(rateHour)+'／小時（不含檔期）'+(holidayTotal?'；含檔期 '+money(actualHour)+'／小時':'');referenceActual.textContent='本次 '+money(rateHour)+'／小時（不含檔期）'+(holidayTotal?'；含檔期 '+money(actualHour)+'／小時':'');blocker.hidden=true;
  result.textContent=[...output.map(x=>x.label+'：'+money(x.unit)+' × '+x.n+' = '+money(x.unit*x.n)),'每趟車馬費 '+money(tv),'一般服務小計 '+money(normal),...holidays.map(h=>h.name+' '+(h.spans?.join('、')||h.a+'～'+h.b)+'｜'+h.n+' 趟 × '+money(h.fee)+' = '+money(h.total)+(exclude.checked?'（本次排除）':'')),...(a?[(a<0?'優惠折抵 −':'額外加收 +')+money(Math.abs(a))]:[]),'本次合計 '+money(total),'扣車馬費後照護時薪（不含檔期） '+money(rateHour)+'／小時',...(holidayTotal?['含檔期加價 '+money(actualHour)+'／小時']:[])].join('\n');
  calculated={key:quoteKey(f),date:new Date().toISOString(),km:k,travel:tv,travelOverride:travelOverride.value,reason:adjMode.value==='none'?'':reason.value,difficulty:select.value,adjust:a,individual:individual?.checked===true,exclude:exclude.checked,rows:output,holidays,total};confirm.disabled=false;
 }
 refreshOptions();
 if(same){mode.value='manual';for(const x of rows)x.override.value=old.rows.find(y=>y.k===x.k)?.fee??'';modeHint.textContent='已載入上次確認價格。';}
 else{mode.value=hasSpecial()?'special':'standard';for(const x of rows)x.override.value=mode.value==='special'&&validFee(special[x.k])?special[x.k]:(standardFee(x)??'');if(mode.value==='special'&&validFee(special.travel))travelOverride.value=special.travel;}
 mode.onchange=()=>applyMode(mode.value);body.addEventListener('input',e=>{if(e.target!==mode)calc();});body.addEventListener('change',e=>{if(e.target!==mode){if(e.target===individual&&individual.checked&&mode.value!=='manual')applyMode('manual');else calc();}});
 dlg.showModal();calc();
}
function overtimeDialog(f){const b=f.booking,body=crmEl('div'),dlg=crmDialog('加時照護費用',body);const enabled=crmCheck(body,'本次啟用加時照護費用',b.overtime===true);const q=savedQuote(f),x=q?.key===quoteKey(f)?q.rows[0]:null;const g=crmEl('div','','crm-fields');body.append(g);const total=crmInput(g,'單趟總費用（含車馬）',x?.unit??''),tr=crmInput(g,'其中車馬費',x?q.travel:0),min=crmInput(g,'原服務分鐘',x?.min??60),fee=crmInput(g,'每15分鐘最終費用',b.overtimeFee||150);const info=crmEl('p');body.append(info,button('採用 NT$150',()=>{fee.value=150;}),button('採用試算（四捨五入至整元）',()=>{const n=reference();if(n!==null)fee.value=n;}),button('保存',()=>{if(enabled.checked&&(!Number.isSafeInteger(Number(fee.value))||Number(fee.value)<=0))return toast('請輸入有效加時費');snapshot();b.overtime=enabled.checked;b.overtimeFee=enabled.checked?String(Number(fee.value)):'';dirty();dlg.close();render();},'primary'));function reference(){const a=Number(total.value),t=Number(tr.value),m=Number(min.value);return total.value!==''&&a>=t&&t>=0&&m>0?Math.round((a-t)*15/m):null;}function update(){const n=reference();info.textContent=n===null?'請輸入單趟總費用、車馬費與服務分鐘。':'扣車馬費後每15分鐘參考 '+money(n);}body.addEventListener('input',update);update();dlg.showModal();}
function historyDialog(f){const body=crmEl('div'),dlg=crmDialog('歷史報價（內部）',body);const all=[...(f.booking.quoteHistory||[]),...(f.booking.quote?[f.booking.quote]:[])].reverse();if(!all.length)body.append(crmEl('p','尚無歷史報價'));for(const s of all){try{const q=JSON.parse(s),box=crmEl('div','','booking-visit');box.append(crmEl('strong',q.date.slice(0,10)+'｜'+money(q.total)),crmEl('p',q.rows.map(x=>x.label+' '+money(x.unit)+' × '+x.n).join('；')));body.append(box);}catch{}}dlg.showModal();}
$('rateEdit').onclick=()=>{const body=crmEl('div'),dlg=crmDialog('全域費率與特殊檔期',body),r=currentRates();for(const [key,label] of [['cat','純貓｜生活費／分鐘／陪伴費／分鐘'],['dog','純犬｜生活費／分鐘／散步費／分鐘'],['mixed','犬喵同住｜單犬費／分鐘／雙犬費／分鐘']]){body.append(heading(label));r[key].forEach((row,i)=>{const g=crmEl('div','','crm-fields');body.append(crmEl('small',key==='cat'?['1～2 喵','3～6 喵','7 喵以上'][i]:key==='dog'?(i+1)+' 犬':(i+1)+' 喵'),g);row.forEach((v,j)=>{if(key==='cat'&&j===0)return;const input=crmInput(g,['費用','分鐘','費用','分鐘'][(j-(key==='cat'?1:0))],v);input.oninput=()=>row[j]=Number(input.value);});});}
const holidayBox=crmEl('div');body.append(heading('特殊檔期費率'),holidayBox);function drawH(){holidayBox.replaceChildren();r.holiday.forEach((h,i)=>{const g=crmEl('div','','booking-visit');const n=crmInput(g,'檔期名稱',h.name,'text'),a=crmInput(g,'開始日期',h.a,'date'),b=crmInput(g,'結束日期',h.b,'date'),fee=crmInput(g,'每趟加價',h.fee),active=crmCheck(g,'啟用',h.active);for(const [input,key]of [[n,'name'],[a,'a'],[b,'b'],[fee,'fee'],[active,'active']])input.onchange=()=>h[key]=key==='fee'?Number(input.value):key==='active'?input.checked:input.value;g.append(button('移除此區間',()=>{r.holiday.splice(i,1);drawH();}));holidayBox.append(g);});holidayBox.append(button('＋ 新增區間',()=>{r.holiday.push({name:'',a:'',b:'',fee:0,active:true});drawH();}));}drawH();
body.append(button('保存全域費率',async()=>{try{const raw=JSON.stringify(r);readRates(raw);const next={...brand,rates:raw};brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',next,'brand');brand=next;pdf=null;dlg.close();render();schedule();toast('費率已保存，連線後同步 Drive');}catch(e){toast(e.message);}},'primary'));dlg.showModal();};

import {inspectCarePatch,applyCarePatch,prepareFoodRefinement} from './care-patch.mjs?v=2.0.1126.55';
import {rememberGrant,recallGrant,forgetGrant} from './tab-grant.mjs?v=2.0.1126.55';
import {displayQuoteLabel,legacyQuoteReference,oldBookingText,hasCurrentBooking,inquiryQuote,mixedPlan,mixedCare,mixedService,defaultRates,readRates,days,travel,rate,holidayRows,quoteKey,savedQuote,quoteLines,money,overtimeText} from './quote.mjs?v=2.0.1126.55';
import {brandDefaults,readBrand} from './brand.mjs?v=2.0.1126.55';

import {dedupeLegacySupplies,withoutLegacyLabel,tidyLegacySupplies,clearCareFlags,relocateLegacyHospital,validReservation,reservationPeriods,readLineReservations,reservationLines,reservationSegments,inspectLineReservations,applyLineReservations,sortFamilyDirectory,validServiceDate,taipeiDate,nextBookingDate,orderUpcomingFamilies,recentFamilyIds,profileStages,safeProfileUrl,readProfile,familyArea,profileAge,matchesProfile,prepareProfilePatch,applyProfilePatch,bookingDateGroups,replaceBookingDates,bookingDateLabel,lineHistory,prepareLineHistory,applyLineHistory,syncOverview,matchesFamily,prepareLegacyBatch,noteSpecs,noteRows,writeNoteRows,noteCycle,noteActive,bindPendingNotes,activeFamily,bookingSegments,bookingLines,serviceName,fresh,blanks,fields,titles,day,filename,mediaLabel,warnings,publicBlocks,tasks,sourceKey,normalize,migrate} from './workspace-model.mjs?v=2.0.1126.55';
import {makeText as legacyText} from './model.mjs?v=2.0.1126.55';
import {DriveStore,digest} from './drive.mjs?v=2.0.1126.55';
import {openDB,storeDB} from './drafts.mjs?v=2.0.1126.55';
import {buildPDF,auditLegacyCoverage} from './plan-pdf.mjs?v=2.0.1126.55';
const $=id=>document.getElementById(id),drive=new DriveStore(),db=storeDB(await openDB().catch(error=>{$('main').innerHTML='<div class="panel"><h1>目前無法啟用草稿保存</h1><p>此瀏覽器未能開啟本機資料庫，請換外部瀏覽器或檢查儲存空間；尚未開放填寫，避免資料遺失。</p></div>';throw error;}));
let records=await db.all(),entry=null,view='service',kind='cat',petIndex=0,undo=[],syncTimer,localChain=Promise.resolve(),syncBusy=false,photoBusy=false,pdf=null,photoUrl=null,localFailure=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let brandState=await db.get('settings','brandSync')||{};
let archiveView=false; const failures=new Map(); const pending=new Map();
let brand=readBrand(await db.get('settings','brand'));
let draining=false,connecting=false; const blocked=new Set();let activeSyncId=null,brandSyncActive=false,connectionError='',importError='',importingLegacy=false,syncDetail=null;
function ready(){return navigator.onLine&&drive.token&&Date.now()<drive.expires&&!connecting;}
function schedule(){clearTimeout(syncTimer);if(ready())syncTimer=setTimeout(drain,1500);status();}
async function drain(){if(importingLegacy||draining||!ready())return;draining=true;status();try{for(const r of records){if(!ready())break;if(r.rev!==r.syncedRev&&(r.f.name.trim()||r.f.archived)&&!blocked.has(r.id))await sync(r);}if(ready()&&brandState.dirty)await syncBrand();}finally{draining=false;status();if(ready()&&records.some(r=>r.rev!==r.syncedRev&&(r.f.name.trim()||r.f.archived)&&!blocked.has(r.id))) {clearTimeout(syncTimer);syncTimer=setTimeout(drain,15000);}}}
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
 paintSyncOverview(connected,expired);
 const el=$('saveState');if(!el||!entry)return;
 el.textContent=failures.has(entry.id)?'本機儲存失敗，請先下載備份':pending.get(entry.id)?'正在儲存本機草稿':blocked.has(entry.id)?'已存本機 · '+(entry.syncError||'雲端待處理'):!navigator.onLine?'離線 · 已存本機':syncBusy&&entry.syncedRev!==entry.rev?'已存本機 · 正在同步':entry.syncedRev===entry.rev&&entry.remote?'已同步至 Google Drive · '+(entry.syncedAt?new Date(entry.syncedAt).toLocaleString():'完成'):connected?'已存本機 · 等待雲端同步':'已存本機 · 請連接 Drive 同步';
}

function overview(connected=!!drive.token&&Date.now()<drive.expires,expired=!!drive.expires&&!connected){
 return syncOverview(records,{failures,pending,activeId:activeSyncId,online:navigator.onLine,connected,expired,draining,connecting,brandActive:brandSyncActive,brandDirty:brandState.dirty,brandError:brandState.error,connectionError,importError,importing:importingLegacy,photoBusy});
}
function paintSyncOverview(connected,expired){
 const v=overview(connected,expired),el=$('syncIndicator');if(!el)return;
 el.dataset.tone=v.tone;el.querySelector('.sync-label').textContent=v.label;el.title='查看本裝置同步狀態與明細';el.setAttribute('aria-label',v.label+'，查看同步明細');
 paintFamilySync(v.rows);if(syncDetail?.dlg.open)renderSyncDetail(v);
}
function renderSyncDetail(v){
 const {body}=syncDetail,scroll=body.querySelector('.sync-list'),pos=scroll?.scrollTop||0;
 const summary=crmEl('div','','sync-summary');
 for(const [label,num]of [['已同步',v.done],['同步中',v.active],['待同步',v.queued],['家庭異常',v.errors]]){const card=crmEl('div');card.append(crmEl('strong',String(num)),crmEl('small',label));summary.append(card);}
 const msg=crmEl('p','本裝置共 '+v.rows.length+' 戶（含已刪除家庭）；已同步代表該版本已成功寫入並讀回 Drive。其他裝置未同步的修改不在此統計。','muted');
 const items=crmEl('div','','sync-list');
 const statuses={active:'正在同步',error:'同步異常',local:'本機儲存中',queued:'等待同步',unnamed:'未命名・待補資料',done:'已同步'};
 const order={active:0,error:1,local:2,queued:3,unnamed:4,done:5};
 for(const r of [...v.rows].sort((a,b)=>order[a.kind]-order[b.kind])){
  const card=crmEl('div','','sync-item'),top=crmEl('div','','sync-item-top');top.append(crmEl('strong',r.name),crmEl('span',statuses[r.kind],'sync-item-'+r.kind));card.append(top);
  if(r.error)card.append(crmEl('p',r.error,'sync-error'));
  if(r.kind==='done'&&r.syncedAt)card.append(crmEl('small',new Date(r.syncedAt).toLocaleString()));
  items.append(card);
 }
 if(!v.rows.length)items.append(crmEl('p','尚無家庭資料。','muted'));
 const settings=crmEl('div','','sync-item');settings.append(crmEl('strong','共用品牌與費率設定'),crmEl('p',v.brandError?'同步異常：'+v.brandError:brandSyncActive?'同步中':brandState.dirty?'等待同步':brandState.remote?'已同步':'無待同步變更',v.brandError?'sync-error':'muted'));
 const diagnostics=crmEl('div');if(v.connectionError)diagnostics.append(crmEl('p','Drive 連線：'+v.connectionError,'sync-error'));if(v.importError)diagnostics.append(crmEl('p','批次匯入：'+v.importError,'sync-error'));
 const hint=crmEl('p','可切換家庭、查看資料或試算報價。同步期間請維持 App 開啟，避免重新整理或關閉。','muted');
 body.replaceChildren(summary,msg,diagnostics,settings,items,hint);items.scrollTop=pos;
}
function openSyncDetail(){
 if(syncDetail?.dlg.open)return;
 const body=crmEl('div','','sync-detail'),dlg=crmDialog('全域同步明細',body);syncDetail={body,dlg};dlg.addEventListener('close',()=>{if(syncDetail?.dlg===dlg)syncDetail=null;});renderSyncDetail(overview());dlg.showModal();
}

const riskLabel={normal:'一般家庭',watch:'重點注意',blacklist:'黑名單・不接案'};
let familyPage=0;
let renderedViewKey='directory:false';const viewPositions=new Map();
const currentViewKey=()=>entry?'family:'+entry.id+':'+view:'directory:'+archiveView;
function capturePosition(){const areas={};for(const id of ['recentFamilyItems','main','content']){const el=$(id);if(el)areas[id]=[el.scrollLeft,el.scrollTop];}return {x:window.scrollX,y:window.scrollY,areas};}
function restorePosition(pos){if(!pos)return;for(const [id,[left,top]] of Object.entries(pos.areas||{})){const el=$(id);if(el){el.scrollLeft=left;el.scrollTop=top;}}if(window.scrollX!==pos.x||window.scrollY!==pos.y)window.scrollTo({left:pos.x,top:pos.y,behavior:'instant'});}
function detailKeys(root){const counts=new Map(),keys=new Map();for(const el of root.querySelectorAll('details')){const parent=el.parentElement?.closest('details'),title=el.querySelector(':scope > summary')?.textContent||'',base=JSON.stringify([keys.get(parent)||'',title]),count=counts.get(base)||0;counts.set(base,count+1);keys.set(el,base+':'+count);}return keys;}
function captureView(){const details=new Map();for(const [el,key] of detailKeys($('main')))details.set(key,el.open);return {...capturePosition(),details};}
function restoreView(pos){if(!pos)return;for(const [el,key] of detailKeys($('main')))if(pos.details?.has(key))el.open=pos.details.get(key);$('main').querySelectorAll('.care-note-body textarea').forEach(t=>{if(t.getClientRects().length)resizeCareNote(t);});restorePosition(pos);}
function keepDialogPosition(d){const show=d.showModal.bind(d),close=d.close.bind(d);let before=null,key=null;d.showModal=()=>{if(!d.open){before=capturePosition();key=currentViewKey();}return show();};d.close=(...args)=>{const wasOpen=d.open;const result=close(...args);if(wasOpen&&key===currentViewKey())restorePosition(before);return result;};return d;}
function rememberView(key,pos){if(!key)return;viewPositions.delete(key);viewPositions.set(key,pos);if(viewPositions.size>60)viewPositions.delete(viewPositions.keys().next().value);}

const familyPageSize=14;
let familyPageCount=1,familyResultCount=0,familyScrollTimer=0,familyTrackWidth=0;
function paintFamilyPager(){const n=familyPageCount;$('familyPager').hidden=n<=1;$('familyPrev').disabled=familyPage===0;$('familyNext').disabled=familyPage===n-1;$('familyPageInfo').textContent=(familyPage+1)+'／'+n+' 頁・共 '+familyResultCount+' 戶';}
function familyPageOffset(index){return $('families').children[index]?.offsetLeft||0;}
function alignFamilyPage(){const track=$('families');if(!track.clientWidth)return;familyTrackWidth=track.clientWidth;track.scrollLeft=familyPageOffset(familyPage);}
function settleFamilyPage(){const track=$('families');if(!track.clientWidth||!track.children.length)return;let closest=0,distance=Infinity;for(let i=0;i<track.children.length;i++){const d=Math.abs(track.scrollLeft-familyPageOffset(i));if(d<distance){distance=d;closest=i;}}familyPage=closest;paintFamilyPager();}
function turnFamilyPage(delta){familyPage=Math.max(0,Math.min(familyPage+delta,familyPageCount-1));alignFamilyPage();paintFamilyPager();}
function wireFamilyPages(){const track=$('families');track.addEventListener('scroll',()=>{clearTimeout(familyScrollTimer);familyScrollTimer=setTimeout(settleFamilyPage,120);},{passive:true});track.addEventListener('scrollend',()=>{clearTimeout(familyScrollTimer);settleFamilyPage();});if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(track.clientWidth&&track.clientWidth!==familyTrackWidth)alignFamilyPage();}).observe(track);}
let familySort='upcoming',familyFilters={},recentSearchIds=recentFamilyIds(await db.get('settings','recentFamilySearch').catch(()=>[])),recentSave=Promise.resolve();
function saveRecentSearch(id){recentSearchIds=id?recentFamilyIds(recentSearchIds,id):[];const copy=[...recentSearchIds];recentSave=recentSave.catch(()=>{}).then(()=>db.put('settings',copy,'recentFamilySearch')).catch(()=>{toast('本機搜尋紀錄未能保存');});}
let searchSuggestionsOpen=false;
function hideSearchSuggestions(){if(!searchSuggestionsOpen)return;searchSuggestionsOpen=false;renderRecentSearch();}
function renderRecentSearch(matched){
 const input=$('search'),el=$('recentFamilySearch'),items=$('recentFamilyItems'),term=input.value.trim();
 $('clearSearch').hidden=!input.value;
 el.hidden=!searchSuggestionsOpen||!term;
 input.setAttribute('aria-expanded',String(!el.hidden));
 if(el.hidden){items.replaceChildren();return;}
 const candidates=matched||sortFamilyDirectory(records.filter(r=>!!r.f.archived===archiveView&&matchesFamily(r.f,term)&&matchesProfile(r.f,familyFilters,taipeiDate())),familySort,taipeiDate());
 const rank=r=>{const i=recentSearchIds.indexOf(r.id);return i<0?999:i;};
 const available=[...candidates].sort((a,b)=>rank(a)-rank(b)).slice(0,8);
 items.replaceChildren();
 for(const r of available){const btn=button(r.f.name||'未命名家庭',()=>{if(photoBusy)return toast('請等待照片保存完成');if(!archiveView)saveRecentSearch(r.id);hideSearchSuggestions();input.blur();openRecord(r.id);},'search-suggestion');btn.prepend(crmEl('span',recentSearchIds.includes(r.id)?'↶':'⌕','suggestion-icon'));items.append(btn);}
 if(!available.length)items.append(crmEl('p','沒有相符家庭','muted'));
}
function cardSyncState(row){return row?.kind==='done'?{tone:'green',label:'已同步'}:row?.kind==='error'?{tone:'red',label:'異常'}:row?.kind==='active'?{tone:'amber',label:'同步中'}:row?.kind==='local'?{tone:'amber',label:'儲存中'}:{tone:'amber',label:'待同步'};}
function paintFamilySync(rows){const map=new Map(rows.map(r=>[r.id,r]));for(const el of document.querySelectorAll('[data-family-sync]')){const row=map.get(el.dataset.familySync),s=cardSyncState(row);el.dataset.tone=s.tone;el.title=row?.error||s.label;el.setAttribute('aria-label',s.label);}}
function wireFamilySearch(){
 const input=$('search'),wrap=$('familySearchWrap');
 input.onfocus=()=>{searchSuggestionsOpen=true;renderRecentSearch();};
 input.oninput=()=>{searchSuggestionsOpen=true;list();};
 input.onkeydown=e=>{if(e.key==='Escape'){hideSearchSuggestions();input.blur();}else if(e.key==='Enter'&&!$('recentFamilySearch').hidden){const first=$('recentFamilyItems').querySelector('button');if(first){e.preventDefault();first.click();}}};
 $('clearSearch').onclick=()=>{input.value='';hideSearchSuggestions();list();input.focus();};
 document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))hideSearchSuggestions();});
 wrap.addEventListener('focusout',e=>{if(e.relatedTarget&&!wrap.contains(e.relatedTarget))hideSearchSuggestions();});
}
function list(){const position=capturePosition();try{listContent();}finally{restorePosition(position);}}
function listContent(){const term=$('search').value,today=taipeiDate(),eligible=records.filter(r=>!!r.f.archived===archiveView).filter(r=>matchesFamily(r.f,term)&&matchesProfile(r.f,familyFilters,today)),matched=sortFamilyDirectory(eligible,archiveView&&familySort==='upcoming'?'oldest':familySort,today),pageCount=Math.max(1,Math.ceil(matched.length/familyPageSize));familyPage=Math.max(0,Math.min(familyPage,pageCount-1));familyPageCount=pageCount;familyResultCount=matched.length;clearTimeout(familyScrollTimer);const nFilters=Object.values(familyFilters).filter(v=>Array.isArray(v)?v.length:!!v).length;$('filterCount').hidden=!nFilters;$('filterCount').textContent=nFilters||'';$('filterFamilies').classList.toggle('filter-active',!!nFilters);$('filterFamilies').setAttribute('aria-label',nFilters?'家庭篩選，已套用 '+nFilters+' 類條件':'家庭篩選');$('clearFamilyFilters').hidden=!nFilters;$('familyCount').textContent='共 '+matched.length+' 戶';$('familySort').value=familySort;const bookingOnly=Array.isArray(familyFilters.booking)?familyFilters.booking.length===1&&familyFilters.booking[0]==='upcoming':familyFilters.booking==='upcoming';$('upcomingFamilies').hidden=archiveView;$('upcomingFamilies').classList.toggle('filter-active',bookingOnly);$('upcomingFamilies').setAttribute('aria-pressed',String(bookingOnly));renderRecentSearch(matched);paintFamilyPager();const syncRows=new Map(overview().rows.map(r=>[r.id,r]));const track=$('families'),oldScroll=Array.from(track.children,el=>el.scrollTop);const cards=matched.map(r=>{const state=cardSyncState(syncRows.get(r.id));const next=archiveView?'':nextBookingDate(r.f,today);return '<div class="family-card"><button data-id="'+esc(r.id)+'" class="family-card-open '+(r.id===entry?.id?'active':'')+'" data-risk="'+esc(r.f.clientRisk?.status||'normal')+'" data-pending-action="'+(r.f.pendingAction===true?'true':'false')+'"><span class="family-name-line"><span class="family-sync" data-family-sync="'+esc(r.id)+'" data-tone="'+state.tone+'" role="img" aria-label="'+state.label+'" title="'+state.label+'"><span class="sync-dot" aria-hidden="true"></span></span><span class="family-name-text">'+esc(r.f.name||'未命名家庭')+'</span></span>'+(r.f.pendingAction===true?'<small class="pending-action-tag">待處理</small>':'')+(next?'<small class="upcoming-family-tag">'+esc(next===today?'今日有預約':'下次預約 '+next.replace(/-/g,'/'))+'</small>':'')+((familySort==='oldest'||familySort==='newest')?'<small>'+esc(readProfile(r.f.profile).firstServiceDate||readProfile(r.f.profile).firstServiceMonth||'服務日期未知')+'</small>':'')+(r.f.clientRisk?.status&&r.f.clientRisk.status!=='normal'?'<small class="risk-tag">'+esc(riskLabel[r.f.clientRisk.status])+'</small>':'')+(readProfile(r.f.profile).stage!=='unknown'?'<small>'+esc(profileStages[readProfile(r.f.profile).stage])+'</small>':'')+'</button><button type="button" class="family-card-more" data-risk-menu="'+esc(r.id)+'" aria-label="'+esc((r.f.name||'未命名家庭')+'的家庭設定'+(r.f.pendingAction===true?'，待處理':''))+'" title="'+(r.f.pendingAction===true?'待處理・家庭設定':'家庭設定')+'" aria-haspopup="dialog">⋯</button></div>';});track.innerHTML=Array.from({length:pageCount},(_,i)=>'<section class="family-page" aria-label="第 '+(i+1)+' 頁">'+cards.slice(i*familyPageSize,(i+1)*familyPageSize).join('')+'</section>').join('');Array.from(track.children).forEach((el,i)=>{el.scrollTop=oldScroll[i]||0;});alignFamilyPage();}
async function openRecord(id){hideSearchSuggestions();await localChain;const next=records.find(r=>r.id===id);if(!next)return;entry=next;editingCareBlock='';undo=[];kind=Object.keys(entry.f.groups)[0];petIndex=0;view='service';pdf=null;await db.put('settings',id,'lastFamily');render();}
async function newRecord(demo=false){if(archiveView)familyPage=0;archiveView=false;$('archive').textContent='已刪除家庭';if(photoBusy){toast('請等待照片保存完成');return;}const f=fresh();if(demo){f.name='姆姆家四貓（操作範例）';f.groups.cat.pets=[{name:'姆姆',identity:'白底虎斑',personality:'慢熟，依他的步調靠近'}];f.groups.cat.food.dry={item:'範例飼料',amount:'三分之一',unit:'杯',location:'廚房右側下櫃',leftover:'移出洗碗後放回'};}const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);view='edit';render();}
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
 const blank=()=>({id:crypto.randomUUID(),text:'',flag:false,temp:false,cycle:'',closed:false});
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
   const flag=button('',()=>{snapshot();n.flag=!n.flag;n.ownerFlag=true;save();paint();},'care-note-flag');
   const flagIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');flagIcon.setAttribute('viewBox','0 0 28 28');flagIcon.setAttribute('aria-hidden','true');
   flagIcon.innerHTML='<path d="M6 25V4 M6 5C12 0 17 10 23 4V17C17 23 12 12 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><g class="care-note-clock"><circle cx="21" cy="21" r="6.5" fill="#F8F5EE" stroke="currentColor" stroke-width="1.3"/><path d="M21 17V21L24 22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></g>';
   flag.append(flagIcon);
   const arrow=button('⌄',()=>toggleMenu(),'care-note-arrow');arrow.setAttribute('aria-label','旗標與有效期限');arrow.setAttribute('aria-expanded','false');
   const menu=document.createElement('div');menu.className='care-note-menu';menu.hidden=true;
   const toggleMenu=()=>{const open=menu.hidden;document.querySelectorAll('.care-note-menu').forEach(e=>{e.hidden=true;e.parentElement.querySelector('.care-note-arrow')?.setAttribute('aria-expanded','false');});menu.hidden=!open;arrow.setAttribute('aria-expanded',String(open));};
   const options=[['不加入小卡',false,false],['長期複核',true,false],['僅限本期複核',true,true],['僅限本期備註',false,true]];
   for(const [caption,flagged,temp] of options){menu.append(button(caption,()=>{snapshot();Object.assign(n,{flag:flagged,temp,cycle:temp?noteCycle(f):'',closed:false,ownerFlag:true});save();menu.hidden=true;arrow.setAttribute('aria-expanded','false');paint();}));}
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
   line.append(body,actions);list.append(line);paint();requestAnimationFrame(()=>{resize(input);if(focus===n.id)input.focus({preventScroll:true});});
  }
 };
 const add=button('＋ 新增一項',()=>{const n=blank();rows.push(n);draw(n.id);},'care-note-add');wrap.append(add);draw();return wrap;
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
function frame(){const f=entry.f;$('main').innerHTML='<div id="familyReturn" class="family-return"></div><div class="filehead"><div><h1>'+esc(f.name||'未命名家庭')+'</h1><span class="muted">'+esc((bookingSegments(f.booking).length?bookingSegments(f.booking).map(r=>r.a+(r.a===r.b?'':'～'+r.b)).join('、'):f.booking.dates)||'本次預約尚未填寫')+'</span></div><div class="badge" id="mediaBadge"></div></div><span id="saveState" class="save" role="status"></span><div id="nav" class="nav"></div><div id="content"></div><div id="foot" class="foot"></div>';$('familyReturn').append(button('‹ 返回家庭列表',()=>returnDirectory(),'directory-back'));showConsent();const more=button('⋯',()=>riskMenu(entry,true),'family-card-more');more.setAttribute('aria-label',f.pendingAction===true?'家庭設定，待處理':'家庭設定');more.title=f.pendingAction===true?'待處理・家庭設定':'家庭設定';more.setAttribute('aria-haspopup','dialog');$('main').querySelector('.filehead').append(more);const risk=f.clientRisk||{status:'normal',note:''};$('main').dataset.risk=risk.status;if(risk.status!=='normal'){const notice=crmEl('div','','client-risk-banner');notice.dataset.risk=risk.status;notice.append(crmEl('strong',riskLabel[risk.status]),crmEl('p',risk.note||'尚未填寫內部原因。'));$('saveState').before(notice);}for(const [v,t]of[['service','本次照護'],['edit','家訪資料'],['photos','內部照片'],['plan','A4 計畫書']])$('nav').append(button(t,async()=>{if(photoBusy){toast('照片正在保存，請稍候。');return;}await localChain;if(view!==v)editingCareBlock='';view=v;render();},view===v?'active':''));status();}
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
function render(){const key=currentViewKey(),same=renderedViewKey===key,position=captureView();if(!same)rememberView(renderedViewKey,position);try{renderContent();}finally{renderedViewKey=key;if(same)restoreView(position);else if(viewPositions.has(key))restoreView(viewPositions.get(key));else if(window.matchMedia('(max-width:620px)').matches)window.scrollTo({left:0,top:0,behavior:'instant'});}}
function renderContent(){document.body.dataset.screen=entry?'family':'directory';if(!entry){list();$('main').dataset.risk='normal';const empty=crmEl('div','','empty');empty.append(crmEl('h1','先認識這個家，再安心接手。'),crmEl('p','從家庭列表選擇家庭，或新增家庭。'),button('試填範例家庭',()=>newRecord(true)));$('main').replaceChildren(empty);status();return;}list();frame();const content=$('content');if(view==='edit')renderEdit(content);if(view==='service')renderService(content);if(view==='photos')renderPhotos(content);if(view==='plan')renderPlan(content);}

function riskMenu(record,detail=false){
 if(!record||photoBusy||importingLegacy)return toast('請先完成目前作業。');
 const f=record.f,rev=record.rev,original=f.clientRisk||{status:'normal',note:''};
 const body=crmEl('div','','risk-menu'),dlg=crmDialog('家庭設定｜'+(f.name||'未命名家庭'),body),note=crmEl('textarea');
 note.value=original.note||'';note.placeholder='接案風險、溝通界線、需先確認的條件';note.setAttribute('aria-label','內部接案警示備註');
 const pendingBox=crmEl('div','','family-pending-box');
 const marked=f.pendingAction===true;
 const togglePending=button(marked?'取消待處理':'標記待處理',()=>{
  if(!dlg.open||!records.includes(record)||record.f!==f||record.rev!==rev||photoBusy||importingLegacy)return toast('家庭資料已變動，請重新開啟家庭設定。');
  if(entry===record)snapshot();
  if(marked)delete f.pendingAction;else f.pendingAction=true;
  if(entry===record)dirty();
  else{record.rev=(record.rev||0)+1;f.updatedAt=new Date().toISOString();persist(record);schedule();}
  dlg.close();render();toast(marked?'已取消待處理':'已標記待處理');
 },'family-pending-toggle');
 togglePending.dataset.pendingAction=String(marked);
 pendingBox.append(crmEl('p',marked?'目前：待處理':'目前：未標記待處理','muted'),togglePending);
 body.append(pendingBox);
 body.append(crmEl('p','目前：'+riskLabel[original.status]+'。僅供內部使用，不會取消預約或刪除家庭。','muted'),labelText(crmEl('label'),'內部備註'),note);
 const actions=crmEl('div','','risk-menu-actions');let busy=false;
 const change=async status=>{
  if(busy)return;busy=true;
  try{
   if(status==='blacklist'&&original.status!=='blacklist'){
    if(!await confirmAction('確認列入黑名單？','確定將「'+(f.name||'未命名家庭')+'」標記為黑名單・不接案？既有家庭資料、預約及歷史報價都會保留。','確認列入黑名單'))return;
   }else if(original.status==='blacklist'&&status!=='blacklist'){
    if(!await confirmAction('解除黑名單？','確定將「'+(f.name||'未命名家庭')+'」改為'+riskLabel[status]+'？','確認解除'))return;
   }
   if(!dlg.open||!records.includes(record)||record.f!==f||record.rev!==rev||photoBusy||importingLegacy)return toast('家庭資料已變動，請重新開啟接案設定。');
   if(status===original.status&&note.value===(original.note||'')){dlg.close();return;}
   if(entry===record){snapshot();f.clientRisk={status,note:note.value};dirty();}
   else{f.clientRisk={status,note:note.value};record.rev=(record.rev||0)+1;f.updatedAt=new Date().toISOString();persist(record);schedule();}
   dlg.close();render();
  }finally{busy=false;}
 };
 actions.append(button('設為一般家庭',()=>change('normal')),button('標記重點注意',()=>change('watch')),button(original.status==='blacklist'?'保存黑名單備註':'列入黑名單',()=>change('blacklist'),'risk-menu-danger'));
 body.append(actions);
 if(f.importOriginal){const review=section('舊家訪複核狀態（內部）',false);review.body.append(crmEl('p',f.importReview?'尚未完成本期複核。原始資料保留，不影響一般操作；未確認的單次指示仍不列入正式照護。':'已由主理人複核。','muted'));review.body.append(button(f.importReview?'確認本期資料已複核':'重新標為待複核',async()=>{const was=!!f.importReview;if(!await confirmAction(was?'確認已複核？':'重新標記待複核？',was?'請先確認本期醫療、餵食、門窗及預約。只記錄主理人的複核結果，不更改各項指示的有效期。':'保留全部原文與照護資料。','確認'))return;if(!dlg.open||!records.includes(record)||record.f!==f||record.rev!==rev||importingLegacy||photoBusy)return toast('家庭已變動，請重新開啟設定');if(entry===record)snapshot();if(was){f.importReview=false;f.importReviewedAt=new Date().toISOString();}else{f.importReview=true;delete f.importReviewedAt;}if(entry===record)dirty();else{record.rev++;f.updatedAt=new Date().toISOString();persist(record);schedule();}dlg.close();render();}));body.append(review.e);}
 if(detail&&entry===record){
  const maintenance=crmEl('div','','family-maintenance');maintenance.append(heading('家庭維護'));
  const valid=()=>entry===record&&record.f===f&&!photoBusy&&!importingLegacy;
  const perform=fn=>()=>{if(!valid())return toast('家庭資料已變動，請重新開啟選單。');dlg.close();fn();};
  maintenance.append(button('立即同步 Drive',perform(()=>{if(!ready())return toast('目前無法同步，請確認網路或重新連接 Google Drive。');if(record.syncError?.includes('衝突'))return toast('請先處理同步衝突。');blocked.delete(record.id);record.syncError='';schedule();})),button('下載完整備份（內部）',perform(backup)),button('復原上一步',perform(()=>{if(!undo.length)return toast('目前沒有可復原的修改');entry.f=JSON.parse(undo.pop());dirty();render();})));
  if(record.syncError?.includes('衝突'))maintenance.append(button('保留本機副本並載入雲端版本',perform(resolveConflict)));
  maintenance.append(button(f.archived?'復原家庭':'刪除家庭',async()=>{if(!valid())return;const verb=f.archived?'復原':'刪除';if(!await confirmAction(verb+'「'+(f.name||'未命名家庭')+'」？','家庭與照片保留於已刪除家庭，可復原。','確認'+verb))return;if(!valid()||record.rev!==rev)return toast('家庭資料已變動，請重新開啟選單。');dlg.close();f.archived=!f.archived;dirty();await localChain;entry=null;render();},'family-delete-action'));
  body.append(maintenance);
 }
 dlg.showModal();
}

let editingCareBlock='';
const originalHeadings={
 booking:['本次預約方案與日期時間','聯絡資訊','服務地址'],
 media:['影像授權意願'],
 pet:['毛孩詳細檔案','毛孩詳細資料'],
 health:['醫療健康照護','指定救援醫院'],
 dry:['飲食照顧細節'],wet:['飲食照顧細節'],snack:['飲食照顧細節'],
 water:['飲水照顧細節'],wash:['飲食照顧細節','飲水照顧細節','洗滌用品與位置','洗滌照顧細節'],
 play:['心理安撫互動'],toilet:['代謝監控清潔'],walk:['散步照顧細節','散步與返家整理'],
 entry:['鑰匙安全物流','環境電器備註','客製任務','住家網路WiFi']
};
function originalCareSections(original,type){
 const headings=originalHeadings[type]||[],sections=[];let current=null;
 for(const line of String(original||'').split(/\r?\n/)){
  const hit=line.match(/^\s*【([^】]+)】\s*(.*)$/);
  if(hit){current={title:hit[1].trim(),lines:hit[2]?[hit[2]]:[]};sections.push(current);}
  else if(current)current.lines.push(line);
 }
 return sections.filter(s=>headings.includes(s.title));
}
function showCareOriginal(f,type){
 const body=crmEl('div'),dlg=crmDialog('舊家訪原文・內部',body);
 const sections=originalCareSections(f.importOriginal,type);
 const add=(root,value)=>{const pre=crmEl('pre',value,'legacy-original');root.append(pre);};
 if(sections.length){body.append(crmEl('p','依原問卷標題呈現完整相關段落；可能同時涵蓋其他照護欄位，未經 AI 刪減。','muted'));for(const s of sections){body.append(heading(s.title));add(body,s.lines.join('\n'));}const all=section('查看完整原始家訪',false);add(all.body,f.importOriginal);body.append(all.e);}
 else{body.append(crmEl('p','沒有可靠的對應標題，以下呈現完整原始家訪，不自行挑選。','muted'));add(body,f.importOriginal);}
 dlg.showModal();
}
function careReadFields(f,obj,defs,root,{inactive=false}={}){
 const specs=noteSpecs(f);
 for(const [key,label] of defs){
  const spec=specs.find(s=>s.obj===obj&&s.key===key);
  const rows=spec?noteRows(spec).filter(r=>r.text.trim()):[];
  if(spec&&!rows.length)continue;
  if(!spec&&(typeof obj[key]!=='string'||!obj[key].trim()))continue;
  const block=crmEl('div','','care-read-field');block.append(crmEl('small',label,'care-read-label'));
  if(spec){for(const r of rows){const active=noteActive(f,r),p=crmEl('p',withoutLegacyLabel(r.text),'care-read-value');if(!active||inactive)p.classList.add('care-read-inactive');const flags=[];if(r.closed)flags.push('歷史紀錄');else if(!active)flags.push('上期事項・待確認');else if(inactive)flags.push('留存資訊・非本期指令');else{if(r.flag)flags.push('⚑ 小卡');if(r.temp)flags.push('僅限本期');}if(flags.length)block.append(crmEl('small',flags.join('・'),'care-read-state'));block.append(p);}}
  else{const val=key==='status'&&obj===f.media?mediaLabel(f):withoutLegacyLabel(obj[key]);block.append(crmEl('p',val,'care-read-value'));}
  root.append(block);
 }
}
function careBlock(content,f,key,title,type,read,edit){
 const panel=crmEl('article','','panel care-reading-block'),head=crmEl('div','','care-reading-head'),body=crmEl('div','','care-reading-body'),active=editingCareBlock===f.id+'|'+key;
 panel.dataset.careBlock=key;head.append(heading(title));
 const tools=crmEl('div','','care-reading-actions');
 if(f.importOriginal)tools.append(button('原文',()=>showCareOriginal(f,type),'care-block-action'));
 tools.append(button(active?'完成編輯':'編輯',()=>{const top=head.getBoundingClientRect().top;editingCareBlock=active?'':f.id+'|'+key;render();const next=Array.from(document.querySelectorAll('[data-care-block]')).find(x=>x.dataset.careBlock===key)?.querySelector('.care-reading-head');if(next){const delta=next.getBoundingClientRect().top-top;if(Math.abs(delta)>1)window.scrollBy({top:delta,left:0,behavior:'instant'});}},'care-block-action'));
 head.append(tools);panel.append(head,body);
 if(active){body.append(crmEl('p','修改即保存草稿；完成編輯回到閱讀。','muted'));edit(body);}
 else{read(body);if(!body.children.length)body.append(crmEl('p','尚未填寫','muted'));}
 content.append(panel);
}


const careEditLabels={
 dry:{item:'飼料品項',amount:'每次給多少',unit:'單位',location:'備品放哪裡',leftover:'剩食怎麼處理',note:'日常餵食細節'},
 wet:{item:'濕食品項',amount:'每次給多少',unit:'單位',water:'怎麼加水',location:'備品放哪裡',leftover:'剩食怎麼處理',note:'日常餵食細節'},
 snack:{item:'零食品項',amount:'每次給多少',unit:'單位',location:'備品放哪裡',note:'給零食的方式與習慣'},
 water:{place:'水碗／飲水機在哪裡',source:'用哪裡的水',care:'怎麼換水、補水',note:'日常飲水照護細節'},
 wash:{sponge:'菜瓜布',spongePlace:'菜瓜布樣式與位置',soap:'洗碗精',soapPlace:'洗碗精樣式與位置',note:'平常怎麼洗碗'},
 toilet:{place:'砂盆／尿墊在哪裡',spare:'備品放哪裡',waste:'垃圾怎麼處理',usual:'平常尿尿、便便狀況',note:'日常清潔細節'},
 play:{likes:'喜歡怎麼互動',toys:'玩具與位置',note:'陪伴方式與注意事項'},
 walk:{time:'散步時間與路線',tools:'散步用品放哪裡',note:'散步方式與安全',returnNote:'返家清潔用品與做法'},
 health:{status:'目前健康狀態',note:'健康觀察與用藥方式'}
};
const careLabel=(type,key,label)=>careEditLabels[type]?.[key]||label;
const careDefs=type=>fields[type].map(([key,label])=>[key,careLabel(type,key,label)]);
function compactCareField(f,obj,key,label,options={}){
 const el=field(obj,key,label,options);
 const spec=noteSpecs(f).find(s=>s.obj===obj&&s.key===key),rows=spec?noteRows(spec):[];
 const text=String(obj[key]||'');
 if(options.short&&!/\n/.test(text)&&text.length<=32&&rows.length<=1){el.classList.add('care-edit-short','compact');}
 else el.classList.add('care-edit-wide');
 return el;
}
function renderFoodEditor(f,o,type,body){
 body.append(check('本次提供',o.enabled!==false,yes=>{snapshot();o.enabled=yes;dirty();render();}));
 const label=key=>key==='amount'?'份量／頻率':careLabel(type,key,key);
 const noteLabel=o.enabled===false?'不提供的原因／平常習慣':label('note');
 const details=()=>{
  const g=grid();g.classList.add('care-edit-grid');
  const add=(key,short,placeholder='',options=null)=>g.append(compactCareField(f,o,key,label(key),{short,placeholder,options,compact:short}));
  add('item',true,type==='dry'?'例：飼料品牌／口味':type==='wet'?'例：罐頭、餐包':'例：肉泥、凍乾');
  add('location',true,'例：廚房高櫃');
  add('amount',true,'例：1/2、早晚不同');
  add('unit',true,'例：碗、匙、顆');
  if(type==='wet')add('water',true,'例：加 50 cc');
  if(type!=='snack')add('leftover',type==='wet','',['清掉換新','留到下一趟整理','移出洗碗後放回','沿用並補新糧','集中處理，詳見補充']);
  if(type==='dry'){
   g.append(check('需要混糧',!!o.mix,yes=>{snapshot();o.mix=yes;dirty();render();}));
   if(o.mix){g.append(compactCareField(f,o,'mixItem','另一款飼料',{short:true,placeholder:'品項'}),compactCareField(f,o,'mixAmount','混糧比例',{short:true,placeholder:'例：各一半'}));}
  }
  return g;
 };
 const note=field(o,'note',noteLabel,{long:true,placeholder:o.enabled===false?'例：吃得慢，家長在家才餵':'例：餵食順序、碗放哪裡、每隻的差異'});
 note.classList.add('care-edit-daily');
 if(o.enabled===false){body.append(note);const retained=section('查看／修改留存的餵食資料',false);retained.body.append(details());body.append(retained.e);}
 else body.append(details(),note);
}

function renderEdit(content){const f=entry.f;content.append(profilePanel(f));const linePlan=lineReservationPanel(f);if(linePlan)content.append(linePlan);if(f.importOriginal){const archive=section('舊版家訪原始紀錄（內部）',false);const pre=document.createElement('pre');pre.className='legacy-original';pre.textContent=f.importOriginal;archive.body.append(pre);content.append(archive.e);}
if(!f.groups[kind]){kind=Object.keys(f.groups)[0];petIndex=0;}

const contactDefs=[['name','家長姓名／稱呼'],['phone','電話'],['emergency','緊急聯絡人與電話'],['address','服務地址'],['guide','位置指引（選填）']];
careBlock(content,f,'booking','本次預約與家長資料','booking',body=>{
 careReadFields(f,f,[['name','家庭代表名']],body);
 const booked=bookingLines(f.booking,f.groups);if(booked.length)body.append(crmEl('p',booked.join('\n'),'care-read-value'));else body.append(crmEl('p','本次預約尚未填寫','muted'));
 const q=savedQuote(f);if(q)body.append(crmEl('p',q.key===quoteKey(f)?money(q.total)+'｜已確認報價':'預約或毛寶數量已變更，請重新確認報價','care-read-value'));
 careReadFields(f,f.contact,contactDefs,body);
 body.append(button('依現行費率快速試算',()=>quickInquiry(f)),button('歷史報價紀錄',()=>historyDialog(f)));
},body=>{let g=grid();g.append(field(f,'name','家庭代表名（也用於檔名）'));body.append(g);if(f.booking.dates||f.booking.times){const old=section('舊版預約紀錄',false);old.body.append(field(f.booking,'dates','舊版預約日期'),field(f.booking,'times','舊版時段'));body.append(old.e);}body.append(bookingEditor(f.booking,f.groups),quotePanel(f));g=grid();for(const[k,l]of contactDefs)g.append(field(f.contact,k,l));body.append(g);});
careBlock(content,f,'media','影像分享意願','media',body=>{body.append(crmEl('p',mediaLabel(f),'care-read-value'));careReadFields(f,f.media,[['note','附帶條件／避拍內容']],body);},body=>{const g=grid();g.append(field(f.media,'status','家長是否同意對外分享服務照片／影片',{options:['pending','yes','no']}));const select=g.querySelector('select');for(const o of select.options)o.textContent=({'pending':'尚未確認','yes':'同意','no':'不同意','':'尚未確認'})[o.value]||o.textContent;select.onchange=()=>{snapshot();f.media.status=select.value||'pending';f.media.decisionEditedAt=new Date().toISOString();dirty();};g.append(field(f.media,'note','附帶條件／避拍內容',{long:true}));body.append(g);});
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

const petDefs=[['name','名字'],['identity','辨識介紹（花色／品種等）'],['personality','個性、喜好與禁忌'],['area','活動／躲藏位置'],['age','年齡'],['sex','性別／稱呼'],['neuter','結紮狀態'],['health','個別健康狀況'],['intro','自由補充的完整介紹']];
const petnav=crmEl('div','','petnav');group.pets.forEach((p,i)=>petnav.append(button(p.name||'毛寶 '+(i+1),()=>{petIndex=i;editingCareBlock='';render();},petIndex===i?'active':'')));petnav.append(button('新增一位毛寶',()=>{snapshot();group.pets.push({id:crypto.randomUUID(),name:''});petIndex=group.pets.length-1;editingCareBlock=f.id+'|'+kind+'-pet-'+group.pets[petIndex].id;dirty();render();}));content.append(petnav);
if(group.pets.length){petIndex=Math.min(petIndex,group.pets.length-1);const p=group.pets[petIndex];careBlock(content,f,kind+'-pet-'+(p.id||petIndex),(p.name||'毛寶')+'的小檔案','pet',body=>careReadFields(f,p,petDefs,body),body=>{const g=grid();for(const[k,l]of petDefs)g.append(field(p,k,l,{long:k==='intro'}));body.append(g,button('刪除這位毛寶',async()=>{if(await confirmAction('刪除這位毛寶？','只移除此毛寶的個別檔案，共用照護流程仍保留。','確認刪除')){snapshot();group.pets.splice(petIndex,1);petIndex=0;editingCareBlock='';dirty();render();}}));});}
for(const type of ['health','dry','wet','snack','water','wash','play','toilet','walk']){
 if(type==='walk'&&kind!=='dog')continue;const o=group.food[type]||group[type],food=['dry','wet','snack'].includes(type);
 careBlock(content,f,kind+'-'+type,titles[type],type,body=>{
 if(food&&o.enabled===false){body.append(crmEl('p','本次不需提供'+titles[type]+'。','care-read-value'));careReadFields(f,o,[['note','不提供的原因／平常習慣（非本期指令）']],body,{inactive:true});const retained=section('查看留存品項與份量等資料',false);careReadFields(f,o,careDefs(type).filter(([k])=>k!=='note'),retained.body,{inactive:true});if(type==='dry'&&o.mix)careReadFields(f,o,[['mixItem','混糧品項'],['mixAmount','混糧比例']],retained.body,{inactive:true});if(retained.body.children.length)body.append(retained.e);return;}
 careReadFields(f,o,careDefs(type),body);if(type==='health')careReadFields(f,f,[['hospital','習慣去的動物醫院']],body);if(type==='dry'&&o.mix){body.append(crmEl('p','需要混糧','care-read-value'));careReadFields(f,o,[['mixItem','另一款飼料'],['mixAmount','兩款比例／各自份量']],body);}if(type==='walk'&&o.parts?.length)body.append(crmEl('p','返家整理：'+o.parts.join('、'),'care-read-value'));
 },body=>{
 if(food){renderFoodEditor(f,o,type,body);return;}
 const g=grid();g.classList.add('care-edit-grid');for(const[k,l]of careDefs(type)){if(['amount','unit'].includes(k)){if(k==='amount')g.append(quantity(o));continue;}if(k==='waste'&&!o.waste){const details=section('特殊垃圾處理',false);details.body.append(field(o,k,'垃圾怎麼處理'));g.append(details.e);continue;}
 const opts=k==='leftover'?['清掉換新','留到下一趟整理','移出洗碗後放回','沿用並補新糧','集中處理，詳見補充']:type==='health'&&k==='status'?['目前無需處置','需要處置','觀察即可','待家長提供']:type==='wash'&&['sponge','soap'].includes(k)?['有，寵物專用','有，使用方式待確認','與人共用','不使用','無','無寵物專用，使用方式待確認','待家長提供']:null;g.append(compactCareField(f,o,k,l,{long:['note','returnNote'].includes(k),options:opts,short:!['note','returnNote'].includes(k),compact:!!opts,placeholder:k==='note'?'記下平常怎麼照護、個別差異或注意事項':''}));}body.append(g);
 if(type==='health')body.append(field(f,'hospital','習慣去的動物醫院',{long:true}));
 if(type==='dry'){body.append(check('需要混糧',!!o.mix,yes=>{snapshot();o.mix=yes;dirty();render();}));if(o.mix){const g=grid();g.append(field(o,'mixItem','另一款飼料'),field(o,'mixAmount','兩款比例／各自份量'));body.append(g);}}
 if(type==='walk'){body.append(heading('返家清潔檢查'));const c=crmEl('div','','checks');for(const part of ['臉／眼周','嘴巴','前腳','後腳','屁股／外陰','身體／雨天擦乾'])c.append(check(part,(o.parts||[]).includes(part),yes=>{snapshot();o.parts=yes?[...new Set([...(o.parts||[]),part])]:(o.parts||[]).filter(x=>x!==part);dirty();}));body.append(c);}
 });
}
const entryDefs=[['pickup','鑰匙取得'],['door','門鎖操作與防逃脫'],['return','鑰匙歸還'],['wifi','WiFi 名稱與密碼']];
careBlock(content,f,'entry','進出、WiFi 與環境','entry',body=>{careReadFields(f,f.entry,entryDefs,body);careReadFields(f,f,[['environment','門窗與電器安排'],['extra','其他任務／本次特殊交代']],body);},body=>{const g=grid();for(const[k,l]of entryDefs)g.append(field(f.entry,k,l));g.append(field(f,'environment','門窗與電器安排',{long:true}),field(f,'extra','其他任務／本次特殊交代',{long:true}));body.append(g);});
const review=document.createElement('div');review.className='panel';review.append(heading('填完後，快速確認'));review.append(button('檢查還有沒有需要補問的資料',()=>{review.querySelectorAll('.issue').forEach(e=>e.remove());const w=warnings(f);if(!w.length){const p=document.createElement('p');p.textContent='目前沒有偵測到關鍵缺漏，仍請依家訪確認內容為準。';review.append(p);}for(const text of w){const p=document.createElement('div');p.className='issue';p.textContent=text;review.append(p);}}));content.append(review);}
function renderService(content){const f=entry.f;content.append(profilePanel(f));const linePlan=lineReservationPanel(f);if(linePlan)content.append(linePlan);const p=document.createElement('div');p.className='panel';p.append(heading('本次照護'));const desc=document.createElement('p');desc.textContent=bookingLines(f.booking,f.groups).join('\n')||'如需建立本次預約，可到家訪資料的預約區塊編輯。';desc.style.whiteSpace='pre-line';p.append(desc);const issues=warnings(f);if(issues.length){const pending=section('待確認事項（'+issues.length+'）',false);for(const t of issues){const el=document.createElement('div');el.className='issue';el.textContent=t;pending.body.append(el);}p.append(pending.e);}content.append(p);
const run=f.runs.at(-1);content.append(button(run?'建立下一趟勾選':'建立本趟照護小卡',async()=>{const warn=warnings(f);if(f.importReview)warn.push('舊家訪尚未完成本期複核');if(warn.length&&!await confirmAction('還有資料待確認','目前有 '+warn.length+' 項待確認。仍可建立小卡，現場請勿自行推測缺漏指示。','仍建立小卡'))return;const d=day();snapshot();f.runs.push({id:crypto.randomUUID(),label:d.year+'/'+d.month+'/'+d.day+' 第 '+(f.runs.length+1)+' 趟',createdAt:new Date().toISOString(),source:sourceKey(f),tasks:tasks(f),checks:{}});dirty();render();},'primary'));
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
const audit=crmEl('div','','pdf-audit-summary');audit.hidden=true;
function showAudit(report){
 const body=crmEl('div','','pdf-audit-detail'),dlg=crmDialog('原始家訪與 PDF 核對（內部）',body);
 const pending=report.total-report.matched;
 body.append(crmEl('p','原文可核對 '+report.matched+'／'+report.total+'；待核對 '+pending+' 項。待核對不等於漏失，改寫、欄位分拆及過期指示也可能造成差異。這不是語意完整度。','muted'));
 const appendRows=(root,groups,matched)=>{for(const g of groups){const rows=g.rows.filter(x=>x.matched===matched);if(!rows.length)continue;const block=crmEl('div','','pdf-audit-group');block.append(crmEl('strong',g.title));for(const row of rows)block.append(crmEl('p',row.text,matched?'muted':'issue'));root.append(block);}};
 if(pending)appendRows(body,report.groups,false);else body.append(crmEl('p','沒有未匹配的原文項目；仍須確認關鍵照護語意。','muted'));
 if(report.matched){const s=section('查看已核對原文（'+report.matched+'）',false);appendRows(s.body,report.groups,true);body.append(s.e);}
 if(report.excluded.length){const s=section('查看不計入的舊預約與行政欄位（'+report.excluded.length+'）',false);for(const x of report.excluded)s.body.append(crmEl('p',x,'muted'));body.append(s.e);}
 dlg.showModal();
}
async function generate(){const warn=warnings(entry.f);if(savedQuote(entry.f)&&savedQuote(entry.f).key!==quoteKey(entry.f))warn.push('本次報價已失效，需重新確認（PDF 不會帶入舊報價）');if(warn.length&&!await confirmAction('有 '+warn.length+' 項資料待確認',warn.join('\n')+'\n\n這份提醒只供保姆補問。仍可預覽給家長的計畫書。','仍產生預覽'))return null;if(owner!==entry||!content.isConnected)return null;const revision=owner.rev,settings=brand;
const result=await buildPDF(structuredClone(owner.f),{...settings});
if(owner!==entry||owner.rev!==revision||brand!==settings||!content.isConnected)return null;
currentPDF={result,revision,settings};audit.replaceChildren();audit.hidden=true;if(owner.f.importOriginal){const report=auditLegacyCoverage(owner.f.importOriginal,result.drawnText);audit.hidden=false;const info=crmEl('div','','pdf-audit-info');info.append(crmEl('strong','原始家訪核對・內部'),crmEl('small','待核對 '+(report.total-report.matched)+' 項｜原文可核對 '+report.matched+'／'+report.total,'muted'));audit.append(info,button('查看核對結果',()=>showAudit(report),'pdf-audit-open'));}preview.replaceChildren();for(const data of result.pages){const img=document.createElement('img');img.src=data;img.alt='A4 照護計畫書預覽';preview.append(img);}preview.hidden=false;return result;}
const actions=document.createElement('div');actions.className='actions';actions.append(button('產生／更新 A4 預覽',async()=>{try{await generate();}catch(e){toast('PDF 產生失敗：'+e.message);}},'primary'),button('下載 PDF',async()=>{try{if(!bookingSegments(owner.f.booking).length&&!owner.f.booking.dates&&readLineReservations(owner.f).some(r=>r.state==='confirmed'))return toast('請先確認本次預約，避免正式 PDF 缺少已確認的出勤安排。');if(owner.f.importReview&&!await confirmAction('舊家訪尚未完成本期複核','可以繼續下載；請先確認本期醫療、飲食、安全等內容。未確認的舊單次指示不會自動列入。','仍下載 PDF'))return;if(owner!==entry||!content.isConnected)return;const result=currentPDF?.revision===owner.rev&&currentPDF.settings===brand&&owner===entry?currentPDF.result:await generate();if(!result)return;const finalName=name.value.trim().replace(/[\\/:*?"<>]/g,'_')||result.name;await saveFile(result.blob,finalName.endsWith('.pdf')?finalName:finalName+'.pdf');}catch(e){if(e.name!=='AbortError')toast('下載未完成：'+e.message);}}));intro.append(actions,audit);content.append(intro,preview);}
async function saveFile(blob,name){if('showSaveFilePicker'in window){try{const handle=await window.showSaveFilePicker({suggestedName:name,startIn:'downloads',types:[{description:'PDF 照護計畫書',accept:{'application/pdf':['.pdf']}}]});const writable=await handle.createWritable();await writable.write(blob);await writable.close();toast('PDF 已儲存到你選擇的位置。');return;}catch(e){if(e.name==='AbortError')return;if(e.name!=='SecurityError'&&e.name!=='NotAllowedError')throw e;}}download(blob,name);toast('PDF 已交給瀏覽器下載。請在系統下載／儲存畫面選擇你的照護計畫書資料夾。');}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function sync(record){if(!record)return;if(!ready()){status();return;}if(syncBusy){schedule();return;}if(!record.f.name.trim()&&!record.f.archived){toast('請先填家庭名稱，再同步 Drive。');return;}if(record.remote&&record.syncedRev===record.rev)return;syncBusy=true;activeSyncId=record.id;status();const rev=record.rev;const snapshot=structuredClone(record.f);try{await localChain;if(failures.has(record.id))throw Error('本機儲存失敗');for(const p of snapshot.photos)if(!p.driveId){const upload=await drive.upload(p.name,await photoBlob(p),'photo-v1',snapshot.id);p.driveId=upload.id;const live=record.f.photos.find(x=>x.id===p.id);if(live)live.driveId=p.driveId;}if(!record.remote&&!record.reservedId){record.reservedId=await drive.reserve();await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');}const previousAttempt=record.attemptBase;record.attemptBase=await digest(snapshot);await persist(record);if(failures.has(record.id))throw Error('本機儲存失敗');const saved=await drive.save(snapshot,record.remote,'family-v1',record.reservedId,previousAttempt);const loaded=await drive.load(saved.id);if(loaded.data.id!==snapshot.id||loaded.base!==await digest(snapshot))throw Error('雲端讀回不一致，未標記同步成功');record.remote={id:saved.id,version:loaded.version,etag:loaded.etag,base:loaded.base};record.syncError='';blocked.delete(record.id);record.syncedAt=Date.now();record.syncedRev=rev;await persist(record);}catch(e){record.syncError=e.message;if(e.status===401){forgetGrant();sessionMessage('remember',null);}if(!record.remote&&e.remoteId)record.remote={id:e.remoteId};if(/衝突|條件寫入|儲存失敗|無法安全|權限/.test(e.message)||e.status===403)blocked.add(record.id);else if(ready()){clearTimeout(syncTimer);syncTimer=setTimeout(drain,15000);}if(blocked.has(record.id)&&entry===record&&e.message.includes('衝突'))toast('同步衝突：請由家庭右上角 ⋯ 開啟家庭維護處理。');}finally{syncBusy=false;activeSyncId=null;status();list();if(record.rev>rev&&!blocked.has(record.id))schedule();}}
async function connect(session=null){const id=$('clientId').value.trim()||window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';if(!id.endsWith('.apps.googleusercontent.com')){toast('需先設定 App 專用的 Google OAuth 用戶端 ID。');return;}if(connecting||syncBusy)return;connecting=true;connectionError='';status();try{localStorage.setItem('liliOAuthClientId',id);await drive.connect(id,session);const grant={token:drive.token,expires:drive.expires};sessionMessage('remember',grant);await rememberGrant(db,grant).catch(()=>{});$('setup').close();$('connection').textContent='已連接保姆 Google Drive';const files=await drive.families();for(const file of files){const known=records.find(r=>r.remote?.id===file.id);if(known&&(known.rev!==known.syncedRev||known.remote.base&&known.remote.version===file.version))continue;const loaded=await drive.load(file.id);const f=loaded.data.schema===2?normalize(loaded.data):migrate(loaded.data,legacyText(loaded.data));let r=known||records.find(x=>x.id===f.id);if(r&&r.rev!==r.syncedRev){toast('發現同一家庭的本機未同步修改，保留草稿，沒有覆寫。');continue;}if(!r){r={id:f.id};records.push(r);}Object.assign(r,{f,remote:{id:file.id,version:loaded.version,etag:loaded.etag,base:loaded.base},rev:1,syncedRev:loaded.data.schema===2?1:0});await persist(r);}list();if(entry){entry=records.find(x=>x.id===entry.id);if(entry?.f.archived&&!archiveView)entry=null;render();}await syncBrand(true);blocked.clear();toast('已載入雲端資料，未同步的原瀏覽器草稿會依序同步。');}catch(e){if(e.status===401){forgetGrant();sessionMessage('remember',null);}connectionError=String(e.message||e);toast('連線未完成：'+e.message);}finally{connecting=false;schedule();status();}}
function dataURL(blob){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(blob);});}



function profileSelect(parent,label,options,value){const l=labelText(crmEl('label'),label),s=crmEl('select');for(const [v,t] of options){const o=crmEl('option',t);o.value=v;s.append(o);}s.value=value;l.append(s);parent.append(l);return s;}
function filterDialog(){
 const dlg=crmEl('dialog','','crm-modal family-filter-dialog'),header=crmEl('div','','filter-header'),body=crmEl('div','','filter-body'),footer=crmEl('div','','filter-footer'),controls={};
 const title=heading('家庭篩選');title.id='familyFilterTitle';dlg.setAttribute('aria-labelledby',title.id);
 const close=button('×',()=>dlg.close(),'filter-close');close.setAttribute('aria-label','關閉篩選');header.append(title,close);
 body.append(crmEl('p','同一類可複選，不同類條件會交叉篩選。','filter-intro'));
 const add=(k,label,options)=>{const section=crmEl('fieldset','','filter-section'),legend=crmEl('legend',label),choices=crmEl('div','','filter-options');section.append(legend,choices);const existing=Array.isArray(familyFilters[k])?familyFilters[k]:familyFilters[k]?[familyFilters[k]]:[];controls[k]=options.map(([v,t])=>{const l=crmEl('label','','filter-choice'),c=crmEl('input');c.type='checkbox';c.value=v;c.checked=existing.includes(v);l.append(c,crmEl('span',t));choices.append(l);c.addEventListener('change',preview);return c;});body.append(section);};
 const collect=()=>{const q={};for(const[k,cs]of Object.entries(controls)){const v=cs.filter(c=>c.checked).map(c=>c.value);if(v.length)q[k]=v;}if(from.value)q.from=from.value;if(to.value)q.to=to.value;return q;};
 const count=crmEl('small','','filter-result-count');count.setAttribute('aria-live','polite');
 function preview(){const q=collect();if(q.from&&q.to&&q.from>q.to){count.textContent='請確認月份起訖';apply.disabled=true;return;}const n=records.filter(r=>!!r.f.archived===archiveView&&matchesFamily(r.f,$('search').value)&&matchesProfile(r.f,q)).length;count.textContent='符合 '+n+' 戶';apply.textContent='顯示 '+n+' 戶家庭';apply.disabled=false;}
 if(!archiveView)add('booking','預約狀態',[['upcoming','今日／未來有預約'],['none','無今日或未來預約']]);
 add('risk','接案狀態',Object.entries(riskLabel));
 add('excludeRisk','排除家庭',[['blacklist','排除黑名單'],['watch','排除重點注意']]);
 add('city','服務縣市',[['嘉義市','嘉義市'],['嘉義縣','嘉義縣'],['unknown','其他／未知']]);
 const districts=[...new Set(records.map(r=>familyArea(r.f).district).filter(Boolean))].sort();if(districts.length)add('district','行政區',districts.map(d=>[d,d]));
 add('type','家庭類型',[['cat','純喵'],['dog','純犬'],['mixed','犬喵同住'],['unknown','尚未建毛寶']]);
 add('count','毛寶數量',[['single','單寵'],['multi','多寵'],['unknown','未建檔']]);
 add('km','基準車程',[5,7,10,15,20,25,30].map(v=>[String(v),v+' km 內']).concat([['unknown','未建檔']]));
 add('stage','建檔狀態',Object.entries(profileStages));
 add('age','服務年資',[['under6','未滿半年'],['6','半年以上'],['12','一年以上'],['24','兩年以上'],['unserved','尚未服務'],['unknown','月份未知']]);
 const months=crmEl('fieldset','','filter-section');months.append(crmEl('legend','最早已知服務月份'));const monthFields=crmEl('div','','filter-months');months.append(monthFields);body.append(months);const from=crmInput(monthFields,'起始',familyFilters.from||'','month'),to=crmInput(monthFields,'結束',familyFilters.to||'','month');from.addEventListener('change',preview);to.addEventListener('change',preview);
 const clear=button('清除全部',()=>{for(const cs of Object.values(controls))for(const c of cs)c.checked=false;from.value='';to.value='';preview();},'filter-clear');
 const apply=button('顯示家庭',()=>{const q=collect();if(q.from&&q.to&&q.from>q.to)return;familyFilters=q;dlg.close();list();},'primary filter-apply');
 const footerActions=crmEl('div','','filter-footer-actions');footerActions.append(clear,apply);footer.append(count,footerActions);dlg.append(header,body,footer);dlg.addEventListener('close',()=>dlg.remove(),{once:true});document.body.append(dlg);keepDialogPosition(dlg).showModal();preview();
}
function profileIcon(kind){
 const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');
 for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'profile-icon'}))s.setAttribute(k,v);
 const paths={pin:['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z','M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],chat:['M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2-4a8.5 8.5 0 1 1 15-4.5Z','M8 10h9','M8 14h6'],route:['M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z','M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z','M6 9v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9'],edit:['M13.5 6.5 17.5 10.5','M4 20l5-.8L20 8.2a2.8 2.8 0 0 0-4-4L5 15.2 4 20Z']};
 for(const d of paths[kind]||[]){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);s.append(p);}return s;
}
function profileExternal(label,url,icon,secondary=false){const a=crmEl('a','','profile-link profile-action'+(secondary?' profile-secondary':''));a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.append(profileIcon(icon),crmEl('span',label));return a;}
function profilePanel(f){
 const p=readProfile(f.profile),box=crmEl('div','','panel profile-panel'),a=familyArea(f),age=profileAge(f,new Date().toISOString());
 const meta=crmEl('div','','profile-meta');for(const [label,cls] of [[profileStages[p.stage],''],[a.city+a.district,''],[p.km!==''?'基準 '+p.km+' km':'距離未建檔',''],[p.firstServiceMonth?'最早已知服務 '+(p.firstServiceDate||p.firstServiceMonth)+'（約 '+age+' 個月）':p.serviceState==='unserved'?'尚未正式服務':'首次服務月份未知','profile-tenure']])if(label)meta.append(crmEl('span',label,'profile-chip '+cls));
 box.append(heading('家庭工作站'),meta);
 const actions=crmEl('div','','profile-actions'),addr=f.contact.address?.trim();
 if(p.mapUrl)actions.append(profileExternal('開啟導航',p.mapUrl,'pin'));
 else if(addr)actions.append(profileExternal('依地址導航','https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addr)+'&travelmode=two-wheeler','pin'));
 if(p.lineUrl)actions.append(profileExternal('聯繫家長・LINE',p.lineUrl,'chat'));
 if(addr){const route=profileExternal('查基準車程','https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent('嘉義福容 VOCO')+'&destination='+encodeURIComponent(addr)+'&travelmode=two-wheeler','route',true);route.title='依服務地址查詢，請核對同一地標';actions.append(route);}
 const edit=button('',()=>profileDialog(f),'profile-action profile-secondary');edit.append(profileIcon('edit'),crmEl('span','編輯家庭資料'));actions.append(edit);box.append(actions);
 if(p.mapUrl)box.append(crmEl('small','地標開啟後可選擇路線／機車導航；基準車程請核對目的地。','profile-hint'));else if(addr)box.append(crmEl('small','依地址導航與查詢車程，請核對目的地。','profile-hint'));return box;
}
function profileDialog(f){const body=crmEl('div'),dlg=crmDialog(f?'家庭基本資訊（內部）':'快速建立家庭',body),p=readProfile(f?.profile);const name=crmInput(body,'家庭名稱（必填）',f?.name||'','text'),parent=crmInput(body,'家長稱呼',f?.contact.name||'','text'),stage=profileSelect(body,'建檔狀態',Object.entries(profileStages),f?p.stage:'new_unvisited'),service=profileSelect(body,'服務狀態',[['unknown','未知'],['unserved','尚未正式服務'],['served','曾服務']],f?p.serviceState:'unserved'),exact=crmInput(body,'最早已知服務日期（有明確日期才填）',p.firstServiceDate,'date'),month=crmInput(body,'服務月份（日期未知時填）',p.firstServiceMonth,'month'),map=crmInput(body,'Google Maps 地標連結',p.mapUrl,'url'),line=crmInput(body,'LINE 聊天室連結',p.lineUrl,'url'),km=crmInput(body,'嘉義福容 VOCO 單程機車公里',p.km,'number','0.1'),known=crmEl('textarea');km.min='0';exact.max=taipeiDate();exact.onchange=()=>{if(exact.value)month.value=exact.value.slice(0,7);};month.onchange=()=>{if(exact.value&&exact.value.slice(0,7)!==month.value)exact.value='';};known.value=p.known;known.placeholder='目前已知資訊（內部，不會寫成照護指令）';body.append(known,crmEl('p','僅保存內部連結與基本資訊；未經家訪確認的資料不會自動成為照護指令。','muted'));body.append(button('保存家庭基本資訊',async()=>{if(!name.value.trim())return toast('請輸入家庭名稱');const q=readProfile({stage:stage.value,serviceState:service.value,firstServiceDate:exact.value,firstServiceMonth:month.value,firstServiceEvidence:month.value===p.firstServiceMonth&&exact.value===p.firstServiceDate?p.firstServiceEvidence:'主理人填寫',mapUrl:map.value.trim(),lineUrl:line.value.trim(),km:km.value,kmEvidence:km.value===p.km?p.kmEvidence:'主理人確認',known:known.value});if(map.value.trim()&&!q.mapUrl||line.value.trim()&&!q.lineUrl||km.value!==''&&q.km==='')return toast('請核對網址或公里格式');if(exact.value&&(!validServiceDate(exact.value)||exact.value>taipeiDate()))return toast('請確認實際服務日期');if(q.firstServiceMonth&&q.serviceState==='unserved')return toast('尚未服務不可填已服務月份');if(q.lineUrl&&records.some(r=>r.id!==f?.id&&readProfile(r.f.profile).lineUrl===q.lineUrl))return toast('此 LINE 聊天室已屬另一家庭，請核對');if(!f&&records.some(r=>r.f.name.trim()===name.value.trim()))return toast('已有同名家庭，請搜尋原檔');if(f){if(entry?.f!==f)return toast('家庭已切換');snapshot();f.name=name.value.trim();if((f.contact.name||'')!==parent.value.trim())f.contact.name=parent.value.trim();f.profile=q;dirty();dlg.close();render();}else{const n=fresh();n.name=name.value.trim();n.updatedAt=new Date().toISOString();if(parent.value.trim())n.contact.name=parent.value.trim();n.profile=q;const r={id:n.id,f:n,remote:null,rev:1,syncedRev:0};await persist(r);if(failures.has(r.id))return toast('本機保存失敗');records.push(r);dlg.close();if(archiveView)familyPage=0;archiveView=false;await openRecord(r.id);schedule();}},'primary'));dlg.showModal();}
async function importProfiles(file){if(importingLegacy||photoBusy||draining||syncBusy||connecting||brandSyncActive)return toast('請先完成現有同步');importingLegacy=true;importError='';status();try{if(file.size>20*1024*1024)throw Error('檔案過大');await localChain;const safe=()=>ready()&&!draining&&!syncBusy&&!connecting&&!brandSyncActive&&!photoBusy&&!brandState.dirty&&records.every(r=>r.remote&&r.rev===r.syncedRev&&!failures.has(r.id)&&!pending.get(r.id));if(!safe())throw Error('請先全域同步並連接 Drive');const packet=JSON.parse(await file.text()),plan=prepareProfilePatch(packet,records.map(r=>r.f));const body=crmEl('div'),dlg=crmDialog('家庭工作站增量回填',body),items=crmEl('div','','sync-list'),selected=[];body.append(crmEl('p','一般欄位只補空白；首次服務日期精修僅在舊月份與證據吻合時更新，不覆蓋人工修改，不改預約、照護、正式報價。','muted'));for(const p of plan.accepted){const box=crmEl('div','','sync-item'),c=crmCheck(box,(p.new?'新增｜':'更新｜')+p.name,!p.new);selected.push([p,c]);box.append(crmEl('small',[p.patch.mapUrl?'地標':'',p.patch.lineUrl?'LINE':'',p.patch.km!==undefined?'公里 '+p.patch.km:'',p.refinement?((p.oldMonth||'未建檔')+' → '+p.patch.firstServiceDate):p.patch.firstServiceMonth||'',p.patch.stage?profileStages[p.patch.stage]:'',p.watch?'重點注意':'',...p.conflicts].filter(Boolean).join('・')));items.append(box);}for(const p of plan.skipped)items.append(crmEl('p',p.name+'：'+p.reason,'muted'));body.append(crmEl('strong','可更新／新增 '+plan.accepted.length+' 戶'),items);const apply=button('確認回填勾選家庭',async()=>{apply.disabled=true;try{await localChain;if(!safe())throw Error('資料狀態已改變，請重新預覽');const wanted=new Set(selected.filter(([,c])=>c.checked).map(([p])=>p.id)),latest=prepareProfilePatch(packet,records.map(r=>r.f));let n=0,fail=[];for(const p of latest.accepted.filter(p=>wanted.has(p.id))){const r=records.find(r=>r.id===p.id),f=applyProfilePatch(r?.f,p),next=r?{...structuredClone(r),f,rev:r.rev+1}:{id:f.id,f,remote:null,rev:1,syncedRev:0};f.updatedAt=new Date().toISOString();try{await db.put('families',next);if(r)Object.assign(r,next);else records.push(next);n++;}catch(e){fail.push(p.name+'：'+e.message);}}if(fail.length)importError=fail.join('\n');pdf=null;undo=[];dlg.close();render();toast('已回填 '+n+' 戶，請確認全域同步。'+(fail.length?' 部分保存失敗。':''));}catch(e){toast(e.message);apply.disabled=false;}},'primary');apply.disabled=!plan.accepted.length;body.append(apply);await new Promise(resolve=>{dlg.addEventListener('close',resolve,{once:true});dlg.showModal();});}catch(e){importError=String(e.message||e);toast('回填未完成：'+e.message);}finally{importingLegacy=false;$('profileFile').value='';schedule();status();}}
async function importLineHistory(file){
 if(importingLegacy||photoBusy||draining||syncBusy||connecting||brandSyncActive)return toast('請先完成現有同步，再匯入 LINE 歷史報價。');
 importingLegacy=true;importError='';status();
 try{
  if(file.size>20*1024*1024)throw Error('匯入檔過大');
  await localChain;
  const safe=()=>ready()&&!draining&&!syncBusy&&!connecting&&!brandSyncActive&&!photoBusy&&!brandState.dirty&&records.every(r=>r.remote&&r.rev===r.syncedRev&&!failures.has(r.id)&&!pending.get(r.id));
  if(!safe())throw Error('請先讓現有家庭全域同步完成，並保持 Google Drive 連線');
  const packet=JSON.parse(await file.text()),plan=prepareLineHistory(packet,records.map(r=>r.f));
  const body=crmEl('div'),dlg=crmDialog('LINE 歷史報價增量匯入',body);
  body.append(crmEl('p','只補充既有家庭的內部歷史來源與已確認的黑名單，不改預約、正式報價、家庭專屬價或照護資料。','muted'));
  const list=crmEl('div','','sync-list'),selected=[];
  for(const p of plan.accepted){const box=crmEl('div','','sync-item'),check=crmCheck(box,p.name+'｜'+p.add.length+' 則'+(p.black?'・設為黑名單':''),true);selected.push([p,check]);list.append(box);}
  for(const p of plan.skipped)list.append(crmEl('p',p.name+'：'+p.reason,'muted'));
  body.append(crmEl('strong','可更新 '+plan.accepted.length+' 戶・'+plan.accepted.reduce((n,p)=>n+p.add.length,0)+' 則來源'),list);
  const apply=button('確認匯入勾選家庭',async()=>{
   apply.disabled=true;try{
    await localChain;if(!safe())throw Error('資料狀態已變更，請完成同步後重新預覽');
    const wanted=new Set(selected.filter(([,c])=>c.checked).map(([p])=>p.id)),latest=prepareLineHistory(packet,records.map(r=>r.f));let count=0,entries=0,fail=[];
    for(const p of latest.accepted.filter(p=>wanted.has(p.id))){
     const r=records.find(r=>r.id===p.id),next={...structuredClone(r),f:applyLineHistory(r.f,p),rev:r.rev+1};next.f.updatedAt=new Date().toISOString();
     try{await db.put('families',next);Object.assign(r,next);count++;entries+=p.add.length;}catch(e){fail.push(p.name+'：'+String(e.message||e));}
    }
    if(fail.length)importError=fail.join('\n');pdf=null;undo=[];dlg.close();render();toast('已補入 '+count+' 戶、'+entries+' 則歷史來源。'+(fail.length?'部分失敗，請查看同步明細。':'請確認全域同步完成。'));
   }catch(e){toast(e.message);apply.disabled=false;}
  },'primary');apply.disabled=!plan.accepted.length;body.append(apply);
  await new Promise(resolve=>{dlg.addEventListener('close',resolve,{once:true});dlg.showModal();});
 }catch(e){importError=String(e.message||e);toast('歷史報價匯入未完成：'+e.message);}finally{importingLegacy=false;$('lineHistoryFile').value='';schedule();status();}
}

async function importLegacy(file){
 if(importingLegacy||photoBusy)return toast('目前有其他資料正在處理，請稍後再操作。');
 importingLegacy=true;importError='';status();
 try{
  if(file.size>20*1024*1024)throw Error('匯入檔太大，請分批處理');
  if(!ready())throw Error('請先連接 Google Drive 並完成雲端家庭載入，避免重複匯入');
  await localChain;
  const packet=JSON.parse(await file.text());
  let plan=prepareLegacyBatch(packet,records.map(r=>r.f));
  const dlg=document.createElement('dialog');dlg.className='crm-modal';
  const title=document.createElement('h2');title.textContent='舊客批次匯入預覽';
  const desc=document.createElement('p');desc.textContent='可新增 '+plan.accepted.length+' 戶，略過 '+plan.skipped.length+' 戶。只新增、不覆蓋；全部標記舊資料待複核。';
  dlg.append(desc);
  const details=document.createElement('div');details.className='legacy-preview';
  for(const f of plan.accepted){const p=document.createElement('p');p.textContent='新增｜'+f.name;details.append(p);}
  for(const s of plan.skipped){const p=document.createElement('p');p.textContent='略過｜'+s.name+'：'+s.reason;details.append(p);}
  dlg.append(details);
  const actions=document.createElement('div');actions.className='row';
  const proceed=button('確認匯入 '+plan.accepted.length+' 戶',()=>dlg.close('yes'),'primary');proceed.disabled=!plan.accepted.length;
  const cancel=button('取消',()=>dlg.close('no'));actions.append(cancel,proceed);dlg.prepend(dialogCloseHeader(dlg,title,cancel));dlg.append(actions);document.body.append(dlg);
  const answer=await new Promise(resolve=>{dlg.addEventListener('close',()=>resolve(dlg.returnValue==='yes'),{once:true});dlg.showModal();});dlg.remove();
  if(!answer)return;
  if(!ready())throw Error('雲端連線已失效，請重新連接後再匯入');
  plan=prepareLegacyBatch(packet,records.map(r=>r.f));
  let count=0;const failed=[];
  for(const f of plan.accepted){
   const r={id:f.id,f,remote:null,rev:1,syncedRev:0};
   try{await db.put('families',r);records.push(r);count++;}catch(e){failed.push(f.name+'：'+String(e.message||e));}status();
  }
  if(failed.length)importError=failed.join('\n');list();schedule();
  toast('已新增 '+count+' 戶本機家庭草稿，略過 '+plan.skipped.length+' 戶；將沿用既有 Drive 同步流程。'+(failed.length?'\n未保存：'+failed.join('、'):'')+'\n請確認同步完成後再進行跨瀏覽器驗收。');
 }catch(e){importError=String(e.message||e);toast('匯入未完成：'+e.message);}finally{importingLegacy=false;$('legacyImportFile').value='';status();}
}
async function backup(){if(!entry)return;try{await localChain;const f=structuredClone(entry.f),originals={};for(const p of f.photos)originals[p.id]=await dataURL(await photoBlob(p));download(new Blob([JSON.stringify({format:'lili-homecare-backup',version:2,family:f,originals,brand})],{type:'application/json'}),(f.name||'家庭')+'_完整內部備份.json');toast('完整備份已交給瀏覽器下載，內含原始照片，請勿傳給家長。');}catch(e){toast('備份未完成：'+e.message);}}
async function restore(file){try{const b=JSON.parse(await file.text());if(b.format!=='lili-homecare-backup'||![1,2].includes(b.version)||!b.originals)throw Error('不是完整備份');const f=b.version===2?normalize(b.family):migrate(b.family,legacyText(b.family));const staged=[];for(const p of f.photos){const data=b.originals[p.id];if(typeof data!=='string'||!data.startsWith('data:'+p.mime+';base64,'))throw Error('照片原檔缺漏：'+p.name);const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));if(bytes.length!==p.size)throw Error('照片原檔大小不符');const newId=crypto.randomUUID();staged.push([newId,new Blob([bytes],{type:p.mime})]);p.id=newId;delete p.driveId;}if(!await confirmAction('還原成獨立家庭副本？','會保留現有資料，不會覆蓋同名家庭。','確認還原'))return;for(const[id,blob]of staged)await db.put('photos',blob,id);f.id=crypto.randomUUID();f.name+='（還原副本）';const r={id:f.id,f,remote:null,rev:1,syncedRev:0};records.push(r);await persist(r);await openRecord(r.id);if(b.brand&&['service','promise','contact'].every(k=>typeof b.brand[k]==='string')&&await confirmAction('也還原共用品牌設定？','這會更新本機及後續同步的全家庭共用設定。','還原品牌設定')){brand=readBrand({service:b.brand.service,promise:b.brand.promise,contact:b.brand.contact,rates:b.brand.rates||brandDefaults.rates});brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',brand,'brand');}schedule();toast('已還原為原瀏覽器草稿，請確認內容後同步 Drive。');}catch(e){toast('還原失敗：'+e.message);}finally{$('restoreFile').value='';}}

async function returnDirectory({archive=archiveView}={}){
 if(photoBusy){toast('照片正在保存，請稍候。');return;}
 await localChain;
 if(entry&&failures.has(entry.id)){toast('目前家庭本機儲存失敗，請先下載備份。');return;}
 if(archiveView!==archive){familyPage=0;delete familyFilters.booking;}archiveView=archive;$('archive').textContent=archiveView?'返回家庭檔案':'已刪除家庭';
 entry=null;undo=[];pdf=null;view='service';
 try{await db.put('settings','','lastFamily');}catch(e){toast('未能保存上次瀏覽位置：'+e.message);}
 render();
}


async function cleanupCareData(mode){
 if(importingLegacy||draining||syncBusy||photoBusy||connecting||brandSyncActive)return toast('請等目前作業完成');
 importingLegacy=true;status();
 try{
  await localChain;
  const compute=f=>{if(mode==='flags'){const r=clearCareFlags(f);return {copy:r.copy,count:r.count,review:0};}if(mode==='supplies')return tidyLegacySupplies(f);if(mode==='dedupe')return dedupeLegacySupplies(f);const r=relocateLegacyHospital(f);return {copy:r.copy,count:r.moved,review:r.review};};
  const plan=records.filter(r=>mode==='flags'||!r.f.archived).map(r=>({r,f:r.f,rev:r.rev,result:compute(r.f)}));
  const count=plan.reduce((n,x)=>n+x.result.count,0),review=plan.filter(x=>x.result.review);
  const body=crmEl('div'),dlg=crmDialog(mode==='flags'?'清除全域小卡旗標':mode==='supplies'?'整理備品位置與菜瓜布':mode==='dedupe'?'整理重複備品位置':'整理舊家訪醫院',body);
  body.append(crmEl('p',mode==='flags'?'全部家庭目前的旗標（含已刪除家庭）都改為不加入小卡。文字、時效、待確認狀態及已產生的歷史小卡不變。':mode==='supplies'?'只補入原備註中明確的備品位置，保留原文與時效，不覆蓋已有欄位。將已記載有菜瓜布但使用方式待確認的項目改為寵物專用，共用或否定例外保留。':mode==='dedupe'?'只有已在備品位置欄完整保留且有效期限一致的獨立重複文字才移除；保留原問卷、其他交代、旗標及歷史。':'只搬移原問卷「指定救援醫院」與舊其他任務完全相符的資料，保留完整原文，搬移後仍待你確認。','muted'));
  body.append(crmEl('strong','預計 '+plan.filter(x=>x.result.count).length+' 戶，'+count+' 項'));
  if(mode==='dedupe')for(const x of plan.filter(x=>x.result.count)){const s=section(x.f.name+'｜'+x.result.count+' 項',false);for(const c of x.result.changes)s.body.append(crmEl('p',(c.kind==='cat'?'喵寶':'犬寶')+'・'+titles[c.type]+'：移除重複行「'+c.removed+'」；保留備品位置「'+c.kept+'」'));body.append(s.e);}if(review.length){const s=section('有差異，未自動修正（'+review.length+' 戶）',false);for(const x of review)s.body.append(crmEl('p',x.f.name));body.append(s.e);}
  const cancel=dlg.querySelector(':scope > button:last-child');
  const apply=button(mode==='flags'?'確認清除全部旗標':mode==='supplies'?'確認整理備品與菜瓜布':mode==='dedupe'?'確認清理重複行':'確認搬移醫院',async()=>{
   if(apply.disabled)return;if(!ready()||draining||syncBusy||connecting||photoBusy||brandSyncActive)return toast('請先連線 Drive 並完成同步。');
   apply.disabled=true;cancel.disabled=true;
   try{
    await localChain;let saved=0,skip=0;
    for(const x of plan){
     if(!x.result.count)continue;const r=x.r;
     if(!records.includes(r)||r.f!==x.f||r.rev!==x.rev||!r.remote||r.rev!==r.syncedRev||pending.get(r.id)||failures.has(r.id)||blocked.has(r.id)){skip++;continue;}
     const result=compute(r.f);if(!result.count)continue;
     result.copy.updatedAt=new Date().toISOString();const next={...r,f:result.copy,rev:r.rev+1};
     if(!await db.replaceUnchanged(r,next)){skip++;continue;}Object.assign(r,next);saved+=result.count;
    }
    dlg.close();undo=[];pdf=null;render();toast('已保存 '+saved+' 項，略過 '+skip+' 戶；請核對同步狀態。'+(review.length?' 另有 '+review.length+' 戶待核對。':''));
   }catch(e){toast('未全部完成，可重新開啟檢查。'+e.message);}
   finally{apply.disabled=false;cancel.disabled=false;}
  },'primary');
  apply.disabled=!count;body.append(apply);dlg.addEventListener('cancel',e=>{if(cancel.disabled)e.preventDefault();});
  await new Promise(resolve=>{dlg.addEventListener('close',resolve,{once:true});dlg.showModal();});
 }catch(e){toast('無法完成預覽：'+e.message);}
 finally{importingLegacy=false;schedule();status();}
}
async function importCareFields(file){
 if(importingLegacy||syncBusy||draining||photoBusy||connecting)return toast('請等目前作業完成');
 importingLegacy=true;status();
 try{
  if(file.size>20*1024*1024)throw Error('修正檔過大');
  let packet=JSON.parse(await file.text());await localChain;
  let refinement=null;if(packet?.format==='lili-food-refinement'){refinement=prepareFoodRefinement(packet,records.map(r=>r.f));packet=refinement.packet;}
  const plan=inspectCarePatch(packet,records.map(r=>r.f));
  const body=crmEl('div'),dlg=crmDialog('逐戶預覽照護修正',body),choices=[];
  body.append(crmEl('p','勾選要採用的修正組。同組欄位一起搬移；任一舊值、旗標或家庭來源不符，就整組略過。'));if(refinement){const s=refinement.summary;body.append(crmEl('strong','飲食精修：可補 '+s.eligible+' 欄・已相同 '+s.unchanged+' 欄・略過 '+s.skipped+' 欄・可移除重複行 '+s.removed+' 行'));if(s.review.length){const d=section('略過原因（'+s.review.length+'）',false);for(const x of s.review)d.body.append(crmEl('p',x.name+'｜'+x.block+'｜'+x.reason));body.append(d.e);}}
  const bulk=crmEl('div','','row'),selectionCount=crmEl('small','','muted');
  const refreshSelection=()=>{const eligible=choices.filter(({set,c})=>set.result==='ready'&&!c.disabled),selected=eligible.filter(({c})=>c.checked).length;selectionCount.textContent='已勾選 '+selected+'／'+eligible.length+' 組可套用修正';};
  const setAll=value=>{for(const {set,c} of choices){if(set.result==='ready'&&!c.disabled)c.checked=value;}refreshSelection();};
  const selectAll=button('全選可套用',()=>setAll(true)),clearAll=button('取消全選',()=>setAll(false));
  bulk.append(selectAll,clearAll,selectionCount);body.append(bulk);
  for(const h of plan){
   const box=section(h.name,false);
   for(const set of h.sets){
    const label=set.label+(set.result==='done'?'（已匯入）':set.result==='conflict'?'（舊值或來源不符，略過）':'');
    const c=crmCheck(box.body,label,false);c.disabled=set.result!=='ready';choices.push({h,set,c});c.addEventListener('change',refreshSelection);
    for(const change of set.changes){
     if(change.before.value===change.after.value&&change.before.rows===change.after.rows)continue;
     const family=records.find(r=>r.id===h.id)?.f;
     const [sp,section,key]=change.path.split('/');
     const pet=family?.groups[sp]?.pets.find(x=>section==='pet:'+x.id);
     const label=pet?(pet.name+'・毛寶介紹'):[sp==='cat'?'喵寶':sp==='dog'?'犬寶':'家庭',titles[section]||section,fields[section]?.find(x=>x[0]===key)?.[1]||key].join('・');
     const p=crmEl('p',label+'\n原有　'+(change.before.value||'空白')+'\n改為　'+(change.after.value||'空白')+(change.before.rows!==change.after.rows?'\n修正後的提醒：'+(change.after.rows?JSON.parse(change.after.rows).map(r=>(r.closed?'已結束':r.temp?'限本期':'長期')+(r.flag?'・列入小卡':'')+' '+r.text).join('\n'):'依欄位預設'):''));p.style.whiteSpace='pre-wrap';box.body.append(p);
    }
   }
   body.append(box.e);
  }
  const cancel=dlg.querySelector(':scope > button:last-child');
  dlg.addEventListener('cancel',e=>{if(apply.disabled)e.preventDefault();});
  const apply=button('套用勾選的照護修正',async()=>{
   if(!ready())return toast('請先連接 Google Drive，再套用修正。');
   apply.disabled=true;cancel.disabled=true;
   try{
    if(!ready()||draining||syncBusy||connecting||photoBusy)throw Error('請連接 Drive 並等目前同步完成，再套用。');
    await localChain;let saved=0,skipped=0;
    for(const h of plan){
     const ids=new Set(choices.filter(x=>x.h===h&&x.c.checked).map(x=>x.set.id));
     if(!ids.size)continue;
     const r=records.find(x=>x.id===h.id);
     if(!r?.remote||r.rev!==r.syncedRev||pending.get(h.id)||failures.has(h.id)){skipped+=ids.size;continue;}
     const {copy,count}=applyCarePatch({...packet,families:packet.families.filter(x=>x.id===h.id)},r.f,ids);
     skipped+=ids.size-count;if(!count)continue;
     copy.updatedAt=new Date().toISOString();const next={...r,f:copy,rev:r.rev+1};
     if(!await db.replaceUnchanged(r,next)){skipped+=count;continue;}
     Object.assign(r,next);saved+=count;
    }
    dlg.close();undo=[];pdf=null;render();toast('已存本機 '+saved+' 組，略過 '+skipped+' 組。請核對同步狀態。');
   }catch{toast('本次未全部套用。已保存的組別會在下次預覽標為已匯入。');}finally{apply.disabled=false;cancel.disabled=false;}
  },'primary');
  refreshSelection();body.append(apply);await new Promise(resolve=>{dlg.addEventListener('close',resolve,{once:true});dlg.showModal();});
 }catch{toast('無法預覽修正檔，請確認格式及家庭來源。');}finally{importingLegacy=false;$('carePatchFile').value='';schedule();status();}
}


async function importLineBookings(file){
 if(importingLegacy||syncBusy||draining||photoBusy||connecting||brandSyncActive)return toast('請先完成現有同步');
 importingLegacy=true;status();
 try{
  if(file.size>5*1024*1024)throw Error('預約匯入檔過大');
  const packet=JSON.parse(await file.text());await localChain;
  const manual={},body=crmEl('div'),dlg=crmDialog('LINE 預約增量匯入',body);
  const plan=inspectLineReservations(packet,records.map(r=>r.f),manual);
  const summary=crmEl('strong'),items=crmEl('div','','sync-list'),feedback=crmEl('p','','muted');
  body.append(crmEl('p','已確認日期先保留。資料完整且沒有本次預約的單一週期會直接建立預約；其他週期保留在家庭的LINE預約區。既有預約與報價不覆蓋，未確認分鐘／時間不自行填入。','muted'),summary,items,feedback);
  const available=records.filter(x=>!x.f.archived&&x.f.clientRisk?.status!=='blacklist').sort((a,b)=>a.f.name.localeCompare(b.f.name,'zh-Hant-TW'));
  const rows=new Map();
  for(const p of plan){
   const box=section(p.r.familyName+'｜'+p.r.days[0].date+(p.r.days.length>1?'～'+p.r.days.at(-1).date:''),false);
   const state=crmEl('p','','muted');box.body.append(state);
   if(p.result==='unmatched'){
    const select=profileSelect(box.body,'對應既有家庭（可略過）',[['','尚未對應'],...available.map(x=>[x.id,x.f.name||'未命名家庭'])],'');
    select.onchange=()=>{if(select.value)manual[p.r.id]=select.value;else delete manual[p.r.id];refresh();};
   }
   const detail=crmEl('p',reservationLines(p.r).join('\n'));detail.style.whiteSpace='pre-wrap';box.body.append(detail,crmEl('p',p.r.notes,'muted'));
   rows.set(p.r.id,{box,state});items.append(box.e);
  }
  const cancel=dlg.querySelector(':scope > button:last-child');let busy=false;
  const safe=()=>ready()&&!draining&&!syncBusy&&!connecting&&!photoBusy&&!brandSyncActive;
  const refresh=()=>{
   const latest=inspectLineReservations(packet,records.map(r=>r.f),manual);
   let count=0;for(const p of latest){const row=rows.get(p.r.id);const status=p.result==='ready'?'可匯入：'+p.f.name:p.result==='done'?'已匯入，不重複':p.result==='conflict'?p.reason:'未對應家庭，略過';row.state.textContent=status;if(p.result==='ready')count++;}
   summary.textContent='可匯入 '+count+'／'+latest.length+' 個週期';apply.disabled=busy||!count;apply.textContent='一鍵匯入 '+count+' 個已確認週期';
   return latest;
  };
  const apply=button('一鍵匯入',async()=>{
   if(busy)return;if(!safe())return toast('請先連接 Drive 並完成同步。');
   busy=true;apply.disabled=true;cancel.disabled=true;
   try{
    await localChain;if(!safe())throw Error('同步狀態已變動');
    const latest=inspectLineReservations(packet,records.map(r=>r.f),manual),byFamily=new Map();
    for(const p of latest.filter(p=>p.result==='ready')){const rs=byFamily.get(p.f.id)||[];rs.push(p.r);byFamily.set(p.f.id,rs);}
    let count=0,adopted=0,skipped=0;
    for(const [id,rs] of byFamily){const r=records.find(x=>x.id===id);
     if(!r?.remote||r.rev!==r.syncedRev||pending.get(id)||failures.has(id)){skipped+=rs.length;continue;}
     const {next,adopted:n}=applyLineReservations(r.f,rs);next.updatedAt=new Date().toISOString();const replacement={...r,f:next,rev:r.rev+1};
     if(!await db.replaceUnchanged(r,replacement)){skipped+=rs.length;continue;}
     Object.assign(r,replacement);count+=rs.length;adopted+=n;
    }
    dlg.close();undo=[];pdf=null;render();toast('已存 '+count+' 個週期（直接建立 '+adopted+'、保留 '+(count-adopted)+'），略過 '+(latest.length-count)+'。請核對同步狀態。');
   }catch(e){feedback.textContent='匯入未完整完成：'+e.message+'；已保存的週期下次不重複。';}
   finally{busy=false;cancel.disabled=false;refresh();}
  },'primary');
  dlg.addEventListener('cancel',e=>{if(busy)e.preventDefault();});body.append(apply);refresh();
  await new Promise(resolve=>{dlg.addEventListener('close',resolve,{once:true});dlg.showModal();});
 }catch(e){toast('無法匯入LINE預約：'+e.message);}
 finally{importingLegacy=false;$('lineBookingFile').value='';schedule();status();}
}
function canUseLineReservation(f){return !bookingSegments(f.booking).length&&!f.booking.dates&&!f.booking.times;}
function lineReservationPanel(f){
 const box=crmEl('div','','panel'),all=readLineReservations(f);
 if(!all.length)return null;
 box.append(heading('已確認的 LINE 預約'),crmEl('p','預約週期各自保存。待補欄位只在確認後加入本次正式預約；既有報價不自動覆蓋。','muted'));
 for(const r of all){const sectionBox=section(r.days[0].date+(r.days.length>1?'～'+r.days.at(-1).date:'')+'｜'+(r.state==='adopted'?'已採用':'已確認・待採用'),r.state==='confirmed');
 const detail=crmEl('p',reservationLines(r).join('\n'));detail.style.whiteSpace='pre-wrap';sectionBox.body.append(detail,crmEl('p',r.notes,'muted'));
 if(r.quotedTotal!==null)sectionBox.body.append(crmEl('p','LINE 記載金額 '+money(r.quotedTotal)+'（未自動成為正式報價）','muted'));
 if(r.state==='confirmed')sectionBox.body.append(button('編輯預約・保存目前資料',()=>editLineReservation(f,r),'primary'));
 box.append(sectionBox.e);}
 return box;
}
function editLineReservation(f,r){
 if(entry?.f!==f)return toast('家庭已切換');
 bookingEditor(f.booking,f.groups,{f,r});
}

function wireMenu(){
 $('clearCareFlags').onclick=()=>cleanupCareData('flags');$('relocateHospital').onclick=()=>cleanupCareData('hospital');$('tidySupplies').onclick=()=>cleanupCareData('supplies');$('dedupeSupplies').onclick=()=>cleanupCareData('dedupe');
 $('lineBookingImport').onclick=()=>$('lineBookingFile').click();$('lineBookingFile').onchange=e=>{if(e.target.files[0])importLineBookings(e.target.files[0]);};
 $('carePatchImport').onclick=()=>$('carePatchFile').click();$('carePatchFile').onchange=e=>{if(e.target.files[0])importCareFields(e.target.files[0]);};
 const menu=$('appMenu');
 $('menuOpen').onclick=()=>{if(!menu.open)menu.showModal();};
 $('menuClose').onclick=()=>menu.close();
 // Close the navigation dialog before existing action handlers open their own dialogs/file pickers.
 menu.addEventListener('click',e=>{if(e.target.closest('.menu-items button')&&menu.open)menu.close();},true);
 $('menuDirectory').onclick=()=>returnDirectory({archive:false});
 $('menuQuote').onclick=()=>quickInquiry();
}

wireStaticCloseHeaders();wireMenu();wireFamilyPages();$('familyPrev').onclick=()=>turnFamilyPage(-1);$('familyNext').onclick=()=>turnFamilyPage(1);$('syncIndicator').onclick=openSyncDetail;$('quickQuote').onclick=()=>quickInquiry();$('new').onclick=()=>profileDialog(null);$('filterFamilies').onclick=filterDialog;$('clearFamilyFilters').onclick=()=>{familyFilters={};list();};$('upcomingFamilies').onclick=()=>{const current=familyFilters.booking;const only=Array.isArray(current)?current.length===1&&current[0]==='upcoming':current==='upcoming';if(only)delete familyFilters.booking;else familyFilters.booking=['upcoming'];list();};$('profileImport').onclick=()=>$('profileFile').click();$('profileFile').onchange=e=>{if(e.target.files[0])importProfiles(e.target.files[0]);};$('demo').onclick=()=>newRecord(true);$('familySort').onchange=()=>{familySort=$('familySort').value;list();};wireFamilySearch();$('families').onclick=e=>{settleFamilyPage();const menu=e.target.closest('[data-risk-menu]');if(menu){e.stopPropagation();riskMenu(records.find(r=>r.id===menu.dataset.riskMenu));return;}const b=e.target.closest('[data-id]');if(b){if(photoBusy){toast('請等待照片保存完成');return;}if(!archiveView&&$('search').value.trim())saveRecentSearch(b.dataset.id);openRecord(b.dataset.id);}};$('cloud').onclick=()=>{$('clientId').value=window.LILI_CONFIG?.googleClientId||localStorage.getItem('liliOAuthClientId')||'';$('setup').showModal();};$('closeSetup').onclick=()=>$('setup').close();$('connectSetup').onclick=()=>connect();$('lineHistoryImport').onclick=()=>$('lineHistoryFile').click();$('lineHistoryFile').onchange=e=>{if(e.target.files[0])importLineHistory(e.target.files[0]);};$('legacyImport').onclick=()=>$('legacyImportFile').click();$('legacyImportFile').onchange=e=>{if(e.target.files[0])importLegacy(e.target.files[0]);};$('restore').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);};$('photoFiles').onchange=e=>addPhotos([...e.target.files]);$('closePhoto').onclick=()=>$('lightbox').close();$('lightbox').onclose=()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('fullPhoto').removeAttribute('src');};window.addEventListener('online',()=>{if(ready())schedule();else resumeConnection();status();});window.addEventListener('offline',status);window.addEventListener('beforeunload',e=>{if(localFailure||photoBusy||[...pending.values()].some(Boolean)){e.preventDefault();e.returnValue='';}});list();const last=await db.get('settings','lastFamily');if(last&&records.some(r=>r.id===last&&!r.f.archived))await openRecord(last);

$('archive').onclick=()=>returnDirectory({archive:!archiveView});
$('brandEdit').onclick=()=>{for(const key of Object.keys(brandDefaults))$(key).value=brand[key];$('brandStatus').textContent=brandState.error|| (brandState.dirty?'已存本機，等待雲端同步':brandState.remote?'已同步至 Drive':'此裝置的設定');$('brandDialog').showModal();};
$('brandClose').onclick=()=>$('brandDialog').close();
async function syncBrand(pull=false){
 brandSyncActive=true;status();try{
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
 brandSyncActive=false;$('brandEdit').title=brandState.error||'全家庭共用設定';status();
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
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{reg.update().catch(()=>{});document.addEventListener('visibilitychange',()=>{if(!document.hidden){reg.update().catch(()=>{});if(ready())schedule();else resumeConnection();}else if(ready()&&!draining){clearTimeout(syncTimer);void drain();}});return resumeConnection();}).catch(()=>{});
}
setInterval(status,15000);status();

function bookingEditor(b,groups,imported=null){
 const outer=document.createElement('div');const root=document.createElement('div');root.className='booking-editor';let selected=new Set(),edit=[];let month=new Date();month.setDate(1);const mixed=Boolean(groups.cat&&groups.dog);
 const services=mixed?[mixedPlan]:groups.dog?['生活照顧','照顧＋散步']:['生活照顧','陪伴專案'];
 const standardMinutes=s=>String(rate(groups.cat?.pets.length||0,groups.dog?.pets.length||0,s,currentRates())?.min??'');const blank=()=>({service:imported?'':services[0],minutes:imported?'':standardMinutes(services[0])||'30',start:'',end:'',note:'',period:''});
 let visits=[blank()];
 const owner=entry,revision=entry?.rev,draft=imported?structuredClone(imported.r):null;
 let importGroups=[],importIndex=0;
 if(draft){const map=new Map();for(const d of draft.days){const key=JSON.stringify(d.visits);if(!map.has(key))map.set(key,{dates:[],visits:d.visits?d.visits.map(v=>({...v,minutes:v.minutes===null?'':String(v.minutes)})):[]});map.get(key).dates.push(d.date);}importGroups=[...map.values()];
  // Suggest a duration on first import only. A saved blank is an explicit pending decision.
  if(!draft.originalDays){
   for(const group of importGroups)for(const visit of group.visits){
    if(visit.service&&!visit.minutes)visit.minutes=standardMinutes(visit.service);
   }
  }
 }
 const stash=()=>{if(draft){importGroups[importIndex]={dates:[...selected].sort(),visits:structuredClone(visits)};}};
 const loadGroup=i=>{importIndex=i;const g=importGroups[i];selected=new Set(g.dates);visits=structuredClone(g.visits);const a=g.dates[0];if(a)month=new Date(Number(a.slice(0,4)),Number(a.slice(5,7))-1,1);};
 if(draft)loadGroup(0);
 const el=(tag,t,cl)=>{const n=document.createElement(tag);if(t)n.textContent=t;if(cl)n.className=cl;return n;};
 const line=()=>el('div','','row');
 const save=rs=>{snapshot();b.segments=rs.map(r=>JSON.stringify(r));if(rs.length){b.services=[...new Set(rs.flatMap(r=>r.visits.map(v=>v.service)))];}else if(!b.dates&&!b.times)b.services=[];bindPendingNotes(entry.f);dirty();if(modal.open)modal.close();render();};
 const wheel=(v,key)=>{const w=el('div','','booking-wheel');const val=v[key]||'';let h=val?Number(val.slice(0,2)):null,m=val?Number(val.slice(3)):null;const sync=()=>{v[key]=h===null||m===null?'':String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');};for(const [values,get,set,label] of [[Array.from({length:24},(_,i)=>i),()=>h,x=>{h=x;sync();},'小時'],[[0,15,30,45],()=>m,x=>{m=x;sync();},'分鐘']]){const sc=el('div','','booking-scroll');sc.setAttribute('aria-label',label);const choices=[null,...[...new Set([...values,...(get()===null?[]:[get()])])].sort((a,b)=>a-b)];for(const x of choices){const item=el('button',x===null?'—':String(x).padStart(2,'0'));item.type='button';item.onclick=()=>{sc.scrollTop=choices.indexOf(x)*32;set(x);};sc.append(item);}w.append(sc);let timer;sc.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{set(choices[Math.max(0,Math.min(choices.length-1,Math.round(sc.scrollTop/32)))]);},100);});requestAnimationFrame(()=>{sc.scrollTop=Math.max(0,choices.indexOf(get()))*32;});}return w;};
 const modal=crmDialog(draft?'編輯 LINE 預約':'新增／編輯預約',root);function draw(){const top=modal.scrollTop,left=modal.scrollLeft;root.replaceChildren();if(draft){root.append(el('p','已帶入日期與已知趟次。選方案會帶入現行標準分鐘；未確認的可留空保存，不會自行編造時間或趟次。','muted'));const options=line();importGroups.forEach((g,i)=>options.append(button((i+1)+'｜'+(g.dates[0]||'未選日期')+(g.dates.length>1?' 等 '+g.dates.length+' 天':''),()=>{stash();loadGroup(i);draw();},i===importIndex?'active':'')));root.append(options);const fill=line();for(const s of services)fill.append(button('未填方案套用 '+serviceName(s,groups),()=>{stash();for(const g of importGroups)for(const v of g.visits){if(!v.service)v.service=s;if(!v.minutes)v.minutes=standardMinutes(v.service);}loadGroup(importIndex);draw();}));root.append(fill);}const nav=line();nav.append(button('‹',()=>{month.setMonth(month.getMonth()-1);draw();}),el('strong',month.getFullYear()+' 年 '+(month.getMonth()+1)+' 月'),button('›',()=>{month.setMonth(month.getMonth()+1);draw();}));root.append(nav);const cal=el('div','','booking-calendar');for(const d of ['日','一','二','三','四','五','六'])cal.append(el('small',d));for(let i=0;i<month.getDay();i++)cal.append(el('span'));for(let d=1;d<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();d++){const iso=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');const occupied=bookingSegments(b).some((r,i)=>!edit.includes(i)&&r.a<=iso&&r.b>=iso)||!!draft&&importGroups.some((g,i)=>i!==importIndex&&g.dates.includes(iso));const chosen=selected.has(iso);const cell=button(String(d),()=>{if(selected.has(iso))selected.delete(iso);else selected.add(iso);draw();},chosen?'active booking-selected':occupied?'booking-occupied':'');cell.disabled=occupied&&!chosen;cell.setAttribute('aria-pressed',String(chosen));cell.setAttribute('aria-label',iso+(occupied?'，已有其他預約':chosen?'，已選取':''));cal.append(cell);}root.append(cal,el('p','逐日點選，可跨月複選；再點一次取消。灰色日期已安排其他方案。','muted'));if(selected.size){root.append(el('p','已選 '+selected.size+' 天｜'+bookingDateLabel([...selected]),'booking-selection'),button('清除選取日期',()=>{selected.clear();draw();}));}else root.append(el('p','尚未選擇日期','muted'));root.append(el('strong','每日出勤次數'));const counts=line();for(let n=1;n<=4;n++)counts.append(button(n+' 次',()=>{while(visits.length<n)visits.push(blank());visits=visits.slice(0,n);draw();},visits.length===n?'active':''));if(draft)counts.append(button('趟次待確認',()=>{visits=[];draw();},!visits.length?'active':''));root.append(counts);
 visits.forEach((v,i)=>{const card=el('div','','booking-visit');const top=line();top.append(el('strong','第 '+(i+1)+' 趟'));if(i)top.append(button('同第一趟方案',()=>{v.service=visits[0].service;v.minutes=visits[0].minutes;draw();}));card.append(top);const preferred=profileSelect(card,'偏好時段（選填）',reservationPeriods.map(x=>[x,x||'未指定／由保姆安排']),v.period||'');preferred.onchange=()=>v.period=preferred.value;card.append(el('small','預計抵達區間（選填）'));const times=line();for(const [key,label] of [['start','開始'],['end','結束']]){const part=el('div','','booking-time');part.append(el('small',label),wheel(v,key));times.append(part);}card.append(times);card.append(button('不指定抵達時間',()=>{v.start='';v.end='';draw();}));const note=el('input');note.placeholder='補充說明（選填）';note.value=v.note;note.oninput=()=>v.note=note.value;card.append(note,el('small','服務方案'));const options=line();for(const s of services)options.append(button(serviceName(s,groups),()=>{if(v.service!==s||!v.minutes){v.service=s;const standard=standardMinutes(s);if(standard)v.minutes=standard;}draw();},v.service===s||mixed&&mixedService(v.service)?'active':''));if(draft)options.append(button('方案待確認',()=>{v.service='';v.minutes='';draw();},!v.service?'active':''));if(mixed)options.append(el('small',mixedCare));card.append(options,el('small','服務時間'));const mins=line();for(const m of ['30','40','45','50','60','70','75','80','90','120','180'])mins.append(button(m+' 分',()=>{v.minutes=m;draw();},v.minutes===m?'active':''));card.append(mins);const custom=crmInput(card,'自訂服務分鐘（選填）',v.minutes);custom.min='1';custom.max='720';custom.oninput=()=>v.minutes=custom.value;root.append(card);});

 root.append(button(draft?'保存目前資料（可未填完）':edit.length?'儲存選取日期的修改':'＋ 新增選取日期的預約',()=>{
  if(draft){stash();if(entry!==owner||owner.f!==imported.f||owner.rev!==revision)return toast('家庭資料已變動，請重新開啟');if(importGroups.some(g=>!g.dates.length))return toast('每組須保留至少一天');const dates=new Set();const days=[];for(const g of importGroups)for(const date of g.dates){if(dates.has(date))return toast('不同組日期重疊，請調整');dates.add(date);days.push({date,visits:g.visits.length?g.visits.map(v=>({...v,minutes:v.minutes===''?null:Number(v.minutes)})):null});}draft.days=days.sort((a,b)=>a.date.localeCompare(b.date));if(!validReservation(draft))return toast('分鐘或抵達區間格式有誤；未約定時間可按不指定抵達時間。');const stored=owner.f.lineReservations.find(x=>x.id===draft.id);if(!stored||stored.state!=='confirmed')return toast('預約已變動，請重新開啟');const segments=reservationSegments(draft,groups);snapshot();stored.originalDays??=structuredClone(stored.days);stored.days=structuredClone(draft.days);let adopted=false;if(segments&&canUseLineReservation(owner.f)&&!owner.f.booking.quote){b.segments=segments.map(x=>JSON.stringify(x));b.services=[...new Set(segments.flatMap(x=>x.visits.map(v=>v.service)))];stored.state='adopted';bindPendingNotes(owner.f);adopted=true;}dirty();modal.close();render();toast(adopted?'已建立本次預約':'已保存目前資料，未確認項目可之後補充');return;}
  if(!selected.size)return toast('請至少選擇一天');
  if(visits.some(v=>!/^\d+$/.test(v.minutes)||Number(v.minutes)<1||Number(v.minutes)>720))return toast('服務分鐘須為 1～720 的整數');
  if(visits.some(v=>!!v.start!==!!v.end||v.start&&v.end<=v.start))return toast('請確認每趟抵達時段的開始及結束時間');
  try{const rs=replaceBookingDates(bookingSegments(b),edit,[...selected],visits);edit=[];selected.clear();visits=[blank()];save(rs);}catch(e){toast(e.message);}
 },'active'));
 if(edit.length)root.append(button('取消修改',()=>{edit=[];selected.clear();visits=[blank()];modal.close();}));
 if(modal.open){modal.scrollTop=top;modal.scrollLeft=left;}
 }
 function summary(){
  outer.replaceChildren(button('＋ 新增預約',()=>{edit=[];selected.clear();visits=[blank()];draw();modal.showModal();},'primary'));
  const rs=bookingSegments(b);if(!rs.length)return;outer.append(heading('已建立的預約'));
  try{
   for(const g of bookingDateGroups(rs)){
    const card=el('div','','booking-visit');card.append(el('strong',bookingDateLabel(g.dates)),el('small',g.dates.length+' 天｜每日 '+g.visits.length+' 趟，共 '+g.dates.length*g.visits.length+' 趟'));
    const details=bookingLines({segments:[JSON.stringify({a:g.dates[0],b:g.dates[0],visits:g.visits})]},groups).slice(1,-1);
    for(const t of details)card.append(el('div',t));
    const actions=line();actions.append(button('編輯這組日期',()=>{edit=[...g.indices];selected=new Set(g.dates);visits=structuredClone(g.visits);const a=g.dates[0];month=new Date(Number(a.slice(0,4)),Number(a.slice(5,7))-1,1);draw();modal.showModal();}),button('移除這組日期',async()=>{if(await confirmAction('移除這組預約日期？','只移除這組 '+g.dates.length+' 天，其他方案不變。')){edit=[];selected.clear();visits=[blank()];save(rs.filter((_,j)=>!g.indices.includes(j)));}}));card.append(actions);outer.append(card);
   }
  }catch(e){outer.append(el('p','既有日期資料異常：'+e.message+'。請保留原始資料，不自動修改。','issue'));}
  outer.append(el('strong',bookingLines(b,groups).at(-1)));
 }
 if(draft){draw();modal.showModal();}else summary();return outer;
}

function labelText(e,t){const m=String(t).match(/^(.*?)([（(][^（）()]+[）)])$/s);if(m&&m[1].trim())e.append(document.createTextNode(m[1]),crmEl('small',m[2],'label-qualifier'));else e.append(document.createTextNode(t));return e;}
function crmEl(tag,t='',cl=''){const e=document.createElement(tag);e.textContent=t;e.className=cl;return e;}
function dialogCloseHeader(d,title,cancel){
 const header=crmEl('div','','dialog-close-header');
 const x=button('×',()=>{if(d.open&&!cancel.disabled)cancel.click();},'dialog-close-x');
 x.setAttribute('aria-label','關閉視窗');x.title='關閉視窗';header.append(title,x);return header;
}
function wireStaticCloseHeaders(){
 for(const [id,cancelId] of [['confirm','cancelConfirm'],['brandDialog','brandClose'],['setup','closeSetup']]){
  const d=$(id),title=d.querySelector(':scope > h2');if(!title)continue;
  const header=dialogCloseHeader(d,title,$(cancelId));d.prepend(header);
 }
}
function crmDialog(title,body){const d=crmEl('dialog','','crm-modal'),cancel=button('關閉／取消',()=>d.close());d.append(dialogCloseHeader(d,heading(title),cancel),body,cancel);d.addEventListener('close',()=>{if(!d.open)d.remove();});const show=d.showModal.bind(d);d.showModal=()=>{if(!d.isConnected)document.body.append(d);show();};return keepDialogPosition(d);}
function crmInput(parent,label,value='',type='number',step='1'){const l=labelText(crmEl('label'),label);const i=crmEl('input');i.type=type;if(type==='number')i.step=step;i.value=value;l.append(i);parent.append(l);return i;}
function crmCheck(parent,label,value){const l=crmEl('label');const i=crmEl('input');i.type='checkbox';i.checked=value;l.append(i,document.createTextNode(label));parent.append(l);return i;}

function quickInquiry(f=null){
 const body=crmEl('div','','quick-inquiry'),dlg=crmDialog('快速詢價・LINE 回覆',body);
 body.append(crmEl('p',f?(f.name||'未命名家庭')+'｜依現行費率試算，不改動家庭、舊預約或正式報價。':'不用建立家庭、預約或連接 Drive；只試算，不保存客戶資料。','muted'));
 const form=crmEl('div','','crm-fields');body.append(form);
 const count=(label)=>{const block=crmEl('div','','quick-count'),head=crmEl('label',label),row=crmEl('div','','quick-stepper'),i=crmEl('input');i.type='number';i.min='0';i.step='1';i.value='0';i.setAttribute('aria-label',label);
 const change=n=>{i.value=String(Math.max(0,(Number.isSafeInteger(Number(i.value))?Number(i.value):0)+n));draw();};row.append(button('−',()=>change(-1)),i,button('＋',()=>change(1)));block.append(head,row);form.append(block);return i;};
 const cats=count('喵寶數量'),dogs=count('犬寶數量');if(f){cats.value=f.groups.cat?.pets.length||0;dogs.value=f.groups.dog?.pets.length||0;}
 const choose=(parent,label,options,initial)=>{const l=labelText(crmEl('label'),label),s=crmEl('select');s.setAttribute('aria-label',label);for(const [v,t] of options){const o=crmEl('option',t);o.value=v;s.append(o);}s.value=initial;l.append(s);parent.append(l);return s;};
 const med=choose(form,'是否需要餵藥／特殊醫囑',[['unknown','尚未確認'],['no','沒有'],['yes','有，需確認細節']],'unknown');
 const walk=choose(form,'犬寶散步需求',[['unknown','尚未確認'],['no','不需要'],['yes','一般散步'],['long','較長時間散步']],'unknown');
 const km=crmInput(form,'單程機車導航公里（選填）',f?(readProfile(f.profile).km||savedQuote(f)?.km||''):'','number','0.1');km.min='0';km.placeholder='未知可留空';
 const trips=crmInput(form,'預估總趟數（選填）','');trips.min='1';trips.placeholder='未知可留空';form.append(button('更新試算',()=>{draw();},'primary'));
 body.append(crmEl('p','車程費用可等地址確認後再算；餵藥不自動加價，需依照護內容評估。','muted'));
 const cards=crmEl('div','','quick-options');body.append(cards);
 let legacyMinutes=null,legacyService=null,legacyOut=null;
 if(f){
  const prev=bookingSegments(f.booking),source=oldBookingText(f);
  const old=crmEl('details','','quote-advanced');old.append(crmEl('summary','舊規格／自訂時間比較'));body.append(old);
  const oldText=[...prev.map(s=>s.a+'～'+s.b+'｜'+s.visits.map(v=>v.minutes+' 分鐘 '+serviceName(v.service,f.groups)).join('、')),source].filter(Boolean).join('\n');
  if(oldText)old.append(crmEl('p','歷史／既有預約參考（不會直接成為本期預約）：\n'+oldText,'legacy-original'));
  else old.append(crmEl('p','尚無可辨識的舊預約規格，可自行輸入原服務時間。','muted'));
  const rows=prev.flatMap(s=>s.visits);
  const unique=[...new Set(rows.map(v=>v.service+'|'+v.minutes))];
  const rawM=[...new Set(Array.from(source.matchAll(/(\d{1,3})\s*分鐘/g),m=>m[1]))];
  const initial=unique.length===1?unique[0].split('|')[1]:!unique.length&&rawM.length===1?rawM[0]:'';
  legacyMinutes=crmInput(old,'原服務／希望服務分鐘',initial);legacyMinutes.min='1';legacyMinutes.max='720';
  legacyService=choose(old,'原方案類型',[['','不確定，依時間比較'],['生活照顧','生活照顧方案'],['陪伴專案','陪伴專案'],['照顧＋散步','照顧＋散步'],[mixedPlan,mixedPlan]],unique.length===1?unique[0].split('|')[0]:'');
  legacyOut=crmEl('div','','crm-result');old.append(legacyOut);
  old.append(crmEl('p','比例試算是內部參考，不是正式費率；不得自動縮短最低服務時間，仍需自行判斷及確認承接。','muted'));
 }

 const preview=crmEl('textarea');preview.rows=8;preview.readOnly=true;preview.setAttribute('aria-label','LINE 報價回覆文字');
 const copy=button('複製 LINE 報價回覆',async()=>{if(!preview.value)return;try{await navigator.clipboard.writeText(preview.value);toast('已複製，可直接貼到 LINE。');}catch{preview.focus({preventScroll:true});preview.select();try{if(document.execCommand('copy')){toast('已複製，可直接貼到 LINE。');return;}}catch{}toast('已選取文字，請使用手機的複製功能。');}},'primary');
 const output=crmEl('div','','quick-output');output.append(heading('可直接貼到 LINE 的回覆'),preview,copy);body.append(output);
 function draw(){
  walk.parentElement.hidden=!(Number(dogs.value)>0);
  const q=inquiryQuote({c:cats.value===''?NaN:cats.value,d:dogs.value===''?NaN:dogs.value,med:med.value,walk:walk.value,km:km.value,trips:trips.value},currentRates());
  cards.replaceChildren();
  if(q.error){cards.append(crmEl('p',q.error,'issue'));if(legacyOut)legacyOut.textContent=q.error;preview.value='';output.hidden=true;copy.disabled=true;return;}
  for(const o of q.options){
   const card=crmEl('div','','booking-visit');card.append(crmEl('strong',(o.recommended?'推薦｜':o.reference?'參考｜':'')+o.title),crmEl('strong',o.min+' 分鐘 · '+money(o.unit??o.fee)+'／趟','quick-price'),crmEl('p',o.detail));
   if(o.unit!==null)card.append(crmEl('small','已含車程費用'),...(o.total!==null?[crmEl('strong',trips.value+' 趟預估總額 '+money(o.total),'quick-total')]:[]));else {card.append(crmEl('small','內部基礎費率；尚未計入車程費用，不直接對外報價'));const n=Number(trips.value);if(!o.reference&&Number.isSafeInteger(n)&&n>0&&n<=10000)card.append(crmEl('strong',n+' 趟照護費小計 '+money(o.fee*n)),crmEl('small','未含車程費用，僅內部參考'));}
   cards.append(card);
  }
  if(q.travelKnown)cards.append(crmEl('p','每趟車程費用 '+money(q.travel),'muted'));
  for(const msg of q.warnings)cards.append(crmEl('p',msg,'issue'));
  cards.append(crmEl('p','一般檔期參考；特殊檔期及正式預約仍須另行確認。','muted'));
  if(legacyOut){const a=legacyQuoteReference(Number(cats.value),Number(dogs.value),legacyService.value,legacyMinutes.value,currentRates());if(a){const total=q.travelKnown?a.estimate+q.travel:null;legacyOut.textContent=['時間最接近的現行方案：'+a.nearest.title+'｜'+a.nearest.min+' 分鐘／'+money(a.nearest.fee+(q.travelKnown?q.travel:0))+(q.travelKnown?'（含車程費用）':'（照護費參考）'),'依原規格試算：以 '+a.basis.title+' '+a.basis.min+' 分鐘的費率為基準',legacyMinutes.value+' 分鐘 ÷ 60 × '+money(a.hourly)+'／小時（時薪顯示四捨五入）','比例試算照護費 '+money(a.estimate)+(total!==null?'；含車程費用 '+money(total)+'／趟':''),'非正式報價，須由保姆確認最低服務時間、照護內容與承接意願。'].join('\n');}else legacyOut.textContent=legacyMinutes.value?'此規格需個別評估，無可用的標準比例參考。':'輸入分鐘數，即可比較最接近的現行方案。';}preview.value=q.message;output.hidden=false;copy.disabled=false;
 }
 body.addEventListener('input',draw);body.addEventListener('change',draw);draw();dlg.showModal();
}

function currentRates(){try{return readRates(brand.rates);}catch{return structuredClone(defaultRates);}}
function quotePanel(f){const root=crmEl('div','','panel');const q=savedQuote(f),t=day(),today=t.year+'-'+t.month+'-'+t.day,rs=bookingSegments(f.booking),current=hasCurrentBooking(rs,today);root.append(heading('本次照護報價'),crmEl('p',q?(q.key!==quoteKey(f)?'預約或毛寶數量已變更，請重新確認報價':money(q.total)+'｜已確認報價'):'尚未確認報價'),button('依現行費率快速試算',()=>quickInquiry(f),'primary'),...(current?[button('本期預約正式報價',()=>quoteDialog(f))]:[crmEl('p',rs.length?'目前只有過去預約；可直接快速試算，不覆蓋歷史。':'尚未建立本期預約，仍可快速試算。','muted')]),button('加時照護費用'+(f.booking.overtime?'｜每15分 '+money(Number(f.booking.overtimeFee)):'｜未啟用'),()=>overtimeDialog(f)),button('歷史報價紀錄',()=>historyDialog(f)));return root;}

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
 const km=crmInput(form,'單程機車導航公里',old?.km??readProfile(f.profile).km,'number','0.1');km.min='0';km.placeholder='例如 5.3';
 const travelText=crmEl('p','','muted');body.append(travelText);if(!rs.length){body.append(crmEl('p','尚未建立本期預約。請先新增日期、服務方案、時間及趟數。','issue'),button('返回編輯預約',()=>{dlg.close();view='edit';render();}));}
 if(c&&d)body.append(crmEl('p',mixedCare));
 const rows=[];
 for(const x of items.values()){
  const std=rate(c,d,x.service,r),box=crmEl('div','','booking-visit');
  const label=x.min+' 分鐘'+serviceName(x.service,f.groups);
  if(c&&d&&x.service===mixedPlan&&special[x.k]===undefined){const fees=Object.entries(special).filter(([k])=>k.split('|')[1]===String(x.min)&&mixedService(k.split('|')[0])).map(([,v])=>v);if(fees.length&&new Set(fees.map(Number)).size===1)special[x.k]=fees[0];}
  box.append(crmEl('strong',label+' × '+x.n+' 趟'));
  const priceText=crmEl('p');box.append(priceText);
  const override=crmInput(box,'單趟照護費（不含車程費用）','');override.min='0';
  const sub=crmEl('p','','muted'),fix=button('改為自行設定本次價格',()=>{applyMode('manual');override.focus({preventScroll:true});});box.append(sub,fix);body.append(box);
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
 const travelOverride=crmInput(af,'自訂每趟車程費用（選填）',same?old.travel??'':'');travelOverride.min='0';travelOverride.placeholder='留空依公里自動計算';
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
  travelText.textContent=validTravel?'每趟車程費用：'+money(tv)+(travelOverride.value.trim()?'（自訂）':'（自動計算）'):'請輸入單程公里；30.1 公里以上請在進階設定填車程費用。';
  let missing='';
  const output=[];
  for(const x of rows){
   const std=standardFee(x),sp=validFee(special[x.k]),manual=mode.value==='manual',chosen=manual?(x.override.value.trim()===''?undefined:Number(x.override.value)):mode.value==='special'&&sp?Number(special[x.k]):std;
   x.override.parentElement.hidden=!manual;
   x.fix.hidden=manual||validFee(chosen);x.priceText.textContent=manual?(x.std?'現行標準參考 '+money(x.std.fee)+'／'+x.std.min+' 分鐘':'需個別報價'):chosen===undefined?(x.std?'預約 '+x.min+' 分鐘；標準為 '+x.std.min+' 分鐘／'+money(x.std.fee)+'。請改用標準時間或自行定價。':'此家庭或方案無自動標準費率，請自行定價。'):(mode.value==='special'&&sp?'家庭專屬價 ':'標準照護費 ')+money(chosen)+'／趟';
   x.sub.textContent=validTravel&&validFee(chosen)?'含車程費用小計 '+money((chosen+tv)*x.n):'';
   if(!validFee(chosen)){missing ||= x.label;continue;}
   output.push({k:x.k,label:x.label,n:x.n,min:x.min,fee:Number(chosen),unit:Number(chosen)+tv,override:manual?x.override.value:mode.value==='special'&&sp?String(chosen):''});
  }
  if(!rs.length){fail('尚未建立本期預約，請先新增日期與趟數。');return;}if(km.value===''){fail('尚未填寫單程導航公里（同地點可填 0）。');return;}if(!validTravel){fail('請確認公里數及車程費用；30.1 公里以上須自訂車程費用。');return;}
  if(adjMode.value!=='none'&&(!Number.isSafeInteger(rawA)||rawA<0||!reason.value.trim()&&rawA)){fail('請填寫有效的調整金額及原因。');return;}
  if(missing){fail('「'+missing+'」未有可用單趟費率。請確認毛寶數量與預約分鐘，或點該項的自行設定價格。');return;}
  const holidays=useSavedHolidays?old.holidays:holidayRows(rs,r),holidayTotal=exclude.checked?0:holidays.reduce((sum,x)=>sum+x.total,0),normal=output.reduce((sum,x)=>sum+x.unit*x.n,0),total=normal+a+holidayTotal,minutes=output.reduce((sum,x)=>sum+x.min*x.n,0),trips=output.reduce((sum,x)=>sum+x.n,0);
  if(total<0||normal+a<tv*trips){fail('一般服務費不可低於車程費用。');return;}
  const rateHour=Math.round((normal+a-tv*trips)*60/minutes),actualHour=Math.round((total-tv*trips)*60/minutes);totalValue.textContent=money(total);hourValue.textContent='扣車程費用後照護時薪 '+money(rateHour)+'／小時（不含檔期）'+(holidayTotal?'；含檔期 '+money(actualHour)+'／小時':'');referenceActual.textContent='本次 '+money(rateHour)+'／小時（不含檔期）'+(holidayTotal?'；含檔期 '+money(actualHour)+'／小時':'');blocker.hidden=true;
  result.textContent=[...output.map(x=>x.label+'：'+money(x.unit)+' × '+x.n+' = '+money(x.unit*x.n)),'每趟車程費用 '+money(tv),'一般服務小計 '+money(normal),...holidays.map(h=>h.name+' '+(h.spans?.join('、')||h.a+'～'+h.b)+'｜'+h.n+' 趟 × '+money(h.fee)+' = '+money(h.total)+(exclude.checked?'（本次排除）':'')),...(a?[(a<0?'優惠折抵 −':'額外加收 +')+money(Math.abs(a))]:[]),'本次合計 '+money(total),'扣車程費用後照護時薪（不含檔期） '+money(rateHour)+'／小時',...(holidayTotal?['含檔期加價 '+money(actualHour)+'／小時']:[])].join('\n');
  calculated={key:quoteKey(f),date:new Date().toISOString(),km:k,travel:tv,travelOverride:travelOverride.value,reason:adjMode.value==='none'?'':reason.value,difficulty:select.value,adjust:a,individual:individual?.checked===true,exclude:exclude.checked,rows:output,holidays,total};confirm.disabled=false;
 }
 refreshOptions();
 if(same){mode.value='manual';for(const x of rows)x.override.value=old.rows.find(y=>y.k===x.k)?.fee??'';modeHint.textContent='已載入上次確認價格。';}
 else{mode.value=hasSpecial()?'special':'standard';for(const x of rows)x.override.value=mode.value==='special'&&validFee(special[x.k])?special[x.k]:(standardFee(x)??'');if(mode.value==='special'&&validFee(special.travel))travelOverride.value=special.travel;}
 mode.onchange=()=>applyMode(mode.value);body.addEventListener('input',e=>{if(e.target!==mode)calc();});body.addEventListener('change',e=>{if(e.target!==mode){if(e.target===individual&&individual.checked&&mode.value!=='manual')applyMode('manual');else calc();}});
 dlg.showModal();calc();
}
function overtimeDialog(f){const b=f.booking,body=crmEl('div'),dlg=crmDialog('加時照護費用',body);const enabled=crmCheck(body,'本次啟用加時照護費用',b.overtime===true);const q=savedQuote(f),x=q?.key===quoteKey(f)?q.rows[0]:null;const g=crmEl('div','','crm-fields');body.append(g);const total=crmInput(g,'單趟總費用（含車程費用）',x?.unit??''),tr=crmInput(g,'其中車程費用',x?q.travel:0),min=crmInput(g,'原服務分鐘',x?.min??60),fee=crmInput(g,'每15分鐘最終費用',b.overtimeFee||150);const info=crmEl('p');body.append(info,button('採用 NT$150',()=>{fee.value=150;}),button('採用試算（四捨五入至整元）',()=>{const n=reference();if(n!==null)fee.value=n;}),button('保存',()=>{if(enabled.checked&&(!Number.isSafeInteger(Number(fee.value))||Number(fee.value)<=0))return toast('請輸入有效加時費');snapshot();b.overtime=enabled.checked;b.overtimeFee=enabled.checked?String(Number(fee.value)):'';dirty();dlg.close();render();},'primary'));function reference(){const a=Number(total.value),t=Number(tr.value),m=Number(min.value);return total.value!==''&&a>=t&&t>=0&&m>0?Math.round((a-t)*15/m):null;}function update(){const n=reference();info.textContent=n===null?'請輸入單趟總費用、車程費用與服務分鐘。':'扣車程費用後每15分鐘參考 '+money(n);}body.addEventListener('input',update);update();dlg.showModal();}

function historyDialog(f){
 const body=crmEl('div'),dlg=crmDialog('歷史報價（內部）',body),sources=lineHistory(f);
 const all=[...(f.booking.quoteHistory||[]),...(f.booking.quote?[f.booking.quote]:[])].reverse();
 if(all.length)body.append(heading('CRM 正式報價'));
 for(const s of all){try{const q=JSON.parse(s),box=crmEl('div','','booking-visit');box.append(crmEl('strong',q.date.slice(0,10)+'｜'+money(q.total)),crmEl('p',q.rows.map(x=>displayQuoteLabel(x)+' '+money(x.unit)+' × '+x.n).join('；')));body.append(box);}catch{}}
 if(sources.length){body.append(heading('LINE 歷史報價與條件'),crmEl('p','依訊息日期排列；包含當時的詢價、週期報價、修訂及例外條件。不是收款帳本，不自動套用現行價格。','muted'));for(const x of sources){const box=crmEl('details','','booking-visit');box.append(crmEl('summary',x.date.slice(0,10)+'｜'+x.kind),crmEl('p',x.note,'muted'),crmEl('pre',x.text,'line-history-text'),crmEl('small',x.source));body.append(box);}}
 if(!all.length&&!sources.length)body.append(crmEl('p','尚無歷史報價'));dlg.showModal();
}
$('rateEdit').onclick=()=>{const body=crmEl('div'),dlg=crmDialog('全域費率與特殊檔期',body),r=currentRates();for(const [key,label] of [['cat','純貓｜生活費／分鐘／陪伴費／分鐘'],['dog','純犬｜生活費／分鐘／散步費／分鐘'],['mixed','犬喵同住｜單犬費／分鐘／雙犬費／分鐘']]){body.append(heading(label));r[key].forEach((row,i)=>{const g=crmEl('div','','crm-fields');body.append(crmEl('small',key==='cat'?['1～2 喵','3～6 喵','7 喵以上'][i]:key==='dog'?(i+1)+' 犬':(i+1)+' 喵'),g);row.forEach((v,j)=>{if(key==='cat'&&j===0)return;const input=crmInput(g,['費用','分鐘','費用','分鐘'][(j-(key==='cat'?1:0))],v);input.oninput=()=>row[j]=Number(input.value);});});}
const holidayBox=crmEl('div');body.append(heading('特殊檔期費率'),holidayBox);function drawH(){const top=dlg.scrollTop,left=dlg.scrollLeft;holidayBox.replaceChildren();r.holiday.forEach((h,i)=>{const g=crmEl('div','','booking-visit');const n=crmInput(g,'檔期名稱',h.name,'text'),a=crmInput(g,'開始日期',h.a,'date'),b=crmInput(g,'結束日期',h.b,'date'),fee=crmInput(g,'每趟加價',h.fee),active=crmCheck(g,'啟用',h.active);for(const [input,key]of [[n,'name'],[a,'a'],[b,'b'],[fee,'fee'],[active,'active']])input.onchange=()=>h[key]=key==='fee'?Number(input.value):key==='active'?input.checked:input.value;g.append(button('移除此區間',()=>{r.holiday.splice(i,1);drawH();}));holidayBox.append(g);});holidayBox.append(button('＋ 新增區間',()=>{r.holiday.push({name:'',a:'',b:'',fee:0,active:true});drawH();}));if(dlg.open){dlg.scrollTop=top;dlg.scrollLeft=left;}}drawH();
body.append(button('保存全域費率',async()=>{try{const raw=JSON.stringify(r);readRates(raw);const next={...brand,rates:raw};brandState.dirty=true;await db.put('settings',brandState,'brandSync');await db.put('settings',next,'brand');brand=next;pdf=null;dlg.close();render();schedule();toast('費率已保存，連線後同步 Drive');}catch(e){toast(e.message);}},'primary'));dlg.showModal();};

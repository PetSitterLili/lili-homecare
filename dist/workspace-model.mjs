
export const VERSION=2;
export const blanks=()=>({pets:[],food:{dry:{},wet:{},snack:{}},water:{},wash:{},toilet:{},play:{},walk:{},health:{}});
export function fresh(){return {schema:2,id:crypto.randomUUID(),name:'',clientRisk:{status:'normal',note:''},contact:{},booking:{services:[]},media:{status:'pending',note:''},entry:{},environment:'',extra:'',groups:{cat:blanks()},photos:[],runs:[],updatedAt:null};}
export const fields={
dry:[['item','飼料品項'],['amount','份量'],['unit','單位'],['location','備品位置'],['leftover','剩食處理'],['note','特殊交代／個別差異']],
wet:[['item','罐頭／餐包／鮮食品項'],['amount','份量'],['unit','單位'],['water','加水方式'],['location','備品位置'],['leftover','剩食處理'],['note','特殊交代／個別差異']],
snack:[['item','可給的零食'],['amount','份量'],['unit','單位'],['location','備品位置'],['note','禁忌／特殊交代']],
water:[['place','水碗／飲水機數量與位置'],['source','水源與備水位置'],['care','換水／補水方式'],['note','特殊交代']],
wash:[['sponge','菜瓜布'],['spongePlace','辨識與位置'],['soap','寵物洗碗精'],['soapPlace','辨識與位置'],['note','洗滌位置／特殊交代']],
toilet:[['place','砂盆／尿墊數量與位置'],['spare','備品位置'],['waste','廢棄物處理'],['usual','平常如廁狀況'],['note','特殊交代']],
play:[['likes','安撫方式／互動喜好'],['toys','玩具與位置'],['note','個別差異／注意事項']],
walk:[['time','時間／路線'],['tools','牽繩、胸背與便袋位置'],['note','安全與雨天交代'],['returnNote','返家用品位置／特殊交代']],
health:[['status','健康與處置確認'],['note','對象、藥品、份量、時段與操作／觀察事項']]
};
export const titles={dry:'乾乾',wet:'濕食',snack:'零食',water:'飲水',wash:'洗滌',toilet:'如廁與清潔',play:'陪伴與互動',walk:'散步與返家整理',health:'醫療與健康'};

// Store row metadata as strings alongside existing text fields, preserving schema 2.
const noteMeta=k=>'careNoteRows_'+k;
export function noteSpecs(f){
 const out=[];
 const add=(obj,key,title,flag=false,prefix='')=>out.push({obj,key,title,flag,prefix});
 add(f.contact,'guide','位置指引');add(f.media,'note','影像分享注意事項');
 for(const [kind,g] of Object.entries(f.groups)){
  const sp=kind==='cat'?'喵寶':'犬寶';
  g.pets.forEach((p,i)=>{for(const [k,l] of [['identity','辨識'],['personality','個性與禁忌'],['area','活動／躲藏位置'],['health','個別健康'],['intro','補充介紹']])add(p,k,(p.name||sp+' '+(i+1))+'｜'+l,k==='health',kind+'-pet-'+(p.id||i));});
  for(const type of Object.keys(fields)){
   if(type==='walk'&&kind!=='dog')continue;
   const o=g.food[type]||g[type];
   for(const [k,l] of fields[type]){
    if(['amount','unit','status','leftover'].includes(k)||(type==='wash'&&['sponge','soap'].includes(k)))continue;
    add(o,k,sp+'｜'+titles[type]+'・'+l,type==='health'&&k==='note',kind+'-'+type);
   }
  }
 }
 for(const [k,l] of [['pickup','鑰匙取得'],['door','門鎖與防逃脫'],['return','鑰匙歸還']])add(f.entry,k,l,k==='door');
 add(f,'hospital','習慣去的動物醫院',true);add(f,'environment','門窗與電器',true);add(f,'extra','其他特殊交代');
 return out;
}
export function noteCycle(f){
 const rs=bookingSegments(f.booking);
 return rs.length?JSON.stringify(rs.map(r=>[r.a,r.b]).sort((a,b)=>a.join().localeCompare(b.join()))):f.booking.dates?.trim()?'legacy:'+f.booking.dates.trim():'';
}
export function noteRows(spec){
 const {obj,key,flag,prefix}=spec,raw=obj[noteMeta(key)];
 if(typeof raw==='string'){
  try{const rows=JSON.parse(raw);if(Array.isArray(rows)&&rows.every(r=>r&&typeof r.id==='string'&&typeof r.text==='string'&&typeof r.flag==='boolean'&&typeof r.temp==='boolean'&&typeof r.cycle==='string'))return rows.map(r=>({id:r.id,text:r.text,flag:r.flag,temp:r.temp,cycle:r.cycle,closed:r.closed===true,...(r.ownerFlag===true?{ownerFlag:true}:{})}));}catch{}
 }
 return typeof obj[key]==='string'&&obj[key].trim()?[{id:'legacy-'+prefix+'-'+key,text:obj[key],flag:false,temp:false,cycle:'',closed:false}]:[];
}
export function writeNoteRows(spec,rows){
 spec.obj[noteMeta(spec.key)]=JSON.stringify(rows);
 // Keep a readable full-text fallback, including historical text, in the original field.
 spec.obj[spec.key]=rows.filter(r=>r.text.trim()).map(r=>r.text).join('\n');
}
export function noteActive(f,r){return !r.closed&&(!r.temp||!r.cycle||r.cycle===noteCycle(f));}
export function bindPendingNotes(f){
 const cycle=noteCycle(f);if(!cycle)return;
 for(const s of noteSpecs(f)){
  const rows=noteRows(s);if(rows.some(r=>r.temp&&!r.cycle&&!r.closed))writeNoteRows(s,rows.map(r=>r.temp&&!r.cycle&&!r.closed?{...r,cycle}:r));
 }
}
export function activeFamily(f){
 const copy=JSON.parse(JSON.stringify(f));
 for(const s of noteSpecs(copy)){s.obj[s.key]=noteRows(s).filter(r=>noteActive(copy,r)&&r.text.trim()).map(r=>r.text).join('\n');}
 return copy;
}
export function expiredNoteWarnings(f){
 const w=[];
 for(const s of noteSpecs(f))for(const r of noteRows(s)){
  if(!r.text.trim()||r.closed||!r.temp||noteActive(f,r))continue;
  w.push(s.title+'：上期指示待確認（'+r.text+'）');
 }
 return w;
}

export function day(d=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return Object.fromEntries(p.map(x=>[x.type,x.value]));}
export function filename(f,d=new Date()){const p=day(d);return ('ㄌㄌ保姆｜'+p.month+p.day+(f.name||'未命名家庭')+'照護計畫書.pdf').replace(/[\\/:*?"<>]/g,'_');}
export function mediaLabel(f){return f.media.status==='yes'?'我願意分享':f.media.status==='no'?'不對外分享':'影像意願待確認';}
export function warnings(f){const w=expiredNoteWarnings(f);f=activeFamily(f);if(!f.name.trim())w.push('家庭名稱尚未填寫');if(!f.booking.dates&&!bookingSegments(f.booking).length)w.push(readLineReservations(f).some(r=>r.state==='confirmed')?'LINE預約日期已保留，請先設定本次預約方案':'本次預約日期尚未填寫');if(!f.contact.phone)w.push('家長聯絡電話尚未填寫');if(!f.contact.address)w.push('服務地址尚未填寫');if(f.media.status==='pending')w.push('影像分享意願尚未確認');for(const [kind,g] of Object.entries(f.groups)){const name=kind==='dog'?'犬寶':'喵寶';if(!g.pets.length||g.pets.some(p=>!p.name))w.push(name+'的毛寶姓名尚未填完整');if(!g.health.status)w.push(name+'的健康／醫療需求尚未確認');if(f.booking.services.includes('陪伴專案')&&(!g.play.likes||!g.play.toys))w.push(name+'：已選陪伴專案，請補問安撫方式、玩具與位置（也可明確填無玩具）');if(g.health.status==='需要處置'&&!g.health.note)w.push(name+'：需要處置，請補對象、品項、份量與時段');}return w;}
function lines(o,defs){return defs.filter(([k])=>typeof o[k]==='string'&&o[k].trim()).map(([k,l])=>l+'：'+o[k].trim());}
export function careBlocks(f){const blocks=[];for(const [kind,g]of Object.entries(f.groups)){const sp=kind==='dog'?'🐶':'🐱';for(const type of ['dry','wet','snack','water','wash','toilet','play','walk','health']){if(type==='walk'&&kind!=='dog')continue;const o=g.food[type]||g[type];if(o.enabled===false){blocks.push({id:kind+'-'+type,title:sp+' '+titles[type],lines:['本次不提供']});continue;}let detail=lines(o,fields[type].filter(([k])=>!['amount','unit'].includes(k)));if(o.amount||o.unit)detail.splice(Math.min(1,detail.length),0,'份量：'+(o.amount||'')+(o.unit||''));if(type==='dry'&&o.mix)detail.push('混糧：'+[o.mixItem,o.mixAmount].filter(Boolean).join('，'));if(type==='walk'&&o.parts?.length)detail.push('返家整理：'+o.parts.join('、'));if(detail.length)blocks.push({id:kind+'-'+type,title:sp+' '+titles[type],lines:detail});}}return blocks;}
export function publicBlocks(f){f=activeFamily(f);return [
{title:'本次預約',lines:bookingLines(f.booking,f.groups)},
{title:'家長與聯絡資訊',lines:lines(f.contact,[['name','家長稱呼'],['phone','電話'],['emergency','緊急聯絡'],['address','服務地址']])},
...Object.entries(f.groups).map(([kind,g])=>({title:(kind==='dog'?'犬寶':'喵寶')+'的小個性與相處默契',lines:g.pets.flatMap(p=>[p.name||'姓名待確認',...lines(p,[['identity','辨識資料'],['personality','個性與禁忌'],['area','活動／躲藏位置']])])})),
...careBlocks(f),...(f.hospital?[{title:'習慣去的動物醫院',lines:[f.hospital]}]:[]),
{title:'進出與門鎖安全',lines:lines(f.entry,[['pickup','鑰匙拿取'],['door','門鎖操作／防逃脫'],['return','鑰匙歸還'],['wifi','WiFi']])},
{title:'門窗、電器與其他任務',lines:[f.environment,f.extra].filter(Boolean)}
].filter(b=>b.lines.length);}
export function tasks(f){
 const result=[];
 for(const s of noteSpecs(f)){
  // Food sections explicitly marked as not provided must not generate routine tasks.
  const disabled=Object.values(f.groups).some(g=>Object.values(g.food).some(o=>o===s.obj&&o.enabled===false));
  if(disabled)continue;
  for(const r of noteRows(s))if(r.flag&&r.text.trim()&&noteActive(f,r))result.push({id:s.prefix+'|'+s.key+'|'+r.id,title:s.title,detail:r.text});
 }
 return result;
}
export function sourceKey(f){return JSON.stringify({cardVersion:2,contact:f.contact,booking:f.booking,groups:f.groups,entry:f.entry,environment:f.environment,extra:f.extra,media:f.media,environmentRows:f.careNoteRows_environment,extraRows:f.careNoteRows_extra,...(f.hospital||f.careNoteRows_hospital?{hospital:f.hospital,hospitalRows:f.careNoteRows_hospital}:{})});}
export function normalize(raw){if(raw?.schema!==2||typeof raw.id!=='string'||typeof raw.name!=='string'||!raw.groups||!Array.isArray(raw.photos)||!Array.isArray(raw.runs)||raw.photos.length>1000||raw.runs.length>1000)throw Error('家庭資料格式不正確');const f=fresh();f.id=raw.id;if(raw.archived===true)f.archived=true;f.name=raw.name;if(raw.pendingAction===true)f.pendingAction=true;if(raw.profile)f.profile=readProfile(raw.profile);const safeObj=o=>{const result={};for(const[k,v]of Object.entries(o||{})){if(['__proto__','constructor','prototype'].includes(k))continue;if(typeof v==='string'||typeof v==='boolean'||v===null||Array.isArray(v)&&v.every(x=>typeof x==='string'))result[k]=v;}return result;};f.clientRisk={status:['normal','watch','blacklist'].includes(raw.clientRisk?.status)?raw.clientRisk.status:'normal',note:typeof raw.clientRisk?.note==='string'?raw.clientRisk.note:''};f.contact=safeObj(raw.contact);f.booking=safeObj(raw.booking);f.booking.services=Array.isArray(f.booking.services)?f.booking.services:[];f.media={status:['yes','no','pending'].includes(raw.media?.status)?raw.media.status:'pending',note:typeof raw.media?.note==='string'?raw.media.note:''};for(const k of ['decisionEditedAt','legacyConsentFixedAt'])if(typeof raw.media?.[k]==='string')f.media[k]=raw.media[k];if(typeof raw.media?.careNoteRows_note==='string')f.media.careNoteRows_note=raw.media.careNoteRows_note;f.entry=safeObj(raw.entry);f.hospital=typeof raw.hospital==='string'?raw.hospital:'';f.environment=String(raw.environment||'');f.extra=String(raw.extra||'');for(const k of ['careNoteRows_hospital','careNoteRows_environment','careNoteRows_extra'])if(typeof raw[k]==='string')f[k]=raw[k];f.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;f.groups={};for(const kind of ['cat','dog'])if(raw.groups[kind]){const g=blanks(),src=raw.groups[kind];for(const type of Object.keys(g)){if(type==='pets'){g.pets=(Array.isArray(src.pets)?src.pets:[]).slice(0,100).map(safeObj);}else if(type==='food'){for(const t of ['dry','wet','snack'])g.food[t]=safeObj(src.food?.[t]);}else g[type]=safeObj(src[type]);}f.groups[kind]=g;}if(!Object.keys(f.groups).length)throw Error('缺少貓狗資料');f.photos=raw.photos.map(p=>{if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.caption!=='string'||!['image/jpeg','image/png','image/webp'].includes(p.mime)||typeof p.thumb!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(p.thumb)||!Number.isFinite(p.size)||p.size<0)throw Error('照片格式不正確');return {id:p.id,name:p.name,caption:p.caption,mime:p.mime,thumb:p.thumb,size:p.size,...(typeof p.driveId==='string'?{driveId:p.driveId}:{})};});f.runs=raw.runs.map(r=>({id:String(r.id||''),label:String(r.label||''),source:String(r.source||''),tasks:(Array.isArray(r.tasks)?r.tasks:[]).map(t=>({id:String(t.id||''),title:String(t.title||''),detail:String(t.detail||'')})),checks:safeObj(r.checks),createdAt:String(r.createdAt||'')}));if(raw.lineReservations!==undefined){if(!Array.isArray(raw.lineReservations)||raw.lineReservations.length>500||raw.lineReservations.some(r=>!validReservation(r)||!['confirmed','adopted'].includes(r.state)))throw Error('LINE預約資料格式不正確');f.lineReservations=structuredClone(raw.lineReservations);}if(Array.isArray(raw.carePatchReceipts))f.carePatchReceipts=[...new Set(raw.carePatchReceipts.filter(s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(s)))];if(raw.legacy)f.legacy=raw.legacy;if(raw.importReview===true)f.importReview=true;for(const k of ['importSource','importOriginal','importReviewedAt'])if(typeof raw[k]==='string')f[k]=raw[k];return f;}
export function migrate(old,oldText){const f=fresh();f.id=old.id;f.name=old.name;f.updatedAt=old.updatedAt;f.photos=old.photos||[];f.legacy=old;f.extra='舊版資料完整保留，請確認後逐步整理到新欄位。\n\n'+oldText;return f;}

import {catPlanNames,displayQuoteLabel,mixedPlan,mixedCare,mixedService} from './quote.mjs?v=2.0.1126.56';
// Legacy service keys remain valid in stored families and visit cards.
export function serviceName(service,groups){
 if(groups.cat&&groups.dog&&mixedService(service))return mixedPlan;
 if(groups.cat&&!groups.dog){if(Object.hasOwn(catPlanNames,service))return catPlanNames[service];return displayQuoteLabel({label:service});}
 if(service==='生活照顧')return '生活照顧方案';
 return service;
}

export function bookingSegments(b){return (Array.isArray(b.segments)?b.segments:[]).flatMap(s=>{try{const r=JSON.parse(s);return /^\d{4}-\d{2}-\d{2}$/.test(r.a)&&/^\d{4}-\d{2}-\d{2}$/.test(r.b)&&r.a<=r.b&&Array.isArray(r.visits)&&r.visits.length>=1&&r.visits.length<=4&&r.visits.every(v=>mixedService(v.service)&&typeof v.minutes==='string'&&/^\d+$/.test(v.minutes)&&Number(v.minutes)>=1&&Number(v.minutes)<=720&&typeof v.start==='string'&&typeof v.end==='string'&&typeof v.note==='string')?[r]:[];}catch{return [];}});}
export function bookingLines(b,groups){const rs=bookingSegments(b);if(!rs.length)return [b.dates,b.times,...new Set((b.services||[]).map(s=>serviceName(s,groups))),...(groups.cat&&groups.dog&&b.services?.some(mixedService)?[mixedCare]:[])].filter(Boolean);const fmt=d=>d.replace(/-/g,'/'),cn=['零','一','二','三','四','五','六','七','八','九','十'];let total=0;const out=[];for(const r of rs){const n=(Math.round((Date.parse(r.b)-Date.parse(r.a))/86400000)+1)*r.visits.length;total+=n;const labels=r.visits.map(v=>reservationPeriods.includes(v.period)&&v.period?v.period:v.start&&v.end&&Number(v.end.slice(0,2))<=12?'早上':v.start&&Number(v.start.slice(0,2))>=16?'晚上':v.start&&Number(v.start.slice(0,2))>=12&&Number(v.end.slice(0,2))<=16?'下午':'');const unique=labels.every(Boolean)&&new Set(labels).size===labels.length;out.push(fmt(r.a)+(r.a===r.b?'':'～'+fmt(r.b))+'｜'+(unique&&labels.join('')==='早上晚上'?'每日早晚各一趟':'每日 '+r.visits.length+' 趟')+'，共'+(cn[n]||n)+'趟');r.visits.forEach((v,i)=>{out.push((labels[i]||'第 '+(i+1)+' 趟')+'｜'+v.minutes+' 分鐘'+serviceName(v.service,groups));if(v.start&&v.end)out.push('預計抵達時段：'+v.start+'～'+v.end);if(v.note)out.push(v.note);});}if(groups.cat&&groups.dog)out.push(mixedCare);out.push('本次共計 '+total+' 趟到府照護。');return out;}

export function prepareLegacyBatch(packet,existing){
 if(packet?.format!=='lili-homecare-legacy-batch'||packet.version!==1||!Array.isArray(packet.families)||!packet.families.length||packet.families.length>200)throw Error('請選擇正確的舊客批次匯入 JSON（每批最多 200 戶）');
 const clean=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'');
 const phone=v=>String(v||'').replace(/\D/g,'').replace(/^886/,'0');
 const seen=[...existing],accepted=[],skipped=[];
 for(const raw of packet.families){
  if(typeof raw.importSource!=='string'||!raw.importSource.trim()||typeof raw.importOriginal!=='string'||!raw.importOriginal.trim()||typeof raw.name!=='string'||!raw.name.trim())throw Error('匯入資料缺少家庭名稱、來源識別或原始紀錄');
  if(!Array.isArray(raw.photos)||raw.photos.length||!Array.isArray(raw.runs)||raw.runs.length)throw Error('本批次僅支援舊客文字，照片及執行紀錄請另外處理');
  const f=normalize(raw);
  const duplicate=seen.find(e=>e.id===f.id||e.importSource===f.importSource||(clean(e.name)&&clean(e.name)===clean(f.name))||(clean(e.contact?.address)&&clean(e.contact.address)===clean(f.contact.address))||(phone(e.contact?.phone).length>=8&&phone(e.contact.phone)===phone(f.contact.phone)));
  if(duplicate){skipped.push({name:f.name,reason:'可能與「'+duplicate.name+'」重複，未匯入'});continue;}
  f.booking={services:[]};f.archived=false;f.importReview=true;delete f.importReviewedAt;f.updatedAt=new Date().toISOString();
  accepted.push(f);seen.push(f);
 }
 return {accepted,skipped};
}

export function matchesFamily(f,query){
 const norm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/臺/g,'台');
 const compact=v=>norm(v).replace(/\s+/g,'');
 const terms=norm(query).trim();
 if(!terms)return true;
 const c=f.contact||{};
 const fields=[f.name,c.name,c.phone,c.address,c.guide,...Object.values(f.groups||{}).flatMap(g=>(g.pets||[]).map(p=>p.name))].map(compact);
 const digits=v=>norm(v).replace(/\D/g,'');
 const ph=digits(c.phone);
 const variants=[ph,ph.replace(/^886/,'0'),ph.replace(/^0/,'886')].filter(Boolean);
 if(/^[\d\s()+.-]+$/.test(terms)&&digits(terms))return variants.some(v=>v.includes(digits(terms)))||fields.some(v=>v.includes(compact(terms)));
 return terms.split(/\s+/).every(t=>fields.some(v=>v.includes(t))||(/^\d+$/.test(t)&&variants.some(v=>v.includes(t))));
}

export function syncOverview(records,state={}){
 const rows=records.map(r=>{
  const local=state.failures?.get(r.id),waiting=!!state.pending?.get(r.id),active=state.activeId===r.id;
  const error=local||r.syncError||'';
  const synced=!!r.remote&&r.rev===r.syncedRev&&!waiting&&!active&&!local&&!error;
  const kind=local?'error':active?'active':error?'error':waiting?'local':synced?'done':!r.f.name.trim()&&!r.f.archived?'unnamed':'queued';
  return {id:r.id,name:r.f.name||'未命名家庭',kind,error:String(error),syncedAt:r.syncedAt||0};
 });
 const count=k=>rows.filter(x=>x.kind===k).length;
 const done=count('done'),errors=count('error'),queued=count('queued')+count('local')+count('unnamed'),active=count('active');
 const brandError=String(state.brandError||''),connectionError=String(state.connectionError||''),importError=String(state.importError||'');
 const errorCount=errors+Number(!!brandError)+Number(!!connectionError)+Number(!!importError);
 const busy=!!(active||state.draining||state.connecting||state.brandActive||state.importing||state.photoBusy||count('local'));
 let tone,label;
 if(errorCount){tone='red';label='同步異常 '+errorCount;}
 else if(!state.online){tone='gray';label='離線・'+(queued+active)+' 戶待同步';}
 else if(state.connecting){tone='amber';label='載入雲端';}
 else if(state.importing){tone='amber';label='匯入中';}
 else if(!state.connected){tone='gray';label=state.expired?'授權到期':'尚未連線';}
 else if(busy){tone='amber';label='同步中 '+done+'/'+rows.length;}
 else if(queued||state.brandDirty){tone='amber';label='待同步 '+(queued+(state.brandDirty?1:0));}
 else{tone='green';label='全域已同步';}
 return {rows,done,errors,queued,active,errorCount,tone,label,brandError,connectionError,importError};
}


export function lineHistory(f){
 return (Array.isArray(f.booking?.lineQuoteHistory)?f.booking.lineQuoteHistory:[]).flatMap(s=>{try{const x=JSON.parse(s);return x&&typeof x.id==='string'&&typeof x.date==='string'&&typeof x.text==='string'?[x]:[];}catch{return [];}}).sort((a,b)=>b.date.localeCompare(a.date));
}
// This patch is a source archive, never a formal quote or a payment ledger.
export function prepareLineHistory(packet,families){
 if(packet?.format!=='lili-line-history-patch'||packet.version!==1||!Array.isArray(packet.families)||!packet.families.length||packet.families.length>200)throw Error('不是 LINE 歷史報價增量匯入檔');
 const accepted=[],skipped=[],ids=new Set(),seen=new Set();
 for(const p of packet.families){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||typeof p.importSource!=='string'||!p.importSource||typeof p.blacklist!=='boolean'||!Array.isArray(p.entries)||p.entries.length>300)throw Error('家庭識別或歷史報價格式有誤');
  ids.add(p.id);
  for(const x of p.entries){if(!x||typeof x.id!=='string'||!/^line-[0-9-]+$/.test(x.id)||seen.has(x.id)||typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(x.date)||!Number.isFinite(Date.parse(x.date))||['kind','note','source','text'].some(k=>typeof x[k]!=='string'||x[k].length>30000)||!x.text.trim())throw Error('歷史來源紀錄格式有誤或重複');seen.add(x.id);}
  const f=families.find(f=>f.id===p.id);
  if(!f||f.archived||f.importSource!==p.importSource){skipped.push({name:p.name,reason:'找不到相符且未封存的原始家庭 ID／匯入來源'});continue;}
  const existing=lineHistory(f),existingIds=new Set(existing.map(x=>x.id)),add=p.entries.filter(x=>!existingIds.has(x.id)).map(x=>JSON.stringify({id:x.id,date:x.date,kind:x.kind,note:x.note,source:x.source,text:x.text}));
  const black=p.blacklist&&f.clientRisk?.status!=='blacklist';
  if(!add.length&&!black){skipped.push({name:f.name,reason:'已匯入或沒有新增項目'});continue;}
  accepted.push({id:f.id,name:f.name,add,black});
 }
 return {accepted,skipped};
}
export function applyLineHistory(f,p){
 const next=JSON.parse(JSON.stringify(f));
 next.booking.lineQuoteHistory=[...(next.booking.lineQuoteHistory||[]),...p.add];
 if(p.black){const old=next.clientRisk?.note||'';next.clientRisk={status:'blacklist',note:[old,'2026-11-26：主理人確認 LINE 暱稱 👤 黑名單標記。'].filter(Boolean).join('\n')};}
 return next;
}

const isoDay=d=>new Date(d).toISOString().slice(0,10);
export function expandBookingDates(a,b){
 const start=Date.parse(a+'T00:00:00Z'),end=Date.parse(b+'T00:00:00Z');
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||isoDay(start)!==a||isoDay(end)!==b||end-start>3660*86400000)throw Error('日期範圍無效或過長');
 const dates=[];for(let t=start;t<=end;t+=86400000)dates.push(isoDay(t));return dates;
}
export function selectedBookingSegments(dates,visits){
 const sorted=[...new Set(dates)].sort(),out=[];
 if(!sorted.length)throw Error('請至少選擇一天');
 for(const d of sorted){
  expandBookingDates(d,d);
  const prev=out.at(-1);
  if(prev&&Date.parse(d)-Date.parse(prev.b)===86400000)prev.b=d;
  else out.push({a:d,b:d,visits:JSON.parse(JSON.stringify(visits))});
 }
 return out;
}
export function bookingDateGroups(rs){
 const groups=new Map();
 rs.forEach((r,i)=>{
  const key=JSON.stringify(r.visits);
  if(!groups.has(key))groups.set(key,{indices:[],dates:[],visits:r.visits});
  const g=groups.get(key);g.indices.push(i);g.dates.push(...expandBookingDates(r.a,r.b));
 });
 return [...groups.values()].map(g=>({...g,dates:[...new Set(g.dates)].sort()})).sort((a,b)=>a.dates[0].localeCompare(b.dates[0]));
}
export function replaceBookingDates(rs,indices,dates,visits){
 const remaining=rs.filter((_,i)=>!indices.includes(i));
 const next=selectedBookingSegments(dates,visits);
 if(next.some(n=>remaining.some(r=>n.a<=r.b&&n.b>=r.a)))throw Error('選取日期已有其他預約，請先編輯既有方案，避免重複計價');
 return [...remaining,...next].sort((a,b)=>a.a.localeCompare(b.a));
}
export function bookingDateLabel(dates){
 return selectedBookingSegments(dates,[]).map(r=>r.a.replace(/-/g,'/')+(r.a===r.b?'':'～'+r.b.replace(/-/g,'/'))).join('、');
}

export const profileStages={unknown:'尚未確認',new_unvisited:'新客・尚未家訪',old_incomplete:'舊客・資料待補',ready:'已建檔'};
export function safeProfileUrl(s,type){s=String(s||'').trim();if(/[\s\\<>"']/.test(s))return '';if(type==='line')return /^https:\/\/chat\.line\.biz\/U[a-f0-9]{32}\/chat\/U[a-f0-9]{32}\/?#?$/i.test(s)?s.replace(/\/?#?$/,''):'';return /^https:\/\/(?:maps\.app\.goo\.gl\/[A-Za-z0-9]+\/?(?:\?[^#]*)?|(?:www\.google\.com(?:\.tw)?|maps\.google\.com)\/maps(?:[/?][^\s]*)?|goo\.gl\/maps\/[A-Za-z0-9]+\/?(?:\?[^#]*)?)$/.test(s)?s:'';}
export function readProfile(p={}){const s=k=>typeof p?.[k]==='string'?p[k].trim():'',km=s('km'),exact=validServiceDate(s('firstServiceDate')),month=exact?exact.slice(0,7):s('firstServiceMonth');return {mapUrl:safeProfileUrl(s('mapUrl'),'map'),lineUrl:safeProfileUrl(s('lineUrl'),'line'),km:km!==''&&Number.isFinite(Number(km))&&Number(km)>=0&&Number(km)<=1000?String(Number(km)):'',kmEvidence:s('kmEvidence'),firstServiceDate:exact,firstServiceMonth:/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month:'',firstServiceEvidence:s('firstServiceEvidence'),stage:Object.hasOwn(profileStages,s('stage'))?s('stage'):'unknown',serviceState:['served','unserved','unknown'].includes(s('serviceState'))?s('serviceState'):'unknown',known:s('known')};}
export function familyArea(f){const a=String(f.contact?.address||'').replace(/臺/g,'台');const hit=a.match(/(嘉義市|嘉義縣)([^縣市]{0,8}?[區鄉鎮市])?/);return hit?{city:hit[1],district:hit[2]||''}:{city:'',district:''};}
export function profileAge(f,today){const p=readProfile(f.profile);if(!p.firstServiceMonth)return null;const [y,m]=p.firstServiceMonth.split('-').map(Number),[ty,tm]=today.slice(0,7).split('-').map(Number);return Math.max(0,(ty-y)*12+tm-m);}
function matchesSingleProfile(f,q={},today=new Date().toISOString().slice(0,10)){const p=readProfile(f.profile),a=familyArea(f),c=f.groups.cat?.pets.length||0,d=f.groups.dog?.pets.length||0;if(q.booking&&(q.booking==='upcoming'?!nextBookingDate(f,today):q.booking==='none'?!!nextBookingDate(f,today):true))return false;if(q.risk&&q.risk!==(f.clientRisk?.status||'normal'))return false;if(q.city&&(q.city==='unknown'?!!a.city:a.city!==q.city))return false;if(q.district&&a.district!==q.district)return false;if(q.stage&&p.stage!==q.stage)return false;if(q.type&&q.type!==(c&&d?'mixed':c?'cat':d?'dog':'unknown'))return false;if(q.count&&(q.count==='single'?c+d!==1:q.count==='multi'?c+d<2:c+d!==0))return false;if(q.km&&(q.km==='unknown'?p.km!=='':p.km===''||Number(p.km)>Number(q.km)))return false;const age=profileAge(f,today);if(q.age&&(q.age==='unserved'?p.serviceState!=='unserved':q.age==='unknown'?p.firstServiceMonth!==''||p.serviceState==='unserved':age===null||p.serviceState==='unserved'||(q.age==='under6'?age>=6:age<Number(q.age))))return false;if(q.from&&(!p.firstServiceMonth||p.firstServiceMonth<q.from))return false;if(q.to&&(!p.firstServiceMonth||p.firstServiceMonth>q.to))return false;return true;}
const profileKeys=['mapUrl','lineUrl','km','kmEvidence','firstServiceDate','firstServiceMonth','firstServiceEvidence','stage','serviceState','known'];
const profileNameKey=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s、，,（）()]/g,'').replace(/家$/,'');
export function prepareProfilePatch(packet,families){
 if(packet?.format!=='lili-family-profile-patch'||packet.version!==1||!Array.isArray(packet.existing)||!Array.isArray(packet.drafts)||packet.existing.length+packet.drafts.length>200)throw Error('不是家庭工作站回填檔');
 const accepted=[],skipped=[],ids=new Set(),links=new Set();
 const valid=p=>{if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!p.profile||Object.keys(p.profile).some(k=>!profileKeys.includes(k))||Object.values(p.profile).some(v=>typeof v!=='string'||v.length>10000))throw Error('家庭識別或欄位格式異常');ids.add(p.id);const x=readProfile(p.profile);for(const k of Object.keys(p.profile))if(p.profile[k]&&x[k]!==p.profile[k])throw Error('不合法欄位：'+p.name+' '+k);if(x.lineUrl){if(links.has(x.lineUrl))throw Error('重複 LINE 聊天室');links.add(x.lineUrl);}return x;};
 for(const p of packet.existing){const x=valid(p),f=families.find(f=>f.id===p.id);if(!f||f.archived||!(p.importSource?f.importSource===p.importSource:p.refineFirstService===true&&p.expectedLineUrl&&safeProfileUrl(p.expectedLineUrl,'line')===readProfile(f.profile).lineUrl)){skipped.push({name:p.name,reason:'既有家庭 ID／來源不符'});continue;}const old=readProfile(f.profile),patch={},conflicts=[];if(p.refineFirstService===true){const expected=p.expected||{};if(Object.keys(p.profile).some(k=>!['firstServiceDate','firstServiceMonth','firstServiceEvidence','serviceState'].includes(k))||!x.firstServiceDate||x.firstServiceMonth!==x.firstServiceDate.slice(0,7)||!x.firstServiceEvidence||x.serviceState!=='served')throw Error('首次服務修正格式錯誤');if(old.firstServiceDate===x.firstServiceDate){skipped.push({name:f.name,reason:'已回填日期'});continue;}if(old.firstServiceDate||old.serviceState==='unserved'||!((old.firstServiceMonth===(expected.firstServiceMonth||'')&&old.firstServiceEvidence===(expected.firstServiceEvidence||''))||(!old.firstServiceMonth&&!old.firstServiceEvidence))){skipped.push({name:f.name,reason:'首次服務資料已人工調整／不符舊值，請核對'});continue;}accepted.push({id:f.id,name:f.name,patch:{firstServiceDate:x.firstServiceDate,firstServiceMonth:x.firstServiceMonth,firstServiceEvidence:x.firstServiceEvidence,serviceState:'served'},watch:false,conflicts:[],new:false,refinement:true,oldMonth:old.firstServiceMonth});continue;}for(const k of Object.keys(p.profile)){if(!x[k]||x[k]===old[k])continue;if(k==='lineUrl'&&families.some(other=>other.id!==f.id&&readProfile(other.profile).lineUrl===x.lineUrl)){conflicts.push('LINE 已屬其他家庭');continue;}if((k==='stage'||k==='serviceState')?old[k]!=='unknown':!!old[k]){conflicts.push(k+' 已有值');continue;}if(k==='kmEvidence'&&old.km&&old.km!==x.km)continue;if(k==='firstServiceEvidence'&&old.firstServiceMonth&&old.firstServiceMonth!==x.firstServiceMonth)continue;patch[k]=x[k];}const watch=p.watch===true&&!['blacklist','watch'].includes(f.clientRisk?.status);if(Object.keys(patch).length||watch)accepted.push({id:f.id,name:f.name,patch,watch,conflicts,new:false});else skipped.push({name:f.name,reason:conflicts.join('；')||'已回填／無新增'});}
 for(const p of packet.drafts){const x=valid(p);if(p.aliases&&!Array.isArray(p.aliases))throw Error('別名格式錯誤');const names=[p.name,...(p.aliases||[])].map(profileNameKey).filter(Boolean);if(families.some(f=>f.id===p.id||x.lineUrl&&readProfile(f.profile).lineUrl===x.lineUrl||[f.name,f.contact?.name,...Object.values(f.groups).flatMap(g=>g.pets.map(t=>t.name))].map(profileNameKey).some(n=>n&&names.includes(n)))){skipped.push({name:p.name,reason:'疑似已建檔，請手動核對'});continue;}accepted.push({id:p.id,name:p.name,patch:x,watch:false,conflicts:[],new:true});}
 return {accepted,skipped};
}
export function applyProfilePatch(f,p){const next=f?JSON.parse(JSON.stringify(f)):fresh();if(p.new){next.id=p.id;next.name=p.name;}next.profile=readProfile({...next.profile,...p.patch});if(p.watch&&next.clientRisk.status==='normal')next.clientRisk={status:'watch',note:[next.clientRisk.note,'2026-11-26 主理人指定重點注意'].filter(Boolean).join('\n')};return next;}

export function matchesProfile(f,q={},today=taipeiDate()){
 const excluded=Array.isArray(q.excludeRisk)?q.excludeRisk:q.excludeRisk?[q.excludeRisk]:[];if(excluded.includes(f.clientRisk?.status||'normal'))return false;
 return Object.entries(q).filter(([k])=>k!=='excludeRisk').every(([k,v])=>Array.isArray(v)?!v.length||v.some(x=>matchesSingleProfile(f,{[k]:x},today)):!v||matchesSingleProfile(f,{[k]:v},today));
}

export function taipeiDate(d=new Date()){const p=day(d);return p.year+'-'+p.month+'-'+p.day;}

export const reservationPeriods=['','早上','中午','下午','中下午','傍晚','晚上','早或晚','彈性'];
const reservationText=(x,max)=>typeof x==='string'&&x.length<=max;
const reservationTime=x=>typeof x==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(x);
export function validReservation(r){
 if(!r||!reservationText(r.id,100)||!/^[a-zA-Z0-9-]+$/.test(r.id)||!Array.isArray(r.days)||!r.days.length||r.days.length>366||!reservationText(r.notes,4000)||!(r.quotedTotal===null||Number.isSafeInteger(r.quotedTotal)&&r.quotedTotal>=0)||!r.source||!reservationText(r.source.file,500)||!Array.isArray(r.source.records)||!r.source.records.every(x=>Number.isSafeInteger(x)&&x>0)||!Array.isArray(r.source.messageDates)||!r.source.messageDates.every(x=>reservationText(x,20)))return false;
 let last='';for(const d of r.days){if(!d||!validServiceDate(d.date)||d.date<=last)return false;last=d.date;if(d.visits===null)continue;if(!Array.isArray(d.visits)||!d.visits.length||d.visits.length>4)return false;for(const v of d.visits)if(!v||!reservationPeriods.includes(v.period)||!reservationText(v.service,100)||!(v.minutes===null||Number.isSafeInteger(v.minutes)&&v.minutes>=1&&v.minutes<=720)||!reservationText(v.note,1000)||!((v.start===''&&v.end==='')||(reservationTime(v.start)&&reservationTime(v.end)&&v.start<v.end)))return false;}
 return true;
}
export function readLineReservations(f){return Array.isArray(f.lineReservations)?f.lineReservations.filter(r=>validReservation(r)&&['confirmed','adopted'].includes(r.state)):[];}
export function reservationLines(r){return r.days.map(d=>d.date.replace(/-/g,'/')+'｜'+(d.visits===null?'趟次、時段待確認':d.visits.map(v=>[v.period||'時段未指定',v.service||'方案待確認',v.minutes===null?'分鐘待確認':v.minutes+'分鐘',v.start&&v.end?'抵達 '+v.start+'～'+v.end:'',v.note].filter(Boolean).join('・')).join('；')));}
export function reservationSegments(r,groups){
 if(!validReservation(r))return null;
 const services=groups.cat&&groups.dog?[mixedPlan]:groups.dog?['生活照顧','照顧＋散步']:['生活照顧','陪伴專案'];
 const out=[];for(const d of r.days){if(!d.visits||d.visits.some(v=>!services.includes(v.service)||v.minutes===null))return null;const visits=d.visits.map(v=>({service:v.service,minutes:String(v.minutes),start:v.start,end:v.end,note:v.note,period:v.period}));const prev=out.at(-1);if(prev&&Date.parse(d.date)-Date.parse(prev.b)===86400000&&JSON.stringify(prev.visits)===JSON.stringify(visits))prev.b=d.date;else out.push({a:d.date,b:d.date,visits});}return out;
}
export function reservationTarget(r,families,manual=''){
 const available=families.filter(f=>!f.archived&&f.clientRisk?.status!=='blacklist');
 if(manual)return available.find(f=>f.id===manual)||null;
 const id=available.find(f=>f.id===r.familyId);
 if(id&&((r.sourceKey&&r.sourceKey===id.importSource)||(safeProfileUrl(r.lineUrl,'line')&&safeProfileUrl(r.lineUrl,'line')===readProfile(id.profile).lineUrl)))return id;
 const link=safeProfileUrl(r.lineUrl,'line');if(link){const matches=available.filter(f=>readProfile(f.profile).lineUrl===link);if(matches.length===1)return matches[0];}
 return null;
}
export function inspectLineReservations(packet,families,manual={}){
 if(packet?.format!=='lili-line-reservations'||packet.version!==1||!Array.isArray(packet.reservations)||packet.reservations.length>500)throw Error('不是LINE預約增量匯入檔');
 const ids=new Set();for(const r of packet.reservations){if(!validReservation(r)||ids.has(r.id)||!reservationText(r.familyId,100)||!reservationText(r.familyName,200)||!reservationText(r.sourceKey,1000)||!reservationText(r.lineUrl,500))throw Error('預約匯入資料格式錯誤');ids.add(r.id);}
 const claimed=new Map();return packet.reservations.map(r=>{const f=reservationTarget(r,families,manual[r.id]);if(!f)return {r,result:'unmatched'};
 const old=readLineReservations(f),dates=new Set(r.days.map(d=>d.date));if(old.some(x=>x.id===r.id))return {r,f,result:'done'};
 if(old.some(x=>x.days.some(d=>dates.has(d.date))))return {r,f,result:'conflict',reason:'已存在重疊的LINE預約'};
 if(bookingSegments(f.booking).some(s=>r.days.some(d=>d.date>=s.a&&d.date<=s.b)))return {r,f,result:'conflict',reason:'既有本次預約日期重疊，未覆蓋'};
 const used=claimed.get(f.id)||new Set();if(r.days.some(d=>used.has(d.date)))return {r,f,result:'conflict',reason:'本批次日期重疊'};
 for(const d of dates)used.add(d);claimed.set(f.id,used);return {r,f,result:'ready'};
 });
}
export function canAdoptReservation(f){return !bookingSegments(f.booking).length&&!f.booking.dates&&!f.booking.times&&!f.booking.quote;}
export function applyLineReservations(f,rs){
 const next=structuredClone(f),old=readLineReservations(next);let adopted=0;
 for(const r of rs){if(old.some(x=>x.id===r.id))continue;const segments=rs.length===1&&canAdoptReservation(next)&&!old.some(x=>x.state==='confirmed')?reservationSegments(r,next.groups):null;
 const saved={id:r.id,days:structuredClone(r.days),notes:r.notes,quotedTotal:r.quotedTotal,source:structuredClone(r.source),state:segments?'adopted':'confirmed'};
 if(segments){next.booking.segments=segments.map(x=>JSON.stringify(x));next.booking.services=[...new Set(segments.flatMap(x=>x.visits.map(v=>v.service)))];adopted++;}
 old.push(saved);
 }
 next.lineReservations=old;return {next,adopted};
}

export function nextBookingDate(f,today=taipeiDate()){
 const valid=s=>{const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
 const dates=[...bookingSegments(f.booking||{}).filter(r=>valid(r.a)&&valid(r.b)&&r.b>=today).map(r=>r.a<today?today:r.a),...readLineReservations(f).filter(r=>r.state==='confirmed').flatMap(r=>r.days.map(d=>d.date).filter(d=>d>=today))].sort();
 return dates[0]||'';
}
export function orderUpcomingFamilies(records,today=taipeiDate()){
 return records.map((r,i)=>({r,i,next:nextBookingDate(r.f,today)})).sort((a,b)=>a.next&&b.next?a.next.localeCompare(b.next)||a.i-b.i:a.next?-1:b.next?1:a.i-b.i).map(x=>x.r);
}
export function recentFamilyIds(ids,id,limit=8){const old=Array.isArray(ids)?ids.filter(x=>typeof x==='string'&&x):[];return [...new Set([...(id?[id]:[]),...old])].slice(0,limit);}

export function validServiceDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';}
export function compareServiceDates(a,b,dir=1){const x=readProfile(a.profile),y=readProfile(b.profile);if(!x.firstServiceMonth||!y.firstServiceMonth)return x.firstServiceMonth?-1:y.firstServiceMonth?1:0;const month=x.firstServiceMonth.localeCompare(y.firstServiceMonth)*dir;if(month)return month;if(!x.firstServiceDate||!y.firstServiceDate)return x.firstServiceDate?-1:y.firstServiceDate?1:0;return x.firstServiceDate.localeCompare(y.firstServiceDate)*dir;}
export function familyModifiedTime(f){const v=f?.updatedAt;if(typeof v!=='string'||!v.trim())return null;const t=Date.parse(v);return Number.isFinite(t)?t:null;}
export function sortFamilyDirectory(records,mode='upcoming',today=taipeiDate()){const name=(a,b)=>String(a.f.name||'').localeCompare(String(b.f.name||''),'zh-Hant-TW');return [...records].sort((a,b)=>{if(mode==='name')return name(a,b);if(mode==='modified'){const x=familyModifiedTime(a.f),y=familyModifiedTime(b.f);return (x===null?(y===null?0:1):y===null?-1:y-x)||name(a,b);}if(mode==='oldest'||mode==='newest')return compareServiceDates(a.f,b.f,mode==='newest'?-1:1)||name(a,b);const blacklistOrder=Number(a.f.clientRisk?.status==='blacklist')-Number(b.f.clientRisk?.status==='blacklist');if(blacklistOrder)return blacklistOrder;const pendingOrder=Number(b.f.pendingAction===true)-Number(a.f.pendingAction===true);if(pendingOrder)return pendingOrder;const x=nextBookingDate(a.f,today),y=nextBookingDate(b.f,today);return (x&&y?x.localeCompare(y):x?-1:y?1:0)||compareServiceDates(a.f,b.f)||name(a,b);});}

export function clearCareFlags(f){const copy=structuredClone(f);let count=0;for(const s of noteSpecs(copy)){const rows=noteRows(s);let changed=false;for(const r of rows)if(r.flag){r.flag=false;delete r.ownerFlag;count++;changed=true;}if(changed)s.obj[noteMeta(s.key)]=JSON.stringify(rows);}return {copy,count};}

export function relocateLegacyHospital(f){
 const copy=structuredClone(f),out={copy,moved:0,review:0};
 if(!copy.importOriginal||!copy.importSource)return out;
 const original=copy.importOriginal.replace(/\r\n/g,'\n');
 const match=original.match(/(?:^|\n)【指定救援醫院】[ \t]*\n([\s\S]*?)(?=\n【|$)/);
 const raw=match?.[1].trim();if(!raw||/^(無|暫無|沒有|尚無|未指定|不指定)[。.]?$/.test(raw))return out;
 const specs=noteSpecs(copy),hs=specs.find(s=>s.obj===copy&&s.key==='hospital'),es=specs.find(s=>s.obj===copy&&s.key==='extra');
 const rows=noteRows(es),existing=noteRows(hs);
 const candidates=rows.filter(r=>/^舊指定救援醫院(?:（請確認）)?[：:]/.test(r.text)&&r.text.replace(/^舊指定救援醫院(?:（請確認）)?[：:]\s*/,'').trim()===raw);
 if(existing.length){if(candidates.length||!existing.some(r=>r.text===raw))out.review++;return out;}
 if(candidates.length!==1||Object.values(copy.groups).some(g=>String(g.health.note||'').includes(raw))){out.review++;return out;}
 const r=candidates[0];
 if(r.ownerFlag||r.closed){out.review++;return out;}
 // Preserve the exact source, but require owner review before use.
 writeNoteRows(hs,[{...r,text:raw,flag:false,temp:true,cycle:'legacy:'+copy.importSource+':hospital'}]);
 writeNoteRows(es,rows.filter(x=>x!==r));
 out.moved=1;return out;
}

export function withoutLegacyLabel(value){return typeof value==='string'?value.replace(/[（(]\s*舊家訪\s*[）)]/g,'').trim():value;}
export function tidyLegacySupplies(f){
 const copy=structuredClone(f),out={copy,count:0,review:0};
 if(!copy.importSource||!copy.importOriginal)return out;
 const specs=noteSpecs(copy),spec=(obj,key)=>specs.find(s=>s.obj===obj&&s.key===key);
 for(const g of Object.values(copy.groups)){
  const w=g.wash;
  // The owner's recording convention: existing affirmative sponge status means pet-only unless shared is explicit.
  if(w.sponge==='有，使用方式待確認'){
   const evidence=[w.spongePlace,w.note].filter(Boolean).join('\n');
   if(/(?:人貓|人寵|人犬|人狗|家人|人類|人用|共用|混用|不專用|無專用|沒有專用)/.test(evidence)){out.review++;}
   else{w.sponge='有，寵物專用';out.count++;}
  }
  for(const [type,o] of Object.entries(g.food)){
   const source=spec(o,'note'),destination=spec(o,'location');
   if(!source||!destination||o.location?.trim()||noteRows(destination).length)continue;
   const candidates=[];
   const noun={dry:'(?:補充)?飼料(?:備品)?|乾乾(?:備品)?',wet:'(?:罐頭|餐包|濕食)(?:備品)?',snack:'(?:零食|肉泥)(?:備品)?'}[type];
   const pattern=new RegExp('^(?:備品|'+noun+')(?:都|會|是|兩款都|均)?(?:放在|放於|在)([^。！？；，、\\n]+)[。.]?$');
   for(const r of noteRows(source)){
    if(r.closed)continue;
    for(const original of r.text.split(/\r?\n/)){
     const line=original.trim().replace(/^[🌟⭐📍➡️❣️\s]+/u,'').trim();
     let value=pattern.exec(line)?.[1]?.trim();
     // Keep a conditional instruction intact rather than converting it into an unconditional location.
     if(!value&&type==='dry'&&/^如(?:以後|之後)?多日需補飼料[，,]則備品在[^。！？；]+[。.]?$/.test(line))value=line;
     if(!value||value.length>100||/(?:待確認|再告知|不確定|也許|可能|如果|吃完|慢慢吃|不用|餵食|放飯|歸位|洗碗)/.test(value))continue;
     candidates.push({value,r});
    }
   }
   const distinct=[...new Set(candidates.map(x=>x.value))];
   if(distinct.length!==1){if(distinct.length>1)out.review++;continue;}
   const r=candidates[0].r;
   if(candidates.some(x=>x.r.temp!==r.temp||x.r.cycle!==r.cycle)){out.review++;continue;}
   writeNoteRows(destination,[{id:'location-from-'+r.id,text:distinct[0],flag:false,temp:r.temp,cycle:r.cycle,closed:false}]);
   out.count++;
  }
 }
 return out;
}

 // Only remove a standalone duplicate whose content and lifetime are already preserved in the destination.
export function dedupeLegacySupplies(f){
  const copy=structuredClone(f),out={copy,count:0,review:0,changes:[]};
  if(!copy.importSource||!copy.importOriginal)return out;
  const specs=noteSpecs(copy),spec=(obj,key)=>specs.find(s=>s.obj===obj&&s.key===key);
  for(const [kind,g] of Object.entries(copy.groups))for(const [type,o] of Object.entries(g.food)){
   const src=spec(o,'note'),dst=spec(o,'location');
   if(!src||!dst)continue;
   const targets=noteRows(dst).filter(r=>!r.closed&&r.text.trim());
   if(!targets.length)continue;
   const rows=noteRows(src);let changed=false;
   const noun={dry:'(?:補充)?飼料(?:備品)?|乾乾(?:備品)?',wet:'(?:罐頭|餐包|濕食)(?:備品)?',snack:'(?:零食|肉泥)(?:備品)?'}[type];
   const pattern=new RegExp('^(?:備品(?:位置)?|'+noun+')(?:都|會|是|兩款都|均)?(?:放在|放於|在|[：:])([^。！？；，、\\n]+)[。.]?$');
   const revised=[];
   for(const row of rows){
    if(row.closed||row.flag||row.ownerFlag){revised.push(row);continue;}
    let removed=false;
    const lines=row.text.split(/\r?\n/).filter(original=>{
     const line=original.trim();if(!line)return true;
     const stripped=line.replace(/^[🌟⭐📍➡️❣️\s]+/u,'').trim();
     const extracted=pattern.exec(stripped)?.[1]?.trim();
     const candidate=targets.find(t=>t.text.trim()===line||t.text.trim()===stripped||!!extracted&&t.text.trim()===extracted);
     if(!candidate)return true;
     if(row.temp!==candidate.temp||row.cycle!==candidate.cycle){out.review++;return true;}
     removed=true;changed=true;out.count++;out.changes.push({kind,type,removed:original,kept:candidate.text});return false;
    });
    if(!removed)revised.push(row);
    else if(lines.some(l=>l.trim()))revised.push({...row,text:lines.join('\n')});
   }
   if(changed)writeNoteRows(src,revised);
  }
  return out;
 }

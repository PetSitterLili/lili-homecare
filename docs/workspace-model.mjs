
export const VERSION=2;
export const blanks=()=>({pets:[],food:{dry:{},wet:{},snack:{}},water:{},wash:{},toilet:{},play:{},walk:{},health:{}});
export function fresh(){return {schema:2,id:crypto.randomUUID(),name:'',contact:{},booking:{services:[]},media:{status:'pending',note:''},entry:{},environment:'',extra:'',groups:{cat:blanks()},photos:[],runs:[],updatedAt:null};}
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
 add(f,'environment','門窗與電器',true);add(f,'extra','其他特殊交代');
 return out;
}
export function noteCycle(f){
 const rs=bookingSegments(f.booking);
 return rs.length?JSON.stringify(rs.map(r=>[r.a,r.b]).sort((a,b)=>a.join().localeCompare(b.join()))):f.booking.dates?.trim()?'legacy:'+f.booking.dates.trim():'';
}
export function noteRows(spec){
 const {obj,key,flag,prefix}=spec,raw=obj[noteMeta(key)];
 if(typeof raw==='string'){
  try{const rows=JSON.parse(raw);if(Array.isArray(rows)&&rows.every(r=>r&&typeof r.id==='string'&&typeof r.text==='string'&&typeof r.flag==='boolean'&&typeof r.temp==='boolean'&&typeof r.cycle==='string'))return rows.map(r=>({id:r.id,text:r.text,flag:r.flag,temp:r.temp,cycle:r.cycle,closed:r.closed===true}));}catch{}
 }
 return typeof obj[key]==='string'&&obj[key].trim()?[{id:'legacy-'+prefix+'-'+key,text:obj[key],flag,temp:false,cycle:'',closed:false}]:[];
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
  if(r.flag||s.flag)w.push(s.title+'：上期指示待確認（'+r.text+'）');
 }
 return w;
}

export function day(d=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return Object.fromEntries(p.map(x=>[x.type,x.value]));}
export function filename(f,d=new Date()){const p=day(d);return ('ㄌㄌ保姆｜'+p.month+p.day+(f.name||'未命名家庭')+'照護計畫書.pdf').replace(/[\\/:*?"<>]/g,'_');}
export function mediaLabel(f){return f.media.status==='yes'?'我願意分享':f.media.status==='no'?'不對外分享':'影像意願待確認';}
export function warnings(f){const w=expiredNoteWarnings(f);f=activeFamily(f);if(!f.name.trim())w.push('家庭名稱尚未填寫');if(!f.booking.dates&&!bookingSegments(f.booking).length)w.push('本次預約日期尚未填寫');if(!f.contact.phone)w.push('家長聯絡電話尚未填寫');if(!f.contact.address)w.push('服務地址尚未填寫');if(f.media.status==='pending')w.push('影像分享意願尚未確認');for(const [kind,g] of Object.entries(f.groups)){const name=kind==='dog'?'犬寶':'喵寶';if(!g.pets.length||g.pets.some(p=>!p.name))w.push(name+'的毛寶姓名尚未填完整');if(!g.health.status)w.push(name+'的健康／醫療需求尚未確認');if(f.booking.services.includes('陪伴專案')&&(!g.play.likes||!g.play.toys))w.push(name+'：已選陪伴專案，請補問安撫方式、玩具與位置（也可明確填無玩具）');if(g.health.status==='需要處置'&&!g.health.note)w.push(name+'：需要處置，請補對象、品項、份量與時段');}return w;}
function lines(o,defs){return defs.filter(([k])=>typeof o[k]==='string'&&o[k].trim()).map(([k,l])=>l+'：'+o[k].trim());}
export function careBlocks(f){const blocks=[];for(const [kind,g]of Object.entries(f.groups)){const sp=kind==='dog'?'🐶':'🐱';for(const type of ['dry','wet','snack','water','wash','toilet','play','walk','health']){if(type==='walk'&&kind!=='dog')continue;const o=g.food[type]||g[type];if(o.enabled===false){blocks.push({id:kind+'-'+type,title:sp+' '+titles[type],lines:['本次不提供']});continue;}let detail=lines(o,fields[type].filter(([k])=>!['amount','unit'].includes(k)));if(o.amount||o.unit)detail.splice(Math.min(1,detail.length),0,'份量：'+(o.amount||'')+(o.unit||''));if(type==='dry'&&o.mix)detail.push('混糧：'+[o.mixItem,o.mixAmount].filter(Boolean).join('，'));if(type==='walk'&&o.parts?.length)detail.push('返家整理：'+o.parts.join('、'));if(detail.length)blocks.push({id:kind+'-'+type,title:sp+' '+titles[type],lines:detail});}}return blocks;}
export function publicBlocks(f){f=activeFamily(f);return [
{title:'本次預約',lines:bookingLines(f.booking,f.groups)},
{title:'家長與聯絡資訊',lines:lines(f.contact,[['name','家長稱呼'],['phone','電話'],['emergency','緊急聯絡'],['address','服務地址']])},
...Object.entries(f.groups).map(([kind,g])=>({title:(kind==='dog'?'犬寶':'喵寶')+'的小個性與相處默契',lines:g.pets.flatMap(p=>[p.name||'姓名待確認',...lines(p,[['identity','辨識資料'],['personality','個性與禁忌'],['area','活動／躲藏位置']])])})),
...careBlocks(f),
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
export function sourceKey(f){return JSON.stringify({cardVersion:2,contact:f.contact,booking:f.booking,groups:f.groups,entry:f.entry,environment:f.environment,extra:f.extra,media:f.media,environmentRows:f.careNoteRows_environment,extraRows:f.careNoteRows_extra});}
export function normalize(raw){if(raw?.schema!==2||typeof raw.id!=='string'||typeof raw.name!=='string'||!raw.groups||!Array.isArray(raw.photos)||!Array.isArray(raw.runs)||raw.photos.length>1000||raw.runs.length>1000)throw Error('家庭資料格式不正確');const f=fresh();f.id=raw.id;if(raw.archived===true)f.archived=true;f.name=raw.name;const safeObj=o=>{const result={};for(const[k,v]of Object.entries(o||{})){if(['__proto__','constructor','prototype'].includes(k))continue;if(typeof v==='string'||typeof v==='boolean'||v===null||Array.isArray(v)&&v.every(x=>typeof x==='string'))result[k]=v;}return result;};f.contact=safeObj(raw.contact);f.booking=safeObj(raw.booking);f.booking.services=Array.isArray(f.booking.services)?f.booking.services:[];f.media={status:['yes','no','pending'].includes(raw.media?.status)?raw.media.status:'pending',note:typeof raw.media?.note==='string'?raw.media.note:''};if(typeof raw.media?.careNoteRows_note==='string')f.media.careNoteRows_note=raw.media.careNoteRows_note;f.entry=safeObj(raw.entry);f.environment=String(raw.environment||'');f.extra=String(raw.extra||'');for(const k of ['careNoteRows_environment','careNoteRows_extra'])if(typeof raw[k]==='string')f[k]=raw[k];f.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;f.groups={};for(const kind of ['cat','dog'])if(raw.groups[kind]){const g=blanks(),src=raw.groups[kind];for(const type of Object.keys(g)){if(type==='pets'){g.pets=(Array.isArray(src.pets)?src.pets:[]).slice(0,100).map(safeObj);}else if(type==='food'){for(const t of ['dry','wet','snack'])g.food[t]=safeObj(src.food?.[t]);}else g[type]=safeObj(src[type]);}f.groups[kind]=g;}if(!Object.keys(f.groups).length)throw Error('缺少貓狗資料');f.photos=raw.photos.map(p=>{if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.caption!=='string'||!['image/jpeg','image/png','image/webp'].includes(p.mime)||typeof p.thumb!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(p.thumb)||!Number.isFinite(p.size)||p.size<0)throw Error('照片格式不正確');return {id:p.id,name:p.name,caption:p.caption,mime:p.mime,thumb:p.thumb,size:p.size,...(typeof p.driveId==='string'?{driveId:p.driveId}:{})};});f.runs=raw.runs.map(r=>({id:String(r.id||''),label:String(r.label||''),source:String(r.source||''),tasks:(Array.isArray(r.tasks)?r.tasks:[]).map(t=>({id:String(t.id||''),title:String(t.title||''),detail:String(t.detail||'')})),checks:safeObj(r.checks),createdAt:String(r.createdAt||'')}));if(raw.legacy)f.legacy=raw.legacy;if(raw.importReview===true)f.importReview=true;for(const k of ['importSource','importOriginal','importReviewedAt'])if(typeof raw[k]==='string')f[k]=raw[k];return f;}
export function migrate(old,oldText){const f=fresh();f.id=old.id;f.name=old.name;f.updatedAt=old.updatedAt;f.photos=old.photos||[];f.legacy=old;f.extra='舊版資料完整保留，請確認後逐步整理到新欄位。\n\n'+oldText;return f;}

import {mixedPlan,mixedCare,mixedService} from './quote.mjs?v=2.0.1126.19';
// Legacy service keys remain valid in stored families and visit cards.
export function serviceName(service,groups){
 if(groups.cat&&groups.dog&&mixedService(service))return mixedPlan;
 if(service==='陪伴專案'&&groups.cat&&!groups.dog)return '喵寶生活照顧與陪伴專案';
 return service;
}

export function bookingSegments(b){return (Array.isArray(b.segments)?b.segments:[]).flatMap(s=>{try{const r=JSON.parse(s);return /^\d{4}-\d{2}-\d{2}$/.test(r.a)&&/^\d{4}-\d{2}-\d{2}$/.test(r.b)&&r.a<=r.b&&Array.isArray(r.visits)&&r.visits.length>=1&&r.visits.length<=4&&r.visits.every(v=>mixedService(v.service)&&typeof v.minutes==='string'&&/^\d+$/.test(v.minutes)&&Number(v.minutes)>=1&&Number(v.minutes)<=720&&typeof v.start==='string'&&typeof v.end==='string'&&typeof v.note==='string')?[r]:[];}catch{return [];}});}
export function bookingLines(b,groups){const rs=bookingSegments(b);if(!rs.length)return [b.dates,b.times,...new Set((b.services||[]).map(s=>serviceName(s,groups))),...(groups.cat&&groups.dog&&b.services?.some(mixedService)?[mixedCare]:[])].filter(Boolean);const fmt=d=>d.replace(/-/g,'/'),cn=['零','一','二','三','四','五','六','七','八','九','十'];let total=0;const out=[];for(const r of rs){const n=(Math.round((Date.parse(r.b)-Date.parse(r.a))/86400000)+1)*r.visits.length;total+=n;const labels=r.visits.map(v=>v.start&&v.end&&Number(v.end.slice(0,2))<=12?'早上':v.start&&Number(v.start.slice(0,2))>=16?'晚上':v.start&&Number(v.start.slice(0,2))>=12&&Number(v.end.slice(0,2))<=16?'下午':'');const unique=labels.every(Boolean)&&new Set(labels).size===labels.length;out.push(fmt(r.a)+(r.a===r.b?'':'～'+fmt(r.b))+'｜'+(unique&&labels.join('')==='早上晚上'?'每日早晚各一趟':'每日 '+r.visits.length+' 趟')+'，共'+(cn[n]||n)+'趟');r.visits.forEach((v,i)=>{out.push((unique?labels[i]:'第 '+(i+1)+' 趟')+'｜'+v.minutes+' 分鐘'+(groups.cat&&groups.dog?serviceName(v.service,groups):v.service==='生活照顧'?'生活照顧方案':v.service));if(v.start&&v.end)out.push('預計抵達時段：'+v.start+'～'+v.end);if(v.note)out.push(v.note);});}if(groups.cat&&groups.dog)out.push(mixedCare);out.push('本次共計 '+total+' 趟到府照護。');return out;}

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

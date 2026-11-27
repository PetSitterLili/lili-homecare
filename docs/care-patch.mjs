import {noteSpecs,noteRows,fields} from './workspace-model.mjs?v=2.0.1126.59';

const own=(o,k)=>Object.hasOwn(o,k)?o[k]:null;
const same=(a,b)=>a.value===b.value&&a.rows===b.rows;
function target(f,path){
 const [species,section,key]=path.split('/');
 let obj;
 if(['cat','dog'].includes(species)&&section?.startsWith('pet:')){
  const pets=f.groups[species]?.pets.filter(p=>p.id===section.slice(4));
  if(pets?.length===1&&['identity','personality','area','health','intro'].includes(key))obj=pets[0];
 }else if(['cat','dog'].includes(species)&&Object.hasOwn(fields,section)&&fields[section].some(([k])=>k===key)){
  obj=f.groups[species]?.food[section]||f.groups[species]?.[section];
 }else if(species==='home'&&section==='entry'&&['pickup','door','return'].includes(key))obj=f.entry;
 else if(species==='home'&&section==='family'&&['environment','extra','hospital'].includes(key))obj=f;
 return obj&&path.split('/').length===3?{obj,key}:null;
}
function validState(state){
 if(!state||!(state.value===null||typeof state.value==='string')||!(state.rows===null||typeof state.rows==='string'))return false;
 if(state.rows===null)return true;
 try{const rows=JSON.parse(state.rows);return Array.isArray(rows)&&rows.every(r=>r&&typeof r.id==='string'&&typeof r.text==='string'&&typeof r.flag==='boolean'&&typeof r.temp==='boolean'&&typeof r.cycle==='string'&&typeof r.closed==='boolean');}catch{return false;}
}
export function inspectCarePatch(packet,families){
 if(packet?.format!=='lili-care-field-patch'||packet.version!==1||!Array.isArray(packet.families)||packet.families.length>500)throw Error('照護修正檔格式錯誤');
 const ids=new Set();
 return packet.families.map(h=>{
  if(typeof h.id!=='string'||ids.has(h.id)||typeof h.importSource!=='string'||!h.importSource||!Array.isArray(h.sets))throw Error('家庭來源或識別重複');
  ids.add(h.id);
  const f=families.find(x=>x.id===h.id),seen=new Set(),used=new Set();
  const matches=f&&!f.archived&&f.importSource===h.importSource;
  const sets=h.sets.map(set=>{
   if(!/^[a-zA-Z0-9-]{1,100}$/.test(set.id)||seen.has(set.id)||!Array.isArray(set.changes)||!set.changes.length)throw Error('修正組格式錯誤');
   seen.add(set.id);let result=matches&&f.importReview===true?'ready':'conflict';
   for(const c of set.changes){
    if(typeof c.path!=='string'||used.has(c.path)||!validState(c.before)||!validState(c.after)||(c.beforeAlternatives!==undefined&&(!Array.isArray(c.beforeAlternatives)||c.beforeAlternatives.length>4||!c.beforeAlternatives.every(validState))))throw Error('修正欄位格式錯誤');
    used.add(c.path);const t=matches&&target(f,c.path);
    if(!t){result='conflict';continue;}
    if(c.after.rows!==null){
     const rows=JSON.parse(c.after.rows);
     if(!noteSpecs(f).some(s=>s.obj===t.obj&&s.key===t.key)||rows.filter(r=>r.text.trim()).map(r=>r.text).join('\n')!==c.after.value)throw Error('備註與旗標資料不一致');
    }
    if(![c.before,...(c.beforeAlternatives||[])].some(before=>same({value:own(t.obj,t.key),rows:own(t.obj,'careNoteRows_'+t.key)},before)))result='conflict';
   }
   if(matches&&f.carePatchReceipts?.includes(set.id))result='done';
   return {...set,result};
  });
  return {id:h.id,name:f?.name||h.name,sets};
 });
}
export function applyCarePatch(packet,family,selected){
 const copy=structuredClone(family);
 const item=inspectCarePatch(packet,[copy]).find(x=>x.id===copy.id);
 let count=0;
 for(const set of item?.sets||[]){
  if(set.result!=='ready'||!selected.has(set.id))continue;
  for(const c of set.changes){const {obj,key}=target(copy,c.path);
   for(const [k,v] of [[key,c.after.value],['careNoteRows_'+key,c.after.rows]]){if(v===null)delete obj[k];else obj[k]=v;}
  }
  (copy.carePatchReceipts??=[]).push(set.id);count++;
 }
 return {copy,count};
}

// Convert a private, reviewed food proposal into exact-current-state care patches.
// Never fill a nonempty or explicitly cleared destination; never promote temporal rows.
export function prepareFoodRefinement(packet,families){
 if(packet?.format!=='lili-food-refinement'||packet.version!==1||!Array.isArray(packet.families)||packet.families.length>500)throw Error('飲食精修檔格式錯誤');
 const output={format:'lili-care-field-patch',version:1,families:[]},seen=new Set(),summary={eligible:0,skipped:0,unchanged:0,removed:0,review:[]};
 const state=(o,k)=>({value:own(o,k),rows:own(o,'careNoteRows_'+k)});
 const bare=s=>String(s??'').trim();
 for(const h of packet.families){
  if(typeof h.id!=='string'||seen.has(h.id)||typeof h.importSource!=='string'||typeof h.diet!=='string'||!Array.isArray(h.groups)||h.groups.length>6)throw Error('飲食家庭格式錯誤');
  seen.add(h.id);const f=families.find(x=>x.id===h.id),sets=[],used=new Set();
  const raw=f?.importOriginal?.split('【飲食照顧細節】')[1]?.split('【飲水照顧細節】')[0]?.trim();
  for(const g of h.groups){
   const key=g.kind+'/'+g.type;
   if(!['cat','dog'].includes(g.kind)||!['dry','wet','snack'].includes(g.type)||used.has(key)||!Array.isArray(g.notes)||!g.notes.every(x=>typeof x==='string')||!Array.isArray(g.items)||g.items.length>7)throw Error('飲食區塊格式錯誤');
   used.add(key);const itemKeys=new Set();
   for(const x of g.items){
    if(!['item','amount','unit','location','leftover','water'].includes(x.key)||!fields[g.type].some(([k])=>k===x.key)||itemKeys.has(x.key)||typeof x.value!=='string'||!x.value.trim()||x.value.length>2000||typeof x.evidence!=='string'||!x.evidence.trim()||!h.diet.includes(x.evidence)||!g.notes.some(n=>n.includes(x.evidence)))throw Error('飲食來源或欄位格式錯誤');
    itemKeys.add(x.key);
   }
   const o=f?.groups[g.kind]?.food[g.type],spec=f&&o&&noteSpecs(f).find(s=>s.obj===o&&s.key==='note');
   const reason=t=>{summary.skipped+=g.items.length;summary.review.push({name:f?.name||h.name,block:key,reason:t});};
   if(!f||f.archived||f.importReview!==true||f.importSource!==h.importSource||raw!==h.diet||!o||!spec){reason('家庭來源不符、已完成複核或未找到');continue;}
   const rows=noteRows(spec);if(!rows.length||rows.some(r=>r.temp||r.closed||r.ownerFlag)){reason('備註時效或人工裁決已變更');continue;}
   const note=bare(o.note),actual=rows.filter(r=>r.text.trim()).map(r=>r.text).join('\n');
   if(bare(actual)!==note){reason('備註文字與明細不一致');continue;}
   // Accept the exact original/previous patch text, or exact known location-only deletions.
   const loc=bare(o.location),noun={dry:'(?:補充)?飼料(?:備品)?|乾乾(?:備品)?',wet:'(?:罐頭|餐包|濕食)(?:備品)?',snack:'(?:零食|肉泥)(?:備品)?'}[g.type];
   const pattern=new RegExp('^(?:備品(?:位置)?|'+noun+')(?:都|會|是|兩款都|均)?(?:放在|放於|在|[：:])([^。！？；，、\\n]+)[。.]?$');
   const locOnly=line=>{const v=bare(line).replace(/^[🌟⭐📍➡️❣️\s]+/u,'').trim();return !!loc&&(bare(line)===loc||v===loc||pattern.exec(v)?.[1]?.trim()===loc);};
   const canon=s=>bare(s).replace(/\r\n/g,'\n');
   if(!g.notes.some(n=>canon(n)===canon(note)||loc&&canon(n.split(/\r?\n/).filter(l=>!locOnly(l)).join('\n'))===canon(note))){reason('原備註已變動，保留現況');continue;}
   const changes=[],accepted=new Map(),proposal=Object.fromEntries(g.items.map(x=>[x.key,x]));
   const portionSafe=['amount','unit'].every(k=>{const s=state(o,k),x=proposal[k];return x?(s.value===null&&s.rows===null||s.value===x.value&&s.rows===null)&&actual.includes(x.evidence):s.value===null&&s.rows===null;});
   for(const x of g.items){
    if(!actual.includes(x.evidence)||(['amount','unit'].includes(x.key)&&!portionSafe)){summary.skipped++;continue;}
    const cur=state(o,x.key);
    if(cur.value===x.value){summary.unchanged++;continue;}
    if(cur.value!==null||cur.rows!==null){summary.skipped++;summary.review.push({name:f.name,block:key,reason:x.key+' 已有值或已清除，不覆蓋'});continue;}
    if(x.key==='amount'&&o.unit!=null&&(!proposal.unit||o.unit!==proposal.unit.value)||x.key==='unit'&&o.amount!=null&&(!proposal.amount||o.amount!==proposal.amount.value)){summary.skipped++;continue;}
    const dstSpec=noteSpecs(f).find(s=>s.obj===o&&s.key===x.key);
    const afterRows=dstSpec?JSON.stringify([{id:'food-53-'+g.kind+'-'+g.type+'-'+x.key,text:x.value,flag:false,temp:false,cycle:'',closed:false}]):null;
    changes.push({path:key+'/'+x.key,before:cur,after:{value:x.value,rows:afterRows}});accepted.set(x.key,x.value);summary.eligible++;
   }
   if(!changes.length)continue;
   // Only delete whole, standalone duplicate lines when the complete line exists in a destination.
   // No removal of flagged or owner-marked rows; keep mixed clauses, conditions and other instructions.
   const exact=new Set([...accepted.values()].map(bare));
   if(accepted.has('amount')&&accepted.has('unit'))exact.add(accepted.get('amount')+accepted.get('unit'));
   let removed=0;const revised=[];
   for(const r of rows){
    if(r.flag||r.ownerFlag){revised.push(r);continue;}
    const lines=r.text.split(/\r?\n/).filter(l=>{
     if(!l.trim())return true;
     const v=l.trim().replace(/^[🌟⭐📍➡️❣️\s]+/u,'').trim();
     const hit=exact.has(l.trim())||exact.has(v);
     if(hit){removed++;return false;}return true;
    });
    if(lines.some(l=>l.trim()))revised.push({...r,text:lines.join('\n')});
   }
   const before=state(o,'note'),after=removed?{value:revised.map(r=>r.text).join('\n'),rows:JSON.stringify(revised)}:before;
   changes.push({path:key+'/note',before,after});summary.removed+=removed;
   sets.push({id:'food53-'+g.kind+'-'+g.type,label:(g.kind==='cat'?'喵寶':'犬寶')+'・'+({dry:'乾乾',wet:'濕食',snack:'零食'}[g.type])+'飲食細項',changes});
  }
  if(sets.length)output.families.push({id:h.id,name:f.name,importSource:h.importSource,sets});
 }
 return {packet:output,summary};
}

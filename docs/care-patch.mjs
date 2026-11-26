import {noteSpecs,fields} from './workspace-model.mjs?v=2.0.1126.35';

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
 else if(species==='home'&&section==='family'&&['environment','extra'].includes(key))obj=f;
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
    if(typeof c.path!=='string'||used.has(c.path)||!validState(c.before)||!validState(c.after))throw Error('修正欄位格式錯誤');
    used.add(c.path);const t=matches&&target(f,c.path);
    if(!t){result='conflict';continue;}
    if(c.after.rows!==null){
     const rows=JSON.parse(c.after.rows);
     if(!noteSpecs(f).some(s=>s.obj===t.obj&&s.key===t.key)||rows.filter(r=>r.text.trim()).map(r=>r.text).join('\n')!==c.after.value)throw Error('備註與旗標資料不一致');
    }
    if(!same({value:own(t.obj,t.key),rows:own(t.obj,'careNoteRows_'+t.key)},c.before))result='conflict';
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

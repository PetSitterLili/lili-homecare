import assert from 'node:assert/strict';
import {fresh,noteSpecs,noteRows,writeNoteRows,noteCycle,noteActive,bindPendingNotes,activeFamily,expiredNoteWarnings,tasks,sourceKey,normalize,prepareLegacyBatch} from '../docs/workspace-model.mjs';


const f=fresh(),g=f.groups.cat;
g.pets=[{id:'p1',name:'測試',health:'觀察傷口',personality:'慢熟'}];
g.health={status:'需要處置',note:'點藥'};
g.food.dry={item:'乾糧',note:'一般備註'};
f.environment='關窗\n關電器';f.extra='一般補充';
const lookup=(obj,key)=>noteSpecs(f).find(s=>s.obj===obj&&s.key===key);
assert(tasks(f).map(x=>x.detail).join('|')==='觀察傷口|點藥|關窗\n關電器','legacy defaults and no routine');
let s=lookup(f,'environment');let old=noteRows(s);assert(old.length===1&&old[0].text==='關窗\n關電器','legacy unsplit');
const seg=(a,b)=>JSON.stringify({a,b,visits:[{service:'生活照顧',minutes:'30',start:'09:00',end:'10:00',note:''}]});
f.booking.segments=[seg('2026-12-01','2026-12-02')];
writeNoteRows(s,[{id:'a',text:'關窗',flag:true,temp:false,cycle:'',closed:false},{id:'b',text:'關電器',flag:false,temp:false,cycle:'',closed:false},{id:'c',text:'短期檢查',flag:true,temp:true,cycle:noteCycle(f),closed:false}]);
assert(tasks(f).some(t=>t.detail==='短期檢查')&&!tasks(f).some(t=>t.detail==='關電器'),'flag filtering');
const restored=normalize(JSON.parse(JSON.stringify(f)));
assert(tasks(restored).some(t=>t.detail==='短期檢查')&&activeFamily(restored).environment.includes('關電器'),'normalize and unflagged retained');
f.booking.segments=[seg('2027-01-01','2027-01-02')];
assert(!tasks(f).some(t=>t.detail==='短期檢查')&&!activeFamily(f).environment.includes('短期檢查'),'expired excluded');
assert(expiredNoteWarnings(f).length===1&&f.environment.includes('短期檢查'),'expired warning and history');
let rows=noteRows(s);rows[2].closed=true;writeNoteRows(s,rows);assert(expiredNoteWarnings(f).length===0,'closed resolved');
let med=lookup(g.health,'note');let medRows=noteRows(med);medRows[0].flag=false;writeNoteRows(med,medRows);assert(!tasks(f).some(t=>t.detail==='點藥')&&activeFamily(f).groups.cat.health.note==='點藥','default flag removable');
g.food.dry.enabled=false;let food=lookup(g.food.dry,'note');let foodRows=noteRows(food);foodRows[0].flag=true;writeNoteRows(food,foodRows);assert(!tasks(f).some(t=>t.detail==='一般備註'),'disabled food');
let pending=fresh();let ps=noteSpecs(pending).find(s=>s.key==='extra');writeNoteRows(ps,[{id:'p',text:'本期',flag:true,temp:true,cycle:'',closed:false}]);pending.booking.segments=[seg('2027-01-01','2027-01-01')];bindPendingNotes(pending);assert(noteRows(ps)[0].cycle===noteCycle(pending),'pending binds');
assert(sourceKey(f)!==sourceKey(restored),'source change');
console.log('11 note model checks passed');


{
const old=fresh();old.id='old-a';old.name='測試家庭 A';old.importSource='source-a';old.importOriginal='原始資料';old.booking={dates:'2024-01-01',quote:'old quote',services:['生活照顧']};
old.contact={phone:'0912345678',address:'測試地址'};
const packet={format:'lili-homecare-legacy-batch',version:1,families:[old]};
const batch=prepareLegacyBatch(packet,[]);
assert(batch.accepted.length===1&&batch.accepted[0].importReview===true,'new marked review');
assert(batch.accepted[0].booking.services.length===0&&!batch.accepted[0].booking.quote,'old booking not live');
assert(normalize(JSON.parse(JSON.stringify(batch.accepted[0]))).importOriginal==='原始資料','source retained');
assert(normalize(batch.accepted[0]).importReview,'review round trip');
assert(prepareLegacyBatch(packet,batch.accepted).skipped.length===1,'reimport skipped');
const same={...old,id:'old-b',importSource:'source-b',name:'其他名字'};
assert(prepareLegacyBatch({...packet,families:[same]},batch.accepted).accepted.length===0,'contact duplicate skipped');
assert(prepareLegacyBatch({...packet,families:[old,same]},[]).accepted.length===1,'within batch duplicate skipped');
let bad=false;try{prepareLegacyBatch({...packet,families:[{...old,importOriginal:''}]},[]);}catch{bad=true;}assert(bad,'invalid rejected');
const reviewed={...batch.accepted[0],importReview:false,importReviewedAt:'2026-11-26'};
assert(!normalize(reviewed).importReview&&normalize(reviewed).importReviewedAt==='2026-11-26','review completion persists');
console.log('9 import checks passed');
}

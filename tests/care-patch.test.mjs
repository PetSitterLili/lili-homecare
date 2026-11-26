import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,normalize} from '../docs/workspace-model.mjs';
import {applyCarePatch,inspectCarePatch} from '../docs/care-patch.mjs';

function fixture(){
 const f=fresh();
 f.name='Example';f.importSource='example-source';f.importReview=true;f.groups.cat.water.note='shelf';
 const value=v=>({value:v,rows:null});
 const changes=[{path:'cat/water/note',before:value('shelf'),after:value('')},{path:'cat/water/place',before:value(null),after:value('shelf')}];
 const packet={format:'lili-care-field-patch',version:1,families:[{id:f.id,importSource:f.importSource,sets:[{id:'water',label:'water',changes}]}]};
 return {f,packet,ids:new Set(['water'])};
}
test('moves related fields together, preserves other fields and receipts after reopening',()=>{
 const {f,packet,ids}=fixture();f.contact.name='updated';
 const {copy,count}=applyCarePatch(packet,f,ids);
 assert.equal(count,1);assert.equal(f.groups.cat.water.note,'shelf');assert.equal(copy.groups.cat.water.place,'shelf');assert.equal(copy.contact.name,'updated');
 const reopened=normalize(copy);reopened.groups.cat.water.note='shelf';delete reopened.groups.cat.water.place;
 assert.equal(inspectCarePatch(packet,[reopened])[0].sets[0].result,'done');assert.equal(applyCarePatch(packet,reopened,ids).count,0);
});
test('changed value, lifecycle, household, review or source skips the complete move',()=>{
 for(const change of [f=>{f.groups.cat.water.note='changed'},f=>{f.groups.cat.water.careNoteRows_note='[]'},f=>{f.id='other'},f=>{f.importSource='other'},f=>{delete f.importReview},f=>{f.archived=true}]){
  const {f,packet,ids}=fixture();change(f);assert.deepEqual(applyCarePatch(packet,f,ids),{count:0,copy:f});
 }
});
test('normal fields, flags and valid destinations are checked before writing',()=>{
 const {f,packet,ids}=fixture(),changes=packet.families[0].sets[0].changes;
 for(const path of ['__proto__/pet:oops/intro','cat/water/constructor','cat/water/source/spare','home/family/booking']){
  changes[1].path=path;assert.equal(applyCarePatch(packet,f,ids).count,0);
 }
 changes[1].path='cat/water/place';changes[1].after.rows='[]';assert.throws(()=>inspectCarePatch(packet,[f]));
});

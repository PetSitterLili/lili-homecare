import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveStore,digest} from '../docs/drive.mjs';
const id='fixture-only';
const original={id,name:'Sample',note:'one'};
const local={...original,note:'two'};

function fixture({remote=original,conditional=true,race=false,etag='"2"'}={}){
 const drive=new DriveStore();let state=structuredClone(remote),writes=0,probes=0;
 drive.load=async()=>({data:state,base:await digest(state),version:'12',etag});
 drive.request=async(path,options)=>{
  if(path.includes('/family/copy?'))return {id:'copy'};
  if(path.includes('/files/copy?uploadType')){
   probes++;if(conditional)throw Object.assign(Error('precondition'),{status:412});
   return {id:'copy'};
  }
  if(options.method==='PATCH'){
   if(race){state={...original,note:'remote edit'};throw Object.assign(Error('concurrent'),{status:412});}
   assert.equal(options.headers['If-Match'],etag);state=JSON.parse(await options.body.get('file').text());writes++;return {id:'family',version:'13'};
  }
  throw Error('unexpected '+path);
 };
 return {drive,stats:()=>({writes,probes,state})};
}
const base=await digest(original), ref={id:'family',version:'1',base};
test('metadata-only version change preserves safe edits',async()=>{const f=fixture();await f.drive.save(local,ref);assert.deepEqual(f.stats(),{writes:1,probes:1,state:local});});
test('different remote content stops before upload',async()=>{const f=fixture({remote:{...original,note:'third'}});await assert.rejects(f.drive.save(local,ref),/衝突/);assert.equal(f.stats().writes,0);});
test('racing remote change protected after preflight',async()=>{const f=fixture({race:true});await assert.rejects(f.drive.save(local,ref),/衝突/);assert.equal(f.stats().state.note,'remote edit');});
test('missing ETag and ignored condition both stop before original write',async()=>{for(const settings of [{etag:null},{conditional:false}]){const f=fixture(settings);await assert.rejects(f.drive.save(local,ref),/條件寫入/);assert.equal(f.stats().writes,0);}});
test('lost acknowledgement recovers without repeating upload',async()=>{const f=fixture({remote:local});assert.equal((await f.drive.save(local,ref)).id,'family');assert.equal(f.stats().writes,0);});

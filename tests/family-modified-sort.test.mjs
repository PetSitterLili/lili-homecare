import test from 'node:test';
import assert from 'node:assert/strict';
import {familyModifiedTime,sortFamilyDirectory} from '../docs/workspace-model.mjs';
test('recent modifications sort newest first, missing or invalid timestamps last, stable name tie break',()=>{
 const records=[{f:{name:'B',updatedAt:null}},{f:{name:'D',updatedAt:'2026-11-26T09:00:00Z'}},{f:{name:'C',updatedAt:'2026-11-26T18:00:00+08:00'}},{f:{name:'A',updatedAt:'invalid'}},{f:{name:'E',updatedAt:'2026-11-26T10:00:00Z'}}];
 assert.deepEqual(sortFamilyDirectory(records,'modified').map(r=>r.f.name),['C','E','D','A','B']);
 assert.equal(familyModifiedTime({updatedAt:null}),null);
 assert.equal(familyModifiedTime({updatedAt:'invalid'}),null);
 assert.deepEqual(records.map(r=>r.f.name),['B','D','C','A','E']);
});

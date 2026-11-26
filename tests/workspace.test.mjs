
import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,blanks,writeNoteRows,noteSpecs,filename,publicBlocks,warnings,tasks,sourceKey,normalize,migrate} from '../dist/workspace-model.mjs';
test('Taipei download date and representative household name',()=>{const f=fresh();f.name='姆姆家四貓';assert.equal(filename(f,new Date('2026-11-24T17:00:00Z')),'ㄌㄌ保姆｜1125姆姆家四貓照護計畫書.pdf');});
test('public PDF blocks exclude internal photos and legacy secrets',()=>{const f=fresh();f.photos=[{caption:'PHOTO SECRET',driveId:'PRIVATE PHOTO'}];f.legacy={secret:'LEGACY SECRET'};assert.doesNotMatch(JSON.stringify(publicBlocks(f)),/SECRET|PRIVATE/);});
test('free text fractional quantities remain intact',()=>{const f=fresh();f.groups.cat.food.dry={item:'乾糧',amount:'三分之一',unit:'杯'};assert.match(JSON.stringify(publicBlocks(f)),/三分之一杯/);});
test('cat forms never produce dog walking tasks',()=>{const f=fresh();f.groups.cat.walk.time='不能出現';f.groups.dog=blanks();f.groups.dog.walk.time='早晚散步';const spec=noteSpecs(f).find(s=>s.obj===f.groups.dog.walk&&s.key==='time');writeNoteRows(spec,[{id:'walk-time',text:spec.obj.time,flag:true,temp:false,cycle:'',closed:false}]);assert.ok(tasks(f).some(t=>t.id.startsWith('dog-walk|')));assert.ok(!tasks(f).some(t=>t.id.startsWith('cat-walk|')));});
test('companionship requires calming and toy information',()=>{const f=fresh();f.booking.services=['陪伴專案'];assert.ok(warnings(f).some(w=>w.includes('玩具')));f.groups.cat.play={likes:'慢慢互動',toys:'無玩具'};assert.ok(!warnings(f).some(w=>w.includes('玩具')));});
test('blank medical data stays unconfirmed',()=>{const f=fresh();assert.ok(warnings(f).some(w=>w.includes('健康')));f.groups.cat.health={status:'需要處置'};assert.ok(warnings(f).some(w=>w.includes('份量')));});
test('visit checks do not invalidate source while instructions do',()=>{const f=fresh(),key=sourceKey(f);f.runs.push({checks:{dry:true}});assert.equal(sourceKey(f),key);f.groups.cat.food.dry.amount='半';assert.notEqual(sourceKey(f),key);});
test('restore validation and old source retention',()=>{const f=fresh();assert.equal(normalize(f).schema,2);assert.throws(()=>normalize({...f,schema:3}));const old={id:'old-id',name:'舊家庭',photos:[],sections:{}};const migrated=migrate(old,'原有完整文字');assert.equal(migrated.id,'old-id');assert.deepEqual(migrated.legacy,old);assert.match(migrated.extra,/原有完整文字/);});

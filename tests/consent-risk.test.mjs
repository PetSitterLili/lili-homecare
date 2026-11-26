import assert from 'node:assert/strict';
import {fresh,normalize,publicBlocks,tasks,legacyConsentPatch} from '../docs/workspace-model.mjs';

const mk=(s,status='pending',note=s)=>{const f=fresh();f.importReview=true;f.importOriginal='【影像授權意願】\n'+s+'\n【住家網路WiFi】\n無';f.media={status,note};return f;};
assert(legacyConsentPatch(mk('可以，但需讓我看過發文內容')).status==='yes','conditional yes');
assert(legacyConsentPatch(mk('可以，但需讓我看過發文內容')).note==='但需讓我看過發文內容','keep condition');
assert(legacyConsentPatch(mk('願意','yes')).note==='','clean redundant yes');
assert(legacyConsentPatch(mk('可以','yes')).note==='','clean redundant consent');
assert(legacyConsentPatch(mk('可以，但不要拍到樓梯','yes')).note==='但不要拍到樓梯','keep restriction');
assert(legacyConsentPatch(mk('不可以','yes'))===null,'never overwrite explicit conflicting status');
assert(legacyConsentPatch(mk('拒絕（但白牆或是地板背景的是可以分享的）','no'))===null,'mixed no retained');
assert(legacyConsentPatch(mk('不確定'))===null,'ambiguous');
assert(legacyConsentPatch(mk('可以','pending','自行新增'))===null,'custom note protected');
let f=mk('可以');f.media.decisionEditedAt='now';assert(!legacyConsentPatch(f),'manual protected');f=mk('可以');f.importReviewedAt='now';assert(!legacyConsentPatch(f),'review protected');
f=mk('可以');f.media.careNoteRows_note=JSON.stringify([{id:'n',text:'可以',flag:true,temp:false,cycle:''}]);assert(!legacyConsentPatch(f),'flag protected');
f=mk('可以，但不要拍到樓梯');f.media.careNoteRows_note=JSON.stringify([{id:'n',text:f.media.note,flag:false,temp:false,cycle:''}]);const p=legacyConsentPatch(f);assert(JSON.parse(p.media.careNoteRows_note)[0].text==='但不要拍到樓梯','metadata retained');
f=mk('可以');f.clientRisk={status:'blacklist',note:'PRIVATE TEST'};assert(normalize(f).clientRisk.status==='blacklist','risk persist');assert(!JSON.stringify(publicBlocks(f)).includes('PRIVATE TEST'),'private excludes public blocks');assert(!JSON.stringify(tasks(f)).includes('PRIVATE TEST'),'private excludes tasks');
f.media.decisionEditedAt='now';assert(normalize(f).media.decisionEditedAt==='now','manual marker persisted');
assert(normalize(fresh()).clientRisk.status==='normal','normal default');

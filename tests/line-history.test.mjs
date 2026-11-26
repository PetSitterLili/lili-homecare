import assert from 'node:assert/strict';
import {fresh,normalize,publicBlocks,tasks,lineHistory,prepareLineHistory,applyLineHistory} from '../docs/workspace-model.mjs';
import {inquiryQuote} from '../docs/quote.mjs';

const f=fresh();f.importSource='test-source';f.name='測試家庭';f.booking.quote='original quote';f.booking.familyRates='original rates';f.clientRisk={status:'watch',note:'existing'};
const x={id:'line-20261126-1-2',date:'2026-11-26T11:00:00',kind:'週期報價',note:'not paid',source:'test',text:'30 分鐘 $400'};
const packet={format:'lili-line-history-patch',version:1,families:[{id:f.id,name:f.name,importSource:f.importSource,blacklist:true,entries:[x]}]};
const p=prepareLineHistory(packet,[f]);assert(p.accepted.length===1,'matched');
const n=applyLineHistory(f,p.accepted[0]);assert(n.booking.quote===f.booking.quote&&n.booking.familyRates===f.booking.familyRates,'no quote changes');
assert(n.clientRisk.status==='blacklist'&&n.clientRisk.note.includes('existing'),'risk retained');
assert(lineHistory(normalize(n)).length===1,'round trip');
assert(!JSON.stringify(publicBlocks(n)).includes(x.text)&&!JSON.stringify(tasks(n)).includes(x.text),'private');
assert(prepareLineHistory(packet,[n]).accepted.length===0,'idempotent');
assert(prepareLineHistory(packet,[{...f,importSource:'different'}]).accepted.length===0,'source mismatch');
assert(prepareLineHistory(packet,[{...f,archived:true}]).accepted.length===0,'archive skipped');
assert(!f.booking.lineQuoteHistory,'original untouched');
let bad=false;try{prepareLineHistory({...packet,families:[packet.families[0],packet.families[0]]},[f]);}catch{bad=true;}assert(bad,'duplicate rejected');
assert(inquiryQuote({c:1,d:0,km:'0',trips:'4',med:'no'}).options[0].total===1600,'total with known travel');
assert(inquiryQuote({c:1,d:0,trips:'4',med:'no'}).options[0].total===null,'unknown travel no external total');

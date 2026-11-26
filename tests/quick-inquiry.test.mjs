import assert from 'node:assert/strict';
import {inquiryQuote,defaultRates,legacyQuoteReference,oldBookingText,hasCurrentBooking,mixedPlan} from '../docs/quote.mjs';

const q=(c,d,more={})=>inquiryQuote({c,d,...more},defaultRates);
assert(q(3,0).options.map(x=>[x.fee,x.min]).flat().join(',')==='600,45,950,60','3 cats two plans');
assert(q(1,0).options[0].fee===400,'one cat');
assert(q(7,0).options[1].fee===1400,'7 cats');
assert(q(2,2).options[0].fee===1300&&q(2,2).options[0].min===75,'mixed');
assert(q(2,2,{walk:'no'}).options[0].fee===1300,'mixed no walk same');
assert(q(2,2,{walk:'long'}).options[0].reference,'mixed long reference');
assert(q(0,1,{walk:'yes'}).options[1].recommended,'dog walk');
assert(q(0,2,{walk:'no'}).options[0].fee===750,'dog life');
assert(!q(0,3).options.length&&q(0,3).message.includes('暫不承接'),'3 dogs');
assert(!q(6,1).options.length,'6 cats mixed');
assert(q(3,0,{km:'5.3',trips:'3'}).options[0].total===1950,'normal total');
assert(q(3,0).options[0].unit===null,'unknown travel');
assert(q(3,0,{km:'0'}).options[0].unit===600,'zero km');
assert(q(3,0,{km:'30.1'}).travelKnown===false,'over 30');
assert(q(3,0,{km:'5.31'}).error,'invalid km');
assert(q(0,0).error&&q(-1,2).error,'invalid counts');
assert(q(3,0,{med:'yes'}).options[0].fee===600&&q(3,0,{med:'yes'}).message.includes('藥品'),'med review');
assert(q(3,0).message.includes('特殊節慶'),'holiday disclosure');
const custom=JSON.parse(JSON.stringify(defaultRates));custom.cat[1][1]=777;assert(inquiryQuote({c:3,d:0},custom).options[0].fee===777,'current rates');
assert(q(0,1,{walk:'long',km:'5',trips:'3'}).options.every(x=>x.total===null),'long walk no full estimate');


{
 const v=inquiryQuote({c:3,d:0,km:'5.3'},defaultRates);
 assert(v.message.includes('NT$650')&&v.message.includes('NT$1,000'),'inclusive customer quote');
 assert(!v.message.includes('NT$600')&&!v.message.includes('NT$950')&&!v.message.includes('NT$50／'),'no base or travel breakout');
 assert(!inquiryQuote({c:3,d:0},defaultRates).message.includes('NT$'),'unknown travel no numeric quote');
 assert(inquiryQuote({c:0,d:1,walk:'yes',km:'5.3'},defaultRates).message.includes('NT$650'),'dog recommended');
 assert(!inquiryQuote({c:0,d:1,walk:'long',km:'5.3'},defaultRates).message.includes('NT$'),'long walk no misleading total');
 const a=legacyQuoteReference(3,0,'生活照顧',30,defaultRates);assert(a.nearest.min===45&&a.basis.fee===600&&a.estimate===400,'old 30 min reference only');
 const b=legacyQuoteReference(2,2,mixedPlan,60,defaultRates);assert(b.nearest.min===75&&b.estimate===1040,'mixed 60 reference');
 assert(legacyQuoteReference(6,1,mixedPlan,60,defaultRates)===null,'manual mixed not fabricated');
 assert(oldBookingText({importOriginal:'【本次預約方案與日期時間】\n30分鐘\n【其他】\n無'})==='30分鐘','legacy read');
 assert(!hasCurrentBooking([{b:'2026-11-25'}],'2026-11-26')&&hasCurrentBooking([{b:'2026-11-26'}],'2026-11-26'),'past route');
}

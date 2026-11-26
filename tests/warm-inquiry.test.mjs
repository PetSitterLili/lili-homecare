import assert from 'node:assert/strict';
import {inquiryQuote} from '../docs/quote.mjs';

const a=inquiryQuote({c:1,d:0,km:'5.3',med:'no',trips:'2'});
assert(a.options[0].unit===450&&a.options[1].unit===700,'unchanged unit');
assert(a.message.includes('爸爸／媽媽您好呀')&&a.message.includes('① 生活照顧方案')&&a.message.includes('② 陪伴專案'),'warm names');
assert(a.message.includes('包含車程費用')&&a.message.includes('免費家訪')&&a.message.includes('特殊節慶'),'conditions');
assert(!inquiryQuote({c:1,d:0,med:'no'}).message.includes('NT$'),'unknown distance no price');
assert(inquiryQuote({c:1,d:3,km:'3',med:'no'}).message.includes('暫不承接'),'three dog rule');
assert(inquiryQuote({c:1,d:1,km:'3',med:'no'}).options.length===1,'mixed');

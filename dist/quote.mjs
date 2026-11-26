export const defaultRates={"cat":[[2,400,30,650,60],[6,600,45,950,60],[999,800,60,1400,90]],"dog":[[500,30,600,40],[750,40,1000,60]],"mixed":[[900,50,1300,75],[900,50,1300,75],[1100,60,1500,90],[1200,60,1600,90],[1300,60,1700,90]],"holiday":[{"name":"2027 春節","active":true,"a":"2027-02-01","b":"2027-02-03","fee":200},{"name":"2027 春節","active":true,"a":"2027-02-04","b":"2027-02-12","fee":300}]};
export const catPlanNames=Object.freeze({'生活照顧':'生活照顧方案','陪伴專案':'陪伴專案'});
// Display-only compatibility for the old combined plan label; never rewrite a saved quote.
export function displayQuoteLabel(row){return String(row.label??'').replace(/(?:喵寶|貓咪)?生活照顧(?:與|及|＋|\+|和)?陪伴專案/g,catPlanNames['陪伴專案']).replace(/喵寶陪伴專案/g,catPlanNames['陪伴專案']);}
export const mixedPlan = '犬喵同住家庭方案';
export const mixedCare = '整合餐食飲水與食器清洗、貓砂與尿墊整理、基礎環境整理和個別健康觀察。可依需要安排犬寶短程散步與返家清潔；無散步需求時，可視情況不加價安排更深入的互動與陪伴。較長時間的散步另行報價。';
export function mixedService(service) {
 return [mixedPlan, '生活照顧', '照顧＋散步', '陪伴專案'].includes(service);
}
export function days(a,b){return Math.max(0,Math.round((Date.parse(b)-Date.parse(a))/86400000)+1)}
export function travel(k){return !Number.isFinite(k)||k<0||k>30?null:k<=5?0:k<=7?50:k<=10?100:k<=15?250:k<=20?450:k<=25?700:1000}
export function rate(c,d,s,r){if(d>2||c+d===0)return null;if(c&&d){if(c>5||!mixedService(s))return null;const x=r.mixed[c-1];return {fee:x[(d-1)*2],min:x[(d-1)*2+1]};}if(d){const x=r.dog[d-1];if(!["生活照顧","照顧＋散步"].includes(s))return null;const i=s==="照顧＋散步"?2:0;return {fee:x[i],min:x[i+1]};}if(!["生活照顧","陪伴專案"].includes(s))return null;const x=r.cat.find(x=>c<=x[0]);if(!x)return null;const i=s==="陪伴專案"?3:1;return {fee:x[i],min:x[i+1]};}
export function holidayRows(rs,r){const out=[];for(const h of r.holiday){if(!h.active)continue;let n=0;const spans=[];for(const s of rs){const a=s.a>h.a?s.a:h.a,b=s.b<h.b?s.b:h.b;if(a<=b){n+=days(a,b)*s.visits.length;spans.push(a===b?a:a+'～'+b);}}if(n)out.push({...h,spans,n,total:n*h.fee});}return out}

export function readRates(s){const r=JSON.parse(s);for(const k of ['cat','dog','mixed'])if(!Array.isArray(r[k])||r[k].length!==defaultRates[k].length||r[k].some((x,i)=>!Array.isArray(x)||x.length!==defaultRates[k][i].length||x.some(n=>!Number.isSafeInteger(n)||n<=0)))throw Error('費率格式錯誤');if(r.cat.some((x,i)=>x[0]!==defaultRates.cat[i][0]))throw Error('純貓級距不可變更');if(!Array.isArray(r.holiday)||r.holiday.some(h=>typeof h.name!=='string'||!h.name.trim()||typeof h.active!=='boolean'||!(/^\d{4}-\d{2}-\d{2}$/).test(h.a)||!(/^\d{4}-\d{2}-\d{2}$/).test(h.b)||h.a>h.b||!Number.isSafeInteger(h.fee)||h.fee<0))throw Error('檔期格式錯誤');const a=r.holiday.filter(h=>h.active);if(a.some((h,i)=>a.some((x,j)=>j>i&&h.a<=x.b&&x.a<=h.b)))throw Error('啟用檔期不可重疊');return r;}
export const quoteKey=f=>JSON.stringify([f.booking.segments||[],f.groups.cat?.pets.length||0,f.groups.dog?.pets.length||0]);
export function savedQuote(f){try{const q=JSON.parse(f.booking.quote||'null');return q&&Array.isArray(q.rows)&&Array.isArray(q.holidays)&&Number.isFinite(q.total)?q:null;}catch{return null;}}
export const money=n=>'NT$'+n.toLocaleString('en-US');
export function quoteLines(f){const q=savedQuote(f);if(!q||q.key!==quoteKey(f))return [];return [...q.rows.map(x=>(f.groups.cat&&f.groups.dog&&mixedService(x.k?.split('|')[0])?x.min+' 分鐘'+mixedPlan:displayQuoteLabel(x))+'｜'+money(x.unit)+' × '+x.n+' 趟 = '+money(x.unit*x.n)),...(q.adjust?[q.adjust<0?'優惠折抵：'+money(-q.adjust):'額外服務費：'+money(q.adjust)]:[]),...(!q.exclude?q.holidays.map(h=>h.name+' '+(h.spans?.join('、')||h.a+'～'+h.b)+'｜'+money(h.fee)+' × '+h.n+' 趟 = '+money(h.total)):[]),'本次照護費用合計：'+money(q.total),'以上費用已含車程費用。'];}
export function overtimeText(b){return b.overtime===true&&Number(b.overtimeFee)>0?'每趟照護皆以完成雙方原先約定的照護內容為原則。若因毛寶突發嘔吐、環境需額外清整、健康異常或其他臨時狀況，而有必要延長照護時間，將視現場情況與家長聯繫，並依每 15 分鐘 NT$'+Number(b.overtimeFee).toLocaleString('en-US')+' 計收加時照護費用。如遇緊急狀況，將優先以毛寶的健康與安全為考量。':'';}

export function inquiryQuote(input,r=defaultRates){
 const c=Number(input.c),d=Number(input.d),walk=input.walk||'unknown',med=input.med||'unknown';
 const result={options:[],warnings:[],message:'',error:''};
 if(!Number.isSafeInteger(c)||!Number.isSafeInteger(d)||c<0||d<0||c+d===0){result.error='請輸入正確的喵寶、犬寶數量（至少一位）。';return result;}
 const kmRaw=String(input.km??'').trim(),km=Number(kmRaw),tripsRaw=String(input.trips??'').trim(),trips=Number(tripsRaw);
 if(kmRaw&&(!Number.isFinite(km)||km<0||Math.abs(km*10-Math.round(km*10))>1e-8)){result.error='單程公里請填非負數，最多一位小數。';return result;}
 if(tripsRaw&&(!Number.isSafeInteger(trips)||trips<1||trips>10000)){result.error='預估趟數請填 1～10000 的整數。';return result;}
 const tv=kmRaw?travel(km):null;
 result.travel=tv;result.travelKnown=!!kmRaw&&tv!==null;
 const base='餐食飲水、食器清洗、如廁清潔、基本健康觀察及環境整理。';
 const add=(s,title,detail,recommended=false,reference=false)=>{
  const x=rate(c,d,s,r);if(!x)return;
  result.options.push({service:s,title,detail,recommended,reference,fee:x.fee,min:x.min,unit:result.travelKnown?x.fee+tv:null,total:result.travelKnown&&tripsRaw&&!reference?(x.fee+tv)*trips:null});
 };
 if(c&&d){
  add(mixedPlan,mixedPlan,mixedCare,walk!=='long',walk==='long');
  if(walk==='long')result.warnings.push('較長時間散步須個別評估與報價；所列僅為標準整合照護參考。');
 }else if(d){
  add('生活照顧','犬寶生活照顧方案',base+' 不含散步。',walk==='no',walk==='yes'||walk==='long');
  add('照顧＋散步','犬寶照顧＋散步方案',base+' 包含散步及返家基本清潔。',walk==='yes',walk==='long');
  if(walk==='long')result.warnings.push('較長時間散步須先確認實際需求，以上非長時間散步正式報價。');
 }else{
  add('生活照顧',catPlanNames['生活照顧'],base);
  add('陪伴專案',catPlanNames['陪伴專案'],'包含生活照顧方案的完整內容，並增加深度互動與陪伴時間，依毛寶意願安排遊戲、安撫、梳毛及眼鼻分泌物清潔等。簡易點藥或其他個別健康照護依事先約定，相關加購費用另行確認。');
 }
 if(!result.options.length)result.warnings.push(d>=3?'目前三位犬寶（含）以上的家庭暫不承接，謝謝您的理解。':'此家庭規模須個別評估承接與報價。');
 if(med==='yes')result.warnings.push('有醫囑／餵藥需求，請提供對象、藥品、份量、頻率及操作方式，確認能否承接及是否需調整時間與報價。');
 if(med==='unknown')result.warnings.push('如有餵藥或特殊健康照護需求，請事先告知。');
 if(kmRaw&&tv===null)result.warnings.push('單程 30.1 公里以上，車程費用另行評估。');
 const visible=result.options.filter(o=>!o.reference);
 const kids=[c?c+' 位喵寶小朋友':'',d?d+' 位犬寶小朋友':''].filter(Boolean).join('、');
 const lines=['爸爸／媽媽您好呀～ 🐾','目前家中有 '+kids+'，'+(visible.length>1?'可以先參考我幫您整理的以下兩個方案唷！':visible.length===1?'先提供我幫您整理的照護方案：':'這個家庭的照護需求需要先進一步確認唷。')];
 for(const [i,o] of visible.entries()){
  lines.push('',(visible.length>1?['① ','② '][i]||'':'')+o.title+'｜'+o.min+' 分鐘'+(o.unit!==null?'・'+money(o.unit)+'／趟':''),'照護內容：'+o.detail);
  if(o.total!==null)lines.push('預估 '+trips+' 趟共 '+money(o.total));
 }
 if(visible.length)lines.push('',result.travelKnown?'以上費用都已經幫您包含車程費用囉！':kmRaw?'這個距離需要再評估一下，確認後會提供含車程費用的完整報價唷。':'再麻煩您提供服務地址或所在區域，我會確認距離後，將車程費用一併納入報價唷！');
 if(result.warnings.length)lines.push('',...result.warnings);
 lines.push('','以上是常態檔期的初步線上報價。實際照護時間、家中動線與照護流程等細節，我們會在免費家訪時再一起確認，讓照護安排更符合孩子們的需求。','如果詢問的日期落在特殊節慶或假期，也會再幫您確認該檔期的費用唷！🤍');
 result.message=lines.join('\n');return result;
}

export function legacyQuoteReference(c,d,service,minutes,r=defaultRates){
 const m=Number(minutes);
 if(!Number.isSafeInteger(m)||m<1||m>720)return null;
 const options=inquiryQuote({c,d,med:'no'},r).options;
 if(!options.length)return null;
 const same=options.find(o=>o.service===service);
 const nearest=[...options].sort((a,b)=>Math.abs(a.min-m)-Math.abs(b.min-m)||(same===a?-1:same===b?1:0)||a.min-b.min)[0];
 const basis=same||nearest;
 return {nearest,basis,estimate:Math.round(basis.fee*m/basis.min),hourly:Math.round(basis.fee*60/basis.min),sameService:!!same};
}
export function oldBookingText(f){
 const s=typeof f.importOriginal==='string'?f.importOriginal:'';
 const m=s.match(/【本次預約方案與日期時間】\s*([\s\S]*?)(?=\n【|$)/);
 return m?m[1].trim():'';
}
export function hasCurrentBooking(rs,today){return rs.some(s=>s.b>=today);}


export const VERSION=2;
export const blanks=()=>({pets:[],food:{dry:{},wet:{},snack:{}},water:{},wash:{},toilet:{},play:{},walk:{},health:{}});
export function fresh(){return {schema:2,id:crypto.randomUUID(),name:'',contact:{},booking:{services:[]},media:{status:'pending',note:''},entry:{},environment:'',extra:'',groups:{cat:blanks()},photos:[],runs:[],updatedAt:null};}
export const fields={
dry:[['item','飼料品項'],['amount','份量'],['unit','單位'],['location','備品位置'],['leftover','剩食處理'],['note','特殊交代／個別差異']],
wet:[['item','罐頭／餐包／鮮食品項'],['amount','份量'],['unit','單位'],['water','加水方式'],['location','備品位置'],['leftover','剩食處理'],['note','特殊交代／個別差異']],
snack:[['item','可給的零食'],['amount','份量'],['unit','單位'],['location','備品位置'],['note','禁忌／特殊交代']],
water:[['place','水碗／飲水機數量與位置'],['source','水源與備水位置'],['care','換水／補水方式'],['note','特殊交代']],
wash:[['sponge','菜瓜布'],['spongePlace','辨識與位置'],['soap','寵物洗碗精'],['soapPlace','辨識與位置'],['note','洗滌位置／特殊交代']],
toilet:[['place','砂盆／尿墊數量與位置'],['spare','備品位置'],['waste','廢棄物處理'],['usual','平常如廁狀況'],['note','特殊交代']],
play:[['likes','安撫方式／互動喜好'],['toys','玩具與位置'],['note','個別差異／注意事項']],
walk:[['time','時間／路線'],['tools','牽繩、胸背與便袋位置'],['note','安全與雨天交代'],['returnNote','返家用品位置／特殊交代']],
health:[['status','健康與處置確認'],['note','對象、藥品、份量、時段與操作／觀察事項']]
};
export const titles={dry:'乾乾',wet:'濕食',snack:'零食',water:'飲水',wash:'洗滌',toilet:'如廁與清潔',play:'陪伴與互動',walk:'散步與返家整理',health:'醫療與健康'};
export function day(d=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return Object.fromEntries(p.map(x=>[x.type,x.value]));}
export function filename(f,d=new Date()){const p=day(d);return ('ㄌㄌ保姆｜'+p.month+p.day+(f.name||'未命名家庭')+'照護計畫書.pdf').replace(/[\\/:*?"<>]/g,'_');}
export function mediaLabel(f){return f.media.status==='yes'?'我願意分享':f.media.status==='no'?'不對外分享':'影像意願待確認';}
export function warnings(f){const w=[];if(!f.name.trim())w.push('家庭名稱尚未填寫');if(!f.booking.dates)w.push('本次預約日期尚未填寫');if(!f.contact.phone)w.push('家長聯絡電話尚未填寫');if(!f.contact.address)w.push('服務地址尚未填寫');if(f.media.status==='pending')w.push('影像分享意願尚未確認');for(const [kind,g] of Object.entries(f.groups)){const name=kind==='dog'?'狗狗':'貓咪';if(!g.pets.length||g.pets.some(p=>!p.name))w.push(name+'的毛寶姓名尚未填完整');if(!g.health.status)w.push(name+'的健康／醫療需求尚未確認');if(f.booking.services.includes('陪伴專案')&&(!g.play.likes||!g.play.toys))w.push(name+'：已選陪伴專案，請補問安撫方式、玩具與位置（也可明確填無玩具）');if(g.health.status==='需要處置'&&!g.health.note)w.push(name+'：需要處置，請補對象、品項、份量與時段');}return w;}
function lines(o,defs){return defs.filter(([k])=>typeof o[k]==='string'&&o[k].trim()).map(([k,l])=>l+'：'+o[k].trim());}
export function careBlocks(f){const blocks=[];for(const [kind,g]of Object.entries(f.groups)){const sp=kind==='dog'?'狗狗':'貓咪';for(const type of ['dry','wet','snack','water','wash','toilet','play','walk','health']){if(type==='walk'&&kind!=='dog')continue;const o=g.food[type]||g[type];if(o.enabled===false){blocks.push({id:kind+'-'+type,title:sp+'｜'+titles[type],lines:['本次不提供']});continue;}let detail=lines(o,fields[type].filter(([k])=>!['amount','unit'].includes(k)));if(o.amount||o.unit)detail.splice(Math.min(1,detail.length),0,'份量：'+(o.amount||'')+(o.unit||''));if(type==='dry'&&o.mix)detail.push('混糧：'+[o.mixItem,o.mixAmount].filter(Boolean).join('，'));if(type==='walk'&&o.parts?.length)detail.push('返家整理：'+o.parts.join('、'));if(detail.length)blocks.push({id:kind+'-'+type,title:sp+'｜'+titles[type],lines:detail});}}return blocks;}
export function publicBlocks(f){return [
{title:'本次預約',lines:lines(f.booking,[['dates','日期'],['times','每日次數／時段']]).concat(f.booking.services.length?['方案：'+f.booking.services.join('、')]:[])},
{title:'家長與聯絡資訊',lines:lines(f.contact,[['name','家長稱呼'],['phone','電話'],['emergency','緊急聯絡'],['address','服務地址']])},
...Object.entries(f.groups).map(([kind,g])=>({title:(kind==='dog'?'狗狗':'貓咪')+'的小個性與相處默契',lines:g.pets.flatMap(p=>[p.name||'姓名待確認',...lines(p,[['identity','辨識資料'],['personality','個性與禁忌'],['area','活動／躲藏位置']])])})),
...careBlocks(f),
{title:'進出與門鎖安全',lines:lines(f.entry,[['pickup','鑰匙拿取'],['door','門鎖操作／防逃脫'],['return','鑰匙歸還'],['wifi','WiFi']])},
{title:'門窗、電器與其他任務',lines:[f.environment,f.extra].filter(Boolean)}
].filter(b=>b.lines.length);}
export function tasks(f){return [
...careBlocks(f).filter(b=>b.id.split('-').slice(1).join('-')!=='health'||b.lines.some(l=>!l.includes('目前無需處置'))).filter(b=>b.lines[0]!=='本次不提供').map(b=>({id:b.id,title:b.title,detail:b.lines.join('\n')})),
...(f.entry.door?[{id:'door',title:'進出與門鎖安全',detail:f.entry.door}]:[]),
...(f.environment?[{id:'environment',title:'離開前門窗與電器確認',detail:f.environment}]:[]),
...(f.extra?[{id:'extra',title:'其他交代',detail:f.extra}]:[])
];}
export function sourceKey(f){return JSON.stringify({contact:f.contact,booking:f.booking,groups:f.groups,entry:f.entry,environment:f.environment,extra:f.extra,media:f.media});}
export function normalize(raw){if(raw?.schema!==2||typeof raw.id!=='string'||typeof raw.name!=='string'||!raw.groups||!Array.isArray(raw.photos)||!Array.isArray(raw.runs)||raw.photos.length>1000||raw.runs.length>1000)throw Error('家庭資料格式不正確');const f=fresh();f.id=raw.id;f.name=raw.name;const safeObj=o=>{const result={};for(const[k,v]of Object.entries(o||{})){if(['__proto__','constructor','prototype'].includes(k))continue;if(typeof v==='string'||typeof v==='boolean'||v===null||Array.isArray(v)&&v.every(x=>typeof x==='string'))result[k]=v;}return result;};f.contact=safeObj(raw.contact);f.booking=safeObj(raw.booking);f.booking.services=Array.isArray(f.booking.services)?f.booking.services:[];f.media={status:['yes','no','pending'].includes(raw.media?.status)?raw.media.status:'pending',note:typeof raw.media?.note==='string'?raw.media.note:''};f.entry=safeObj(raw.entry);f.environment=String(raw.environment||'');f.extra=String(raw.extra||'');f.updatedAt=typeof raw.updatedAt==='string'?raw.updatedAt:null;f.groups={};for(const kind of ['cat','dog'])if(raw.groups[kind]){const g=blanks(),src=raw.groups[kind];for(const type of Object.keys(g)){if(type==='pets'){g.pets=(Array.isArray(src.pets)?src.pets:[]).slice(0,100).map(safeObj);}else if(type==='food'){for(const t of ['dry','wet','snack'])g.food[t]=safeObj(src.food?.[t]);}else g[type]=safeObj(src[type]);}f.groups[kind]=g;}if(!Object.keys(f.groups).length)throw Error('缺少貓狗資料');f.photos=raw.photos.map(p=>{if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.caption!=='string'||!['image/jpeg','image/png','image/webp'].includes(p.mime)||typeof p.thumb!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(p.thumb)||!Number.isFinite(p.size)||p.size<0)throw Error('照片格式不正確');return {id:p.id,name:p.name,caption:p.caption,mime:p.mime,thumb:p.thumb,size:p.size,...(typeof p.driveId==='string'?{driveId:p.driveId}:{})};});f.runs=raw.runs.map(r=>({id:String(r.id||''),label:String(r.label||''),source:String(r.source||''),tasks:(Array.isArray(r.tasks)?r.tasks:[]).map(t=>({id:String(t.id||''),title:String(t.title||''),detail:String(t.detail||'')})),checks:safeObj(r.checks),createdAt:String(r.createdAt||'')}));if(raw.legacy)f.legacy=raw.legacy;return f;}
export function migrate(old,oldText){const f=fresh();f.id=old.id;f.name=old.name;f.updatedAt=old.updatedAt;f.photos=old.photos||[];f.legacy=old;f.extra='舊版資料完整保留，請確認後逐步整理到新欄位。\n\n'+oldText;return f;}


export const sections = [
 {id:'pets',title:'毛寶與相處方式',hint:'每位孩子的辨識、個性與需要注意的地方。',fields:[['names','孩子姓名'],['identity','花色、年齡與辨識特徵'],['area','活動與躲藏位置'],['approach','互動方式','select',['依孩子步調','可主動互動','以減壓照護為主']]],note:'個別孩子的差異與相處提醒'},
 {id:'food',title:'飲食照護',hint:'先填共用流程，個別孩子不同的地方寫在下方。',repeat:true,fields:[['kind','食物類型','select',['乾糧','罐頭／餐包','鮮食／生食','零食','其他']],['item','品項／口味'],['location','食物放置位置'],['amount','份量'],['unit','單位'],['measure','份量補充（例如薄薄一層、加到刻度線）'],['time','給食時機','select',['每次到府','早上','晚上','離開前','指定日期／其他']],['tool','量匙／餐具及位置'],['bowls','餐碗數量、位置與對象'],['water','加水方式與份量'],['supplement','混入的保健品與份量'],['leftover','碗內剩食','select',['清掉換新','留到下一趟整理','移出洗碗後放回','沿用並補新糧','集中處理','其他']],['leftoverNote','剩食補充／指定去向'],['opened','開封後未盛出的食物','select',['冷藏保存','用完即丟','其他']],['openedNote','容器、保存位置與下次處理'],['cleanup','清洗、擦乾與歸位']],note:'個別差異、操作順序與特殊做法'},
 {id:'water',title:'飲水照護',hint:'不同位置或不同設備可以新增一組。',repeat:true,fields:[['type','飲水設備','select',['一般水碗','自動飲水機','飲水瓶','其他']],['count','數量'],['location','放置位置／對象'],['source','水源與位置'],['level','加水量／水位'],['clean','處理方式','select',['每次換洗','補水即可','指定日期清洗','依狀況處理']],['spare','備水、濾芯與備品位置']],note:'設備操作、拆洗與特殊補水方法'},
 {id:'cleaning',title:'清洗用品與收尾',fields:[['place','清洗位置'],['sponge','菜瓜布辨識與位置'],['soap','洗碗精辨識與位置'],['dry','晾乾／擦乾與歸位'],['waste','垃圾、空罐與廢水去處']],note:'清洗限制與收尾提醒'},
 {id:'toilet',title:'如廁與環境清潔',repeat:true,fields:[['type','設備','select',['一般砂盆','自動貓砂機','尿墊／便盆','戶外如廁','其他']],['count','數量'],['location','位置／使用對象'],['spare','貓砂／尿墊備品位置'],['tools','清潔工具與位置'],['refill','補充方式','select',['不足時補充','不需補充','整盆換新','其他']],['waste','廢棄物處理'],['usual','平常排便、排尿狀況']],note:'特殊清理步驟、周遭巡查與個別差異'},
 {id:'health',title:'醫療與健康',repeat:true,fields:[['pet','照護對象'],['status','目前健康狀況'],['task','本次處置','select',['無需處置','口服藥','外用／眼藥','保健品','日常整理','觀察即可','其他']],['item','藥品／用品名稱'],['location','放置位置'],['amount','份量'],['unit','單位'],['time','時段、頻率與指定日期']],note:'操作步驟、配合方式、需觀察的狀況與待確認事項'},
 {id:'play',title:'陪伴與互動',fields:[['toys','玩具及位置'],['groom','梳子及位置'],['likes','喜歡的互動'],['avoid','不喜歡／不能做的事']],note:'個別孩子的步調、安撫方式與停止時機'},
 {id:'walk',title:'外出散步',fields:[['need','是否需要','select',['不需要','需要']],['time','時間與次數'],['route','路線／如廁地點'],['tools','胸背、牽繩、便袋與位置'],['return','返家整理與物品歸位']],note:'雨天安排、沿途反應與安全提醒'},
 {id:'entry',title:'進出與鑰匙',fields:[['pickup','取鑰匙方式'],['doors','進門方式與門鎖操作'],['exit','離開時關門與上鎖'],['return','最後一次歸還方式']],note:'防逃脫、分區門與進出特殊注意'},
 {id:'environment',title:'門窗與電器',repeat:true,fields:[['item','門窗／設備','select',['燈','冷氣','電扇','空氣清淨機','除濕機','門','窗','其他']],['location','位置'],['arrival','到達時','select',['維持原樣','開啟','關閉','檢查狀態','其他']],['leave','離開時','select',['維持原樣','開啟','關閉','定時','其他']],['timer','定時／設定補充']],note:'早晚、天氣與指定日期不同的安排'},
 {id:'extra',title:'其他任務與本次補充',fields:[['period','本次服務日期與時段'],['tasks','額外任務與備品位置']],note:'本次才適用的變更、待確認與其他交代'}
];
export function newFamily(name=''){return {schema:1,id:crypto.randomUUID(),name,updatedAt:null,sections:Object.fromEntries(sections.map(s=>[s.id,[{values:{},note:''}]])),photos:[]};}
export function makeText(f){
 const blocks=[`ㄌㄌ保姆｜照護計畫書`,f.name];
 for(const s of sections){const parts=[];for(const row of f.sections[s.id]||[]){const v=row.values||{},lines=[];
 if(s.id==='food'){
  if(v.kind||v.item)lines.push([v.kind,v.item].filter(Boolean).join('：'));
  if(v.location)lines.push(`食物放在${v.location}。`);
  if(v.amount||v.unit)lines.push(`份量：${v.amount||''}${v.unit||''}。`);
 } else if(s.id==='health') {if(v.amount||v.unit)lines.push(`份量：${v.amount||''}${v.unit||''}。`);}
 for(const [key,label] of s.fields){if((s.id==='food'&&['kind','item','location','amount','unit'].includes(key))||(s.id==='health'&&['amount','unit'].includes(key)))continue;const val=v[key];if(typeof val==='string'&&val.trim())lines.push(`${label}：${val.trim()}`);}
 if(row.note?.trim())lines.push(row.note.trim());if(lines.length)parts.push(lines.join('\n'));}
 if(parts.length)blocks.push(`【${s.title}】\n${parts.join('\n\n')}`);}
 return blocks.filter(Boolean).join('\n\n');
}
export function validateFamily(f){
 if(!f||f.schema!==1||typeof f.id!=='string'||typeof f.name!=='string'||!f.sections||!Array.isArray(f.photos))throw Error('這不是可還原的家庭照護資料。');
 const clean=newFamily(f.name);clean.id=f.id;clean.updatedAt=typeof f.updatedAt==='string'?f.updatedAt:null;if(typeof f.outputDraft==='string')clean.outputDraft=f.outputDraft;
 for(const s of sections){const rows=f.sections[s.id];if(!Array.isArray(rows)||rows.length>200)throw Error('照護欄位格式有誤。');clean.sections[s.id]=rows.map(r=>{if(!r||!r.values||typeof r.note!=='string')throw Error('照護內容格式有誤。');const values={};for(const [k] of s.fields){if(r.values[k]!==undefined){if(typeof r.values[k]!=='string')throw Error('欄位必須是文字。');values[k]=r.values[k];}}return {values,note:r.note};});}
 if(f.photos.length>1000)throw Error('照片數量過多。');clean.photos=f.photos.map(p=>{if(!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.caption!=='string'||!['image/jpeg','image/png','image/webp'].includes(p.mime)||typeof p.thumb!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(p.thumb)||typeof p.size!=='number'||p.size<0)throw Error('照片格式有誤。');return {id:p.id,name:p.name,caption:p.caption,mime:p.mime,thumb:p.thumb,size:p.size,...(typeof p.driveId==='string'?{driveId:p.driveId}:{})};});return clean;
}

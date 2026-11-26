import {quoteLines,overtimeText} from './quote.mjs?v=2.0.1126.14';
import {activeFamily,filename,careBlocks,serviceName,bookingLines} from './workspace-model.mjs?v=2.0.1126.14';
import {brandDefaults,links,palette} from './brand.mjs?v=2.0.1126.14';
const W=794,H=1123,M=38,B=1060,inner=W-2*M;
const clean=values=>values.filter(x=>typeof x==='string'&&x.trim());
const sentence=value=>/[。！？.!?]$/.test(value.trim())?value.trim():value.trim()+'。';
const petStory=p=>{
 const identity=clean([p.age,p.identity,p.sex]).join('');
 return clean([identity,p.neuter,p.health,p.personality,p.likes,p.avoid,p.area&&'常在'+p.area,p.intro]).map(sentence).join('');
};
// Keep free-form directions intact. Join only fields with a known relationship.
function together(...parts){
 return clean(parts).map(s=>s.trim()).reduce((text,next)=>
  text+(text&&!/[。！？.!?，、；：\n]$/.test(text)?'，':'')+next,'');
}
const routineWaste=value=>/^(?:每趟|每次|每次到府)?(?:由)?(?:ㄌㄌ|保姆)(?:會)?(?:將垃圾|把垃圾)?帶走(?:垃圾)?[。！.]?$/.test(value?.trim());
function careText(kind,o){
 if(o.enabled===false)return ['本次不提供'];
 const detail=clean([o.note])[0];
 const mark=(phrase)=>phrase&&'• '+phrase;
 const location=value=>value&&'📍備品在'+value;
 let lines=[];
 switch(kind){
  case 'dry':case 'wet':case 'snack':{
   const portion=clean([o.amount,o.unit]).join('');
   lines=[together(o.item,portion&&'每次給予'+portion),o.water,location(o.location)];
   if(o.leftover)lines.push(o.leftover==='移出洗碗後放回'?'如有剩食，先移出，清洗碗具後再放回':'如有剩食，'+o.leftover);
   if(detail)lines.push(kind==='snack'?mark(detail):detail);
   if(o.mix){const ratio=together(o.mixItem,o.mixAmount);lines.push(ratio?'混糧搭配為'+ratio:'需要混糧');}
   break;
  }
  case 'water':{
   const source=o.source&&(/^(水源|備水|使用|取用|從|請|用|不|勿|先|以)/.test(o.source)?o.source:'水源為'+o.source);
   lines=[o.place,o.source?.trim()==='客廳水桶'&&o.care?.trim()==='換水'?'使用客廳水桶的水進行換水':(o.source&&o.care?.trim()==='換水'&&!/^(水源|備水|使用|取用|從|請|用|不|勿|先|以)/.test(o.source)?'使用'+o.source+'的水進行換水':together(source,o.care)),detail];break;
  }
  case 'toilet':
   lines=[together(o.place,o.spare&&'備品在'+o.spare),o.waste&&!routineWaste(o.waste)&&'• 垃圾處理　'+o.waste,
    o.usual&&'平常如廁情形為'+o.usual,detail];break;
  case 'play':
   lines=[together(o.likes,o.toys&&(/玩具|球|棒|繩|娃娃/.test(o.toys)?o.toys:'玩具安排為'+o.toys)),detail];break;
  case 'walk':
   lines=[o.time,o.tools&&'• 散步用品　'+o.tools,mark(detail),
    together(o.parts?.length&&'返家後需整理'+o.parts.join('、'),o.returnNote)];break;
  case 'health':lines=[o.status,mark(detail)];break;
  case 'wash':return washLines(o);
 }
 return clean(lines).map(sentence);
}
function washLines(wash){
 if(wash.enabled===false)return ['本次不提供'];
 const output=[];
 for(const [key,detailKey,name] of [['sponge','spongePlace','菜瓜布'],['soap','soapPlace','洗碗精']]){
  const status=clean([wash[key]])[0]?.trim(),detail=clean([wash[detailKey]])[0]?.trim();
  if(!status&&!detail)continue;
  const wording={'有，寵物專用':'有寵物專用'+name,'與人共用':name+'與家人共用','無':'沒有'+name,'待家長提供':name+'待家長提供'};
  const description=wording[status]||(status?name+'（'+status+'）':name);
  output.push(sentence(description+(detail?'（'+detail+'）':'')));
 }
 if(clean([wash.note]).length)output.push(sentence(wash.note));
 return output;
}
async function art(name){const i=new Image();i.src=new URL('./assets/'+name+'.png',import.meta.url);await i.decode();return i;}
const {text:ink,title:plum,rule:lineColor}=palette.care;
const goldInk=palette.promise.title;
const serif='"Lili Serif", "Noto Serif CJK TC", "Noto Color Emoji", serif';
const sans='"Noto Sans CJK TC", "Noto Color Emoji", system-ui, sans-serif';
const lineHeight=23;

export async function buildPDF(f,brand=brandDefaults){
 f=activeFamily(f);
 await document.fonts.load('700 18px "Lili Serif"','毛孩專屬照護計畫書');
 await document.fonts.ready;
 const [cat,ig,line]=await Promise.all(['cat','ig','line'].map(art));
 const pages=[];
 let ctx,c,y,cover=true,serviceTheme=false;
 function font(size,bold){return (bold?'700 ':'400 ')+size+'px '+(bold?serif:sans);}
 function text(str,x,baseline,size=15,bold=false,color=ink){
  ctx.font=font(size,bold);ctx.fillStyle=color;ctx.fillText(str,x,baseline);
 }
 function wrap(value,width,size=15,bold=false){
  ctx.font=font(size,bold);
  const out=[];
  for(const paragraph of String(value).split(/\r?\n/)){
   let row='';
   for(const ch of paragraph){
    if(row && ctx.measureText(row+ch).width>width){
     if(/^[，。！？、；：）】」』》…,.!?;:)]$/.test(ch)&&row.length>1){const tail=Array.from(row).pop();out.push(row.slice(0,-tail.length));row=tail;}
     else if(/[（【「『《(]$/.test(row)&&row.length>1){out.push(row.slice(0,-1));row=row.slice(-1);}
     else{out.push(row);row='';}
    }
    row+=ch;
   }
   out.push(row);
  }
  return out;
 }
 function box(x,top,width,height,color,radius=10){
  ctx.beginPath();ctx.roundRect(x,top,width,height,radius);
  ctx.fillStyle=color;ctx.fill();
 }
 function rule(x,top,width,color=lineColor){ctx.fillStyle=color;ctx.fillRect(x,top,width,1);}
 function page(first=false){
  c=document.createElement('canvas');c.width=W*2;c.height=H*2;pages.push(c);
  ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='white';ctx.fillRect(0,0,W,H);
  if(first){
   ctx.textAlign='center';text('毛孩專屬照護計畫書',W/2,62,31,true,plum);
   text('The Pet Sitter Lili',W/2,89,14,false,ink);ctx.textAlign='left';y=110;
  }else{
   text('ㄌㄌ保姆',M,48,17,true,plum);ctx.textAlign='right';
   text('毛孩專屬照護計畫書',W-M,48,14,true,plum);ctx.textAlign='left';rule(M,63,inner);y=83;
  }
  rule(M,1080,inner);text('The Pet Sitter Lili',M,1103,12,false,plum);
  ctx.textAlign='right';text(String(pages.length).padStart(2,'0'),W-M,1103,13,true,plum);ctx.textAlign='left';
 }
 function ensure(height){if(y+height>B)page();}
 function section(title){
  if(cover)y+=7;
  ensure(116);text(title,M,y+24,21,true,serviceTheme?goldInk:plum);y+=37;
  rule(M,y,inner,serviceTheme?palette.promise.rule:lineColor);
  if(!serviceTheme)rule(M,y,38,lineColor);
  y+=9;
 }
 // A row shares one surface and one bottom edge. Very uneven text uses full-width rows.
 function rows(items,n=2){
  for(let i=0;i<items.length;i+=n)row(items.slice(i,i+n));
 }
 function row(items){
  if(!items.length)return;
  const width=inner/items.length;
  const cols=items.map(([title,body])=>{
   const heads=wrap(title,width-32,16,true);
   return {heads,lines:body.flatMap(s=>typeof s==='object'?wrap(s.note,width-32,12).map(t=>({note:t})):wrap(s,width-32)),pos:0};
  });
  if(cols.length>1){
   const heights=cols.map(col=>col.heads.length+col.lines.length);
   if(Math.max(...heights)>Math.max(7,Math.min(...heights)*2.5)){
    for(const item of items)row([item]);
    return;
   }
  }
  let remaining=true,continued=false;
  while(remaining){
   const inset=cover?12:0;
   const headHeight=inset+14+Math.max(...cols.map(col=>col.heads.length))*24;
   const fullHeight=headHeight+22+lineHeight*Math.max(1,...cols.map(col=>col.lines.length-col.pos));
   if(!continued && fullHeight<420 && y+fullHeight>B && y>140)page();
   ensure(headHeight+22+lineHeight);
   const capacity=Math.max(1,Math.floor((B-y-headHeight-22)/lineHeight));
   const parts=cols.map(col=>col.lines.slice(col.pos,col.pos+capacity));
   const height=headHeight+22+lineHeight*Math.max(1,...parts.map(p=>p.length));
   box(M,y,inner,height,serviceTheme?palette.promise.surface:palette.care.surface,9);
   if(serviceTheme)rule(M+12,y+5,inner-24,palette.promise.rule);
   if(cover){ctx.fillStyle=lineColor;ctx.fillRect(M+12,y+7,inner-24,2);}
   cols.forEach((col,k)=>{
    const x=M+k*width;
    if(k){ctx.fillStyle=serviceTheme?palette.promise.rule:lineColor;ctx.fillRect(x,y+12,1,height-24);}
    if(continued&&!parts[k].length)return;
    col.heads.forEach((t,j)=>text(t,x+16,y+25+inset+j*24,16,true,serviceTheme?goldInk:plum));
    const baseline=y+headHeight+19;
    parts[k].forEach((s,j)=>typeof s==='object'?text(s.note,x+16,baseline+j*lineHeight,12,false,'#82735D'):text(s,x+16,baseline+j*lineHeight,15,false,serviceTheme?palette.promise.text:ink));
    col.pos+=parts[k].length;
   });
   y+=height+9;continued=true;remaining=cols.some(col=>col.pos<col.lines.length);
  }
 }
 page(true);
 // The consent panel stays beside the family at every length, including a multi-page note.
 const label={yes:'我願意分享',no:'我不願意分享'}[f.media.status]||'尚未確認';
 const copy=clean([f.contact.name,f.contact.phone,f.contact.address,f.contact.guide,
  f.entry.wifi&&'WiFi　'+f.entry.wifi,f.contact.emergency&&'緊急聯絡　'+f.contact.emergency]);
 const panelW=214,logo=70,pad=18,detailX=M+pad+logo+16;
 const detailWidth=inner-panelW-logo-pad*3-16;
 const familyLines=[...wrap(f.name||'家庭資料',detailWidth,21,true).map(t=>[t,21,true]),
  ...copy.flatMap(s=>wrap(s,detailWidth,14).map(t=>[t,14,false]))];
 const notes=f.media.note?.trim()?wrap(f.media.note,panelW-32,14):[];
 let firstBanner=true;
 do{
  if(!firstBanner)page();
  const capacity=Math.floor((B-y-82)/24);
  const details=familyLines.splice(0,capacity);
  const part=notes.splice(0,capacity);
  const panelH=part.length?90+part.length*22:61;
  const height=Math.max(124,pad*2+details.length*24,pad*2+panelH);
  box(M,y,inner,height,palette.care.surface,15);
  const logoY=y+(Math.min(height,160)-logo)/2;
  ctx.drawImage(cat,M+pad,logoY,logo,logo*cat.height/cat.width);
  details.forEach(([t,size,b],j)=>text(t,detailX,y+pad+20+j*24,size,b,b?plum:ink));
  const px=W-M-panelW-pad,py=y+pad;
  box(px,py,panelW,panelH,'#fcfbfd',10);
  text('服務影像對外分享',px+16,py+20,12,false,plum);
  text(label,px+16,py+46,20,true,f.media.status==='no'?'#694957':plum);
  if(part.length){
   rule(px+16,py+56,panelW-32);text('拍攝與分享備註',px+16,py+76,12,true,plum);
   part.forEach((s,i)=>text(s,px+16,py+97+22*i,14));
  }
  y+=height+19;firstBanner=false;
 }while(familyLines.length||notes.length);
 const care=careBlocks(f);
 const basics=[
  ['陪伴毛孩的時間與細節',[...bookingLines(f.booking,f.groups),{note:'關於抵達與照護時間：預計抵達時段為保姆到府的時間範圍，並非照護服務的起訖時間。每趟服務將自實際抵達後開始計算，並完整提供約定的照護時間。'}]],
  ['回家的方式與門鎖安全',clean([f.entry.pickup&&(/^(已取|已取得)$/.test(f.entry.pickup.trim())?'鑰匙已取得。':'取鑰匙：'+f.entry.pickup),f.entry.door,f.entry.return&&(/^(最後一趟放門內|最後一趟放回門內)$/.test(f.entry.return.trim())?'最後一趟將鑰匙放回門內。':'還鑰匙：'+f.entry.return)])],
  ['身體小狀況與特別照顧',care.filter(b=>b.id.endsWith('-health')).flatMap(b=>[b.title,...careText('health',f.groups[b.id.split('-')[0]].health)])]
 ].filter(([,ls])=>ls.length);
 for(const item of basics){row([item]);if(item[0]==='陪伴毛孩的時間與細節'){const q=quoteLines(f);if(q.length)row([['本次照護費用',q]]);const ot=overtimeText(f.booking);if(ot)row([['加時照護費用',[{note:ot}]]]);}}
 const pets=Object.entries(f.groups).flatMap(([kind,g])=>g.pets.map(p=>[(kind==='cat'?'🐱 ':'🐶 ')+(p.name||'毛寶'),clean([petStory(p)])]));
 if(pets.length){section('毛孩的小個性與相處默契');rows(pets);}
 cover=false;page();
 const foods=care.filter(b=>/-(dry|wet|snack)$/.test(b.id));
 if(foods.length){section('每一餐的份量與愛吃的口味');
  for(const kind of Object.keys(f.groups)){
   rows(foods.filter(b=>b.id.startsWith(kind+'-')).map(b=>[b.title,careText(b.id.split('-')[1],f.groups[kind].food[b.id.split('-')[1]])]),3);
  }
 }
 const headings={water:'隨時隨地乾淨清爽的飲水',wash:'洗滌用品與位置',toilet:'如廁環境清潔與代謝觀察',play:'放鬆心情的玩耍與陪伴',walk:'散步與返家整理'};
 const other=[];
 for(const [kind,g] of Object.entries(f.groups)){
  const species=kind==='cat'?'🐱':'🐶';
  for(const [key,title] of Object.entries(headings)){
   const block=care.find(b=>b.id===kind+'-'+key);
   const lines=block?careText(key,g[key]):[];
   if(key==='toilet'&&kind==='cat')lines.push({note:'爸爸媽媽出門前記得幫寶貝補足量的貓砂，讓他們更舒適上廁所喔！'});
   if(lines.length)other.push([species+' '+title,lines]);
  }
 }
 if(f.environment)other.push(['舒適空間控制與電器使用',[f.environment]]);
 if(f.extra&&!(f.extra.includes('垃圾')&&routineWaste(f.extra)))other.push(['爸爸媽媽交代的貼心任務',[f.extra]]);
 if(other.length){section('日常照護安排');rows(other);}
 serviceTheme=true;
 if(brand.service.trim()){
  // Keep the four standard service notes together when they would otherwise straddle pages.
  const bodyHeight=brand.service.trim().split(/\n\s*\n/).reduce((sum,part)=>{
   const lines=part.split('\n').slice(1).flatMap(t=>wrap(t,inner/2-32));
   return sum+60+lines.length*lineHeight;
  },0)/2;
  if(y>B*.54&&bodyHeight+120>B-y)page();
  section('♡ 每一次陪伴，都是一份安心的交付');
  const sections=brand.service.trim().split(/\n\s*\n/).map(part=>{
   const [title,...body]=part.split('\n');
   return body.length&&title.length<=20?[title,body]:['服務約定',[part]];
  });
  rows(sections);
 }
 if(brand.promise)rows([['給家長的安心承諾',[brand.promise]]]);
 serviceTheme=false;
 const contact=brand.contact?wrap(brand.contact,inner-220):[];
 if(contact.length>4)rows([['與ㄌㄌ聯繫',[brand.contact]]]);
 ensure(118);rule(M,y,inner);text('與ㄌㄌ聯繫',M+4,y+32,18,true,plum);
 if(contact.length<=4)contact.forEach((s,i)=>text(s,M+4,y+56+i*20,14));
 c.links=[];[ig,line].forEach((img,i)=>{
  const x=W-M-192+i*98,top=y+8;
  ctx.drawImage(img,x,top,75,75);text(i?'LINE 加好友':'Instagram',x,top+94,13,false,plum);
  c.links.push({x,y:top,url:links[i]});
 });
 const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const bytes=s=>{const a=typeof s==='string'?encoder.encode(s):s;parts.push(a);length+=a.length;};
 const object=(id,content)=>{offsets[id]=length;bytes(id+' 0 obj\n');bytes(content);bytes('\nendobj\n');};
 bytes('%PDF-1.4\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){const id=3+i*3,base64=pages[i].toDataURL('image/jpeg',.94).split(',')[1],bin=atob(base64),jpg=Uint8Array.from(bin,c=>c.charCodeAt(0)),stream='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> '+' /Annots ['+(pages[i].links||[]).map(({x,y,url})=>'<< /Type /Annot /Subtype /Link /Rect ['+[x*.75,(H-y-88)*.75,(x+78)*.75,(H-y)*.75].join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+url+') >> >>').join(' ')+'] /Contents '+(id+2)+' 0 R >>');offsets[id+1]=length;bytes((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+pages[i].width+' /Height '+pages[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');bytes(jpg);bytes('\nendstream\nendobj\n');object(id+2,'<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream');}
 const xref=length,count=3+pages.length*3;bytes('xref\n0 '+count+'\n0000000000 65535 f \n');for(let i=1;i<count;i++)bytes(String(offsets[i]).padStart(10,'0')+' 00000 n \n');bytes('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');return {blob:new Blob(parts,{type:'application/pdf'}),name:filename(f),pages:pages.map(c=>c.toDataURL('image/jpeg',.8))};
}

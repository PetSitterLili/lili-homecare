import {filename,mediaLabel,careBlocks,warnings} from './workspace-model.mjs?v=2.0.1125.1';
import {brandDefaults,links} from './brand.mjs?v=2.0.1125.1';
const W=794,H=1123,M=38,B=1060,inner=W-2*M;
const clean=values=>values.filter(x=>typeof x==='string'&&x.trim());
const sentence=value=>/[。！？.!?]$/.test(value.trim())?value.trim():value.trim()+'。';
const petStory=p=>{
 const identity=clean([p.age,p.identity,p.sex]).join('');
 return clean([identity,p.neuter,p.health,p.personality,p.likes,p.avoid,p.area&&'常在'+p.area,p.intro]).map(sentence).join('');
};
function natural(line){
 const i=line.indexOf('：');if(i<0)return line;
 const k=line.slice(0,i),v=line.slice(i+1);
 if(k==='備品位置')return sentence('📍備品在'+v);
 if(k==='份量')return sentence('每次給予'+v);
 if(k==='剩食處理')return v==='移出洗碗後放回'?'如有剩食，先移出，清洗碗具後再放回。':'如有剩食：'+v;
 return ['飼料品項','罐頭／餐包／鮮食品項','可給的零食','特殊交代','特殊交代／個別差異'].includes(k)?v:line;
}
async function art(name){const i=new Image();i.src=new URL('./assets/'+name+'.png',import.meta.url);await i.decode();return i;}
export async function buildPDF(f,brand=brandDefaults){
 await document.fonts.ready;
 const [cat,ig,line]=await Promise.all(['cat','ig','line'].map(art));
 const pages=[];let c,ctx,y;
 function txt(str,x,pos,size=15,color='#393340',bold=false){ctx.font=(bold?'bold ':'')+size+'px "Noto Sans CJK TC", "Noto Color Emoji", sans-serif';ctx.fillStyle=color;ctx.fillText(str,x,pos);}
 function wrap(str,width){ctx.font='15px "Noto Sans CJK TC", "Noto Color Emoji", sans-serif';return String(str).split('\n').flatMap(s=>{const arr=[];let row='';for(const ch of s){if(row&&ctx.measureText(row+ch).width>width){arr.push(row);row='';}row+=ch;}return [...arr,row];});}
 function box(x,top,w,h,color){ctx.beginPath();ctx.roundRect(x,top,w,h,12);ctx.fillStyle=color;ctx.fill();}
 function page(){c=document.createElement('canvas');c.width=W*2;c.height=H*2;pages.push(c);ctx=c.getContext('2d');ctx.scale(2,2);ctx.fillStyle='white';ctx.fillRect(0,0,W,H);ctx.textAlign='center';txt('毛孩專屬照護計畫書',W/2,54,26,'#655970',true);txt('The Pet Sitter Lili',W/2,77,13,'#82728d');ctx.textAlign='left';txt('ㄌㄌ保姆  ·  '+pages.length,M,H-28,12,'#776e7c');y=96;}
 function cards(items,n=2){
 const width=(inner-(n-1)*12)/n;
 for(let j=0;j<items.length;j+=n){
 const group=items.slice(j,j+n).map(([title,lines])=>({title,rows:lines.flatMap(s=>wrap(s,width-28)),offset:0}));
 while(group.some(g=>g.rows.length>g.offset)){
 if(y+95>B)page();
 const cap=Math.floor((B-y-50)/23);
 let height=0;
 group.forEach((g,k)=>{const part=g.rows.slice(g.offset,g.offset+cap);if(!part.length)return;
 const x=M+k*(width+12),h=47+23*part.length;box(x,y,width,h,'#f7f5f8');box(x,y,width,33,'#e9e4ee');txt(g.title+(g.offset?'（續）':''),x+12,y+22,14,'#665972',true);part.forEach((s,i)=>txt(s,x+14,y+54+i*23));g.offset+=part.length;height=Math.max(height,h);});y+=height+12;
 }}}
 page();
 const bannerLines=clean([f.name,f.contact.name,f.contact.phone,f.contact.address,f.contact.emergency&&'緊急聯絡：'+f.contact.emergency,f.contact.guide,f.entry.wifi&&'WiFi：'+f.entry.wifi,f.media.note&&'影像分享備註：'+f.media.note]).flatMap(s=>wrap(s,inner-244));
 const first=bannerLines.splice(0,25),bh=Math.max(110,first.length*23+24);box(M,y,inner,bh,'#786b86');ctx.drawImage(cat,M+12,y+12,78,74);box(W-M-128,y+12,114,30,'#f1edf4');txt(mediaLabel(f),W-M-118,y+32,13,'#5d5067',true);first.forEach((s,i)=>txt(s,M+102,y+26+i*23,15,'white',i===0));y+=bh+14;
 if(bannerLines.length)cards([['家庭資訊（續）',bannerLines]],1);
 const care=careBlocks(f);
 cards([['陪伴毛孩的時間與細節',clean([f.booking.dates,f.booking.times,...f.booking.services])],['回家的方式與門鎖安全',clean([f.entry.pickup&&'取鑰匙：'+f.entry.pickup,f.entry.door,f.entry.return&&'歸還：'+f.entry.return])],['身體小狀況與特別照顧',care.filter(b=>b.id.endsWith('-health')).flatMap(b=>[b.title,...b.lines])]].filter(x=>x[1].length),3);
 const pets=Object.entries(f.groups).flatMap(([k,g])=>g.pets.map(p=>[(k==='cat'?'🐱 ':'🐶 ')+(p.name||'毛寶'),[petStory(p)]]));
 if(pets.length){if(y+110>B)page();txt('毛孩的小個性與相處默契',M,y+20,18,'#665972',true);y+=32;cards(pets);}
 
 const foods=care.filter(b=>/-(dry|wet|snack)$/.test(b.id));
 if(foods.length){if(y+120>B)page();txt('每一餐的份量與愛吃的口味',M,y+20,18,'#665972',true);y+=32;cards(foods.map(b=>[b.title,b.lines.map(natural)]),foods.length<3?foods.length:3);}
 const headings={water:'隨時隨地乾淨清爽的飲水',wash:'洗滌用品與位置',toilet:'如廁環境清潔與代謝觀察',play:'放鬆心情的玩耍與陪伴',walk:'散步與返家整理'};
 const other=care.filter(b=>headings[b.id.split('-')[1]]).map(b=>[b.title.slice(0,2)+' '+headings[b.id.split('-')[1]],b.lines.map(natural)]);
 if(f.groups.cat)other.push(['如廁小提醒',['爸爸媽媽出門前記得幫寶貝補足量的貓砂，讓他們更舒適上廁所喔！']]);
 if(f.environment)other.push(['舒適空間控制與電器使用',[f.environment]]);if(f.extra)other.push(['爸爸媽媽交代的貼心任務',[f.extra]]);
 cards(other);const w=warnings(f);if(w.length)cards([['待確認事項',w]],1);
 if(brand.service.trim()){
 if(y+170>B)page();txt('♡ 每一次陪伴，都是一份安心的交付',M,y+20,18,'#665972',true);y+=34;
 const sections=brand.service.trim().split(/\n\s*\n/).map(part=>{const [title,...body]=part.split('\n');return body.length&&title.length<=20?[title,body]:['服務約定',[part]];});cards(sections,2);}
 if(brand.promise)cards([['給家長的安心承諾',[brand.promise]]],1);
 if(y+112>B)page();if(brand.contact){
 const contactLines=wrap(brand.contact,inner-230);if(contactLines.length<=4){box(M,y,inner,108,'#f7f5f8');txt('與ㄌㄌ聯繫',M+12,y+25,16,'#665972',true);contactLines.forEach((s,i)=>txt(s,M+12,y+49+i*20,14));}
 else cards([['與ㄌㄌ聯繫',[brand.contact]]],1);}
 if(y+100>B)page();c.links=[];[ig,line].forEach((img,i)=>{const x=W-M-195+i*98;ctx.drawImage(img,x,y,76,76);txt(i?'LINE 加好友':'Instagram',x,y+93,12);c.links.push({x,y,url:links[i]});});
 const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const bytes=s=>{const a=typeof s==='string'?encoder.encode(s):s;parts.push(a);length+=a.length;};
 const object=(id,content)=>{offsets[id]=length;bytes(id+' 0 obj\n');bytes(content);bytes('\nendobj\n');};
 bytes('%PDF-1.4\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){const id=3+i*3,base64=pages[i].toDataURL('image/jpeg',.94).split(',')[1],bin=atob(base64),jpg=Uint8Array.from(bin,c=>c.charCodeAt(0)),stream='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> '+' /Annots ['+(pages[i].links||[]).map(({x,y,url})=>'<< /Type /Annot /Subtype /Link /Rect ['+[x*.75,(H-y-88)*.75,(x+78)*.75,(H-y)*.75].join(' ')+'] /Border [0 0 0] /A << /S /URI /URI ('+url+') >> >>').join(' ')+'] /Contents '+(id+2)+' 0 R >>');offsets[id+1]=length;bytes((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+pages[i].width+' /Height '+pages[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');bytes(jpg);bytes('\nendstream\nendobj\n');object(id+2,'<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream');}
 const xref=length,count=3+pages.length*3;bytes('xref\n0 '+count+'\n0000000000 65535 f \n');for(let i=1;i<count;i++)bytes(String(offsets[i]).padStart(10,'0')+' 00000 n \n');bytes('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');return {blob:new Blob(parts,{type:'application/pdf'}),name:filename(f),pages:pages.map(c=>c.toDataURL('image/jpeg',.8))};
}

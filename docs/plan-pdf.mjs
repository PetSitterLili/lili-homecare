
import {filename,mediaLabel,publicBlocks,warnings} from './workspace-model.mjs';
function wrap(ctx,text,max){const out=[];for(const paragraph of String(text).split('\n')){let line='';for(const ch of paragraph){if(ctx.measureText(line+ch).width>max&&line){out.push(line);line=ch;}else line+=ch;}out.push(line);}return out;}
function emblem(ctx,x,y){ctx.save();ctx.strokeStyle='#a59aad';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-17,y+10);ctx.lineTo(x-15,y-12);ctx.lineTo(x-5,y-4);ctx.quadraticCurveTo(x,y-7,x+6,y-4);ctx.lineTo(x+16,y-12);ctx.lineTo(x+17,y+10);ctx.quadraticCurveTo(x,y+30,x-17,y+10);ctx.moveTo(x-7,y+7);ctx.lineTo(x-5,y+7);ctx.moveTo(x+5,y+7);ctx.lineTo(x+7,y+7);ctx.stroke();ctx.restore();}
export async function buildPDF(f){
 if(document.fonts)await document.fonts.ready;
 const pages=[],W=794,H=1123,scale=2,margin=46;let canvas,ctx,y;
 function page(){canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#f4f2f7';ctx.fillRect(0,0,W,134);emblem(ctx,67,56);ctx.fillStyle='#756c80';ctx.font='12px sans-serif';ctx.fillText('THE PET SITTER LILI',100,48);ctx.font='bold 24px sans-serif';ctx.fillText('毛孩專屬照護計畫書',100,81);ctx.font='14px sans-serif';const title=wrap(ctx,f.name,450);ctx.fillText(title[0]||'',100,107);const label=mediaLabel(f);ctx.font='13px sans-serif';ctx.fillText(label,W-180,48);ctx.fillStyle='#67616e';ctx.font='11px sans-serif';for(const [i,l]of wrap(ctx,f.media.note,140).slice(0,4).entries())ctx.fillText(l,W-180,68+i*14);y=161;}
 function finish(){ctx.strokeStyle='#e2dde7';ctx.beginPath();ctx.moveTo(margin,H-49);ctx.lineTo(W-margin,H-49);ctx.stroke();ctx.fillStyle='#82768e';ctx.font='11px sans-serif';ctx.fillText('ㄌㄌ保姆  ·  每一個細節，都是為了安心交付',margin,H-29);ctx.fillText(String(pages.length+1),W-margin-15,H-29);pages.push(canvas);}
 page();
 const issues=warnings(f),blocks=[...(issues.length?[{title:'待確認事項',lines:issues}]:[]),...publicBlocks(f)];
 for(const block of blocks){ctx.font='15px sans-serif';const text=block.lines.flatMap(l=>wrap(ctx,l,W-2*margin-28));let i=0;
 do{if(y>H-145){finish();page();}const room=Math.floor((H-70-y-47)/24);if(room<1){finish();page();continue;}const chunk=text.slice(i,i+room);const height=43+chunk.length*24;ctx.fillStyle='#faf9fc';ctx.fillRect(margin,y,W-2*margin,height);ctx.strokeStyle='#e4dfea';ctx.strokeRect(margin,y,W-2*margin,height);ctx.fillStyle='#efebf380';ctx.fillRect(margin,y,W-2*margin,32);ctx.fillStyle='#71637f';ctx.font='bold 15px sans-serif';ctx.fillText(block.title+(i?'（續）':''),margin+14,y+22);ctx.fillStyle='#3e3b43';ctx.font='15px sans-serif';chunk.forEach((l,j)=>ctx.fillText(l,margin+14,y+55+j*24));y+=height+16;i+=chunk.length;if(i<text.length){finish();page();}}while(i<text.length);
 }finish();
 const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const bytes=s=>{const a=typeof s==='string'?encoder.encode(s):s;parts.push(a);length+=a.length;};
 const object=(id,content)=>{offsets[id]=length;bytes(id+' 0 obj\n');bytes(content);bytes('\nendobj\n');};
 bytes('%PDF-1.4\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 for(let i=0;i<pages.length;i++){const id=3+i*3,base64=pages[i].toDataURL('image/jpeg',.94).split(',')[1],bin=atob(base64),jpg=Uint8Array.from(bin,c=>c.charCodeAt(0)),stream='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');offsets[id+1]=length;bytes((id+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+pages[i].width+' /Height '+pages[i].height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');bytes(jpg);bytes('\nendstream\nendobj\n');object(id+2,'<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream');}
 const xref=length,count=3+pages.length*3;bytes('xref\n0 '+count+'\n0000000000 65535 f \n');for(let i=1;i<count;i++)bytes(String(offsets[i]).padStart(10,'0')+' 00000 n \n');bytes('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');return {blob:new Blob(parts,{type:'application/pdf'}),name:filename(f),pages:pages.map(c=>c.toDataURL('image/jpeg',.8))};
}


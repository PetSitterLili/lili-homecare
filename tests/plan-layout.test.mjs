import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,blanks,warnings} from '../docs/workspace-model.mjs';
import {buildPDF} from '../docs/plan-pdf.mjs';

test('cover keeps the entire consent note, food starts on a later page, photos stay private', async()=>{
 const pages=[],images=[];
 globalThis.Image=class{width=360;height=341;async decode(){images.push(String(this.src));}};
 globalThis.document={fonts:{load:async()=>[],ready:Promise.resolve()},createElement(){
  const printed=[];pages.push(printed);
  const ctx={createLinearGradient(){return {addColorStop(){}};},scale(){},fillRect(){},beginPath(){},roundRect(){},fill(){},drawImage(){},
   measureText(s){return {width:[...s].length*15};},
   fillText(s,x,y){assert(y<=1123 && y>=0);printed.push(s);}
  };
  return {getContext:()=>ctx,toDataURL:()=>'data:image/jpeg;base64,AA=='};
 }};
 for(const status of ['yes','no','pending']){
  pages.length=images.length=0;
  const f=fresh();f.name='測試家庭';f.groups.cat.pets=[{name:'小禾'}];
  f.media={status,note:'避免拍到窗外。'.repeat(88)+'避拍備註結束'};
  f.groups.cat.food.dry={amount:'三分之一',unit:'杯'};
  if(status==='no'){f.groups.dog=blanks();f.groups.dog.walk.note='先戴胸背，再開門。';}
  f.booking.services=['陪伴專案'];
  f.groups.cat.wash={sponge:'有，寵物專用',spongePlace:'紫色魚形',soap:'與人共用',soapPlace:'透明瓶'};
  assert(warnings(f).some(text=>text.includes('請補問')));
  f.photos.push({caption:'PRIVATE-CAPTION',thumb:'PRIVATE-IMAGE'});
  await buildPDF(f);
  const visible=pages.map(page=>page.join(''));
  assert(visible[0].includes({yes:'我願意分享',no:'我不願意分享',pending:'尚未確認'}[status]));
  const noteEnd=visible.findIndex(p=>p.includes('避拍備註結束')||p.endsWith('結束'));
  assert(noteEnd>=0);
  assert(visible.findIndex(p=>p.includes('每一餐的份量與愛吃的口味'))>noteEnd);
  assert(visible.join('').includes('三分之一杯'));
  assert.equal(visible.join('').includes('先戴胸背，再開門。'),status==='no');
  assert(!/待確認事項|請補問|尚未填完整/.test(visible.join('')));
  assert(visible.join('').includes('有寵物專用菜瓜布（紫色魚形）。'));
  assert(visible.join('').includes('洗碗精與家人共用（透明瓶）。'));
  assert(!visible.join('').includes('PRIVATE'));assert(images.every(s=>/assets\/(cat|ig|line)\.png$/.test(s)));
 }
});

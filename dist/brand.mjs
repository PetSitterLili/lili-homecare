// Opaque PDF colors: families delegate care in mist purple; Lili's commitments use warm cream.
export const palette={
 care:{surface:'#EFEDF2',rule:'#DCD6E3',title:'#66596F',text:'#665E6C'},
 promise:{surface:'#F8F5EE',rule:'#E6DED0',title:'#82735D',text:'#756C60'}
};
const oldArrival='於服務當天或前一天，ㄌㄌ會與爸爸媽媽確認更精確的預計抵達時間，並於告知時間的前後30分鐘內抵達。';
const arrival='於服務當天或前一天，ㄌㄌ會與爸爸媽媽確認更精確的預計抵達時間，並於告知時間的前後30～40分鐘內抵達。';
export function readBrand(saved){
 const settings={...brandDefaults,...saved};
 if(typeof settings.service==='string'){
  settings.service=settings.service.split(/(\r?\n)/).map(line=>line===oldArrival?arrival:line).join('');
 }
 return settings;
}

export const brandDefaults = {
  service: `🕒 出發前的小約定
${arrival}

🐾 陪伴期間的照護與分享
依照專屬照護計畫，逐一完成毛寶的生活照顧與個別需求。陪伴過程中，若捕捉到可愛、有趣的日常片刻，也會隨時與爸爸媽媽分享照片及影片，並於服務完成後提供本次照護日誌。
（若室內網路訊號較弱，且無可使用的 WiFi，照片與影片可能會稍晚送達喔！）

🛡️ 離開前的最後確認
每次離開前，ㄌㄌ都會再次核對照護事項，確認環境整潔、電器使用狀態，帶走本次照護產生的垃圾，並仔細確認門窗、門鎖及鑰匙的安全，才會安心離開。

📷 讓關心不受距離限制
若家中設有監視器，也鼓勵爸爸媽媽依照毛寶平時的活動範圍，安排不同的觀看角度。
除了能隨時看看孩子獨自在家的模樣，也能在非照護時段及早發現異常。若有需要協助的情況，可以儘早與ㄌㄌ聯繫，讓我們一起確認後續的照護安排。`,
  promise:'家中的貴重財物建議您可以收好或鎖在房間內。為了讓您在外更安心，非常歡迎您安裝監視器，且不需要特別告知我安裝的位置。若服務後有任何想討論的地方，請在 3 日內與我聯絡。保姆本名：陳苡彤，我已準備好良民證供您查驗，希望能給毛孩最溫柔、最專業的守護。',
  contact:'歡迎追蹤ㄌㄌ，因為你家小朋友有可能會出現在鏡頭喲！'
};
export const links=['https://www.instagram.com/the_pet_sitter_lili','https://lin.ee/Sol7oXU'];

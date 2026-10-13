import fs from 'node:fs';
const data={years:[2025,2026,2027],updatedAt:'2026-10-08',holidays:{},terms:{},lunarDays:{},sources:{holidays:'https://data.gov.tw/dataset/14718',calendar:'https://www.hko.gov.hk/tc/gts/time/conversion.htm'}};
for(const year of data.years){
  // The official 2025 CSV is Big5; the 2026/2027 files are UTF-8.
  // Decode strictly so a source encoding change fails instead of publishing mojibake.
  const csv=new TextDecoder(year===2025?'big5':'utf-8',{fatal:true}).decode(fs.readFileSync(`localization-sources/tw-${year}.csv`)).replace(/^\uFEFF/,'');
  if(csv.includes('\uFFFD'))throw Error(`Holiday source contains damaged text: ${year}`);
  let count=0;
  for(const line of csv.split(/\r?\n/).slice(1)){
    const match=line.match(/^(\d{4})(\d{2})(\d{2}),([^,]+),([02]),(.*)$/);
    if(!match)continue;
    const [,y,m,d,,off,note]=match,date=`${y}-${m}-${d}`;
    data.holidays[date]={off:off==='2',name:note.replace(/^"|"$/g,'').replace(/""/g,'"').trim()};count++;
  }
  if(count!==365)throw Error(`Holiday source incomplete: ${year}: ${count}`);
  const text=fs.readFileSync(`localization-sources/hko-${year}.txt`,'utf8');
  let terms=0,days=0;
  for(const line of text.split(/\r?\n/)){
    const match=line.match(/^(\d{4})年(\d+)月(\d+)日\s+(\S+)\s+星期\S+\s*(\S+)?/);
    if(!match)continue;
    const [,y,m,d,lunar,term]=match,key=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    data.lunarDays[key]=lunar;days++;
    if(term){data.terms[key]=term;terms++;}
  }
  if(terms!==24||days!==365)throw Error(`Calendar source incomplete: ${year}: ${days}/${terms}`);
}
fs.writeFileSync('localization-data.js','// Generated from official calendar sources; run node build-localization-data.mjs to rebuild.\nglobalThis.LocalCalendarData = '+JSON.stringify(data)+';\n');
console.log('Built 2025–2027 official calendar data (1095 days, 72 solar terms).');

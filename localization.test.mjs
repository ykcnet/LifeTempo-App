import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './localization-data.js';
import './localization-core.js';
const L=globalThis.LocalCalendar,D=globalThis.LocalCalendarData;
test('holiday names decode correctly across Big5 and UTF-8 source years',()=>{
  assert.equal(L.holiday('2025-10-24').label,'補假');
  for(const year of D.years){
    assert.equal(D.holidays[`${year}-10-25`].name,'臺灣光復暨金門古寧頭大捷紀念日');
  }
  assert.equal(JSON.stringify(D).includes('\uFFFD'),false);
});
test('official calendar has complete days and 24 terms for each supported year',()=>{
  for(const year of D.years){assert.equal(Object.keys(D.holidays).filter(d=>d.startsWith(year)).length,365);assert.equal(Object.keys(D.terms).filter(d=>d.startsWith(year)).length,24);}
});
test('holidays distinguish ordinary days, substitute holidays and weekends',()=>{
  assert.equal(L.holiday('2026-10-09').label,'補假');assert.equal(L.holiday('2026-10-10').label,'國慶日');assert.equal(L.holiday('2026-10-08').off,false);assert.equal(L.holiday('2026-10-11').label,'週末');assert.equal(L.holiday('2026-10-10','none'),null);assert.equal(L.holiday('2030-10-10'),null);
});
test('solar terms use official yearly dates, not fixed approximations',()=>{
  assert.equal(D.terms['2026-04-05'],'清明');assert.equal(D.terms['2026-04-04'],undefined);assert.equal(D.terms['2025-04-04'],'清明');
});
test('lunar labels include first days and leap months',()=>{
  assert.match(L.lunar(new Date(2026,1,17)),/正月初一/);assert.match(L.lunar(new Date(2025,6,25)),/閏六月初一/);assert.match(L.lunar(new Date(2026,9,8)),/八月廿八/);
});
test('preferences recover safely from invalid persisted values',()=>{
  assert.equal(L.normalize(null).region,'TW');assert.equal(L.normalize({weekStart:6,city:'invalid'}).weekStart,0);assert.equal(L.normalize({weather:false,lunar:false,yearFormat:'roc'}).weather,false);assert.equal(Object.keys(L.cities).length,22);
});
test('weather handles missing measurements without inventing zero degrees',()=>{
  const data=L.parseWeather({daily:{time:['2026-10-08'],weather_code:[95],temperature_2m_min:[null],temperature_2m_max:[28.1],precipitation_probability_max:[80]}});
  assert.equal(data[0].min,null);assert.equal(data[0].max,28.1);assert.equal(L.weatherLabel(data[0].code),'雷雨');assert.equal(L.weatherLabel(null),'資料不足');assert.throws(()=>L.parseWeather({}));
  const url=new URL(L.weatherURL('kaohsiung'));assert.equal(url.searchParams.get('timezone'),'Asia/Taipei');assert.equal(url.searchParams.get('latitude'),'22.63');
});
test('week start setting works across a year boundary',()=>{
  const text=fs.readFileSync('index.html','utf8');const fn=text.split('\n').find(l=>l.startsWith('function weekStart('));
  const c=vm.createContext({LocalCalendar:{settings:{weekStart:1}}});vm.runInContext(fn,c);
  const start=c.weekStart(new Date(2027,0,3));assert.equal(start.getFullYear(),2026);assert.equal(start.getMonth(),11);assert.equal(start.getDate(),28);
});
test('localization browser scripts parse',()=>{for(const file of ['localization-data.js','localization-core.js','localization-client.js'])new vm.Script(fs.readFileSync(file,'utf8'));});

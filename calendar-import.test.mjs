import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './calendar-core.js';
import ICAL from './vendor/ical.js';
globalThis.ICAL=ICAL;
await import('./calendar-ics.js');
const CalendarICS=globalThis.CalendarICS;
test('calendar file decoding preserves Chinese and rejects damaged text before import',async()=>{
 const text='SUMMARY:家庭聚餐、會議與旅行';
 assert.equal(await CalendarICS.readFile(new Blob([text])),text);
 const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]);
 assert.equal(await CalendarICS.readFile(new Blob([utf16])),text);
 await assert.rejects(CalendarICS.readFile(new Blob([new Uint8Array([0xa4,0xa4,0xa4,0xe5])])),/編碼/);
 await assert.rejects(CalendarICS.readFile(new Blob(['SUMMARY:�դl�Ϩ�������'])),/損壞文字/);
});
const source=fs.readFileSync('enhancements.js','utf8').split('// Legacy demo data')[1].split('const renderBeforeCalendarImport')[0];
function context(initial=[],fetch){
 const storage=new Map();const c=vm.createContext({events:initial,sessionStorage:{getItem:()=>null},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},parse:s=>new Date(s+'T00:00:00Z'),iso:d=>d.toISOString().slice(0,10),save(){},toast(){},fetch,URLSearchParams,CalendarCore,CalendarICS,selectedTz:'UTC'});
 vm.runInContext('// Legacy demo data'+source,c);return {c,storage};
}
test('legacy cleanup backs up complete seed sets and preserves edited events',()=>{
 const rows=[['每週團隊同步','09:30','10:30','工作','會議室 A',0],['午間散步','12:30','13:00','健康','',0],['設計提案審閱','14:00','15:30','工作','',0],['專注工作時段','10:00','12:00','工作','',1],['牙醫回診','16:00','17:00','個人','',2],['家庭晚餐','18:30','20:00','家庭','',4]];
 const seeds=rows.map(([title,start,end,category,place,offset],i)=>({id:String(i),title,start,end,category,place,date:`2026-10-${String(10+offset).padStart(2,'0')}`,notes:'',repeat:'不重複',reminder:'不提醒',allDay:false}));
 const edited={...seeds[0],id:'mine',notes:'自己的備註'};
 const {c,storage}=context([...seeds,edited]);assert.equal(c.events.length,1);assert.equal(c.events[0].id,'mine');assert.ok([...storage.keys()].some(k=>k.startsWith('lifetempo.legacyExamplesBackup.')));
 assert.equal(context([seeds[0]]).c.events.length,1);
});
test('Google import reads every page, retains multiday events and updates stable IDs',async()=>{
 let calls=0;const {c}=context([],async url=>({ok:true,json:async()=>{
 if(!url.includes('/events'))return {id:'me@example.com'};
 calls++;return url.includes('pageToken=next')?{items:[{id:'b',summary:'Timed',start:{dateTime:'2026-10-11T09:00:00Z'},end:{dateTime:'2026-10-11T10:00:00Z'}}]}:{nextPageToken:'next',items:[{id:'a',summary:'Trip',start:{date:'2026-10-10'},end:{date:'2026-10-12'}}]};
 }}));
 await vm.runInContext("importGoogleEvents('token','2026-10-10','2026-10-12')",c);assert.equal(c.events.length,2);
 await vm.runInContext("importGoogleEvents('token','2026-10-10','2026-10-12')",c);assert.equal(c.events.length,2);assert.equal(calls,4);assert.ok(c.events.every(e=>e.calendarId==='personal'));
});
test('failed Google fetch leaves existing events unchanged',async()=>{
 const {c}=context([{id:'mine'}],async()=>({ok:false}));
 await assert.rejects(vm.runInContext("importGoogleEvents('token','2026-10-10','2026-10-12')",c));assert.equal(c.events.length,1);assert.equal(c.events[0].id,'mine');
});
test('Google preview never saves before confirmation',async()=>{
 const {c,storage}=context([],async url=>({ok:true,json:async()=>url.includes('/events')?{items:[{id:'one',summary:'Preview',start:{date:'2026-10-10'},end:{date:'2026-10-11'}}]}:{id:'me@example.com'}}));
 const rows=await vm.runInContext("importGoogleEvents('token','2026-10-10','2026-10-12',true)",c);
 assert.equal(rows.length,1);assert.equal(c.events.length,0);assert.equal(storage.has('lifetempo.events'),false);
});
test('JSON preview validates, deduplicates and targets only personal calendar',()=>{
 const {c}=context();c.fileText=JSON.stringify({events:[{id:'one',title:'Original',date:'2026-10-10',allDay:true,calendarId:'shared'},{id:'one',title:'Updated',date:'2026-10-10',allDay:true}],tasks:[{title:'not imported'}]});
 const rows=vm.runInContext("prepareCalendarFile('backup.json',fileText,true)",c);
 assert.equal(rows.length,1);assert.equal(rows[0].title,'Updated');assert.equal(rows[0].calendarId,'personal');assert.equal(c.events.length,0);
 c.fileText=JSON.stringify([{title:'Bad date',date:'2026-02-31',allDay:true}]);assert.throws(()=>vm.runInContext("prepareCalendarFile('backup.json',fileText,true)",c));
});
test('storage failure during confirmation preserves in-memory events',()=>{
 const {c}=context([{id:'existing'}]);c.localStorage.setItem=()=>{throw Error('full')};
 assert.throws(()=>vm.runInContext("commitCalendarImport([{id:'new'}])",c));assert.equal(c.events.length,1);assert.equal(c.events[0].id,'existing');
});

test('reimport replaces legacy day fragments, keeps unrelated events and backs up previous data',()=>{
 const incoming=CalendarICS.parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:trip\r\nDTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261013\r\nEND:VEVENT\r\nEND:VCALENDAR');
 const {c,storage}=context([{id:'trip'},{id:'trip::day:2026-10-11'},{id:'trip::day:2026-10-12'},{id:'unrelated'}]);c.incoming=incoming;
 vm.runInContext('commitCalendarImport(incoming)',c);assert.equal(c.events.length,2);assert.equal(JSON.parse(storage.get('lifetempo.beforeImport')).length,4);
 vm.runInContext('commitCalendarImport(incoming)',c);assert.equal(c.events.length,2);assert.ok(c.events.find(e=>e.id==='unrelated'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ICAL from './vendor/ical.js';
import './calendar-core.js';
globalThis.ICAL=ICAL;await import('./calendar-ics.js');
const C=globalThis.CalendarCore,S=globalThis.CalendarICS;
const source=fs.readFileSync('index.html','utf8').split('\n').find(l=>l.startsWith('function openModal('));
function editor(record,answers=[]){
 const nodes=new Map(),messages=[],formValues=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{style:{},focus(){},remove(){}});return nodes.get(s)};
 const context=vm.createContext({$:node,root:{insertAdjacentHTML(_where,html){context.html=html}},events:record?[record]:[],tasks:[],calendarFilter:'',cursor:new Date('2026-10-09'),COLORS:{個人:'red'},calendars:[{id:'personal',name:'Personal',permission:'personal-only'}],dayNames:['日','一','二','三','四','五','六'],permissionLabels:{'personal-only':'個人'},permissionFor:()=> 'personal-only',iso:d=>d.toISOString().slice(0,10),parse:d=>new Date(d+'T00:00:00Z'),esc:s=>String(s||''),crypto:globalThis.crypto,CalendarCore:C,CalendarICS:S,confirm:()=>answers.shift()??false,toast:m=>messages.push(m),save(){},saveTasks(){},render(){},FormData:class{get(k){return formValues.get(k)??''}getAll(k){const v=formValues.get(k);return Array.isArray(v)?v:[]}has(k){return formValues.has(k)}}});
 vm.runInContext(source,context);
 return {context,node,messages,fill(values){Object.entries(values).forEach(([k,v])=>formValues.set(k,v))},submit(){node('#form').onsubmit({preventDefault(){},target:{}})}};
}
const make=()=>S.parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:editor\r\nSUMMARY:Night\r\nDTSTART:20261009T220000Z\r\nDTEND:20261010T020000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR')[0];
test('editor saves a moved cross-day occurrence without shifting or splitting its master',()=>{
 const record=make(),o=S.expand(record,'2026-10-16','2026-10-16')[0],ui=editor(record,[false]);
 ui.context.openModal({...o,date:o.occurrence,endDate:o.occurrenceEndDate});assert.match(ui.context.html,/name="endDate"/);
 ui.fill({title:'Moved',date:'2026-10-18',endDate:'2026-10-20',start:'23:00',end:'03:00',category:'個人',calendarId:'personal'});ui.submit();
 assert.equal(ui.context.events.length,1);assert.equal(ui.context.events[0].date,'2026-10-09');const moved=S.expand(ui.context.events[0],'2026-10-19','2026-10-19')[0];assert.equal(moved.title,'Moved');assert.equal(moved.occurrence,'2026-10-18');assert.equal(moved.occurrenceEndDate,'2026-10-20');assert.equal(moved.recurrenceKey,'2026-10-16T22:00:00Z');
});
test('new cross-day weekly event saves as one recurring record',()=>{
 const ui=editor();ui.context.openModal();ui.fill({title:'New',date:'2026-10-09',endDate:'2026-10-10',start:'22:00',end:'02:00',category:'個人',calendarId:'personal',repeat:'每週',interval:'1'});ui.submit();
 assert.equal(ui.context.events.length,1);assert.ok(ui.context.events[0].icsData);assert.equal(ui.context.events[0].endDate,'2026-10-10');
});
test('delete only this occurrence writes a cancellation exception',()=>{
 const record=make(),o=S.expand(record,'2026-10-16','2026-10-16')[0],ui=editor(record,[true]);ui.context.openModal({...o,date:o.occurrence,endDate:o.occurrenceEndDate});ui.node('#delete').onclick();assert.equal(ui.context.events.length,1);assert.equal(S.expand(ui.context.events[0],'2026-10-16','2026-10-16').length,0);assert.equal(S.expand(ui.context.events[0],'2026-10-09','2026-10-09').length,1);
});

test('all-day editor uses inclusive last day and stores the exclusive end date',()=>{
 const record=CalendarICS.parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:all-day\r\nDTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261012\r\nEND:VEVENT\r\nEND:VCALENDAR')[0];
 const ui=editor(record);ui.context.openModal(record);assert.match(ui.context.html,/name="endDate"[^>]*value="2026-10-11"/);
 ui.fill({title:'Trip',date:'2026-10-09',endDate:'2026-10-11',allDay:'on',category:'個人',calendarId:'personal'});ui.submit();assert.equal(ui.context.events[0].endDate,'2026-10-12');
});

test('series scope must be explicitly selected to change all occurrences',()=>{
 const record=make(),o=S.expand(record,'2026-10-16','2026-10-16')[0],ui=editor(record);
 ui.context.openModal({...o,date:o.occurrence,endDate:o.occurrenceEndDate});assert.match(ui.context.html,/<option value="occurrence" selected>/);
 ui.fill({editScope:'series',title:'All changed',date:'2026-10-16',endDate:'2026-10-17',start:'21:00',end:'02:00',category:'個人',calendarId:'personal'});ui.submit();
 const rows=S.expand(ui.context.events[0],'2026-10-09','2026-10-31');assert.equal(rows.length,3);assert.ok(rows.every(e=>e.title==='All changed'&&e.start==='21:00'));
});

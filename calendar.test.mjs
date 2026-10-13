import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import './calendar-core.js';
import ICAL from './vendor/ical.js';
globalThis.ICAL=ICAL;
await import('./calendar-ics.js');
const CalendarICS=globalThis.CalendarICS;
const {expand} = globalThis.CalendarCore;
const dates=(event,from,to)=>expand([event],from,to).map(e=>e.occurrence);
test('weekly defaults and intervals do not skip or duplicate weeks',()=>{
  assert.deepEqual(dates({date:'2026-10-05',repeat:'每週',interval:2},'2026-10-01','2026-10-31'),['2026-10-05','2026-10-19']);
  assert.deepEqual(dates({date:'2026-10-05',repeat:'每週',interval:2,weekdays:[1,3]},'2026-10-01','2026-10-31'),['2026-10-05','2026-10-07','2026-10-19','2026-10-21']);
});
test('month-end and leap-day recurrence retain original date',()=>{
  assert.deepEqual(dates({date:'2026-01-31',repeat:'每月'},'2026-01-01','2026-05-31'),['2026-01-31','2026-03-31','2026-05-31']);
  assert.deepEqual(dates({date:'2024-02-29',repeat:'每年'},'2025-01-01','2028-12-31'),['2028-02-29']);
});
test('monthly ordinal, last weekday, exceptions and end date',()=>{
  assert.deepEqual(dates({date:'2026-01-12',repeat:'每月',monthlyMode:'weekday',monthlyOrdinal:2,until:'2026-03-09',exceptions:['2026-02-09']},'2026-01-01','2026-06-30'),['2026-01-12','2026-03-09']);
  assert.deepEqual(dates({date:'2026-01-26',repeat:'每月',monthlyMode:'weekday',monthlyOrdinal:-1},'2026-02-01','2026-03-31'),['2026-02-23','2026-03-30']);
});
test('old daily series remains visible after 2000 days',()=>{
  assert.equal(dates({date:'2000-01-01',repeat:'每天'},'2026-10-08','2026-10-08').length,1);
});
test('ICS retains ordinal rules, end dates, exceptions and reminder alarms',()=>{
  const text=CalendarCore.toICS([{id:'1',title:'每月討論'.repeat(30),date:'2026-01-12',start:'09:00',end:'10:00',repeat:'每月',monthlyMode:'weekday',monthlyOrdinal:2,until:'2026-06-30',exceptions:['2026-02-09'],reminders:['提前 45 分鐘']}]);
  assert.match(text,/BYDAY=2MO;UNTIL=20260630T235900/);
  assert.match(text,/EXDATE:20260209T090000/);
  assert.match(text,/TRIGGER:-PT45M/);
  for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
});
test('timezone conversion crosses dates and observes summer/winter offsets',()=>{
  const event={occurrence:'2026-10-08',start:'09:00',end:'10:00',timezone:'Asia/Taipei'};
  const [display]=CalendarCore.display(event,'America/Los_Angeles','UTC');
  assert.equal(display.displayDate,'2026-10-07');assert.equal(display.start,'18:00');
  assert.equal(CalendarCore.display({...event,occurrence:'2026-12-08'},'America/Los_Angeles','UTC')[0].start,'17:00');
  assert.equal(CalendarCore.instant('2026-03-08','02:30','America/New_York'),null);
  assert.equal(new Date(CalendarCore.instant('2026-11-01','01:30','America/New_York')).toISOString(),'2026-11-01T05:30:00.000Z');
});
test('ICS round trip preserves timezone, recurrence, exceptions and alarms',()=>{
  const code=fs.readFileSync('enhancements.js','utf8');
  const c=vm.createContext({crypto:globalThis.crypto,CalendarICS});
  vm.runInContext(code.slice(code.indexOf('importICS ='),code.indexOf('const deviceZone')),c);
  const event={id:'1',title:'討論, 計畫'.repeat(20),date:'2026-01-12',start:'09:00',end:'10:00',timezone:'Asia/Taipei',repeat:'每月',monthlyMode:'weekday',monthlyOrdinal:2,until:'2026-06-30',exceptions:['2026-02-09'],reminders:['提前 45 分鐘']};
  const [result]=c.importICS(CalendarCore.toICS([event]));
  for(const key of ['title','date','start','end','timezone','repeat','monthlyMode','monthlyOrdinal','until'])assert.equal(result[key],event[key]);
  assert.equal(result.exceptions[0],'2026-02-09');assert.equal(result.reminders[0],'提前 45 分鐘');
});
test('all application scripts parse',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for(const file of ['calendar-core.js','calendar-ics.js','booking-client.js','enhancements.js','sw.js']) new vm.Script(fs.readFileSync(file,'utf8'));
});

function appFunctions(names, globals={}) {
  const source=fs.readFileSync('index.html','utf8');
  const context=vm.createContext(globals);
  for(const name of names) {
    const line=source.split('\n').find(line=>line.startsWith('function '+name+'('));
    assert.ok(line, name+' exists');vm.runInContext(line,context);
  }
  return context;
}
test('participant filter includes the chosen person, legacy personal events remain visible',()=>{
  const c=appFunctions(['matches'],{category:'全部',query:'',attendeeFilter:'Alex',calendarFilter:'personal'});
  assert.equal(c.matches({title:'Meeting',attendees:['Alex']}),true);
  assert.equal(c.matches({title:'Other',attendees:['Sam']}),false);
});
test('reminders inspect next-week occurrences, including all-day events',()=>{
  const now=new Date(2026,9,8,0,0,30).getTime(), notices=[];
  class Clock extends Date {static now(){return now;}}
  class Notification {static permission='granted';constructor(title){notices.push(title);}}
  const event={id:'next-week',date:'2026-10-15',occurrence:'2026-10-15',allDay:true,title:'Next week',reminders:['提前 1 週']};
  const c=appFunctions(['reminderOffset','checkReminders'],{CalendarCore,Date:Clock,Notification,window:{Notification},events:[event],firedReminders:new Set(),expandEvents:(from,to)=>{assert.ok(to.getTime()>new Date(2026,9,15).getTime());return[event];}});
  c.checkReminders();c.checkReminders();assert.deepEqual(notices,['Next week']);
});
test('cancelled external bookings are excluded from outgoing busy slots',()=>{
  const code=fs.readFileSync('booking-client.js','utf8');
  const start=code.indexOf('function collectBusyPeriods()'),end=code.indexOf('async function syncBusyPeriods()',start);
  const c=vm.createContext({today:new Date(2026,9,8),sessionStorage:{getItem:()=>null},selectedTz:'Asia/Taipei',iso:d=>d.toISOString().slice(0,10),expandEvents:()=>[{id:'external-booking-abc'},{id:'mine',start:'09:00',end:'10:00'}]});
  vm.runInContext(code.slice(start,end),c);
  assert.equal(c.collectBusyPeriods().length,180);
  assert.ok(c.collectBusyPeriods().every(e=>e.id.startsWith('mine-')));
});

test('Google ICS accepts BOM, quoted timezone, WKST and COUNT without losing recurrence end',()=>{
 const code=fs.readFileSync('enhancements.js','utf8'),c=vm.createContext({crypto:globalThis.crypto,CalendarCore,CalendarICS});
 vm.runInContext(code.slice(code.indexOf('importICS ='),code.indexOf('const deviceZone')),c);
 const text='\uFEFFBEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:google-event\r\nSUMMARY:每週會議\r\nDTSTART;TZID="Asia/Taipei":20261012T090000\r\nDTEND;TZID="Asia/Taipei":20261012T100000\r\nRRULE:FREQ=WEEKLY;WKST=MO;COUNT=3;BYDAY=MO\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
 const [e]=c.importICS(text);assert.equal(e.timezone,'Asia/Taipei');assert.equal(CalendarCore.expand([e],'2026-10-01','2026-11-30').length,3);
 assert.ok(c.importICS(text.replace('COUNT=3','BYSETPOS=1'))[0].icsData);
 assert.throws(()=>c.importICS('not a calendar'),/iCalendar/);
});

test('ICS retains unnamed, overnight and exclusive-end multiday all-day events',()=>{
 const code=fs.readFileSync('enhancements.js','utf8'),c=vm.createContext({crypto:globalThis.crypto,CalendarCore,CalendarICS});
 vm.runInContext(code.slice(code.indexOf('importICS ='),code.indexOf('const deviceZone')),c);
 const text=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:overnight','DTSTART:20261010T230000Z','DTEND:20261011T013000Z','END:VEVENT','BEGIN:VEVENT','UID:trip','SUMMARY:Trip','DTSTART;VALUE=DATE:20261010','DTEND;VALUE=DATE:20261013','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const rows=c.importICS(text);assert.equal(rows.length,2);assert.equal(rows[0].title,'（未命名事件）');assert.equal(rows[0].endDate,'2026-10-11');assert.equal(rows[1].endDate,'2026-10-13');
 const occurrences=CalendarCore.expand(rows,'2026-10-10','2026-10-13');const display=occurrences.flatMap(o=>CalendarCore.display(o,'UTC','UTC'));assert.equal(display.length,5);assert.equal(display[0].end,'24:00');
 const roundtrip=c.importICS(CalendarCore.toICS(rows));assert.equal(roundtrip.length,2);assert.equal(roundtrip[0].endDate,'2026-10-11');
});

test('same-day recurrence reminders fire independently and only once per occurrence',()=>{
 let now=Date.parse('2026-10-10T09:00:30Z');const notices=[];
 class Clock extends Date{static now(){return now}}
 class Notification{static permission='granted';constructor(title){notices.push(title)}}
 const occurrences=['09:00','15:00'].map(time=>({id:'series',title:time,occurrence:'2026-10-10',recurrenceKey:'2026-10-10T'+time+':00Z',startInstant:Date.parse('2026-10-10T'+time+':00Z'),reminders:['事件當下']}));
 const c=appFunctions(['reminderOffset','checkReminders'],{CalendarCore,Date:Clock,Notification,window:{Notification},events:occurrences,firedReminders:new Set(),expandEvents:()=>occurrences});
 c.checkReminders();now=Date.parse('2026-10-10T15:00:30Z');c.checkReminders();c.checkReminders();assert.deepEqual(notices,['09:00','15:00']);
});
test('booking busy IDs distinguish same-day instances of the same series',()=>{
 const code=fs.readFileSync('booking-client.js','utf8'),start=code.indexOf('function collectBusyPeriods()'),end=code.indexOf('async function syncBusyPeriods()',start);
 const c=vm.createContext({today:new Date(2026,9,10),sessionStorage:{getItem:()=>null},selectedTz:'UTC',iso:d=>d.toISOString().slice(0,10),expandEvents:()=>['09:00','15:00'].map(time=>({id:'series',occurrence:'2026-10-10',recurrenceKey:'2026-10-10T'+time+':00Z',start:time,end:time}))});vm.runInContext(code.slice(start,end),c);
 const rows=c.collectBusyPeriods();assert.equal(new Set(rows.map(e=>e.id)).size,rows.length);
});

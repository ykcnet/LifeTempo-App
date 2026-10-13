import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from './vendor/ical.js';
import './calendar-core.js';
globalThis.ICAL=ICAL;
await import('./calendar-ics.js');
const C=globalThis.CalendarCore,S=globalThis.CalendarICS;
const calendar=(...blocks)=>['BEGIN:VCALENDAR','VERSION:2.0',...blocks,'END:VCALENDAR'].join('\r\n');
const event=(...lines)=>['BEGIN:VEVENT',...lines,'END:VEVENT'].join('\r\n');
const series=(extras=[],exceptions=[])=>S.parse(calendar(event('UID:night','SUMMARY:Night','DTSTART;TZID=America/New_York:20260306T220000','DTEND;TZID=America/New_York:20260307T020000','RRULE:FREQ=DAILY;COUNT=5',...extras),...exceptions))[0];
const visible=(e,from,to,zone='America/New_York')=>C.expand([e],C.addDays(from,-2),C.addDays(to,2)).flatMap(o=>C.display(o,zone,zone)).filter(o=>o.displayDate>=from&&o.displayDate<=to);

test('cross-day recurring DTEND preserves exact duration through DST, displays each day with a stable identity',()=>{
 const e=series(),rows=C.expand([e],'2026-03-06','2026-03-11');assert.equal(rows.length,5);
 assert.ok(rows.every(o=>o.endInstant-o.startInstant===4*3600000));
 assert.equal(rows[1].end,'03:00');assert.equal(rows[1].occurrenceEndDate,'2026-03-08');
 const slices=visible(e,'2026-03-08','2026-03-08');assert.equal(slices.length,2);assert.equal(slices[0].start,'00:00');assert.equal(slices[0].end,'03:00');assert.equal(slices[0].recurrenceKey,'2026-03-08T03:00:00Z');
});
test('EXDATE, moved occurrence outside original window and cancellation work together',()=>{
 const e=series(['EXDATE;TZID=America/New_York:20260307T220000'],[
  event('UID:night','RECURRENCE-ID;TZID=America/New_York:20260308T220000','DTSTART;TZID=America/New_York:20260401T210000','DTEND;TZID=America/New_York:20260403T010000','SUMMARY:Moved'),
  event('UID:night','RECURRENCE-ID;TZID=America/New_York:20260309T220000','STATUS:CANCELLED')]);
 assert.equal(C.expand([e],'2026-03-06','2026-03-12').length,2);
 const moved=visible(e,'2026-04-02','2026-04-02');assert.equal(moved.length,1);assert.equal(moved[0].title,'Moved');assert.equal(moved[0].start,'00:00');assert.equal(moved[0].end,'24:00');assert.equal(moved[0].recurrenceKey,'2026-03-09T02:00:00Z');
 const roundtrip=S.parse(C.toICS([e]))[0];assert.deepEqual(visible(roundtrip,'2026-04-02','2026-04-02').map(o=>o.recurrenceKey),moved.map(o=>o.recurrenceKey));
});
test('multiday all-day recurrence is exclusive at the end and overlaps a later view',()=>{
 const e=S.parse(calendar(event('UID:trip','DTSTART;VALUE=DATE:20261002','DTEND;VALUE=DATE:20261007','RRULE:FREQ=WEEKLY;COUNT=2')))[0];
 assert.equal(visible(e,'2026-10-05','2026-10-05','UTC').length,1);assert.equal(visible(e,'2026-10-07','2026-10-07','UTC').length,0);
 assert.equal(visible(e,'2026-10-12','2026-10-12','UTC').length,1);
});
test('single-instance edit and cancellation retain UID, original recurrence ID and other instances',()=>{
 let e=series();e=S.update(e,'2026-03-07T22:00:00',{...e,title:'Changed',date:'2026-04-01',endDate:'2026-04-03',start:'20:00',end:'01:00'},false);
 assert.equal(e.id,'night');assert.equal(C.expand([e],'2026-03-06','2026-03-11').length,4);assert.equal(visible(e,'2026-04-02','2026-04-02').length,1);
 e=S.update(e,'2026-03-07T22:00:00',null,false,true);assert.equal(visible(e,'2026-04-02','2026-04-02').length,0);
 const again=S.parse(C.toICS([e]))[0];assert.equal(C.expand([again],'2026-03-06','2026-03-11').length,4);
});
test('whole-series time edit preserves rule and single-instance exceptions',()=>{
 let e=series();e=S.update(e,'2026-03-07T22:00:00',null,false,true);e=S.update(e,null,{...e,title:'New title',start:'21:00',end:'02:00'},true);
 // Recurrence IDs track original starts; changing the series time must carry exceptions forward.
 assert.equal(C.expand([e],'2026-03-06','2026-03-11').length,4);
});
test('nominal DURATION and exact DTEND remain distinct across DST',()=>{
 const e=S.parse(calendar(event('UID:duration','DTSTART;TZID=America/New_York:20260307T120000','DURATION:P1D','RRULE:FREQ=DAILY;COUNT=2')))[0];
 const rows=C.expand([e],'2026-03-07','2026-03-09');assert.equal(rows[0].end,'12:00');assert.equal(rows[0].endInstant-rows[0].startInstant,23*3600000);assert.equal(rows[1].endInstant-rows[1].startInstant,24*3600000);
});
test('monthly BYSETPOS, RDATE and UNTIL are retained without flattening',()=>{
 const e=S.parse(calendar(event('UID:complex','DTSTART:20260130T230000Z','DTEND:20260131T020000Z','RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;UNTIL=20260331T230000Z','RDATE:20260214T230000Z')))[0];
 assert.deepEqual(C.expand([e],'2026-01-01','2026-04-03').map(o=>o.occurrence),['2026-01-30','2026-02-14','2026-02-27','2026-03-31']);
});

test('Google recurring events and cancelled instances remain a single series',()=>{
 const rows=S.fromGoogle([
  {id:'master',summary:'Night',start:{dateTime:'2026-10-09T22:00:00+08:00',timeZone:'Asia/Taipei'},end:{dateTime:'2026-10-10T02:00:00+08:00',timeZone:'Asia/Taipei'},recurrence:['RRULE:FREQ=WEEKLY;COUNT=3']},
  {id:'instance',recurringEventId:'master',originalStartTime:{dateTime:'2026-10-16T22:00:00+08:00',timeZone:'Asia/Taipei'},status:'cancelled'}
 ],{id:'calendar@example.com',timeZone:'Asia/Taipei'});
 assert.equal(rows.length,1);assert.equal(rows[0].timezone,'Asia/Taipei');assert.equal(C.expand(rows,'2026-10-09','2026-10-31').length,2);assert.equal(rows[0].endDate,'2026-10-10');
});

test('UTC recurrence exception matches a timezone-based master without duplicating its original occurrence',()=>{
 const e=series([], [event('UID:night','RECURRENCE-ID:20260308T030000Z','DTSTART;TZID=America/New_York:20260401T220000','DTEND;TZID=America/New_York:20260402T020000','SUMMARY:UTC exception')]);
 assert.equal(C.expand([e],'2026-03-06','2026-03-11').length,4);
 const o=C.expand([e],'2026-04-01','2026-04-02')[0];assert.equal(o.recurrenceKey,'2026-03-08T03:00:00Z');
 const cancelled=S.update(e,o.recurrenceKey,null,false,true);assert.equal(C.expand([cancelled],'2026-04-01','2026-04-02').length,0);assert.equal(C.expand([cancelled],'2026-03-06','2026-03-11').length,4);
});

test('same-title occurrences at different times have independent identities and edits',()=>{
 const e=S.parse(calendar(event('UID:twice','SUMMARY:Same title','DTSTART:20261010T090000Z','DTEND:20261010T100000Z','RRULE:FREQ=DAILY;COUNT=4;BYHOUR=9,15')))[0];
 const occurrences=C.expand([e],'2026-10-10','2026-10-11');assert.equal(occurrences.length,4);assert.equal(new Set(occurrences.map(o=>o.recurrenceKey)).size,4);
 const changed=S.update(e,occurrences[0].recurrenceKey,{...e,date:'2026-10-10',endDate:'2026-10-10',start:'11:00',end:'12:00'},false);
 const day=C.expand([changed],'2026-10-10','2026-10-10');assert.deepEqual(day.map(o=>o.start).sort(),['11:00','15:00']);
 const cancelled=S.update(changed,occurrences[0].recurrenceKey,null,false,true);assert.deepEqual(C.expand([cancelled],'2026-10-10','2026-10-10').map(o=>o.start),['15:00']);
});
test('same title does not merge independent events on different dates or times',()=>{
 const rows=S.parse(calendar(event('UID:morning','SUMMARY:Same','DTSTART:20261010T090000Z','DTEND:20261010T100000Z'),event('UID:afternoon','SUMMARY:Same','DTSTART:20261010T150000Z','DTEND:20261010T160000Z'),event('UID:tomorrow','SUMMARY:Same','DTSTART:20261011T090000Z','DTEND:20261011T100000Z')));
 assert.equal(rows.length,3);assert.equal(C.expand(rows,'2026-10-10','2026-10-11').length,3);
});

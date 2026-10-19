import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');const code=html.slice(html.indexOf('function parseNaturalTime('),html.indexOf('function openNaturalInput('));
const c=vm.createContext({today:new Date(2026,9,10),pad:n=>String(n).padStart(2,'0'),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});vm.runInContext(code,c);
for(const [input,start,end] of [['下午4點','16:00','17:00'],['下午４點開會','16:00','17:00'],['下午四點半開會','16:30','17:30'],['上午9點到下午4點開會','09:00','16:00'],['下午3點到4點開會','15:00','16:00'],['23:30到01:00值班','23:30','01:00'],['買4個蘋果','09:00','10:00'],['晚上完成作業','19:00','20:00'],['今晚寫作業','19:00','20:00'],['中午吃飯','12:00','13:00'],['晚上完成作業8點','20:00','21:00']])test(input,()=>{const r=c.parseNaturalLanguage(input);assert.equal(r.start,start);assert.equal(r.end,end)});
test('period-only text keeps the task title and tonight maps to today',()=>{const r=c.parseNaturalLanguage('今晚完成作業');assert.equal(r.title,'完成作業');assert.equal(r.date,'2026-10-10');assert.equal(c.parseNaturalLanguage('明晚完成作業').date,'2026-10-11')});
test('overlapping events are laid out in separate columns',()=>{
 const fn=html.slice(html.indexOf('function dayEventBoxes('),html.indexOf('function weekView('));const ctx=vm.createContext({});vm.runInContext(fn,ctx);
 const ev=(id,start,end)=>({id,start,end});
 const boxes=ctx.dayEventBoxes([ev('a','09:00','10:00'),ev('b','09:30','10:30'),ev('c','09:00','11:00'),ev('d','13:00','14:00')]);
 const by=Object.fromEntries(boxes.map(b=>[b.e.id,b]));
 assert.equal(by.a.cols,3);assert.equal(new Set(['a','b','c'].map(k=>by[k].col)).size,3);
 assert.equal(by.d.cols,1);assert.equal(by.d.col,0);
});
test('more than three concurrent events collapse into a +N block',()=>{
 const fn=html.slice(html.indexOf('function dayEventBoxes('),html.indexOf('function weekView('));const ctx=vm.createContext({});vm.runInContext(fn,ctx);
 const boxes=ctx.dayEventBoxes(['a','b','c','d','e'].map(id=>({id,start:'09:00',end:'10:00'})));
 const more=boxes.find(b=>b.more);
 assert.equal(more.more,3);assert.equal(more.cols,3);assert.equal(more.col,2);
 assert.equal(boxes.filter(b=>b.e&&!b.hidden).length,2);assert.equal(boxes.filter(b=>b.hidden).length,3);
 assert.ok(boxes.every(b=>b.cols<=3));
});
test('下午4點 is saved by the actual task scheduling flow as 16:00–17:00',()=>{
 const schedule=html.slice(html.indexOf('function scheduleTask('),html.indexOf('\n}',html.indexOf('function scheduleTask('))+2);
 Object.assign(c,{tasks:[{id:'task',title:'下午4點',due:'2026-10-10'}],events:[],crypto:{randomUUID:()=> 'event'},selectedTz:'Asia/Taipei',save(){},saveTasks(){},toast(){},render(){},parse:s=>s});
 vm.runInContext(schedule+';scheduleTask("task");',c);assert.equal(c.events[0].start,'16:00');assert.equal(c.events[0].end,'17:00');
});

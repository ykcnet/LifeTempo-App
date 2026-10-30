import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');const code=html.slice(html.indexOf('function parseNaturalTime('),html.indexOf('function openNaturalInput('));
const c=vm.createContext({today:new Date(2026,9,10),pad:n=>String(n).padStart(2,'0'),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});vm.runInContext(code,c);
for(const [input,start,end] of [['下午4點','16:00','17:00'],['下午４點開會','16:00','17:00'],['下午四點半開會','16:30','17:30'],['上午9點到下午4點開會','09:00','16:00'],['下午3點到4點開會','15:00','16:00'],['23:30到01:00值班','23:30','01:00'],['買4個蘋果','09:00','10:00']])test(input,()=>{const r=c.parseNaturalLanguage(input);assert.equal(r.start,start);assert.equal(r.end,end)});
test('下午4點 is saved by the actual task scheduling flow as 16:00–17:00',()=>{
 const schedule=html.slice(html.indexOf('function scheduleTask('),html.indexOf('\n}',html.indexOf('function scheduleTask('))+2);
 Object.assign(c,{tasks:[{id:'task',title:'下午4點',due:'2026-10-10'}],events:[],crypto:{randomUUID:()=> 'event'},selectedTz:'Asia/Taipei',save(){},saveTasks(){},toast(){},render(){},parse:s=>s});
 vm.runInContext(schedule+';scheduleTask("task");',c);assert.equal(c.events[0].start,'16:00');assert.equal(c.events[0].end,'17:00');
});

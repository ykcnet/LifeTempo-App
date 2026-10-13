import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function scheduleTask('),html.indexOf('\n}',html.indexOf('function scheduleTask('))+2);
function run(title,existing,fail=false){
 const c={tasks:[{id:'task',title,due:'2026-10-12',done:false}],events:existing?[existing]:[],crypto:{randomUUID:()=> 'new-event'},save(){if(fail)throw Error('full');c.saved=true},saveTasks(){},toast(){},selectedTz:'Asia/Taipei',query:'old',category:'工作',attendeeFilter:'someone',calendarFilter:'other',parseNaturalLanguage:()=>({title:'開會',date:'2026-10-11',start:'15:00',end:'16:00'}),parse:s=>s,render(){},openModal(){throw Error('must not open editor')}};vm.createContext(c);vm.runInContext(source+';scheduleTask("task");',c);return c;
}
test('task parsing saves directly and opens its calendar date without an editor',()=>{const c=run('明天下午3點開會');assert.equal(c.view,'日');assert.equal(c.cursor,'2026-10-11');assert.equal(c.events[0].sourceTaskId,'task');assert.equal(c.tasks[0].done,false);assert.equal(c.tasks[0].eventId,c.events[0].id);assert.equal(c.saved,true);assert.equal(c.query,'');});
test('task selected date is used when text has no date',()=>{assert.equal(run('開會').events[0].date,'2026-10-12');});
test('already scheduled task goes to linked event without duplicating it',()=>{const event={id:'event',sourceTaskId:'task',date:'2026-10-15',calendarId:'personal'};const c=run('開會',event);assert.equal(c.events.length,1);assert.equal(c.cursor,'2026-10-15');});
test('failed save preserves the task and does not leave a phantom event',()=>{const c=run('開會',null,true);assert.equal(c.events.length,0);assert.equal(c.tasks.length,1);assert.equal(c.tasks[0].eventId,undefined);});
const editStart=html.indexOf('function updateTaskTitle(');
const editEnd=html.indexOf('\nfunction scheduleTask(',editStart);
const editSource=html.slice(editStart,editEnd);
function editTask(value,fail=false,key='click'){
 const element={style:{},attributes:{},closest:()=>({dataset:{task:'task'}}),setAttribute(name,text){this.attributes[name]=text}};
 const c={tasks:[{id:'task',title:'舊標題',eventId:'event'}],events:[{id:'event',sourceTaskId:'task',title:'舊標題'}],document:{querySelectorAll:()=>[element]},prompt:()=>value,save(){if(fail)throw Error('full');c.eventSaved=true},saveTasks(){c.tasksSaved=true},render(){c.rendered=true},toast(message){c.message=message}};
 vm.createContext(c);vm.runInContext(editSource+'\nbindTaskTitleEdits();',c);
 if(key==='Enter')element.onkeydown({key,preventDefault(){c.defaultPrevented=true}});else element.onclick();
 return {c,element};
}
test('task title editing updates its linked event and supports keyboard access',()=>{
 const {c,element}=editTask('新標題');
 assert.equal(c.tasks[0].title,'新標題');assert.equal(c.events[0].title,'新標題');
 assert.equal(c.tasksSaved,true);assert.equal(c.eventSaved,true);assert.equal(c.rendered,true);
 assert.equal(element.attributes.role,'button');assert.equal(element.attributes.tabindex,'0');
	const keyboard=editTask('鍵盤標題',false,'Enter');
	assert.equal(keyboard.c.tasks[0].title,'鍵盤標題');assert.equal(keyboard.c.defaultPrevented,true);
});
test('task title editing rejects blank titles and rolls back when event saving fails',()=>{
 const blank=editTask('   ');assert.equal(blank.c.tasks[0].title,'舊標題');assert.equal(blank.c.message,'待辦事項不可空白');
 const failed=editTask('新標題',true);assert.equal(failed.c.tasks[0].title,'舊標題');assert.equal(failed.c.events[0].title,'舊標題');assert.equal(failed.c.rendered,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const server=fs.readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
const planner=fs.readFileSync(new URL('./ai-planner.js',import.meta.url),'utf8');
function backend(fetch) {
  const env=Object.fromEntries(['OPENAI','OPENROUTER','ANTHROPIC','GEMINI','DEEPSEEK','GROQ','COHERE','MISTRAL','TOGETHER'].map(p=>[p+'_API_KEY','']));
  const ctx=vm.createContext({...env,fetch,AbortSignal,console});
  vm.runInContext(server.slice(server.indexOf('async function callLLM'),server.indexOf('function generateMockPlan')),ctx);
  return ctx;
}
test('missing key produces actionable error without network calls',async()=>{
  const ctx=backend(()=>{throw Error('Unexpected network call')});
  const result=await ctx.callLLM('test','openai','gpt-4o-mini',{});
  assert.match(result.error,/API Key/);
});
test('provider errors are reported without exposing credentials or changing providers',async()=>{
  let calls=0;
  const ctx=backend(async()=>{calls++;return {ok:false,status:401}});
  const result=await ctx.callLLM('test','openai','test-model',{provider:'openai',key:'test-secret'});
  assert.match(result.error,/401/);
  assert.doesNotMatch(result.error,/test-secret/);
  assert.equal(calls,1);
});
test('successful provider response preserves the selected model',async()=>{
  const ctx=backend(async(url,options)=>{
    assert.equal(JSON.parse(options.body).model,'test-model');
    assert.ok(options.signal);
    return {ok:true,json:async()=>({choices:[{message:{content:'{"events":[]}'}}]})};
  });
  const result=await ctx.callLLM('test','openai','test-model',{provider:'openai',key:'test-key'});
  assert.equal(result.model,'test-model');
  assert.equal(result.provider,'openai');
});
test('AI planner opens and wires the generate button without runtime exceptions',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map();
  const node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:''});return nodes.get(key)};
  const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>null},AI_PROVIDERS:[{value:'browser',label:'瀏覽器內建 AI',models:[]}],getDefaultAIProvider:()=> 'browser',root:{insertAdjacentHTML(){}},iso:()=> '2026-10-10',esc:String,COLORS:{工作:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{},location:{protocol:'file:'}});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  assert.doesNotThrow(()=>ctx.openAIPlan());
  assert.equal(typeof node('#aiPlanWrap #aiGenerate').onclick,'function');
  assert.match(node('#aiPlanWrap #aiStatusTip').textContent,/瀏覽器內建 AI/);
});

test('AI planner displays the same default provider selected by settings',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(key)};
  const root={insertAdjacentHTML(_where,markup){this.markup=markup}};
  const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>null},AI_PROVIDERS:[{value:'gemini',label:'Gemini',models:[{id:'test'}]}],getDefaultAIProvider:()=> 'gemini',root,iso:()=> '2026-10-10',esc:String,COLORS:{工作:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{},location:{protocol:'http:'}});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  ctx.openAIPlan();
  assert.match(root.markup,/目前使用：Gemini/);
});

test('desktop AI plan export contains only the reviewed itinerary events',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const start=html.indexOf('function exportAIPlanForMobile('),end=html.indexOf('\n}',start)+2;
  let exported,filename,mimeType,message;
  const events=[{title:'赤崁樓',date:'2026-10-24',start:'09:00',end:'10:30'}];
  const ctx=vm.createContext({aiPlanState:{events},today:new Date(2026,9,15),iso:()=> '2026-10-15',download:(name,text,type)=>{filename=name;exported=JSON.parse(text);mimeType=type},toast:value=>message=value});
  vm.runInContext(html.slice(start,end)+';exportAIPlanForMobile()',ctx);
  assert.equal(filename,'lifetempo-ai-plan-2026-10-15.json');
  assert.equal(mimeType,'application/json');
  assert.deepEqual(exported.events,events);
  assert.equal(Object.hasOwn(exported,'tasks'),false);
  assert.match(message,/已匯出/);
});

test('mobile planner preserves the saved browser AI provider when the device API is unsupported',async()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',checked:false,setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(key)};
  const root={insertAdjacentHTML(_where,markup){this.markup=markup}};
  let requestedProvider;
  const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>JSON.stringify({provider:'browser'})},AI_PROVIDERS:[{value:'browser',label:'瀏覽器內建 AI',models:[]},{value:'gemini',label:'Gemini',models:[{id:'test'}]}],getDefaultAIProvider:()=> 'gemini',BrowserAI:{isSupported:()=>false,generate:async payload=>{requestedProvider=payload.provider;throw Error('此瀏覽器尚未提供內建 AI')}},AIPlanner:{},root,iso:()=> '2026-10-10',esc:String,COLORS:{旅遊:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{matchMedia:()=>({matches:true})},location:{protocol:'http:'},AIRequest:{parse:()=>({})}});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  ctx.openAIPlan();
  const field=id=>node('#aiPlanWrap #'+id);
  field('aiPrompt').value='安排台南行程';field('aiStart').value='2026-10-10';field('aiEnd').value='2026-10-10';field('aiCategory').value='旅遊';
  assert.match(root.markup,/目前使用：瀏覽器內建 AI/);
  await field('aiGenerate').onclick();
  assert.equal(requestedProvider,'browser');
});
test('travel fallback uses sightseeing rather than work and respects busy slots',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const ctx=vm.createContext({iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
  vm.runInContext(html.slice(html.indexOf('function genMockPlanClient'),html.indexOf('function addDays')),ctx);
  const plan=ctx.genMockPlanClient({prompt:'台南旅遊',category:'旅遊',location:'台南',startDate:'2026-10-10',endDate:'2026-10-11',existingEvents:[{date:'2026-10-10',start:'09:00',end:'10:00'}]});
  assert.ok(plan.events.length>0);
  assert.ok(plan.events.every(e=>e.category==='旅遊'&&e.place==='台南'));
  assert.ok(plan.events.some(e=>e.title.includes('景點')));
  assert.ok(plan.events.some(e=>e.title.includes('返程')));
  assert.ok(plan.events.every(e=>!/工作|文書|會議/.test(e.title)));
  assert.ok(plan.events.every(e=>e.date!=='2026-10-10'||e.end<='09:00'||e.start>='10:00'));
});
test('travel AI instruction includes routing, multi-day overnight stays and omits generic work hours',async()=>{
  let instruction='';
  const ctx=vm.createContext({callLLM:async prompt=>{instruction=prompt;return {error:'test only'}}});
  vm.runInContext(planner,ctx);
  vm.runInContext(server.slice(server.indexOf('async function generatePlan'),server.indexOf('const port =')),ctx);
  await ctx.generatePlan({prompt:'安排台南三天兩夜自由行',category:'旅遊',startDate:'2026-10-24',endDate:'2026-10-26'});
  assert.match(instruction,/順路動線/);
  assert.match(instruction,/除非使用者明確要求工作或會議/);
  assert.match(instruction,/預設在目的地住宿/);
  assert.match(instruction,/中間日期留在目的地附近活動與住宿/);
  assert.doesNotMatch(instruction,/工作時間建議 09:00-18:00/);
});
test('generic travel responses are rejected while specific recommendations are accepted',async()=>{
  let title='上午景點遊覽';
  const ctx=vm.createContext({callLLM:async()=>({provider:'test',model:'test',content:JSON.stringify({summary:'台南文化之旅',events:[{title,date:'2026-10-10',start:'09:00',end:'10:30',category:'旅遊',place:'台南市赤崁樓',notes:'欣賞歷史建築'}]})})});
  vm.runInContext(planner,ctx);
  vm.runInContext(server.slice(server.indexOf('async function generatePlan'),server.indexOf('const port =')),ctx);
  const generic=await ctx.generatePlan({prompt:'台南旅遊',category:'旅遊'});
  assert.match(generic.error,/通用行程/);
  assert.equal(generic.events.length,0);
  title='參觀赤崁樓';
  const concrete=await ctx.generatePlan({prompt:'台南旅遊',category:'旅遊'});
  assert.equal(concrete.mode,'llm');
  assert.equal(concrete.events[0].title,'參觀赤崁樓');
  assert.equal(concrete.events[0].place,'台南市赤崁樓');
});
test('generate click shows progress and actionable failure, then allows retry',async()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map();
  const node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(key)};
  let finish;
  const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>JSON.stringify({provider:'gemini'})},AI_PROVIDERS:[{value:'gemini',label:'Gemini',models:[{id:'test'}]}],getDefaultAIProvider:()=> 'gemini',root:{insertAdjacentHTML(){}},iso:()=> '2026-10-10',esc:String,COLORS:{旅遊:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{},location:{protocol:'http:'},AIRequest:{parse:()=>({})},AbortSignal,fetch:()=>new Promise(resolve=>{finish=resolve})});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  ctx.openAIPlan();
  const field=id=>node('#aiPlanWrap #'+id);
  field('aiStart').value='2026-10-10';field('aiEnd').value='2026-10-10';
  field('aiCategory').value='旅遊';
  await field('aiGenerate').onclick();
  assert.match(field('aiStatusTip').textContent,/請填寫行程需求描述/);
  field('aiPrompt').value='台南旅遊';
  field('aiStart').value='2026-10-10';field('aiEnd').value='2026-10-11';
  const pending=field('aiGenerate').onclick();
  assert.equal(field('aiGenerate').disabled,true);
  assert.equal(field('aiGenerate').textContent,'正在規劃…');
  finish({ok:true,headers:{get:()=> 'application/json'},json:async()=>({error:'尚未設定 API Key'})});
  await pending;
  assert.match(field('aiStatusTip').textContent,/尚未設定 API Key/);
  assert.equal(field('aiGenerate').disabled,false);
  assert.equal(field('aiGenerate').textContent,'🚀 開始規劃行程');
  ctx.AIRequest=undefined;
  field('aiPrompt').value='修改需求';
  await field('aiGenerate').onclick();
  assert.match(field('aiStatusTip').textContent,/解析失敗/);
});

test('AI accepts structured dates, location and category without a prose prompt on desktop and mobile',async()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  for(const mobile of [false,true]) {
    const nodes=new Map();
    const node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(key)};
    let payload;
    const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>JSON.stringify({provider:'gemini'})},AI_PROVIDERS:[{value:'browser',label:'瀏覽器內建 AI',models:[]},{value:'gemini',label:'Gemini',models:[{id:'test'}]}],getDefaultAIProvider:()=> 'gemini',BrowserAI:{isSupported:()=>false},root:{insertAdjacentHTML(){}},iso:date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,esc:String,COLORS:{工作:'#fff',旅遊:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{matchMedia:()=>({matches:mobile})},location:{protocol:'http:'},AIRequest:{parse:()=>({})},AbortSignal,fetch:async(url,options)=>{payload=JSON.parse(options.body);return {ok:false,status:503,headers:{get:()=> 'application/json'}}}});
    vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
    ctx.openAIPlan();
    const field=id=>node('#aiPlanWrap #'+id);
    field('aiStart').value='2026-10-24';field('aiEnd').value='2026-10-26';
    field('aiLocation').value='台南';field('aiCategory').value='旅遊';
    await field('aiGenerate').onclick();
    assert.match(payload.prompt,/2026-10-24 至 2026-10-26/);
    assert.match(payload.prompt,/台南/);
    assert.match(payload.prompt,/旅遊/);
    assert.equal(payload.provider,'gemini');
    assert.equal(payload.location,'台南');assert.equal(payload.category,'旅遊');
  }
});

test('Android AI plan requests use the configured self-hosted endpoint and owner token',async()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',checked:false,setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(key)};
  let request;
  const ctx=vm.createContext({today:new Date(2026,9,9),localStorage:{getItem:()=>JSON.stringify({provider:'gemini'})},AI_PROVIDERS:[{value:'browser',label:'瀏覽器內建 AI',models:[]},{value:'gemini',label:'Gemini',models:[{id:'gemini-test'}]}],getDefaultAIProvider:()=> 'gemini',calendarAIEndpoint:()=> 'https://calendar.example.com/api/ai/plan',calendarAIHeaders:()=>({'Content-Type':'application/json',Authorization:'Bearer owner-test-token'}),root:{insertAdjacentHTML(){}},iso:()=> '2026-10-10',esc:String,COLORS:{旅遊:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{LifeTempoWidget:{}},location:{protocol:'https:'},AIRequest:{parse:()=>({})},AbortSignal,fetch:async(url,options)=>{request={url,options};return {ok:false,status:503,headers:{get:()=> 'application/json'},json:async()=>({error:'test response'})}}});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  ctx.openAIPlan();
  const field=id=>node('#aiPlanWrap #'+id);
  field('aiPrompt').value='安排台南行程';field('aiStart').value='2026-10-10';field('aiEnd').value='2026-10-10';field('aiCategory').value='旅遊';
  await field('aiGenerate').onclick();
  assert.equal(request.url,'https://calendar.example.com/api/ai/plan');
  assert.equal(request.options.headers.Authorization,'Bearer owner-test-token');
  assert.equal(JSON.parse(request.options.body).provider,'gemini');
});

async function planWith(events, prompt='安排活動', options={}) {
  const ctx=vm.createContext({callLLM:async()=>({content:JSON.stringify({events})})});
  vm.runInContext(planner,ctx);
  vm.runInContext(server.slice(server.indexOf('async function generatePlan'),server.indexOf('const port =')),ctx);
  return ctx.generatePlan({prompt,timezone:'Asia/Tokyo',...options});
}
const timedEvent={title:'活動',date:'2026-10-24',start:'09:15',end:'10:45'};
test('AI keeps minute precision, overnight end date and planning timezone',async()=>{
  const result=await planWith([{...timedEvent,start:'23:15',end:'01:45',endDate:'2026-10-25'}]);
  assert.equal(result.events[0].start,'23:15');
  assert.equal(result.events[0].end,'01:45');
  assert.equal(result.events[0].endDate,'2026-10-25');
  assert.equal(result.events[0].timezone,'Asia/Tokyo');
});
test('AI infers next-day end date for overnight return events when the model omits it',async()=>{
  const result=await planWith([{...timedEvent,title:'回到基隆',date:'2026-10-25',start:'20:30',end:'01:10'}],'台南旅遊，10月24日至26日往返搭乘高鐵',{startDate:'2026-10-24',endDate:'2026-10-26'});
  assert.equal(result.error,undefined);
  assert.equal(result.events[0].endDate,'2026-10-26');
});
test('invalid clock values and reversed ranges reject the plan',async()=>{
  for(const patch of [{start:'25:00'},{end:'10:99'},{end:'08:00'},{date:'2026-02-30'}]) {
    const result=await planWith([{...timedEvent,...patch}]);
    assert.ok(result.error);assert.equal(result.events.length,0);
  }
});
test('AI retries a zero-duration event and retains the corrected itinerary',async()=>{
  const prompts=[];
  const results=[
    {content:JSON.stringify({events:[{...timedEvent,title:'高速列車到基隆',start:'19:00',end:'19:00'}]})},
    {content:JSON.stringify({events:[{...timedEvent,title:'高速列車到基隆',start:'19:00',end:'21:00'}]})}
  ];
  const ctx=vm.createContext({callLLM:async prompt=>{prompts.push(prompt);return results.shift();}});
  vm.runInContext(planner,ctx);
  vm.runInContext(server.slice(server.indexOf('async function generatePlan'),server.indexOf('const port =')),ctx);
  const result=await ctx.generatePlan({prompt:'台南旅遊，最後一天搭高鐵回基隆',startDate:'2026-10-24',endDate:'2026-10-26'});
  assert.equal(prompts.length,2);
  assert.match(prompts[1],/結束時間必須晚於開始時間/);
  assert.equal(result.error,undefined);
  assert.equal(result.events[0].end,'21:00');
});
test('AI rejects events outside the requested date range',async()=>{
  const result=await planWith([{...timedEvent,date:'2026-10-25'}],'安排活動',{startDate:'2026-10-24',endDate:'2026-10-24'});
  assert.match(result.error,/不在指定日期範圍/);
  assert.equal(result.events.length,0);
});
test('AI rejects overlaps between generated events, including overnight events',async()=>{
  const sameDay=await planWith([
    {...timedEvent,title:'第一站',start:'09:00',end:'10:30'},
    {...timedEvent,title:'第二站',start:'10:00',end:'11:00'}
  ]);
  assert.match(sameDay.error,/時間重疊/);
  const overnight=await planWith([
    {...timedEvent,title:'夜間活動',start:'23:00',end:'01:00',endDate:'2026-10-25'},
    {...timedEvent,title:'隔日活動',date:'2026-10-25',start:'00:30',end:'02:00'}
  ]);
  assert.match(overnight.error,/時間重疊/);
  assert.equal(overnight.events.length,0);
  const allDay=await planWith([
    {...timedEvent,title:'全天行程',allDay:true,endDate:'2026-10-26'},
    {...timedEvent,title:'隔日活動',date:'2026-10-25'}
  ]);
  assert.match(allDay.error,/時間重疊/);
});
test('AI rejects conflicts with busy calendar events but permits adjacent slots',async()=>{
  const conflict=await planWith([{...timedEvent,start:'10:00',end:'11:00'}],'安排活動',{
    existingEvents:[{date:'2026-10-24',start:'09:30',end:'10:15'}]
  });
  assert.match(conflict.error,/忙碌時段重疊/);
  const adjacent=await planWith([{...timedEvent,start:'10:00',end:'11:00'}],'安排活動',{
    existingEvents:[{date:'2026-10-24',start:'09:00',end:'10:00'}]
  });
  assert.equal(adjacent.error,undefined);
  assert.equal(adjacent.events.length,1);
  const midnight=await planWith([{...timedEvent,date:'2026-10-25',start:'00:00',end:'01:00'}],'安排活動',{
    existingEvents:[{date:'2026-10-24',start:'23:00',end:'24:00'}]
  });
  assert.equal(midnight.error,undefined);
  const allDay=await planWith([{...timedEvent,start:'10:00',end:'11:00'}],'安排活動',{
    existingEvents:[{date:'2026-10-24',allDay:true}]
  });
  assert.match(allDay.error,/忙碌時段重疊/);
});
test('morning and afternoon cannot collapse into the default one hour slot',async()=>{
  const result=await planWith([{...timedEvent,start:'09:00',end:'10:00'}],'上午參觀展覽，下午逛街');
  assert.match(result.error,/拆分時段/);
  const split=await planWith([{...timedEvent,title:'參觀展覽'}, {...timedEvent,title:'逛街',start:'14:00',end:'16:30'}],'上午參觀展覽，下午逛街');
  assert.equal(split.events.length,2);
});
test('true all-day event has an exclusive end date',async()=>{
  const result=await planWith([{...timedEvent,allDay:true}],'全天休假');
  assert.equal(result.events[0].endDate,'2026-10-25');
});

test('confirm inserts separate morning and afternoon slots and preserves end dates',()=>{
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const nodes=new Map();
  const node=key=>{if(!nodes.has(key))nodes.set(key,{style:{},value:'',textContent:'',remove(){}});return nodes.get(key)};
  const ctx=vm.createContext({today:new Date(2026,9,11),localStorage:{getItem:()=>null},AI_PROVIDERS:[{value:'gemini',label:'Gemini',models:[]}],getDefaultAIProvider:()=> 'gemini',root:{insertAdjacentHTML(){}},iso:()=> '2026-10-24',esc:String,COLORS:{工作:'#fff'},calendars:[],calendarFilter:'',document:{querySelector:node,getElementById:node},$:node,window:{},location:{protocol:'file:'},permissionFor:()=> 'full-access',confirm:()=>true,crypto:{randomUUID:()=>String(Math.random())},events:[],selectedTz:'Asia/Taipei',save(){},render(){},toast(){},parse:s=>new Date(s)});
  vm.runInContext(html.slice(html.indexOf('function openAIPlan()'),html.indexOf('function genMockPlanClient')),ctx);
  ctx.openAIPlan();
  vm.runInContext(`aiPlanState.events=[{title:'上午活動',date:'2026-10-24',endDate:'2026-10-24',start:'09:15',end:'11:45',timezone:'Asia/Tokyo'},{title:'下午活動',date:'2026-10-24',endDate:'2026-10-24',start:'14:00',end:'17:30',timezone:'Asia/Tokyo'}]`,ctx);
  node('#aiPlanWrap #aiConfirm').onclick();
  assert.equal(ctx.events.length,2);
  assert.equal(ctx.events[0].start,'09:15');assert.equal(ctx.events[0].end,'11:45');
  assert.equal(ctx.events[1].start,'14:00');assert.equal(ctx.events[1].end,'17:30');
  assert.equal(ctx.events[1].endDate,'2026-10-24');assert.equal(ctx.events[1].timezone,'Asia/Tokyo');
});

test('unambiguous AI date and time formats normalize without losing minutes',async()=>{
  for(const [date,start,end,wantStart,wantEnd] of [
    ['2026/10/24','9:05','10:45','09:05','10:45'],
    ['２０２６年１０月２４日','下午 3:15','4:45 PM','15:15','16:45'],
    ['2026-10-24','09:15:00','11:45:00','09:15','11:45'],
    ['2026-10-24','上午12點','下午12點','00:00','12:00']
  ]) {
    const result=await planWith([{...timedEvent,date,start,end}]);
    assert.equal(result.error,undefined);
    assert.equal(result.events[0].date,'2026-10-24');
    assert.equal(result.events[0].start,wantStart);assert.equal(result.events[0].end,wantEnd);
  }
});
test('all-day events do not require clock fields; false strings stay timed',async()=>{
  const result=await planWith([{title:'休假',date:'2026-10-24',allDay:true}]);
  assert.equal(result.events[0].start,'00:00');assert.equal(result.events[0].endDate,'2026-10-25');
  const timed=await planWith([{...timedEvent,allDay:'false'}]);
  assert.equal(timed.events[0].allDay,false);assert.equal(timed.events[0].start,'09:15');
});
test('24:00 is next-day midnight, while missing or ambiguous times are explained',async()=>{
  const result=await planWith([{...timedEvent,start:'23:15',end:'24:00'}]);
  assert.equal(result.events[0].endDate,'2026-10-25');assert.equal(result.events[0].end,'00:00');
  for(const start of [undefined,'下午','25:00','09:15:30']) {
    const invalid=await planWith([{...timedEvent,title:'活動甲',start}]);
    assert.match(invalid.error,/第 1 筆.*活動甲.*開始時間/);assert.equal(invalid.events.length,0);
  }
  const invalid=await planWith([{...timedEvent,date:'2026/2/30'}]);
  assert.match(invalid.error,/日期「2026\/2\/30」/);
});

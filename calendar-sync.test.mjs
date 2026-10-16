import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import vm from 'node:vm';

const root=path.dirname(fileURLToPath(import.meta.url));

async function freePort(){
  const listener=net.createServer();
  await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;
  await new Promise(resolve=>listener.close(resolve));
  return port;
}

test('owner calendar sync uses revisions and rejects stale writes',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lifetempo-calendar-sync-'));
  const port=await freePort(),token='calendar-sync-test-token';
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{
    cwd:root,
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LIFETEMPO_OWNER_TOKEN:token,LIFETEMPO_DATA_DIR:directory},
    stdio:['ignore','ignore','pipe']
  });
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>stderr+=chunk);
  t.after(async()=>{
    if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,3000))])}
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const base=`http://127.0.0.1:${port}/api/owner/calendar-sync`;
  let ready=false;
  for(let attempt=0;attempt<60&&!ready;attempt++){
    try{ready=(await fetch('http://127.0.0.1:'+port+'/api/health')).ok}catch{}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(ready,true,stderr||'server did not start');

  assert.equal((await fetch(base)).status,401);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const nativeOrigin='https://appassets.androidplatform.net';
  const preflight=await fetch(base,{method:'OPTIONS',headers:{Origin:nativeOrigin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),nativeOrigin);
  const deniedOrigin=await fetch(base,{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}});
  assert.equal(deniedOrigin.headers.get('access-control-allow-origin'),null);
  const aiEndpoint=`http://127.0.0.1:${port}/api/ai/plan`;
  const aiPreflight=await fetch(aiEndpoint,{method:'OPTIONS',headers:{Origin:nativeOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(aiPreflight.status,204);
  assert.equal(aiPreflight.headers.get('access-control-allow-origin'),nativeOrigin);
  assert.match(aiPreflight.headers.get('access-control-allow-methods'),/POST/);
  const aiDeniedOrigin=await fetch(aiEndpoint,{method:'OPTIONS',headers:{Origin:'https://untrusted.example','Access-Control-Request-Method':'POST'}});
  assert.equal(aiDeniedOrigin.headers.get('access-control-allow-origin'),null);
  const aiUnauthorized=await fetch(aiEndpoint,{method:'POST',headers:{Origin:nativeOrigin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(aiUnauthorized.status,401);
  const aiStatusUrl=`http://127.0.0.1:${port}/api/ai/status`;
  const statusPreflight=await fetch(aiStatusUrl,{method:'OPTIONS',headers:{Origin:nativeOrigin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});
  assert.equal(statusPreflight.status,204);
  assert.equal((await fetch(aiStatusUrl,{headers:{Origin:nativeOrigin}})).status,401);
  const aiStatus=await fetch(aiStatusUrl,{headers:{Origin:nativeOrigin,Authorization:`Bearer ${token}`}});
  assert.equal(aiStatus.status,200);
  const aiStatusBody=await aiStatus.json();
  assert.equal(typeof aiStatusBody.providerKeys.gemini,'boolean');
  assert.ok(aiStatusBody.providers.gemini);
  const initial=await fetch(base,{headers:{Authorization:headers.Authorization}});
  assert.equal(initial.status,200);
  assert.deepEqual(await initial.json(),{revision:0,state:null,updatedAt:null});

  const firstState={schemaVersion:1,events:[{id:'event-1',title:'跨裝置行程'}],tasks:[],calendars:[],categories:{工作:'#123456'},inviteChannels:['Email'],settings:{timezone:'Asia/Taipei',clockFormat:'24'}};
  const firstWrite=await fetch(base,{method:'PUT',headers,body:JSON.stringify({revision:0,state:firstState})});
  assert.equal(firstWrite.status,200);
  const firstResult=await firstWrite.json();
  assert.equal(firstResult.revision,1);
  assert.deepEqual(firstResult.state,firstState);

  const staleWrite=await fetch(base,{method:'PUT',headers,body:JSON.stringify({revision:0,state:{...firstState,events:[]}})});
  assert.equal(staleWrite.status,409);
  const conflict=await staleWrite.json();
  assert.equal(conflict.revision,1);
  assert.deepEqual(conflict.state,firstState);

  const nextState={...firstState,events:[...firstState.events,{id:'event-2',title:'新行程'}]};
  const nextWrite=await fetch(base,{method:'PUT',headers,body:JSON.stringify({revision:1,state:nextState})});
  assert.equal(nextWrite.status,200);
  assert.equal((await nextWrite.json()).revision,2);

  const invalid=await fetch(base,{method:'PUT',headers,body:JSON.stringify({revision:2,state:{schemaVersion:2}})});
  assert.equal(invalid.status,400);
});

function setupClientSync(){
  let serverRevision=0,serverState=null,writeCount=0;
  const local=new Map(),session=new Map([['lifetempo.ownerToken','sync-test-token']]);
  const response=(status,value)=>({status,ok:status>=200&&status<300,json:async()=>value});
  const clone=value=>value===null?null:JSON.parse(JSON.stringify(value));
  const fetch=async(_url,options={})=>{
    if(!options.method||options.method==='GET')return response(200,{revision:serverRevision,state:clone(serverState),updatedAt:serverRevision?new Date(0).toISOString():null});
    const body=JSON.parse(options.body);writeCount++;
    if(body.revision!==serverRevision)return response(409,{error:'conflict',revision:serverRevision,state:clone(serverState),updatedAt:new Date(0).toISOString()});
    serverState=body.state;serverRevision++;
    return response(200,{revision:serverRevision,state:clone(serverState),updatedAt:new Date(0).toISOString()});
  };
  const colors={工作:'#6655aa'};
  const context=vm.createContext({
    fetch,TextEncoder,URL,navigator:{onLine:true},window:{},location:{protocol:'http:',origin:'http://localhost:4173'},toast(){},
    document:{querySelector:()=>null},setTimeout,clearTimeout,console,
    localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,String(value))},
    sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,String(value))}
  });
  vm.runInContext(`let events=[{id:'event-1',title:'本機行程'}];let tasks=[];let calendars=[{id:'personal',name:'個人行事曆'}];let COLORS=${JSON.stringify(colors)};let inviteChannels=['Email','LINE','Messenger','微信'];let selectedTz='Asia/Taipei';let clockFormat='24';const DEFAULT_COLORS=${JSON.stringify(colors)};function syncAndroidWidgets(){}function render(){}`,context);
  const source=fs.readFileSync(path.join(root,'booking-client.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('const calendarSyncUrl='),source.indexOf('async function publishBookingService()')),context);
  return {
    context,
    get serverRevision(){return serverRevision;},
    get serverState(){return serverState;},
    get writeCount(){return writeCount;},
    setRemote(state){serverState=clone(state);serverRevision++;}
  };
}

test('native clients require an HTTPS sync server while web clients use their current origin',()=>{
  const client=setupClientSync();
  assert.equal(vm.runInContext('calendarSyncEndpoint()',client.context),'http://localhost:4173/api/owner/calendar-sync');
  assert.equal(vm.runInContext('calendarAIEndpoint()',client.context),'/api/ai/plan');
  vm.runInContext(`window.LifeTempoWidget={};localStorage.setItem('lifetempo.calendarSyncServerUrl','http://192.168.1.5:4173')`,client.context);
  assert.throws(()=>vm.runInContext('calendarSyncEndpoint()',client.context),/必須使用 HTTPS/);
  assert.throws(()=>vm.runInContext('calendarAIEndpoint()',client.context),/必須使用 HTTPS/);
  vm.runInContext(`localStorage.setItem('lifetempo.calendarSyncServerUrl','https://calendar.example.com')`,client.context);
  assert.equal(vm.runInContext('calendarSyncEndpoint()',client.context),'https://calendar.example.com/api/owner/calendar-sync');
  assert.equal(vm.runInContext('calendarAIEndpoint()',client.context),'https://calendar.example.com/api/ai/plan');
  assert.equal(vm.runInContext('calendarAIHeaders().Authorization',client.context),'Bearer sync-test-token');
});

test('one-button Android AI setup reuses the server connection and selects its configured provider',async()=>{
  const client=setupClientSync(),requests=[];
  client.context.window.LifeTempoWidget={};
  client.context.localStorage.setItem('lifetempo.calendarSyncServerUrl','https://calendar.example.com');
  client.context.fetch=async(url,options)=>{
    requests.push({url:String(url),options});
    return {ok:true,status:200,json:async()=>({configured:true,providerKeys:{gemini:true},providers:{gemini:{configured:true,models:[{id:'gemini-2.5-flash'}]}}})};
  };
  assert.equal(await client.context.connectAndroidAIBackend(),true);
  assert.equal(requests[0].url,'https://calendar.example.com/api/ai/status');
  assert.equal(requests[0].options.headers.Authorization,'Bearer sync-test-token');
  assert.equal(JSON.parse(client.context.localStorage.getItem('lifetempo.aiKeys')).provider,'gemini');
  assert.equal(JSON.parse(client.context.localStorage.getItem('lifetempo.aiKeys')).model,'gemini-2.5-flash');
  assert.equal(client.context.sessionStorage.getItem('lifetempo.calendarSyncToken'),'sync-test-token');
  assert.equal(client.context.localStorage.getItem('lifetempo.calendarSyncToken'),null);
});

test('fresh devices pull server data even when their device timezone differs',async()=>{
  const client=setupClientSync(),sync=client.context.window.LifeTempoCalendarSync;
  vm.runInContext('events=[]',client.context);
  client.setRemote({schemaVersion:1,events:[{id:'remote-event',title:'既有行程'}],tasks:[],calendars:[{id:'personal',name:'個人行事曆',permission:'personal-only'}],categories:{工作:'#6655aa'},inviteChannels:['Email','LINE','Messenger','微信'],settings:{timezone:'Europe/London',clockFormat:'12'}});
  assert.equal(await sync.sync(),true);
  assert.ok(vm.runInContext('events.some(event=>event.id==="remote-event")',client.context));
  assert.equal(vm.runInContext('selectedTz',client.context),'Europe/London');
  assert.equal(vm.runInContext('clockFormat',client.context),'12');
});

test('client sync uploads, pulls one-sided changes and requires a choice for divergent edits',async()=>{
  const client=setupClientSync(),sync=client.context.window.LifeTempoCalendarSync;
  assert.equal(await sync.sync(),true);
  assert.equal(client.serverRevision,1);
  assert.equal(client.serverState.events[0].id,'event-1');

  vm.runInContext(`events.push({id:'phone-event',title:'手機修改'})`,client.context);
  client.setRemote({...client.serverState,tasks:[{id:'server-task',title:'電腦待辦'}]});
  const writesBeforeConflict=client.writeCount;
  assert.equal(await sync.sync(),false);
  assert.equal(client.writeCount,writesBeforeConflict);
  assert.equal(sync.getState().conflict,true);

  assert.equal(await sync.keepLocal(),true);
  assert.equal(client.serverRevision,3);
  assert.ok(client.serverState.events.some(event=>event.id==='phone-event'));

  client.setRemote({...client.serverState,tasks:[{id:'new-server-task',title:'新待辦'}]});
  assert.equal(await sync.sync(),true);
  assert.ok(vm.runInContext('tasks.some(task=>task.id==="new-server-task")',client.context));

  vm.runInContext(`events.push({id:'second-phone-event',title:'再次修改'})`,client.context);
  client.setRemote({...client.serverState,tasks:[...client.serverState.tasks,{id:'second-server-task',title:'另一端修改'}]});
  assert.equal(await sync.sync(),false);
  assert.equal(await sync.useServer(),true);
  assert.equal(vm.runInContext('events.some(event=>event.id==="second-phone-event")',client.context),false);
  assert.ok(vm.runInContext('tasks.some(task=>task.id==="second-server-task")',client.context));
});

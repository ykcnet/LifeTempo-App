import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import './drive-sync-core.js';
const C=globalThis.LifeTempoDriveCore;
const state=(titles=[])=>({schemaVersion:1,events:titles.map((title,i)=>({id:'e'+i,title,date:'2026-10-18',start:'09:00',end:'10:00'})),tasks:[],calendars:[{id:'personal',name:'個人'}],categories:{工作:'#123456'},inviteChannels:['Email'],settings:{timezone:'Asia/Taipei',clockFormat:'24'}});
const clone=value=>JSON.parse(JSON.stringify(value));
test('three-way decisions protect simultaneous edits, deletion and first connection',()=>{
  assert.equal(C.decide('a',null,[],true),'upload');
  assert.equal(C.decide('empty','old',['old'],false),'upload');
  assert.equal(C.decide('old','old',['empty'],true),'download');
  assert.equal(C.decide('a',null,['b'],true),'conflict');
  assert.equal(C.decide('a',null,['b'],false),'download');
  assert.equal(C.decide('a','base',['b'],true),'conflict');
  assert.equal(C.decide('a','a',[],true),'conflict');
  assert.equal(C.decide('a','a',['a','b'],true),'conflict');
});
test('immutable version graph retains concurrent branches until explicit resolution',()=>{
  const rows=[{id:'1',parents:[]},{id:'2',parents:['1']},{id:'3',parents:['1']}];
  assert.deepEqual(C.heads(rows).map(r=>r.id),['2','3']);
  assert.deepEqual(C.heads([...rows,{id:'4',parents:['2','3']}]).map(r=>r.id),['4']);
  assert.throws(()=>C.heads([{id:'2',parents:['missing']}]),/不完整/);
});
test('validation rejects invalid versions and duplicate IDs; credentials are excluded',()=>{
  assert.throws(()=>C.validate({...state(),schemaVersion:2}));
  assert.throws(()=>C.validate({...state(),events:[{id:'x'},{id:'x'}]}));
  assert.throws(()=>C.validate({...state(),settings:{timezone:'invalid',clockFormat:'24'}}));
  assert.deepEqual(C.validate({...state(),apiKey:'SECRET',settings:{...state().settings,token:'SECRET'}}),state());
  assert.equal(C.canonical({b:2,a:1}),C.canonical({a:1,b:2}));
});
function drive(){
  const files=[];let counter=0;
  return {files,fail:false,account:'account1',beforeDownload:null,
    async fetch(url,options={}){
      if(this.fail)throw Error('network unavailable');
      assert.equal(options.headers.Authorization,'Bearer TEST');
      if(url.includes('/about?'))return new Response(JSON.stringify({user:{permissionId:this.account,emailAddress:this.account+'@example.com'}}));
      if(options.method==='POST'){
        const parts=options.body.split('\r\n'),json=parts.filter(line=>line.startsWith('{')).map(JSON.parse);
        const file={...json[0],id:String(++counter),createdTime:new Date().toISOString(),content:json[1]};this.files.push(file);
        return new Response(JSON.stringify({id:file.id}));
      }
      if(url.includes('alt=media')){
        if(this.beforeDownload){this.beforeDownload();this.beforeDownload=null;}
        const id=new URL(url).pathname.split('/').at(-1),file=this.files.find(f=>f.id===id);
        return new Response(JSON.stringify(file.content));
      }
      return new Response(JSON.stringify({files:this.files.map(({content,...file})=>file)}));
    }
  };
}
function client(remote,initial=state(),storage=new Map()){
  let local=clone(initial),authPromise;const handlers={};
  const context={console,crypto:webcrypto,TextEncoder,URLSearchParams,AbortSignal,Intl,Date,Blob,URL,setTimeout,clearTimeout,
    navigator:{onLine:true},confirm:()=>true,LifeTempoDriveConfig:{webClientId:'test.apps.googleusercontent.com'},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    document:{querySelector:()=>null,addEventListener:(name,fn)=>handlers[name]=fn,visibilityState:'visible'},
    addEventListener:(name,fn)=>handlers[name]=fn,
    fetch:(...args)=>remote.fetch(...args),calendarSyncSnapshot:()=>clone(local),
    hasCalendarSyncContent:s=>s.events.length>0,applyCalendarSyncState:s=>local=clone(s),
    google:{accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:()=>{authPromise=config.callback({access_token:'TEST',expires_in:3600})}})}}}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync('drive-sync-core.js','utf8'),context);
  vm.runInContext(fs.readFileSync('drive-sync.js','utf8'),context);
  return {api:context.LifeTempoDriveSync,storage,context,handlers,
    async connect(){context.LifeTempoDriveSync.connect();await authPromise;},
    get local(){return local},set local(v){local=clone(v)}};
}
test('two desktops upload/download and propagate deletions without restoring removed events',async()=>{
  const remote=drive(),a=client(remote,state(['one'])),b=client(remote);
  await a.connect();assert.equal(remote.files.length,1);
  await b.connect();assert.deepEqual(b.local,a.local);
  b.local=state([]);await b.api.sync();await a.api.sync();assert.equal(a.local.events.length,0);
  assert.equal(remote.files.length,2);assert.equal(remote.files[0].content.events.length,1);
});
test('offline edits persist, credentials are memory-only and reconnect uploads pending state',async()=>{
  const remote=drive(),a=client(remote,state(['one']));await a.connect();
  a.context.navigator.onLine=false;a.local=state(['offline']);await a.api.sync();assert.equal(remote.files.length,1);
  a.context.navigator.onLine=true;await a.api.sync();assert.equal(remote.files.at(-1).content.events[0].title,'offline');
  assert.ok(![...a.storage.values()].join('').includes('TEST'));
  remote.fail=true;a.local=state(['unsent']);await a.api.sync();assert.equal(a.local.events[0].title,'unsent');
  assert.match(a.api.getState().status,/network/);
});
test('conflicting edits require explicit selection and preserve both historical versions',async()=>{
  const remote=drive(),a=client(remote,state(['base'])),b=client(remote);await a.connect();await b.connect();
  a.local=state(['desktop A']);b.local=state(['desktop B']);await a.api.sync();await b.api.sync();
  assert.ok(b.api.getState().conflict);assert.equal(b.local.events[0].title,'desktop B');
  const chosen=b.api.getState().conflict[0].id;await b.api.resolve(chosen);
  assert.equal(b.local.events[0].title,'desktop A');
  assert.ok(remote.files.some(f=>f.content.events[0]?.title==='desktop B'));
  assert.ok(b.storage.has('lifetempo.drive.recovery'));
  assert.equal(b.api.getState().conflict,null);
});
test('first connection never replaces existing local data without a choice',async()=>{
  const remote=drive(),a=client(remote,state(['remote'])),b=client(remote,state(['local']));await a.connect();await b.connect();
  assert.ok(b.api.getState().conflict);assert.equal(b.local.events[0].title,'local');
});
test('local changes during a download are not overwritten',async()=>{
  const remote=drive(),a=client(remote,state(['base'])),b=client(remote);await a.connect();await b.connect();
  a.local=state(['new remote']);await a.api.sync();remote.beforeDownload=()=>{b.local=state(['new local'])};
  await b.api.sync();assert.equal(b.local.events[0].title,'new local');assert.match(b.api.getState().status,/新修改/);
});
test('corrupt cloud content is rejected before applying',async()=>{
  const remote=drive(),a=client(remote,state(['base']));await a.connect();remote.files[0].content.events[0].title='tampered';
  const b=client(remote);await b.connect();assert.equal(b.local.events.length,0);assert.match(b.api.getState().status,/驗證失敗/);
});
test('switching Google accounts uses an independent sync baseline',async()=>{
  const remote=drive(),a=client(remote,state(['personal']));await a.connect();a.api.disconnect();
  remote.account='account2';remote.files.splice(0);await a.connect();
  assert.ok(a.storage.has('lifetempo.drive.base.account1'));assert.ok(a.storage.has('lifetempo.drive.base.account2'));
});
test('Android authorization bridge supplies a short-lived token to the shared Drive sync flow',async()=>{
  const remote=drive(),a=client(remote,state(['phone']));let usedNativeBridge=false;
  a.context.LifeTempoWidget={};
  a.context.LifeTempoDriveNative={authorize:requestId=>{
    usedNativeBridge=true;a.api.completeNativeAuthorization(requestId,'TEST','');
  }};
  await a.api.connect();
  assert.equal(usedNativeBridge,true);
  assert.equal(remote.files.length,1);
  assert.equal(remote.files[0].content.events[0].title,'phone');
  assert.equal(a.api.getState().account,'account1@example.com');
  assert.ok(![...a.storage.values()].join('').includes('TEST'));
});
test('server sync blocks Google connection and leaves the local state intact',async()=>{
  const remote=drive(),a=client(remote,state(['one']));a.context.LifeTempoCalendarSync={getState:()=>({connected:true})};
  await a.connect();assert.equal(remote.files.length,0);assert.match(a.api.getState().status,/伺服器/);
});
test('simultaneous writers keep both versions and surface a conflict',async()=>{
  const remote=drive(),a=client(remote,state(['base'])),b=client(remote);await a.connect();await b.connect();
  a.local=state(['A']);b.local=state(['B']);await Promise.all([a.api.sync(),b.api.sync()]);
  await a.api.sync();await b.api.sync();
  assert.ok(a.api.getState().conflict);assert.ok(b.api.getState().conflict);
  assert.ok(remote.files.some(f=>f.content.events[0].title==='A'));assert.ok(remote.files.some(f=>f.content.events[0].title==='B'));
});
test('an import failure restores the previous local snapshot',async()=>{
  const remote=drive(),a=client(remote,state(['base'])),b=client(remote);await a.connect();await b.connect();
  a.local=state(['new']);await a.api.sync();
  b.context.applyCalendarSyncState=s=>{b.local=s;if(s.events[0].title==='new')throw Error('storage full')};
  await b.api.sync();assert.equal(b.local.events[0].title,'base');assert.match(b.api.getState().status,/還原/);
});

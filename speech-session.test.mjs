import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
  const natives=[],timers=new Map();let serial=0,ended=0,error='',latest=[];
  class Native {constructor(){natives.push(this)}start(){}stop(){this.onend()}abort(){this.onend()}}
  const ctx=vm.createContext({setTimeout(fn){timers.set(++serial,fn);return serial},clearTimeout(id){timers.delete(id)}});
  vm.runInContext(fs.readFileSync(new URL('./speech-session.js',import.meta.url),'utf8'),ctx);
  const rec=new (ctx.LifeTempoSpeech.wrap(Native))();
  rec.onresult=e=>latest=e.results;rec.onend=()=>ended++;rec.onerror=e=>error=e.error;rec.start();
  return {rec,natives,get ended(){return ended},get error(){return error},get text(){return latest.map(r=>r[0].transcript).join('，')},
    emit(parts){natives.at(-1).onresult({results:parts.map(p=>Object.assign([{transcript:p[0]}],{isFinal:p[1]!==false}))})},
    tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())}};
}
test('four final slots, four callbacks and four copies in one transcript appear once',()=>{
  for(const mode of ['slots','callbacks','inline']){
    const s=setup(),phrase='明天下午三點去公園散步';
    if(mode==='slots')s.emit(Array(4).fill([phrase]));
    if(mode==='callbacks')for(let n=0;n<4;n++)s.emit([[phrase]]);
    if(mode==='inline')s.emit([[phrase.repeat(4)]]);
    assert.equal(s.text,phrase);s.rec.stop();
  }
});
test('cumulative finals and repeated final in interim do not duplicate text',()=>{
  const s=setup();s.emit([['明天開會'],['明天開會，後天運動'],['後天運動',false]]);
  assert.equal(s.text,'明天開會，後天運動');s.rec.stop();
});
test('silence reconnects repeatedly until manual stop, preserving prior speech',()=>{
  const s=setup();s.emit([['明天開會']]);
  for(let n=0;n<4;n++){s.natives.at(-1).onerror({error:'no-speech'});s.natives.at(-1).onend();assert.equal(s.ended,0);s.tick()}
  s.emit([['明天開會'],['後天運動']]);assert.equal(s.text,'明天開會，後天運動');
  s.rec.stop();s.tick();assert.equal(s.natives.length,5);assert.equal(s.ended,1);
});
test('stop during reconnect and cancel prevent another microphone session',()=>{
  for(const action of ['stop','abort']){const s=setup();s.natives[0].onend();s.rec[action]();s.tick();assert.equal(s.natives.length,1);assert.equal(s.ended,1)}
});
test('permission errors end the session without retrying',()=>{
  const s=setup();s.natives[0].onerror({error:'not-allowed'});s.natives[0].onend();s.tick();assert.equal(s.error,'not-allowed');assert.equal(s.ended,1);assert.equal(s.natives.length,1);
});

test('packaged natural input stays open across silence and parses only on manual stop', {skip:!process.env.LIFETEMPO_TEST_HTML},()=>{
  const html=fs.readFileSync(process.env.LIFETEMPO_TEST_HTML,'utf8'),nodes=new Map(),natives=[],timers=[];
  let parses=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',remove(){},click(){this.onclick?.()}});return nodes.get(id)};
  class Native {constructor(){natives.push(this)}start(){}stop(){this.onend()}}
  const ctx=vm.createContext({window:{SpeechRecognition:Native},$:node,root:{insertAdjacentHTML(){}},setTimeout:fn=>timers.push(fn),clearTimeout(){},toast(){},esc:String,formatTime:String,dedupeSpeechText:s=>s,parseNaturalLanguage(){parses++;return{title:'行程',date:'2026-10-29',start:'09:00',end:'10:00',attendees:[]}}});
  vm.runInContext(fs.readFileSync(new URL('./speech-session.js',import.meta.url),'utf8'),ctx);
  const start=html.indexOf('function openNaturalInput()'),end=html.indexOf('const CUSTOM_ENDPOINTS',start);
  vm.runInContext(html.slice(start,end),ctx);ctx.openNaturalInput();node('#voiceInput').click();
  const result=Object.assign([{transcript:'明天下午三點開會'}],{isFinal:true});
  natives[0].onresult({results:[result,result,result,result]});
  assert.equal(node('#nlpText').value,'明天下午三點開會');assert.equal(parses,0);
  natives[0].onend();timers.shift()();assert.equal(natives.length,2);assert.equal(parses,0);
  node('#voiceInput').click();assert.equal(parses,1);assert.equal(node('#voiceInput').textContent,'🎙 開始語音輸入');
});

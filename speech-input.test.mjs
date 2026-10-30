import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(process.env.LIFETEMPO_TEST_HTML || new URL('./index.html',import.meta.url),'utf8');
const start=html.indexOf("  $ai('#aiVoice').onclick = () => {");
const source=html.slice(start,html.indexOf("  $ai('#aiQuickBiz').onclick",start));
function setup(base='') {
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',setAttribute(){}});return nodes.get(id)};
  node('#aiPrompt').value=base;
  const sessions=[],parsed=[];
  class SR { constructor(){this.starts=0;sessions.push(this)} start(){this.starts++} stop(){this.onend()} }
  const ctx=vm.createContext({SR,recognition:null,$ai:node,setTimeout,clearTimeout,parseRequest(){parsed.push(node('#aiPrompt').value)}});
  vm.runInContext(fs.readFileSync(new URL('./speech-session.js',import.meta.url),'utf8'),ctx);
  vm.runInContext(source,ctx);
  node('#aiVoice').onclick();
  return {node,sessions,parsed,emit(parts,index=0){sessions.at(-1).onresult({resultIndex:index,results:parts.map(([text,final=true])=>Object.assign([{transcript:text}],{isFinal:final}))})}};
}

test('mobile replay and revised finals replace the session text without duplication',()=>{
  const ui=setup('原有描述');
  ui.emit([['明天下午三點開會']]);
  ui.emit([['明天下午三點開會']]);
  assert.equal(ui.node('#aiPrompt').value,'原有描述，明天下午三點開會');
  assert.equal(ui.parsed.length,1);
  ui.emit([['明天下午四點開會']]);
  assert.equal(ui.node('#aiPrompt').value,'原有描述，明天下午四點開會');
});
test('interim results stay out of parsing and later segments retain earlier finals',()=>{
  const ui=setup();
  ui.emit([['明天',false]]);
  assert.equal(ui.parsed.length,0);
  ui.emit([['明天開會'],['後天',false]]);
  ui.emit([['明天開會'],['後天運動']],1);
  ui.emit([['明天開會'],['後天運動']],0);
  assert.equal(ui.node('#aiPrompt').value,source.includes('LifeTempoSpeech')?'明天開會，後天運動':'明天開會後天運動');
  assert.equal(ui.parsed.length,2);
});
test('distinct spoken repetitions and a new recording are preserved',()=>{
  const ui=setup();
  ui.emit([['確認'],['確認']],1);
  const repeated=source.includes('LifeTempoSpeech')?'確認，確認':'確認確認';
  assert.equal(ui.node('#aiPrompt').value,repeated);
  ui.node('#aiVoice').onclick();
  ui.node('#aiVoice').onclick();
  ui.emit([['明天開會']]);
  assert.equal(ui.node('#aiPrompt').value,repeated+'，明天開會');
  ui.sessions[0].onresult({results:[Object.assign([{transcript:'過期'}],{isFinal:true})]});
  assert.equal(ui.node('#aiPrompt').value,repeated+'，明天開會');
});

test('stop ends listening without restarting the recognizer',()=>{
  const ui=setup();
  ui.emit([['明天開會']]);
  ui.node('#aiVoice').onclick();
  assert.equal(ui.sessions[0].starts,1);
  assert.equal(ui.node('#aiVoice').textContent,'🎙 語音輸入');
});

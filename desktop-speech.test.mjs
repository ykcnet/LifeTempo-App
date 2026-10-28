import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
test('desktop deployment includes speech controller before app code and offline cache',()=>{
  assert.ok(html.indexOf('src="speech-session.js"')<html.indexOf('function openNaturalInput'));
  for(const file of ['build-pages.mjs','sw.js'])assert.ok(fs.readFileSync(file,'utf8').includes("'speech-session.js'"));
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
test('desktop permission and network failures remain visible after recognition ends',()=>{
  for(const error of ['not-allowed','network','audio-capture']) {
    const nodes=new Map();let native;
    const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',focus(){},remove(){}});return nodes.get(id)};
    class SR {constructor(){native=this}start(){}}
    const ctx=vm.createContext({window:{SpeechRecognition:SR},$:node,root:{insertAdjacentHTML(){}},setTimeout,clearTimeout});
    vm.runInContext(fs.readFileSync('speech-session.js','utf8'),ctx);
    vm.runInContext(html.slice(html.indexOf('function openNaturalInput()'),html.indexOf('const CUSTOM_ENDPOINTS')),ctx);
    ctx.openNaturalInput();node('#voiceInput').onclick();native.onerror({error});native.onend();
    assert.match(node('#nlpVoiceStatus').textContent,/Win \+ H/);
    assert.equal(node('#voiceInput').textContent,'🎙 開始語音輸入');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(process.env.LIFETEMPO_TEST_HTML||'index.html','utf8');
const source=html.slice(html.indexOf('function parseNaturalTime('),html.indexOf('function openNaturalInput('));
const ctx=vm.createContext({today:new Date(2026,9,28),pad:n=>String(n).padStart(2,'0'),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
vm.runInContext(source,ctx);
for(const prefix of ['要','，要','我要','請幫我要','想要','需要'])test('request prefix '+prefix,()=>{
 const result=ctx.parseNaturalLanguage('明天晚上八點半'+prefix+'編輯app軟體');
 assert.equal(result.title,'編輯app軟體');assert.equal(result.date,'2026-10-29');assert.equal(result.start,'20:30');
});
for(const title of ['重要會議','要求供應商報價','要點整理','想法討論','不要刪除備份','需要的材料清單','編輯app軟體'])test('preserves title '+title,()=>{
 assert.equal(ctx.parseNaturalLanguage('明天晚上八點半'+title).title,title);
});

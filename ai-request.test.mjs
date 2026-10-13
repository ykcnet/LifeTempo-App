import test from 'node:test';
import assert from 'node:assert/strict';
import './ai-request.js';
const base=new Date(2026,9,9);
const parse=text=>AIRequest.parse(text,base,'2026-10-10');
test('weekday range associates dates, destination and category',()=>{
  const result=parse('下週一到週三安排台北出差行程');
  assert.equal(result.startDate,'2026-10-12');
  assert.equal(result.endDate,'2026-10-14');
  assert.equal(result.location,'台北');
  assert.equal(result.category,'工作');
});
test('spoken duration uses selected start and travel category',()=>{
  const result=parse('三天兩夜台南旅行');
  assert.equal(result.startDate,undefined);
  assert.equal(result.endDate,'2026-10-12');
  assert.equal(result.location,'台南');
  assert.equal(result.category,'旅遊');
});
test('relative dates and specific venues are linked',()=>{
  const result=parse('明天在體育場慢跑');
  assert.equal(result.startDate,'2026-10-10');
  assert.equal(result.endDate,'2026-10-10');
  assert.equal(result.location,'體育場');
  assert.equal(result.category,'健康');
});
test('explicit year boundary range and invalid dates',()=>{
  const result=parse('2026年12月31日到2027年1月2日旅行');
  assert.equal(result.startDate,'2026-12-31');
  assert.equal(result.endDate,'2027-01-02');
  assert.equal(parse('2026年2月30日').startDate,undefined);
});
test('unspecified fields do not acquire invented values',()=>{
  const result=parse('幫我安排一下');
  assert.equal(result.startDate,undefined);
  assert.equal(result.endDate,undefined);
  assert.equal(result.location,undefined);
  assert.equal(result.category,undefined);
});

for (const [input,start,end] of [
  ['10/24-10/26','2026-10-24','2026-10-26'],
  ['１０／２４－１０／２６台南旅行','2026-10-24','2026-10-26'],
  ['10/24～10/26','2026-10-24','2026-10-26'],
  ['10/24','2026-10-24','2026-10-24'],
  ['10月24日至26日','2026-10-24','2026-10-26'],
  ['12/31-1/2','2026-12-31','2027-01-02'],
  ['2027/12/31-1/2','2027-12-31','2028-01-02'],
  ['大後天','2026-10-12','2026-10-12']
]) test(`date range: ${input}`,()=>{
  const result=parse(input);
  assert.equal(result.startDate,start);
  assert.equal(result.endDate,end);
});
test('invalid slash dates and clock times are not interpreted as dates',()=>{
  for(const input of ['2/30','13/24','下午10:24-10:26']) {
    assert.equal(parse(input).startDate,undefined);
    assert.equal(parse(input).endDate,undefined);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root=new URL('.',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('Pages build emits only the allowlisted static PWA files',()=>{
  execFileSync(process.execPath,['build-pages.mjs'],{cwd:new URL('.',import.meta.url)});
  const output=new URL('./_site/',root);
  for(const file of ['.nojekyll','index.html','manifest.webmanifest','sw.js','ai-request.js','vendor/ical.js','LifeTempo-Icons/android/play-store-512.png','.well-known/assetlinks.json']) {
    assert.equal(fs.existsSync(new URL(file,output)),true,file);
  }
  for(const file of ['server.mjs','data/owner-token','android/app/build.gradle.kts','localization-sources/tw-2027.csv']) {
    assert.equal(fs.existsSync(new URL(file,output)),false,file);
  }
});

test('mobile keeps the AI planner entry and calendar navigation controls',()=>{
  const html=read('index.html');
  assert.match(html,/@media\(min-width:651px\)\{#aiPlanBtn\{display:none!important\}\}/);
  assert.match(html,/id="aiPlanNav"/);
  assert.match(html,/id="prev"/);
  assert.match(html,/id="today"/);
  assert.match(html,/id="next"/);
});

test('phone AI button imports a desktop plan while desktop keeps its AI planner',()=>{
  const html=read('index.html'),enhancements=read('enhancements.js');
  assert.match(html,/if\(\$\('#aiPlanBtn'\)\)\$\('#aiPlanBtn'\)\.onclick=openAIPlan/);
  assert.match(enhancements,/if\(isMobileExperience\(\)&&\$\('#aiPlanBtn'\)\)/);
  assert.match(enhancements,/textContent='匯入桌面版 AI 規劃'/);
  assert.match(enhancements,/onclick=\(\)=>openCalendarImport\(\{desktopAI:true\}\)/);
  assert.match(enhancements,/if\(desktopAI\)panel\.querySelector\('#wizardFile'\)\?\.click\(\)/);
});

test('mobile today/calendar/month navigation clears search and lands on the selected view',()=>{
  const source=read('enhancements.js'),start=source.indexOf('function prepareBottomNavigation('),end=source.indexOf('\n}',start)+2;
  const context=vm.createContext({query:'台南',today:new Date('2026-10-15T00:00:00Z'),cursor:new Date('2026-10-01T00:00:00Z')});
  vm.runInContext(source.slice(start,end),context);
  for(const view of ['日','週','月']){
    context.query='台南';context.cursor=new Date('2026-10-01T00:00:00Z');
    vm.runInContext(`prepareBottomNavigation('${view}')`,context);
    assert.equal(context.query,'');
    assert.equal(context.cursor.toISOString().slice(0,10),view==='日'?'2026-10-15':'2026-10-01');
  }
  for(const selector of ['.bottom-nav [data-goview]','.nav [data-goview]','.view-switch [data-view]','.sidebar [data-mini]','#today','#prev','#next','#pageHome','#pagePrevious','#pageNext']) assert.ok(source.includes(selector),selector);
  assert.match(source,/button\.matches\('\.bottom-nav \[data-goview\]'\)\) prepareBottomNavigation\(nextView\)/);
  assert.match(source,/location\.hostname === 'appassets\.androidplatform\.net'/);
});

test('mobile and desktop navigation scrolls the new view into the screen',()=>{
  const source=read('enhancements.js'),start=source.indexOf('function scrollNavigationToTop('),end=source.indexOf('\n}',start)+2;
  const calls=[],context=vm.createContext({window:{scrollTo:options=>calls.push(['window',options])},document:{querySelector:()=>({scrollTo:options=>calls.push(['main',options])})},requestAnimationFrame:callback=>callback()});
  vm.runInContext(source.slice(start,end)+';scrollNavigationToTop()',context);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['window',{top:0,behavior:'smooth'}],['main',{top:0,behavior:'smooth'}]]);
  assert.match(source,/\.view-switch \[data-view\],\.sidebar \[data-mini\].*#today,#prev,#next,#pageHome,#pagePrevious,#pageNext/);
  assert.match(source,/button\.matches\('\.bottom-nav \[data-goview\]'\)\) prepareBottomNavigation\(nextView\)/);
  assert.match(source,/const previousView=lastRenderedView/);
  assert.match(source,/if\(view!==previousView\)scrollNavigationToTop\(\)/);
});

test('mobile workspace menu exposes full feature names and category controls',()=>{
  const enhancements=read('enhancements.js');
  for(const label of ['空檔預約','共享行事曆','管理共享與權限','行事曆設定','管理分類','我的分類']) assert.ok(enhancements.includes(label),label);
  assert.match(enhancements,/pageViewBack/);
  assert.match(enhancements,/pageViewForward/);
  assert.match(read('index.html'),/@media\(max-width:650px\)\{\.page-navigation/);
  assert.match(enhancements,/option value="共享">管理共享與權限/);
  assert.match(enhancements,/option value="manage-categories">管理分類/);
  assert.match(read('index.html'),/data-invitecalendar=/);
  assert.match(read('index.html'),/data-editcalendar=/);
  assert.match(read('index.html'),/function manageCategories\(\)/);
});

test('mobile hides AI settings only on phones and shared management actions remain visible',()=>{
  const enhancements=read('enhancements.js'),styles=read('localization.css'),html=read('index.html');
  const mobileCheck=enhancements.indexOf('const isMobileExperience');
  const settingsCheck=enhancements.indexOf("if(view==='設定') {\n    if(isMobileExperience())");
  assert.ok(mobileCheck>=0&&settingsCheck>mobileCheck);
  assert.match(enhancements,/if\(view==='設定'\) \{\s*if\(isMobileExperience\(\)\)\{\s*const aiHeading=/);
  assert.match(enhancements,/heading\.textContent\.trim\(\)==='AI 設定'/);
  assert.match(styles,/\.workspace-function \.main>\.tool-row:has\(#createCalendar\)\{display:flex!important;flex-wrap:wrap\}/);
  assert.match(html,/\$\('#createCalendar'\)\)\$\('#createCalendar'\)\.onclick=createCalendar/);
  assert.match(html,/\[data-invitecalendar\].*inviteToCalendar/);
  assert.match(html,/\[data-editcalendar\].*editCalendar/);
});

test('calendar agenda shows category labels and clear today markers',()=>{
  assert.match(read('enhancements.js'),/agenda-category/);
  assert.match(read('enhancements.js'),/month-cell\[data-day=/);
  assert.match(read('localization.css'),/\.day-head\.is-today strong/);
  assert.match(read('localization.css'),/\.month-cell\.is-today \.month-day-number/);
});

test('mobile month date badge and fixed navigation are restricted to phone widths',()=>{
  const enhancements=read('enhancements.js');
  assert.match(enhancements,/if \(isMobileExperience\(\)\) document\.querySelectorAll\('\.month-day'\)/);
  assert.match(read('index.html'),/@media\(max-width:650px\)\{\.month-day/);
});

test('desktop and mobile share a responsive page navigation bar',()=>{
  const html=read('index.html');
  assert.match(html,/\.page-navigation\{display:flex;justify-content:flex-end/);
  assert.match(html,/@media\(max-width:650px\)\{\.page-navigation\{display:grid/);
  assert.match(read('enhancements.js'),/id="pageHome"/);
  assert.match(read('enhancements.js'),/id="pagePrevious"/);
  assert.match(read('enhancements.js'),/id="pageNext"/);
});

test('cross-device sync stays behind the authenticated server and leaves static Pages serverless',()=>{
  const client=read('booking-client.js');
  assert.match(client,/api\/owner\/calendar-sync/);
  assert.match(client,/Authorization:`Bearer \$\{token\}`/);
  assert.match(client,/revision/);
  const workflow=read('.github/workflows/pages.yml');
  assert.match(workflow,/node build-pages\.mjs/);
  assert.doesNotMatch(read('build-pages.mjs'),/server\.mjs/);
});

test('Android AI setup uses the authenticated self-hosted backend',()=>{
  assert.match(read('enhancements.js'),/id="androidAISetup"/);
  assert.match(read('booking-client.js'),/async function connectAndroidAIBackend\(\)/);
  assert.match(read('booking-client.js'),/function calendarAIEndpoint\(\)/);
  assert.match(read('booking-client.js'),/function calendarAIHeaders\(\)/);
  assert.match(read('server.mjs'),/nativeApiMethods\[url\.pathname\]/);
  assert.match(read('server.mjs'),/req\.headers\.origin === androidAppOrigin && !authorized\(req\)/);
});

test('PWA manifest and Service Worker resolve within a repository subpath',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.ok(manifest.icons.every(icon=>!icon.src.startsWith('/')));
  assert.match(read('enhancements.js'),/new URL\('sw\.js',appBase\)/);
  assert.match(read('sw.js'),/new URL\('\.\/', self\.location\.href\)/);
});

test('Pages workflow deploys master and uses the static allowlist builder',()=>{
  const workflow=read('.github/workflows/pages.yml');
  assert.match(workflow,/branches: \[master\]/);
  assert.match(workflow,/node build-pages\.mjs/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
});
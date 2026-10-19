// Run with Playwright available via NODE_PATH. Uses disposable browser storage only.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=__dirname;
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404).end();return;}
      res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:360,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    await page.addInitScript(()=>{
      window.visibleWidgetFrames=[];
      const record=()=>{
        const title=document.querySelector('.date-title');
        if(title&&getComputedStyle(document.body).visibility!=='hidden')window.visibleWidgetFrames.push(title.textContent);
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
      window.widgetSnapshots=[];
      window.LifeTempoWidget={updateSnapshot(events){window.widgetSnapshots.push(JSON.parse(events));}};
      localStorage.setItem('lifetempo.timezone','Asia/Taipei');
      localStorage.setItem('lifetempo.events',JSON.stringify([
        {id:'early',title:'同名事件',date:'2026-10-22',start:'11:10',end:'12:00',category:'工作',calendarId:'personal',repeat:'不重複'},
        {id:'clicked',title:'同名事件',date:'2026-10-22',start:'05:30',end:'06:30',timezone:'UTC',category:'工作',calendarId:'personal',repeat:'不重複'}
      ]));
    });
    const url='http://127.0.0.1:'+server.address().port+'/index.html';
    await page.goto(url+'?widget=today&widgetDate=2026-10-22&widgetEventId=clicked&widgetRecurrence=2026-10-22&widgetStart=13%3A30');
    await page.waitForFunction(()=>document.querySelector('[data-edit="clicked"]')?.classList.contains('widget-focused-event'));
    const event=await page.locator('.day-col [data-edit="clicked"]').boundingBox();
    assert.ok(event.y>=0&&event.y<40,JSON.stringify(event));
    assert.ok(event.x>=0&&event.x+event.width<=361,JSON.stringify(event));
    assert.equal(await page.evaluate(()=>window.widgetSnapshots[0].find(e=>e.id==='clicked').start),'13:30');
    assert.ok((await page.locator('.day-col [data-edit="clicked"] small').innerText()).includes('13:30'));
    await page.locator('.bottom-nav [data-goview="日"]').click();
    await page.waitForFunction(()=>{
      const header=document.querySelector('.day-head[data-local-date]');
      return header&&header.getBoundingClientRect().top>=0&&header.getBoundingClientRect().top<40;
    });
    const header=await page.locator('.day-head[data-local-date]').getAttribute('data-local-date');
    const now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    assert.equal(header,today);
    await page.locator('.bottom-nav [data-goview="週"]').click();
    await page.locator('#today').click();
    await page.waitForFunction(date=>{
      const box=document.querySelector(`.day-head[data-local-date="${date}"]`)?.getBoundingClientRect();
      return box&&box.top>=0&&box.top<40&&box.left>=0&&box.right<=innerWidth;
    },today);
    await page.goto(url+'?widget=calendar&widgetDate=2027-02-01');
    await page.waitForFunction(()=>document.querySelector('.date-title')?.textContent==='2027 年 2 月');
    await page.waitForFunction(()=>Math.abs(document.querySelector('.month-grid').getBoundingClientRect().top)<30);
    await page.waitForFunction(()=>!document.documentElement.classList.contains('widget-launch-pending'));
    assert.ok(await page.evaluate(()=>window.visibleWidgetFrames.every(title=>title==='2027 年 2 月')));
    const nav=await page.locator('.bottom-nav [data-goview],.bottom-nav #addMobile').allTextContents();
    assert.deepEqual(nav,['◷今天','▦週曆','▤月曆','＋新增']);
    await page.evaluate(()=>{view='設定';render();});
    await page.locator('[data-zone="UTC"]').click();
    assert.equal(await page.evaluate(()=>window.widgetSnapshots.at(-1).find(e=>e.id==='clicked').start),'05:30');
    await page.evaluate(()=>{window.warmNavigationToken='preserved';});
    assert.equal(await page.evaluate(url=>window.navigateFromWidget(url+'?widget=calendar&widgetDate=2027-03-01'),url),true);
    await page.waitForFunction(()=>!document.documentElement.classList.contains('widget-launch-pending'));
    assert.equal(await page.locator('.date-title').innerText(),'2027 年 3 月');
    assert.equal(await page.evaluate(()=>window.warmNavigationToken),'preserved');
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),1);
    assert.equal(await page.evaluate(url=>window.navigateFromWidget(url+'?widget=todo'),url),true);
    await page.waitForFunction(()=>!document.documentElement.classList.contains('widget-launch-pending'));
    assert.equal(await page.locator('.hero h1').innerText(),'待辦事項');
    assert.equal(await page.evaluate(()=>window.warmNavigationToken),'preserved');
    assert.equal(await page.evaluate(()=>window.navigateFromWidget('https://example.com/index.html?widget=calendar')),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: event/timezone/date navigation, cold launch without homepage frames, warm navigation without reload');
  } finally {await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

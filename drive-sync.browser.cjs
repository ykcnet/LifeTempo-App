// Disposable browser data and mocked Google services; no live credentials or uploads.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const root=__dirname,files=[];let next=0;
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{
      if(error){res.writeHead(404).end();return;}
      res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const errors=[];
    async function page(configured){
      const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.route('https://**/*',async route=>{
        const req=route.request(),url=req.url();
        if(url.includes('accounts.google.com/gsi/client'))return route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>c.callback({access_token:'FAKE',expires_in:3600})})}}};`});
        if(url.startsWith('https://www.googleapis.com/')){
          assert.equal(req.headers().authorization,'Bearer FAKE');
          let data;
          if(url.includes('/about?'))data={user:{permissionId:'test-user',emailAddress:'test@example.com'}};
          else if(req.method()==='POST'){
            const chunks=req.postData().split('\r\n').filter(line=>line.startsWith('{')).map(JSON.parse);
            const row={...chunks[0],id:String(++next),createdTime:new Date().toISOString(),content:chunks[1]};files.push(row);data={id:row.id};
          }else if(url.includes('alt=media'))data=files.find(f=>f.id===new URL(url).pathname.split('/').at(-1)).content;
          else data={files:files.map(({content,...row})=>row)};
          return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
        }
        return route.abort();
      });
      if(configured)await page.route('**/drive-config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.LifeTempoDriveConfig={webClientId:'test.apps.googleusercontent.com'};"}));
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.locator('.nav [data-goview="設定"]').click();await page.locator('#driveSyncPanel').waitFor();return page;
    }
    const missing=await page(false);
    assert.equal(await missing.locator('[data-drive-connect]').isDisabled(),true);
    assert.match(await missing.locator('[data-drive-status]').innerText(),/維護者設定一次/);
    assert.equal(await missing.locator('#calendarSyncConnect').isVisible(),false);
    assert.equal(await missing.locator('#driveSyncPanel input').count(),0);
    const a=await page(true),b=await page(true);
    await a.evaluate(()=>{events=[{id:'drive-event',title:'同步測試',date:'2026-10-18',start:'09:00',end:'10:00',calendarId:'personal',category:'工作'}];save()});
    await a.waitForFunction(()=>window.google?.accounts?.oauth2);await a.locator('[data-drive-connect]').click();
    await a.waitForFunction(()=>window.LifeTempoDriveSync.getState().status==='已同步');
    await b.waitForFunction(()=>window.google?.accounts?.oauth2);await b.locator('[data-drive-connect]').click();
    await b.waitForFunction(()=>window.LifeTempoDriveSync.getState().status==='已同步');
    assert.equal(await b.evaluate(()=>events[0].title),'同步測試');
    await a.evaluate(()=>{events[0].title='A 的更新';save()});await a.locator('[data-drive-sync]').click();
    await a.waitForFunction(()=>window.LifeTempoDriveSync.getState().status==='已同步');
    await b.evaluate(()=>{events[0].title='B 的更新';save()});await b.locator('[data-drive-sync]').click();
    await b.waitForFunction(()=>window.LifeTempoDriveSync.getState().conflict!==null);
    await b.locator('[data-drive-conflict] button').last().click();
    await b.waitForFunction(()=>window.LifeTempoDriveSync.getState().status==='版本差異已處理，資料已同步');
    assert.equal(await b.evaluate(()=>events[0].title),'A 的更新');
    await b.locator('[data-drive-options] summary').click();
    await b.locator('[data-drive-restore]').click();
    assert.equal(await b.evaluate(()=>events[0].title),'B 的更新');
    assert.equal(await b.evaluate(()=>window.LifeTempoDriveSync.getState().connected),false);
    for(const width of [1440,900,700]){
      await b.setViewportSize({width,height:1000});
      assert.equal(await b.locator('#driveSyncPanel').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    }
    assert.deepEqual(errors,[]);console.log('Desktop UI passed: setup notice, two-client sync, conflict choice, recovery, responsive panel.');
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

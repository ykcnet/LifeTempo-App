(function(){
  'use strict';
  if(window.LifeTempoWidget)return; // Desktop approval first; native integration is deferred.
  const C=window.LifeTempoDriveCore,SCOPE='https://www.googleapis.com/auth/drive.appdata';
  const API='https://www.googleapis.com/drive/v3',PREFIX='lifetempo-sync-v1-',KEY='lifetempo.drive.';
  const MAX_BYTES=5_000_000;
  let token='',expires=0,account=null,busy=false,conflict=null,status='尚未連接 Google Drive',authClient=null;
  let libraryPromise=null,libraryFailed=false,session=0;
  const configured=()=>!!window.LifeTempoDriveConfig?.webClientId;
  const snapshot=()=>C.validate(calendarSyncSnapshot());
  const baseKey=()=>KEY+'base.'+account.permissionId;
  function base(){try{return JSON.parse(localStorage.getItem(baseKey()))||{}}catch{return {}}}
  const hash=async state=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(C.canonical(state))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  function setStatus(text){status=text;paint();}
  function remember(digest){localStorage.setItem(baseKey(),JSON.stringify({hash:digest,time:new Date().toISOString()}));conflict=null;}
  function connected(){return !!token&&Date.now()<expires&&!!account;}
  async function request(url,options={}){
    if(!token||Date.now()>=expires)throw Error('授權已到期，請按「連接 Google Drive」重新授權；本機修改仍已保留');
    const response=await fetch(url,{...options,cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if(response.status===401){
      token='';expires=0;
      throw Error('Google 授權已失效，請重新連接');
    }
    if(!response.ok)throw Error(response.status===403?'Google Drive 權限不足或 API 尚未啟用':response.status===429?'Google Drive 忙碌，請稍後再同步':`Google Drive 連線失敗（${response.status}），本機資料已保留`);
    return response;
  }
  async function list(){
    const rows=[];let next='';
    do{
      const params=new URLSearchParams({spaces:'appDataFolder',q:`trashed = false and name contains '${PREFIX}'`,
        fields:'nextPageToken,files(id,name,description,createdTime)',pageSize:'1000'});
      if(next)params.set('pageToken',next);
      const result=await (await request(API+'/files?'+params)).json();
      for(const file of result.files||[]){
        let meta;try{meta=JSON.parse(file.description)}catch{throw Error('雲端版本資訊損壞，已停止同步')}
        if(meta.schema!==1||!Array.isArray(meta.parents)||!/^[a-f0-9]{64}$/.test(meta.hash))throw Error('不支援的雲端版本資訊');
        rows.push({...meta,id:file.id,time:file.createdTime});
      }
      if(rows.length>10000)throw Error('歷史版本超過本版可處理範圍，請先匯出備份並聯絡維護者');
      next=result.nextPageToken;
    }while(next);
    return rows;
  }
  async function download(row){
    const response=await request(API+'/files/'+encodeURIComponent(row.id)+'?alt=media');
    const text=await response.text();
    if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('雲端資料超過 5 MB，未匯入');
    const state=C.validate(JSON.parse(text));
    if(await hash(state)!==row.hash)throw Error('雲端資料驗證失敗，未匯入');
    return state;
  }
  async function upload(state,parents,digest){
    const body=JSON.stringify(state);
    if(new TextEncoder().encode(body).length>MAX_BYTES)throw Error('同步資料超過 5 MB，請先匯出備份');
    const boundary='lifetempo_'+crypto.randomUUID();
    const metadata={name:PREFIX+crypto.randomUUID()+'.json',mimeType:'application/json',parents:['appDataFolder'],
      description:JSON.stringify({schema:1,parents:parents.map(p=>p.id),hash:digest,device:'桌面／瀏覽器'})};
    // Append-only versions: concurrent writers create separate heads, never overwrite.
    const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const file=await (await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart})).json();
    if(!file.id)throw Error('Google Drive 未回傳版本識別碼');
    return file;
  }
  function backup(state){
    // Save before replacing local data. Failure aborts import (e.g. full storage).
    localStorage.setItem(KEY+'recovery',JSON.stringify({time:new Date().toISOString(),state}));
  }
  function apply(state){
    const previous=snapshot();backup(previous);
    const keys=['events','tasks','calendars','categories','inviteChannels','timezone','clockFormat'].map(key=>'lifetempo.'+key);
    const stored=keys.map(key=>[key,localStorage.getItem(key)]);
    // The existing adapter refreshes native widgets and redraws the app.
    try{applyCalendarSyncState(state);}
    catch(error){
      // Storage quota or render failures must not leave a half-imported snapshot.
      for(const key of keys)localStorage.removeItem(key);
      for(const [key,value] of stored)if(value!==null)localStorage.setItem(key,value);
      try{applyCalendarSyncState(previous);}catch{}
      throw Error('無法套用雲端資料，已嘗試還原本機版本；同步前備份仍保留。'+error.message);
    }
  }
  function conflictWith(rows){conflict=rows;setStatus('版本有差異，請選擇保留版本；尚未覆蓋任何資料');}
  function assertSession(id){if(id!==session)throw Error('連線已變更，請重新同步');}
  async function sync(){
    if(busy)return;
    if(!navigator.onLine){setStatus('目前離線，本機修改已保留；恢復網路後再同步');return;}
    if(!connected()){setStatus('請先連接 Google Drive；本機修改已保留');return;}
    // Do not allow two independent sync transports to overwrite each other's base.
    const server=window.LifeTempoCalendarSync?.getState();
    if(server?.connected||server?.running){setStatus('請先暫停伺服器同步並等待完成，再使用 Google Drive 同步');return;}
    busy=true;const currentSession=session;setStatus('正在比對 Google Drive 資料…');
    try{
      const rows=C.heads(await list());assertSession(currentSession);
      const local=snapshot(),digest=await hash(local),decision=C.decide(digest,base().hash,rows.map(r=>r.hash),hasCalendarSyncContent(local));
      if(decision==='conflict'){conflictWith(rows);return;}
      if(decision==='upload'){
        await upload(local,rows,digest);assertSession(currentSession);remember(digest);
        // Re-list so another simultaneous writer is surfaced as a conflict.
        const after=C.heads(await list());
        if(new Set(after.map(r=>r.hash)).size>1){conflictWith(after);return;}
      }else if(decision==='download'){
        const remote=await download(rows[0]);assertSession(currentSession);
        if(await hash(snapshot())!==digest){setStatus('同步期間本機有新修改，請再按一次「立即同步」');return;}
        apply(remote);remember(rows[0].hash);
      }else remember(digest);
      setStatus(await hash(snapshot())===(base().hash)?'已同步':'本機有新修改，將於下次同步上傳');
    }catch(error){setStatus(error.message||'同步失敗，本機資料已保留');}
    finally{busy=false;paint();}
  }
  async function resolve(choice){
    if(busy||!conflict||!connected())return;
    if(!confirm('將採用所選版本作為新的同步版本。取代前會保留本機復原備份，既有雲端版本也會保留。確定繼續？'))return;
    busy=true;setStatus('正在保留版本並處理差異…');
    try{
      const current=C.heads(await list());
      if(C.canonical(current.map(r=>r.id).sort())!==C.canonical(conflict.map(r=>r.id).sort())){conflictWith(current);return;}
      const local=snapshot(),localHash=await hash(local);
      const selected=choice==='local'?local:await download(current.find(r=>r.id===choice));
      if(await hash(snapshot())!==localHash){setStatus('本機資料剛有變更，請重新選擇版本');return;}
      backup(local);
      // Preserve an unsynced local branch before accepting another device's data.
      if(choice!=='local'&&!current.some(r=>r.hash===localHash)){
        const saved=await upload(local,[],localHash);current.push({id:saved.id});
      }
      const digest=await hash(selected);await upload(selected,current,digest);
      if(await hash(snapshot())!==localHash){setStatus('已保留雲端版本；本機有新修改，請再次同步');return;}
      if(choice!=='local')apply(selected);
      remember(digest);setStatus('版本差異已處理，資料已同步');
    }catch(error){setStatus(error.message||'處理失敗，原有資料已保留');}
    finally{busy=false;paint();}
  }
  function loadLibrary(){
    if(window.google?.accounts?.oauth2)return Promise.resolve();
    if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
      libraryFailed=false;
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      const timer=setTimeout(()=>failed(),15000);
      const failed=()=>{clearTimeout(timer);script.remove();libraryPromise=null;libraryFailed=true;reject(Error('無法準備 Google 連線，請確認網路後按「重試連線準備」'))};
      script.onload=()=>{clearTimeout(timer);if(!window.google?.accounts?.oauth2){failed();return;}resolve()};script.onerror=failed;document.head.append(script);
    });
    return libraryPromise;
  }
  async function acceptToken(result){
    try{
      if(result.error||!result.access_token)throw Error('Google 授權未完成；請確認 OAuth 設定或重新連接');
      token=result.access_token;expires=Date.now()+(Number(result.expires_in)||3500)*1000-60000;
      const about=await (await request(API+'/about?fields=user(permissionId,emailAddress)')).json();
      if(!about.user?.permissionId)throw Error('無法辨識 Google Drive 帳號');
      account=about.user;session++;conflict=null;
      localStorage.setItem(KEY+'enabled','1');
      busy=false;await sync();
    }catch(error){token='';account=null;busy=false;setStatus(error.message);}
    finally{paint();}
  }
  function connect(){
    if(busy)return;
    if(!configured()){setStatus('Google 同步服務尚未開通，請聯絡 LifeTempo 維護者；您不需要自行設定 Google Cloud。');return;}
    const server=window.LifeTempoCalendarSync?.getState();
    if(server?.connected||server?.running){setStatus('請先暫停伺服器同步並等待完成，再連接 Google Drive');return;}
    busy=true;setStatus('請在 Google 視窗選擇帳號並授權…');
    if(!window.google?.accounts?.oauth2){busy=false;prepareConnection();return;}
    authClient=google.accounts.oauth2.initTokenClient({client_id:window.LifeTempoDriveConfig.webClientId,scope:SCOPE,
      callback:acceptToken,error_callback:()=>{busy=false;setStatus('授權視窗已關閉或被阻擋，請重新連接')}});
    try{authClient.requestAccessToken({prompt:'select_account'});}catch(error){busy=false;setStatus('無法開啟 Google 授權視窗');}
  }
  function disconnect(){
    if(busy)return;
    session++;token='';expires=0;account=null;conflict=null;localStorage.removeItem(KEY+'enabled');setStatus('已中斷連線；本機資料與雲端歷史版本仍保留');
  }
  function prepareConnection(){
    setStatus('正在準備 Google 連線…');
    const promise=loadLibrary();paint();
    promise.then(()=>setStatus('已準備好，按「連接 Google Drive」即可選擇帳號並同步')).catch(e=>setStatus(e.message));
  }
  function recovery(){
    const text=localStorage.getItem(KEY+'recovery');if(!text){setStatus('目前沒有同步前的復原備份');return;}
    const data=JSON.parse(text);const content=JSON.stringify(data.state,null,2);
    const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='lifetempo-drive-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function restore(){
    if(busy)return;
    try{
      const saved=JSON.parse(localStorage.getItem(KEY+'recovery'));
      if(!saved){setStatus('目前沒有同步前的復原備份');return;}
      const state=C.validate(saved.state);
      if(!confirm('還原同步前備份會取代此裝置目前的行程、待辦與同步設定。還原後會中斷 Drive 連線，請確認內容後再重新連接。繼續？'))return;
      disconnect();apply(state);setStatus('已還原同步前備份，請檢查資料後再連接 Google Drive');
    }catch(error){setStatus('無法還原備份：'+error.message);}
  }
  function paint(){
    const panel=document.querySelector('#driveSyncPanel');if(!panel)return;
    panel.querySelector('[data-drive-status]').textContent=status;
    panel.querySelector('[data-drive-account]').textContent=account?'Google 帳號：'+(account.emailAddress||account.permissionId):'';
    const last=account?base().time:null;
    panel.querySelector('[data-drive-last]').textContent=last?'最後同步：'+new Date(last).toLocaleString():'';
    for(const button of panel.querySelectorAll('button'))button.disabled=busy;
    const active=connected(),ready=!!window.google?.accounts?.oauth2;
    const mainButton=panel.querySelector('[data-drive-connect]');
    mainButton.disabled=busy||!configured()||(!ready&&!libraryFailed);
    mainButton.hidden=active;
    mainButton.textContent=!configured()?'Google 同步服務準備中':!ready?(libraryFailed?'重試連線準備':'正在準備連線…'):account?'重新連接 Google Drive':'連接 Google Drive';
    panel.querySelector('[data-drive-sync]').disabled=busy||!active;
    panel.querySelector('[data-drive-sync]').hidden=!active;
    panel.querySelector('[data-drive-switch]').hidden=!active;
    panel.querySelector('[data-drive-restore]').disabled=busy||!localStorage.getItem(KEY+'recovery');
    panel.querySelector('[data-drive-disconnect]').hidden=!account;
    const step=active?2:busy?1:0;
    panel.querySelectorAll('[data-drive-step]').forEach((item,index)=>{if(index===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current')});
    const box=panel.querySelector('[data-drive-conflict]');box.replaceChildren();box.hidden=!conflict;
    if(conflict){
      const p=document.createElement('p');p.textContent='請選擇完整版本。採用雲端版本會取代本機行程、待辦與同步設定；其他版本會保留於 Drive。';box.append(p);
      const local=document.createElement('button');local.type='button';local.textContent='保留此裝置版本';local.disabled=busy;local.onclick=()=>resolve('local');box.append(local);
      for(const row of conflict){const b=document.createElement('button');b.type='button';b.disabled=busy;b.textContent=`採用雲端版本 · ${row.device||'其他裝置'} · ${new Date(row.time).toLocaleString()}`;b.onclick=()=>resolve(row.id);box.append(b);}
    }
  }
  function mount(parent){
    if(window.LifeTempoWidget)return;
    if(parent.querySelector('#driveSyncPanel'))return;
    const panel=document.createElement('section');panel.id='driveSyncPanel';
    panel.innerHTML='<h4>使用自己的 Google Drive 同步</h4><p>選擇 Google 帳號並同意授權，即可同步行程與待辦。一般使用者不需要設定伺服器或輸入金鑰。</p><ol class="import-steps" aria-label="Google Drive 連線步驟"><li data-drive-step>1. 連接 Google Drive</li><li data-drive-step>2. 選擇帳號並同意</li><li data-drive-step>3. 同步資料</li></ol><p data-drive-account></p><div class="tool-row"><button type="button" class="primary" data-drive-connect>連接 Google Drive</button><button type="button" class="primary" data-drive-sync>立即同步</button></div><p role="status" aria-live="polite" data-drive-status></p><p data-drive-last></p><div class="tool-row" role="alert" data-drive-conflict hidden></div><details><summary>連線說明</summary><p>每台桌面裝置選擇同一個 Google 帳號。首次連線會比對資料；兩端不同時，請選擇要保留的版本。資料保存在您的 Google Drive 專屬空間，AI API Key 不會上傳。</p><p>授權有效時，返回 App 或恢復網路會同步；離線修改仍保存在此裝置。重新開啟 App 或授權到期時，請再按連接按鍵。</p><p>若顯示「服務準備中」，代表維護者尚未開通服務；您不需要自行建立 Google Cloud 專案。目前先開放桌面版，手機版待後續提供。</p></details><details data-drive-options><summary>帳號與備份管理</summary><div class="tool-row"><button type="button" data-drive-switch>切換 Google 帳號</button><button type="button" data-drive-disconnect>中斷連線</button><button type="button" data-drive-recovery>匯出同步前備份</button></div><p>雲端歷史版本保留，不會自動刪除。中斷連線不會刪除資料；本機還原前會再次確認。</p></details>';
    // Only reorganize the sync card: keep server controls and their handlers intact.
    const advanced=document.createElement('details');advanced.dataset.serverSyncOptions='';
    const summary=document.createElement('summary');summary.textContent='進階：自架伺服器同步';advanced.append(summary);
    for(const child of [...parent.children])if(child.tagName!=='H3')advanced.append(child);
    const serverState=window.LifeTempoCalendarSync?.getState();advanced.open=!!serverState?.connected||!!serverState?.conflict;
    parent.append(panel,advanced);
    const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.dataset.driveRestore='';restoreButton.textContent='還原同步前備份';restoreButton.onclick=restore;
    panel.querySelector('[data-drive-options] .tool-row').append(restoreButton);
    panel.querySelector('[data-drive-connect]').onclick=connect;panel.querySelector('[data-drive-sync]').onclick=sync;
    panel.querySelector('[data-drive-switch]').onclick=connect;
    panel.querySelector('[data-drive-disconnect]').onclick=disconnect;panel.querySelector('[data-drive-recovery]').onclick=recovery;
    paint();if(configured()&&!window.google?.accounts?.oauth2&&!libraryPromise)prepareConnection();
  }
  window.LifeTempoDriveSync={mount,sync,connect,disconnect,resolve,isConnected:()=>connected()||busy,
    getState:()=>({connected:connected(),busy,status,account:account?.emailAddress||'',conflict:conflict?.map(row=>({...row}))||null})};
  window.addEventListener('online',()=>{if(localStorage.getItem(KEY+'enabled'))sync()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&localStorage.getItem(KEY+'enabled'))sync()});
  // No popup on startup; web OAuth requires an explicit user gesture after reload.
  if(localStorage.getItem(KEY+'enabled'))status='請連接 Google Drive 以恢復同步；離線修改已保留';
  if(!configured())status='Google 同步服務尚未開通，由 LifeTempo 維護者設定一次即可；您不需要自行設定。';
})();

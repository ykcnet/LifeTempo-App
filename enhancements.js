function searchView() {
  const found = events.filter(matches).sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return `<section class="card agenda"><h3>全站搜尋 · ${found.length} 筆</h3><p class="drag-hint">包含歷史與未來行程；重複行程以系列開始日期顯示。</p>${found.map(e=>`<div class="agenda-item" data-edit="${esc(e.id)}" data-occurrence="${e.date}"><i class="dot" style="background:${color(e)}"></i><span>${esc(e.title)}<small>${e.date} · ${e.allDay?'全天':formatTime(e.start)} · ${esc(e.repeat||'不重複')} ${esc(e.place||'')}</small></span></div>`).join('')||'<p>沒有符合的行程。</p>'}</section>`;
}
exportICS = function(){download(`lifetempo-${iso(today)}.ics`,CalendarCore.toICS(events),'text/calendar')};
importICS = function(text) { return CalendarICS.parse(text); };
const deviceZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
events=events.map(e=>({...e,timezone:e.timezone||deviceZone}));
try {localStorage.setItem('lifetempo.events',JSON.stringify(events));} catch {toast('瀏覽器儲存空間不足，請先匯出備份');}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-calendar]');
  if(!button)return;
  event.stopImmediatePropagation();
  calendarFilter=calendarFilter===button.dataset.calendar?'':button.dataset.calendar;
  view='週';
  render();
},true);
expandEvents=function(from,to,zone=selectedTz){
  const lo=iso(from),hi=iso(to),a=parse(lo),b=parse(hi);a.setDate(a.getDate()-2);b.setDate(b.getDate()+2);
  return CalendarCore.expand(events,iso(a),iso(b)).flatMap(e=>CalendarCore.display(e,zone,deviceZone)).filter(e=>e.displayDate>=lo&&e.displayDate<=hi);
};

const originalRender = render;
render = function () {
  originalRender();
  const workspaceNav = document.querySelector('.nav');
  const manageSharedButton = workspaceNav?.querySelector('[data-goview="共享"]');
  if (manageSharedButton) {
    manageSharedButton.innerHTML = '<span class="icon">♧</span>管理共享與權限';
    const helpButton = manageSharedButton.nextElementSibling;
    if (helpButton?.classList.contains('help-btn')) {
      helpButton.dataset.helpTitle = '管理共享與權限說明';
      helpButton.dataset.helpText = '建立共享行事曆、管理成員權限與邀請記錄。';
      helpButton.removeAttribute('title');
      helpButton.setAttribute('aria-label', '管理共享與權限 使用說明');
    }
    let sharedButton = workspaceNav.querySelector('[data-goview="共享行事曆"]');
    if (!sharedButton) {
      sharedButton = document.createElement('button');
      sharedButton.dataset.goview = '共享行事曆';
      sharedButton.onclick = () => { view = '共享行事曆'; render(); };
      workspaceNav.insertBefore(sharedButton, manageSharedButton);
    }
    sharedButton.className = view === '共享行事曆' ? 'active' : '';
    sharedButton.innerHTML = '<span class="icon">▧</span>共享行事曆';
  }
  if (view === '共享行事曆') {
    const panel = document.querySelector('.main .card.agenda');
    const sharedCalendars = calendars.filter(calendar => calendar.id !== 'personal' && permissionFor({ calendarId: calendar.id }) !== 'personal-only');
    if (panel) {
      panel.innerHTML = `<h3>共享行事曆</h3>${sharedCalendars.length ? sharedCalendars.map(calendar => {
        const access = permissionFor({ calendarId: calendar.id });
        const memberList = (calendar.members || []).join('、') || '尚無成員';
        const eventCount = events.filter(event => (event.calendarId || 'personal') === calendar.id).length;
        return `<article class="agenda-day" style="grid-template-columns:1fr auto"><div><b>${esc(calendar.name)}</b> <span class="pill">${esc(permissionLabels[access] || permissionLabels['personal-only'])}</span><small style="display:block;color:var(--muted);margin-top:6px">擁有者：${esc(calendar.owner || '我')} · 成員：${esc(memberList)} · ${eventCount} 筆行程</small></div><button class="primary" type="button" data-open-shared-calendar="${esc(calendar.id)}">開啟行事曆</button></article>`;
      }).join('') : '<p class="empty">目前沒有可共同存取的行事曆。</p><button class="tool-row" type="button" id="goManageShared">前往管理共享與權限</button>'}`;
      panel.querySelectorAll('[data-open-shared-calendar]').forEach(button => button.onclick = () => {
        calendarFilter = button.dataset.openSharedCalendar;
        view = '週';
        render();
      });
      $('#goManageShared')?.addEventListener('click', () => { view = '共享'; render(); });
    }
  }
  if ($('#systemTheme')) $('#systemTheme').onclick=()=>{
    localStorage.setItem('lifetempo.theme','system');
    applySystemTheme();
  };
  if(view==='設定') {
    const palettes=document.createElement('div');palettes.className='tool-row';
    palettes.innerHTML='<span>主題配色：</span>'+[['#6c5ce7','薰衣草'],['#138a91','湖水綠'],['#be526f','玫瑰']].map(([color,name])=>`<button data-accent="${color}">${name}</button>`).join('');
    $('.main .card')?.append(palettes);
    palettes.querySelectorAll('button').forEach(button=>button.onclick=()=>{localStorage.setItem('lifetempo.accent',button.dataset.accent);applyAccent()});
  }
  const more=document.createElement('button');more.textContent='☰ 更多';
  more.onclick=()=>{
    openFormModal('工作區',`<div class="field full"><label>前往</label><select name="destination"><option>預約</option><option>共享</option><option>設定</option></select></div>`,'開啟',fd=>{view=fd.get('destination');render()});
  };
  $('.bottom-nav')?.append(more);
  applyAccent();
};
function applyAccent(){const accent=localStorage.getItem('lifetempo.accent');if(/^#[a-f\d]{6}$/i.test(accent||''))document.documentElement.style.setProperty('--purple',accent);}

const originalOpenModal = openModal;
openModal = function(event, defaults={}) {
  if(event&&!event.icsData&&event.repeat&&event.repeat!=='不重複'){
    const master=events.find(v=>v.id===event.id)||event;
    const imported={...master,...CalendarICS.parse(CalendarCore.toICS([master]))[0],id:master.id};
    const day=event.occurrence||event.date;
    const occurrence=CalendarICS.expand(imported,day,day).find(o=>o.occurrence===day);
    event=occurrence?{...imported,...occurrence,date:occurrence.occurrence,endDate:occurrence.occurrenceEndDate}:imported;
  }
  if(event?.icsData&&!event.recurrenceKey){
    const day=event.occurrence||event.date;
    const occurrence=CalendarICS.expand(event,day,day).find(o=>o.occurrence===day);
    if(occurrence)event={...event,...occurrence,date:occurrence.occurrence,endDate:occurrence.occurrenceEndDate};
  }
  const attachments = (event?.attachments||defaults.attachments||[]).map(a=>({...a}));
  originalOpenModal(event, {timezone:event?.timezone||selectedTz,...defaults,attachments});
  const form=$('#form');
  if(!form) return;
  const zone=event?.timezone||selectedTz;
  if(event?.icsData&&event.repeat!=='不重複'){
    for(const name of ['repeat','interval','monthlyMode','monthlyOrdinal','until','weekdays'])for(const input of form.querySelectorAll('[name="'+name+'"]'))input.disabled=true;
    const note=document.createElement('p');note.className='field full';note.textContent='此系列保留原始重複規則。預設只修改這一次；如需一併修改，請切換上方套用範圍。';form.querySelector('.form-grid').prepend(note);
  }
  form.elements.date.addEventListener('change',()=>{if(form.elements.endDate.value<form.elements.date.value)form.elements.endDate.value=form.elements.date.value});

  const zoneLabel=document.createElement('p');zoneLabel.className='drag-hint';zoneLabel.textContent='輸入時間的時區：'+zone;form.querySelector('h2').after(zoneLabel);
  if(event?.id?.startsWith('external-booking-')) {
    form.querySelectorAll('input,select,textarea,button[type=submit]').forEach(input=>input.disabled=true);
    form.onsubmit=e=>e.preventDefault();
    if($('#delete')) {$('#delete').textContent='取消外部預約';$('#delete').onclick=()=>cancelExternalBooking(event.id);}
    return;
  }
  const field=document.createElement('div');field.className='field full';
  field.innerHTML='<label>PDF／圖片附件（每筆行程合計 1 MB）</label><input type="file" id="eventFiles" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"><small>附件保存在此瀏覽器，並包含於 JSON 備份。</small><div id="attachmentList"></div>';
  form.querySelector('.form-grid').append(field);
  const update=()=>{
    $('#attachmentList').replaceChildren();
    attachments.forEach((attachment,index)=>{
      const row=document.createElement('div'), link=document.createElement('a'), remove=document.createElement('button');
      link.textContent=attachment.name;link.download=attachment.name;
      if(/^data:(application\/pdf|image\/(png|jpeg|webp|gif));base64,[A-Za-z0-9+/=]+$/.test(attachment.data)) link.href=attachment.data;
      remove.type='button';remove.textContent='移除';remove.onclick=()=>{attachments.splice(index,1);update()};
      row.append(link,' ',remove);$('#attachmentList').append(row);
    });
  };
  update();
  const submit=form.onsubmit;
  form.onsubmit=async e=>{
    e.preventDefault();
    if(form.dataset.saving) return;
    if(!form.elements.allDay.checked && (CalendarCore.instant(form.elements.date.value,form.elements.start.value,zone)===null||CalendarCore.instant(form.elements.endDate.value,form.elements.end.value,zone)===null)) return toast('此時間因夏令時間切換而不存在，請改選其他時間');
    const files=[...$('#eventFiles').files];
    if(files.some(f=>!['application/pdf','image/png','image/jpeg','image/webp','image/gif'].includes(f.type))) return toast('僅支援 PDF、PNG、JPEG、WebP、GIF');
    if(files.reduce((n,f)=>n+f.size,0)+attachments.reduce((n,a)=>n+(a.size||a.data.length*0.75),0)>1048576) return toast('附件合計不能超過 1 MB');
    form.dataset.saving='1';
    const previousEvents=JSON.stringify(events), previousTasks=JSON.stringify(tasks);
    try {
      const incoming=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,size:file.size,data:reader.result});reader.onerror=reject;reader.readAsDataURL(file)})));
      attachments.push(...incoming);$('#eventFiles').value='';update();
      submit(e);
    } catch {events=JSON.parse(previousEvents);tasks=JSON.parse(previousTasks);toast('儲存失敗，請減少附件大小或匯出備份後釋放瀏覽器空間');}
    finally {delete form.dataset.saving;}
  };
};
function applySystemTheme() {
  if (!['dark','light'].includes(localStorage.getItem('lifetempo.theme'))) {
    dark = matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark',dark);
    if (!$('#wrap') && !$('#actionWrap')) render();
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applySystemTheme);

// Preserve the day across month navigation (January 31 -> February 28).
document.addEventListener('click',event=>{
  const button=event.target.closest('#prev,#next,#miniPrev,#miniNext');
  if (!button || !['月','年'].includes(view) && !button.id.startsWith('mini')) return;
  event.stopImmediatePropagation();
  const direction=button.id.toLowerCase().includes('prev')?-1:1, day=cursor.getDate();
  cursor.setDate(1);
  if(view==='年'&&!button.id.startsWith('mini')) cursor.setFullYear(cursor.getFullYear()+direction);
  else cursor.setMonth(cursor.getMonth()+direction);
  cursor.setDate(Math.min(day,new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate()));
  render();
},true);

if ('serviceWorker' in navigator && ['http:','https:'].includes(location.protocol)) {
  navigator.serviceWorker.register('/sw.js').catch(()=>toast('離線快取未啟用，請確認使用 localhost 或 HTTPS'));
}
if (!location.hash.includes('join=')) render();

// Legacy demo data had no source tag. Match the complete untouched seed shape.
const legacyExamples=[['每週團隊同步','09:30','10:30','工作','會議室 A',0],['午間散步','12:30','13:00','健康','',0],['設計提案審閱','14:00','15:30','工作','',0],['專注工作時段','10:00','12:00','工作','',1],['牙醫回診','16:00','17:00','個人','',2],['家庭晚餐','18:30','20:00','家庭','',4]];
function legacyExampleIndex(e){
  const allowed=['id','title','date','start','end','category','place','notes','repeat','reminder','allDay','timezone'];
  if(Object.keys(e).some(k=>!allowed.includes(k))||e.notes!==''||e.repeat!=='不重複'||e.reminder!=='不提醒'||e.allDay!==false)return -1;
  return legacyExamples.findIndex(([title,start,end,category,place])=>e.title===title&&e.start===start&&e.end===end&&e.category===category&&e.place===place);
}
function removeLegacyExamples(candidates){
  if(!candidates.length)return;
  // Backup must succeed before changing any data.
  localStorage.setItem('lifetempo.legacyExamplesBackup.'+Date.now(),JSON.stringify(candidates));
  const ids=new Set(candidates.map(e=>e.id));
  const next=events.filter(e=>!ids.has(e.id));
  localStorage.setItem('lifetempo.events',JSON.stringify(next));events=next;save();
}
function migrateLegacyExamples(){
  if(localStorage.getItem('lifetempo.demoCleanup.v1'))return;
  const candidates=events.filter(e=>legacyExampleIndex(e)>=0);
  const groups=new Map();
  for(const e of candidates){const i=legacyExampleIndex(e),d=parse(e.date);d.setDate(d.getDate()-legacyExamples[i][5]);const key=iso(d);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
  const complete=[...groups.values()].filter(g=>new Set(g.map(legacyExampleIndex)).size===6).flat();
  try{removeLegacyExamples(complete);localStorage.setItem('lifetempo.demoCleanup.v1','1')}catch{toast('範例備份未完成，已保留原資料')}
}
migrateLegacyExamples();
let googleIdentityReady;
function loadGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  if(!googleIdentityReady)googleIdentityReady=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>{googleIdentityReady=null;script.remove();reject(Error('Google 授權元件載入失敗，請檢查網路'))};document.head.append(script)});
  return googleIdentityReady;
}
function openCalendarImport(){
  $('#actionWrap')?.remove();
  const from=new Date(today);from.setFullYear(from.getFullYear()-1);
  const to=new Date(today);to.setFullYear(to.getFullYear()+1);
  const state={step:1,source:'google',incoming:[],from:iso(from),to:iso(to),busy:false,run:0};
  openFormModal('匯入自己的行事曆','<div id="importWizard" class="field full"></div>','關閉',()=>{});
  const wrap=$('#actionWrap'),panel=$('#importWizard');
  wrap.querySelector('.modal-actions').remove();
  wrap.onclick=event=>{if(event.target===wrap&&!state.busy)wrap.remove()};
  const active=run=>wrap.isConnected&&run===state.run;
  const status=text=>{const node=panel.querySelector('[role=status]');if(node)node.textContent=text};
  const button=(id,fn)=>{const node=panel.querySelector('#'+id);if(node)node.onclick=fn};
  function draw(){
    const steps=['選擇來源','連線或選檔','確認內容','完成'];
    panel.innerHTML=`<ol aria-label="匯入步驟" class="import-steps">${steps.map((label,i)=>`<li ${state.step===i+1?'aria-current="step"':''}>${i+1}. ${label}</li>`).join('')}</ol><div id="importStep"></div><p role="status" aria-live="polite"></p><div class="tool-row"><button type="button" id="importBack">上一步</button><button type="button" id="importClose">取消</button></div>`;
    const content=panel.querySelector('#importStep');
    button('importClose',()=>{state.run++;wrap.remove()});
    const back=panel.querySelector('#importBack');back.hidden=state.step===1||state.step===4;
    button('importBack',()=>{state.run++;state.step--;state.incoming=[];draw()});
    if(state.step===1){
      content.innerHTML=`<h3 tabindex="-1">選擇原本使用的行事曆</h3><div class="field"><label for="importSource">行事曆來源</label><select id="importSource">${[['google','Google 日曆'],['outlook','Outlook／Microsoft 365'],['apple','Apple／iCloud 行事曆'],['other','其他行事曆（ICS）'],['backup','LifeTempo 備份（JSON）']].map(([value,label])=>`<option value="${value}" ${value===state.source?'selected':''}>${label}</option>`).join('')}</select></div><p>只匯入你選擇的資料至個人行事曆，不會加入範例。</p><button type="button" class="primary" id="importNext">下一步</button>`;
      button('importNext',()=>{state.source=panel.querySelector('#importSource').value;state.step=2;draw()});
    }else if(state.step===2){
      if(state.source==='google'){
        content.innerHTML=`<h3 tabindex="-1">連線 Google 日曆</h3><p>1. 選擇日期範圍。<br>2. 按「登入 Google」，選擇帳號並允許讀取日曆。<br>3. 檢查主要行事曆的事件，再確認匯入。</p><div class="form-grid"><div class="field"><label for="importFrom">開始日期</label><input id="importFrom" type="date" value="${state.from}"></div><div class="field"><label for="importTo">結束日期</label><input id="importTo" type="date" value="${state.to}"></div></div><p>會選取與日期範圍相交的事件，完整保存系列規則與單次例外；系列在範圍外的日期也會保留。跨日只在畫面上分段，不拆成獨立事件。這是單次匯入，不會自動同步後續異動。</p><button type="button" id="googleImport" class="primary" disabled>登入 Google 並讀取事件</button><button type="button" id="useCalendarFile">改用 Google 匯出的檔案</button>`;
        button('useCalendarFile',()=>{state.run++;state.source='google-file';draw()});
        const run=++state.run;status('正在檢查 Google 連線…');
        fetch('/api/calendar/config').then(r=>{if(r.status===404)throw Error('目前服務尚未支援 Google 連線，請重新啟動 LifeTempo 服務後重新整理頁面；也可先改用檔案匯入。');if(!r.ok)throw Error('無法取得 Google 連線設定，請使用 LifeTempo 本機服務網址開啟，或改用檔案匯入。');return r.json()}).then(async config=>{
          if(!active(run))return;
          if(!config.clientId){panel.querySelector('#googleImport').textContent='Google 登入尚未啟用';status('此版本尚未啟用 Google 登入。請按「改用 Google 匯出的檔案」，依步驟完成匯入。');return}
          await loadGoogleIdentity();if(!active(run))return;
          const connect=panel.querySelector('#googleImport');connect.disabled=false;status('準備完成，請登入你的 Google 帳號。');
          connect.onclick=()=>{
            state.from=panel.querySelector('#importFrom').value;state.to=panel.querySelector('#importTo').value;
            if(!state.from||!state.to||state.from>state.to){status('請填寫有效的開始與結束日期，結束日期不可早於開始日期。');return}
            lock(true);status('請在 Google 視窗完成授權…');
            const failed=message=>{if(!active(run))return;lock(false);status(message)};
            try{const client=google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'https://www.googleapis.com/auth/calendar.readonly',error_callback:()=>failed('登入已取消或視窗被阻擋。請允許彈出視窗後重試，也可改用檔案匯入。'),callback:async response=>{
              if(!active(run))return;
              if(response.error||!response.access_token){failed('未完成日曆授權，請重試或改用檔案匯入。');return}
              try{status('正在讀取事件，尚未加入行事曆…');const incoming=await importGoogleEvents(response.access_token,state.from,state.to,true);if(!active(run))return;state.incoming=incoming;state.busy=false;state.step=3;draw()}catch(error){failed(error.message)}
            }});client.requestAccessToken()}catch{failed('無法開啟 Google 登入，請重試或改用檔案匯入。')}
          };
        }).catch(error=>{if(active(run)){panel.querySelector('#googleImport').textContent='Google 連線暫時無法使用';status(error.message)}});
      }else{
        const guides={
          'google-file':'在電腦開啟 Google 日曆 → 設定 → 匯入及匯出 → 匯出。解壓縮下載的 ZIP，選擇你要匯入的 .ics 檔案。',
          outlook:'先從 Outlook 匯出要使用的行事曆為 .ics 檔案；桌面版可在行事曆的「檔案 → 儲存行事曆」選擇日期範圍。此版本尚未提供 Microsoft 帳號直接連線。',
          apple:'在 Mac 開啟「行事曆」，選取要匯出的行事曆 → 檔案 → 輸出 → 輸出，儲存為 .ics 檔案。',
          other:'在原本的行事曆 App 尋找「匯出」或「備份」，選擇 iCalendar（.ics）格式。若沒有此功能，請先向該 App 確認是否支援匯出。',
          backup:'選擇之前從 LifeTempo 匯出的 JSON 備份。此流程只匯入事件至個人行事曆，不覆寫設定、待辦或共享權限。'
        };
        content.innerHTML=`<h3 tabindex="-1">準備並選擇行事曆檔案</h3><p>1. ${guides[state.source]}</p><p>2. 選擇檔案。<br>3. 下一步檢查事件數量與內容後，再確認匯入。</p><div class="field"><label for="wizardFile">${state.source==='backup'?'JSON 備份':'ICS 行事曆檔案'}</label><input id="wizardFile" type="file" accept="${state.source==='backup'?'.json':'.ics'}"></div><p>ZIP 請先解壓縮。若有多個行事曆，可逐一匯入。</p>`;
        panel.querySelector('#wizardFile').onchange=async event=>{
          const file=event.target.files[0];if(!file)return;const run=++state.run;lock(true);status('正在讀取檔案，尚未儲存…');
          try{const text=await CalendarICS.readFile(file);const incoming=prepareCalendarFile(file.name,text,state.source==='backup');if(!active(run))return;state.incoming=incoming;state.busy=false;state.step=3;draw()}catch(error){if(active(run)){lock(false);status(error.message)}}
        };
      }
    }else if(state.step===3){
      const existing=new Set(events.map(e=>e.id)),updates=state.incoming.filter(e=>existing.has(e.id)).length;
      content.innerHTML=`<h3 tabindex="-1">確認要匯入的事件</h3><p>目的地：個人行事曆</p><p>共 ${state.incoming.length} 筆：新增 ${state.incoming.length-updates} 筆、更新 ${updates} 筆。</p><p>相同 ID 的事件會更新；其他現有事件會保留。</p><ul>${state.incoming.slice(0,10).map(e=>`<li>${esc(e.date)} · ${esc(e.title)}</li>`).join('')}</ul>${state.incoming.length>10?'<p>以上顯示前 10 筆。</p>':''}<button type="button" id="confirmCalendarImport" class="primary" ${state.incoming.length?'':'disabled'}>確認匯入 ${state.incoming.length} 筆事件</button>`;
      if(!state.incoming.length)status('沒有可匯入的事件，請回上一步調整範圍或選擇其他檔案。');
      button('confirmCalendarImport',()=>{lock(true);try{commitCalendarImport(state.incoming);state.busy=false;state.step=4;draw()}catch{lock(false);status('儲存失敗，請釋放瀏覽器空間後重試。原有事件未變更。')}});
    }else{
      content.innerHTML=`<h3 tabindex="-1">匯入完成</h3><p>已將 ${state.incoming.length} 筆事件匯入個人行事曆。</p><p>來源行事曆後續有變動時，可再次匯入。</p><button type="button" class="primary" id="showImportedCalendar">查看個人行事曆</button>`;
      panel.querySelector('#importClose').hidden=true;
      button('showImportedCalendar',()=>{calendarFilter='personal';category='全部';query='';attendeeFilter='';view='月';if(state.incoming[0])cursor=parse(state.incoming[0].date);wrap.remove();render()});
    }
    content.querySelector('h3')?.focus();
  }
  function lock(value){state.busy=value;panel.querySelectorAll('button,input,select').forEach(node=>node.disabled=value)}
  draw();
}
function prepareCalendarFile(name,text,isBackup){
  try{
    if(!name.toLowerCase().endsWith(isBackup?'.json':'.ics'))throw Error();
    const parsed=isBackup?JSON.parse(text):null;
    const rows=isBackup?(Array.isArray(parsed)?parsed:parsed.events):importICS(text);
    if(!Array.isArray(rows))throw Error();
    const merged=new Map();
    for(const e of rows){
      if(!e||typeof e.title!=='string'||!e.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(parse(e.date).getTime())||iso(parse(e.date))!==e.date)throw Error();
      if(e.endDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.endDate)||!Number.isFinite(parse(e.endDate).getTime())||iso(parse(e.endDate))!==e.endDate||e.endDate<e.date))throw Error('結束日期不正確。');
      if(!e.allDay&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start)||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(e.end)))throw Error();
      const id=typeof e.id==='string'&&e.id?e.id:crypto.randomUUID();merged.set(id,{...e,id,calendarId:'personal'});
    }
    return [...merged.values()];
  }catch(error){throw Error(!isBackup&&error.message?error.message:'無法讀取此檔案，請確認格式及事件日期、時間完整。')}
}
function commitCalendarImport(incoming){
  const merged=new Map(events.filter(e=>!incoming.some(n=>n.icsData&&(e.id.startsWith(n.id+'::day:')||e.source==='google'&&e.sourceEventId&&n.id==='google:'+e.sourceCalendar+':'+e.sourceEventId))).map(e=>[e.id,e]));incoming.forEach(e=>merged.set(e.id,e));
  const next=[...merged.values()];localStorage.setItem('lifetempo.beforeImport',JSON.stringify(events));localStorage.setItem('lifetempo.events',JSON.stringify(next));events=next;
  if(sessionStorage.getItem('lifetempo.ownerToken')&&typeof syncBusyPeriods==='function')Promise.resolve(syncBusyPeriods()).catch(()=>toast('事件已匯入，預約忙碌時段稍後再同步'));
}

async function importGoogleEvents(token,from,to,previewOnly=false){
  const request=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Google 讀取失敗，請確認 Calendar API 已啟用及授權有效');return r.json()};
  // Resolve the real calendar ID to keep different Google accounts separate.
  const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const end=parse(to);end.setDate(end.getDate()+1);
  const calendar=await request('https://www.googleapis.com/calendar/v3/calendars/primary');
  const items=[];let pageToken='';
  do{const params=new URLSearchParams({singleEvents:'false',showDeleted:'true',maxResults:'2500'});if(pageToken)params.set('pageToken',pageToken);const data=await request(base+'?'+params);items.push(...(data.items||[]));pageToken=data.nextPageToken||''}while(pageToken);
  const incoming=CalendarICS.fromGoogle(items,calendar).filter(e=>CalendarICS.expand(e,from,to).some(o=>CalendarCore.display(o,selectedTz,selectedTz).some(d=>d.displayDate>=from&&d.displayDate<=to)));
  for(const item of items)if(item.status==='cancelled'&&!item.recurringEventId){const existing=events.find(e=>e.id==='google:'+calendar.id+':'+item.id&&e.icsData);if(existing)incoming.push(CalendarICS.update(existing,null,null,true,true))}
  if(previewOnly)return incoming;
  commitCalendarImport(incoming);
}
const renderBeforeCalendarImport=render;
render=function(){
  renderBeforeCalendarImport();
  if($('#import'))$('#import').onclick=openCalendarImport;
  const bar=$('#clearCalendarFilter')?.parentElement;
  if(bar&&(!calendarFilter||calendarFilter==='personal')){
    const button=document.createElement('button');button.textContent='匯入其他行事曆';button.onclick=openCalendarImport;bar.append(button);
    const candidates=events.filter(e=>legacyExampleIndex(e)>=0);
    if(candidates.length){const clean=document.createElement('button');clean.textContent='清理舊版範例';clean.onclick=()=>{if(confirm('以下行程符合舊版範例，備份後移除？\n'+candidates.map(e=>e.date+' '+e.title).join('\n'))){try{removeLegacyExamples(candidates);render();toast('範例已備份並移除')}catch{toast('清理失敗，請先確認儲存空間')}}};bar.append(clean)}
  }
};
render();

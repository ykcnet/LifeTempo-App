// Same-origin bridge between the offline-first calendar and the booking API.
// The owner token is kept in sessionStorage and never sent to public booking pages.
document.addEventListener('click', event => {
  const button = event.target.closest('#connectBookingService,#publishBookingService,#copyPublicBooking,#configureBooking');
  if (!button) return;
  if (button.id === 'connectBookingService') connectBookingService();
  if (button.id === 'publishBookingService') publishBookingService();
  if (button.id === 'copyPublicBooking') copyPublicBooking();
  if (button.id === 'configureBooking') openBookingConfig();
});

async function connectBookingService() {
  if (location.protocol === 'file:') {
    toast('請先執行 node server.mjs，再透過 http://localhost:4173 開啟 LifeTempo');
    return;
  }
  const token = prompt('貼上啟動伺服器時顯示的 LifeTempo owner token');
  if (!token) return;
  try {
    const response = await fetch('/api/owner/config', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error();
    const config = await response.json();
    sessionStorage.setItem('lifetempo.bookingTimezone',config.timezone);
    sessionStorage.setItem('lifetempo.ownerToken', token);
    sessionStorage.setItem(calendarSyncTokenKey, token);
    bookingSlug = config.slug;
    sessionStorage.setItem('lifetempo.bookingSlug', bookingSlug);
    const syncReady=await syncCalendarData({silent:true});
    render();
    toast(calendarSyncConflict ? '服務已連線，但兩端資料不同；請到設定選擇要保留的版本' : syncReady ? '服務已連線，手機與電腦同步已啟用' : '預約服務已連線，但日曆同步尚未完成；請查看設定頁狀態');
  } catch {
    toast('連線失敗，請確認服務已啟動且 token 正確');
  }
}

const calendarSyncUrl='/api/owner/calendar-sync';
const calendarSyncServerUrlKey='lifetempo.calendarSyncServerUrl';
const calendarSyncTokenKey='lifetempo.calendarSyncToken';
const calendarSyncRevisionKey='lifetempo.calendarSyncRevision';
const calendarSyncHashKey='lifetempo.calendarSyncHash';
let calendarSyncTimer=0,calendarSyncRunning=false,calendarSyncApplying=false;
let calendarSyncConflict=null,calendarSyncStatus='尚未同步';

function calendarSyncToken(){return sessionStorage.getItem(calendarSyncTokenKey)||sessionStorage.getItem('lifetempo.ownerToken')||'';}
function calendarSyncEndpoint(){
  if(location.protocol==='file:')throw Error('請透過共用的 LifeTempo 伺服器網址開啟同步');
  const native=!!window.LifeTempoWidget;
  const origin=native?localStorage.getItem(calendarSyncServerUrlKey):location.origin;
  if(!origin)throw Error('請先輸入可由手機連線的 HTTPS 同步伺服器網址');
  const url=new URL(origin);
  if(native&&url.protocol!=='https:')throw Error('Android App 跨裝置同步必須使用 HTTPS 伺服器網址');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('同步伺服器請輸入純網址來源，例如 https://calendar.example.com');
  return new URL(calendarSyncUrl,url).href;
}

function calendarAIEndpoint(){
  if(!window.LifeTempoWidget)return '/api/ai/plan';
  const endpoint=new URL(calendarSyncEndpoint());
  endpoint.pathname='/api/ai/plan';
  return endpoint.href;
}

function calendarAIHeaders(){
  const headers={'Content-Type':'application/json'};
  if(window.LifeTempoWidget){
    const token=calendarSyncToken();
    if(!token)throw Error('請先連線自架 AI 伺服器；到「行事曆設定」按「一鍵連線 AI」。');
    headers.Authorization=`Bearer ${token}`;
  }
  return headers;
}

async function connectAndroidAIBackend(){
  try{
    const input=document.querySelector('#calendarSyncServerUrl');
    let origin=(input?.value.trim()||localStorage.getItem(calendarSyncServerUrlKey)||'').replace(/\/$/,'');
    if(!origin)origin=prompt('輸入自架 LifeTempo AI 伺服器 HTTPS 網址');
    if(!origin)return false;
    const url=new URL(origin);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Android AI 伺服器必須是 HTTPS 純網址，例如 https://calendar.example.com');
    const nextOrigin=url.origin,changed=localStorage.getItem(calendarSyncServerUrlKey)!==nextOrigin;
    if(changed){
      localStorage.removeItem(calendarSyncRevisionKey);localStorage.removeItem(calendarSyncHashKey);
      sessionStorage.removeItem(calendarSyncTokenKey);
    }
    localStorage.setItem(calendarSyncServerUrlKey,nextOrigin);
    if(input)input.value=nextOrigin;
    const token=changed?prompt('輸入自架 LifeTempo 伺服器的 owner token'):calendarSyncToken()||prompt('輸入自架 LifeTempo 伺服器的 owner token');
    if(!token)return false;
    const response=await fetch(new URL('/api/ai/status',url),{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===401)throw Error('owner token 無效，請確認伺服器 token 後重試');
    if(!response.ok)throw Error(`連線 AI 伺服器失敗（HTTP ${response.status}）`);
    const status=await response.json(),serverProviders=status.providers||{};
    sessionStorage.setItem(calendarSyncTokenKey,token);
    const settings=JSON.parse(localStorage.getItem('lifetempo.aiKeys')||'{}');
    const currentProvider=settings.provider;
    const clientKey=!!settings.key?.trim()&&currentProvider!=='browser';
    const priority=['gemini','openai','openrouter','anthropic','deepseek','groq','cohere','mistral','together'];
    const configured=name=>!!(serverProviders[name]?.configured||status.providerKeys?.[name]);
    const provider=clientKey?currentProvider:configured(currentProvider)?currentProvider:priority.find(configured);
    if(!provider){
      const statusNode=document.querySelector('#androidAIStatus');
      if(statusNode)statusNode.textContent='伺服器已連線，但尚未設定 AI API Key。請在伺服器設定 GEMINI_API_KEY 等 provider 金鑰，或在 AI 設定輸入 API Key。';
      throw Error('伺服器已連線，但尚未設定 AI API Key。請在伺服器設定 GEMINI_API_KEY 等 provider 金鑰，或在 AI 設定輸入 API Key。');
    }
    const providerDefinition=typeof AI_PROVIDERS==='undefined'?null:AI_PROVIDERS.find(item=>item.value===provider);
    const model=settings.provider===provider&&settings.model?settings.model:serverProviders[provider]?.models?.[0]?.id||providerDefinition?.models?.[0]?.id||'';
    const nextSettings={...settings,provider,model};
    if(settings.provider!==provider)nextSettings.key='';
    localStorage.setItem('lifetempo.aiKeys',JSON.stringify(nextSettings));
    toast(`AI 伺服器已連線，已選用 ${provider}`);
    if(typeof render==='function')render();
    const statusNode=document.querySelector('#androidAIStatus');
    if(statusNode)statusNode.textContent=`已連線 · ${provider} · API Key 由自架伺服器提供或使用本機設定`;
    return true;
  }catch(error){toast(error.message||'AI 伺服器連線失敗');return false;}
}

async function connectCalendarSync(forceNewToken=false){
  if(window.LifeTempoDriveSync?.isConnected()){setCalendarSyncStatus('請先中斷 Google Drive 同步');return false;}
  sessionStorage.removeItem('lifetempo.serverSyncPaused');
  try{
    let useFreshToken=forceNewToken;
    if(window.LifeTempoWidget){
      const input=document.querySelector('#calendarSyncServerUrl');
      if(input?.value.trim()){
        const nextUrl=input.value.trim().replace(/\/$/,'');
        if(localStorage.getItem(calendarSyncServerUrlKey)!==nextUrl){
          localStorage.removeItem(calendarSyncRevisionKey);localStorage.removeItem(calendarSyncHashKey);
          sessionStorage.removeItem(calendarSyncTokenKey);useFreshToken=true;
        }
        localStorage.setItem(calendarSyncServerUrlKey,nextUrl);
      }
    }
    const endpoint=calendarSyncEndpoint();
    const token=useFreshToken?prompt('輸入 LifeTempo 伺服器的 owner token'):calendarSyncToken()||prompt('輸入 LifeTempo 伺服器的 owner token');
    if(!token)return false;
    const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===401)throw Error('owner token 無效');
    if(!response.ok)throw Error('無法連線同步伺服器');
    sessionStorage.setItem(calendarSyncTokenKey,token);
    const result=await syncCalendarData({silent:true});
    if(typeof render==='function')render();
    toast(calendarSyncConflict?'兩端資料不同，請選擇要保留的版本':result?'手機與電腦同步已連線':'已驗證 token，但同步尚未完成，請查看狀態');
    return result;
  }catch(error){toast(error.message||'同步連線失敗');return false;}
}

function calendarSyncSnapshot(){
  return {
    schemaVersion:1,
    events:JSON.parse(JSON.stringify(events)),
    tasks:JSON.parse(JSON.stringify(tasks)),
    calendars:JSON.parse(JSON.stringify(calendars)),
    categories:{...COLORS},
    inviteChannels:[...inviteChannels],
    settings:{timezone:selectedTz,clockFormat}
  };
}

function emptyCalendarSyncState(){
  return {schemaVersion:1,events:[],tasks:[],calendars:[{id:'personal',name:'個人行事曆',permission:'personal-only',owner:'我'}],categories:{...DEFAULT_COLORS},inviteChannels:['Email','LINE','Messenger','微信'],settings:{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,clockFormat:'24'}};
}

async function calendarSyncHash(text){
  let first=0x811c9dc5,second=0x9e3779b9;
  for(const byte of new TextEncoder().encode(text)){
    first=Math.imul(first^byte,0x01000193);
    second=Math.imul(second^byte,0x85ebca6b);
  }
  return (first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
}

function setCalendarSyncStatus(message){
  calendarSyncStatus=message;
  const node=document.querySelector('#calendarSyncStatus');
  if(node)node.textContent=message;
  const conflict=document.querySelector('#calendarSyncConflict');
  if(conflict)conflict.hidden=!calendarSyncConflict;
}

function rememberCalendarSync(revision,hash){
  localStorage.setItem(calendarSyncRevisionKey,String(revision));
  localStorage.setItem(calendarSyncHashKey,hash);
  calendarSyncConflict=null;
}

function hasCalendarSyncContent(state){
  if(state.events.length||state.tasks.length||state.calendars.some(calendar=>calendar.id!=='personal'))return true;
  const categories=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  if(categories(state.categories)!==categories(DEFAULT_COLORS))return true;
  if(JSON.stringify(state.inviteChannels)!==JSON.stringify(['Email','LINE','Messenger','微信']))return true;
  return localStorage.getItem('lifetempo.timezone')!==null||localStorage.getItem('lifetempo.clockFormat')!==null;
}

function applyCalendarSyncState(state){
  calendarSyncApplying=true;
  try{
    events=state.events;
    tasks=state.tasks;
    calendars=state.calendars;
    COLORS={...DEFAULT_COLORS,...state.categories};
    inviteChannels=state.inviteChannels;
    if(state.settings?.timezone)selectedTz=state.settings.timezone;
    if(['12','24'].includes(String(state.settings?.clockFormat)))clockFormat=String(state.settings.clockFormat);
    localStorage.setItem('lifetempo.events',JSON.stringify(events));
    localStorage.setItem('lifetempo.tasks',JSON.stringify(tasks));
    localStorage.setItem('lifetempo.calendars',JSON.stringify(calendars));
    localStorage.setItem('lifetempo.categories',JSON.stringify(COLORS));
    localStorage.setItem('lifetempo.inviteChannels',JSON.stringify(inviteChannels));
    localStorage.setItem('lifetempo.timezone',selectedTz);
    localStorage.setItem('lifetempo.clockFormat',clockFormat);
    syncAndroidWidgets();
    if(typeof render==='function')render();
    if(typeof syncBusyPeriods==='function')syncBusyPeriods();
  }finally{calendarSyncApplying=false;}
}

function setCalendarSyncConflict(remote){
  calendarSyncConflict=remote;
  setCalendarSyncStatus('手機與電腦都有新修改，請選擇要保留的版本。');
  if(!document.querySelector('#calendarSyncPanel'))toast('同步發生版本衝突，請到「行事曆設定 → 手機與電腦同步」選擇版本');
}

async function writeCalendarSync(state,text,hash,revision){
  const token=calendarSyncToken();
  const response=await fetch(calendarSyncEndpoint(),{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({revision,state})});
  const result=await response.json();
  if(response.status===409){
    const remoteHash=result.state?await calendarSyncHash(JSON.stringify(result.state)):'';
    if(remoteHash&&remoteHash===hash){rememberCalendarSync(result.revision,hash);setCalendarSyncStatus('已同步');return true;}
    setCalendarSyncConflict(result);return false;
  }
  if(!response.ok)throw Error(result.error||'同步資料儲存失敗');
  rememberCalendarSync(result.revision,hash);
  setCalendarSyncStatus(`已同步 · ${new Date(result.updatedAt).toLocaleTimeString()}`);
  if(JSON.stringify(calendarSyncSnapshot())!==text)requestCalendarSync(0);
  return true;
}

async function syncCalendarData({silent=false}={}){
  if(sessionStorage.getItem('lifetempo.serverSyncPaused'))return false;
  if(window.LifeTempoDriveSync?.isConnected()){setCalendarSyncStatus('Google Drive 同步已連線，請先中斷再使用伺服器同步');return false;}
  const token=calendarSyncToken();
  if(!token){setCalendarSyncStatus('尚未連線同步伺服器');return false;}
  if(calendarSyncRunning||!navigator.onLine)return false;
  calendarSyncRunning=true;setCalendarSyncStatus('正在檢查手機與電腦資料…');
  try{
    const response=await fetch(calendarSyncEndpoint(),{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===401)throw Error('同步連線已失效，請重新輸入 owner token');
    if(!response.ok)throw Error('讀取同步版本失敗');
    const remote=await response.json(),state=calendarSyncSnapshot(),text=JSON.stringify(state),hash=await calendarSyncHash(text);
    const baseRevision=Number(localStorage.getItem(calendarSyncRevisionKey)||0),baseHash=localStorage.getItem(calendarSyncHashKey)||'';
    if(remote.revision===0)return await writeCalendarSync(state,text,hash,0);
    const remoteText=JSON.stringify(remote.state),remoteHash=await calendarSyncHash(remoteText);
    if(!baseHash){
      if(!hasCalendarSyncContent(state)||hash===remoteHash){
        applyCalendarSyncState(remote.state);rememberCalendarSync(remote.revision,remoteHash);setCalendarSyncStatus('已載入伺服器資料');return true;
      }
      setCalendarSyncConflict(remote);return false;
    }
    if(remote.revision<baseRevision){setCalendarSyncConflict(remote);return false;}
    if(remote.revision===baseRevision){
      if(hash===baseHash){setCalendarSyncStatus('已同步');return true;}
      return await writeCalendarSync(state,text,hash,baseRevision);
    }
    if(hash===baseHash){
      applyCalendarSyncState(remote.state);rememberCalendarSync(remote.revision,remoteHash);setCalendarSyncStatus('已載入另一台裝置的新資料');return true;
    }
    if(remoteHash===baseHash)return await writeCalendarSync(state,text,hash,remote.revision);
    setCalendarSyncConflict(remote);return false;
  }catch(error){
    setCalendarSyncStatus(error.message||'同步失敗，稍後會重試');
    if(!silent)toast(error.message||'同步失敗，稍後會重試');
    return false;
  }finally{calendarSyncRunning=false;}
}

function requestCalendarSync(delay=800){
  if(calendarSyncApplying||!calendarSyncToken())return;
  clearTimeout(calendarSyncTimer);
  calendarSyncTimer=setTimeout(()=>syncCalendarData({silent:true}),delay);
}

async function useServerCalendarSync(){
  if(!calendarSyncConflict)return false;
  const remote=calendarSyncConflict;
  const state=remote.state||emptyCalendarSyncState(),text=JSON.stringify(state),hash=await calendarSyncHash(text);
  applyCalendarSyncState(state);
  rememberCalendarSync(remote.revision,hash);setCalendarSyncStatus('已採用伺服器版本');
  if(typeof render==='function')render();
  return true;
}

async function keepLocalCalendarSync(){
  if(!calendarSyncConflict)return false;
  const state=calendarSyncSnapshot(),text=JSON.stringify(state),hash=await calendarSyncHash(text);
  return writeCalendarSync(state,text,hash,calendarSyncConflict.revision);
}

window.LifeTempoCalendarSync={
  disconnect:()=>{sessionStorage.setItem('lifetempo.serverSyncPaused','1');clearTimeout(calendarSyncTimer);calendarSyncConflict=null;setCalendarSyncStatus('已暫停伺服器同步；其他服務連線不受影響');},
  getState:()=>({connected:!sessionStorage.getItem('lifetempo.serverSyncPaused')&&!!calendarSyncToken()&&(!window.LifeTempoWidget||!!localStorage.getItem(calendarSyncServerUrlKey)),running:calendarSyncRunning,status:calendarSyncStatus,conflict:!!calendarSyncConflict}),
  connect:()=>connectCalendarSync(),reconnect:()=>connectCalendarSync(true),sync:()=>syncCalendarData(),useServer:useServerCalendarSync,keepLocal:keepLocalCalendarSync
};

async function publishBookingService() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token) return toast('請先連線預約服務');
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const configResponse = await fetch('/api/owner/config', { headers });
    if (!configResponse.ok) throw new Error('預約服務連線失效');
    const current = await configResponse.json();
    bookingSlug = current.slug;
    const configResponsePut = await fetch('/api/owner/config', {
      method: 'PUT', headers,
      body: JSON.stringify({
        slug: bookingSlug, title: '預約時間', timezone: selectedTz,
        start: bookingPrefs.start, end: bookingPrefs.end,
        duration: bookingPrefs.duration, days: bookingPrefs.days, enabled: true
      })
    });
    if (!configResponsePut.ok) throw new Error('預約設定儲存失敗');
    sessionStorage.setItem('lifetempo.bookingTimezone',selectedTz);

    const busy = collectBusyPeriods();
    const busyResponse = await fetch('/api/owner/busy', { method: 'PUT', headers, body: JSON.stringify({ events: busy }) });
    if (!busyResponse.ok) throw new Error('行程空檔同步失敗');
    sessionStorage.setItem('lifetempo.bookingSlug', bookingSlug);

    const bookingResponse = await fetch('/api/owner/bookings', { headers });
    if (!bookingResponse.ok) throw new Error('預約清單讀取失敗');
    const { bookings } = await bookingResponse.json();
    let imported = 0;
    for (const booking of bookings) {
      const id = `external-booking-${booking.id}`;
      if (events.some(event => event.id === id)) continue;
      events.push({
        id, timezone:selectedTz, title: `預約：${booking.name}`, date: booking.date, start: booking.start, end: booking.end,
        category: '個人', calendarId: 'personal', place: '',
        notes: [booking.email, booking.note].filter(Boolean).join(' · '), repeat: '不重複',
        reminders: [], attendees: booking.email ? [booking.email] : [], links: [], allDay: false
      });
      imported++;
    }
    if (imported) localStorage.setItem('lifetempo.events', JSON.stringify(events));
    const link = `${location.origin}/book/${encodeURIComponent(bookingSlug)}`;
    render();
    toast(`已發布空檔並匯入 ${imported} 筆外部預約`);
  } catch (error) {
    toast(error.message || '發布同步失敗');
  }
}

function collectBusyPeriods() {
  const result = [];
  for (let offset = 0; offset < 180; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const key = iso(date);
    for (const event of expandEvents(date,date,sessionStorage.getItem('lifetempo.bookingTimezone')||selectedTz)) {
      if (event.id.startsWith('external-booking-')) continue;
      result.push({ id: `${event.id}-${key}-${event.recurrenceKey||event.occurrence||key}`, date: key, start: event.start, end: event.end, allDay: event.allDay });
    }
  }
  return result;
}

async function syncBusyPeriods() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token || location.protocol === 'file:') return;
  try {
    const response = await fetch('/api/owner/busy', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: collectBusyPeriods() })
    });
    if (!response.ok) throw Error('同步失敗');
    localStorage.removeItem('lifetempo.bookingPending');
  } catch { localStorage.setItem('lifetempo.bookingPending','1'); }
}

let pollingBookings = false;
async function refreshBookings() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token || pollingBookings || !navigator.onLine || location.protocol === 'file:') return;
  pollingBookings = true;
  try {
    const response = await fetch('/api/owner/bookings', {headers:{Authorization:`Bearer ${token}`}});
    if (!response.ok) throw Error('預約同步失敗');
    const {bookings} = await response.json();
    const ids = new Set(bookings.map(b=>`external-booking-${b.id}`));
    let changed = events.some(e=>e.id.startsWith('external-booking-')&&!ids.has(e.id));
    events = events.filter(e=>!e.id.startsWith('external-booking-')||ids.has(e.id));
    for (const b of bookings) {
      const id=`external-booking-${b.id}`;
      if (events.some(e=>e.id===id)) continue;
      events.push({id,timezone:sessionStorage.getItem('lifetempo.bookingTimezone')||deviceZone,title:`預約：${b.name}`,date:b.date,start:b.start,end:b.end,category:'個人',calendarId:'personal',place:'',notes:[b.email,b.note].filter(Boolean).join(' · '),repeat:'不重複',reminders:[],attendees:b.email?[b.email]:[],links:[],allDay:false});
      changed=true;
    }
    if (changed) {
      localStorage.setItem('lifetempo.events',JSON.stringify(events));
      if (!document.querySelector('.modal-wrap') && document.activeElement?.tagName !== 'INPUT') render();
    }
    if(localStorage.getItem('lifetempo.bookingPending')) await syncBusyPeriods();
  } catch { /* The next poll or online event retries without discarding local data. */ }
  finally { pollingBookings=false; }
}
window.addEventListener('online',()=>{syncBusyPeriods();refreshBookings();syncCalendarData({silent:true})});
window.addEventListener('load',()=>{if(sessionStorage.getItem('lifetempo.ownerToken'))syncCalendarData({silent:true})},{once:true});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-zone],[data-clock]'))setTimeout(()=>requestCalendarSync(0),0);
});
setInterval(refreshBookings,15000);
setInterval(()=>syncCalendarData({silent:true}),20000);

async function cancelExternalBooking(id) {
  const token=sessionStorage.getItem('lifetempo.ownerToken');
  if(!token) return toast('請先連線預約服務，才能取消外部預約');
  if(!confirm('取消這筆外部預約並釋放時段？')) return;
  try {
    const response=await fetch('/api/owner/bookings/'+encodeURIComponent(id.replace('external-booking-','')), {method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok&&response.status!==404) throw Error();
    events=events.filter(e=>e.id!==id);save();render();toast('預約已取消，時段已釋放');
  } catch {toast('取消失敗，請連線後重試');}
}

async function copyPublicBooking() {
  if (!bookingSlug) return toast('請先連線並發布預約服務');
  const link = `${location.origin}/book/${encodeURIComponent(bookingSlug)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('公開預約連結已複製');
  } catch {
    prompt('複製公開預約連結', link);
  }
}

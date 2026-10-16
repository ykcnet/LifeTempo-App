// Local calendar overlays never create events or occupy booking slots.
const localPrefs=LocalCalendar.settings;
// Switching functions dismisses the current panel before opening the next one.
document.addEventListener('click',event=>{
  if(event.target.closest('.sidebar button:not(.help-btn),.bottom-nav button')){
    document.querySelectorAll('.modal-wrap').forEach(panel=>panel.remove());
  }
},true);
function localYear(year){return localPrefs.yearFormat==='roc'?`民國 ${year-1911}`:String(year);}
function localWeekdays(){return Array.from({length:7},(_,i)=>dayNames[(i+localPrefs.weekStart)%7]);}
function localDayDetail(date){return localPrefs.lunar?'農曆'+LocalCalendar.lunar(date):'';}
function localBadges(key){
  const holiday=LocalCalendar.holiday(key,localPrefs.region),term=localPrefs.terms?LocalCalendarData.terms[key]:'';
  return `${holiday?.label&&holiday.label!=='週末'?`<span class="local-badge ${holiday.makeup?'makeup':'holiday'}">${esc(holiday.label)}</span>`:''}${term?`<span class="local-badge term">${esc(term)}</span>`:''}`;
}
const localBaseRender=render;
render=function(){
  localBaseRender();
  document.body.classList.toggle('locale-hide-lunar',!localPrefs.lunar);
  document.body.classList.toggle('locale-hide-weeks',!localPrefs.weekNumbers);
  document.querySelectorAll('[data-local-date],[data-day]').forEach(element=>{
    const key=element.dataset.localDate||element.dataset.day,holiday=LocalCalendar.holiday(key,localPrefs.region);
    element.classList.toggle('local-day-off',!!holiday?.off);
    const badges=document.createElement('div');badges.className='local-badges';badges.innerHTML=localBadges(key);
    if(element.hasAttribute('data-day'))element.querySelector('.month-day')?.after(badges);else element.append(badges);
  });
  if(!query&&['日','週','月','年','清單'].includes(view)){
    const year=cursor.getFullYear();
    const note=document.createElement('p');note.className='local-source';
    note.innerHTML=`${localPrefs.region==='TW'?'假日依臺灣政府行政機關辦公日曆（民間休假依適用規定）；':''}節氣採 UTC+8 日期。${LocalCalendarData.years.includes(year)?'':'此瀏覽年份未收錄官方假日／節氣，未以近似值代替。'} <a href="https://data.gov.tw/dataset/14718" target="_blank" rel="noopener">假日來源</a> · <a href="https://www.hko.gov.hk/tc/gts/time/conversion.htm" target="_blank" rel="noopener">農曆／節氣來源</a>`;
    $('.main .bottom-note')?.before(note);
  }
  if(view==='年'&&!query)document.querySelectorAll('[data-month]').forEach(element=>{
    const prefix=`${cursor.getFullYear()}-${pad(Number(element.dataset.month)+1)}-`;
    const named=Object.entries(LocalCalendarData.holidays).filter(([date,h])=>date.startsWith(prefix)&&h.name&&h.off);
    if(localPrefs.region==='TW'){const p=document.createElement('p');p.textContent=LocalCalendarData.years.includes(cursor.getFullYear())?`節日／補假 ${named.length} 天`:'假日資料未收錄';element.append(p);}
  });
  if(view==='設定')addLocalSettings();
  if(localPrefs.weather&&!query&&['日','週','月','年','清單'].includes(view)){const panel=document.createElement('section');panel.id='weatherPanel';panel.className='card local-weather';panel.setAttribute('aria-live','polite');$('.hero')?.after(panel);paintWeather();loadWeather();}
  applyWorkspaceContext();
};
// Keep the original calendar layout; show only relevant controls in other workspaces.
function applyWorkspaceContext(){
  const calendarView=!query&&['日','週','月','年','清單'].includes(view);
  document.body.classList.toggle('workspace-calendar',calendarView);
  document.body.classList.toggle('workspace-function',!calendarView);
  document.body.classList.toggle('workspace-search',!!query);
  const title=document.querySelector('.hero h1');
  if(!calendarView&&title)title.textContent=query?'搜尋行程':({'預約':'空檔預約','共享':'管理共享與權限','共享行事曆':'共享行事曆','設定':'行事曆設定','待辦':'待辦事項'}[view]||view);
}
function addLocalSettings(){
  const section=document.createElement('section');section.className='card agenda local-settings';
  section.innerHTML=`<h3>在地化與天氣</h3><form id="localSettings"><div class="form-grid">
    <div class="field"><label for="localRegion">假日地區</label><select id="localRegion" name="region"><option value="TW" ${localPrefs.region==='TW'?'selected':''}>臺灣（政府行政機關）</option><option value="none" ${localPrefs.region==='none'?'selected':''}>不顯示假日</option></select></div>
    <div class="field"><label for="localCity">天氣城市</label><select id="localCity" name="city">${Object.entries(LocalCalendar.cities).map(([key,[name]])=>`<option value="${key}" ${localPrefs.city===key?'selected':''}>${name}</option>`).join('')}</select></div>
    <div class="field"><label for="localWeekStart">每週起始日</label><select id="localWeekStart" name="weekStart"><option value="0" ${localPrefs.weekStart===0?'selected':''}>星期日</option><option value="1" ${localPrefs.weekStart===1?'selected':''}>星期一</option></select></div>
    <div class="field"><label for="localYearFormat">年份格式</label><select id="localYearFormat" name="yearFormat"><option value="gregory" ${localPrefs.yearFormat==='gregory'?'selected':''}>西元</option><option value="roc" ${localPrefs.yearFormat==='roc'?'selected':''}>民國</option></select></div>
    <div class="field full local-checks">${[['lunar','顯示農曆'],['terms','顯示二十四節氣'],['weekNumbers','顯示 ISO 週數'],['weather','顯示天氣預報']].map(([key,label])=>`<label><input type="checkbox" name="${key}" ${localPrefs[key]?'checked':''}> ${label}</label>`).join('')}</div></div>
    <p class="local-source">內建 ${LocalCalendarData.years.join('、')} 年官方假日與節氣，資料整理：${LocalCalendarData.updatedAt}。農曆於其他年份使用瀏覽器曆法。天氣使用所選城市中心約略座標，不使用裝置定位，啟用後會連線 Open-Meteo。</p><div class="tool-row"><button class="primary">儲存在地化設定</button></div></form>`;
  $('.main .card')?.after(section);
  $('#localSettings').onsubmit=event=>{
    event.preventDefault();const f=new FormData(event.target),next=LocalCalendar.normalize({region:f.get('region'),city:f.get('city'),weekStart:Number(f.get('weekStart')),yearFormat:f.get('yearFormat'),...Object.fromEntries(['lunar','terms','weekNumbers','weather'].map(key=>[key,f.has(key)]))});
    try{localStorage.setItem('lifetempo.locale',JSON.stringify(next));Object.assign(localPrefs,next);weatherError='';render();toast('在地化設定已儲存');}catch{toast('設定無法儲存，請確認瀏覽器儲存空間');}
  };
}

let weatherError='',weatherInFlight='',weatherAttempt={},weatherController=null;
const weatherCache={};
function readWeather(city){
  if(weatherCache[city])return weatherCache[city];
  try{const c=JSON.parse(localStorage.getItem('lifetempo.weather.'+city)||'null');if(c&&Number.isFinite(c.fetchedAt)&&Array.isArray(c.days)&&c.days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date)))weatherCache[city]=c;}catch{}
  return weatherCache[city];
}
function paintWeather(){
  const panel=$('#weatherPanel');if(!panel)return;
  const grid=$('.workspace-calendar .main>.card:not(.local-weather)'),gridTop=grid?.getBoundingClientRect().top,panelAbove=panel.getBoundingClientRect().bottom<=0;  const city=localPrefs.city,cached=readWeather(city),day=CalendarCore.parts(Date.now(),'Asia/Taipei').date,todayWeather=cached?.days.find(d=>d.date===day),stale=cached&&Date.now()-cached.fetchedAt>1800000;
  const value=n=>Number.isFinite(n)?Math.round(n):'—';
  const line=d=>`${LocalCalendar.weatherLabel(d.code)} · ${value(d.min)}–${value(d.max)} °C · 降雨 ${value(d.rain)}%`;
  panel.innerHTML=`<div class="local-weather-head"><strong>${esc(LocalCalendar.cities[city][0])}天氣</strong><button type="button" id="refreshLocalWeather" ${weatherInFlight===city?'disabled':''}>${weatherInFlight===city?'更新中…':'更新天氣'}</button></div><p>${todayWeather?esc(line(todayWeather)):weatherError||(!navigator.onLine?'離線，尚無今日天氣快取':'正在讀取預報…')}</p>${cached?`<small>${stale||weatherError||!navigator.onLine?'快取資料 · ':''}更新於 ${esc(new Date(cached.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))}（臺灣時間）${weatherError?' · '+esc(weatherError):''}</small><details><summary>未來 7 天</summary><div class="local-forecast">${cached.days.filter(d=>d.date>=day).map(d=>`<div><b>${d.date.slice(5)}</b><br>${esc(line(d))}</div>`).join('')||'快取已無可用預報，請連線更新。'}</div></details>`:''}<small class="local-source">城市中心預報，非即時測站觀測 · <a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>（CC BY 4.0）</small>`;
  $('#refreshLocalWeather').onclick=()=>loadWeather(true);
  if(panelAbove&&grid)window.scrollBy(0,grid.getBoundingClientRect().top-gridTop);}
async function loadWeather(force=false){
  if(!localPrefs.weather)return;
  const city=localPrefs.city,cached=readWeather(city),now=Date.now();
  const day=CalendarCore.parts(now,'Asia/Taipei').date;
  if(weatherInFlight===city||!force&&(cached&&cached.days.some(d=>d.date===day)&&now-cached.fetchedAt<1800000||now-(weatherAttempt[city]||0)<60000))return;
  if(!navigator.onLine){weatherError='離線，連線後可更新';paintWeather();return;}
  weatherController?.abort();const controller=new AbortController();weatherController=controller;weatherInFlight=city;weatherAttempt[city]=now;weatherError='';paintWeather();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(LocalCalendar.weatherURL(city),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('服務暫時無法使用');
    const days=LocalCalendar.parseWeather(await response.json()),data={days,fetchedAt:Date.now()};weatherCache[city]=data;
    try{localStorage.setItem('lifetempo.weather.'+city,JSON.stringify(data));}catch{}
  }catch{if(city===localPrefs.city)weatherError='天氣更新失敗，請稍後重試';}
  finally{clearTimeout(timer);if(weatherController===controller){weatherInFlight='';weatherController=null;paintWeather();}}
}
window.addEventListener('online',()=>loadWeather(true));
window.addEventListener('offline',paintWeather);
setInterval(()=>{if(!document.hidden)loadWeather();},1800000);
if(!document.querySelector('.modal-wrap'))render();

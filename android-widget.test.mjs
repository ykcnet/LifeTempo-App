import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const manifest=read('./android/app/src/main/AndroidManifest.xml');
const pwaManifest=JSON.parse(read('./manifest.webmanifest'));
const gradle=read('./android/app/build.gradle.kts');
const app=read('./android/app/src/main/java/com/lifetempo/app/MainActivity.java');
const bridge=read('./android/app/src/main/java/com/lifetempo/app/LifeTempoWidgetBridge.java');
const renderer=read('./android/app/src/main/java/com/lifetempo/app/HomeWidgetRenderer.java');
const server=read('./server.mjs');

test('first widget snapshot uses calendar display timezone before enhancement initialization',()=>{
  const html=read('./index.html');
  const fn=html.slice(html.indexOf('function androidWidgetEvents('),html.indexOf('function widgetDayInfo('));
  const context=vm.createContext({Intl,Date,selectedTz:'Asia/Taipei',color:()=> '#123456',events:[],expandEvents(){throw Error('startup override must not be used')}});
  vm.runInContext(read('./calendar-core.js'),context);
  vm.runInContext(fn,context);
  context.events=[
    {id:'ny',title:'紐約會議',date:'2026-10-17',start:'09:00',end:'10:00',timezone:'America/New_York'},
    {id:'utc',title:'跨日會議',date:'2026-10-17',start:'23:30',end:'23:50',timezone:'UTC'},
    {id:'all',title:'全天',date:'2026-10-17',endDate:'2026-10-18',allDay:true}
  ];
  const now=new Date('2026-10-17T04:00:00Z');
  const rows=context.androidWidgetEvents(now);
  assert.equal(rows.find(e=>e.id==='ny').start,'21:00');
  assert.equal(rows.find(e=>e.id==='utc').date,'2026-10-18');
  assert.equal(rows.find(e=>e.id==='utc').start,'07:30');
  assert.equal(rows.find(e=>e.id==='all').date,'2026-10-17');
  context.selectedTz='UTC';
  assert.equal(context.androidWidgetEvents(now).find(e=>e.id==='ny').start,'13:00');
  context.selectedTz='Asia/Taipei';
  context.events=[{id:'winter',title:'冬季會議',date:'2026-01-17',start:'09:00',end:'10:00',timezone:'America/New_York'}];
  assert.equal(context.androidWidgetEvents(new Date('2026-01-17T04:00:00Z'))[0].start,'22:00');
});

test('widget snapshot retains dense calendars, December, next year and distant dated events',()=>{
  const html=read('./index.html');
  const context=vm.createContext({Intl,Date,selectedTz:'Asia/Taipei',color:()=> '#123456',events:[]});
  vm.runInContext(read('./calendar-core.js'),context);
  vm.runInContext(html.slice(html.indexOf('function androidWidgetEvents('),html.indexOf('function widgetDayInfo(')),context);
  context.events=[
    ...Array.from({length:130},(_,i)=>({id:'dense'+i,title:'Meeting',date:'2026-10-18',start:'09:00',end:'10:00'})),
    {id:'dec',title:'December',date:'2026-12-12',start:'09:00',end:'10:00'},
    {id:'next',title:'Next year',date:'2027-01-12',start:'09:00',end:'10:00'},
    {id:'far',title:'Distant',date:'2033-12-12',start:'09:00',end:'10:00'},
    {id:'repeat',title:'Monthly',date:'2026-10-12',start:'09:00',end:'10:00',repeat:'每月'}
  ];
  const rows=context.androidWidgetEvents(new Date('2026-10-18T04:00:00Z'));
  assert.equal(rows.filter(e=>e.id.startsWith('dense')).length,130);
  for(const id of ['dec','next','far']) assert.ok(rows.some(e=>e.id===id));
  assert.ok(rows.some(e=>e.id==='repeat'&&e.date==='2027-01-12'));
});

test('upcoming events can wrap and scroll without a shared eight-line truncation',()=>{
  const layout=read('./android/app/src/main/res/layout/widget_today.xml');
  const row=read('./android/app/src/main/res/layout/widget_upcoming_row.xml');
  assert.match(layout,/<ListView/);
  const supported = new Set(['LinearLayout','RelativeLayout','FrameLayout','GridLayout','ListView','GridView','StackView','ViewFlipper','AdapterViewFlipper','TextView','Button','ImageView','ImageButton','ProgressBar','Chronometer','TextClock','CheckBox','Switch','RadioButton','RadioGroup']);
  for (const file of fs.readdirSync('android/app/src/main/res/layout').filter(name=>name.startsWith('widget_'))) {
    const xml=read('./android/app/src/main/res/layout/'+file);
    for (const tag of xml.matchAll(/<([A-Za-z][\w.]*)[\s/>]/g)) assert.ok(supported.has(tag[1]), file+': unsupported RemoteViews class '+tag[1]);
  }
  assert.doesNotMatch(layout+row,/android:(?:maxLines|ellipsize)=/);
  assert.match(row,/<ImageView[\s\S]*?android:id="@\+id\/widget_event_divider"/);
  assert.match(renderer,/views\.setRemoteAdapter\(R\.id\.widget_event_rows/);
  assert.match(renderer,/upcomingEvents\(context, id\)/);
  assert.match(renderer,/row\.setOnClickFillInIntent\(R\.id\.widget_event_row/);
});

test('calendar widget opens its displayed month and places the grid first',()=>{
  const source=read('./enhancements.js');
  const fn=source.slice(source.indexOf('function focusUpcomingWidget()'),source.indexOf('function revealWidgetDestination('));
  let rendered=0,scrolled=0;
  const context=vm.createContext({widgetLaunch:'calendar',URLSearchParams,location:{search:'?widget=calendar&widgetDate=2027-02-01'},parse:d=>new Date(d+'T00:00:00'),render(){rendered++},scheduleCalendarScroll:fn=>fn(),document:{querySelector:selector=>{assert.equal(selector,'.month-grid');return {scrollIntoView:options=>{assert.equal(options.block,'start');scrolled++}}}}});
  vm.runInContext(fn+';focusUpcomingWidget();',context);
  assert.equal(context.view,'月');
  assert.equal(context.cursor.getMonth(),1);
  assert.equal(context.cursor.getFullYear(),2027);
  assert.equal(rendered,1);assert.equal(scrolled,1);
  const calendarManifest=manifest.slice(manifest.indexOf('android:name=".CalendarWidgetProvider"'));
  for(const action of ['PREVIOUS_MONTH','NEXT_MONTH','TODAY']) assert.ok(calendarManifest.includes('com.ykcnet.lifetempo.widget.'+action));
  assert.match(calendarManifest,/android:scheme="lifetempo" android:host="calendar"/);
});

test('upcoming widget selects the nearest occurrence including all-day and empty calendars',()=>{
  const source=read('./enhancements.js');
  const fn=source.slice(source.indexOf('function nearestWidgetEvent('),source.indexOf('function focusUpcomingWidget('));
  const context=vm.createContext({iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,parse:d=>new Date(d+'T00:00:00')});
  vm.runInContext(fn,context);
  const now=new Date('2026-10-17T14:00:00');
  const items=[{id:'later',date:'2026-10-18',start:'09:00'},{id:'near',date:'2026-10-17',start:'13:45'},{id:'early',date:'2026-10-17',start:'08:00'}];
  assert.equal(context.nearestWidgetEvent(items,now).id,'near');
  assert.equal(context.nearestWidgetEvent([],now),undefined);
  assert.equal(context.nearestWidgetEvent([...items,{id:'all',date:'2026-10-17',allDay:true}],now).id,'all');
  assert.equal(context.nearestWidgetEvent([{id:'repeat',date:'2025-01-01',displayDate:'2026-10-17',start:'14:00'},...items],now).id,'repeat');
  assert.match(read('./index.html'),/widgetLaunch==='today'\)view='週'/);
});

test('Android app declares installable home-screen widgets',()=>{
  assert.match(gradle,/applicationId = "com\.ykcnet\.lifetempo"/);
  assert.match(gradle,/versionCode = 17/);
  assert.match(gradle,/LIFETEMPO_SIGNING_KEYSTORE/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.match(manifest,/TodayEventsWidgetProvider/);
  assert.match(manifest,/TodoWidgetProvider/);
  assert.match(manifest,/CalendarWidgetProvider/);
  for(const file of ['today_widget_info.xml','todo_widget_info.xml','calendar_widget_info.xml']) {
    const info=read(`./android/app/src/main/res/xml/${file}`);
    assert.match(info,/android:widgetCategory="home_screen"/);
    assert.match(info,/android:resizeMode="horizontal\|vertical"/);
  }
});

test('widget row selection preserves the clicked event and recurrence rather than choosing the nearest',()=>{
  const source=read('./enhancements.js');
  const fn=source.slice(source.indexOf('function selectWidgetEvent('),source.indexOf('function focusUpcomingWidget('));
  const context=vm.createContext({nearestWidgetEvent:()=>{throw Error('must not pick a different event')}});
  vm.runInContext(fn,context);
  const items=[{id:'series',recurrenceKey:'first',start:'09:00'},{id:'series',recurrenceKey:'second',start:'15:00'}];
  assert.equal(context.selectWidgetEvent(items,new URLSearchParams('widgetEventId=series&widgetRecurrence=second'),new Date()),items[1]);
  assert.equal(context.selectWidgetEvent(items,new URLSearchParams('widgetEventId=deleted'),new Date()),undefined);
  assert.equal(context.selectWidgetEvent(items,new URLSearchParams('widgetStart=15%3A00'),new Date()),items[1]);
});

test('new scroll requests cancel pending old navigation scrolls',()=>{
  const source=read('./enhancements.js'),frames=[],calls=[];
  const context=vm.createContext({requestAnimationFrame:fn=>frames.push(fn)});
  vm.runInContext(source.slice(source.indexOf('let calendarScrollRevision='),source.indexOf('function focusCalendarPosition(')),context);
  context.scheduleCalendarScroll(()=>calls.push('old'));
  context.scheduleCalendarScroll(()=>calls.push('today'));
  while(frames.length)frames.shift()();
  assert.deepEqual(calls,['today']);
});

test('widgets exist only as native home-screen components, not an in-app widget manager',()=>{
  const html=read('./index.html');
  assert.doesNotMatch(html,/function widgetsView|function renderWidget|widgetsConfig|bindWidgetsControls/);
  assert.match(html,/\.nav \[data-goview="小工具"\],\.bottom-nav \[data-goview="小工具"\]\{display:none!important\}/);
  assert.match(manifest,/TodayEventsWidgetProvider/);
  assert.match(manifest,/TodoWidgetProvider/);
});

test('Android shell serves only app assets and exposes a bounded widget snapshot bridge',()=>{
  assert.match(app,/WebViewAssetLoader/);
  assert.match(app,/setWebChromeClient/);
  assert.match(app,/onShowFileChooser/);
  assert.match(app,/FileChooserParams\.parseResult/);
  assert.match(app,/LifeTempoWidgetBridge/);
  assert.match(bridge,/@JavascriptInterface/);
  assert.match(bridge,/eventsJson\.length\(\) > 20_000_000/);
  assert.match(read('./enhancements.js'),/!window\.LifeTempoWidget && 'serviceWorker' in navigator/);
  assert.match(gradle,/include\("index\.html", "\*\.js", "\*\.css", "\*\.webmanifest"\)/);
  assert.doesNotMatch(gradle,/data\/|owner-token|(^|[\/'"])\.env(?:$|[\/'"])/);
});

test('resizing changes visible rows and widget taps open the matching app view',()=>{
  assert.match(renderer,/OPTION_APPWIDGET_MIN_HEIGHT/);
  assert.match(renderer,/static void updateCalendar/);
  assert.match(renderer,/eventsByDate\.computeIfAbsent/);
  assert.match(renderer,/eventsByDate\.getOrDefault\(date\.toString\(\)/);
  assert.match(read('./android/app/src/main/res/drawable/widget_calendar_cell.xml'),/<stroke/);
  assert.match(read('./android/app/src/main/res/drawable/widget_calendar_cell.xml'),/android:width="0\.5dp"/);
  assert.match(read('./android/app/src/main/res/layout/widget_calendar_day.xml'),/android:orientation="vertical"/);
  assert.match(read('./android/app/src/main/res/layout/widget_calendar_day.xml'),/android:layout_margin="0dp"/);
  assert.match(read('./android/app/src/main/res/layout/widget_calendar_day.xml'),/@\+id\/calendar_day_events/);
  assert.match(read('./android/app/src/main/res/layout/widget_calendar_event.xml'),/android:maxLines="1"/);
  assert.match(read('./android/app/src/main/res/drawable/widget_calendar_header.xml'),/61B16B/);
  assert.match(read('./android/app/src/main/res/drawable/widget_calendar_today.xml'),/android:shape="oval"/);
  assert.match(read('./index.html'),/color:color\(event\)/);
  assert.match(read('./android/app/src/main/java/com/lifetempo/app/CalendarWidgetProvider.java'),/onAppWidgetOptionsChanged/);
  assert.match(renderer,/putExtra\("widget", todo \? "todo" : "today"\)/);
  assert.match(read('./index.html'),/widgetLaunch==='calendar'\)view='月'/);
  assert.match(read('./index.html'),/widgetLaunch==='todo'\)view='待辦'/);
  assert.match(read('./index.html'),/bridge\.updateSnapshot\(JSON\.stringify\(upcoming\),JSON\.stringify\(tasks\.filter\(task=>!task\.done\)\.slice\(0,100\)\),LocalCalendar\.settings\.weekStart,JSON\.stringify\(widgetDayInfo\(\)\)\)/);
});

test('calendar widget month controls update each widget independently',()=>{
  const layout=read('./android/app/src/main/res/layout/widget_calendar.xml');
  const provider=read('./android/app/src/main/java/com/lifetempo/app/CalendarWidgetProvider.java');
  assert.match(layout,/@\+id\/calendar_month_prev/);
  assert.match(layout,/@\+id\/calendar_month_next/);
  assert.match(layout,/android:contentDescription="上一個月"/);
  assert.match(layout,/android:contentDescription="下一個月"/);
  assert.match(provider,/ACTION_PREVIOUS_MONTH/);
  assert.match(provider,/ACTION_NEXT_MONTH/);
  assert.match(provider,/HomeWidgetRenderer\.shiftCalendarMonth/);
  assert.match(renderer,/setOnClickPendingIntent\(R\.id\.calendar_month_prev/);
  assert.match(renderer,/setOnClickPendingIntent\(R\.id\.calendar_month_next/);
  assert.match(renderer,/CALENDAR_MONTH_KEY \+ id/);
  assert.match(renderer,/displayedCalendarMonth\(context, id, today\)\.plusMonths\(amount\)/);
  const clickHandler=renderer.slice(renderer.indexOf('private static PendingIntent calendarMonthIntent('),renderer.indexOf('private static int eventTint('));
  assert.match(clickHandler,/new Intent\(context, CalendarWidgetActionActivity\.class\)/);
  assert.match(clickHandler,/PendingIntent\.getActivity/);
  assert.doesNotMatch(clickHandler,/getBroadcast/);
  const activity=read('./android/app/src/main/java/com/lifetempo/app/CalendarWidgetActionActivity.java');
  assert.match(activity,/CalendarWidgetActionsReceiver\.handleAction\(this, getIntent\(\)\)/);
  assert.match(activity,/finally\s*\{\s*finish\(\)/);
  assert.doesNotMatch(activity,/new WebView\(|setContentView\(/);
  assert.match(manifest,/android:name="\.CalendarWidgetActionActivity"[\s\S]*?Theme.NoDisplay/);
});

test('Android saves JSON and iCalendar exports with the system document picker',()=>{
  const html=read('./index.html');
  assert.match(app,/LifeTempoFiles/);
  assert.match(app,/ACTION_CREATE_DOCUMENT/);
  assert.match(app,/EXPORT_FILE_REQUEST/);
  assert.match(app,/getContentResolver\(\)\.openOutputStream/);
  assert.match(html,/window\.LifeTempoFiles\?\.saveText/);
  assert.match(html,/application\/json/);
  assert.match(html,/text\/calendar/);
});

test('PWABuilder manifest has a PNG launch icon served with the correct MIME and cached offline',()=>{
  const icon=pwaManifest.icons.find(item=>item.type==='image/png');
  assert.deepEqual({sizes:icon.sizes,purpose:icon.purpose}, {sizes:'512x512',purpose:'any'});
  assert.equal(fs.existsSync(new URL(icon.src,import.meta.url)),true);
  assert.match(server,/'.png': 'image\/png'/);
  assert.match(read('./sw.js'),new RegExp(icon.src.replaceAll('/','\\/')));
});

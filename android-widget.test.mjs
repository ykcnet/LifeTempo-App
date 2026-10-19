import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const manifest=read('./android/app/src/main/AndroidManifest.xml');
const pwaManifest=JSON.parse(read('./manifest.webmanifest'));
const gradle=read('./android/app/build.gradle.kts');
const app=read('./android/app/src/main/java/com/lifetempo/app/MainActivity.java');
const bridge=read('./android/app/src/main/java/com/lifetempo/app/LifeTempoWidgetBridge.java');
const renderer=read('./android/app/src/main/java/com/lifetempo/app/HomeWidgetRenderer.java');
const server=read('./server.mjs');

test('Android app declares installable home-screen widgets',()=>{
  assert.match(gradle,/applicationId = "com\.ykcnet\.lifetempo"/);
  assert.match(gradle,/versionCode = 11/);
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
  assert.match(bridge,/eventsJson\.length\(\) > 1_000_000/);
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
  assert.match(read('./index.html'),/widgetLaunch==='upcoming'\)view='週'/);
  assert.match(renderer,/widgetView.*upcoming/);
  assert.match(read('./android/app/src/main/res/layout/widget_today.xml'),/@\+id\/widget_settings/);
  assert.match(renderer,/new StyleSpan\(Typeface\.BOLD\)/);
  assert.match(read('./android/app/src/main/java/com/lifetempo/app/UpcomingWidgetSettingsActivity.java'),/NumberPicker/);
  assert.match(read('./android/app/src/main/res/values/strings.xml'),/近日行程/);
  assert.match(read('./index.html'),/widgetLaunch==='todo'\)view='待辦'/);
  assert.match(read('./index.html'),/bridge\.updateSnapshot\(JSON\.stringify\(upcoming\),JSON\.stringify\(tasks\.filter\(task=>!task\.done\)\.slice\(0,100\)\),LocalCalendar\.settings\.weekStart\)/);
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

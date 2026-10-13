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

test('Android app declares both installable home-screen widgets',()=>{
  assert.match(gradle,/applicationId = "com\.ykcnet\.lifetempo"/);
  assert.match(gradle,/versionCode = 2/);
  assert.match(gradle,/LIFETEMPO_SIGNING_KEYSTORE/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.match(manifest,/TodayEventsWidgetProvider/);
  assert.match(manifest,/TodoWidgetProvider/);
  for(const file of ['today_widget_info.xml','todo_widget_info.xml']) {
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
  assert.match(app,/LifeTempoWidgetBridge/);
  assert.match(bridge,/@JavascriptInterface/);
  assert.match(bridge,/eventsJson\.length\(\) > 1_000_000/);
  assert.match(gradle,/include\("index\.html", "\*\.js", "\*\.css", "\*\.webmanifest"\)/);
  assert.doesNotMatch(gradle,/data\/|owner-token|(^|[\/'"])\.env(?:$|[\/'"])/);
});

test('resizing changes visible rows and widget taps open the matching app view',()=>{
  assert.match(renderer,/OPTION_APPWIDGET_MIN_HEIGHT/);
  assert.match(renderer,/putExtra\("widget", todo \? "todo" : "today"\)/);
  assert.match(read('./index.html'),/widgetLaunch==='todo'\)view='待辦'/);
  assert.match(read('./index.html'),/bridge\.updateSnapshot\(JSON\.stringify\(upcoming\),JSON\.stringify\(tasks\.filter\(task=>!task\.done\)\.slice\(0,100\)\)\)/);
});

test('PWABuilder manifest has a PNG launch icon served with the correct MIME and cached offline',()=>{
  const icon=pwaManifest.icons.find(item=>item.type==='image/png');
  assert.deepEqual({sizes:icon.sizes,purpose:icon.purpose}, {sizes:'512x512',purpose:'any'});
  assert.equal(fs.existsSync(new URL(icon.src,import.meta.url)),true);
  assert.match(server,/'.png': 'image\/png'/);
  assert.match(read('./sw.js'),new RegExp(icon.src.replaceAll('/','\\/')));
});
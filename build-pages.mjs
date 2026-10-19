import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'_site');
const files=[
  '.nojekyll','index.html','manifest.webmanifest','sw.js','calendar-core.js','calendar-ics.js',
  'ai-request.js','booking-client.js','drive-config.js','drive-sync-core.js','drive-sync.js','enhancements.js','localization-data.js',
  'localization-core.js','localization-client.js','localization.css','vendor/ical.js',
  'LifeTempo-Icons/android/play-store-512.png','LifeTempo-Icons/source/LifeTempo-rounded.svg',
  'LifeTempo-Icons/windows/LifeTempo.ico','LifeTempo-Icons/windows/LifeTempo-512.png',
  '.well-known/assetlinks.json'
];

fs.rmSync(output,{recursive:true,force:true});
for(const file of files){
  const source=path.join(root,file);
  if(!fs.existsSync(source))throw new Error(`Pages 資源不存在：${file}`);
  const target=path.join(output,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}
console.log(`GitHub Pages 靜態網站已建立：${files.length} 個白名單資源`);

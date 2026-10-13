import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const root=new URL('.',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('Pages build emits only the allowlisted static PWA files',()=>{
  execFileSync(process.execPath,['build-pages.mjs'],{cwd:new URL('.',import.meta.url)});
  const output=new URL('./_site/',root);
  for(const file of ['.nojekyll','index.html','manifest.webmanifest','sw.js','ai-request.js','vendor/ical.js','LifeTempo-Icons/android/play-store-512.png','.well-known/assetlinks.json']) {
    assert.equal(fs.existsSync(new URL(file,output)),true,file);
  }
  for(const file of ['server.mjs','data/owner-token','android/app/build.gradle.kts','localization-sources/tw-2027.csv']) {
    assert.equal(fs.existsSync(new URL(file,output)),false,file);
  }
});

test('PWA manifest and Service Worker resolve within a repository subpath',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.ok(manifest.icons.every(icon=>!icon.src.startsWith('/')));
  assert.match(read('enhancements.js'),/new URL\('sw\.js',appBase\)/);
  assert.match(read('sw.js'),/new URL\('\.\/', self\.location\.href\)/);
});

test('Pages workflow deploys master and uses the static allowlist builder',()=>{
  const workflow=read('.github/workflows/pages.yml');
  assert.match(workflow,/branches: \[master\]/);
  assert.match(workflow,/node build-pages\.mjs/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
});
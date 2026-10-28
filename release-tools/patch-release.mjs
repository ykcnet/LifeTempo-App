import fs from 'node:fs';
const [manifestPath, htmlPath, currentHtmlPath] = process.argv.slice(2);
const manifest = fs.readFileSync(manifestPath);
let strings=[], resources=[], versionPatched=false, namePatched=false;
for(let offset=manifest.readUInt16LE(2);offset<manifest.length;) {
  const type=manifest.readUInt16LE(offset), header=manifest.readUInt16LE(offset+2), size=manifest.readUInt32LE(offset+4);
  if(size<header || offset+size>manifest.length) throw Error('Invalid binary XML chunk');
  if(type===1) {
    const count=manifest.readUInt32LE(offset+8), utf8=!!(manifest.readUInt32LE(offset+16)&256), start=manifest.readUInt32LE(offset+20);
    for(let i=0;i<count;i++) {
      let p=offset+start+manifest.readUInt32LE(offset+header+i*4);
      const length=()=>{let n=utf8?manifest[p++]:manifest.readUInt16LE(p);if(!utf8)p+=2;const flag=utf8?128:32768;if(n&flag){const next=utf8?manifest[p++]:manifest.readUInt16LE(p);if(!utf8)p+=2;n=((n&~flag)<<(utf8?8:16))|next;}return n;};
      let n=length();if(utf8)n=length();
      strings.push({value:manifest.toString(utf8?'utf8':'utf16le',p,p+n*(utf8?1:2)),p,n,utf8});
    }
  }
  if(type===0x180) for(let p=offset+header;p<offset+size;p+=4)resources.push(manifest.readUInt32LE(p));
  if(type===0x102) {
    const ext=offset+header;
    if(strings[manifest.readUInt32LE(ext+4)]?.value==='manifest') {
      const start=manifest.readUInt16LE(ext+8), stride=manifest.readUInt16LE(ext+10), count=manifest.readUInt16LE(ext+12);
      for(let i=0;i<count;i++) {
        const a=ext+start+i*stride, id=resources[manifest.readUInt32LE(a+4)];
        if(id===0x0101021b) { if(manifest.readUInt32LE(a+16)!==24)throw Error('Expected baseline versionCode 24');manifest.writeUInt32LE(27,a+16);versionPatched=true; }
        if(id===0x0101021c) { const s=strings[manifest.readUInt32LE(a+16)];if(s.value!=='1.1.13')throw Error('Expected baseline versionName 1.1.13');manifest.write('1.1.16',s.p,s.n*(s.utf8?1:2),s.utf8?'utf8':'utf16le');namePatched=true; }
      }
    }
  }
  offset+=size;
}
if(!versionPatched||!namePatched)throw Error('Missing version attributes');
fs.writeFileSync(manifestPath,manifest);
let html=fs.readFileSync(htmlPath,'utf8');
const current=fs.readFileSync(currentHtmlPath,'utf8');
const begin="  $ai('#aiVoice').onclick = () => {", end="  $ai('#aiQuickBiz').onclick";
const from=html.indexOf(begin),to=html.indexOf(end,from), fixFrom=current.indexOf(begin),fixTo=current.indexOf(end,fixFrom);
if([from,to,fixFrom,fixTo].some(n=>n<0))throw Error('Voice handler not found');
// Preserve baseline UI/native integration, replacing only the buggy AI voice session handler.
html=html.slice(0,from)+current.slice(fixFrom,fixTo)+html.slice(to);
const titleHelper=fs.readFileSync(new URL('./natural-title.js',import.meta.url),'utf8');
html=html.replace('function parseNaturalLanguage(input){', titleHelper+'\nfunction parseNaturalLanguage(input){');
const titleFrom=html.indexOf('text=text.trim()',html.indexOf('function parseNaturalLanguage('));
const titleTo=html.indexOf("if(!text)text='新行程';",titleFrom);
if(titleFrom<0||titleTo<0)throw Error('Title cleanup not found');
html=html.slice(0,titleFrom)+'text=cleanNaturalTitle(text);'+html.slice(titleTo);
// Both natural-language and AI inputs use the same manually stopped session.
html=html.replaceAll('new SR()', 'new (LifeTempoSpeech.wrap(SR))()');
const session=fs.readFileSync(new URL('../speech-session.js',import.meta.url),'utf8');
html=html.replace('<body>', '<body><script>'+session+'</script>');
html=html.replaceAll('辨識服務結束後會整理文字，也可按停止。','說完後請按停止。')
  .replaceAll('服務結束後會整理。','說完後請按停止。');
fs.writeFileSync(htmlPath,html);

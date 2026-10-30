(function (root) {
  const key = text => String(text || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  function clean(text) {
    let value = String(text || '').trim();
    // Some engines return the entire utterance repeated inside one transcript.
    const compact = key(value);
    for (let n = 4; n <= compact.length / 2; n++) {
      if (compact.length % n === 0 && compact === compact.slice(0, n).repeat(compact.length / n)) {
        let count = 0, end = 0;
        for (const c of value) { end += c.length; if (key(c)) count++; if (count === n) break; }
        value = value.slice(0, end); break;
      }
    }
    return value;
  }
  function merge(parts) {
    const kept = [];
    for (const raw of parts) {
      let text = clean(raw), next = key(text);
      if (!next) continue;
      const previous = key(kept.join(''));
      if (next.length >= 4 && previous.endsWith(next)) continue;
      // Cumulative finals can repeat the preceding sentence before adding words.
      for (let n = Math.min(previous.length, next.length); n >= 4; n--) {
        if (!previous.endsWith(next.slice(0, n))) continue;
        let count = 0, cut = 0;
        for (const c of text) { cut += c.length; if (key(c)) count++; if (count === n) break; }
        text = text.slice(cut).replace(/^[\s，,。；;！？!?]+/, ''); break;
      }
      if (text) kept.push(text);
    }
    return kept.join('，');
  }
  function wrap(Native) {
    return class {
      constructor() { this.active=false; this.current=null; this.completed=''; this.final=''; this.interim=''; this.timer=null; }
      start() {
        if (this.active) throw new Error('Recognition already started');
        this.active=true; this.completed=''; this.final=''; this.interim=''; this.launch();
      }
      launch() {
        if (!this.active) return;
        const native = new Native(); this.current=native;
        native.lang=this.lang || 'zh-TW'; native.continuous=true; native.interimResults=true;
        native.onresult=e=>{
          if (this.current!==native) return;
          const finals=[], interim=[];
          for (const result of Array.from(e.results || [])) (result.isFinal ? finals : interim).push(result[0]?.transcript || '');
          this.final=merge(finals); this.interim=merge(interim);
          const transcript=merge([this.completed,this.final]);
          const pending=merge([transcript,this.interim]);
          const results=[];
          if (transcript) results.push(Object.assign([{transcript}],{isFinal:true}));
          // Never expose a replayed final as another interim phrase.
          if (key(pending)!==key(transcript)) results.push(Object.assign([{transcript:pending.slice(transcript.length).replace(/^，/,'')}],{isFinal:false}));
          this.onresult?.({resultIndex:0,results});
        };
        native.onerror=e=>{
          if (this.current!==native) return;
          if (['no-speech','aborted'].includes(e.error) && this.active) return;
          this.active=false; this.onerror?.(e);
        };
        native.onend=()=>{
          if (this.current!==native) return;
          this.current=null;
          this.completed=merge([this.completed,this.final]); this.final=''; this.interim='';
          if (this.active) this.timer=setTimeout(()=>{this.timer=null;this.launch();},350);
          else this.onend?.();
        };
        try { native.start(); } catch { this.active=false;this.current=null;this.onerror?.({error:'audio-capture'});this.onend?.(); }
      }
      stop() {
        this.active=false; clearTimeout(this.timer);this.timer=null;
        if (this.current) { try { this.current.stop(); } catch {this.current=null;this.onend?.();} }
        else this.onend?.();
      }
      abort() {
        this.active=false; clearTimeout(this.timer);this.timer=null;
        const current=this.current;this.current=null;
        try {current?.abort();} finally {this.onend?.();}
      }
    };
  }
  function errorMessage(error) {
    const messages={
      'not-allowed':'麥克風權限被拒絕，請在 Edge 的網站權限及 Windows 隱私權設定允許麥克風。',
      'service-not-allowed':'此環境不允許語音辨識服務，請檢查瀏覽器設定。',
      'audio-capture':'無法取得麥克風，請檢查輸入裝置與麥克風權限。',
      'network':'無法連線到語音辨識服務，請檢查網路後重試。',
      'language-not-supported':'語音服務不支援目前的辨識語言。'
    };
    return (messages[error]||'語音辨識未完成，請重試。')+' Windows 也可點選文字欄後按 Win + H 輸入。';
  }
  root.LifeTempoSpeech={wrap,merge,errorMessage};
})(globalThis);

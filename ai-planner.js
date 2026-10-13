(function(){
function parseResponse(value) {
  const text=String(value||'').trim();
  const accept=value=>{
    if(Array.isArray(value)) return {events:value};
    if(value&&typeof value==='object'&&(Array.isArray(value.events)||typeof value.error==='string')) return value;
    throw new Error('回應缺少 events 行程陣列');
  };
  try { return accept(JSON.parse(text)); } catch {}
  // Handle Markdown/prose wrappers without greedy matching across multiple objects.
  for(let start=0;start<text.length;start++) {
    if(text[start]!=='{'&&text[start]!=='[') continue;
    const stack=[];let quoted=false,escaped=false;
    for(let end=start;end<text.length;end++) {
      const c=text[end];
      if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}
      if(c==='{'||c==='[')stack.push(c);
      else if(c==='}'||c===']'){
        if(stack.pop()!==(c==='}'?'{':'['))break;
        if(!stack.length){try{return accept(JSON.parse(text.slice(start,end+1)));}catch{}start=end;break;}
      }
    }
    if(stack.length) break;
  }
  throw new Error('回應不是完整的 JSON 行程清單');
}
async function generatePlan(body, callLLM) {
  const first = await generatePlanOnce(body, callLLM);
  if (!/時間重疊，請重新規劃/.test(first.error || '')) return first;
  const retry = await generatePlanOnce({...body, prompt:`${body.prompt || body.description || ''}\n\n【上一次回覆被退回】${first.error}\n請重新安排，每筆行程之間至少間隔 30 分鐘，且絕對不得有任何時間重疊。`}, callLLM);
  return retry.error ? first : retry;
}
async function generatePlanOnce(body, callLLM) {
  const prompt = body.prompt || body.description || '';
  if (!prompt.trim()) {
    return { error: '請輸入行程需求描述', events: [], summary: '' };
  }

  const startDate = body.startDate || '';
  const endDate = body.endDate || '';
  const location = body.location || '';
  const category = body.category || '';
  const timezone = body.timezone || 'Asia/Taipei';
  const busyEvents = Array.isArray(body.existingEvents) ? body.existingEvents.slice(0, 100) : [];
  const prefProvider = body.provider || '';
  const prefModel = body.model || '';
  const apiKeys = body.apiKeys || {};

  const sysPrompt = `你是一個專業的行程規劃助手。請根據使用者的需求，建立一個結構化的 JSON 行程規劃。
回傳格式必須是 JSON 物件，包含：
- summary: 繁體中文的行程總結（200 字以內），告訴使用者這個安排的重點與亮點
- events: 事件陣列，每個事件包含：
  * title: 行程名稱（繁體中文，簡潔清楚）
  * date: 日期 YYYY-MM-DD 格式
  * endDate: 結束日期 YYYY-MM-DD；跨午夜須填次日，全天事件填最後一天的次日（不含此日）
  * start: 開始時間 HH:MM（24 小時制）
  * end: 結束時間 HH:MM（24 小時制）
  * category: 分類，選自「工作、個人、家庭、健康、旅遊、其他」其中之一
  * place: 地點（可留空字串）
  * notes: 行程備註說明（繁體中文，可留空）
  * allDay: 是否為全天行程（布林值）
  * repeat: 重複規則，固定填「不重複」
  * reminders: 提醒陣列，固定填 []
  * attendees: 參與者陣列，固定填 []
  * links: 連結陣列，固定填 []

重要規則：
1. 時間不得重疊，預留交通與休息緩衝
2. 優先避開以下忙碌時段：${busyEvents.map(e=>`${e.date} ${e.allDay?'全天':`${e.start}-${e.end}`}`).join('、 ') || '（無）'}
3. 日期範圍：${startDate || '未指定起始'} ~ ${endDate || '未指定結束'}
4. 地點偏好：${location || '未指定'}
5. 主題偏好：${category || '未指定'}
6. ${category==='旅遊' || /旅遊|旅行|觀光|度假|自由行|自助行|景點|兩天一夜|三天兩夜/.test(prompt) ? '這是旅遊需求：以目的地、景點、在地美食、交通、住宿與休息安排為主。除非使用者明確要求工作或會議，不得加入重點工作、文書處理、回信或會議。依地理位置安排順路動線，首日考慮抵達、末日考慮返程。無法確認的營業時間、票價、班次須註明待確認，不得捏造。' : '依使用者的活動性質安排時段，只有工作需求才建議 09:00-18:00 工作；其他主題不要套用工作行程。'}
7. 三餐時間合理安排，不要從早排到晚不留空檔
8. 每天 3-8 個行程為宜
9. 產出可執行的建議，不要回傳待填寫的通用範本。旅遊活動必須寫出實際景點、街區或場所名稱，例如標題應是「參觀赤崁樓」，而非「上午景點遊覽」。place 寫實際場所名稱與所在城市，notes 說明推薦原因、建議活動及交通方式。餐廳不確定時可建議具名商圈或美食街；不得捏造店名、地址、營業時間或交通班次。
10. 使用者已指定的景點、餐廳、偏好和限制應反映在安排中；不同日期不要重複同一組通用行程。資訊不足而無法提出具體建議時，回傳 error 說明需要補充的資料，events 留空。
11. 所有日期與時間以 ${timezone} 時區表達，保留使用者指定的精確分鐘與活動時長，不得任意取整或移動固定時段。結束必須晚於開始，跨日須明確填 endDate；缺少固定時間時才提出建議時段。
12. 「整天／一整日」且包含上午、下午或晚上的需求，必須拆成各活動的獨立 events，每筆填實際建議起訖時間、allDay=false。不得將一天的活動塞進一筆 09:00–10:00，或把上午下午活動只寫在 notes。只有不指定時段的全天事項才使用 allDay=true。未指定精確時間時，依活動合理估計時長，並在 notes 註明「建議時段」。
13. 每筆行程的開始日期必須在指定日期範圍內；行程彼此及與忙碌時段都不得重疊，並避免緊接安排而沒有交通或休息緩衝。

使用者需求：
${prompt}

只回傳 JSON，不要任何其他文字或 Markdown 標籤。`;

  const callRes = await callLLM(sysPrompt, prefProvider, prefModel, apiKeys);
  if (callRes.error) return {error:callRes.error, events:[]};

  try {
    const parsed = parseResponse(callRes.content);
    if(parsed.error) return {error:String(parsed.error).slice(0,500),events:[]};
    const genericTitles=/^(上午景點遊覽|下午景點與街區散步|上午行程|下午行程|景點遊覽|自由活動|參觀景點|待安排)$/;
    if((category==='旅遊'||/旅遊|旅行|自由行|度假/.test(prompt)) && Array.isArray(parsed.events) && parsed.events.some(e=>genericTitles.test(String(e.title||'').trim()))) {
      return {error:'AI 只回傳通用行程，尚未完成具體建議。請補充目的地、偏好或必訪景點後重試，或更換模型。',events:[]};
    }
    const events = [];
    const validCats = new Set(['工作','個人','家庭','健康','旅遊','其他']);
    const timeRe = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const validPlanDate = value => dateRe.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    const nextDate = value => new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
    const clean=value=>String(value??'').normalize('NFKC').trim();
    const normalizeDate=value=>{
      const match=clean(value).match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
      return match?`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`:clean(value);
    };
    const normalizeTime=value=>{
      const match=clean(value).match(/^(?:(上午|早上|下午|晚上|AM|PM)\s*)?(\d{1,2})(?::(\d{1,2})(?::00)?|[點时時](?:(\d{1,2})分?)?)\s*(AM|PM)?$/i);
      if(!match) return clean(value);
      let hour=Number(match[2]);const minute=Number(match[3]||match[4]||0),period=(match[1]||match[5]||'').toUpperCase();
      if(match[1]&&match[5]||minute>59) return '';
      if(period){if(hour<1||hour>12)return '';hour=hour%12+(/PM|下午|晚上/.test(period)?12:0);}
      return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
    };
    if(!Array.isArray(parsed.events)) return {error:'AI 回應缺少行程清單，請重新規劃。',events:[]};
    for (const [index, raw] of parsed.events.entries()) {
      const e={...raw};
      const invalid=(field,value)=>({error:`AI 第 ${index+1} 筆行程「${clean(e.title).slice(0,60)||'未命名'}」包含無效日期或時間：${field}「${clean(value).slice(0,80)||'未提供'}」。請補上明確日期與起訖時間後重新規劃。`,events:[]});
      if(!clean(e.title)) return invalid('行程名稱',e.title);
      if(e.allDay!==undefined&&e.allDay!==null&&![true,false,'true','false'].includes(e.allDay)) return invalid('全天標記',e.allDay);
      e.allDay=e.allDay===true||e.allDay==='true';
      e.date=normalizeDate(e.date);
      if(!validPlanDate(e.date)) return invalid('日期',raw.date);
      e.start=e.allDay?'00:00':normalizeTime(e.start);
      e.end=e.allDay?'00:00':normalizeTime(e.end);
      let endDate=clean(e.endDate)?normalizeDate(e.endDate):(e.allDay?nextDate(e.date):e.date);
      // 24:00 means midnight at the end of the stated end date.
      if(e.end==='24:00'&&validPlanDate(endDate)){endDate=nextDate(endDate);e.end='00:00';}
      if(!timeRe.test(e.start)) return invalid('開始時間',raw.start);
      if(!timeRe.test(e.end)) return invalid('結束時間',raw.end);
      if(!validPlanDate(endDate)) return invalid('結束日期',raw.endDate);
      if(e.allDay?endDate<=e.date:endDate+'T'+e.end<=e.date+'T'+e.start) return {error:`AI 第 ${index+1} 筆行程「${clean(e.title).slice(0,60)}」結束時間必須晚於開始（${e.date} ${e.start} → ${endDate} ${e.end}）；跨日行程需提供結束日期，請重新規劃。`,events:[]};
      events.push({
        id: `ai-${Date.now()}-${events.length}`,
        title: String(e.title).slice(0, 200),
        date: e.date,
        endDate,
        timezone,
        start: e.start,
        end: e.end,
        category: validCats.has(e.category) ? e.category : (category || '其他'),
        place: String(e.place || '').slice(0, 200),
        notes: String(e.notes || '').slice(0, 2000),
        allDay: !!e.allDay,
        repeat: '不重複',
        reminders: [],
        attendees: [],
        links: []
      });
    }
    if (!events.length) return {error:'AI 未回傳有效行程，請修改需求或更換模型後重試。',events:[]};
    if(startDate&&endDate) {
      const outside=events.findIndex(e=>e.date<startDate||e.date>endDate);
      if(outside!==-1) return {error:`AI 第 ${outside+1} 筆行程「${events[outside].title.slice(0,60)}」不在指定日期範圍 ${startDate} 至 ${endDate} 內，請重新規劃。`,events:[]};
    }
    const dayNumber=date=>Date.parse(`${date}T00:00:00Z`)/86400000;
    const minuteOf=time=>time==='24:00'?1440:Number(time.slice(0,2))*60+Number(time.slice(3));
    const interval=(date,start,endDate,end,allDay=false)=>{
      const day=dayNumber(date);
      return [day*1440+(allDay?0:minuteOf(start)),dayNumber(endDate)*1440+(allDay?0:minuteOf(end))];
    };
    const overlaps=(a,b)=>a[0]<b[1]&&b[0]<a[1];
    for(let i=0;i<events.length;i++) {
      const event=events[i], eventRange=interval(event.date,event.start,event.endDate,event.end,event.allDay);
      for(let j=0;j<i;j++) {
        const previous=events[j];
        if(overlaps(eventRange,interval(previous.date,previous.start,previous.endDate,previous.end,previous.allDay))) {
          return {error:`AI 第 ${i+1} 筆行程「${event.title.slice(0,60)}」與第 ${j+1} 筆「${previous.title.slice(0,60)}」時間重疊，請重新規劃並保留交通或休息緩衝。`,events:[]};
        }
      }
      for(const busy of busyEvents) {
        if(!validPlanDate(clean(busy.date))) continue;
        const busyAllDay=busy.allDay===true||busy.allDay==='true';
        const busyStart=busyAllDay?'00:00':clean(busy.start),busyEnd=busyAllDay?'00:00':clean(busy.end);
        if((!timeRe.test(busyStart)&&busyStart!=='24:00')||(!timeRe.test(busyEnd)&&busyEnd!=='24:00')) continue;
        let busyEndDate=clean(busy.endDate);
        const busyEndTime=busyEnd==='24:00'?'00:00':busyEnd;
        if(!validPlanDate(busyEndDate)) busyEndDate=busyAllDay||busyEnd==='24:00'||minuteOf(busyEnd)<=minuteOf(busyStart)?nextDate(busy.date):busy.date;
        if(overlaps(eventRange,interval(busy.date,busyStart,busyEndDate,busyEndTime,busyAllDay))) {
          return {error:`AI 第 ${i+1} 筆行程「${event.title.slice(0,60)}」與行事曆中的忙碌時段重疊，請調整安排或關閉「避開忙碌時段」後重試。`,events:[]};
        }
      }
    }
    const spansDay = text => /上午|早上/.test(text) && /下午|晚上|傍晚/.test(text);
    if(events.some(e=>!e.allDay && e.endDate===e.date && spansDay(e.title+' '+e.notes) && Number(e.end.slice(0,2))*60+Number(e.end.slice(3))-Number(e.start.slice(0,2))*60-Number(e.start.slice(3))<=60) || events.length===1 && spansDay(prompt) && (events[0].allDay || events[0].endDate===events[0].date && events[0].start==='09:00' && events[0].end==='10:00')) {
      return {error:'AI 將上午、下午活動合併成單一行程，尚未正確拆分時段。請重新規劃，將各活動分別安排時間。',events:[]};
    }
    return {
      mode: 'llm',
      provider: callRes.provider,
      model: callRes.model,
      freeTier: !!callRes.freeTier,
      summary: String(parsed.summary || '已根據您的需求產生行程建議，請在下方確認與調整。').slice(0, 500),
      events
    };
  } catch (e) {
    return {error:'AI 回應格式無法解析，請重試或更換支援 JSON 的模型。',events:[]};
  }
}

globalThis.AIPlanner={generatePlan,parseResponse};
})();

(function () {
  const textField={type:'string',maxLength:80};
  const streamFirstResponseTimeoutMs=30000;
  const fallbackPromptTimeoutMs=20000;
  const schema={type:'object',properties:{
    summary:textField,error:textField,events:{type:'array',items:{type:'object',properties:{
      title:{type:'string',minLength:1,maxLength:80},
      date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
      endDate:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
      start:{type:'string',pattern:'^(?:[01]\\d|2[0-3]):[0-5]\\d$'},
      end:{type:'string',pattern:'^(?:[01]\\d|2[0-3]):[0-5]\\d$'},
      category:{type:'string',enum:['work','personal','family','health','travel','other','工作','個人','家庭','健康','旅遊','其他']},
      place:textField,notes:textField,allDay:{type:'boolean'}
    },required:['title','date','start','end'],additionalProperties:false}}
  },required:['events'],additionalProperties:false};
  async function generate(body, report=()=>{}, signal) {
    BrowserAI.lastFailure=null;
    const started=Date.now();
    const api=globalThis.LanguageModel;
    if(!api?.availability || !api?.create) {
      if(globalThis.LifeTempoWidget) throw new Error('Android App 的 WebView 不支援瀏覽器內建 AI。請到「行事曆設定 → 手機與電腦同步」連線 HTTPS 伺服器，再按「一鍵連線 AI」使用自架 AI。');
      throw new Error('此瀏覽器尚未提供內建 AI。請使用支援內建 AI 的瀏覽器，或在「行事曆設定」選擇其他 AI 服務。');
    }
    const languageOptions=language=>({expectedInputs:[{type:'text',languages:[language]}],expectedOutputs:[{type:'text',languages:[language]}]});
    const monitor=label=>m=>m.addEventListener('downloadprogress',e=>report(label+'：'+Math.round(e.loaded*100)+'%'));
    const zhOptions=languageOptions('zh');
    const gestureActive=!!globalThis.navigator?.userActivation?.isActive;
    let modelCreate=gestureActive ? api.create({...zhOptions,signal,monitor:monitor('正在下載瀏覽器 AI 模型')}) : null;
    let zhAvailability='pending';
    const availabilityPromise=api.availability(zhOptions).then(value => { zhAvailability=value; return value; }, error => {
      if(error.name!=='NotSupportedError') throw error;
      zhAvailability='unavailable';
      return 'unavailable';
    });
    let options=zhOptions, available=await availabilityPromise;
    const translate=available==='unavailable';
    if(!modelCreate && !translate) modelCreate=Promise.resolve().then(() => api.create({...zhOptions,signal,monitor:monitor('正在下載瀏覽器 AI 模型')}));
    const pairs=[{sourceLanguage:'zh-Hant',targetLanguage:'en'},{sourceLanguage:'en',targetLanguage:'zh-Hant'}];
    if(translate) {
      options=languageOptions('en');
      const enAvailability=await api.availability(options);
      if(enAvailability==='unavailable') throw new Error('此裝置的瀏覽器內建 AI 模型暫不可用（英文模型也無法使用）。請檢查瀏覽器模型、裝置資源或管理政策，或在「行事曆設定」選擇其他 AI 服務。');
      if(!globalThis.Translator?.availability || !globalThis.Translator?.create) throw new Error('此瀏覽器的 AI 模型不支援中文，且未提供本機翻譯功能。請更新瀏覽器，或在「行事曆設定」選擇其他 AI 服務。');
      for(const pair of pairs) if(await Translator.availability(pair)==='unavailable') throw new Error('瀏覽器 AI 可用，但繁體中文與英文的本機翻譯模型不可用。請更新瀏覽器，或改選其他 AI 服務。');
      if(modelCreate) modelCreate.catch(()=>{});
      modelCreate=Promise.resolve().then(() => api.create({...options,signal,monitor:monitor('正在下載瀏覽器 AI 模型')}));
      available=enAvailability;
    }
    report(available==='available'?'正在使用瀏覽器內建 AI 規劃…':'正在準備瀏覽器 AI 模型，首次下載可能需要較長時間…');
    let session;
    const translators=[];
    try {
      // Start the main model download immediately so the browser still treats it as user-initiated.
      const resources=await Promise.allSettled([
        modelCreate,
        ...(translate?pairs.map(pair=>Translator.create({...pair,signal,monitor:monitor('正在下載本機翻譯模型')})):[])
      ]);
      session=resources[0].status==='fulfilled'?resources[0].value:undefined;
      for(const resource of resources.slice(1)) if(resource.status==='fulfilled') translators.push(resource.value);
      const failed=resources.find(resource=>resource.status==='rejected');
      if(failed) throw failed.reason;
      report('正在使用瀏覽器內建 AI 規劃…');
      return await AIPlanner.generatePlan(body,async prompt=>{
        const requestData={request:body.prompt||body.description||'',location:body.location||'',category:body.category||'',startDate:body.startDate,endDate:body.endDate,timezone:body.timezone||'Asia/Taipei'};
        if(translate) {
          report('正在本機翻譯需求並規劃行程…');
          requestData.request=await translators[0].translate(requestData.request,{signal});
          requestData.location=body.location?await translators[0].translate(body.location,{signal}):'';
          requestData.category={工作:'work',個人:'personal',家庭:'family',健康:'health',旅遊:'travel',其他:'other'}[body.category]||'';
        }
        const rules=translate
          ? 'Plan ONLY the target date in this trip, in English. Return concise JSON: title,date,start,end; place/category if useful. Omit summary/notes unless necessary. Every timed event must have a positive, realistic duration; end must be later than start. Never use identical start and end times. Estimate a positive duration for transport and mark schedules as unverified. For transport or departure starting at 23:00 and ending after midnight, set endDate to the next day and end to a later time such as 00:30; never copy the start time into end. endDate only for overnight events; allDay only for truly untimed events (exclusive endDate). For an evening event ending before 06:00, set endDate to the next day. Preserve requested times, split morning/afternoon, avoid overlaps, allow travel/rest. Use specific nearby places, avoid repeating earlier days. Include outbound transport on first day and return on last day as requested. Never invent train numbers or verified schedules; mark estimates. Only return events:[] with a specific error when essential details such as destination or dates are missing. If details are sufficient, create the itinerary; unverified schedules or opening hours are not a reason to return an error.'
          : '只規劃指定日期，輸出繁體中文 JSON：title,date,start,end，必要時才加 place/category。省略長摘要及備註。同日不用 endDate；跨日須填。每筆有時間的行程必須安排大於零且合理的時長，結束時間必須晚於開始時間，不可使用相同的開始與結束時間。交通行程需估計合理車程，班次及估計時間註明待確認。若交通或離開行程於 23:00 開始並跨午夜，請填次日 endDate 與較晚的 end（例如 00:30），不可將開始時間複製為結束時間。晚間開始且清晨（06:00 前）結束的行程，endDate 填次日。真正無時段的全天事項才用 allDay，endDate 不含最後一天。保留指定時間，上午下午分開，避開重疊並預留交通休息。旅遊選具體且順路的地點，勿重複前日活動，依需求首日去程、末日回程。不得捏造班次，建議時間需註明待確認。僅在缺少目的地或日期等必要資訊、確實無法安排時才回傳 events:[] 與具體 error；資訊足夠時必須提出行程，不可只因班次、營業時間或票價未確認而回傳 error。';
        const days=[];
        const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00Z'))&&new Date(value+'T00:00Z').toISOString().slice(0,10)===value;
        const incompleteModelError=value=>/^(?:\d{4}-\d{2}-\d{2}\s*)?(?:(?:開始日期|結束日期|日期|開始時間|結束時間|時間|地點|行程|events|error)\s*){1,3}$/i.test(value);
        if(validDate(body.startDate)&&validDate(body.endDate)&&body.endDate>=body.startDate) {
          for(let stamp=Date.parse(body.startDate+'T00:00Z');stamp<=Date.parse(body.endDate+'T00:00Z');stamp+=86400000)days.push(new Date(stamp).toISOString().slice(0,10));
        } else days.push(null);
        const multiDayTravel=days.length>1&&(requestData.category==='旅遊'||requestData.category==='travel'||/旅遊|旅行|觀光|度假|自由行|自助行|景點|兩天一夜|三天兩夜|\btravel\b|\btrip\b/i.test(requestData.request));
        const dailyRoundTrip=/每天|每日|天天|當天來回|每日往返|天天往返/.test(requestData.request);
        const cityNames=[...requestData.request.matchAll(/台北|新北|桃園|台中|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|台東|澎湖|金門|連江|東京|大阪|京都|首爾|香港/g)];
        const origin=cityNames.map(city=>city[0]).find(city=>city!==requestData.location&&!requestData.location.includes(city))||'';
        const invalidMiddleDay=events=>multiDayTravel&&!dailyRoundTrip&&days.length>2&&events.some(event=>{
          const text=[event?.title,event?.place,event?.notes].filter(Boolean).join(' ');
          const intercity=/高鐵|高鐵站|台鐵|火車|長途客運|航班|機場|城際/;
          const movement=/搭|出發|前往|返回|回程|返程|回到|回家|返家|離開|往返/;
          return intercity.test(text)&&movement.test(text)&&(origin&&text.includes(origin)||/返程|回程|返回|回到|回家|返家|離開/.test(text));
        });
        const dayTravelRule=multiDayTravel
          ? translate
            ? 'MULTI-DAY TRIP RULE: Assume overnight stays at the destination. Schedule exactly one outbound intercity trip on day 1 and exactly one return-to-origin trip on the final day. On every middle day stay near the destination; do not travel back to the origin or repeat outbound/return intercity journeys. Only plan daily round trips if the user explicitly requests them.'
            : '【多日旅遊住宿規則】預設夜宿目的地。只在第一天安排一次前往目的地的去程，只在最後一天安排一次返回出發地的返程。中間日期留在目的地附近活動與住宿，不得返回出發地、每天往返或重複去回程。只有使用者明確要求每天往返時才例外。'
          : '';
        const parsed={events:[]};
        let content='',targetDate=null;
        const generationStarted=Date.now();
        try {
          for(const [index,date] of days.entries()) {
            targetDate=date;content='';
            if(index>0) {
              const previousSession=session;
              session=null;
              previousSession?.destroy();
              report(`正在準備第 ${index+1}/${days.length} 天的獨立 AI 工作階段…`);
              session=await api.create({...options,signal,monitor:monitor('正在準備瀏覽器 AI 模型')});
            }
            const progress=()=>report(`正在規劃第 ${index+1}/${days.length} 天${date?'（'+date+'）':''}，生成已用 ${Math.round((Date.now()-generationStarted)/1000)} 秒，已收到 ${content.length} 字元…`);
            progress();
            const retryGuidance=prompt.includes('【上一次回覆被退回】')?prompt.slice(prompt.lastIndexOf('【上一次回覆被退回】')):'';
            const dayRequest=JSON.stringify({...requestData,targetDate:date,day:index+1,totalDays:days.length,busy:(body.existingEvents||[]).filter(e=>!date||e.date===date)});
            const daySchema=date?{...schema,properties:{...schema.properties,events:{...schema.properties.events,items:{...schema.properties.events.items,properties:{...schema.properties.events.items.properties,date:{type:'string',enum:[date]}}}}}}:schema;
            const promptOptions={responseConstraint:daySchema,signal:signal||undefined};
            let dayPlan=null,correction='';
            for(let attempt=1;attempt<=3;attempt++) {
              content='';
              let waitedSeconds=0;
              const waiting=setInterval(()=>{
                waitedSeconds+=15;
                report(`第 ${index+1} 天 AI 仍在生成，已等待 ${waitedSeconds} 秒；若持續沒有回應，可按「停止規劃」。`);
              },15000);
              try {
                const dayPosition=multiDayTravel
                  ? translate
                    ? `Trip day ${index+1} of ${days.length}: ${index===0?'OUTBOUND DAY — travel from origin to destination once; no return trip today.':index===days.length-1?'FINAL RETURN DAY — return to origin once; do not add a second outbound trip.':'MIDDLE DAY — stay at the destination; no origin-to-destination or destination-to-origin intercity travel.'}`
                    : `旅程第 ${index+1}/${days.length} 天：${index===0?'去程日：只安排一次從出發地前往目的地，不安排返程。':index===days.length-1?'最後返程日：只安排一次返回出發地，不要重複去程。':'目的地停留日：留在目的地及附近活動，不安排回出發地或城際往返交通。'}`
                  : '';
                const instruction=rules+'\n'+dayTravelRule+'\n'+dayPosition+'\n'+retryGuidance+'\n'+correction+'\n'+dayRequest;
                if(session.promptStreaming) {
                  let streamError=null;
                  const streamController=new AbortController();
                  const streamSignal=signal?AbortSignal.any([signal,streamController.signal]):streamController.signal;
                  let streamTimeoutId;
                  const streamTimeout=new Promise((_,reject)=>{streamTimeoutId=setTimeout(()=>{streamController.abort();const error=new Error(`第 ${index+1} 天串流在 ${streamFirstResponseTimeoutMs/1000} 秒內沒有回應`);error.name='StreamNoResponseError';reject(error);},streamFirstResponseTimeoutMs);});
                  try {
                    await Promise.race([(async()=>{for await(const chunk of session.promptStreaming(instruction,{...promptOptions,signal:streamSignal})){clearTimeout(streamTimeoutId);content+=chunk;progress();}})(),streamTimeout]);
                  } catch(error) {if(signal?.aborted)throw error;streamError=error;}
                  finally {clearTimeout(streamTimeoutId);}
                  if((!content.trim()||streamError)&&session.prompt) {
                    report(`第 ${index+1} 天串流${streamError?'中斷':'未傳回內容'}，正在改用一般生成…`);
                    let timeoutId;
                    const timeoutController=new AbortController();
                    const fallbackSignal=signal?AbortSignal.any([signal,timeoutController.signal]):timeoutController.signal;
                    const timeout=new Promise((_,reject)=>{
                      timeoutId=setTimeout(()=>{
                        timeoutController.abort();
                        const error=new Error(`第 ${index+1} 天一般生成超過 ${fallbackPromptTimeoutMs/1000} 秒仍未完成，已停止等待；請重試或改用其他 AI 服務。`);
                        error.name='FallbackTimeoutError';
                        reject(error);
                      },fallbackPromptTimeoutMs);
                    });
                    let onCancel;
                    const cancelled=signal?new Promise((_,reject)=>{
                      onCancel=()=>reject(signal.reason||new Error('已取消規劃。'));
                      if(signal.aborted) onCancel();
                      else signal.addEventListener('abort',onCancel,{once:true});
                    }):new Promise(()=>{});
                    try {
                      content=await Promise.race([session.prompt(instruction,{...promptOptions,signal:fallbackSignal}),timeout,cancelled]);
                    } finally {
                      clearTimeout(timeoutId);
                      if(onCancel) signal.removeEventListener('abort',onCancel);
                    }
                  }
                } else content=await session.prompt(instruction,promptOptions);
                if(!String(content||'').trim()) {const error=new Error('瀏覽器內建 AI 串流與一般生成皆未回傳內容');error.name='EmptyAIResponseError';throw error;}
                dayPlan=AIPlanner.parseResponse(content);
                if(dayPlan.error) {
                  const modelError=String(dayPlan.error).trim();
                  const incomplete=/^(?:事件|行程|錯誤|error)\s*[：:]?\s*$/i.test(modelError)||incompleteModelError(modelError);
                  if(incomplete&&attempt<3) {
                    correction=`【第 ${index+1} 天重試】上次回覆的錯誤訊息「${modelError}」不完整，不能只回傳日期或欄位名稱。請根據原需求直接產生 ${date||'指定日期'} 的完整具體行程；若確實無法安排，請用完整句子說明缺少的必要資訊。`;
                    report(`第 ${index+1} 天的 AI 錯誤說明不完整，正在重試（${attempt+1}/3）…`);
                    dayPlan=null;
                    continue;
                  }
                  dayPlan.error=`第 ${index+1} 天無法規劃：${modelError||'AI 未提供原因。'}`;
                  break;
                }
                if(!dayPlan.events?.length||dayPlan.events.some(e=>!e||date&&e.date!==date)) throw new Error('AI 未完整回傳指定日期的行程');
                if(index>0&&index<days.length-1&&invalidMiddleDay(dayPlan.events)) {
                  if(attempt<3) {
                    correction='【中間日行程不符合多日旅遊規劃】上次安排了離開目的地的長途交通。請刪除高鐵、火車、航班或返回出發地的行程，只安排目的地及附近景點、餐飲、休息；多日旅遊中間日預設在目的地住宿。';
                    report(`第 ${index+1} 天包含離開目的地的長途交通，正在重排行程（${attempt+1}/3）…`);
                    dayPlan=null;
                    continue;
                  }
                  dayPlan={events:[],error:`第 ${index+1} 天仍包含離開目的地的長途交通，無法確認此安排符合多日旅遊住宿需求；請重新規劃。`};
                  break;
                }
                break;
              } catch(attemptError) {
                if(signal?.aborted||attempt===3||attemptError.name==='FallbackTimeoutError'||attemptError.name==='EmptyAIResponseError') throw attemptError;
                report(`第 ${index+1} 天回應不完整，正在重試（${attempt+1}/3）…`);
              } finally {
                clearInterval(waiting);
              }
            }
            if(dayPlan.error) {parsed.error=dayPlan.error;parsed.events=[];break;}
            parsed.events.push(...dayPlan.events);
            if(dayPlan.summary)parsed.summary=dayPlan.summary;
          }
        } catch(error) {
          if(signal?.aborted) throw new Error('已取消規劃，未加入任何行程。');
          BrowserAI.lastFailure={stage:'回應格式或生成',targetDate,completedEvents:parsed.events.length,generationMs:Date.now()-generationStarted,elapsedMs:Date.now()-started,receivedCharacters:content.length,reason:error.message,response:String(content||'').slice(0,16000)};
          if(error.name==='FallbackTimeoutError') throw new Error(`${error.message} 請查看「AI 回應診斷」；尚未加入行事曆。`);
          if(error.name==='EmptyAIResponseError') throw new Error('瀏覽器內建 AI 串流與一般生成都沒有回傳內容，已停止重試避免久候。請稍後再試，或到「行事曆設定」改用其他 AI 服務；診斷資訊已保留。');
          throw new Error('瀏覽器 AI 未完成行程，請查看「AI 回應診斷」；尚未加入行事曆。');
        }
        if(translate) {
          report('正在將行程翻回繁體中文…');
          const translated=new Map();
          const toChinese=async (object,key)=>{
            const value=object[key];
            if(typeof value!=='string'||!value.trim()) return;
            if(!translated.has(value)) translated.set(value,await translators[1].translate(value,{signal}));
            object[key]=translated.get(value);
          };
          await toChinese(parsed,'summary');await toChinese(parsed,'error');
          const categories={work:'工作',personal:'個人',family:'家庭',health:'健康',travel:'旅遊',other:'其他'};
          if(Array.isArray(parsed.events)) for(const event of parsed.events) {
            if(!event||typeof event!=='object') throw new Error('瀏覽器 AI 行程格式不正確，請重新規劃。');
            for(const key of ['title','place','notes']) await toChinese(event,key);
            event.category=categories[String(event.category).trim().toLowerCase()]||event.category;
          }
        }
        content=JSON.stringify(parsed);
        return {content,provider:'瀏覽器內建 AI',model:translate?'本機模型＋繁體中文翻譯':'瀏覽器管理模型'};
      });
    } finally { session?.destroy();for(const translator of translators) translator.destroy(); }
  }
  const isSupported=()=>typeof globalThis.LanguageModel?.availability==='function'&&typeof globalThis.LanguageModel?.create==='function';
  globalThis.BrowserAI={generate,isSupported,lastFailure:null};
})();

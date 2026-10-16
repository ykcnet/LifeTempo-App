(function () {
  const textField={type:'string',maxLength:80};
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
          ? 'Plan ONLY the target date in this trip, in English. Return concise JSON: title,date,start,end; place/category if useful. Omit summary/notes unless necessary. endDate only for overnight events; allDay only for truly untimed events (exclusive endDate). Preserve requested times, split morning/afternoon, avoid overlaps, allow travel/rest. Use specific nearby places, avoid repeating earlier days. Include outbound transport on first day and return on last day as requested. Never invent train numbers or verified schedules; mark estimates. Only return events:[] with a specific error when essential details such as destination or dates are missing. If details are sufficient, create the itinerary; unverified schedules or opening hours are not a reason to return an error.'
          : '只規劃指定日期，輸出繁體中文 JSON：title,date,start,end，必要時才加 place/category。省略長摘要及備註。同日不用 endDate；跨日須填。真正無時段的全天事項才用 allDay，endDate 不含最後一天。保留指定時間，上午下午分開，避開重疊並預留交通休息。旅遊選具體且順路的地點，勿重複前日活動，依需求首日去程、末日回程。不得捏造班次，建議時間需註明待確認。僅在缺少目的地或日期等必要資訊、確實無法安排時才回傳 events:[] 與具體 error；資訊足夠時必須提出行程，不可只因班次、營業時間或票價未確認而回傳 error。';
        const days=[];
        const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00Z'))&&new Date(value+'T00:00Z').toISOString().slice(0,10)===value;
        if(validDate(body.startDate)&&validDate(body.endDate)&&body.endDate>=body.startDate) {
          for(let stamp=Date.parse(body.startDate+'T00:00Z');stamp<=Date.parse(body.endDate+'T00:00Z');stamp+=86400000)days.push(new Date(stamp).toISOString().slice(0,10));
        } else days.push(null);
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
            const instruction=rules+'\n'+JSON.stringify({...requestData,targetDate:date,day:index+1,totalDays:days.length,busy:(body.existingEvents||[]).filter(e=>!date||e.date===date)});
            const daySchema=date?{...schema,properties:{...schema.properties,events:{...schema.properties.events,items:{...schema.properties.events.items,properties:{...schema.properties.events.items.properties,date:{type:'string',enum:[date]}}}}}}:schema;
            const promptOptions={responseConstraint:daySchema,signal:signal||undefined};
            let dayPlan=null;
            for(let attempt=1;attempt<=3;attempt++) {
              content='';
              try {
                if(session.promptStreaming) {
                  for await(const chunk of session.promptStreaming(instruction,promptOptions)) {content+=chunk;progress();}
                  if(!content.trim()&&session.prompt) {
                    report(`第 ${index+1} 天串流沒有回應，改用一般生成重試…`);
                    content=await session.prompt(instruction,promptOptions);
                  }
                } else content=await session.prompt(instruction,promptOptions);
                if(!String(content||'').trim()) {
                  const emptyResponse=new Error('瀏覽器內建 AI 未回傳內容（串流與一般生成皆為空）');
                  emptyResponse.name='EmptyResponseError';
                  throw emptyResponse;
                }
                dayPlan=AIPlanner.parseResponse(content);
                if(dayPlan.error) {
                  const modelError=String(dayPlan.error).trim();
                  if(/^(?:事件|行程|錯誤|error)\s*[：:]?\s*$/i.test(modelError)&&attempt<3) {
                    report(`第 ${index+1} 天的 AI 錯誤說明不完整，正在重試（${attempt+1}/3）…`);
                    dayPlan=null;
                    continue;
                  }
                  dayPlan.error=`第 ${index+1} 天無法規劃：${modelError||'AI 未提供原因。'}`;
                  break;
                }
                if(!dayPlan.events?.length||dayPlan.events.some(e=>!e||date&&e.date!==date)) throw new Error('AI 未完整回傳指定日期的行程');
                break;
              } catch(attemptError) {
                if(signal?.aborted||attempt===3||attemptError.name==='EmptyResponseError') throw attemptError;
                report(`第 ${index+1} 天回應不完整，正在重試（${attempt+1}/3）…`);
              }
            }
            if(dayPlan.error) {parsed.error=dayPlan.error;parsed.events=[];break;}
            parsed.events.push(...dayPlan.events);
            if(dayPlan.summary)parsed.summary=dayPlan.summary;
          }
        } catch(error) {
          if(signal?.aborted) throw new Error('已取消規劃，未加入任何行程。');
          BrowserAI.lastFailure={stage:'回應格式或生成',targetDate,completedEvents:parsed.events.length,generationMs:Date.now()-generationStarted,elapsedMs:Date.now()-started,receivedCharacters:content.length,reason:error.message,response:String(content||'').slice(0,16000)};
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

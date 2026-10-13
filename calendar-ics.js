// iCalendar storage keeps one record per UID, including its timezone and exceptions.
(function(scope){
  const I=scope.ICAL,C=scope.CalendarCore;
  const pad=n=>String(n).padStart(2,'0');
  const date=t=>`${t.year}-${pad(t.month)}-${pad(t.day)}`;
  const time=t=>`${pad(t.hour)}:${pad(t.minute)}`;
  const key=t=>t.isDate||t.zone===I.Timezone.localTimezone?t.toString():new Date(t.toUnixTime()*1000).toISOString().replace('.000Z','Z');
  const cache=new Map();
  async function readFile(file){
    const bytes=new Uint8Array(await file.arrayBuffer());
    const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
    let text;
    try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes)}
    catch{throw Error('檔案文字編碼無法正確讀取。請從原行事曆重新匯出 UTF-8 格式的 .ics，避免事件文字變成亂碼。')}
    if(text.includes('\uFFFD'))throw Error('檔案內已有損壞文字（�），無法還原原字。請從原行事曆重新匯出後再匯入。');
    return text;
  }
  function putTime(component,name,value){
    component.removeAllProperties(name);const property=new I.Property(name);property.setValue(value);
    if(!value.isDate&&value.zone!==I.Timezone.utcTimezone&&value.zone!==I.Timezone.localTimezone)property.setParameter('tzid',value.zone.tzid);
    component.addProperty(property);
  }
  function setup(component){
    for(const zone of component.getAllSubcomponents('vtimezone'))I.TimezoneService.register(new I.Timezone({component:zone}));
    for(const ev of component.getAllSubcomponents('vevent'))for(const p of ev.getAllProperties()){
      const tzid=p.getParameter('tzid');if(!tzid||I.TimezoneService.has(tzid))continue;
      try{
        new Intl.DateTimeFormat('en',{timeZone:tzid});
        const zone=new I.Timezone({tzid});
        zone.utcOffset=t=>{const naive=Date.UTC(t.year,t.month-1,t.day,t.hour,t.minute,t.second),actual=C.instant(date(t),time(t),tzid);return actual===null?0:(naive-actual)/1000-(t.second||0)};
        I.TimezoneService.register(zone);
      }catch{throw Error('無法識別時區：'+tzid)}
    }
  }
  function stamp(t,fallback){
    if(t.zone===I.Timezone.localTimezone)return C.instant(date(t),time(t),fallback)+(t.second||0)*1000;
    return t.toUnixTime()*1000;
  }
  function localTime(milliseconds,zone,fallback){
    try{
      const p=C.parts(milliseconds,zone===I.Timezone.localTimezone?fallback:zone.tzid);
      const t=I.Time.fromString(p.date+'T'+p.time+':'+pad(new Date(milliseconds).getUTCSeconds()));t.zone=zone;return t;
    }catch{return I.Time.fromJSDate(new Date(milliseconds),true).convertToZone(zone)}
  }
  function fields(event,fallback){
    const start=event.startDate,end=event.endDate;
    if(!start||!end)throw Error('事件缺少有效起訖時間。');
    const timezone=start.zone.tzid==='floating'?fallback:start.zone.tzid==='Z'?'UTC':start.zone.tzid;
    const allDay=start.isDate;
    if(!allDay&&stamp(end,fallback)<stamp(start,fallback)||allDay&&date(end)<date(start))throw Error('事件結束時間早於開始時間。');
    return {title:event.summary||'（未命名事件）',date:date(start),endDate:date(end),start:allDay?'00:00':time(start),end:allDay?'00:00':time(end),timezone,allDay,place:event.location||'',notes:event.description||'',attendees:event.attendees.map(p=>String(p.getFirstValue()).replace(/^mailto:/i,'')),links:event.component.getAllProperties('url').map(p=>p.getFirstValue()).filter(v=>/^https?:\/\//i.test(v)),reminders:event.component.getAllSubcomponents('valarm').flatMap(a=>{const d=a.getFirstPropertyValue('trigger');return d instanceof I.Duration&&d.toSeconds()<=0?[d.toSeconds()===0?'事件當下':`提前 ${-d.toSeconds()/60} 分鐘`]:[]})};
  }
  function build(record){
    const signature=JSON.stringify([record.icsData,record.timezone]);
    if(cache.has(signature))return cache.get(signature);
    const cal=new I.Component(JSON.parse(JSON.stringify(record.icsData)));setup(cal);
    const components=cal.getAllSubcomponents('vevent');
    const master=components.find(c=>!c.hasProperty('recurrence-id'));
    if(!master)throw Error('找不到重複事件的主系列。');
    const event=new I.Event(master,{exceptions:[]}),exceptions=new Map();
    for(const comp of components.filter(c=>c.hasProperty('recurrence-id'))){
      const recurrence=comp.getFirstPropertyValue('recurrence-id');
      if(comp.getFirstProperty('recurrence-id').getParameter('range'))throw Error('目前不支援以 THISANDFUTURE 一次更改後續系列，請先分成兩個系列。');
      exceptions.set(key(recurrence),comp);
    }
    const result={cal,event,exceptions};cache.set(signature,result);if(cache.size>200)cache.delete(cache.keys().next().value);return result;
  }
  function parse(text){
    if(!/^BEGIN:VCALENDAR\s*$/mi.test(text.replace(/^\uFEFF/,'')))throw Error('找不到 iCalendar 內容。');
    const cal=new I.Component(I.parse(text.replace(/^\uFEFF/,'')));setup(cal);
    const groups=new Map();
    for(const comp of cal.getAllSubcomponents('vevent')){
      const uid=comp.getFirstPropertyValue('uid')||crypto.randomUUID();
      if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(comp);
    }
    const result=[];
    for(const [uid,components] of groups){
      const latest=new Map();
      for(const comp of components){const rid=comp.getFirstPropertyValue('recurrence-id'),id=rid?key(rid):'master',prev=latest.get(id);if(!prev||Number(comp.getFirstPropertyValue('sequence')||0)>=Number(prev.getFirstPropertyValue('sequence')||0))latest.set(id,comp)}
      let master=latest.get('master');
      if(!master)throw Error('檔案只有單次例外、缺少主系列，請匯出完整行事曆。');
      const data=new I.Component(['vcalendar',[],[]]);data.updatePropertyWithValue('version','2.0');
      for(const zone of cal.getAllSubcomponents('vtimezone'))data.addSubcomponent(new I.Component(JSON.parse(JSON.stringify(zone.toJSON()))));
      for(const comp of latest.values())data.addSubcomponent(new I.Component(JSON.parse(JSON.stringify(comp.toJSON()))));
      const event=new I.Event(master,{exceptions:[]});
      const f=fields(event,Intl.DateTimeFormat().resolvedOptions().timeZone);
      const rule=master.getFirstPropertyValue('rrule');
      const record={...f,id:uid.replace(/@lifetempo\.local$/,''),sourceUID:uid,source:'ics',category:'其他',calendarId:'personal',repeat:rule?({DAILY:'每天',WEEKLY:'每週',MONTHLY:'每月',YEARLY:'每年'}[rule.freq]||'自訂週期'):master.hasProperty('rdate')?'自訂週期':'不重複',interval:rule?.interval||1,icsData:data.toJSON()};
      // Compatibility fields for the existing editor; the raw rule is authoritative.
      if(rule){record.until=rule.until?date(rule.until):'';const days=['SU','MO','TU','WE','TH','FR','SA'];record.weekdays=(rule.parts.BYDAY||[]).filter(v=>days.includes(v)).map(v=>days.indexOf(v));const ordinal=String(rule.parts.BYDAY?.[0]||'').match(/^(-?\d)(SU|MO|TU|WE|TH|FR|SA)$/);if(ordinal){record.monthlyMode='weekday';record.monthlyOrdinal=Number(ordinal[1])}}
      record.exceptions=master.getAllProperties('exdate').flatMap(p=>p.getValues().map(date));
      build(record);result.push(record);
    }
    return result;
  }
  function occurrence(record,ev,start,recurrence){
    const f=fields(ev,record.timezone),allDay=start.isDate;
    let end=ev.endDate.clone(),startInstant,endInstant;
    if(allDay){const days=(Date.parse(date(end))-Date.parse(date(ev.startDate)))/86400000;end=I.Time.fromDateString(C.addDays(date(start),days))}
    else{
      startInstant=stamp(start,record.timezone);
      const duration=ev.component.getFirstPropertyValue('duration');
      if(duration){end=start.clone();end.addDuration(duration);endInstant=stamp(end,record.timezone)}
      else{endInstant=startInstant+stamp(ev.endDate,record.timezone)-stamp(ev.startDate,record.timezone);end=localTime(endInstant,start.zone,record.timezone)}
    }
    return {...record,...f,id:record.id,seriesId:record.repeat!=='不重複'?record.id:undefined,recurrenceKey:key(recurrence),occurrence:date(start),occurrenceEndDate:date(end),start:allDay?'00:00':time(start),end:allDay?'00:00':time(end),startInstant,endInstant};
  }
  function expand(record,from,to){
    const {event,exceptions}=build(record);if(event.component.getFirstPropertyValue('status')==='CANCELLED')return [];
    const result=[],seen=new Set();
    const add=(ev,start,rid)=>{
      if(ev.component.getFirstPropertyValue('status')==='CANCELLED')return;
      const o=occurrence(record,ev,start,rid);
      if(o.occurrence<=to&&(o.occurrenceEndDate>from||o.occurrenceEndDate===from&&!o.allDay&&o.end!=='00:00'))result.push(o);
    };
    if(!event.isRecurring()){add(event,event.startDate,event.startDate);return result;}
    const iterator=event.iterator();let next,n=0;
    while((next=iterator.next())){
      if(++n>250000)throw Error('重複事件次數過多，請縮短系列或匯出日期範圍。');
      if(date(next)>to)break;
      const id=key(next),exception=exceptions.get(id);seen.add(id);
      if(exception){if(exception.getFirstPropertyValue('status')!=='CANCELLED'){const ev=new I.Event(exception,{exceptions:[]});add(ev,ev.startDate,next)}}
      else add(event,next,next);
    }
    // A moved occurrence can be visible even when its original date is outside this window or EXDATE.
    for(const [id,comp] of exceptions)if(!seen.has(id)&&comp.getFirstPropertyValue('status')!=='CANCELLED'){
      const ev=new I.Event(comp,{exceptions:[]});add(ev,ev.startDate,ev.recurrenceId);
    }
    return result;
  }
  function exportLines(record,zones=new Set()){
    return new I.Component(record.icsData).getAllSubcomponents().filter(c=>{
      if(c.name!=='vtimezone')return true;const id=c.getFirstPropertyValue('tzid');if(zones.has(id))return false;zones.add(id);return true;
    }).flatMap(c=>c.toString().replace(/\r\n[ \t]/g,'').split(/\r?\n/));
  }
  function update(record,recurrenceKey,patch,whole=false,cancel=false){
    const {cal,event}=build(record),copy=new I.Component(JSON.parse(JSON.stringify(cal.toJSON()))),uid=event.uid;
    let target=copy.getAllSubcomponents('vevent').find(c=>!c.hasProperty('recurrence-id'));
    if(!whole&&record.repeat!=='不重複'){
      let rid=I.Time.fromString(recurrenceKey);if(rid.zone===I.Timezone.localTimezone)rid.zone=event.startDate.zone;else rid=localTime(rid.toUnixTime()*1000,event.startDate.zone,record.timezone);
      for(const c of copy.getAllSubcomponents('vevent'))if(c.hasProperty('recurrence-id')&&key(c.getFirstPropertyValue('recurrence-id'))===key(rid))copy.removeSubcomponent(c);
      target=new I.Component(['vevent',[],[]]);target.updatePropertyWithValue('uid',uid);putTime(target,'recurrence-id',rid);copy.addSubcomponent(target);
    }
    if(cancel)target.updatePropertyWithValue('status','CANCELLED');
    else{
      if(whole&&record.repeat!=='不重複'){
        const delta=(Date.parse(patch.date+'T'+(patch.allDay?'00:00':patch.start)+':00Z')-Date.parse(record.date+'T'+(record.allDay?'00:00':record.start)+':00Z'))/1000;
        const shift=t=>{const moved=t.clone();moved.addDuration(I.Duration.fromSeconds(delta));return moved};
        for(const c of copy.getAllSubcomponents('vevent'))if(c.hasProperty('recurrence-id'))putTime(c,'recurrence-id',shift(c.getFirstPropertyValue('recurrence-id')));
        for(const name of ['exdate','rdate'])for(const property of target.getAllProperties(name))property.setValues(property.getValues().map(t=>t instanceof I.Time?shift(t):t));
      }
      target.removeAllProperties('status');target.updatePropertyWithValue('summary',patch.title);target.updatePropertyWithValue('location',patch.place||'');target.updatePropertyWithValue('description',patch.notes||'');
      const make=(d,t)=>{const value=I.Time.fromString(patch.allDay?d:d+'T'+t+':00');value.zone=I.TimezoneService.get(patch.timezone)||event.startDate.zone;return value};
      putTime(target,'dtstart',make(patch.date,patch.start));target.removeAllProperties('duration');putTime(target,'dtend',make(patch.endDate,patch.end));
      target.removeAllProperties('attendee');for(const value of patch.attendees||[])target.addPropertyWithValue('attendee','mailto:'+value);
      target.removeAllProperties('url');for(const value of patch.links||[])target.addPropertyWithValue('url',value);
      target.removeAllSubcomponents('valarm');
      for(const reminder of patch.reminders||[]){
        const match=reminder.match(/提前\s*(\d+)\s*(分鐘|小時|天|週)/),minutes=reminder==='事件當下'?0:match?Number(match[1])*({分鐘:1,小時:60,天:1440,週:10080}[match[2]]):null;
        if(minutes===null)continue;const alarm=new I.Component(['valarm',[],[]]);alarm.updatePropertyWithValue('action','DISPLAY');alarm.updatePropertyWithValue('description',patch.title);alarm.updatePropertyWithValue('trigger',I.Duration.fromSeconds(-minutes*60));target.addSubcomponent(alarm);
      }
    }
    target.updatePropertyWithValue('sequence',Number(target.getFirstPropertyValue('sequence')||0)+1);
    const updated=parse(copy.toString())[0];return {...record,...updated,source:record.source||updated.source,category:patch?.category||record.category,calendarId:patch?.calendarId||record.calendarId,attachments:patch?.attachments||record.attachments};
  }
  function fromGoogle(items,calendar){
    const cal=new I.Component(['vcalendar',[],[]]);cal.updatePropertyWithValue('version','2.0');
    const make=value=>{
      if(value.date)return I.Time.fromDateString(value.date);
      const zone=value.timeZone||calendar.timeZone||'UTC',p=C.parts(value.dateTime,zone);
      const t=I.Time.fromString(p.date+'T'+p.time+':00');
      // Register IANA timezone using the same adapter as parsed ICS.
      const dummy=new I.Component(['vevent',[],[]]),prop=new I.Property('dtstart');prop.setParameter('tzid',zone);prop.setValue(t);dummy.addProperty(prop);const container=new I.Component(['vcalendar',[],[]]);container.addSubcomponent(dummy);setup(container);
      t.zone=I.TimezoneService.get(zone)||I.Timezone.utcTimezone;return t;
    };
    for(const item of items){
      if(!item.start&&!item.originalStartTime)continue;
      const comp=new I.Component(['vevent',[],[]]);
      comp.updatePropertyWithValue('uid','google:'+calendar.id+':'+(item.recurringEventId||item.id));
      comp.updatePropertyWithValue('summary',item.summary||'（未命名事件）');
      const start=make(item.start||item.originalStartTime);putTime(comp,'dtstart',start);
      putTime(comp,'dtend',item.end?make(item.end):start.clone());
      if(item.originalStartTime)putTime(comp,'recurrence-id',make(item.originalStartTime));
      if(item.status==='cancelled')comp.updatePropertyWithValue('status','CANCELLED');
      for(const rule of item.recurrence||[])comp.addProperty(I.Property.fromString(rule));
      comp.updatePropertyWithValue('location',item.location||'');comp.updatePropertyWithValue('description',item.description||'');
      for(const attendee of item.attendees||[])if(attendee.email)comp.addPropertyWithValue('attendee','mailto:'+attendee.email);
      cal.addSubcomponent(comp);
    }
    return parse(cal.toString()).map(e=>({...e,source:'google',sourceCalendar:calendar.id}));
  }
  scope.CalendarICS={parse,expand,exportLines,update,fromGoogle,readFile};
})(globalThis);

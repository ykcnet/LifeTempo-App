// Pure calendar rules, shared by the browser and regression tests.
(function (scope) {
  const dayNumber = value => Date.parse(value + 'T00:00:00Z') / 86400000;
  const addDays = (date,n) => new Date((dayNumber(date)+n)*86400000).toISOString().slice(0,10);
  function endDate(event,date=event.date||event.occurrence) { return addDays(date,event.endDate?dayNumber(event.endDate)-dayNumber(event.date):event.allDay?1:0); }
  function occurs(event, date) {
    if (date < event.date || event.until && date > event.until || event.exceptions?.includes(date)) return false;
    const a = new Date(event.date + 'T00:00:00Z'), b = new Date(date + 'T00:00:00Z');
    const days = dayNumber(date) - dayNumber(event.date), interval = Math.max(1, Number(event.interval) || 1);
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
    switch (event.repeat) {
      case '每天': return days % interval === 0;
      case '每週': case '自訂週期': {
        const weekdays = event.weekdays?.length ? event.weekdays : [a.getUTCDay()];
        return Math.floor((days + a.getUTCDay()) / 7) % interval === 0 && weekdays.includes(b.getUTCDay());
      }
      case '每月':
        if (months % interval !== 0) return false;
        if (event.monthlyMode === 'weekday') {
          const ordinal = event.monthlyOrdinal || Math.ceil(a.getUTCDate() / 7);
          return b.getUTCDay() === a.getUTCDay() && (ordinal === -1 ? b.getUTCDate() + 7 > new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth()+1, 0)).getUTCDate() : Math.ceil(b.getUTCDate()/7) === ordinal);
        }
        return b.getUTCDate() === a.getUTCDate();
      case '每年': return (b.getUTCFullYear()-a.getUTCFullYear()) % interval === 0 && b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() === a.getUTCDate();
      default: return date === event.date;
    }
  }
  function expand(events, from, to) {
    const result = [];
    for (const event of events) {
      if(event.icsData) { result.push(...scope.CalendarICS.expand(event,from,to)); continue; }
      const span=Math.max(0,dayNumber(endDate(event))-dayNumber(event.date));
      for (let day = Math.max(dayNumber(event.date),dayNumber(from)-span-1), end = dayNumber(to); day <= end; day++) {
        const date = new Date(day * 86400000).toISOString().slice(0,10);
        if (!occurs(event,date) || event.overrides?.[date]) continue;
        if(date<from&&(endDate(event,date)<from||endDate(event,date)===from&&(event.allDay||event.end==='00:00')))continue;
        const recurring = event.repeat && event.repeat !== '不重複';
        result.push({...event, occurrence: date, occurrenceEndDate:endDate(event,date), recurrenceKey:date, ...(recurring ? {seriesId:event.id} : {})});
      }
      for(const [key,override] of Object.entries(event.overrides||{})){
        if(!override.cancelled&&override.date<=to&&endDate(override)>=from)result.push({...override,id:event.id,seriesId:event.id,recurrenceKey:key,occurrence:override.date,occurrenceEndDate:endDate(override)});
      }
    }
    return result;
  }
  function toICS(events) {
    const escape=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const stamp=(date,time)=>{if(time==='24:00'){date=new Date((dayNumber(date)+1)*86400000).toISOString().slice(0,10);time='00:00';}return date.replaceAll('-','')+'T'+(time||'00:00').replace(':','')+'00';};
    const weekdays=['SU','MO','TU','WE','TH','FR','SA'];
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//LifeTempo//Calendar//ZH-TW','CALSCALE:GREGORIAN'];
    const zones=new Set();
    for(const e of events) {
      if(e.icsData){lines.push(...scope.CalendarICS.exportLines(e,zones));continue;}
      lines.push('BEGIN:VEVENT','UID:'+escape(e.id)+'@lifetempo.local','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'SUMMARY:'+escape(e.title));
      if(e.allDay) {
        lines.push('DTSTART;VALUE=DATE:'+e.date.replaceAll('-',''),'DTEND;VALUE=DATE:'+endDate(e).replaceAll('-',''));
      } else {
        const parameter=e.timezone?';TZID='+e.timezone:'';
        lines.push('DTSTART'+parameter+':'+stamp(e.date,e.start),'DTEND'+parameter+':'+stamp(endDate(e),e.end));
      }
      const freq={'每天':'DAILY','每週':'WEEKLY','每月':'MONTHLY','每年':'YEARLY','自訂週期':'WEEKLY'}[e.repeat];
      if(freq) {
        let rule=`RRULE:FREQ=${freq};INTERVAL=${e.interval||1}`;
        if(freq==='WEEKLY')rule+=';WKST=SU';
        if(freq==='WEEKLY'&&e.weekdays?.length)rule+=';BYDAY='+e.weekdays.map(d=>weekdays[d]).join(',');
        if(freq==='MONTHLY'&&e.monthlyMode==='weekday')rule+=';BYDAY='+(e.monthlyOrdinal||Math.ceil(new Date(e.date+'T00:00Z').getUTCDate()/7))+weekdays[new Date(e.date+'T00:00Z').getUTCDay()];
        if(e.until)rule+=';UNTIL='+(e.allDay?e.until.replaceAll('-',''):stamp(e.until,'23:59'));
        lines.push(rule);
        if(e.exceptions?.length)lines.push('EXDATE'+(e.allDay?';VALUE=DATE':e.timezone?';TZID='+e.timezone:'')+':'+e.exceptions.map(d=>e.allDay?d.replaceAll('-',''):stamp(d,e.start)).join(','));
      }
      if(e.place)lines.push('LOCATION:'+escape(e.place));
      if(e.notes)lines.push('DESCRIPTION:'+escape(e.notes));
      for(const link of e.links||[])if(/^https?:\/\//i.test(link))lines.push('URL:'+escape(link));
      for(const attendee of e.attendees||[])lines.push('ATTENDEE:mailto:'+escape(attendee));
      for(const reminder of e.reminders||[]) {
        const match=reminder.match(/提前\s*(\d+)\s*(分鐘|小時|天|週)/);
        const minutes=reminder==='事件當下'?0:match?Number(match[1])*({分鐘:1,小時:60,天:1440,週:10080}[match[2]]):null;
        if(minutes!==null)lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escape(e.title),'TRIGGER:-PT'+minutes+'M','END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    // RFC line folding counts UTF-8 octets, not JavaScript code units.
    return lines.map(line=>{let result='',width=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(width+size>75){result+='\r\n ';width=1;}result+=char;width+=size;}return result;}).join('\r\n')+'\r\n';
  }
  const formatters=new Map();
  function parts(instant,zone) {
    if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
  }
  function instant(date,time,zone) {
    if(time==='24:00')return instant(new Date((dayNumber(date)+1)*86400000).toISOString().slice(0,10),'00:00',zone);
    const desired=Date.parse(`${date}T${time}:00Z`);
    // Probe both seasonal offsets; reject nonexistent local times and choose
    // the earlier occurrence of a repeated clock time at the autumn transition.
    const candidates=[];
    for(const delta of [-36,0,36]) {
      const probe=desired+delta*3600000,p=parts(probe,zone);
      const offset=Date.parse(`${p.date}T${p.time}:00Z`)-probe;
      const candidate=desired-offset,check=parts(candidate,zone);
      if(check.date===date&&check.time===time)candidates.push(candidate);
    }
    return candidates.length?Math.min(...candidates):null;
  }
  function display(occurrence,zone,fallbackZone) {
    if(occurrence.allDay){const result=[];for(let date=occurrence.occurrence;date<(occurrence.occurrenceEndDate||endDate(occurrence,occurrence.occurrence));date=addDays(date,1))result.push({...occurrence,displayDate:date});return result;}
    const sourceZone=occurrence.timezone||fallbackZone;
    const start=occurrence.startInstant??instant(occurrence.occurrence,occurrence.start,sourceZone),end=occurrence.endInstant??instant(occurrence.occurrenceEndDate||endDate(occurrence,occurrence.occurrence),occurrence.end,sourceZone);
    if(start===null||end===null)return [];
    const a=parts(start,zone),b=parts(end,zone);
    const base={...occurrence,sourceStart:occurrence.start,sourceEnd:occurrence.end,startInstant:start,endInstant:end};
    if(a.date===b.date)return [{...base,displayDate:a.date,start:a.time,end:b.time}];
    const result=[];
    for(let date=a.date;date<=b.date;date=addDays(date,1)){
      if(date===b.date&&b.time==='00:00')break;
      result.push({...base,displayDate:date,start:date===a.date?a.time:'00:00',end:date===b.date?b.time:'24:00'});
    }
    return result;
  }
  scope.CalendarCore = {occurs, expand, toICS, instant, parts, display, addDays, endDate};
})(globalThis);

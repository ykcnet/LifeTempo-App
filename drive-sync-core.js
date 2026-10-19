/* Pure sync decisions shared by the browser and Android WebView. */
(function(scope){
  'use strict';
  function canonical(value){
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  function validate(state){
    if(!state||state.schemaVersion!==1)throw Error('不支援的雲端資料版本');
    for(const key of ['events','tasks','calendars']){
      if(!Array.isArray(state[key])||state[key].length>50000)throw Error('雲端資料格式不正確');
      const ids=new Set();
      for(const row of state[key]){
        if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('雲端項目缺少唯一識別碼');
        ids.add(row.id);
      }
    }
    if(!state.calendars.length||!state.categories||typeof state.categories!=='object'||Array.isArray(state.categories)
      ||!Array.isArray(state.inviteChannels)||!state.inviteChannels.every(v=>typeof v==='string')
      ||!state.settings||!['12','24'].includes(state.settings.clockFormat))throw Error('雲端設定格式不正確');
    if(typeof state.settings.timezone!=='string')throw Error('缺少顯示時區');
    for(const event of state.events){
      if(typeof event.title!=='string'||typeof event.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(event.date))throw Error('雲端事件名稱或日期不正確');
      if(!event.allDay&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start||'')||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(event.end||'')))throw Error('雲端事件時間不正確');
    }
    new Intl.DateTimeFormat('en',{timeZone:state.settings.timezone});
    // Only these fields are transferred; credentials and device preferences stay local.
    return JSON.parse(JSON.stringify({schemaVersion:1,events:state.events,tasks:state.tasks,calendars:state.calendars,
      categories:state.categories,inviteChannels:state.inviteChannels,settings:{timezone:state.settings.timezone,clockFormat:state.settings.clockFormat}}));
  }
  function heads(records){
    const ids=new Set(records.map(r=>r.id)),superseded=new Set();
    if(ids.size!==records.length)throw Error('雲端版本識別碼重複');
    for(const row of records){
      if(!Array.isArray(row.parents)||row.parents.some(id=>typeof id!=='string'||id===row.id||!ids.has(id)))throw Error('雲端歷史版本不完整，已停止同步');
      row.parents.forEach(id=>superseded.add(id));
    }
    const result=records.filter(row=>!superseded.has(row.id));
    if(records.length&&!result.length)throw Error('雲端版本鏈不正確');
    return result;
  }
  function decide(localHash,baseHash,remoteHashes,hasLocalContent){
    if(!remoteHashes.length)return baseHash?'conflict':'upload';
    const unique=[...new Set(remoteHashes)];
    if(unique.length>1)return 'conflict';
    const remoteHash=unique[0];
    if(localHash===remoteHash)return 'equal';
    if(!baseHash)return hasLocalContent?'conflict':'download';
    if(localHash===baseHash)return 'download';
    if(remoteHash===baseHash)return 'upload';
    return 'conflict';
  }
  scope.LifeTempoDriveCore={canonical,validate,heads,decide};
})(globalThis);

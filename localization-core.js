(function(scope){
  const defaults={region:'TW',city:'taipei',lunar:true,terms:true,weekNumbers:true,weekStart:0,yearFormat:'gregory',weather:true};
  function normalize(value={}){
    value=value||{};
    return {...defaults,region:['TW','none'].includes(value.region)?value.region:defaults.region,city:cities[value.city]?value.city:defaults.city,...Object.fromEntries(['lunar','terms','weekNumbers','weather'].map(k=>[k,typeof value[k]==='boolean'?value[k]:defaults[k]])),weekStart:value.weekStart===1?1:0,yearFormat:value.yearFormat==='roc'?'roc':'gregory'};
  }
  const cities={taipei:['臺北市',25.03,121.56],newtaipei:['新北市',25.01,121.46],keelung:['基隆市',25.13,121.74],taoyuan:['桃園市',24.99,121.30],hsinchu:['新竹市',24.81,120.97],hsinchucounty:['新竹縣',24.84,121.01],miaoli:['苗栗縣',24.56,120.82],taichung:['臺中市',24.15,120.67],changhua:['彰化縣',24.07,120.54],nantou:['南投縣',23.91,120.68],yunlin:['雲林縣',23.71,120.54],chiayi:['嘉義市',23.48,120.45],chiayicounty:['嘉義縣',23.46,120.25],tainan:['臺南市',22.99,120.21],kaohsiung:['高雄市',22.63,120.30],pingtung:['屏東縣',22.67,120.49],yilan:['宜蘭縣',24.76,121.75],hualien:['花蓮縣',23.98,121.61],taitung:['臺東縣',22.76,121.14],penghu:['澎湖縣',23.57,119.58],kinmen:['金門縣',24.43,118.32],lienchiang:['連江縣',26.16,119.95]};
  function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function holiday(date,region='TW'){
    if(region!=='TW')return null;
    const key=typeof date==='string'?date:dateKey(date),entry=scope.LocalCalendarData?.holidays[key];
    if(!entry)return null;
    const weekend=[0,6].includes(new Date(key+'T12:00:00Z').getUTCDay());
    return {...entry,label:entry.name||(entry.off?(weekend?'週末':'放假'):(weekend?'補班':'')),makeup:!entry.off&&weekend};
  }
  function lunar(date){
    try{
      const parts=new Intl.DateTimeFormat('zh-TW-u-ca-chinese',{month:'long',day:'numeric'}).formatToParts(date);
      const month=parts.find(p=>p.type==='month')?.value||'',day=Number(parts.find(p=>p.type==='day')?.value);
      const official=scope.LocalCalendarData?.lunarDays[dateKey(date)];
      const digits=['','一','二','三','四','五','六','七','八','九'];
      const label=official?(official.includes('月')?'初一':official):day===10?'初十':day===20?'二十':day===30?'三十':day<10?'初'+digits[day]:day<20?'十'+digits[day-10]:'廿'+digits[day-20];
      return month+label;
    }catch{return '農曆資料不可用';}
  }
  function weatherLabel(code){
    if(code===null||code===undefined)return '資料不足';
    return ({0:'晴',1:'晴時多雲',2:'多雲',3:'陰',45:'霧',48:'霧凇',51:'毛毛雨',53:'毛毛雨',55:'濃毛毛雨',56:'凍毛毛雨',57:'凍毛毛雨',61:'小雨',63:'雨',65:'大雨',66:'凍雨',67:'凍雨',71:'小雪',73:'雪',75:'大雪',77:'雪粒',80:'陣雨',81:'陣雨',82:'強陣雨',85:'陣雪',86:'強陣雪',95:'雷雨',96:'雷雨伴冰雹',99:'雷雨伴冰雹'})[code]||'天氣資料';
  }
  function weatherURL(city){const [,lat,lon]=cities[city]||cities.taipei;const query=new URLSearchParams({latitude:lat,longitude:lon,daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'Asia/Taipei',forecast_days:'7'});return 'https://api.open-meteo.com/v1/forecast?'+query;}
  function parseWeather(payload){const d=payload?.daily;if(!Array.isArray(d?.time)||!d.time.length||d.time.length>16)throw Error('天氣資料不完整');return d.time.map((date,i)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('天氣日期不正確');const number=key=>Number.isFinite(d[key]?.[i])?d[key][i]:null;return {date,code:number('weather_code'),min:number('temperature_2m_min'),max:number('temperature_2m_max'),rain:number('precipitation_probability_max')};});}
  let saved={};try{saved=JSON.parse(scope.localStorage?.getItem('lifetempo.locale')||'{}')}catch{}
  scope.LocalCalendar={settings:normalize(saved),defaults,cities,normalize,dateKey,holiday,lunar,weatherLabel,weatherURL,parseWeather};
  scope.localYear=year=>scope.LocalCalendar.settings.yearFormat==='roc'?`民國 ${year-1911}`:String(year);
  scope.localWeekdays=()=>Array.from({length:7},(_,i)=>['日','一','二','三','四','五','六'][(i+scope.LocalCalendar.settings.weekStart)%7]);
  scope.localDayDetail=date=>[scope.LocalCalendar.settings.lunar?'農曆'+lunar(date):'',scope.LocalCalendar.settings.terms?scope.LocalCalendarData.terms[dateKey(date)]||'':''].filter(Boolean).join(' · ');
})(globalThis);

(function () {
  const stamp = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const shift = (d,n) => { const copy=new Date(d); copy.setDate(copy.getDate()+n); return copy; };
  function parse(text, base=new Date(), fallbackStart=stamp(base)) {
    text=String(text||'').normalize('NFKC').replaceAll('臺','台').replaceAll('星期','週').replaceAll('周','週');
    const result={}, dates=[];
    const pattern=/(?<![\d/])(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?|(\d{1,2})[月/](\d{1,2})日?(?!\d)|今天|明天|大後天|後天|(下下|下|本|這)?週([一二三四五六日天])|(?:到|至|[-~～–—])\s*(\d{1,2})日/g;
    let m, weekOffset=0, previousEnd=0;
    while((m=pattern.exec(text))) {
      let d;
      if(m[1]||m[4]||m[8]) {
        const previous=dates.at(-1);
        const connected=previous&&(m[8]||/^\s*(?:到|至|[-~～–—]|和|與|、)\s*$/.test(text.slice(previousEnd,m.index)));
        if(m[8]&&!connected) continue;
        let year=+(m[1]||(connected?previous.getFullYear():base.getFullYear()));
        let month=+(m[2]||m[4]||(previous.getMonth()+1));
        const day=+(m[3]||m[5]||m[8]);
        if(connected&&!m[1]) {
          if(m[8]&&day<previous.getDate()) month++;
          if(month>12) {month=1;year++;}
          else if(!m[8]&&month<previous.getMonth()+1) year++;
        }
        d=new Date(year,month-1,day);
        if(d.getMonth()!==month-1||d.getDate()!==day) continue;
      } else if(m[7]) {
        if(m[6]) weekOffset=m[6]==='下下'?14:m[6]==='下'?7:0;
        const day='一二三四五六日'.indexOf(m[7]==='天'?'日':m[7]);
        d=shift(base,-((base.getDay()+6)%7)+weekOffset+day);
      } else d=shift(base,{'今天':0,'明天':1,'後天':2,'大後天':3}[m[0]]);
      dates.push(d);
      previousEnd=pattern.lastIndex;
    }
    if(dates.length) {
      result.startDate=stamp(dates[0]);
      result.endDate=stamp(dates[dates.length-1]);
    }
    const duration=text.match(/([一二兩三四五六七八九十\d]+)\s*天(?:[一二兩三四五六七八九十\d]+夜)?/);
    if(duration&&dates.length<2) {
      const n=/^\d+$/.test(duration[1])?+duration[1]:({'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[duration[1]]);
      if(n&&n<=366) result.endDate=stamp(shift(dates[0]||new Date(fallbackStart+'T00:00:00'),n-1));
    }
    const categories=[['旅遊',/旅遊|旅行|觀光|景點|度假|自由行|自助行|兩天一夜|三天兩夜/],['工作',/工作|出差|客戶|會議|開會/],['健康',/運動|健身|慢跑|看診|就醫/],['家庭',/家庭|家人|親子/],['個人',/個人|購物|買東西/]];
    result.category=categories.find(([,re])=>re.test(text))?.[0];
    const place=text.match(/(?:地點[：:]|在|前往|去)\s*([^，,。；;\n]+?)(?=安排|進行|開會|會議|討論|旅行|旅遊|出差|玩|吃飯|健身|慢跑|散步|看診|$)/);
    const cities=[...text.matchAll(/台北|新北|桃園|台中|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|台東|澎湖|金門|連江|東京|大阪|京都|首爾|香港/g)];
    const travelCity=result.category==='旅遊'
      ? cities.find(city=>!/(?:家住|(?:我家|家)?住在|居住在|居住於|家在|從|自|回到|回程(?:到)?|返程(?:到)?|返家(?:到)?|回\s*$)/.test(text.slice(Math.max(0,city.index-10),city.index)))
      : null;
    if(travelCity) result.location=travelCity[0];
    else if(place&&place[1].trim().length<=30) result.location=place[1].trim();
    else if(cities.length) result.location=cities[0][0];
    return result;
  }
  globalThis.AIRequest={parse};
})();

function cleanNaturalTitle(value) {
  let text=String(value||'').replace(/[，,。；;：:]/g,' ').replace(/\s+/g,' ').trim();
  // Remove conversational requests only at the beginning, after date/time extraction.
  // Keep words such as 要求、要點、想法、重要 and negative instructions intact.
  const action='(?:編輯|開發|修改|更新|測試|設計|撰寫|寫|閱讀|讀|整理|完成|處理|討論|開會|開|參加|準備|購買|買|預訂|預約|打|寄|送|領|取|吃|喝|運動|跑步|散步|健身|上課|看診|看|去|前往|拜訪|接|做|工作|學習|練習)';
  const modal=new RegExp('^(?:我想要|我需要|我想|我要|想要|需要|要|想)\\s*(?='+action+')');
  const request=/^(?:麻煩(?:你)?|請(?:你)?|幫我|替我|提醒我|記得|安排我|幫忙)\s*/;
  for(let i=0;i<10;i++) {
    const next=text.replace(request,'').replace(modal,'').trim();
    if(next===text)break;
    text=next;
  }
  return text || '新行程';
}

// Same-origin bridge between the offline-first calendar and the booking API.
// The owner token is kept in sessionStorage and never sent to public booking pages.
document.addEventListener('click', event => {
  const button = event.target.closest('#connectBookingService,#publishBookingService,#copyPublicBooking,#configureBooking');
  if (!button) return;
  if (button.id === 'connectBookingService') connectBookingService();
  if (button.id === 'publishBookingService') publishBookingService();
  if (button.id === 'copyPublicBooking') copyPublicBooking();
  if (button.id === 'configureBooking') openBookingConfig();
});

async function connectBookingService() {
  if (location.protocol === 'file:') {
    toast('請先執行 node server.mjs，再透過 http://localhost:4173 開啟 LifeTempo');
    return;
  }
  const token = prompt('貼上啟動伺服器時顯示的 LifeTempo owner token');
  if (!token) return;
  try {
    const response = await fetch('/api/owner/config', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error();
    const config = await response.json();
    sessionStorage.setItem('lifetempo.bookingTimezone',config.timezone);
    sessionStorage.setItem('lifetempo.ownerToken', token);
    bookingSlug = config.slug;
    sessionStorage.setItem('lifetempo.bookingSlug', bookingSlug);
    toast('預約服務已連線');
    render();
  } catch {
    toast('連線失敗，請確認服務已啟動且 token 正確');
  }
}

async function publishBookingService() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token) return toast('請先連線預約服務');
  try {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const configResponse = await fetch('/api/owner/config', { headers });
    if (!configResponse.ok) throw new Error('預約服務連線失效');
    const current = await configResponse.json();
    bookingSlug = current.slug;
    const configResponsePut = await fetch('/api/owner/config', {
      method: 'PUT', headers,
      body: JSON.stringify({
        slug: bookingSlug, title: '預約時間', timezone: selectedTz,
        start: bookingPrefs.start, end: bookingPrefs.end,
        duration: bookingPrefs.duration, days: bookingPrefs.days, enabled: true
      })
    });
    if (!configResponsePut.ok) throw new Error('預約設定儲存失敗');
    sessionStorage.setItem('lifetempo.bookingTimezone',selectedTz);

    const busy = collectBusyPeriods();
    const busyResponse = await fetch('/api/owner/busy', { method: 'PUT', headers, body: JSON.stringify({ events: busy }) });
    if (!busyResponse.ok) throw new Error('行程空檔同步失敗');
    sessionStorage.setItem('lifetempo.bookingSlug', bookingSlug);

    const bookingResponse = await fetch('/api/owner/bookings', { headers });
    if (!bookingResponse.ok) throw new Error('預約清單讀取失敗');
    const { bookings } = await bookingResponse.json();
    let imported = 0;
    for (const booking of bookings) {
      const id = `external-booking-${booking.id}`;
      if (events.some(event => event.id === id)) continue;
      events.push({
        id, timezone:selectedTz, title: `預約：${booking.name}`, date: booking.date, start: booking.start, end: booking.end,
        category: '個人', calendarId: 'personal', place: '',
        notes: [booking.email, booking.note].filter(Boolean).join(' · '), repeat: '不重複',
        reminders: [], attendees: booking.email ? [booking.email] : [], links: [], allDay: false
      });
      imported++;
    }
    if (imported) localStorage.setItem('lifetempo.events', JSON.stringify(events));
    const link = `${location.origin}/book/${encodeURIComponent(bookingSlug)}`;
    render();
    toast(`已發布空檔並匯入 ${imported} 筆外部預約`);
  } catch (error) {
    toast(error.message || '發布同步失敗');
  }
}

function collectBusyPeriods() {
  const result = [];
  for (let offset = 0; offset < 180; offset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const key = iso(date);
    for (const event of expandEvents(date,date,sessionStorage.getItem('lifetempo.bookingTimezone')||selectedTz)) {
      if (event.id.startsWith('external-booking-')) continue;
      result.push({ id: `${event.id}-${key}-${event.recurrenceKey||event.occurrence||key}`, date: key, start: event.start, end: event.end, allDay: event.allDay });
    }
  }
  return result;
}

async function syncBusyPeriods() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token || location.protocol === 'file:') return;
  try {
    const response = await fetch('/api/owner/busy', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: collectBusyPeriods() })
    });
    if (!response.ok) throw Error('同步失敗');
    localStorage.removeItem('lifetempo.bookingPending');
  } catch { localStorage.setItem('lifetempo.bookingPending','1'); }
}

let pollingBookings = false;
async function refreshBookings() {
  const token = sessionStorage.getItem('lifetempo.ownerToken');
  if (!token || pollingBookings || !navigator.onLine || location.protocol === 'file:') return;
  pollingBookings = true;
  try {
    const response = await fetch('/api/owner/bookings', {headers:{Authorization:`Bearer ${token}`}});
    if (!response.ok) throw Error('預約同步失敗');
    const {bookings} = await response.json();
    const ids = new Set(bookings.map(b=>`external-booking-${b.id}`));
    let changed = events.some(e=>e.id.startsWith('external-booking-')&&!ids.has(e.id));
    events = events.filter(e=>!e.id.startsWith('external-booking-')||ids.has(e.id));
    for (const b of bookings) {
      const id=`external-booking-${b.id}`;
      if (events.some(e=>e.id===id)) continue;
      events.push({id,timezone:sessionStorage.getItem('lifetempo.bookingTimezone')||deviceZone,title:`預約：${b.name}`,date:b.date,start:b.start,end:b.end,category:'個人',calendarId:'personal',place:'',notes:[b.email,b.note].filter(Boolean).join(' · '),repeat:'不重複',reminders:[],attendees:b.email?[b.email]:[],links:[],allDay:false});
      changed=true;
    }
    if (changed) {
      localStorage.setItem('lifetempo.events',JSON.stringify(events));
      if (!document.querySelector('.modal-wrap') && document.activeElement?.tagName !== 'INPUT') render();
    }
    if(localStorage.getItem('lifetempo.bookingPending')) await syncBusyPeriods();
  } catch { /* The next poll or online event retries without discarding local data. */ }
  finally { pollingBookings=false; }
}
window.addEventListener('online',()=>{syncBusyPeriods();refreshBookings()});
setInterval(refreshBookings,15000);

async function cancelExternalBooking(id) {
  const token=sessionStorage.getItem('lifetempo.ownerToken');
  if(!token) return toast('請先連線預約服務，才能取消外部預約');
  if(!confirm('取消這筆外部預約並釋放時段？')) return;
  try {
    const response=await fetch('/api/owner/bookings/'+encodeURIComponent(id.replace('external-booking-','')), {method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok&&response.status!==404) throw Error();
    events=events.filter(e=>e.id!==id);save();render();toast('預約已取消，時段已釋放');
  } catch {toast('取消失敗，請連線後重試');}
}

async function copyPublicBooking() {
  if (!bookingSlug) return toast('請先連線並發布預約服務');
  const link = `${location.origin}/book/${encodeURIComponent(bookingSlug)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('公開預約連結已複製');
  } catch {
    prompt('複製公開預約連結', link);
  }
}

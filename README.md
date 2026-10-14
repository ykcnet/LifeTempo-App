# LifeTempo-App（生活節奏）

這是依照 `LifeTempo App.md` 製作的離線優先響應式行事曆原型。單機模式可直接以現代瀏覽器開啟 `index.html`；**預約服務模式**需使用 Node.js 24 或更新版本啟動內建 SQLite 後端。尚未產生任何安裝程式。

## 開啟預約服務

Windows 使用者可雙擊 `啟動 LifeTempo.cmd`，以本機網址 `http://localhost:4174` 開啟並使用 AI 行程規劃（需 Node.js 24 以上）。在該網址的「行事曆設定」儲存 AI 供應商、模型與 API Key。直接開啟 `index.html` 無法連線 AI；AI 失敗時會保留需求並顯示原因，不再自動以通用範本代替。模型欄位可輸入供應商帳號目前可用的模型 ID。

檔案模式與本機網址的瀏覽器資料各自保存。切換前請在舊頁面匯出 JSON，再於新網址匯入；API Key 需重新設定，JSON 備份不包含金鑰。

1. 在專案目錄執行 `node server.mjs`。
2. 首次啟動時，將終端機顯示的 owner token 妥善保存；token 會存在被忽略的 `data/owner-token`，之後重啟仍可使用。
3. 開啟 `http://localhost:4173`，到「空檔預約」選「連線預約服務」，貼上 owner token。
4. 設定可預約星期與時段，再按「發布／同步」。App 會同步未來 180 天的忙碌時段及外部預約。
5. 複製頁面提供的 `/book/<slug>` 公開網址，外部人員即可選日期、時段並提交姓名、Email 與備註。

SQLite 預約資料與 owner token 儲存在 `data/`。外部成功預約會立即佔用時段；連線後，保持 App 開啟會每 15 秒自動匯入，亦可按「發布／同步」。伺服器預設只適合本機或可信任的測試環境。要讓網際網路上的受邀者開啟，仍需部署到 HTTPS 網站並配置網域、備份及正式的安全防護；不要把 owner token 傳給受邀者。

## 2026-10-08 功能補強

### 在地化補完

「行事曆設定 → 在地化與天氣」可設定臺灣政府行政機關假日、農曆、二十四節氣、ISO 週數、星期一／日開週、民國／西元年份，以及臺灣 22 縣市的天氣預報。預設城市為臺北，不會請求装置定位。在地化偏好也納入 JSON 備份。

假日與逐年節氣內建 **2025–2027** 年官方資料，離線可讀，日／週／月／清單直接標示節日及補假；年視圖顯示節日／補假天數。其他年份明確顯示資料未收錄，農曆則使用瀏覽器 Intl 日曆。節氣日期採 UTC+8，切換行程時區不改變其民用日期。官方假日不是使用者事件，不會佔用預約空檔。民間休假依適用制度，非直接套用政府機關日曆。

天氣使用 Open-Meteo 的城市中心 7 日預報，包含天氣、最高／最低溫及降雨機率。每 30 分鐘更新，可手動重試；失敗或離線時保留快取並顯示更新時間，沒有資料時不顯示虛構數值。可關閉天氣連線。免費公共端點與商業部署條件見 `localization-sources/README.md`。

完整來源與更新方式見 `localization-sources/README.md`。重建資料：`node build-localization-data.mjs`。驗證：`node --test --test-isolation=none calendar.test.mjs localization.test.mjs`，目前 19 項通過。

- 修正週重複間隔、指定星期、月底日期漂移、閏日及舊系列超過 2,000 天後消失；新增每月第 1–5／最後一個星期、重複結束日期。不存在的月日直接跳過，例如每月 31 日不會改成 28 日。
- 修正單次重複行程編輯／刪除、年視圖重複計數、參與者反向篩選、舊行程個人日曆篩選與月底切換月份。
- 搜尋獨立列出所有歷史及未來行程，重複系列只列一次。
- 日／週提供 24 小時時間軸及待辦拖曳入口。拖曳依落點設定時間，儲存成功才完成待辦，取消保留任務。
- 提醒支援自訂分鐘及全天行程，修正提前一天／一週提醒漏發；仍需要頁面開啟及瀏覽器通知權限。
- AI 行程規劃會檢查指定日期範圍、行程彼此及已選擇避開的忙碌時段；發現衝突會提示重新規劃，不會把衝突安排帶入確認畫面。
- 本機行程記錄來源時區，顯示時依選定時區換算，支援跨日及夏令時間；編輯使用來源時區。舊行程首次載入以裝置時區遷移。夏令時間不存在的時間不可儲存，重複的時鐘時間採較早的一次。全天行程不換日。
- PDF、PNG、JPEG、WebP、GIF 附件可新增、移除、下載，每筆事件合計最多 1 MB；隨 JSON 備份保存。此功能為本機保存，未上傳雲端。
- 系統深／淺色自動跟隨及三種主題重點色；手機版「更多」可前往預約、共享、設定。
- PWA manifest 與 Service Worker：透過 localhost／HTTPS 成功載入一次後，可離線重新開啟。API、公開預約頁與授權資料不進入離線快取。直接開啟 file:// 不支援 Service Worker。
- 預約每 15 秒背景輪詢匯入；重新連線後重試未成功的忙碌時段同步。事件編輯視窗可取消外部預約並釋放時段，需 owner token。這是預約資料同步，並非跨裝置帳號同步。
- ICS 匯出保留時區、每月第幾週、結束日期、排除日期與提醒，並支援中文長行折行；匯入支援本 App 輸出的這些欄位。ICS 事件以原始系列保存，支援跨日重複、EXDATE／RDATE、RECURRENCE-ID 單次改期與取消；JSON 可完整備份。

驗證：`node --test --test-isolation=none calendar.test.mjs`（11 項）。涵蓋重複规则、時區／夏令時間、ICS 往返、篩選、提醒及預約忙碌時段。另已實際檢查瀏覽器新增表單、搜尋與手機設定入口；尚未進行正式多裝置、背景通知或生產部署驗收。

## 已補齊且可操作的功能

- 日、週、月、年、清單和待辦視圖；週數、農曆日期及常用節氣日期。
- 自然語言快速新增：文字或支援瀏覽器的語音輸入，可解析常見中文日期（今天/明天/後天/下週、年月日）、時間、地點與參與者；先顯示解析結果，再開啟表單確認。
- 行程建立、編輯、刪除、全天、分類/顏色、說明、地點、參與者、會議或附件 URL。
- 每日/每週指定星期/每月/每年重複與自訂間隔；循環日期會在日曆展開，單次例外可排除。
- 單一行程多組提醒設定；可請求瀏覽器通知權限，App 開啟時排程本機提醒。
- 標題、說明、地點、分類與參與者全文搜尋；分類和參與者篩選；使用者可新增分類與色彩。
- 待辦新增、編輯、完成、刪除；編輯標題會同步更新已連結的行程，拖曳待辦到週/日視圖日期可轉成一小時行程。
- Android 原生 App 提供「月曆」、「今日行程」及「待辦事項」三種主畫面 Widget，可從 Android Widget 選單加入並水平／垂直調整尺寸；月曆依手機尺寸顯示日期格與行程標記，週起始日跟隨 App 設定。Android 專案位於 `android/`，以 Android Studio 開啟建置。
- 可預約空檔的本機預覽與預約設定。
- Node.js/SQLite 預約服務：公開預約頁、日期與空檔 API、姓名/Email/備註表單、交易鎖定避免同一時段重複預約、owner token 保護的設定與忙碌時段同步、簡易請求速率限制。LifeTempo 可發布未來 180 天忙碌時段及匯入外部預約。
- 共享行事曆本機管理：建立/刪除共享日曆、改名、設定 personal-only / read-only / full-access、依日曆篩選行程；唯讀行事曆會阻止新增或編輯事件。
- 共享邀請本機記錄：預設 Email、LINE、Messenger、微信，可自行新增 WhatsApp、Telegram 等管道；記錄受邀者、邀請方式、權限和待回覆 RSVP，並可複製邀請文字或刪除邀請記錄。
- 邀請文字含專屬加入連結；受邀者開啟連結後按「一鍵加入行事曆」，即可接受邀請、切換到受邀者身分並套用該成員唯讀/可編輯權限。
- 有固定選項的設定使用可點選的按鈕／選項卡，例如時區、通訊管道、共享權限、分類顏色、預約星期與時段；名稱與受邀者等自由文字使用輸入欄。
- 時間格式可選 12 小時制或 24 小時制，顯示於日／週行程、清單、預約時段與自然語言解析預覽；資料以標準 24 小時值儲存。
- 首次使用從空白行事曆開始，不自動加入範本或示範行程。可自行選取其他行事曆匯出的 iCalendar `.ics` 或 JSON 備份，確認後匯入；支援 JSON／ICS 匯出。
- 行程資料、待辦、分類和主題保存在瀏覽器 `localStorage`。

Android 原生 App 使用自己的 WebView 儲存空間，與 Chrome／PWA 資料分開；安裝原生 Widget 版前，請先從 TWA/PWA 匯出 JSON，再於原生 App 匯入。Android 主畫面 Widget 顯示原生 App 內資料；App 本身不另設 Widget 管理頁。原生 App 使用 Android 系統檔案選擇器匯入 ICS／JSON。原生更新包固定使用 `com.ykcnet.lifetempo`，由本機環境變數提供 keystore 路徑與密碼，不得將密碼寫入版本庫。

### PWABuilder APK

GitHub Actions 會在推送 `master` 後執行 `node build-pages.mjs`，只發布 PWA 靜態白名單，再部署至 `https://ykcnet.github.io/LifeTempo-App/`。首次使用前，請在 GitHub repository 的 Settings → Pages 將 Build and deployment source 設為 GitHub Actions。部署成功後，可先檢查首頁、`manifest.webmanifest`、`sw.js` 與 manifest 中的 512 PNG 圖示，再將上述 HTTPS 網址輸入 [PWABuilder](https://www.pwabuilder.com/) 的 Package for Stores 流程。

GitHub Pages 僅提供本機儲存的 PWA 前端；Node／SQLite 預約服務、伺服器 AI API 與 Google OAuth 設定不會隨靜態站部署。若要使用完整服務，需另行將後端安全部署至 HTTPS 主機並設定同源 API。使用 TWA 全螢幕體驗時，還需依 PWABuilder 產出的簽章憑證部署 `/.well-known/assetlinks.json`；簽章變更後須同步更新。

### Android 主畫面 Widget

使用 Android Studio 開啟 `android/` 並執行 App。首次開啟後，長按手機主畫面空白處，選擇「小工具 → LifeTempo」，加入「月曆」、「今日行程」或「待辦事項」；加入後可拖曳邊緣調整寬、高。月曆標示當日及有行程日期，點擊月曆 Widget 會開啟 App 月視圖。Widget 快照僅在本機保存，Android Auto Backup 已關閉。

Windows APK 建置工具、JDK、Gradle、Android SDK 與 LifeTempo 簽署金鑰的集中管理流程見 `android-apk-kit/README.md`。首次準備會下載工具鏈並要求使用者確認 Android SDK 授權；簽署金鑰密碼由 Windows DPAPI 保護。

## 尚需服務端或原生 App 的部分

PRD 的以下能力不能只靠靜態單機 HTML 完成，目前不會假稱已提供：

- iOS/Android/Web/桌面跨裝置雲端同步、帳號登入、增量同步、衝突解決與 TLS API。
- Google、Outlook、iCloud、CalDAV 帳號授權及雙向同步。
- 多人跨裝置實際共享和伺服器端權限驗證；目前一鍵連結只能在持有相同本機邀請資料的瀏覽器中接受。共享資料尚未同步到受邀者裝置，邀請訊息需自行複製到 LINE、Messenger、微信或其他管道傳送。
- Email、關閉頁面後的背景推播、可靠的系統排程通知；瀏覽器通知需頁面開啟，並受瀏覽器通知權限限制。
- 將公開預約服務部署到可由網際網路連線的 HTTPS 主機；目前後端只在啟動它的主機執行，複製的網址僅在同一主機可用。
- 預約改期、取消通知與 Email 確認；目前已可自動匯入及由擁有者取消，未提供受邀者自行取消／改期流程。
- iOS WidgetKit 與原生安裝程式；Android 主畫面 Widget 已提供原生實作。
- 語音辨識和高準確度自然語言解析；仍可由表單建立行程。
- PDF/圖片的雲端上傳與保管；目前提供本機附件及資源／會議 URL。
- 2025–2027 年以外的官方假日與節氣資料擴充、其他國家假日，以及即時氣象測站觀測；現已提供官方年度日曆與 Open-Meteo 城市預報。
- 資料庫加密、帳號級備份、99.9% 服務可用性及啟動／同步延遲 SLA；本機資料尚未加密，亦未進行部署壓力測試。

## 安全與資料

所有資料預設留在目前瀏覽器，不會上傳。清除瀏覽器儲存資料可能移除行程，請定期匯出 JSON 備份。匯入的 iCalendar/JSON 僅在使用者選檔後載入；事件文字及連結會經 HTML escaping 顯示。上線前仍需建立後端授權與加密、同步衝突策略、通知服務、隱私政策、原生平台專案及效能/可用性監控。

## 圖示素材

- Windows：`LifeTempo-Icons/windows/LifeTempo.ico`
- macOS：`LifeTempo-Icons/mac/LifeTempo.icns` 與 `.iconset`
- iOS：`LifeTempo-Icons/ios/AppIcon.appiconset`
- Android：`LifeTempo-Icons/android/res` 與 `play-store-512.png`
- 向量來源：`LifeTempo-Icons/source`

平台圖示素材已存在，但尚未產生 Windows/macOS/iOS/Android 原生 App 或安裝包。

### Google 行事曆匯入設定

在 Google Cloud 專案啟用 Calendar API、設定 OAuth 同意畫面，建立「網頁應用程式」OAuth Client ID，並將實際使用的來源（例如 `http://localhost:4174`）加入「已授權的 JavaScript 來源」。啟動服務前設定環境變數 `LIFETEMPO_GOOGLE_CLIENT_ID`，再重新啟動服務。Client ID 是公開識別碼；此流程不使用 Client Secret。測試模式需將使用者加入 Google 測試使用者名單。

個人行事曆的「匯入其他行事曆」提供 Google 主要行事曆唯讀授權匯入，也可選取 ICS／JSON。Google 匯入預設期間為前後一年，可調整；與範圍相交的事件會保存完整系列及原始重複規則，範圍外的系列日期也會保留；多日事件只在畫面分日顯示，不拆成獨立事件。相同來源事件重匯會更新；此功能是單次匯入，不會同步來源刪除或後續異動。存取權杖不寫入儲存空間。

舊版完整六筆未修改範例會在載入時備份並移除；不完整的範例組合可用「清理舊版範例」檢視後清除。備份保存在目前瀏覽器 localStorage 的 `lifetempo.legacyExamplesBackup.<時間戳>`。

匯入入口現在使用四步驟引導：「選擇來源 → 連線或選檔 → 確認內容 → 完成」。預設 Google，可改選 Outlook、Apple、其他 ICS 或 LifeTempo JSON。資料讀取後先預覽新增／更新筆數及前 10 筆事件，按確認才儲存；完成後可直接查看個人行事曆。引導中的 JSON 僅匯入事件，不覆寫其他設定。Google 未啟用時顯示檔案匯入替代步驟。

### 完整跨日系列

ICS 以 UID 為單位保存一筆事件，含完整起訖日期、原始 RRULE、RDATE、EXDATE、時區及 RECURRENCE-ID 例外。使用本機隨附的 ical.js 2.2.1（MPL-2.0，授權位於 vendor/ical.LICENSE）。畫面依查詢範圍展開，全天結束日不包含當日；DTEND 維持實際經過時長，DURATION 保留名義日數，涵蓋夏令時間差異。

編輯可調整結束日期，系列可選擇修改全部或僅此一次，取消單次會保留系列。原始匯入重複規則在編輯畫面保留，不以簡化選單覆蓋。匯出再匯入會保留原始規則與例外；相同 UID 更新同一系列。重匯舊版拆分資料時移除對應的分日片段，匯入前資料備份於 localStorage 的 lifetempo.beforeImport。

尚未支援 RECURRENCE-ID 的 RANGE=THISANDFUTURE（一次調整該次以後全部事件），會明確拒絕；單系列展開超過 250,000 次也會回報限制，避免無限處理。Google 連線仍需 OAuth 設定。新增靜態資源需重新啟動本機服務後重新整理頁面。

相同名稱但不同日期或時間的事件會各自顯示；系列內各次行程以來源事件 ID 加上原始發生時間識別。編輯表單「套用範圍」預設為「只修改／刪除這一次」，選擇「整個重複系列」才會一併套用。提醒去重與預約忙碌時段也使用每次行程的識別碼，避免同一天不同時段相互覆蓋。

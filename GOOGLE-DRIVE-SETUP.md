# LifeTempo 桌面版 Google Drive 同步設定

本次僅實作桌面瀏覽器與安裝式 PWA。Android 原生版維持原狀，待桌面版定案後再實作。
桌面瀏覽器與安裝式 PWA 使用 Google Identity Services 網頁授權；Android 使用 Google Play services 原生授權 API。兩者共用相同 Drive App 專屬空間與同步版本格式。
已於 2026-10-18 在 lifetempo-512012 專案建立 LifeTempo Desktop Web 網頁用戶端，並將公開 ID 寫入 drive-config.js。Google Drive API 已啟用，已宣告 drive.appdata 範圍，專案擁有者已加入測試使用者。目前仍為測試模式，尚未完成真實帳號同步實測或對外發布。

## 一、開發者一次性設定

1. 開啟 https://console.cloud.google.com/ ，建立或選取專供 LifeTempo 使用的專案。
2. 在「API 和服務 → 程式庫」啟用 **Google Drive API**。
3. 在 Google Auth Platform 設定品牌名稱、支援 Email、聯絡 Email、應用程式首頁、隱私權政策，以及需要的網域驗證。
4. 設定目標對象。個人 Gmail 使用者通常選 External；測試階段在「測試使用者」加入要驗證的 Google 帳號。對外提供前完成正式發布及 Google 要求的驗證。
5. 在資料存取設定加入唯一的 Drive 權限：
   `https://www.googleapis.com/auth/drive.appdata`
   不申請讀寫整個雲端硬碟的權限。
6. 建立 **網頁應用程式** OAuth 用戶端 ID，設定「已授權 JavaScript 來源」：
   - `https://ykcnet.github.io`
   - `http://localhost:4174`（目前桌面開發網址）
   - 若另用 4173，額外加入 `http://localhost:4173`
   來源只含協定、主機、連接埠，不含 `/LifeTempo-App/` 路徑。
   此實作採 Google Identity Services token popup，不使用自建 callback，也不需在程式放 client secret。
7. 將網頁用戶端 ID 填入 `drive-config.js` 的 `webClientId`。
   此 ID 是公開設定，不是密碼；不要把 OAuth client secret、access token 或 refresh token 放進原始碼。
8. 本機重新整理頁面測試；GitHub Pages 需將變更正式發布後才會生效。
   8. 在同一 Google Cloud 專案新增 **Android** OAuth 用戶端，套件名稱填 `com.ykcnet.lifetempo`，SHA-1 指紋填 `3B:01:52:AB:C7:B6:16:AD:42:F8:2A:9F:40:17:C6:7E:4D:CE:D8:F1`。此值已由正式 release APK 簽章驗證；不要將 keystore 或密碼提交到版本庫。Android 不使用網頁用戶端 ID。
   9. 本機重新整理頁面測試；GitHub Pages 需將變更正式發布後才會生效。
   6. 關閉或重新載入 App／頁面後，需要使用者再次點擊連接。Android 由 Google Play services 顯示原生帳號與授權流程；桌面網頁使用 GIS token popup。程式不偷偷開啟登入視窗，也不將存取憑證寫入 localStorage。
   9. Android release APK 需安裝在有 Google Play services 的裝置；測試帳號須列在 OAuth 同意畫面的測試使用者。未配置開發者 OAuth 時，顯示「Google 同步服務準備中」且連線按鍵停用；這是維護者一次性工作，不要求一般使用者自行設定。
   安裝式桌面 PWA 使用相同網站，不需要另外安裝桌面套件。

一般使用者不需建立 Cloud 專案，只需使用自己的 Google 帳號授權。

## 二、使用流程

1. 開啟「行事曆設定 → 手機與電腦同步」。Google Drive 為主要入口；原伺服器同步保留在「進階：自架伺服器同步」。
2. 若伺服器同步正在使用，在進階選項先按「中斷伺服器同步」。這只暫停日曆同步，不清除 AI／預約服務的連線 token。
3. 畫面會預先準備 Google 授權服務，完成後才啟用「連接 Google Drive」。按一次、選擇帳號並同意授權，隨即同步，不需一般使用者輸入 OAuth ID 或任何金鑰。網路載入失敗可按「重試連線準備」。
4. 連線後立即同步。另一個桌面瀏覽器或另一台電腦選同一 Google 帳號即可交換資料。
5. 本機已有資料而雲端內容不同，第一次連線不會自動覆蓋；畫面要求明確選擇完整版本。
6. 已連線後主要按鍵自動切換為「立即同步」。授權仍有效時，返回 App、切回頁面或恢復網路會觸發同步。同一前景頁面內修改不會逐筆即時上傳，請按同步或下次返回 App 時同步。
7. 關閉或重新載入頁面後，基於 Google 網頁 token 模式限制，需要使用者再次點擊連接。程式不偷偷開啟登入視窗，也不將存取憑證寫入 localStorage。
8. 「中斷連線」停止此頁面的同步，不刪除雲端資料，也不撤銷 Google 授權。撤銷授權可到 Google 帳號的第三方連線管理頁操作。
9. 切換帳號、中斷連線、備份與還原按鍵集中在「帳號與備份管理」。未配置開發者 OAuth 時，顯示「Google 同步服務準備中」且連線按鍵停用；這是維護者一次性工作，不要求一般使用者自行設定。

## 三、資料與衝突

- 同步：行程、待辦、共享行事曆設定、分類、邀請管道、顯示時區與 12／24 小時格式。
- 不同步：AI API Key、owner token、OAuth token、主題、字體、天氣及本機通知權限。
- 使用 Google Drive 的 `appDataFolder` 隱藏空間；一般 Drive 檔案清單不顯示，不可拿來與其他帳號分享。這不是多人協作或 Google 日曆同步。
- 每次上傳新增完整快照，保留父版本識別碼與 SHA-256 摘要；不直接覆蓋同一檔案。
- 兩端同時修改會產生不同分支，下次比對時要求選擇完整版本，不會自動拼接衝突事件。
- 刪除會反映在新的完整快照中；離線舊版不會直接取代新版。版本相異時仍要人工確認。
- 採用雲端版本前，保留一份本機復原備份；未同步的本機版本在解決衝突時也會先寫成獨立雲端版本。
- 可在同區塊「匯出同步前備份」或「還原同步前備份」。本機復原備份保留最近一次；還原會先中斷 Drive 連線，讓使用者檢查後再同步。
- 雲端歷史版本不自動清除，會占用使用者 Drive 配額。本版上限為單一快照 5 MB、10,000 個版本；超限停止同步並提示，不刪除舊資料。
- 歷史版本完整性異常、下載摘要錯誤或資料格式不支援時，不匯入本機。
- 瀏覽器資料清除仍會移除尚未同步的本機修改；定期同步並另存 JSON 備份。

## 四、正式啟用前驗收

1. 未配置 OAuth 時有清楚提示；關閉登入視窗能重試。
2. 兩個獨立瀏覽器環境使用同一個測試帳號，驗證新增、修改、刪除及時區設定。
3. 一端離線修改，另一端也修改；恢復網路後應出現衝突選項。
4. 採用雲端版本後可匯出／還原本機備份。
5. 切換另一 Google 帳號，確認基準版本分開儲存，既有本機資料不被無提示替換。
6. 授權到期、網路失敗、取消授權、Drive API 未啟用時，確認本機修改仍保留。
7. 真實 Google OAuth 與 Drive API 尚需專案設定完成後驗證；目前自動測試使用模擬 Drive。

## 官方文件

- Google Identity Services token 模式：https://developers.google.com/identity/oauth2/web/guides/use-token-model
- OAuth 設定：https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid
- Drive App 專屬空間：https://developers.google.com/workspace/drive/api/guides/appdata
- 最小權限：https://developers.google.com/workspace/drive/api/guides/api-specific-auth

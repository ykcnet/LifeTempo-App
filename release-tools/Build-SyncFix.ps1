# Build-SyncFix.ps1 — 修正 LifeTempo Android App 的「手機與電腦同步」token 輸入
#
# 問題：App 用 `prompt()` 取得 owner token，但 Android WebView 預設不支援 prompt()
#       （MainActivity 沒有實作 onJsPrompt），所以按「連線」永遠拿不到 token。
#
# 這個腳本只改兩個 asset（不改 Java、不改 manifest）：
#   1. booking-client.js：token 改成從 `#calendarSyncToken` 輸入框讀取，
#      並把 token 同時存到 localStorage（App 重開後不用再輸入）。
#   2. enhancements.js：在同步設定面板的網址欄下方加一個 token 輸入框。
#
# 用法：
#   .\Build-SyncFix.ps1 -BaselineApk C:\path\to\base.apk
#
# 產出：android-apk-kit\output\LifeTempo-<版本>-syncfix.apk
# 簽章：使用 android-apk-kit 的 release keystore（與原廠相同，可直接覆蓋安裝）
#
# 注意：LifeTempo 之後更新時，要對新的 baseline 重跑一次這個腳本。

param([Parameter(Mandatory=$true)][string]$BaselineApk)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$kit = Join-Path $root 'android-apk-kit'
$out = Join-Path $kit 'output'
$stage = Join-Path $out 'syncfix'
New-Item -ItemType Directory -Force $stage | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

$env:JAVA_HOME = Join-Path $kit 'toolchain\jdk'
$buildTools = Join-Path $kit 'toolchain\android-sdk\build-tools\35.0.0'

# 1. 驗證 baseline 簽章（避免對錯的 APK 簽章）
$signature = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $BaselineApk
if ($LASTEXITCODE -ne 0 -or ($signature -join "`n") -notmatch '208672b8161fec806673848ec7136a2a39c2f95bb33a07528dc6faf8a37a5c25') {
    throw 'Baseline signature mismatch（不是預期的 LifeTempo release 簽章）'
}

# 2. 抽出要修改的 asset
$sourceZip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $BaselineApk))
try {
    foreach ($name in @('assets/booking-client.js', 'assets/enhancements.js')) {
        $entry = $sourceZip.GetEntry($name)
        if (-not $entry) { throw "APK 裡找不到 $name" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $stage (Split-Path $name -Leaf)), $true)
    }
} finally { $sourceZip.Dispose() }

# 3. 套用修改
$bcPath = Join-Path $stage 'booking-client.js'
$enPath = Join-Path $stage 'enhancements.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$bc = [IO.File]::ReadAllText($bcPath, [Text.Encoding]::UTF8)
$bc = $bc -replace 'const token=useFreshToken\?prompt\([^)]*\):calendarSyncToken\(\)\|\|prompt\([^)]*\);',
                   'const token=(document.querySelector("#calendarSyncToken")?.value||"").trim()||calendarSyncToken();'
$bc = $bc -replace 'const token=changed\?prompt\([^)]*\):calendarSyncToken\(\)\|\|prompt\([^)]*\);',
                   'const token=(document.querySelector("#calendarSyncToken")?.value||"").trim()||calendarSyncToken();'
$bc = $bc -replace 'function calendarSyncToken\(\)\{return sessionStorage\.getItem\(calendarSyncTokenKey\)\|\|sessionStorage\.getItem\(''lifetempo\.ownerToken''\)\|\|'''';\}',
                   'function calendarSyncToken(){return sessionStorage.getItem(calendarSyncTokenKey)||localStorage.getItem(calendarSyncTokenKey)||sessionStorage.getItem("lifetempo.ownerToken")||"";}'
$bc = $bc -replace 'sessionStorage\.setItem\(calendarSyncTokenKey,token\);',
                   'sessionStorage.setItem(calendarSyncTokenKey,token);localStorage.setItem(calendarSyncTokenKey,token);'
$bc = $bc -replace 'if\(!token\)return false;',
                   'if(!token){toast("請先在上方輸入 owner token");return false;}'
# 允許私有網段使用 HTTP（原本只允許 HTTPS，導致區網架構還得開通道）
$bc = $bc -replace "if\(native&&url\.protocol!=='https:'\)[^;]*;",
                   "if(native&&url.protocol!=='https:'&&!(url.protocol==='http:'&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)))throw Error('Android App 跨裝置同步必須使用 HTTPS 伺服器網址（區網 192.168.x 可用 HTTP）');"
# ngrok 免費層會對瀏覽器請求插入警告頁；這個標頭可以跳過（否則 API 會收到 HTML）
$bc = $bc -replace "headers:\{Authorization:", "headers:{'ngrok-skip-browser-warning':'1',Authorization:"
$bc = $bc -replace "headers: \{ Authorization:", "headers: { 'ngrok-skip-browser-warning': '1', Authorization:"
# 診斷：把連線錯誤留在狀態列（原本只有會消失的 toast）
$bc = $bc -replace "\}catch\(error\)\{toast\(error\.message\|\|'[^']*'\);return false;\}", "}catch(error){toast(error.message||'同步連線失敗');try{setCalendarSyncStatus('錯誤：'+(error&&error.message?error.message:'未知'));var __b=document.querySelector('#calendarSyncConnect');if(__b)__b.textContent='錯誤：'+(error&&error.message?error.message:'未知')}catch(e2){};return false;}"
# 端點改成優先用「畫面上的網址欄」，並在 localStorage 壞值時退回固定網址
$bc = $bc -replace "const origin=native\?localStorage\.getItem\(calendarSyncServerUrlKey\):location\.origin;",
                   "let origin=native?((((document.querySelector('#calendarSyncServerUrl')||{}).value||'').trim().replace(/\/$/,''))||localStorage.getItem(calendarSyncServerUrlKey)):location.origin;"
$bc = $bc -replace "const url=new URL\(origin\);",
                   "let url;try{url=new URL(origin);}catch(__e){url=new URL('https://bulldozer-gathering-spectator.ngrok-free.dev');origin=url.origin;}"
[IO.File]::WriteAllText($bcPath, $bc, $utf8)

$en = [IO.File]::ReadAllText($enPath, [Text.Encoding]::UTF8)
$tokenField = 'placeholder="https://calendar.example.com"><input id="calendarSyncToken" type="password" autocomplete="off" value="${esc(localStorage.getItem(''lifetempo.calendarSyncToken'')||'''')}" placeholder="貼上 owner token" style="width:100%;margin-top:8px;padding:9px 11px;border:1px solid var(--line,#ccc);border-radius:8px;font:12px inherit">'
$en = $en -replace 'placeholder="https://calendar\.example\.com">', $tokenField
# 預設帶入固定網址（不是秘密，寫死在 UI 預設值即可；換網域時重跑本腳本）
$en = $en -replace "localStorage\.getItem\('lifetempo\.calendarSyncServerUrl'\)\|\|''", "localStorage.getItem('lifetempo.calendarSyncServerUrl')||'https://bulldozer-gathering-spectator.ngrok-free.dev'"
# 若舊資料還存著已失效的 trycloudflare 網址，自動換成固定網址（尊重使用者手動改過的值）
$migrate = "try{var __u=localStorage.getItem('lifetempo.calendarSyncServerUrl');if(!__u||__u.indexOf('trycloudflare.com')>=0)localStorage.setItem('lifetempo.calendarSyncServerUrl','https://bulldozer-gathering-spectator.ngrok-free.dev')}catch(__e){}`n"
$en = $migrate + $en
[IO.File]::WriteAllText($enPath, $en, $utf8)

# 4. 重打包（全部 stored；.NET 的 NoCompression 會被寫成 deflate，所以用 Node 腳本）
$unsigned = Join-Path $stage 'unsigned.apk'
& node (Join-Path $PSScriptRoot 'repack.js') (Resolve-Path $BaselineApk) $unsigned $stage
if ($LASTEXITCODE -ne 0) { throw '重打包失敗' }

# 5. 對齊 + 簽章
$aligned = Join-Path $stage 'aligned.apk'
& (Join-Path $buildTools 'zipalign.exe') -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失敗' }

$secrets = Get-Content (Join-Path $kit 'private\lifetempo-release-secrets.json') -Raw | ConvertFrom-Json
$storePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $secrets.storePassword))
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $secrets.keyPassword))
$outputApk = Join-Path $out 'LifeTempo-syncfix.apk'
try {
    $env:LIFETEMPO_HOTFIX_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storePtr)
    $env:LIFETEMPO_HOTFIX_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
    & (Join-Path $buildTools 'apksigner.bat') sign --ks (Join-Path $kit 'private\keys\lifetempo-release.keystore') --ks-key-alias $secrets.keyAlias --ks-pass env:LIFETEMPO_HOTFIX_STORE_PASSWORD --key-pass env:LIFETEMPO_HOTFIX_KEY_PASSWORD --out $outputApk $aligned
    if ($LASTEXITCODE -ne 0) { throw '簽章失敗' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storePtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
    Remove-Item Env:\LIFETEMPO_HOTFIX_STORE_PASSWORD,Env:\LIFETEMPO_HOTFIX_KEY_PASSWORD -ErrorAction SilentlyContinue
}

# 6. 驗證
$verify = & (Join-Path $buildTools 'apksigner.bat') verify --verbose --print-certs $outputApk
if ($LASTEXITCODE -ne 0) { throw '簽章驗證失敗' }
$verify | Select-Object -First 4
& (Join-Path $buildTools 'zipalign.exe') -c 4 $outputApk
if ($LASTEXITCODE -ne 0) { throw '對齊驗證失敗' }

Write-Output "APK ready: $outputApk"

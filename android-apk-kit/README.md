# Android APK Kit

這個資料夾集中保存 Windows Android APK 建置流程、工具鏈與 LifeTempo 簽署金鑰。第一次執行會優先重用 VS Code Java 擴充套件附帶的 JDK，否則下載 JDK 17；另外下載 Gradle 8.9、Android command-line tools、Android 35 platform 與 build-tools。工具和 Gradle 依賴會留在本資料夾，之後不必重新搜尋或下載。

## 首次準備

在 PowerShell 執行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\android-apk-kit\Install-Toolchain.ps1
.\android-apk-kit\Import-LifeTempoKey.ps1
```

Android SDK 管理器首次安裝時會顯示 Google SDK 授權，請在終端機閱讀並自行接受。金鑰匯入會從 `Downloads\LifeTempo-App` 的 2026-10-13 新版與舊版發行資料夾讀取檔案，驗證各自憑證指紋與 `assetlinks.json` 一致後，才複製到本工具包。若原始發行資料夾已移動，使用 `-CurrentPackage` 與 `-ArchivePackage` 指定新的路徑。

## 建置 APK

```powershell
.\android-apk-kit\Build-Apk.ps1
.\android-apk-kit\Build-Apk.ps1 -Variant release
```

APK 會輸出到 `android-apk-kit\output`。Release 使用新版 LifeTempo keystore；密碼以 Windows DPAPI 加密，僅目前 Windows 使用者可解密。舊版 keystore 只封存，不會拿來簽新版本。請另外離線備份 `private\keys`；DPAPI 密碼檔不能直接搬到另一台電腦，遷移時需重新匯入原始簽署資料。

工具包中的 `toolchain`、`cache`、`private`、`output` 已加入 `.gitignore`。不要移除忽略設定或把 keystore、密碼、APK 上傳到公開版本庫。Android SDK、JDK、Gradle 及其授權仍依各自官方條款使用。

## 用於其他 Android 專案

指定新專案的 `android/` 目錄即可共用工具鏈與快取：

```powershell
.\android-apk-kit\Build-Apk.ps1 -ProjectPath 'D:\Apps\NewApp\android' -Variant debug
```

其他 App 的 release 必須在該專案自行設定簽署金鑰；LifeTempo release key 專供 `com.ykcnet.lifetempo` 更新簽署，不可拿來簽其他 App。
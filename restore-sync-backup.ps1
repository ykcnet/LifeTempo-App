param(
    [string]$BaseUrl = "http://127.0.0.1:4173",
    [string]$Token = "",
    [string]$File = ""
)

$root = "C:\Users\surface\LifeTempo-App"
$dir = Join-Path $root "data\calendar-sync-backups"

if (-not $Token) {
    $tokenPath = Join-Path $root "data\owner-token"
    if (Test-Path $tokenPath) { $Token = (Get-Content $tokenPath -Raw).Trim() }
}
if (-not $Token) { Write-Host "找不到 owner token"; exit 1 }

$files = @(Get-ChildItem $dir -Filter "state-*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
if ($files.Count -eq 0) { Write-Host "沒有備份檔（$dir）"; exit 1 }

if (-not $File) {
    Write-Host "可用的備份（新到舊）："
    for ($i = 0; $i -lt $files.Count; $i++) {
        Write-Host ("{0,2}. {1}  {2:N1} KB" -f ($i + 1), $files[$i].Name, ($files[$i].Length / 1KB))
    }
    $pick = Read-Host "輸入編號（直接 Enter 取消）"
    if (-not $pick) { exit 0 }
    $idx = [int]$pick - 1
    if ($idx -lt 0 -or $idx -ge $files.Count) { Write-Host "編號無效"; exit 1 }
    $File = $files[$idx].FullName
}

if (-not (Test-Path $File)) { Write-Host "找不到檔案：$File"; exit 1 }

$state = Get-Content $File -Raw -Encoding UTF8 | ConvertFrom-Json
$cur = Invoke-RestMethod -Uri "$BaseUrl/api/owner/calendar-sync" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 10

Write-Host ""
Write-Host "備份檔：$(Split-Path $File -Leaf)"
Write-Host "目前伺服器 revision：$($cur.revision)"
$ok = Read-Host "確定要還原？（y/N）"
if ($ok -notmatch '^[yY]') { Write-Host "已取消"; exit 0 }

$body = @{ revision = $cur.revision; state = $state } | ConvertTo-Json -Depth 30 -Compress
$resp = Invoke-WebRequest -Uri "$BaseUrl/api/owner/calendar-sync" -Method Put `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20 -UseBasicParsing

Write-Host "還原完成（HTTP $($resp.StatusCode)）"
Write-Host "請到桌面版／手機版按一次「同步」載入。"
# 允許 LifeTempo 服務器通過 Windows 防火牆
# 需要以管理員權限運行

Write-Host "正在配置 Windows 防火牆..." -ForegroundColor Yellow

# 檢查是否已有規則
$existingRule = Get-NetFirewallRule -DisplayName "LifeTempo Server" -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "防火牆規則已存在，正在更新..." -ForegroundColor Green
    Remove-NetFirewallRule -DisplayName "LifeTempo Server" -ErrorAction SilentlyContinue
}

# 添加入站規則允許端口 4173
New-NetFirewallRule -DisplayName "LifeTempo Server" `
    -Direction Inbound `
    -LocalPort 4173 `
    -Protocol TCP `
    -Action Allow `
    -Profile Any `
    -Description "允許 LifeTempo 應用程式接受外部網絡連接"

Write-Host "✓ 防火牆規則已成功添加！" -ForegroundColor Green
Write-Host "現在可以從手機訪問 http://192.168.1.105:4173" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果仍然無法訪問，請檢查：" -ForegroundColor Yellow
Write-Host "1. 手機和電腦是否在同一個 WiFi 網絡" -ForegroundColor White
Write-Host "2. 電腦的防火牆軟體（如殺毒軟體）是否額外阻止" -ForegroundColor White
Write-Host "3. IP 地址是否正確（當前 IP: 192.168.1.105）" -ForegroundColor White

param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$baseUrl = 'http://127.0.0.1:4174'
$browserUrl = 'http://localhost:4174'
function Test-LifeTempo {
    try {
        $request = [System.Net.HttpWebRequest]::Create("$baseUrl/api/health")
        $request.Proxy = $null
        $request.Timeout = 2000
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try { $health = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
            return ($health.ok -eq $true)
        } finally { $response.Dispose() }
    } catch { return $false }
}
try {
    Set-Location -LiteralPath $PSScriptRoot
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'server.mjs'))) {
        throw 'server.mjs is missing. Run this launcher inside the complete LifeTempo-App folder.'
    }
    if (-not (Test-LifeTempo)) {
        $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
        $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
        if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js was not found. Install Node.js 24 or later, then try again.' }
        $nodeVersion = & $nodePath --version
        if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) {
            throw "Node.js 24 or later is required. Current version: $nodeVersion"
        }
        $env:PORT = '4174'
        $env:HOST = '127.0.0.1'
        $logDir = Join-Path $PSScriptRoot 'data'
        New-Item -ItemType Directory -Force -Path $logDir | Out-Null
        $runId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $errorLog = Join-Path $logDir "startup-$runId-error.log"
        $child = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "startup-$runId.log") -RedirectStandardError $errorLog
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            if (Test-LifeTempo) { break }
            $child.Refresh()
            if ($child.HasExited) {
                $details = Get-Content -LiteralPath $errorLog -Raw -ErrorAction SilentlyContinue
                if ($details -match 'EADDRINUSE') { throw 'Port 4174 is occupied but LifeTempo is not responding. Close the older LifeTempo server and retry.' }
                throw "LifeTempo stopped during startup. Details: $errorLog"
            }
            Start-Sleep -Milliseconds 300
        }
        if (-not (Test-LifeTempo)) { throw "LifeTempo did not respond. Details: $errorLog" }
    }
    Write-Host "LifeTempo is ready: $browserUrl"
    if (-not $NoBrowser) {
        try { Start-Process $browserUrl } catch { Write-Host "Open this address in your browser: $browserUrl" }
    }
    exit 0
} catch {
    Write-Host ''
    Write-Host 'LifeTempo startup failed:' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# LifeTempo auto-start watchdog (portable)
#
# Runs hidden at logon (see autostart.vbs). Every N seconds:
#   - TCP port (default 4173) not listening -> start server.mjs
#   - ngrok process missing                 -> start ngrok with the fixed URL
#
# Paths are resolved from this script's folder, so the repo can be moved.
# Override the tunnel URL with env var LIFETEMPO_NGROK_URL or a file
# "ngrok-url.txt" next to this script.
#
# Log: <this folder>\autostart.log

param(
    [string]$AppDir = $PSScriptRoot,
    [int]$Port = 4173,
    [int]$IntervalSec = 60
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $AppDir) { $AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$log = Join-Path $AppDir "autostart.log"

function Write-Log([string]$message) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message" | Add-Content -Path $log
}

function Resolve-Node {
    $candidates = @(
        "C:\dev\tools\node\node.exe",
        (Get-Command node -ErrorAction SilentlyContinue).Source
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

function Resolve-Ngrok {
    $candidates = @(
        (Get-Command ngrok -ErrorAction SilentlyContinue).Source,
        (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\ngrok.exe"),
        "C:\dev\tools\ngrok\ngrok.exe"
    )
    foreach ($c in $candidates) {
        if ($c -and (Test-Path $c)) { return $c }
    }
    return $null
}

function Resolve-NgrokUrl {
    if ($env:LIFETEMPO_NGROK_URL) { return $env:LIFETEMPO_NGROK_URL }
    $file = Join-Path $AppDir "ngrok-url.txt"
    if (Test-Path $file) {
        $u = (Get-Content $file -First 1).Trim()
        if ($u) { return $u }
    }
    return "https://bulldozer-gathering-spectator.ngrok-free.dev"
}

$serverJs = Join-Path $AppDir "server.mjs"
if (-not (Test-Path $serverJs)) {
    Write-Log "server.mjs not found in $AppDir - exit"
    exit 1
}

$node = Resolve-Node
if (-not $node) {
    Write-Log "node.exe not found - exit"
    exit 1
}

$ngrok = Resolve-Ngrok
$ngrokUrl = Resolve-NgrokUrl

# single instance
$mutex = New-Object System.Threading.Mutex($false, "Local\LifeTempoAutoStart")
if (-not $mutex.WaitOne(0)) { exit }

Write-Log "watchdog started (dir=$AppDir port=$Port node=$node)"

while ($true) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $portUp = $false
        try {
            $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
            $portUp = $iar.AsyncWaitHandle.WaitOne(1000) -and $client.Connected
        } catch { $portUp = $false }
        finally { $client.Close() }

        if (-not $portUp) {
            Write-Log "port $Port down -> starting server.mjs"
            Start-Process -FilePath $node -ArgumentList "server.mjs" `
                -WorkingDirectory $AppDir -WindowStyle Hidden `
                -RedirectStandardOutput (Join-Path $AppDir "server.out.log") `
                -RedirectStandardError  (Join-Path $AppDir "server.err.log")
            Start-Sleep -Seconds 3
        }

        $ngrokProc = Get-Process ngrok -ErrorAction SilentlyContinue
        if (-not $ngrokProc) {
            if ($ngrok) {
                Write-Log "ngrok missing -> starting $ngrokUrl"
                Start-Process -FilePath $ngrok `
                    -ArgumentList "http", "--url=$ngrokUrl", "$Port" `
                    -WindowStyle Hidden `
                    -RedirectStandardOutput (Join-Path $AppDir "ngrok.out.log") `
                    -RedirectStandardError  (Join-Path $AppDir "ngrok.err.log")
                Start-Sleep -Seconds 5
            } else {
                Write-Log "ngrok not found - skip tunnel"
            }
        }
    } catch {
        Write-Log ("check failed: " + $_.Exception.Message)
    }

    Start-Sleep -Seconds $IntervalSec
}

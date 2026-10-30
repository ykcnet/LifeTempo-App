param([Parameter(Mandatory=$true)][string]$BaselineApk)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$kit = Join-Path $root 'android-apk-kit'
$out = Join-Path $kit 'output'
$stage = Join-Path $out 'voice-1.1.16'
New-Item -ItemType Directory -Force $stage | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$env:JAVA_HOME = Join-Path $kit 'toolchain\jdk'
$buildTools = Join-Path $kit 'toolchain\android-sdk\build-tools\35.0.0'
$signature = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $BaselineApk
if ($LASTEXITCODE -ne 0 -or ($signature -join "`n") -notmatch '208672b8161fec806673848ec7136a2a39c2f95bb33a07528dc6faf8a37a5c25') { throw 'Baseline signature mismatch' }
$sourceZip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $BaselineApk))
try {
    foreach ($pair in @(@('AndroidManifest.xml','manifest.bin'), @('assets/index.html','index.html'))) {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($sourceZip.GetEntry($pair[0]), (Join-Path $stage $pair[1]), $true)
    }
    & node (Join-Path $PSScriptRoot 'patch-release.mjs') (Join-Path $stage 'manifest.bin') (Join-Path $stage 'index.html') (Join-Path $root 'index.html')
    if ($LASTEXITCODE -ne 0) { throw 'Patch failed' }
    $env:LIFETEMPO_TEST_HTML = Join-Path $stage 'index.html'
    try { & node --test (Join-Path $root 'speech-input.test.mjs') (Join-Path $root 'speech-session.test.mjs') (Join-Path $root 'natural-title.test.mjs'); if ($LASTEXITCODE -ne 0) { throw 'Packaged input tests failed' } }
    finally { Remove-Item Env:\LIFETEMPO_TEST_HTML -ErrorAction SilentlyContinue }
    $unsigned = Join-Path $stage 'unsigned.apk'
    $stream = [IO.File]::Open($unsigned, [IO.FileMode]::Create)
    $destZip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in $sourceZip.Entries) {
            if ($entry.FullName -match '^META-INF/(MANIFEST.MF|[^/]+\.(SF|RSA|DSA|EC))$') { continue }
            $dest = $destZip.CreateEntry($entry.FullName, [IO.Compression.CompressionLevel]::NoCompression)
            $writer = $dest.Open()
            $inputStream = if ($entry.FullName -eq 'AndroidManifest.xml') { [IO.File]::OpenRead((Join-Path $stage 'manifest.bin')) }
                elseif ($entry.FullName -eq 'assets/index.html') { [IO.File]::OpenRead((Join-Path $stage 'index.html')) }
                else { $entry.Open() }
            try { $inputStream.CopyTo($writer) } finally { $inputStream.Dispose(); $writer.Dispose() }
        }
    } finally { $destZip.Dispose(); $stream.Dispose() }
} finally { $sourceZip.Dispose() }
$aligned = Join-Path $stage 'aligned.apk'
& (Join-Path $buildTools 'zipalign.exe') -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'Alignment failed' }
$secrets = Get-Content (Join-Path $kit 'private\lifetempo-release-secrets.json') -Raw | ConvertFrom-Json
$storePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $secrets.storePassword))
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR((ConvertTo-SecureString $secrets.keyPassword))
$outputApk = Join-Path $out 'LifeTempo-1.1.16-release.apk'
try {
    $env:LIFETEMPO_HOTFIX_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storePtr)
    $env:LIFETEMPO_HOTFIX_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
    & (Join-Path $buildTools 'apksigner.bat') sign --ks (Join-Path $kit 'private\keys\lifetempo-release.keystore') --ks-key-alias $secrets.keyAlias --ks-pass env:LIFETEMPO_HOTFIX_STORE_PASSWORD --key-pass env:LIFETEMPO_HOTFIX_KEY_PASSWORD --out $outputApk $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storePtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
    Remove-Item Env:\LIFETEMPO_HOTFIX_STORE_PASSWORD,Env:\LIFETEMPO_HOTFIX_KEY_PASSWORD -ErrorAction SilentlyContinue
}
& (Join-Path $buildTools 'apksigner.bat') verify --verbose --print-certs $outputApk
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed' }
& (Join-Path $buildTools 'zipalign.exe') -c 4 $outputApk
if ($LASTEXITCODE -ne 0) { throw 'Final alignment verification failed' }
Write-Output "APK ready: $outputApk"

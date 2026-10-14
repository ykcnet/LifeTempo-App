param(
    [ValidateSet('debug', 'release')]
    [string]$Variant = 'debug',
    [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$kitRoot = $PSScriptRoot
$defaultProjectPath = Join-Path $kitRoot '..\android'
if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = $defaultProjectPath
}
$androidRoot = (Resolve-Path $ProjectPath).Path
$lifeTempoAndroidRoot = (Resolve-Path $defaultProjectPath).Path
$isLifeTempoProject = [StringComparer]::OrdinalIgnoreCase.Equals($androidRoot.TrimEnd('\'), $lifeTempoAndroidRoot.TrimEnd('\'))
$toolchainRoot = Join-Path $kitRoot 'toolchain'
$jdkRoot = Join-Path $toolchainRoot 'jdk'
$sdkRoot = Join-Path $toolchainRoot 'android-sdk'
$gradle = Join-Path $toolchainRoot 'gradle-8.9\bin\gradle.bat'

foreach ($requiredPath in @((Join-Path $jdkRoot 'bin\java.exe'), (Join-Path $sdkRoot 'platforms\android-35\android.jar'), $gradle)) {
    if (-not (Test-Path $requiredPath)) {
        throw "Toolchain component not found: $requiredPath. Run Install-Toolchain.ps1 first."
    }
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:GRADLE_USER_HOME = Join-Path $kitRoot 'cache\gradle'
$env:Path = "$(Join-Path $jdkRoot 'bin');$(Join-Path $sdkRoot 'platform-tools');$env:Path"

if ($Variant -eq 'release' -and $isLifeTempoProject) {
    $keystore = Join-Path $kitRoot 'private\keys\lifetempo-release.keystore'
    $secretsPath = Join-Path $kitRoot 'private\lifetempo-release-secrets.json'
    foreach ($requiredPath in @($keystore, $secretsPath)) {
        if (-not (Test-Path $requiredPath)) {
            throw 'LifeTempo release key is not set up. Run Import-LifeTempoKey.ps1 first.'
        }
    }

    $secrets = Get-Content $secretsPath -Raw | ConvertFrom-Json
    $env:LIFETEMPO_SIGNING_KEYSTORE = $keystore
    $env:LIFETEMPO_SIGNING_KEY_ALIAS = $secrets.keyAlias
    $storeSecure = ConvertTo-SecureString $secrets.storePassword
    $keySecure = ConvertTo-SecureString $secrets.keyPassword
    $storePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storeSecure)
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecure)
    try {
        $env:LIFETEMPO_SIGNING_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storePointer)
        $env:LIFETEMPO_SIGNING_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
        & $gradle '-p' $androidRoot 'assembleRelease'
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storePointer)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
        Remove-Item Env:\LIFETEMPO_SIGNING_KEYSTORE, Env:\LIFETEMPO_SIGNING_KEY_ALIAS, Env:\LIFETEMPO_SIGNING_STORE_PASSWORD, Env:\LIFETEMPO_SIGNING_KEY_PASSWORD -ErrorAction SilentlyContinue
    }
}
else {
    $gradleTask = "assemble$($Variant.Substring(0, 1).ToUpperInvariant())$($Variant.Substring(1))"
    & $gradle '-p' $androidRoot $gradleTask
}

if ($LASTEXITCODE -ne 0) {
    throw "Gradle $Variant build failed with exit code $LASTEXITCODE."
}

$apkPath = Join-Path $androidRoot "app\build\outputs\apk\$Variant\app-$Variant.apk"
if (-not (Test-Path $apkPath)) {
    throw "Build completed but APK was not found: $apkPath"
}

if ($Variant -eq 'release') {
    $apksigner = Join-Path $sdkRoot 'build-tools\35.0.0\apksigner.bat'
    $signatureOutput = & $apksigner verify --print-certs $apkPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "APK signature verification failed: $signatureOutput"
    }

    if ($isLifeTempoProject) {
        $expectedFingerprint = (Get-Content (Join-Path $kitRoot 'private\lifetempo-release-secrets.json') -Raw | ConvertFrom-Json).certificateSha256
        $signatureMatch = [regex]::Match($signatureOutput, '(?im)Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)')
        if (-not $signatureMatch.Success -or $signatureMatch.Groups[1].Value -ne $expectedFingerprint) {
            throw 'Built APK does not match the current LifeTempo release signing key.'
        }
        Write-Host "Verified release signature: $expectedFingerprint"
    }
}

$outputRoot = Join-Path $kitRoot 'output'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$projectName = if ($isLifeTempoProject) { 'LifeTempo' } else { Split-Path (Split-Path $androidRoot -Parent) -Leaf }
$outputPath = Join-Path $outputRoot "$projectName-$Variant.apk"
Copy-Item $apkPath $outputPath -Force
Write-Host "APK ready: $outputPath"
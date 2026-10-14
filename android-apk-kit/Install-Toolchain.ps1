param()

$ErrorActionPreference = 'Stop'
$kitRoot = $PSScriptRoot
$toolchainRoot = Join-Path $kitRoot 'toolchain'
$sdkRoot = Join-Path $toolchainRoot 'android-sdk'
$jdkRoot = Join-Path $toolchainRoot 'jdk'
$gradleRoot = Join-Path $toolchainRoot 'gradle-8.9'
$downloadRoot = Join-Path $kitRoot 'cache\downloads'

New-Item -ItemType Directory -Force -Path $toolchainRoot, $downloadRoot | Out-Null

function Get-ToolArchive {
    param(
        [string]$Url,
        [string]$Destination,
        [long]$MinimumBytes,
        [string]$Sha256
    )

    if ((Test-Path $Destination) -and (Get-Item $Destination).Length -ge $MinimumBytes) {
        if (-not $Sha256 -or (Get-FileHash $Destination -Algorithm SHA256).Hash -eq $Sha256) {
            return
        }
    }

    Remove-Item $Destination, "$Destination.part" -Force -ErrorAction SilentlyContinue
    $curl = Get-Command curl.exe -ErrorAction Stop
    & $curl.Source '--fail' '--location' '--retry' '3' '--retry-delay' '2' '--output' "$Destination.part" $Url
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$Destination.part") -or (Get-Item "$Destination.part").Length -lt $MinimumBytes) {
        Remove-Item "$Destination.part" -Force -ErrorAction SilentlyContinue
        throw "Download failed or was incomplete: $Url"
    }
    if ($Sha256 -and (Get-FileHash "$Destination.part" -Algorithm SHA256).Hash -ne $Sha256) {
        Remove-Item "$Destination.part" -Force -ErrorAction SilentlyContinue
        throw "SHA-256 verification failed: $Url"
    }
    Move-Item "$Destination.part" $Destination -Force
}

function Install-ZipTool {
    param(
        [string]$Url,
        [string]$ArchivePath,
        [string]$Destination,
        [string]$ExtractPattern,
        [string]$Sha256
    )

    if (Test-Path $Destination) {
        return
    }

    if (-not (Test-Path $ArchivePath) -or (Get-Item $ArchivePath).Length -lt 50000000) {
        Write-Host "Downloading $([IO.Path]::GetFileName($ArchivePath))"
    }
    Get-ToolArchive -Url $Url -Destination $ArchivePath -MinimumBytes 50000000 -Sha256 $Sha256

    $extractRoot = Join-Path $downloadRoot ([IO.Path]::GetFileNameWithoutExtension($ArchivePath))
    if (Test-Path $extractRoot) {
        Remove-Item $extractRoot -Recurse -Force
    }
    Expand-Archive -Path $ArchivePath -DestinationPath $extractRoot -Force
    $source = Get-ChildItem $extractRoot -Directory -Recurse | Where-Object { $_.Name -like $ExtractPattern } | Select-Object -First 1
    if (-not $source) {
        throw "Could not find extracted folder '$ExtractPattern' in $ArchivePath"
    }
    Move-Item $source.FullName $Destination
}

if (-not (Test-Path $jdkRoot)) {
    $extensionRoot = Join-Path $env:USERPROFILE '.vscode\extensions'
    $bundledJdk = Get-ChildItem $extensionRoot -Directory -Filter 'redhat.java-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ChildItem (Join-Path $_.FullName 'jre') -Directory -ErrorAction SilentlyContinue } |
        Where-Object {
            (Test-Path (Join-Path $_.FullName 'bin\java.exe')) -and
            (Test-Path (Join-Path $_.FullName 'bin\javac.exe')) -and
            (Test-Path (Join-Path $_.FullName 'bin\keytool.exe'))
        } |
        Select-Object -First 1

    if ($bundledJdk) {
        Copy-Item $bundledJdk.FullName $jdkRoot -Recurse
        Write-Host "Reused local JDK from $($bundledJdk.FullName)"
    }
    else {
        $jdkUrl = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'
        Install-ZipTool -Url $jdkUrl -ArchivePath (Join-Path $downloadRoot 'temurin-jdk17.zip') -Destination $jdkRoot -ExtractPattern 'jdk-17*'
    }
}

$gradleUrl = 'https://mirrors.cloud.tencent.com/gradle/gradle-8.9-bin.zip'
$gradleSha256 = 'D725D707BFABD4DFDC958C624003B3C80ACCC03F7037B5122C4B1D0EF15CECAB'
Install-ZipTool -Url $gradleUrl -ArchivePath (Join-Path $downloadRoot 'gradle-8.9-bin.zip') -Destination $gradleRoot -ExtractPattern 'gradle-8.9' -Sha256 $gradleSha256

$commandLineTools = Join-Path $sdkRoot 'cmdline-tools\latest'
if (-not (Test-Path $commandLineTools)) {
    $commandLineArchive = Join-Path $downloadRoot 'android-commandlinetools.zip'
    if (-not (Test-Path $commandLineArchive)) {
        Write-Host 'Downloading Android command-line tools'
        Get-ToolArchive -Url 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -Destination $commandLineArchive -MinimumBytes 50000000
    }
    $extractRoot = Join-Path $downloadRoot 'android-commandlinetools'
    if (Test-Path $extractRoot) {
        Remove-Item $extractRoot -Recurse -Force
    }
    Expand-Archive -Path $commandLineArchive -DestinationPath $extractRoot -Force
    New-Item -ItemType Directory -Force -Path (Split-Path $commandLineTools) | Out-Null
    Move-Item (Join-Path $extractRoot 'cmdline-tools') $commandLineTools
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$(Join-Path $jdkRoot 'bin');$(Join-Path $commandLineTools 'bin');$env:Path"
$sdkManager = Join-Path $commandLineTools 'bin\sdkmanager.bat'

Write-Host 'Review and accept Android SDK licenses when prompted.'
& $sdkManager "--sdk_root=$sdkRoot" '--licenses'
if ($LASTEXITCODE -ne 0) {
    throw 'Android SDK license setup did not complete.'
}

& $sdkManager "--sdk_root=$sdkRoot" 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
if ($LASTEXITCODE -ne 0) {
    throw 'Android SDK package installation failed.'
}

Write-Host "Toolchain ready in $toolchainRoot"
& (Join-Path $jdkRoot 'bin\java.exe') -version
& (Join-Path $gradleRoot 'bin\gradle.bat') --version
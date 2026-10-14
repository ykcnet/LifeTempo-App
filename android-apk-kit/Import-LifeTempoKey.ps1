param(
    [string]$CurrentPackage = (Join-Path $env:USERPROFILE 'Downloads\LifeTempo-App\LifeTempo-com.ykcnet.lifetempo-20261013-package'),
    [string]$ArchivePackage = (Join-Path $env:USERPROFILE 'Downloads\LifeTempo-App\LifeTempo-com.ykcnet.lifetempo-package')
)

$ErrorActionPreference = 'Stop'
$kitRoot = $PSScriptRoot
$jdkKeytool = Join-Path $kitRoot 'toolchain\jdk\bin\keytool.exe'
if (-not (Test-Path $jdkKeytool)) {
    throw 'Run Install-Toolchain.ps1 first so keytool is available.'
}

$privateRoot = Join-Path $kitRoot 'private'
$keyRoot = Join-Path $privateRoot 'keys'
New-Item -ItemType Directory -Force -Path $keyRoot | Out-Null

function Import-VerifiedPackageKey {
    param(
        [string]$PackagePath,
        [string]$KeyName,
        [string]$SecretName
    )

    $infoPath = Join-Path $PackagePath 'signing-key-info.txt'
    $sourceKey = Join-Path $PackagePath 'signing.keystore'
    $assetLinksPath = Join-Path $PackagePath 'assetlinks.json'
    foreach ($requiredPath in @($infoPath, $sourceKey, $assetLinksPath)) {
        if (-not (Test-Path $requiredPath)) {
            throw "Required signing file not found: $requiredPath"
        }
    }

    $info = Get-Content $infoPath -Raw
    $storePassword = [regex]::Match($info, '(?m)^Key store password:\s*(.+)$').Groups[1].Value.Trim()
    $keyPassword = [regex]::Match($info, '(?m)^Key password:\s*(.+)$').Groups[1].Value.Trim()
    $keyAlias = [regex]::Match($info, '(?m)^Key alias:\s*(.+)$').Groups[1].Value.Trim()
    if (-not $storePassword -or -not $keyPassword -or -not $keyAlias) {
        throw "Signing information is incomplete: $infoPath"
    }

    $env:LIFETEMPO_KEY_IMPORT_PASSWORD = $storePassword
    try {
        $certificatePem = & $jdkKeytool -exportcert -rfc -alias $keyAlias -keystore $sourceKey '-storepass:env' 'LIFETEMPO_KEY_IMPORT_PASSWORD' 2>$null | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Could not read signing certificate from $sourceKey"
        }
    }
    finally {
        Remove-Item Env:\LIFETEMPO_KEY_IMPORT_PASSWORD -ErrorAction SilentlyContinue
    }

    $pemMatch = [regex]::Match($certificatePem, '(?s)-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----')
    if (-not $pemMatch.Success) {
        throw "Could not decode the signing certificate from $sourceKey"
    }
    $certificateBytes = [Convert]::FromBase64String(($pemMatch.Groups[1].Value -replace '\s', ''))
    $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificateBytes)
    $actualFingerprint = [BitConverter]::ToString($certificate.GetCertHash([System.Security.Cryptography.HashAlgorithmName]::SHA256)).Replace('-', '')
    $assetLinks = Get-Content $assetLinksPath -Raw | ConvertFrom-Json
    $expectedFingerprints = @($assetLinks.target.sha256_cert_fingerprints | ForEach-Object { $_ -replace ':', '' })
    if ($actualFingerprint -notin $expectedFingerprints) {
        throw "Certificate fingerprint does not match $assetLinksPath; key was not imported."
    }

    $secretFile = Join-Path $privateRoot $SecretName
    $secrets = [ordered]@{
        keyAlias = $keyAlias
        storePassword = ConvertFrom-SecureString (ConvertTo-SecureString $storePassword -AsPlainText -Force)
        keyPassword = ConvertFrom-SecureString (ConvertTo-SecureString $keyPassword -AsPlainText -Force)
        certificateSha256 = $actualFingerprint
    }
    $secrets | ConvertTo-Json | Set-Content -Path $secretFile -Encoding ASCII
    Copy-Item $sourceKey (Join-Path $keyRoot $KeyName) -Force
    Write-Host "Imported $KeyName after certificate fingerprint verification ($actualFingerprint)."
}

Import-VerifiedPackageKey -PackagePath $CurrentPackage -KeyName 'lifetempo-release.keystore' -SecretName 'lifetempo-release-secrets.json'
Import-VerifiedPackageKey -PackagePath $ArchivePackage -KeyName 'lifetempo-archive.keystore' -SecretName 'lifetempo-archive-secrets.json'
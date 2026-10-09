param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$VersionCode
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseDirectory = Join-Path $root 'Play-Release'
$sdk = Join-Path $releaseDirectory 'android-sdk'
$key = Join-Path $root '.local-signing/pob-upload.jks'
$password = Join-Path $root '.local-signing/upload-password.txt'
$bundle = Join-Path $releaseDirectory "Path-of-Boredom-Internal-Test-v$VersionCode-API36.aab"

foreach ($required in @($key, $password, (Join-Path $releaseDirectory 'API36-AndroidManifest.xml'), (Join-Path $sdk 'platforms/android-36/android.jar'))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required release input is missing: $required"
    }
}
if (Test-Path -LiteralPath $bundle) { throw "Bundle already exists; choose a new version code: $bundle" }
foreach ($tool in @('dotnet', 'jarsigner')) { Get-Command $tool -ErrorAction Stop | Out-Null }

Push-Location $root
try {
    # A regular clean left stale per-RID resource designers that crashed MAUI navigation.
    foreach ($generated in @('Path of Boredom.Maui/obj/Release/net9.0-android', 'Path of Boredom.Maui/bin/Release/net9.0-android')) {
        if (Test-Path -LiteralPath $generated) { Remove-Item -LiteralPath $generated -Recurse -Force }
    }

    dotnet publish 'Path of Boredom.Maui/Path of Boredom.Maui.csproj' -f net9.0-android -c Release `
        -p:AndroidPackageFormats=aab "-p:ApplicationVersion=$VersionCode" `
        '-p:AndroidManifest=..\Play-Release\API36-AndroidManifest.xml' "-p:AndroidSdkDirectory=$sdk" `
        --nologo -v:quiet -tl:off
    if ($LASTEXITCODE -ne 0) { throw 'Android Release publish failed.' }

    $unsigned = Join-Path $root 'Path of Boredom.Maui/bin/Release/net9.0-android/publish/com.madbone.pathofboredom.aab'
    if (-not (Test-Path -LiteralPath $unsigned)) { throw 'Publish did not produce the expected unsigned bundle.' }
    jarsigner -keystore $key -storepass:file $password -keypass:file $password -signedjar $bundle $unsigned pob-upload
    if ($LASTEXITCODE -ne 0) { throw 'Upload signing failed.' }
    jarsigner -verify $bundle
    if ($LASTEXITCODE -ne 0) { throw 'Upload signature verification failed.' }
    Write-Output "Signed upload bundle: $bundle"
    Write-Output 'Verify bundle metadata and test the Play-delivered update before wider rollout.'
}
finally { Pop-Location }

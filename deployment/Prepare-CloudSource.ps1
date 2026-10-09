$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDirectory = Join-Path $root 'Play-Release'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$output = Join-Path $outputDirectory 'pob-cloud-source.zip'

$files = @('Dockerfile', '.dockerignore', '.gcloudignore')
foreach ($project in @('Path of Boredom.ApiService', 'Path of Boredom.ServiceDefaults', 'Path of Boredom.Contracts')) {
    $directory = Join-Path $root $project
    $files += Get-ChildItem -LiteralPath $directory -File |
        Where-Object { $_.Extension -in @('.cs', '.csproj') } |
        ForEach-Object { "$project/$($_.Name)" }
}
$files += 'Path of Boredom.ApiService/appsettings.json'

foreach ($relative in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $relative) -PathType Leaf)) {
        throw "Required deployment file is missing: $relative"
    }
}

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output }
$archive = [IO.Compression.ZipFile]::Open($output, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in ($files | Sort-Object -Unique)) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $root $relative), "pob-cloud-source/$relative",
            [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally { $archive.Dispose() }

Write-Output "Backend-only deployment archive: $output"
Write-Output 'No signing keys, passwords, Android releases, local data, or development settings are included.'

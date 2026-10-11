param(
    [Parameter(Mandatory = $true)]
    [string]$BundlePath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPrefix
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$bundle = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($BundlePath))
$symbolsPath = [IO.Path]::GetFullPath("$OutputPrefix-native-debug-symbols.zip")
$mappingPath = [IO.Path]::GetFullPath("$OutputPrefix-mapping.txt")
$reportPath = [IO.Path]::GetFullPath("$OutputPrefix-diagnostics.txt")
$report = [Collections.Generic.List[string]]::new()
$count = 0
$symbols = $null
try {
    foreach ($output in @($symbolsPath, $mappingPath, $reportPath)) {
        if (Test-Path -LiteralPath $output) { throw "Diagnostics output already exists: $output" }
    }
    $symbols = [IO.Compression.ZipFile]::Open($symbolsPath, [IO.Compression.ZipArchiveMode]::Create)
    foreach ($entry in $bundle.Entries) {
        if ($entry.FullName -eq 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map') {
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $mappingPath)
            $report.Add('R8/ProGuard mapping exported; also embedded in the App Bundle.')
        }
        if ($entry.FullName -notmatch '^base/lib/([^/]+)/([^/]+\.so)$') { continue }
        $abi = $Matches[1]
        $name = $Matches[2]
        $input = $entry.Open()
        $memory = [IO.MemoryStream]::new()
        try {
            $input.CopyTo($memory)
            $bytes = $memory.ToArray()
        }
        finally { $input.Dispose(); $memory.Dispose() }
        $text = [Text.Encoding]::ASCII.GetString($bytes)
        if (-not $text.Contains(".symtab`0") -and -not $text.Contains(".debug_info`0")) {
            $report.Add("No debug symbols available (already stripped): $abi/$name")
            continue
        }
        $symbol = $symbols.CreateEntry("$abi/$name", [IO.Compression.CompressionLevel]::Optimal)
        $output = $symbol.Open()
        try { $output.Write($bytes, 0, $bytes.Length) }
        finally { $output.Dispose() }
        $count++
        $report.Add("Native symbols exported: $abi/$name")
    }
}
finally {
    if ($symbols) { $symbols.Dispose() }
    $bundle.Dispose()
}
if (-not (Test-Path -LiteralPath $mappingPath)) {
    $report.Add('No R8/ProGuard mapping in this bundle. If obfuscation is disabled, no deobfuscation upload is needed.')
}
$report.Add("Native symbol libraries: $count")
$report.Add('Upload the native-debug-symbols.zip in Play Console for this exact version code. Retain all diagnostics with the matching AAB.')
[IO.File]::WriteAllLines($reportPath, $report)
if ($count -eq 0) {
    Remove-Item -LiteralPath $symbolsPath
    throw "No usable native symbols found. See $reportPath"
}
Write-Output "Native debug symbols: $symbolsPath ($count libraries)"
if (Test-Path -LiteralPath $mappingPath) { Write-Output "Deobfuscation mapping: $mappingPath" }
else { Write-Output 'No R8/ProGuard mapping generated; see diagnostics report for applicability.' }
Write-Output "Diagnostics report: $reportPath"

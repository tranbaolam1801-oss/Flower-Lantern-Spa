$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$out = Join-Path $PSScriptRoot '../audit/extracted'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem (Join-Path $PSScriptRoot '../docs') -Recurse -Filter *.docx | ForEach-Object {
  $zip = [IO.Compression.ZipFile]::OpenRead($_.FullName)
  try {
    $reader = [IO.StreamReader]::new($zip.GetEntry('word/document.xml').Open())
    [xml]$xml = $reader.ReadToEnd()
    $reader.Dispose()
    $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $lines = $xml.SelectNodes('//w:p', $ns) | ForEach-Object {
      ($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
    }
    [IO.File]::WriteAllLines((Join-Path $out ($_.BaseName + '.txt')), [string[]]$lines, [Text.UTF8Encoding]::new($false))
    $mediaDir = Join-Path $out ($_.BaseName + '-media')
    New-Item -ItemType Directory -Force $mediaDir | Out-Null
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -like 'word/media/*' -and $entry.Name) {
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $mediaDir $entry.Name), $true)
      }
    }
    Write-Output "$($_.Name): $($lines.Count) paragraphs; $((Get-ChildItem $mediaDir).Count) media"
  } finally { $zip.Dispose() }
}
Get-ChildItem (Join-Path $PSScriptRoot '../docs') -Recurse -Filter *.drawio | ForEach-Object {
  [xml]$xml = Get-Content -Raw -Encoding UTF8 $_.FullName
  $lines = foreach ($diagram in $xml.mxfile.diagram) {
    "PAGE: $($diagram.name)"
    if (-not $diagram.mxGraphModel) { throw "Compressed diagram needs decoding: $($_.Name)" }
    foreach ($cell in $diagram.SelectNodes('.//mxCell')) {
      if ($cell.value) { "$($cell.id) [$($cell.source) -> $($cell.target)] $([Net.WebUtility]::HtmlDecode($cell.value))" }
    }
  }
  [IO.File]::WriteAllLines((Join-Path $out ($_.BaseName + '.txt')), [string[]]$lines, [Text.UTF8Encoding]::new($false))
  Write-Output "$($_.Name): $($lines.Count) diagram entries"
}

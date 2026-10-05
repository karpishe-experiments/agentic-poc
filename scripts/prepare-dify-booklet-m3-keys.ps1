param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$directory = Join-Path $env:LOCALAPPDATA 'DifyWf-Community-Codex'
$sourcePath = Join-Path $directory 'issue65-m2-bindings.dpapi.xml'
$outputPath = Join-Path $directory 'issue65-m3-bindings.dpapi.xml'
$modules = @(
    @{ name='issue65_m3_manager'; role='manager'; taskId=$null; persona=$null; appId='46572ccb-d954-45e5-b73d-90fd0995cdb6' }
    @{ name='issue65_m3_playful_kid'; role='tester'; taskId=$null; persona='playful_kid'; appId='bf57a8ea-1be6-4a97-a5c0-023cfde794f8' }
    @{ name='issue65_m3_enthusiast_parent'; role='tester'; taskId=$null; persona='enthusiast_parent'; appId='593fb610-624e-404c-92de-57f54e9a47fb' }
    @{ name='issue65_m3_professional_creator'; role='tester'; taskId=$null; persona='professional_creator'; appId='cd284244-63d5-4169-95c3-9790001a5240' }
    @{ name='issue65_m3_J11'; role='specialist'; taskId='J11'; persona=$null; appId='4f4704ca-de02-4a6d-8051-ba6849fdda56' }
)

if (-not $Apply) {
    Write-Host 'Preview: reuse eleven M2 specialist/image bindings and prepare five new M3 bindings.'
    foreach ($item in $modules) {
        Write-Host "$($item.name): https://dify.uniwares.co.uk/app/$($item.appId)/workflow"
    }
    Write-Host "Output: $outputPath"
    Write-Host 'No upload, host change, workflow execution, reset or paid call.'
    return
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'The encrypted M2 bindings file is missing.' }
if (Test-Path -LiteralPath $outputPath) { throw 'M3 bindings already exist. Stop without overwriting them.' }

$sourceSecret = $null
$outputSecret = $null
$pointer = [IntPtr]::Zero
$prepared = $null
$bindings = @()
$callbackKey = $null
$apiKey = $null
$json = $null
try {
    $sourceSecret = Import-Clixml -LiteralPath $sourcePath
    if ($sourceSecret -isnot [Security.SecureString]) { throw 'Unexpected encrypted M2 file format.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sourceSecret)
    $prepared = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
    if (@($prepared.bindings).Count -ne 15) { throw 'Expected fifteen existing M2 bindings.' }
    $callbackKey = [string]$prepared.callbackKey
    if ($callbackKey.Length -lt 32 -or $callbackKey -match '\s') { throw 'Existing callback key failed validation.' }
    $bindings = @($prepared.bindings | Where-Object { $_.role -in @('specialist', 'image') })
    $specialists = @($bindings | Where-Object { $_.role -eq 'specialist' })
    $images = @($bindings | Where-Object { $_.role -eq 'image' })
    $expectedTasks = 1..10 | ForEach-Object { 'J{0:D2}' -f $_ }
    $actualTasks = @($specialists.taskId | Sort-Object -Unique)
    if ($bindings.Count -ne 11 -or $specialists.Count -ne 10 -or $images.Count -ne 1 -or
        @(Compare-Object $expectedTasks $actualTasks).Count -ne 0) {
        throw 'Expected J01-J10 specialists and one image binding.'
    }
    foreach ($binding in $bindings) {
        if ([string]$binding.apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$') { throw 'An existing application key failed validation.' }
    }
    foreach ($item in $modules) {
        Set-Clipboard -Value $callbackKey
        Write-Host "`nOpen: https://dify.uniwares.co.uk/app/$($item.appId)/workflow"
        Write-Host 'The EXISTING callback key is now on your clipboard.'
        Write-Host 'Environment Variables > BOOKLET_TOOL_KEY > type Secret.'
        Write-Host 'Paste the clipboard value, Save, then Publish. Do not Run or Test.'
        [void](Read-Host 'Press Enter AFTER Save and Publish')
        do {
            Write-Host 'Open Access API > API Keys for THIS app.'
            [void](Read-Host 'Copy the application API key, then press Enter')
            $apiKey = Get-Clipboard -Raw
            if ($null -ne $apiKey) { $apiKey = $apiKey.Trim() }
            $valid = ($apiKey -cmatch '^app-[A-Za-z0-9_-]+$' -and $apiKey -cnotin @($bindings.apiKey))
            if (-not $valid) { Write-Host 'Invalid or already collected key. Copy this app key again.' }
        } until ($valid)
        $bindings += [pscustomobject]@{
            appId=$item.appId; role=$item.role; taskId=$item.taskId; persona=$item.persona; apiKey=$apiKey
        }
        $apiKey = $null
    }
    if ($bindings.Count -ne 16) { throw 'Expected sixteen prepared bindings.' }
    if (Test-Path -LiteralPath $outputPath) { throw 'The destination appeared during preparation; not overwriting it.' }
    $json = @{ callbackKey=$callbackKey; bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
    $outputSecret = ConvertTo-SecureString $json -AsPlainText -Force
    $outputSecret | Export-Clixml -LiteralPath $outputPath -NoClobber
    Write-Host 'PASS: sixteen bindings saved encrypted for this Windows account.'
    Write-Host 'No keys uploaded, staging activation or workflow execution.'
    Write-Host 'Tell Codex: M3 keys prepared. Do not share keys or the encrypted file.'
} catch {
    Write-Error 'Private preparation stopped. Check the M2 source and M3 destination locally; do not share their contents.' -ErrorAction Continue
    exit 1
} finally {
    try { Set-Clipboard -Value ' ' } catch {}
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($sourceSecret -is [Security.SecureString]) { $sourceSecret.Dispose() }
    if ($outputSecret -is [Security.SecureString]) { $outputSecret.Dispose() }
    $prepared=$null; $bindings=$null; $callbackKey=$null; $apiKey=$null; $json=$null
}

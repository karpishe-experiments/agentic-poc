param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$directory = Join-Path $env:LOCALAPPDATA 'DifyWf-Community-Codex'
$sourcePath = Join-Path $directory 'issue65-m3-bindings.dpapi.xml'
$outputPath = Join-Path $directory 'issue65-m3-j12-bindings.dpapi.xml'
$app = @{ name='issue65_m3_J12'; role='specialist'; taskId='J12'; persona=$null; appId='f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1' }

if (-not $Apply) {
    Write-Host 'Preview: reuse all sixteen M3 bindings and the existing callback key; add one J12 specialist binding.'
    Write-Host "$($app.name): https://dify.uniwares.co.uk/app/$($app.appId)/workflow"
    Write-Host "Output: $outputPath"
    Write-Host 'No upload, host change, workflow execution, reset or paid call.'
    return
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'The encrypted M3 bindings file is missing.' }
if (Test-Path -LiteralPath $outputPath) { throw 'J12 bindings already exist. Stop without overwriting them.' }

$sourceSecret = $null
$outputSecret = $null
$pointer = [IntPtr]::Zero
$prepared = $null
$bindings = @()
$callbackKey = $null
$apiKey = $null
$json = $null
$step = 'read encrypted M3 bindings'
try {
    $sourceSecret = Import-Clixml -LiteralPath $sourcePath
    if ($sourceSecret -isnot [Security.SecureString]) { throw 'Unexpected encrypted M3 file format.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sourceSecret)
    $prepared = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
    $bindings = @($prepared.bindings)
    if ($bindings.Count -ne 16) { throw 'Expected sixteen existing M3 bindings.' }
    $callbackKey = [string]$prepared.callbackKey
    if ($callbackKey.Length -lt 32 -or $callbackKey -match '\s') { throw 'Existing callback key failed validation.' }
    $expected = @('manager::', 'tester::playful_kid', 'tester::enthusiast_parent', 'tester::professional_creator', 'image::')
    $expected += 1..11 | ForEach-Object { 'specialist:J{0:D2}:' -f $_ }
    $slots = @($bindings | ForEach-Object { '{0}:{1}:{2}' -f $_.role, $_.taskId, $_.persona })
    if (@(Compare-Object ($expected | Sort-Object) ($slots | Sort-Object)).Count -ne 0) { throw 'Existing M3 slots differ from the complete sixteen-slot profile.' }
    $appIds = @($bindings | ForEach-Object { [string]$_.appId })
    if (@($appIds | Sort-Object -Unique).Count -ne 16 -or $appIds -contains $app.appId) { throw 'Existing application identities are duplicated or include J12.' }
    foreach ($binding in $bindings) {
        if ([string]$binding.appId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or
            [string]$binding.apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$') { throw 'An existing application identity or key failed validation.' }
    }
    $step = 'bind callback for ' + $app.name
    Set-Clipboard -Value $callbackKey
    Write-Host "`nOpen: https://dify.uniwares.co.uk/app/$($app.appId)/workflow"
    Write-Host 'The EXISTING callback key is now on your clipboard.'
    Write-Host 'Environment Variables > BOOKLET_TOOL_KEY > type Secret.'
    Write-Host 'Paste the clipboard value, Save, then Publish. Do not Run or Test.'
    [void](Read-Host 'Press Enter AFTER Save and Publish')
    do {
        $step = 'collect application key for ' + $app.name
        Write-Host 'Open Access API > API Keys for THIS app.'
        [void](Read-Host 'Copy the application API key, then press Enter')
        $apiKey = $null
        $clipboardRead = $false
        for ($attempt = 0; $attempt -lt 5; $attempt++) {
            try {
                $apiKey = Get-Clipboard -Raw -ErrorAction Stop
                $clipboardRead = $true
                break
            } catch [System.Runtime.InteropServices.ExternalException] {
                if ($attempt -lt 4) { Start-Sleep -Milliseconds 200 }
            }
        }
        if (-not $clipboardRead) {
            Write-Host 'Windows could not read the clipboard. Copy this same app key again, wait a moment, then press Enter.'
            continue
        }
        if ($null -ne $apiKey) { $apiKey = $apiKey.Trim() }
        if ($apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$') {
            Write-Host 'Clipboard does not contain an application API key. Copy only the key.'
        }
    } until ($apiKey -cmatch '^app-[A-Za-z0-9_-]+$')
    $bindings += @{ appId=$app.appId; role=$app.role; taskId=$app.taskId; persona=$app.persona; apiKey=$apiKey }
    $apiKey = $null
    if ($bindings.Count -ne 17) { throw 'Expected seventeen prepared bindings.' }
    if (Test-Path -LiteralPath $outputPath) { throw 'The destination appeared during preparation; not overwriting it.' }
    $step = 'save encrypted J12 bindings'
    $json = @{ callbackKey=$callbackKey; bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
    $outputSecret = ConvertTo-SecureString $json -AsPlainText -Force
    $outputSecret | Export-Clixml -LiteralPath $outputPath -NoClobber
    Write-Host 'PASS: seventeen bindings saved encrypted for this Windows account.'
    Write-Host 'No keys uploaded, staging activation or workflow execution.'
    Write-Host 'Tell Codex: J12 keys prepared. Do not share keys or the encrypted file.'
} catch {
    $safeType = $_.Exception.GetType().Name
    $safeLine = $_.InvocationInfo.ScriptLineNumber
    Write-Error "Private preparation stopped at $step (type=$safeType, line=$safeLine). Share only this status; never keys or file contents." -ErrorAction Continue
    exit 1
} finally {
    try { Set-Clipboard -Value ' ' } catch {}
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($sourceSecret -is [Security.SecureString]) { $sourceSecret.Dispose() }
    if ($outputSecret -is [Security.SecureString]) { $outputSecret.Dispose() }
    $prepared=$null; $bindings=$null; $callbackKey=$null; $apiKey=$null; $json=$null
}

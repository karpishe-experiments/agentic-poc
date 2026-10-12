param(
    [ValidateSet('m3-j12','m3-j13')][string]$Profile='m3-j12',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$directory = Join-Path $env:LOCALAPPDATA 'DifyWf-Community-Codex'
$sourcePath = Join-Path $directory 'issue65-m3-bindings.dpapi.xml'
$outputPath = Join-Path $directory "issue65-$Profile-bindings.dpapi.xml"
$checkpointPath = Join-Path $directory "issue65-$Profile-bindings.partial.dpapi.xml"
$appsToPrepare = @(@{ name='issue65_m3_J12'; role='specialist'; taskId='J12'; persona=$null; appId='f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1' })
$sourceCount = 16
$expectedCount = if ($Profile -eq 'm3-j13') { 18 } else { 17 }
if ($Profile -eq 'm3-j13') {
    $appsToPrepare += @{ name='issue65_m3_judge'; role='judge'; taskId=$null; persona=$null; appId='89f1adcd-1073-460d-98a3-e4df35c4263c' }
    $j12Source = Join-Path $directory 'issue65-m3-j12-bindings.dpapi.xml'
    if (Test-Path -LiteralPath $j12Source -PathType Leaf) {
        $sourcePath = $j12Source
        $sourceCount = 17
        $appsToPrepare = @($appsToPrepare | Where-Object { $_.role -eq 'judge' })
    }
}

if (-not $Apply) {
    Write-Host "Preview: reuse $sourceCount bindings and the existing callback key; prepare $($appsToPrepare.Count) missing $Profile bindings."
    foreach ($app in $appsToPrepare) { Write-Host "$($app.name): https://dify.uniwares.co.uk/app/$($app.appId)/workflow" }
    Write-Host "Output: $outputPath"
    Write-Host 'No upload, host change, workflow execution, reset or paid call.'
    return
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'The encrypted M3 bindings file is missing.' }
if (Test-Path -LiteralPath $outputPath) { throw 'Profile bindings already exist. Stop without overwriting them.' }

$sourceSecret = $null
$outputSecret = $null
$checkpointSecret = $null
$checkpointOutputSecret = $null
$pointer = [IntPtr]::Zero
$checkpointPointer = [IntPtr]::Zero
$prepared = $null
$bindings = @()
$callbackKey = $null
$apiKey = $null
$json = $null
$checkpointJson = $null
$step = 'read encrypted M3 bindings'
try {
    $sourceSecret = Import-Clixml -LiteralPath $sourcePath
    if ($sourceSecret -isnot [Security.SecureString]) { throw 'Unexpected encrypted M3 file format.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sourceSecret)
    $prepared = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
    $bindings = @($prepared.bindings)
    if ($bindings.Count -ne $sourceCount) { throw 'Unexpected existing binding count.' }
    $callbackKey = [string]$prepared.callbackKey
    if ($callbackKey.Length -lt 32 -or $callbackKey -match '\s') { throw 'Existing callback key failed validation.' }
    $expected = @('manager::', 'tester::playful_kid', 'tester::enthusiast_parent', 'tester::professional_creator', 'image::')
    $expected += 1..11 | ForEach-Object { 'specialist:J{0:D2}:' -f $_ }
    if ($sourceCount -eq 17) { $expected += 'specialist:J12:' }
    $slots = @($bindings | ForEach-Object { '{0}:{1}:{2}' -f $_.role, $_.taskId, $_.persona })
    if (@(Compare-Object ($expected | Sort-Object) ($slots | Sort-Object)).Count -ne 0) { throw 'Existing slots differ from the complete source profile.' }
    $appIds = @($bindings | ForEach-Object { [string]$_.appId })
    if (@($appIds | Sort-Object -Unique).Count -ne $sourceCount -or
        @($appsToPrepare | Where-Object { $appIds -contains $_.appId }).Count) { throw 'Existing application identities are duplicated or include a new module.' }
    if ($sourceCount -eq 17 -and
        ($bindings | Where-Object { $_.taskId -ceq 'J12' }).appId -cne 'f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1') {
        throw 'Existing J12 binding does not identify the prepared app.'
    }
    foreach ($binding in $bindings) {
        if ([string]$binding.appId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or
            [string]$binding.apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$') { throw 'An existing application identity or key failed validation.' }
    }
    if (Test-Path -LiteralPath $checkpointPath -PathType Leaf) {
        $step = 'read encrypted partial checkpoint'
        $checkpointSecret = Import-Clixml -LiteralPath $checkpointPath
        if ($checkpointSecret -isnot [Security.SecureString]) { throw 'Unexpected encrypted partial checkpoint format.' }
        $checkpointPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($checkpointSecret)
        $checkpoint = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($checkpointPointer) | ConvertFrom-Json
        if ($checkpoint.profile -cne $Profile -or [string]$checkpoint.callbackKey -cne $callbackKey) { throw 'Partial checkpoint does not match this profile.' }
        $checkpointBindings = @($checkpoint.bindings)
        if ($checkpointBindings.Count -lt $sourceCount -or $checkpointBindings.Count -gt $expectedCount) { throw 'Partial checkpoint has an invalid binding count.' }
        $checkpointByApp = @{}
        foreach ($binding in $checkpointBindings) {
            $appId = [string]$binding.appId
            if ($checkpointByApp.ContainsKey($appId) -or $appId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or [string]$binding.apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$') { throw 'Partial checkpoint has an invalid binding identity.' }
            $checkpointByApp[$appId] = $binding
        }
        foreach ($sourceBinding in $bindings) {
            $saved = $checkpointByApp[[string]$sourceBinding.appId]
            if ($null -eq $saved -or [string]$saved.apiKey -cne [string]$sourceBinding.apiKey -or [string]$saved.role -cne [string]$sourceBinding.role -or [string]$saved.taskId -cne [string]$sourceBinding.taskId -or [string]$saved.persona -cne [string]$sourceBinding.persona) { throw 'Partial checkpoint differs from the encrypted source profile.' }
        }
        foreach ($saved in $checkpointBindings | Select-Object -Skip $sourceCount) {
            $expectedApp = @($appsToPrepare | Where-Object { $_.appId -ceq [string]$saved.appId })
            if ($expectedApp.Count -ne 1 -or [string]$saved.role -cne [string]$expectedApp[0].role -or [string]$saved.taskId -cne [string]$expectedApp[0].taskId -or [string]$saved.persona -cne [string]$expectedApp[0].persona) { throw 'Partial checkpoint contains an unexpected module.' }
        }
        $bindings = $checkpointBindings
        $remainingApps = @()
        foreach ($candidateApp in $appsToPrepare) {
            if (@($bindings | Where-Object { $_.appId -ceq $candidateApp.appId }).Count -eq 0) { $remainingApps += $candidateApp }
        }
        $appsToPrepare = $remainingApps
        Write-Host "Resuming private $Profile preparation with $($appsToPrepare.Count) missing binding(s)."
    }
    foreach ($app in $appsToPrepare) {
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
            } elseif (@($bindings | Where-Object { $_.apiKey -ceq $apiKey }).Count) {
                Write-Host 'This key is already bound to another app. Copy the key for THIS app.'
                $apiKey = $null
            }
        } until ($apiKey -cmatch '^app-[A-Za-z0-9_-]+$')
        $bindings += @{ appId=$app.appId; role=$app.role; taskId=$app.taskId; persona=$app.persona; apiKey=$apiKey }
        $apiKey = $null
        $step = 'save encrypted partial checkpoint'
        $checkpointJson = @{ profile=$Profile; callbackKey=$callbackKey; bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
        $checkpointOutputSecret = ConvertTo-SecureString $checkpointJson -AsPlainText -Force
        $checkpointOutputSecret | Export-Clixml -LiteralPath $checkpointPath -Force
        $checkpointOutputSecret.Dispose()
        $checkpointOutputSecret = $null
        $checkpointJson = $null
    }
    if ($bindings.Count -ne $expectedCount) { throw 'Unexpected prepared binding count.' }
    if (Test-Path -LiteralPath $outputPath) { throw 'The destination appeared during preparation; not overwriting it.' }
    $step = 'save encrypted profile bindings'
    $json = @{ callbackKey=$callbackKey; bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
    $outputSecret = ConvertTo-SecureString $json -AsPlainText -Force
    $outputSecret | Export-Clixml -LiteralPath $outputPath -NoClobber
    Remove-Item -LiteralPath $checkpointPath -Force -ErrorAction SilentlyContinue
    Write-Host "PASS: $expectedCount bindings saved encrypted for this Windows account."
    Write-Host 'No keys uploaded, staging activation or workflow execution.'
    Write-Host "Tell Codex: $Profile keys prepared. Do not share keys or the encrypted file."
} catch {
    $safeType = $_.Exception.GetType().Name
    $safeLine = $_.InvocationInfo.ScriptLineNumber
    Write-Error "Private preparation stopped at $step (type=$safeType, line=$safeLine). Share only this status; never keys or file contents." -ErrorAction Continue
    exit 1
} finally {
    try { Set-Clipboard -Value ' ' } catch {}
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($checkpointPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($checkpointPointer) }
    if ($sourceSecret -is [Security.SecureString]) { $sourceSecret.Dispose() }
    if ($outputSecret -is [Security.SecureString]) { $outputSecret.Dispose() }
    if ($checkpointSecret -is [Security.SecureString]) { $checkpointSecret.Dispose() }
    if ($checkpointOutputSecret -is [Security.SecureString]) { $checkpointOutputSecret.Dispose() }
    $prepared=$null; $bindings=$null; $callbackKey=$null; $apiKey=$null; $json=$null; $checkpointJson=$null
}

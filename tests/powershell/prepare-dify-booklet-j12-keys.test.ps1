param([switch]$InvalidCase)

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../../scripts/prepare-dify-booklet-j12-keys.ps1'
$parseErrors = $null
[void][Management.Automation.Language.Parser]::ParseFile($helper, [ref]$null, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'J12 helper syntax failed.' }

$global:J12KeyTest = @{ imports=0; prompts=0; output=$null; clipboardWrites=@(); reads=0; sourceExists=$true; outputExists=$false; sourceJson=$null }
$slots = @(@{ role='manager'; taskId=$null; persona=$null })
$slots += 1..11 | ForEach-Object { @{ role='specialist'; taskId=('J{0:D2}' -f $_); persona=$null } }
$slots += @('playful_kid','enthusiast_parent','professional_creator') | ForEach-Object { @{ role='tester'; taskId=$null; persona=$_ } }
$slots += @{ role='image'; taskId=$null; persona=$null }
$bindings = @()
for ($index=0; $index -lt $slots.Count; $index++) {
    $bindings += @{ role=$slots[$index].role; taskId=$slots[$index].taskId; persona=$slots[$index].persona;
        appId=('00000000-0000-4000-8000-{0:D12}' -f ($index + 1)); apiKey="app-synthetic-old-$index" }
}
if ($InvalidCase) { $bindings[3].taskId = 'J12' }
$global:J12KeyTest.sourceJson = @{ callbackKey=('synthetic-callback-' * 3); bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
function Test-Path { param($LiteralPath, $PathType)
    if ($LiteralPath -like '*issue65-m3-j12-bindings.dpapi.xml') { return $global:J12KeyTest.outputExists }
    if ($LiteralPath -like '*issue65-m3-bindings.dpapi.xml') { return $global:J12KeyTest.sourceExists }
    throw 'Unexpected private path.'
}
function Import-Clixml { param($LiteralPath)
    $global:J12KeyTest.imports++
    if ($LiteralPath -notlike '*issue65-m3-bindings.dpapi.xml') { throw 'Wrong source.' }
    return ConvertTo-SecureString $global:J12KeyTest.sourceJson -AsPlainText -Force
}
function Set-Clipboard { param($Value) $global:J12KeyTest.clipboardWrites += $Value }
function Get-Clipboard { param([switch]$Raw)
    $global:J12KeyTest.reads++
    if ($global:J12KeyTest.reads -le 5) { throw [System.Runtime.InteropServices.ExternalException]::new('Synthetic clipboard contention') }
    if ($global:J12KeyTest.reads -eq 6) { return 'wrong-key' }
    return '  app-synthetic-j12  '
}
function Start-Sleep { param($Milliseconds) }
function Read-Host { param($Prompt) $global:J12KeyTest.prompts++; return '' }
function Export-Clixml { param([Parameter(ValueFromPipeline)]$InputObject, $LiteralPath, [switch]$NoClobber)
    process {
        if (-not $NoClobber -or $LiteralPath -notlike '*issue65-m3-j12-bindings.dpapi.xml') { throw 'Unsafe output.' }
        $testPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($InputObject)
        try { $global:J12KeyTest.output = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($testPointer) | ConvertFrom-Json }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($testPointer) }
    }
}
try {
    if ($InvalidCase) {
        & $helper -Apply
        throw 'Invalid slot was accepted.'
    }
    & $helper
    if ($global:J12KeyTest.imports -ne 0 -or $global:J12KeyTest.clipboardWrites.Count -ne 0 -or $global:J12KeyTest.prompts -ne 0) { throw 'Preview accessed private state.' }
    $global:J12KeyTest.outputExists = $true
    try { & $helper -Apply; throw 'Existing destination was overwritten.' }
    catch { if ($_.Exception.Message -notlike '*already exist*') { throw } }
    if ($global:J12KeyTest.imports -ne 0) { throw 'No-overwrite gate read the source.' }
    $global:J12KeyTest.outputExists = $false
    & $helper -Apply
    $result = $global:J12KeyTest.output
    if ($null -eq $result -or @($result.bindings).Count -ne 17 -or $global:J12KeyTest.imports -ne 1) { throw 'Expected one source read and seventeen output bindings.' }
    if ($result.callbackKey -cne ('synthetic-callback-' * 3)) { throw 'Callback changed.' }
    for ($index=0; $index -lt 16; $index++) {
        if (($result.bindings[$index] | ConvertTo-Json -Compress) -cne ($bindings[$index] | ConvertTo-Json -Compress)) {
            if ($result.bindings[$index].appId -cne $bindings[$index].appId -or $result.bindings[$index].apiKey -cne $bindings[$index].apiKey -or
                $result.bindings[$index].role -cne $bindings[$index].role -or $result.bindings[$index].taskId -cne $bindings[$index].taskId -or
                $result.bindings[$index].persona -cne $bindings[$index].persona) { throw 'An M3 binding changed.' }
        }
    }
    $new = $result.bindings[16]
    if ($new.appId -cne 'f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1' -or $new.role -cne 'specialist' -or $new.taskId -cne 'J12' -or
        $null -ne $new.persona -or $new.apiKey -cne 'app-synthetic-j12') { throw 'J12 binding differs.' }
    if ($global:J12KeyTest.reads -ne 7 -or $global:J12KeyTest.prompts -ne 4) { throw 'Clipboard contention or same-field retry failed.' }
    if ($global:J12KeyTest.clipboardWrites.Count -ne 2 -or $global:J12KeyTest.clipboardWrites[-1] -ne ' ') { throw 'Clipboard cleanup failed.' }
    if ($global:J12KeyTest.sourceJson -cne (@{ callbackKey=('synthetic-callback-' * 3); bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress)) { throw 'Source changed.' }
    $priorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $invalid = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -InvalidCase 2>&1 }
    finally { $ErrorActionPreference = $priorPreference }
    if ($LASTEXITCODE -eq 0 -or @($invalid | Where-Object { "$_" -match 'app-synthetic|synthetic-callback' }).Count) { throw 'Invalid source did not stop safely.' }
    'PASS: syntax, preview isolation, exact sixteen-source reuse, no overwrite, J12 output, clipboard contention, invalid slot and cleanup.'
} finally {
    Remove-Variable J12KeyTest -Scope Global -ErrorAction SilentlyContinue
    foreach ($name in 'Test-Path','Import-Clixml','Set-Clipboard','Get-Clipboard','Read-Host','Export-Clixml','Start-Sleep') {
        Remove-Item "Function:$name" -ErrorAction SilentlyContinue
    }
}

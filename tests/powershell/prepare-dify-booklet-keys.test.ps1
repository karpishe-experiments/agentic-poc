$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../../scripts/prepare-dify-booklet-keys.ps1'
$parseErrors = $null
[void][Management.Automation.Language.Parser]::ParseFile($helper, [ref]$null, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Helper syntax failed.' }

# Synthetic values only. All credential, clipboard, prompt and write surfaces
# are intercepted before exercising the helper's collection path.
$global:KeyPrepTest = @{
    promptCount=0; importCount=0; clipboardWrites=@(); output=$null
    clipboard=New-Object 'System.Collections.Generic.Queue[object]'
}
$ids = @(
    'eca554a2-34bd-489c-b05d-713a6876b448', '7c186b42-a069-4059-aac6-5589e870951f',
    '4b49ed43-218d-4892-981f-acfe7181c60c', '973d697b-68dd-4b05-bd57-ededfa383a14',
    '33d47b5c-77c0-4ab5-86d0-6ee7da8fca1d', '99e1740f-52f2-467e-9553-81104564c3ae'
)
$oldBindings = @()
for ($index=0; $index -lt $ids.Count; $index++) {
    $oldBindings += @{ appId=$ids[$index]; apiKey="app-synthetic-old-$index" }
}
$global:KeyPrepTest.input = @{ callbackKey=('synthetic-callback-' * 3); bindings=$oldBindings } | ConvertTo-Json -Depth 8
$global:KeyPrepTest.clipboard.Enqueue($null)
$global:KeyPrepTest.clipboard.Enqueue('not-an-app-key')
for ($index=0; $index -lt 9; $index++) { $global:KeyPrepTest.clipboard.Enqueue("  app-synthetic-new-$index  ") }
function Test-Path { param($LiteralPath, $PathType)
    if ($LiteralPath -like '*issue65-m2-bindings.dpapi.xml') { return $false }
    if ($LiteralPath -like '*issue65-m1-bindings.dpapi.xml') { return $true }
    throw 'Unexpected path check in private preparation.'
}
function Import-Clixml { param($LiteralPath)
    $global:KeyPrepTest.importCount++
    return ConvertTo-SecureString $global:KeyPrepTest.input -AsPlainText -Force
}
function Set-Clipboard { param($Value) $global:KeyPrepTest.clipboardWrites += $Value }
function Get-Clipboard { param([switch]$Raw) return $global:KeyPrepTest.clipboard.Dequeue() }
function Read-Host { param($Prompt) $global:KeyPrepTest.promptCount++; return '' }
function Export-Clixml { param([Parameter(ValueFromPipeline)]$InputObject, $LiteralPath, [switch]$NoClobber)
    process {
        if (-not $NoClobber -or $LiteralPath -notlike '*issue65-m2-bindings.dpapi.xml') { throw 'Unsafe output target.' }
        $testPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($InputObject)
        try { $global:KeyPrepTest.output = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($testPtr) | ConvertFrom-Json }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($testPtr) }
    }
}
try {
    & $helper
    if ($global:KeyPrepTest.importCount -ne 0 -or $global:KeyPrepTest.clipboardWrites.Count -ne 0) { throw 'Preview accessed private surfaces.' }
    & $helper -Apply
    $result = $global:KeyPrepTest.output
    if ($result.bindings.Count -ne 15 -or $global:KeyPrepTest.importCount -ne 1) { throw 'Expected six retained and nine new bindings.' }
    if ($result.callbackKey -cne ('synthetic-callback-' * 3)) { throw 'Callback changed.' }
    for ($index=0; $index -lt 6; $index++) {
        if ($result.bindings[$index].appId -ne $ids[$index] -or $result.bindings[$index].apiKey -cne "app-synthetic-old-$index") { throw 'Retained binding changed.' }
    }
    if ($global:KeyPrepTest.promptCount -ne 20) { throw 'Invalid clipboard values did not retry only the current field.' }
    if ($global:KeyPrepTest.clipboardWrites.Count -ne 10 -or $global:KeyPrepTest.clipboardWrites[-1] -ne ' ') { throw 'Clipboard cleanup failed.' }
    if (@($result.bindings | Where-Object { $_.role -eq 'image' }).Count -ne 1) { throw 'Image role missing.' }
    if (@($result.bindings | Where-Object { $_.apiKey -match '\s' }).Count) { throw 'Clipboard whitespace retained.' }
    'PASS: syntax, preview isolation, synthetic collection, retry, preservation and cleanup.'
} finally {
    Remove-Variable KeyPrepTest -Scope Global -ErrorAction SilentlyContinue
    foreach ($name in 'Test-Path','Import-Clixml','Set-Clipboard','Get-Clipboard','Read-Host','Export-Clixml') {
        Remove-Item "Function:$name" -ErrorAction SilentlyContinue
    }
}

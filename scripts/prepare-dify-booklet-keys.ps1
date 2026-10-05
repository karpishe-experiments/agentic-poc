param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$modules = @(
    @{ name='issue65_m2_J03'; role='specialist'; taskId='J03'; persona=$null; appId='9f9b7ce0-1753-4999-87e0-290dcd47b46a' }
    @{ name='issue65_m2_J04'; role='specialist'; taskId='J04'; persona=$null; appId='98bb1b3f-d287-4f5b-a764-b47b30c314af' }
    @{ name='issue65_m2_J05'; role='specialist'; taskId='J05'; persona=$null; appId='4c7aff37-66fd-4dd5-a6a0-246001fd8d27' }
    @{ name='issue65_m2_J06'; role='specialist'; taskId='J06'; persona=$null; appId='fddf2de9-cdcd-4e1d-bcc7-3141c326a7fe' }
    @{ name='issue65_m2_J07'; role='specialist'; taskId='J07'; persona=$null; appId='dafefca5-4155-465b-9cdf-6bb041ac0d99' }
    @{ name='issue65_m2_J08'; role='specialist'; taskId='J08'; persona=$null; appId='0fc8f253-1ae6-4103-a105-4f737ce995d6' }
    @{ name='issue65_m2_J09'; role='specialist'; taskId='J09'; persona=$null; appId='fed00cde-73e7-4881-b818-6b2ab5cfabdb' }
    @{ name='issue65_m2_J10'; role='specialist'; taskId='J10'; persona=$null; appId='bf6a5e06-3168-4e81-a02a-c4b8eb4c8066' }
    @{ name='issue65_m2_image_probe'; role='image'; taskId=$null; persona=$null; appId='923566e9-c6fd-4936-836f-b21704d39628' }
)

if (-not $Apply) {
    Write-Host 'Preview: prepare nine additional Dify application keys for a private operator handoff.'
    foreach ($module in $modules) { Write-Host "$($module.name): https://dify.uniwares.co.uk/app/$($module.appId)/workflow" }
    Write-Host 'Apply reads the existing encrypted M1 bindings, guides publication and key collection, and creates a separate encrypted M2 file. No workflows run.'
    return
}

$directory = Join-Path $env:LOCALAPPDATA 'DifyWf-Community-Codex'
$sourcePath = Join-Path $directory 'issue65-m1-bindings.dpapi.xml'
$outputPath = Join-Path $directory 'issue65-m2-bindings.dpapi.xml'
if (Test-Path -LiteralPath $outputPath) { throw 'M2 encrypted file already exists. Stop and ask the operator to inspect it privately.' }
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'M1 encrypted file is missing. Stop and ask the operator to restore it privately.' }

$oldModules = @(
    @{ name='issue65_m1_manager'; role='manager'; taskId=$null; persona=$null; appId='eca554a2-34bd-489c-b05d-713a6876b448' }
    @{ name='issue65_m1_J01'; role='specialist'; taskId='J01'; persona=$null; appId='7c186b42-a069-4059-aac6-5589e870951f' }
    @{ name='issue65_m1_J02'; role='specialist'; taskId='J02'; persona=$null; appId='4b49ed43-218d-4892-981f-acfe7181c60c' }
    @{ name='issue65_m1_playful_kid'; role='tester'; taskId=$null; persona='playful_kid'; appId='973d697b-68dd-4b05-bd57-ededfa383a14' }
    @{ name='issue65_m1_enthusiast_parent'; role='tester'; taskId=$null; persona='enthusiast_parent'; appId='33d47b5c-77c0-4ab5-86d0-6ee7da8fca1d' }
    @{ name='issue65_m1_professional_creator'; role='tester'; taskId=$null; persona='professional_creator'; appId='99e1740f-52f2-467e-9553-81104564c3ae' }
)
$keys = @{}
$callbacks = New-Object 'System.Collections.Generic.HashSet[string]'
$ptr = [IntPtr]::Zero
$secure = $null
$newSecure = $null
$prepared = $null
$json = $null
$clipboardValue = $null
try {
    $secure = Import-Clixml -LiteralPath $sourcePath
    if ($secure -isnot [Security.SecureString]) { throw 'Invalid M1 format.' }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $prepared = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) | ConvertFrom-Json

    function Read-PreparedBindings($value, [string]$slot = '') {
        if ($null -eq $value) { return }
        if ($value -is [string]) {
            if ($slot -and $value -cmatch '^app-[A-Za-z0-9_-]+$') {
                if ($keys.ContainsKey($slot) -and $keys[$slot] -cne $value) { throw 'Conflicting M1 app keys.' }
                $keys[$slot] = $value
            }
            return
        }
        if ($value -is [System.Collections.IEnumerable] -and $value -isnot [pscustomobject]) {
            foreach ($item in $value) { Read-PreparedBindings $item $slot }
            return
        }
        foreach ($property in $value.PSObject.Properties) {
            if ($property.Value -is [string]) {
                foreach ($module in $oldModules) {
                    if ($property.Value -in @($module.name, $module.appId)) { $slot = $module.appId }
                }
            }
        }
        foreach ($property in $value.PSObject.Properties) {
            $childSlot = $slot
            foreach ($module in $oldModules) {
                if ($property.Name -in @($module.name, $module.appId, $module.name.Substring(11))) { $childSlot = $module.appId }
            }
            if ($property.Name -match '(callback_?key|tool_?key)$' -and $property.Value -is [string]) {
                [void]$callbacks.Add($property.Value)
            }
            Read-PreparedBindings $property.Value $childSlot
        }
    }
    Read-PreparedBindings $prepared
    if ($keys.Count -ne 6 -or $callbacks.Count -ne 1) { throw 'M1 file must resolve six app keys and one callback key.' }
    $callback = @($callbacks)[0]
    if ($callback.Length -lt 32 -or $callback -match '\s') { throw 'M1 callback key failed validation.' }
    $bindings = @($oldModules | ForEach-Object {
        @{ appId=$_.appId; role=$_.role; taskId=$_.taskId; persona=$_.persona; apiKey=$keys[$_.appId] }
    })
    foreach ($module in $modules) {
        Set-Clipboard -Value $callback
        Write-Host "`n$($module.name): https://dify.uniwares.co.uk/app/$($module.appId)/workflow"
        Write-Host 'The existing callback key is on the clipboard. Set Environment Variables > BOOKLET_TOOL_KEY as Secret. Save and Publish. Do not Run or Test.'
        [void](Read-Host 'Press Enter after Save and Publish')
        Write-Host 'Open Access API > API Keys. Copy the application API key to the clipboard.'
        do {
            [void](Read-Host 'Press Enter after copying the application API key')
            $clipboardValue = Get-Clipboard -Raw
            if ($null -ne $clipboardValue) { $clipboardValue = $clipboardValue.Trim() }
            if ($clipboardValue -cnotmatch '^app-[A-Za-z0-9_-]+$') {
                Write-Host 'The clipboard does not contain a valid application API key. Copy it and retry this app.'
            }
        } until ($clipboardValue -cmatch '^app-[A-Za-z0-9_-]+$')
        $bindings += @{ appId=$module.appId; role=$module.role; taskId=$module.taskId; persona=$module.persona; apiKey=$clipboardValue }
        $clipboardValue = $null
    }
    if (Test-Path -LiteralPath $outputPath) { throw 'M2 encrypted file appeared during collection. Stop without overwriting it.' }
    $json = @{ callbackKey=$callback; bindings=$bindings } | ConvertTo-Json -Depth 10 -Compress
    $newSecure = ConvertTo-SecureString $json -AsPlainText -Force
    $newSecure | Export-Clixml -LiteralPath $outputPath -NoClobber
    Write-Host "Prepared fifteen bindings (six reused and nine additional) in a separate encrypted file: $outputPath"
} catch {
    Write-Error 'Private preparation stopped. Check the M1 file, clipboard, and M2 destination locally; no keys were uploaded or workflows run.' -ErrorAction Continue
    exit 1
} finally {
    try { Set-Clipboard -Value ' ' } catch { }
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($secure -is [Security.SecureString]) { $secure.Dispose() }
    if ($newSecure -is [Security.SecureString]) { $newSecure.Dispose() }
    $keys.Clear(); $callbacks.Clear()
    $prepared = $null; $bindings = $null; $callback = $null; $json = $null; $clipboardValue = $null
    Remove-Item Function:Read-PreparedBindings -ErrorAction SilentlyContinue
}

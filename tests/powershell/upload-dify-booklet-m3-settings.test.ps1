param([ValidateSet('','duplicate','missing')][string]$InvalidCase='')

$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../../scripts/upload-dify-booklet-m3-settings.ps1'
$parseErrors = $null
[void][Management.Automation.Language.Parser]::ParseFile($helper, [ref]$null, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Uploader syntax failed.' }

$global:UploadTest = @{ profile='m3'; reads=0; imports=0; uploads=0; exports=0; outputExists=$false; saved=$null }
function Slots([int]$count) {
    $items = @(@{ role='manager'; taskId=$null; persona=$null })
    $items += 1..11 | ForEach-Object { @{ role='specialist'; taskId=('J{0:D2}' -f $_); persona=$null } }
    if ($count -ge 17) { $items += @{ role='specialist'; taskId='J12'; persona=$null } }
    if ($count -eq 18) { $items += @{ role='judge'; taskId=$null; persona=$null } }
    $items += @('playful_kid','enthusiast_parent','professional_creator') | ForEach-Object { @{ role='tester'; taskId=$null; persona=$_ } }
    $items += @{ role='image'; taskId=$null; persona=$null }
    return ,$items
}
function Bindings([int]$count) {
    $items = Slots $count
    $bindings = @()
    for ($index=0; $index -lt $items.Count; $index++) {
        $bindings += @{ role=$items[$index].role; taskId=$items[$index].taskId; persona=$items[$index].persona;
            appId=('00000000-0000-4000-8000-{0:D12}' -f ($index + 1)); apiKey="app-synthetic-$index" }
    }
    return ,$bindings
}
function Publications([object[]]$bindings) {
    return @($bindings | ForEach-Object { @{ appId=$_.appId; publishedWorkflowId='00000000-0000-4000-8000-000000000099';
        hash=('a'*64); types=@('start','code','end') } })
}
function Test-Path { param($LiteralPath, $PathType)
    if ($LiteralPath -eq 'synthetic-publications.json') { return $true }
    if ($LiteralPath -like '*settings.dpapi.xml') { return $global:UploadTest.outputExists }
    if ($LiteralPath -like '*bindings.dpapi.xml') { return $true }
    throw 'Unexpected path.'
}
function Get-Content { param($LiteralPath, [switch]$Raw)
    if ($LiteralPath -ne 'synthetic-publications.json') { throw 'Unexpected manifest path.' }
    $global:UploadTest.reads++
    $bindings = Bindings $(switch ($global:UploadTest.profile) { 'm3-j13' { 18 }; 'm3-j12' { 17 }; default { 16 } })
    $publications = @(Publications $bindings)
    return ConvertTo-Json -InputObject $publications -Depth 10 -Compress
}
function Import-Clixml { param($LiteralPath)
    $global:UploadTest.imports++
    if ($LiteralPath -like '*settings.dpapi.xml') { return ConvertTo-SecureString $global:UploadTest.saved -AsPlainText -Force }
    $count = switch ($global:UploadTest.profile) { 'm3-j13' { 18 }; 'm3-j12' { 17 }; default { 16 } }
    $bindings = Bindings $count
    if ($InvalidCase -eq 'duplicate') { $bindings[-1].appId = $bindings[0].appId }
    if ($InvalidCase -eq 'missing') { $bindings = @($bindings | Select-Object -SkipLast 1) }
    $json = ConvertTo-Json -InputObject @{ callbackKey=('synthetic-callback-'*3); bindings=$bindings } -Depth 10 -Compress
    return ConvertTo-SecureString $json -AsPlainText -Force
}
function Export-Clixml { param([Parameter(ValueFromPipeline)]$InputObject, $LiteralPath, [switch]$NoClobber)
    process {
        if (-not $NoClobber -or $global:UploadTest.outputExists -or $LiteralPath -notlike '*settings.dpapi.xml') { throw 'Unsafe export.' }
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($InputObject)
        try { $global:UploadTest.saved = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $global:UploadTest.exports++
        $global:UploadTest.outputExists = $true
    }
}
function gh { process { $global:UploadTest.uploads++; $global:LASTEXITCODE = 0 } }

try {
    if ($InvalidCase) {
        $global:UploadTest.profile = 'm3-j13'
        & $helper -PublicationsPath 'synthetic-publications.json' -Profile m3-j13 -Apply
        throw 'Invalid source was accepted.'
    }
    foreach ($profile in @('m3','m3-j12','m3-j13')) {
        $global:UploadTest.profile = $profile
        $global:UploadTest.outputExists = $false
        $global:UploadTest.saved = $null
        $before = $global:UploadTest.imports
        $exportsBefore = $global:UploadTest.exports
        & $helper -PublicationsPath 'synthetic-publications.json' -Profile $profile
        if ($global:UploadTest.imports -ne $before -or $global:UploadTest.exports -ne $exportsBefore) { throw 'Preview accessed private source or output.' }
        & $helper -PublicationsPath 'synthetic-publications.json' -Profile $profile -Apply
        $saved = $global:UploadTest.saved | ConvertFrom-Json
        $bindings = $saved.DIFY_BOOKLET_BINDINGS_JSON | ConvertFrom-Json
        $expected = switch ($profile) { 'm3-j13' { 18 }; 'm3-j12' { 17 }; default { 16 } }
        if (@($bindings).Count -ne $expected -or $saved.DIFY_BOOKLET_BASE_URL -cne 'https://dify.uniwares.co.uk' -or
            $saved.DIFY_BOOKLET_PUBLIC_ORIGIN -cne 'https://booklet-staging.uniwares.co.uk') { throw 'Saved bundle is not exact.' }
        if ($profile -eq 'm3-j12' -and @($bindings | Where-Object { $_.taskId -ceq 'J12' }).Count -ne 1) { throw 'J12 slot missing.' }
        $flags = @($bindings | Where-Object { $_.PSObject.Properties.Name -ccontains 'finalPageIllustration' })
        if ($profile -eq 'm3-j13') {
            if (@($bindings | Where-Object { $_.role -ceq 'judge' }).Count -ne 1 -or
                @($bindings | Where-Object { $_.taskId -ceq 'J12' }).Count -ne 1 -or
                $flags.Count -ne 1 -or $flags[0].role -cne 'image' -or $flags[0].finalPageIllustration -ne $true) { throw 'Final profile is not exact.' }
        } elseif ($flags.Count) { throw 'Legacy profile acquired a final-page flag.' }
        $exportCount = $global:UploadTest.exports
        & $helper -PublicationsPath 'synthetic-publications.json' -Profile $profile -Apply
        if ($global:UploadTest.exports -ne $exportCount) { throw 'Existing encrypted settings were overwritten.' }
    }
    foreach ($case in @('duplicate','missing')) {
        $prior = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -InvalidCase $case 2>&1 }
        finally { $ErrorActionPreference = $prior }
        if ($LASTEXITCODE -eq 0 -or @($output | Where-Object { "$_" -match 'app-synthetic|synthetic-callback' }).Count) { throw "Invalid $case source did not stop safely." }
    }
    'PASS: uploader syntax, 16/17/18 preview, exact bindings/image flag, fixed origins, no overwrite and malformed final-source rejection.'
} finally {
    Remove-Variable UploadTest -Scope Global -ErrorAction SilentlyContinue
    foreach ($name in 'Slots','Bindings','Publications','Test-Path','Get-Content','Import-Clixml','Export-Clixml','gh') {
        Remove-Item "Function:$name" -ErrorAction SilentlyContinue
    }
}

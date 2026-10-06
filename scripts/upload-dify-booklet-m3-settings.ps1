param(
    [Parameter(Mandatory=$true)][string]$PublicationsPath,
    [ValidateSet('m3','m3-j12','m3-j13')][string]$Profile='m3',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$profileSuffix = $Profile
$expectedCount = switch ($Profile) { 'm3-j13' { 18 }; 'm3-j12' { 17 }; default { 16 } }
$sourcePath = Join-Path $env:LOCALAPPDATA "DifyWf-Community-Codex/issue65-$profileSuffix-bindings.dpapi.xml"
$outputPath = Join-Path $env:LOCALAPPDATA "DifyWf-Community-Codex/issue65-$profileSuffix-settings.dpapi.xml"
$uuid = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$allowedTypes = @('start','code','http-request','if-else','list-operator','end')
$expectedSlots = @('manager::','image::','tester::playful_kid','tester::enthusiast_parent','tester::professional_creator') +
    @(1..11 | ForEach-Object { 'specialist:J{0:D2}:' -f $_ })
if ($Profile -in @('m3-j12','m3-j13')) { $expectedSlots += 'specialist:J12:' }
if ($Profile -eq 'm3-j13') { $expectedSlots += 'judge::' }
$step = 'validate publication manifest'
$sourceSecret = $null
$outputSecret = $null
$existingSecret = $null
$pointer = [IntPtr]::Zero
$existingPointer = [IntPtr]::Zero
$prepared = $null
$publications = $null
$bindings = $null
$sourceBindings = $null
$slots = $null
$apps = $null
$keys = $null
$settings = $null
$settingsJson = $null
$bindingsJson = $null
try {
    if (-not (Test-Path -LiteralPath $PublicationsPath -PathType Leaf)) { throw 'Missing publication manifest.' }
    [object[]]$publications = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $PublicationsPath -Raw)
    if ($publications.Count -ne $expectedCount) { throw 'Unexpected publication count.' }
    $byApp = @{}
    foreach ($publication in $publications) {
        $names = @($publication.PSObject.Properties.Name)
        if (@(Compare-Object @('appId','publishedWorkflowId','hash','types') $names).Count -ne 0) { throw 'Invalid publication fields.' }
        if ([string]$publication.appId -cnotmatch $uuid -or [string]$publication.publishedWorkflowId -cnotmatch $uuid -or
            [string]$publication.hash -cnotmatch '^[0-9a-f]{64}$') { throw 'Invalid publication identifier or hash.' }
        if ($byApp.ContainsKey([string]$publication.appId)) { throw 'Duplicate publication app.' }
        [object[]]$types = $publication.types
        if ($types.Count -eq 0) { throw 'Empty workflow node types.' }
        foreach ($type in $types) {
            if ($type -isnot [string] -or $allowedTypes -cnotcontains $type) { throw 'Unsupported workflow node type.' }
        }
        $byApp.Add([string]$publication.appId, $publication)
    }
    if (-not $Apply) {
        Write-Host "Preview: $expectedCount model-free publications validated for $Profile. Apply will bind private keys and upload one GitHub Actions secret."
        Write-Host 'No private file read, network request, file write, workflow dispatch, host change or Dify execution.'
        return
    }

    $step = 'validate private M3 source and destination'
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is unavailable.' }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw 'Encrypted profile bindings are missing.' }
    $sourceSecret = Import-Clixml -LiteralPath $sourcePath
    if ($sourceSecret -isnot [Security.SecureString]) { throw 'Invalid encrypted profile source.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sourceSecret)
    $prepared = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json
    if (@($prepared.PSObject.Properties.Name | Where-Object { $_ -cnotin @('callbackKey','bindings') }).Count -ne 0) { throw 'Invalid profile source fields.' }
    if ([string]$prepared.callbackKey -cnotmatch '^\S{32,}$') { throw 'Invalid callback key.' }
    [object[]]$sourceBindings = $prepared.bindings
    if ($sourceBindings.Count -ne $expectedCount) { throw 'Unexpected private binding count.' }
    $slots = @{}
    $apps = @{}
    $keys = @{}
    $bindings = @()
    foreach ($item in $sourceBindings) {
        $names = @($item.PSObject.Properties.Name)
        if (@(Compare-Object @('appId','role','taskId','persona','apiKey') $names).Count -ne 0) { throw 'Invalid profile binding fields.' }
        foreach ($nullableField in @('taskId','persona')) {
            if ($null -ne $item.$nullableField -and
                ($item.$nullableField -isnot [string] -or [string]::IsNullOrEmpty($item.$nullableField))) {
                throw 'Nullable binding fields require null or a nonempty string.'
            }
        }
        $role = [string]$item.role
        $task = if ($null -eq $item.taskId) { '' } else { [string]$item.taskId }
        $persona = if ($null -eq $item.persona) { '' } else { [string]$item.persona }
        $slot = '{0}:{1}:{2}' -f $role,$task,$persona
        if ($expectedSlots -cnotcontains $slot -or $slots.ContainsKey($slot)) { throw 'Invalid or duplicate binding slot.' }
        if ([string]$item.appId -cnotmatch $uuid -or $apps.ContainsKey([string]$item.appId) -or
            -not $byApp.ContainsKey([string]$item.appId)) { throw 'Invalid, duplicate or unpublished binding app.' }
        if ([string]$item.apiKey -cnotmatch '^app-[A-Za-z0-9_-]+$' -or $keys.ContainsKey([string]$item.apiKey)) { throw 'Invalid or duplicate app key.' }
        $slots.Add($slot, $true)
        $apps.Add([string]$item.appId, $true)
        $keys.Add([string]$item.apiKey, $true)
        $publication = $byApp[[string]$item.appId]
        $binding = [ordered]@{
            appId=[string]$item.appId; role=$role; taskId=$item.taskId; persona=$item.persona
            apiKey=[string]$item.apiKey; publishedWorkflowId=[string]$publication.publishedWorkflowId; toolProviderId=$null
        }
        if ($Profile -eq 'm3-j13' -and $role -ceq 'image') { $binding.finalPageIllustration = $true }
        $bindings += $binding
    }
    if ($slots.Count -ne $expectedCount -or $apps.Count -ne $byApp.Count) { throw 'Incomplete profile bindings.' }
    $step = 'save encrypted runner settings'
    $bindingsJson = ConvertTo-Json -InputObject @($bindings) -Depth 10 -Compress
    $settings = [ordered]@{
        DIFY_BOOKLET_RUNNER_ENABLED='true'
        DIFY_BOOKLET_BASE_URL='https://dify.uniwares.co.uk'
        DIFY_BOOKLET_PUBLIC_ORIGIN='https://booklet-staging.uniwares.co.uk'
        DIFY_BOOKLET_TOOL_KEY=[string]$prepared.callbackKey
        DIFY_BOOKLET_BINDINGS_JSON=$bindingsJson
    }
    $settingsJson = ConvertTo-Json -InputObject $settings -Depth 10 -Compress
    if (Test-Path -LiteralPath $outputPath) {
        $step = 'validate existing encrypted settings'
        $existingSecret = Import-Clixml -LiteralPath $outputPath
        if ($existingSecret -isnot [Security.SecureString]) { throw 'Invalid existing encrypted settings.' }
        $existingPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($existingSecret)
        $existingJson = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($existingPointer)
        if (-not [string]::Equals($existingJson, $settingsJson, [StringComparison]::Ordinal)) {
            throw 'Existing encrypted settings differ; stop without overwrite.'
        }
        $existingJson = $null
    } else {
        $outputSecret = ConvertTo-SecureString $settingsJson -AsPlainText -Force
        if (Test-Path -LiteralPath $outputPath) { throw 'Encrypted destination appeared; stop without overwrite.' }
        $outputSecret | Export-Clixml -LiteralPath $outputPath -NoClobber
    }
    $step = 'upload GitHub Actions secret'
    $settingsJson | & gh secret set DIFY_BOOKLET_RUNNER_SETTINGS_JSON --repo karpishe-experiments/agentic-poc 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI upload failed.' }
    Write-Host "PASS: encrypted $Profile settings saved and GitHub Actions secret uploaded."
} catch {
    $safeType = $_.Exception.GetType().Name
    Write-Error "Private $Profile settings upload stopped at $step (type=$safeType). Share only this status; never private content." -ErrorAction Continue
    exit 1
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($existingPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($existingPointer) }
    if ($sourceSecret -is [Security.SecureString]) { $sourceSecret.Dispose() }
    if ($outputSecret -is [Security.SecureString]) { $outputSecret.Dispose() }
    if ($existingSecret -is [Security.SecureString]) { $existingSecret.Dispose() }
    $prepared=$null; $publications=$null; $bindings=$null; $sourceBindings=$null; $slots=$null; $apps=$null; $keys=$null
    $settings=$null; $settingsJson=$null; $bindingsJson=$null; $existingJson=$null
}

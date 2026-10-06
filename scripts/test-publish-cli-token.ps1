$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'publish-cli-token.ps1')

# Dummy credentials only. Replace the prompt and npm process; no registry calls occur.
$script:dummyToken = 'dummy-test-credential-not-a-real-token'
$script:npmExitCode = 0
$script:authExitCode = 0
$script:throwFromNpm = $false
$script:npmCalls = 0
$script:configUsed = $null
$script:expectDryRun = $false
$script:publishCalls = 0

function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if (!$AsSecureString) { throw 'Token prompt must hide input.' }
    return ConvertTo-SecureString $script:dummyToken -AsPlainText -Force
}

function Invoke-SkillSyncNpm {
    param([string[]]$Arguments)
    $script:npmCalls++
    $script:configUsed = $Arguments[[Array]::IndexOf($Arguments, '--userconfig') + 1]
    $contents = [IO.File]::ReadAllText($script:configUsed)
    if ($contents.Contains($script:dummyToken)) { throw 'Credential was persisted to disk.' }
    if (!$contents.Contains('//registry.npmjs.org/:_authToken=${SKILLSYNC_NPM_PUBLISH_TOKEN}')) {
        throw 'Missing registry-scoped credential placeholder.'
    }
    if ($env:SKILLSYNC_NPM_PUBLISH_TOKEN -ne $script:dummyToken) { throw 'Token not available to npm.' }
    if ($Arguments[0] -eq 'whoami') {
        if ($script:expectDryRun) { throw 'Dry run must not authenticate against the registry.' }
        return $script:authExitCode
    }
    if ($Arguments[0] -ne 'publish' -or $Arguments[2] -ne '@skillsync/cli') { throw 'Wrong publish target.' }
    $script:publishCalls++
    if (($Arguments -contains '--dry-run') -ne $script:expectDryRun) { throw 'Wrong dry-run mode.' }
    if ($script:throwFromNpm) { throw 'Simulated process error.' }
    return $script:npmExitCode
}

function Assert-CleanedUp {
    if ($env:SKILLSYNC_NPM_PUBLISH_TOKEN -ne 'previous-dummy-value') { throw 'Prior environment not restored.' }
    if ($env:PATH -ne $script:originalPath) { throw 'PATH not restored.' }
    if ((Get-Location).Path -ne $script:originalLocation) { throw 'Working directory not restored.' }
    if ($script:configUsed -and (Test-Path -LiteralPath $script:configUsed)) { throw 'Temporary config remains.' }
}

$savedToken = $env:SKILLSYNC_NPM_PUBLISH_TOKEN
$script:originalPath = $env:PATH
$script:originalLocation = (Get-Location).Path
try {
    $env:SKILLSYNC_NPM_PUBLISH_TOKEN = 'previous-dummy-value'
    if ((Invoke-SkillSyncTokenPublish) -ne 0) { throw 'Success case failed.' }
    Assert-CleanedUp
    $script:expectDryRun = $true
    if ((Invoke-SkillSyncTokenPublish -DryRun) -ne 0) { throw 'Dry run failed.' }
    Assert-CleanedUp
    $script:expectDryRun = $false
    $script:npmExitCode = 7
    if ((Invoke-SkillSyncTokenPublish) -ne 7) { throw 'npm failure status was lost.' }
    Assert-CleanedUp
    $script:throwFromNpm = $true
    if ((Invoke-SkillSyncTokenPublish) -ne 1) { throw 'Process error not handled.' }
    Assert-CleanedUp
    $script:throwFromNpm = $false
    $script:authExitCode = 9
    $publishCallsBefore = $script:publishCalls
    if ((Invoke-SkillSyncTokenPublish) -ne 9 -or $script:publishCalls -ne $publishCallsBefore) {
        throw 'Invalid authentication must prevent publication and preserve exit status.'
    }
    Assert-CleanedUp
    $npmCallsBefore = $script:npmCalls
    $script:dummyToken = ''
    if ((Invoke-SkillSyncTokenPublish) -ne 1 -or $script:npmCalls -ne $npmCallsBefore) { throw 'Empty token reached npm.' }
    Assert-CleanedUp
    if ($script:npmCalls -ne 8 -or $script:publishCalls -ne 4) { throw 'Unexpected authentication/publication sequence.' }
    Write-Host 'Passed 6 isolated publishing-helper cases (no network or real credentials).'
} finally {
    $env:SKILLSYNC_NPM_PUBLISH_TOKEN = $savedToken
}

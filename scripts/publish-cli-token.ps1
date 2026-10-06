param([switch]$DryRun)

function Invoke-SkillSyncNpm {
    param([string[]]$Arguments)
    # npm supplies its executable path when this helper runs through npm run.
    if ($env:npm_execpath -and (Test-Path -LiteralPath $env:npm_execpath)) {
        & node $env:npm_execpath @Arguments | Out-Host
    } else {
        & npm.cmd @Arguments | Out-Host
    }
    return $LASTEXITCODE
}

function Invoke-SkillSyncTokenPublish {
    param([switch]$DryRun)
    $ErrorActionPreference = 'Stop'
    $workspace = Split-Path -Parent $PSScriptRoot
    $configPath = $null
    $secret = $null
    $plainToken = $null
    $previousToken = $env:SKILLSYNC_NPM_PUBLISH_TOKEN
    $previousPath = $env:PATH
    $exitCode = 1
    Push-Location -LiteralPath $workspace
    try {
        $bundledNode = Join-Path $workspace 'node_modules/node/bin'
        if (Test-Path -LiteralPath (Join-Path $bundledNode 'node.exe')) {
            $env:PATH = $bundledNode + ';' + $env:PATH
        }
        Write-Host 'Use a granular token with publish permission for @skillsync and Bypass 2FA enabled.'
        $secret = Read-Host 'npm publish token (hidden)' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try {
            $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
        if ([string]::IsNullOrWhiteSpace($plainToken) -or $plainToken -match '\s') {
            throw 'Enter a nonempty npm token without spaces or line breaks.'
        }
        $env:SKILLSYNC_NPM_PUBLISH_TOKEN = $plainToken
        $plainToken = $null
        $localDirectory = Join-Path $workspace '.local'
        [IO.Directory]::CreateDirectory($localDirectory) | Out-Null
        $configPath = Join-Path $localDirectory ('npm-publish-' + [Guid]::NewGuid().ToString('N') + '.npmrc')
        # Single-quoted text keeps the placeholder literal. No credential is written to disk.
        $config = @'
registry=https://registry.npmjs.org/
@skillsync:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${SKILLSYNC_NPM_PUBLISH_TOKEN}
'@
        [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
        if (!$DryRun) {
            Write-Host 'Checking the npm account associated with this token:'
            $exitCode = Invoke-SkillSyncNpm -Arguments @('whoami', '--registry', 'https://registry.npmjs.org/', '--userconfig', $configPath)
            if ($exitCode -ne 0) {
                Write-Host 'Token authentication failed; publication was not attempted. Check expiry, IP restrictions, and registry connectivity.'
                return $exitCode
            }
            Write-Host 'Identity confirmed. Publishing also requires account access and token publish permission for @skillsync.'
        }
        $arguments = @('publish', '--workspace', '@skillsync/cli', '--access', 'public', '--registry', 'https://registry.npmjs.org/', '--userconfig', $configPath)
        if ($DryRun) { $arguments += '--dry-run' }
        # Keep npm's diagnostics visible; only the exit code is captured.
        $exitCode = Invoke-SkillSyncNpm -Arguments $arguments
        if ($exitCode -eq 0 -and !$DryRun) {
            Write-Host 'Published @skillsync/cli successfully.'
        } elseif ($exitCode -ne 0) {
            Write-Host 'If npm reports E404 on the publish PUT, confirm skillsync exists as your npm user/organization scope and your account can publish there.'
            Write-Host 'For a first package, the granular token needs publish permission for the @skillsync scope; organization-management access alone is insufficient.'
            Write-Host 'If npm reports E403, check token publish permission, Bypass 2FA, expiry, and your account access to @skillsync.'
        }
    } catch {
        # Never interpolate a caught error that might contain credentials.
        Write-Host 'Publishing could not complete. Check Node/npm availability and retry with a valid granular publish token.'
        $exitCode = 1
    } finally {
        $env:SKILLSYNC_NPM_PUBLISH_TOKEN = $previousToken
        $env:PATH = $previousPath
        $plainToken = $null
        if ($null -ne $secret) { $secret.Dispose() }
        if ($configPath -and (Test-Path -LiteralPath $configPath)) {
            Remove-Item -LiteralPath $configPath -Force
        }
        Pop-Location
    }
    return $exitCode
}

# Dot-sourcing exposes the functions for isolated tests without prompting or publishing.
if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-SkillSyncTokenPublish -DryRun:$DryRun)
}

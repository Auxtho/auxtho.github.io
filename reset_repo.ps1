
<# reset_repo.ps1 — Reset Git history to a clean single-commit snapshot while archiving old history.

Run from repo root:
  powershell -ExecutionPolicy Bypass -File .\reset_repo.ps1

Params (optional):
  -MainBranch main             # target default branch name
  -ArchiveBranch archive/old-main
  -Remote origin
  -SkipBackup                  # skip ZIP backup

#>
param(
  [string]$MainBranch = "main",
  [string]$ArchiveBranch = "archive/old-main",
  [string]$Remote = "origin",
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"

function Run-Git([string]$Args) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "git"
  $psi.Arguments = $Args
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute = $false
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  [void]$p.Start()
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    Write-Error ("git " + $Args + "`n" + $stderr)
  }
  if ($stdout) { Write-Host $stdout.Trim() }
  return $stdout
}

# Preconditions
try { Run-Git "rev-parse --is-inside-work-tree" | Out-Null } catch {
  Write-Error "Not inside a Git repository. Run this from your repo root."
}
$status = Run-Git "status --porcelain"
if ($status.Trim().Length -ne 0) {
  Write-Error "Working tree not clean. Commit or stash your changes, then rerun."
}
# remote
$remotes = Run-Git "remote"
if (-not ($remotes -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $Remote })) {
  Write-Error "Remote '$Remote' not found. Add it first: git remote add $Remote <URL>"
}
Run-Git "fetch $Remote"

# detect remote default
try {
  $default = (Run-Git "symbolic-ref refs/remotes/$Remote/HEAD").Trim()
  if ($default -match "/([^/]+)$") {
    $remoteDefault = $Matches[1]
    if ($remoteDefault -ne $MainBranch) {
      Write-Host "Remote default branch appears to be '$remoteDefault'. Using that instead of '$MainBranch'." -ForegroundColor Yellow
      $MainBranch = $remoteDefault
    }
  }
} catch {}

Run-Git "checkout $MainBranch"
Run-Git "pull --rebase $Remote $MainBranch"

# Backup
if (-not $SkipBackup) {
  $ts = Get-Date -Format "yyyyMMdd_HHmm"
  $zip = Join-Path (Resolve-Path ".") ("../repo_backup_" + $ts + ".zip")
  Write-Host "Creating ZIP backup at: $zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path * -DestinationPath $zip
  Write-Host "Backup created."
}

# Tag
$tagTs = Get-Date -Format "yyyyMMdd-HHmm"
$tag = "stabilize-$tagTs"
Run-Git "tag $tag"
Write-Host "Tagged current HEAD as: $tag"

# Archive branch
$archiveName = $ArchiveBranch
$exists = $false
try { Run-Git "rev-parse --verify $ArchiveBranch" | Out-Null; $exists = $true } catch { $exists = $false }
if ($exists) {
  $archiveName = "$ArchiveBranch-$tagTs"
  Write-Host "Archive branch '$ArchiveBranch' already exists. Using '$archiveName' instead." -ForegroundColor Yellow
}
Run-Git "branch $archiveName"
Write-Host "Archive branch created: $archiveName"

# Orphan new main
Run-Git "checkout --orphan new-main"
Run-Git "rm -r --cached -q ."
Run-Git "add -A"
Run-Git 'commit -m "chore: reset history to stable snapshot (full history kept in '"$archiveName"')"'
Run-Git "branch -M new-main $MainBranch"

# Push
Run-Git "push --force-with-lease $Remote $MainBranch"
Run-Git "push $Remote $archiveName"
Run-Git "push $Remote --tags"

Write-Host "`nAll done 🎉 Main is now a single clean commit." -ForegroundColor Green
Write-Host "Full history preserved in branch: $archiveName"
Write-Host "Tip: going forward, use 'Squash and merge' on PRs to keep main tidy."

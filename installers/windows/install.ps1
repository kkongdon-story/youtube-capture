# YouTube Capture - Windows Auto Installer

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Host.UI.RawUI.WindowTitle = "유튜브 스크립트 캡쳐 설치"

function Write-Title($t) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Cyan
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
}
function Write-Step($t) { Write-Host "> $t" -ForegroundColor Yellow }
function Write-Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Warn($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Write-Err($t)  { Write-Host "  [X]  $t" -ForegroundColor Red }
function Pause-Exit($c = 0) { Write-Host ""; Read-Host "Press Enter to exit"; exit $c }

Write-Title "유튜브 스크립트 캡쳐 설치"
Write-Host "  YouTube video -> Markdown saver (with optional AI cleanup/translation)"
Write-Host ""

# 1. Node.js
Write-Step "Checking Node.js..."
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Err "Node.js is not installed."
  $a = Read-Host "  Open nodejs.org in browser? (y/N)"
  if ($a -match "^[yY]") { Start-Process "https://nodejs.org/ko" }
  Pause-Exit 1
}
Write-Ok ("Node.js found: " + (& node -v))

# 2. Extension ID - fixed via manifest "key" field
Write-Step "Using fixed extension ID"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$extId = "kjdgcjakmgocegklcnkanbpjigfajkal"
Write-Ok "Extension ID: $extId"

# 3. Register Native Messaging host
Write-Step "Registering Native Messaging host..."
$installMjs = Join-Path $scriptDir "..\..\helper\manifest\install.mjs"
& node $installMjs --extension-id $extId
if ($LASTEXITCODE -ne 0) { Write-Err "Helper registration failed"; Pause-Exit 1 }
Write-Ok "Helper registered"

# 4. Ollama
Write-Step "Checking Ollama (free local AI)..."
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
$wantOllama = $false
if ($ollama) {
  Write-Ok "Ollama found"
  $wantOllama = $true
} else {
  Write-Warn "Ollama is not installed."
  Write-Host "  Ollama provides free local AI for:"
  Write-Host "  - Auto-fixing ASR errors in transcripts"
  Write-Host "  - English -> Korean auto-translation"
  Write-Host "  - No subscription, no internet needed"
  $a = Read-Host "  Install Ollama now via winget? (Y/n)"
  if ($a -notmatch "^[nN]") {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
      Write-Host "  Installing via winget (1-3 min)..."
      & winget install --id Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements
      if ($LASTEXITCODE -eq 0) {
        Write-Ok "Ollama installed"
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"
        $wantOllama = $true
      } else {
        Write-Warn "winget install failed. Opening download page."
        Start-Process "https://ollama.com/download/windows"
        $wantOllama = $false
      }
    } else {
      Write-Warn "winget not available. Opening download page."
      Start-Process "https://ollama.com/download/windows"
      $wantOllama = $false
    }
  } else {
    Write-Host "  Skipping Ollama. JS-only cleanup will still work."
  }
}

# 5. Pull model
if ($wantOllama) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if ($ollama) {
    Write-Step "Checking model qwen2.5:3b..."
    $models = & ollama list 2>$null
    if ($models -match "qwen2\.5:3b") {
      Write-Ok "qwen2.5:3b already installed"
    } else {
      Write-Host "  Downloading qwen2.5:3b (~2GB, 5-15 min)..."
      & ollama pull qwen2.5:3b
      if ($LASTEXITCODE -eq 0) { Write-Ok "Model ready" }
      else { Write-Err "Model download failed. Run 'ollama pull qwen2.5:3b' later." }
    }
  }
}

# 6. User folder
Write-Step "Preparing user data folder..."
$userDir = Join-Path $env:USERPROFILE ".youtube-capture"
if (-not (Test-Path $userDir)) { New-Item -ItemType Directory -Path $userDir | Out-Null }
Write-Ok "$userDir ready"

# 7. Done
Write-Title "Installation complete"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Reload '유튜브 스크립트 캡쳐' at chrome://extensions/"
Write-Host "  2. Open extension options -> click 'Check helper/CLI'"
if ($wantOllama) {
  Write-Host "  3. AI Provider: select 'Ollama' -> Save"
}
Write-Host "  4. On any YouTube video, press Ctrl+Shift+S to capture"
Write-Host ""
Write-Host "  Log file: %USERPROFILE%\.youtube-capture\helper.log" -ForegroundColor DarkGray
Write-Host ""
Pause-Exit 0

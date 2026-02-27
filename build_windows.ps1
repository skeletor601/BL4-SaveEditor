Write-Host "=== BL4 AIO Windows Build ===`n"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: python not found in PATH. Install Python 3.11+ and reopen PowerShell." -ForegroundColor Red
  exit 1
}

Write-Host "[1/3] Installing build deps (pyinstaller) if needed..."
python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
  python -m pip install --upgrade pip
  python -m pip install pyinstaller
}

Write-Host "[2/3] Generating spec + building EXE..."
python pyinstaller_config.py

Write-Host "`nIf build succeeded, find the EXE in: dist\BL4_AIO.exe`n"

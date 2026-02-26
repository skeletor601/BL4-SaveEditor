@echo off
setlocal enabledelayedexpansion

echo === NeonVaultV2.69 Windows Build ===
echo.

REM Prefer python from PATH. You can also edit this to point to your venv python.
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: python not found in PATH.
  echo Install Python 3.11+ and reopen this terminal.
  pause
  exit /b 1
)

echo [1/3] Installing build deps (pyinstaller) if needed...
python -c "import PyInstaller" >nul 2>nul
if errorlevel 1 (
  python -m pip install --upgrade pip
  python -m pip install pyinstaller
)

echo [2/3] Generating spec + building EXE...
python pyinstaller_config.py

echo.
echo If build succeeded, find the EXE in: dist\NeonVaultV2.69.exe
echo.
pause

@echo off
setlocal enabledelayedexpansion

echo === NeonVault Windows Build ===
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: python not found in PATH. Install Python 3.11+ and reopen.
  pause
  exit /b 1
)

echo [1/2] Installing PyInstaller if needed...
python -c "import PyInstaller" >nul 2>nul
if errorlevel 1 (
  python -m pip install --upgrade pip
  python -m pip install pyinstaller
)

echo [2/2] Building EXE (build_exe.py)...
python build_exe.py
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo If build succeeded, find the EXE in: dist\NeonVault.exe
echo.
pause

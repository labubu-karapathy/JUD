@echo off
setlocal enabledelayedexpansion
title Jadavpur Love Birds - PyInstaller Executable Builder
cd /d "%~dp0"

echo ==============================================================================
echo    JADAVPUR LOVE BIRDS : ONE-CLICK EXECUTABLE PACKAGER
echo ==============================================================================
echo.

:: Detect Windows Python
set "PYTHON_EXE="

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_EXE=python"
    goto :found_python
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PYTHON_EXE=py -3"
    goto :found_python
)

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    goto :found_python
)

if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    goto :found_python
)

echo [ERROR] Python executable was not found in PATH or standard AppData directories.
pause
exit /b 1

:found_python
chcp 65001 >nul 2>nul
%PYTHON_EXE% build_exe.py %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Build exited with code %ERRORLEVEL%.
    pause
) else (
    echo.
    echo [✓] Build completed successfully!
    pause
)

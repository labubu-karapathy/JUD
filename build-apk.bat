@echo off
setlocal enabledelayedexpansion

echo ==========================================================
echo   Jadavpur Love Birds - Windows 11 Android APK Builder   
echo ==========================================================
cd /d "%~dp0"

echo [*] Building web bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [!] Web build failed!
    exit /b %errorlevel%
)

if not exist "android" (
    echo [-] Android platform folder missing. Initializing...
    call npx cap add android
)

echo [*] Syncing with Capacitor Android...
call npx cap sync android
if %errorlevel% neq 0 (
    echo [!] Capacitor sync failed!
    exit /b %errorlevel%
)

echo [*] Compiling Android APK with Gradle...
cd android
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo [!] Gradle compilation failed!
    echo Ensure JDK 17+ and Android SDK (ANDROID_HOME) are configured in Windows PATH.
    cd /d "%~dp0"
    exit /b %errorlevel%
)
cd /d "%~dp0"

set "SOURCE_APK=android\app\build\outputs\apk\debug\app-debug.apk"
set "TARGET_APK=%~dp0JadavpurLoveBirds.apk"

if exist "%SOURCE_APK%" (
    copy /y "%SOURCE_APK%" "%TARGET_APK%" >nul
    copy /y "%SOURCE_APK%" "%~dp0DatingApp.apk" >nul
    echo.
    echo ================================================================================
    echo SUCCESS: JadavpurLoveBirds.apk is ready in the root folder to send over WhatsApp!
    echo Location: %TARGET_APK%
    echo ================================================================================
) else (
    echo [!] Error: APK output file not found at %SOURCE_APK%
    exit /b 1
)

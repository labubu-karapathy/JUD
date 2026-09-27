# Jadavpur Love Birds - Windows 11 PowerShell APK Automated Builder
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Jadavpur Love Birds - Windows 11 PowerShell APK Builder " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ProjectRoot) { $ProjectRoot = Get-Location }
Set-Location $ProjectRoot

Write-Host "[*] Building web production assets (Vite)..." -ForegroundColor Yellow
npm run build

if (-not (Test-Path "android")) {
    Write-Host "[-] Android native directory not found. Adding platform..." -ForegroundColor Yellow
    npx cap add android
}

Write-Host "[*] Syncing Capacitor Android assets..." -ForegroundColor Yellow
npx cap sync android

Write-Host "[*] Compiling debug APK via Gradle..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\android"
.\gradlew.bat assembleDebug
Set-Location $ProjectRoot

$SourceApk = "$ProjectRoot\android\app\build\outputs\apk\debug\app-debug.apk"
$TargetApk = "$ProjectRoot\JadavpurLoveBirds.apk"

if (Test-Path $SourceApk) {
    Copy-Item -Path $SourceApk -Destination $TargetApk -Force
    Copy-Item -Path $SourceApk -Destination "$ProjectRoot\DatingApp.apk" -Force
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "SUCCESS: JadavpurLoveBirds.apk is ready in the root folder to send over WhatsApp!" -ForegroundColor Green
    Write-Host "Location: $TargetApk" -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Green
} else {
    Write-Error "Gradle build succeeded, but APK output not found at $SourceApk"
}

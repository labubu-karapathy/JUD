#!/usr/bin/env bash
set -e

echo "============================================="
echo "  DatingApp - Android APK Automated Builder   "
echo "============================================="

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# 1. Verify if dist exists; if not, build web project
if [ ! -d "dist" ]; then
  echo "[-] Web dist folder not found. Building web assets..."
  npm run build
else
  echo "[+] Found existing dist folder. Rebuilding latest web bundle..."
  npm run build
fi

# 2. Verify if the android platform folder exists; if not, add it
if [ ! -d "android" ]; then
  echo "[-] Android platform not detected. Adding Android via Capacitor..."
  npx cap add android
fi

# 3. Sync web assets and plugins to native Android project
echo "[*] Syncing web assets with Capacitor Android..."
npx cap sync android

# 4. Ensure executable permissions for Gradle wrapper
echo "[*] Ensuring permissions for Gradle wrapper..."
chmod +x android/gradlew

# 5. Run Gradle assembleDebug
echo "[*] Compiling Android Debug APK via Gradle..."
cd android
./gradlew assembleDebug
cd "$PROJECT_ROOT"

# 6. Copy output APK to root as DatingApp.apk for WhatsApp sharing
APK_SOURCE="android/app/build/outputs/apk/debug/app-debug.apk"
APK_TARGET="$PROJECT_ROOT/DatingApp.apk"

if [ -f "$APK_SOURCE" ]; then
  cp "$APK_SOURCE" "$APK_TARGET"
  echo ""
  echo "======================================================================"
  echo "SUCCESS: DatingApp.apk is ready in the root folder to send over WhatsApp!"
  echo "Location: $APK_TARGET"
  echo "======================================================================"
else
  echo "[!] Error: APK compilation finished but $APK_SOURCE was not found."
  exit 1
fi

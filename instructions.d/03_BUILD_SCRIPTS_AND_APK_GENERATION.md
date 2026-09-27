# 03 - Build Scripts & APK Generation Guide (Windows 11 & Cloud)

## 1. Local Android APK Compilation on Windows 11

We have provided two native Windows scripts so you or any AI agent can build with a single command without needing WSL or bash.

### Option A: PowerShell (Recommended on Windows 11)
Open PowerShell in the project root:
```powershell
.\build-apk.ps1
```

### Option B: Command Prompt / Double-Click
Double-click `build-apk.bat` in File Explorer, or run in `cmd`:
```cmd
build-apk.bat
```

### Option C: npm scripts
```powershell
npm run cap:build
npm run build:apk
```

### What These Scripts Do:
1. Compiles the web project with `npm run build` (outputs to `dist/`).
2. Checks if `android/` directory exists; if missing, runs `npx cap add android`.
3. Runs `npx cap sync android` to copy HTML, JS, CSS, and PWA assets into `android/app/src/main/assets/public`.
4. Executes `android\gradlew.bat assembleDebug`.
5. Copies the output APK:
   From: `android\app\build\outputs\apk\debug\app-debug.apk`
   To: `.\JadavpurLoveBirds.apk` (directly in project root).
6. Prints a success message confirming the file is ready to drag and drop into WhatsApp.

---

## 2. Sharing the APK over WhatsApp (Windows 11)
1. Open **WhatsApp Web** (`web.whatsapp.com`) or the **WhatsApp Windows Native App** from the Microsoft Store.
2. Select your friend or campus group chat.
3. Click the Attachment (+) icon -> **Document**.
4. Select `JadavpurLoveBirds.apk` from the project root folder.
5. Your friend receives the APK, taps to install, and launches the app!

---

## 3. Remote Free APK Compilation via GitHub Actions
If you don't have Android Studio or the Android SDK installed on your Windows 11 PC:
1. Push this repository to GitHub:
   ```powershell
   git remote add origin https://github.com/your-username/jadavpur-love-birds.git
   git push -u origin master
   ```
2. Navigate to your repository in a web browser.
3. Click the **Actions** tab.
4. Select **Build & Package Android APK** in the left sidebar.
5. Click **Run workflow** -> Select `master` (or `main`) -> Click the green **Run workflow** button.
6. In ~3 minutes, the run finishes. Click on the completed run.
7. Under **Artifacts** at the bottom, download `JadavpurLoveBirds-APK` directly to your phone or PC!

---

## 4. Free iOS Deployment (Progressive Web App)
To allow iPhone users to install the app with native standalone fullscreen experience:
1. Import your GitHub repository into [Vercel](https://vercel.com) (free hobby tier).
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
2. Vercel automatically deploys your project to a URL like `https://jadavpur-love-birds.vercel.app`.
3. Send this link to your iPhone friends.
4. When they open it in Safari, the built-in `InstallPwaBanner` prompts them:
   *"Tap Share ⎋ -> Add to Home Screen"*.
5. The app launches with the official bird-heart icon, standalone window, and zero Safari URL bar!

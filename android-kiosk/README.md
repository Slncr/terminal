# Eurodon Kiosk APK

Android WebView wrapper for kiosk usage.

## What it does

- Opens your terminal web app in full-screen (`immersive sticky`)
- Keeps screen awake
- Works as a standalone APK
- Supports plain `http` URLs (for local network servers)

## Configure URL

Edit `app/src/main/res/values/strings.xml`:

- `kiosk_url` — address of your deployed frontend (example: `http://192.168.1.50:8080`)

## Build APK (Android Studio)

1. Open `android-kiosk` directory in Android Studio.
2. Wait for Gradle sync.
3. Build -> Build Bundle(s) / APK(s) -> Build APK(s).
4. Install `app-debug.apk` on tablet.

## Build APK (CLI)

If Gradle is installed:

```bash
cd android-kiosk
gradle :app:assembleDebug
```

APK path:

- `app/build/outputs/apk/debug/app-debug.apk`

## Kiosk tips

- On Android tablet, enable screen pinning (or dedicated kiosk launcher) for stricter lock.
- Set auto-start app in your MDM / device policy if needed.

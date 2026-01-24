# AppMachine

## Introduction

AppMachine is a tiny, opinionated way to ship **native iOS and Android shells** for your web app, without turning your day into a hobby of collecting build tools.

You keep coding the product. GitHub Actions does the boring, repeatable stuff:
- generates the Capacitor native projects from scratch
- injects your app identifier, name, and server URL
- creates icons/splashes from a single logo
- builds Android `.apk` and `.aab`
- pushes iOS shells into `iosdev` / `ios` branches so Xcode Cloud can do signing + TestFlight

If your “build pipeline” starts to feel like a second job, AppMachine is the resignation letter. 🧾✨

---

## What you get

### iOS
- GitHub Action builds a fresh `ios/` shell and pushes it to branch `iosdev` or `ios`
- Xcode Cloud watches those branches and produces TestFlight / App Store builds (your signing stays in Apple’s world)

### Android
- GitHub Action builds **both**:
  - `app-<tag>.apk`
  - `app-<tag>.aab`
- Outputs are uploaded as GitHub Actions artifacts for download

---

## How it works (high level)

1. You keep a ready-to-serve web bundle in `appmachine/assets/www/` (must include `index.html`).
2. On tag push (`iosdev`, `ios`, `androiddev`, `android`), GitHub Actions:
   - installs Capacitor tooling (no need to keep native folders on `main`)
   - copies `appmachine/assets/www/` into `www/`
   - writes `capacitor.config.json` from GitHub Variables
   - generates native projects + assets
3. iOS workflow commits `ios/`, `www/`, and `capacitor.config.json` into a branch matching the tag.
4. Android workflow signs and builds release artifacts, then uploads them.

(See the exact workflows in this repo.) fileciteturn0file1 fileciteturn0file0

---

## Repository layout

```
appmachine/
  assets/
    www/                  # Your web build output (index.html must exist)
    icons/
      logo.png            # 1024x1024 master logo used for Android assets
    ios/
      logo.png            # Optional: custom iOS logo source (if you prefer)
.github/
  workflows/
    ios.yml
    android.yml
```

Notes:
- `main` stays clean: no checked-in `ios/` or `android/` directories required.
- A single logo can drive all icons/splashes.

---

## One-time setup (GitHub)

### 1) Add workflows
Copy these into your repo:
- `.github/workflows/ios.yml`
- `.github/workflows/android.yml`

### 2) Create GitHub Environments
Create two environments (recommended):
- `Development`
- `Production`

### 3) Add GitHub Variables (per environment)
Set these in each environment:

- `APP_SERVER_URL`  
  Example: `https://teamfeedback.com`

- `APP_ID`  
  iOS-style bundle identifier works for both platforms.  
  Example: `dev.teamfeedback.app`

- `APP_NAME`  
  Example: `TF - Development`

### 4) Android signing secrets (per environment)
Android needs a keystore to publish updates. Add these secrets:

- `ANDROID_KEYSTORE_BASE64` (Base64 of your `.jks`)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Tip (macOS): to base64 your keystore:
```sh
base64 -i your-release-key.jks | pbcopy
```

### 5) Xcode Cloud (iOS)
Configure Xcode Cloud to build from branches:
- `iosdev` (Development)
- `ios` (Production)

AppMachine pushes a fresh iOS shell into those branches automatically; Xcode Cloud does the signing and distribution.

---

## Usage (one command, by moving a tag)

You trigger builds by moving tags. The tag name is the “button”.

### iOS Development
```sh
git tag -f iosdev
git push -f origin iosdev
```

### iOS Production
```sh
git tag -f ios
git push -f origin ios
```

### Android Development
```sh
git tag -f androiddev
git push -f origin androiddev
```

### Android Production
```sh
git tag -f android
git push -f origin android
```

That’s it. No local Java. No local Android Studio. No local Xcode setup. Just tags.

---

## Where the builds show up

### Android
Open the GitHub Actions run and download artifacts:
- `android-androiddev` / `android-android`
  - `app-androiddev.apk`
  - `app-androiddev.aab`
  - (or `app-android.apk` / `app-android.aab`)

### iOS
Open Xcode Cloud for the corresponding workflow tied to branch `iosdev` or `ios`.

---

## Common gotchas

- **Your URL must be a real URL** (includes `https://`).  
  The workflow validates it and will fail early if it’s malformed.

- **`appmachine/assets/www/index.html` must exist.**  
  If it’s missing, the iOS workflow will stop.

- **Android keystore must stay stable.**  
  If you change the keystore for the same package identifier, Play Store updates will be rejected.

- **Redirect loops / “opens Safari” on iOS**  
  If your server redirects `example.com -> www.example.com`, ensure the final URL you set in `APP_SERVER_URL` matches what the app should load.

---

## Philosophy

AppMachine is for people who want to:
- spend time shipping features, not worshipping Gradle
- make builds reproducible, boring, and disposable
- keep `main` clean, and generate native shells as artifacts

Enjoy coding. Let robots argue with build tools. 🤖🧰

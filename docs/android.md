# Android Build

Workflows `src/android.yml` and `src/android_keygen.yml` that turn the web app into a signed Android app.

## Usage

1. Set up signing once: [Keystore](#keystore).
2. Push tag `androiddev` or `android` on the branch to build: [build.md](build.md#triggers).
3. Download the `android-release` artifact from the workflow run.
4. Install the `.apk` on a phone for testing, or upload the `.aab` to Google Play.

## Config

| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `APP_SERVER_URL` | URL the app loads | `https://app.example.com` |
| Variable | `APP_ID` | Android package name | `com.company.app` |
| Variable | `APP_NAME` | Visible app name, default `App` | `TeamFeedback` |
| Variable | `APP_VERSION` | Optional marketing version | `1.2.0` |
| Secret | `ANDROID_KEYSTORE_BASE64` | Base64 keystore from the keystore workflow | `BASE64...` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | Keystore and key password | `password123` |

## Keystore

Workflow **Generate Android Keystore**, run by hand once per environment.

- The keystore must never change: Google Play only accepts updates signed with the same key.
- Inputs: `target` (`dev` → `Development`, `prod` → `Production`) and `cn` (certificate Common Name).

1. Set `ANDROID_KEYSTORE_PASSWORD` in the environment first.
2. Run the workflow; it refuses when the password is missing or `ANDROID_KEYSTORE_BASE64` is already set.
3. It makes an RSA 2048 key, alias `release`, valid 10,000 days, and deletes the raw `.jks`.
4. Download the artifact `android-keystore-<target>` (expires in 24 h).
5. Save its Base64 as `ANDROID_KEYSTORE_BASE64` and keep a backup somewhere safe.

## Pipeline

- Runs on `ubuntu-22.04` with Java 21 and the Android SDK.
- Deletes and recreates `android/` on every build.
- Writes the keystore to `android/keystore.jks` and applies a generated `signing.gradle` release config.
- Gradle builds `bundleRelease` (`.aab`) and `assembleRelease` (`.apk`).

## Status

Implemented.

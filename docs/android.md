# AppMachine Android Build Workflow

Build pipeline that turns your webapp into a **signed Android app**.


## How it works
1. Start a build by pushing tag `android` or `androiddev` on the branch you want to build.
2. After workflow completes with success, download the app from workflow artifacts.
3. Install the `.apk` to your Android phone or deploy the `.aab` to Google Play.

The development and production builds only differ in used variables and secrets.
Tag `androiddev` - use the variables of environment `Development`.
Tag `android` - use variables of environment `Production`.

The workflow will output the app in two formats: `.apk` and `.aab`
The `.apk` format is for direct install/testing on devices.
The `.aab` format is for upload to Google Play.



## Setup
1. Run ONCE the generate keystore workflow.
   Only ONCE, because the keystore must stay equal when you deploy updates to your app.
2. Store the keystore workflow result somewhere safe and add it as GitHub Environment
   secrets: `ANDROID_KEYSTORE` (Base64) and `ANDROID_KEYSTORE_PASSWORD`.

---

## Required configuration (GitHub repo)

| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `APP_SERVER_URL` | Base URL where the app loads from | `https://app.example.com` |
| Variable | `APP_ID` | Android App ID (package name) | `com.company.app` |
| Variable | `APP_NAME` | Visible app name | `TeamFeedback` |
| Secret | `ANDROID_KEYSTORE` | Base64 keystore from the keystore workflow | `BASE64...` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | Keystore password used to sign the app | `password123` |

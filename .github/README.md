<p align="center" style="margin-top: 40px;">
  <img src="https://raw.githubusercontent.com/max-matinpalo/appmachine/refs/heads/main/template/icon.png" alt="Project logo" width="160">
</p>
<br>


# AppMachine

**‼️ ATTENTON ‼️:** This package is not ready for mainstream use.  
It’s meant as inspiration for advanced developers who want to automate their own
build pipelines.

**Personal motivation:** a fully automatic build flow for iOS + Android 🤖🧰  
Configure once, one click trigger, download ready signed apps.  
Never again waste time playing with Xcode, AndroidStudio and Capacitor.


## Introduction

AppMachine builds **signed native iOS and Android apps** for web apps.  
It’s built on **Capacitor + GitHub Actions**. You trigger builds by pushing tags.  
You don’t need to install any build tools on your own machine.

## Install
Inside your normal React project:

```bash
npm install appmachine
npx appmachine
```
 Configure build variabels and secrets on github

## Example usage
1. git tag android; git push origin android
2. github server builds app
4. download ready app

Builds are triggered by setting tags (ios, iosdev, android, androiddev).
Because typically we only need to generate new ios/android apps rarely,
only when native features change.


## Base Config
**Check out docs folder for detailed instruction for ios / android configs**

| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `APP_SERVER_URL` | Base URL where the app loads from | `https://app.example.com` |
| Variable | `APP_ID` | iOS Bundle ID (App ID) | `com.company.app` |
| Variable | `APP_NAME` | Visible app name | `ExampleApp` |


## Android Configs
| Type | Name | Description | Example |
|---|---|---|---|
| Secret | `ANDROID_KEYSTORE` | Base64 keystore from the keystore workflow | `BASE64...` |
| Secret | `ANDROID_KEYSTORE_PASSWORD` | Keystore password used to sign the app | `password123` |

## iOS Configs
| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `IOS_TEAM_ID` | Apple Developer Team ID | `A1B2C3D4E5` |
| Secret | `IOS_CERT_BASE64` | Base64 of your **Distribution** `.p12` | `MII...` |
| Secret | `IOS_CERT_PASSWORD` | Password for the `.p12` | `your-password` |
| Secret | `IOS_PROFILE_BASE64` | Base64 of your `.mobileprovision` | `MII...` |


---



## How it works overview
Trigger github action via tags (`iosdev`, `ios`, `androiddev` or`android`).

The development and production builds only differs in used variabels and secrets.  
Tag `iosdev` - use the variables of environment `Development`.  
Tag `ios` - use variables of environment `Production`.

1. **Capacitor setup** (same for iOS and Android)
	- Installs Capacitor tooling
	- Writes `capacitor.config.json` from GitHub Variables
	- Generates native projects + assets with Capacitor
	- Then runs iOS or Android specific signing
2. **Setup signing**
3. **Build**

The easy step 1 is same for ios and android.

At the moment, the build pipeline does **not** build your web app. Instead, it
fetches the web app from a server. This means you must have the app deployed
somewhere (for example Vercel).

The reason: the “genius” way to ship apps is a **minimal native shell** with
**OTA updates** and **offline support** via a service worker 😃

If we want to make this package easier for junior developers, we should add an
optional step to **build the web app during the pipeline** and ship the `dist`
bundle inside the native app. This is very easy to add, and could be controlled
with a workflow option/flag 😃



## Native features

In general, when we want code that runs on all platforms, we should prefer
**Web APIs** whenever possible (camera, files, etc.). If a solid Web API exists,
use it before reaching for native features.

Not everything is available (or reliable) via Web APIs. For those cases, we use
**Capacitor plugins**.

This workflow installs the latest Capacitor packages on the build machine
(`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli`),
so you don’t need to install them in your app.

Example: if you want haptics, just install the plugin in your React project:

```bash
npm install @capacitor/haptics
```


# iOS Build

Workflow `src/ios.yml` that turns the web app into a signed App Store `.ipa`; no local Xcode needed.

## Usage

1. Set the GitHub environment variables and secrets: [Config](#config).
2. Push tag `iosdev` or `ios` on the branch to build: [build.md](build.md#triggers).
3. Download the `ios-build` artifact (`.ipa`) from the workflow run.
4. Upload it with Apple's **Transporter** app: drag and drop the `.ipa`, click upload.

## Config

| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `APP_SERVER_URL` | URL the app loads | `https://app.example.com` |
| Variable | `APP_ID` | iOS Bundle ID | `com.company.app` |
| Variable | `APP_NAME` | Visible app name | `TeamFeedback` |
| Variable | `APP_VERSION` | Optional marketing version | `1.2.0` |
| Variable | `IOS_TEAM_ID` | Apple Developer Team ID | `A1B2C3D4E5` |
| Secret | `IOS_CERT_BASE64` | Base64 of the **Distribution** `.p12` | `MII...` |
| Secret | `IOS_CERT_PASSWORD` | Password of the `.p12` | `your-password` |
| Secret | `IOS_PROFILE_BASE64` | Base64 of the `.mobileprovision` | `MII...` |

## Pipeline

- Runs on `macos-26`, time limit 15 min.
- Keeps a committed `ios/` folder, so `Package.resolved` stays stable; else runs `cap add ios`.
- Imports the certificate into a temporary keychain with a random password.
- Installs the provisioning profile and signs manually with `Apple Distribution`.
- Sets `ITSAppUsesNonExemptEncryption` to `false`.
- Archives the `App` scheme in Release and exports it with method `app-store`.

## Apple setup

### 1. Bundle ID

- Apple Developer → **Certificates, Identifiers & Profiles** → **Identifiers** → `+` → **App IDs**.
- Set it as `APP_ID` (e.g. `com.company.app`).

### 2. App

- App Store Connect → **My Apps** → `+` → **New App**.
- Pick the same Bundle ID.

### 3. Team ID

- Apple Developer → **Membership** shows the team ID.
- Set it as `IOS_TEAM_ID`.

### 4. Distribution certificate

- Create one if missing: [Distribution certificate](#distribution-certificate); needed once a year.
- Set `IOS_CERT_BASE64` from `base64 -i distribution.p12 | pbcopy`.

### 5. Provisioning profile

Ties the App ID to the Distribution certificate.

- Apple Developer → **Profiles** → `+` → **App Store** (distribution).
- Select the App ID and the **Apple Distribution** certificate.
- Download the `.mobileprovision`.
- Set `IOS_PROFILE_BASE64` from `base64 -i Profile.mobileprovision | pbcopy`.

## Distribution certificate

### 1. Create the CSR on a Mac

1. Open **Keychain Access**.
2. **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…**
3. Fill **User Email Address** (Apple ID email) and **Common Name** (e.g. `TeamFeedback Distribution`); leave **CA Email Address** empty.
4. Select **Saved to disk** and **Let me specify key pair information**.
5. Key size **2048 bits**, algorithm **RSA**.
6. Save the `.certSigningRequest` file.

### 2. Create the certificate

1. Apple Developer → **Certificates, Identifiers & Profiles** → **Certificates** → `+`.
2. Choose **Apple Distribution** and upload the CSR.
3. Download the `.cer`.

### 3. Install it

1. Double-click the `.cer`.
2. In **Keychain Access**, find **Apple Distribution: ...** and check it has a private key under it.

### 4. Export as `.p12`

1. Right-click **Apple Distribution: ...** (the item with the private key) → **Export…** → **.p12**.
2. Set an export password (`IOS_CERT_PASSWORD`) and save as `distribution.p12`.

## Status

Implemented.

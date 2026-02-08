# AppMachine iOS Build Workflow

iOS build pipeline that turns your webapp into a **signed iOS `.ipa`** on **GitHub Actions**. No local Xcode needed.


## How it works

1. Setup Github Environemnt **Variables** + **Secrets**.
2. Start a build by pushing tag `iosdev` or `ios`on the branch you want to build.
3. After workflow completes with success, download app from workflow artifacts.
4. Easiest way to upload app to apple is to use apple's **Transporter** app.
   Download it from appstore, just drag & drop your .ipa file there and click upload.

The development and production builds only differs in used variabels and secrets.
Tag `iosdev` - use the variables of environment `Development`.
Tag `ios` - use variables of environment `Production`.

---

## Required configuration (GitHub repo)

| Type | Name | Description | Example |
|---|---|---|---|
| Variable | `APP_SERVER_URL` | Base URL where the app loads from | `https://app.example.com` |
| Variable | `APP_ID` | iOS Bundle ID (App ID) | `com.company.app` |
| Variable | `APP_NAME` | Visible app name | `TeamFeedback` |
| Variable | `IOS_TEAM_ID` | Apple Developer Team ID | `A1B2C3D4E5` |
| Secret | `IOS_CERT_BASE64` | Base64 of your **Distribution** `.p12` | `MII...` |
| Secret | `IOS_CERT_PASSWORD` | Password for the `.p12` | `your-password` |
| Secret | `IOS_PROFILE_BASE64` | Base64 of your `.mobileprovision` | `MII...` |

---

## Apple setup

### 1) Create Bundle ID
Create the bundle identifier you’ll ship as.

- Apple Developer → **Certificates, Identifiers & Profiles**
- **Identifiers** → `+` → **App IDs**
- Set on github env `APP_ID` (example: `com.company.app`)

### 2) Create App
Create the app container in App Store Connect.

- App Store Connect → **My Apps** → `+` → **New App**
- Pick the same **Bundle ID** you created above

### 3) Set IOS_TEAM_ID
- Find your team id under Apple Developer → **Membership**
- Copy it as repo variable `IOS_TEAM_ID` to github


### 4) Distribution certificate
If you don't have one yet, at the end of this document you find instruction how to make. Yes, stupid apple flow. Happily just once per year.

Set github secret: `IOS_CERT_BASE64`
By copying your certificate in base64 with
base64 -i distribution.p12 | pbcopy


### 5) Provisioning profile → `.mobileprovision`
This ties together: **App ID + Distribution certificate**.

- Apple Developer → Profiles → +
- Choose **App Store** (distribution)
- Select your **App ID**
- Select your **Apple Distribution** certificate
- Download the `.mobileprovision`

**Convert to base64 (macOS) and copy to clipboard:**
base64 -i Profile.mobileprovision | pbcopy



## Apple Distribution certificate generation

#### 1. Create the CSR on your Mac (Keychain Access) FIRST
1. Open **Keychain Access**
2. Menu: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…**
3. Fill:
	- **User Email Address**: your Apple ID email
	- **Common Name**: e.g. `TeamFeedback Distribution`
	- **CA Email Address**: leave empty
4. Select:
	- ✅ **Saved to disk**
	- ✅ **Let me specify key pair information**
5. Continue:
	- Key size: **2048 bits**
	- Algorithm: **RSA**
6. Save the `.certSigningRequest` (CSR) file

#### 2. Create the Distribution certificate in Apple Developer (upload the CSR)
1. Apple Developer → **Certificates, Identifiers & Profiles**
2. **Certificates** → `+`
3. Choose **Apple Distribution**
4. Upload the CSR you created above
5. Download the generated certificate (`.cer`)

#### 3. Install the `.cer` into Keychain
1. Double-click the downloaded `.cer`
2. In **Keychain Access**, find **Apple Distribution: ...**
3. Expand it and confirm it has a **private key** under it

#### 4. Export as `.p12`
1. Right-click **Apple Distribution: ...** (the item that includes the private key)
2. **Export…** → choose **.p12**
3. Set an export password
4. Save as `distribution.p12`

#### 5. Convert `.p12` to base64 (macOS) and copy to clipboard
base64 -i distribution.p12 | pbcopy
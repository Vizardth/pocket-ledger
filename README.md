# Pocket Ledger — Android app (Capacitor)

Your personal finance tracker as a real Android app. Everything is stored inside the app on your phone. Nothing is sent anywhere, except the report you send to Claude when you press **Analyze** (only if you added an API key).

## What you need

- A computer (Windows, Mac or Linux) with about 10 GB free.
- **Android Studio** (free): https://developer.android.com/studio
- **Git** (free): https://git-scm.com and a free **GitHub** account, to keep the code and publish releases.
- A USB cable for your phone *(optional: only for the Run ▶ method; GitHub Releases needs no cable)*.

You do **not** need Node.js or npm. The project is already prepared.

## First install (about 30–60 minutes, mostly downloads)

1. **Install Android Studio** and open it once. Let it finish its setup wizard. It downloads the Android SDK.
2. **Unzip** `pocket-ledger-app.zip` somewhere simple, for example `C:\pocket-ledger-app`.
3. In Android Studio: **File → Open** and pick the **`android`** folder inside `pocket-ledger-app` (not the outer folder).
4. Wait for **Gradle sync** to finish (progress bar at the bottom). The first time it downloads several hundred MB.
**No cable?** Stop here and follow *Installing and updating without a cable* below. Otherwise:

5. **Prepare your phone:**
   - Settings → About phone → tap **Build number** 7 times to unlock Developer options.
   - Settings → System → Developer options → turn on **USB debugging**.
   - Connect the phone by USB and tap **Allow** on the "Allow USB debugging?" prompt.
6. In Android Studio's top bar, choose your phone in the device list, then press the green **Run ▶** button.
7. Pocket Ledger opens on your phone and its icon appears in your app drawer. You can unplug the cable.

Installing this way (through ADB, which the Run button uses) is exempt from Android's developer verification rules.

## Putting the project on GitHub

Do this once, before your first release. Your money data is never part of the project: it lives only on your phone.

### One-time setup on your computer

1. Install **Git** from https://git-scm.com (on Windows, keep the default options).
2. Tell Git who you are (use the email on your GitHub account so commits link to your profile):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```

### Create an empty repository on GitHub

On github.com click **New repository**, name it e.g. `pocket-ledger`, choose **Public** or **Private**, and leave *Add a README*, *.gitignore* and *license* **unchecked** (this project already has its own).

- **Public:** anyone can see the code; you can download release APKs on your phone without logging in.
- **Private:** only you can see it; log into GitHub on your phone to download releases.

### First upload

Open a terminal in the `pocket-ledger-app` folder (the one containing this README), then:

```bash
git init -b main
git status                 # see what will be included
git add .
git status                 # check: no .jks, no .apk, no node_modules
git commit -m "Initial commit: Pocket Ledger Capacitor app"
git remote add origin https://github.com/YOUR-USERNAME/pocket-ledger.git
git push -u origin main
```

The first push opens a browser window to sign in to GitHub. After that, just `git push`.

The `.gitignore` file keeps signing keys, built APKs, data exports and downloaded dependencies out of the repo. Keep your `.jks` key **outside** this folder anyway.

### Saving changes afterwards

```bash
git status                 # what changed
git diff                   # the exact changes
git add .
git commit -m "feat: add weekly review banner"
git push
```

Good habits:

- **One change per commit**, with a short message in the imperative. Common prefixes: `feat:` new feature, `fix:` bug fix, `docs:` README/comments, `chore:` version bumps and housekeeping.
- **Tag each release** so every APK matches an exact version of the code:
  ```bash
  git tag v1.1
  git push --tags
  ```
  Then pick that tag when you create the GitHub Release.
- **Try risky changes on a branch:**
  ```bash
  git switch -c try-something
  # ...work and commit...
  git switch main
  git merge try-something
  ```

Prefer buttons over commands? **GitHub Desktop** (https://desktop.github.com) does the same: *Add existing repository* → *Publish repository*, then *Commit* and *Push* for each change. It respects the same `.gitignore`.

## Installing and updating without a cable (GitHub Releases)

You build the APK on your computer, put it on GitHub, and install it on your phone from there.

### One-time: create your signing key

Android only installs an update if it is signed with the **same key** as the app already on your phone. So create one key and use it forever.

1. In Android Studio (with the `android` folder open): **Build → Generate Signed App Bundle or APK…** → choose **APK** → **Next**.
2. Under *Key store path* click **Create new…**
   - Save it **outside** the project folder, e.g. `Documents/pocket-ledger-key.jks`.
   - Choose a key store password, a key alias (e.g. `pocketledger`) and a key password. Validity: 25 years or more. Fill in at least your name.
3. **Back up the `.jks` file and both passwords** (e.g. Google Drive or a password manager). If you lose them, future versions can't install over the current app.
4. **Never upload the `.jks` file to GitHub**, not even to a private repo. The `.gitignore` in this project already blocks it.

### Each release

1. **Bump the version** in `android/app/build.gradle`:
   - `versionCode` → add 1 each release (1, 2, 3 …).
   - `versionName` → what you'll see, e.g. `"1.1"`.
2. If I gave you updated files, put them in `www/` (same folders), then copy the whole `www` folder's contents into `android/app/src/main/assets/public/` (or run `npx cap sync android`).
3. **Build → Generate Signed App Bundle or APK… → APK**, pick your `.jks` and passwords, choose **release**, then **Create**.
4. The file appears at `android/app/release/app-release.apk` (Android Studio shows a "locate" link when done).
5. On GitHub, open your repo → **Releases → Draft a new release**:
   - Tag: `v1.1` (match `versionName`).
   - Drag `app-release.apk` into the attachments box (rename it to `pocket-ledger-1.1.apk` if you like).
   - **Publish release**.
6. Commit your changed source files to the repo too (not the APK — it's ignored on purpose).

### On your phone

1. Open the release page in Chrome and tap the `.apk` to download it.
2. Open the download. The first time, Android asks to allow Chrome (or Files) to **install unknown apps**. Allow it, go back, tap **Install** (or **Update**).
3. Your entries are kept when updating, because it installs over the existing app.

If your repo is **private**, log into GitHub in Chrome on your phone first, or the download link won't work.

### If you set up a new computer

Copy your `.jks` file onto it, clone the repo, then in the project folder run `npm install` and `npx cap sync android` before opening `android` in Android Studio (the repo doesn't contain `node_modules` or the copied web files). Build with the same `.jks` and updates keep working.

### First install with the debug build

If you installed with the **Run ▶** button first, that copy is signed with Android Studio's debug key, not your release key. Before installing your first release APK: in the app, **Export → Save backup**, uninstall Pocket Ledger, install the release APK, then **Restore from backup**. After that, all updates install normally.

## Keeping your data safe

- The app's data survives clearing Chrome, because it lives inside the app.
- **Uninstalling the app deletes your data.** Use Export → **Save backup** regularly (the app reminds you after 30 days). Save the file to Google Drive or send it to yourself.
- Android's own Google backup may also restore app data on a new phone, if backup is turned on in your phone settings. Don't rely on it alone.

## Features in the app version

- Ledger, Bills (tick off each month), Report with "what you can reduce" hints.
- **Bill reminders:** a notification at 9:00 the day before each unpaid bill is due, and on the day. Turn on in the Bills tab or under Export.
- Export report (.md), CSV, backup and restore. Files open Android's share sheet, so you can save them to Drive or send them to the Claude app.
- **Analyze with Claude** (optional): add your Claude API key under Export → Claude API.

## Project structure

```
pocket-ledger-app/
├── www/                   The app itself (HTML, CSS, JavaScript)
│   ├── index.html         Page skeleton: header, tab bar, containers
│   ├── css/styles.css     All styling (colors, layout, dark mode)
│   ├── cap.js             Bundled Capacitor plugins (generated, don't edit)
│   └── js/
│       ├── main.js        Start-up and button handling
│       ├── config.js      Categories, Claude models, storage keys
│       ├── utils.js       Money, date and text helpers
│       ├── storage.js     Saving and loading data and settings
│       ├── state.js       What the screen is showing right now
│       ├── finance.js     Monthly totals, hints, report and CSV
│       ├── views.js       The four tabs and render()
│       ├── sheets.js      Add/edit forms for entries and bills
│       ├── files.js       Export, backup, restore, copy
│       ├── claude-api.js  "Analyze with Claude"
│       └── reminders.js   Bill reminder notifications
├── src/cap-entry.js       Source for www/cap.js
├── android/               Android Studio project (generated by Capacitor)
├── capacitor.config.ts    App id, name and plugin settings
└── package.json           Capacitor versions
```

## For developers

```
npm install
npx cap sync android     # copy www/ into the Android project after any change
npx cap open android
```

To try the app in a desktop browser, serve the `www` folder (for example `npx serve www`) and open it. It uses browser storage there instead of the app's storage.

Rebuild `www/cap.js` only when adding or upgrading Capacitor plugins:
`npx esbuild src/cap-entry.js --bundle --minify --format=iife --target=chrome90 --outfile=www/cap.js`

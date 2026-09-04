# Google Play submission: Identizen for Android

Everything Play Console asks for, in the order it asks, with the facts checked against the app
(`apps/mobile`) and the index (`apps/index`). Companion to `APP_STORE.md`; the copy is the same
except that "Face ID" becomes "your fingerprint".

Package `com.identizen.app` · Version `0.1.0` · Version codes are assigned by EAS (`autoIncrement`).

## 0. Before you start

| Need | Where |
| --- | --- |
| Developer account ($25 once) | https://play.google.com/console/signup |
| Organization vs personal | Register as an **organization** (Plural Software). Personal accounts created after Nov 2023 must run a closed test with 12 testers for 14 days before they can publish to production; organizations skip that. Organization verification needs a D-U-N-S number and takes a few days: https://support.google.com/googleplay/android-developer/answer/13628312 |
| Play Console | https://play.google.com/console |
| Store assets | `store/screenshots/android-phone/` (regenerate with `node store/screenshots.mjs`): `1-home.png` … `5-settings.png` (1080×2160), `feature-graphic.png` (1024×500), `icon-512.png` |
| Privacy policy URL | https://identizen.com/legal/privacy/ |
| Data deletion URL | https://identizen.com/legal/delete/ |
| Reviewer notes | section 6 below |

## 1. Create the app

Play Console → **Create app** (https://play.google.com/console/u/0/developers/create-new-app)

| Field | Value |
| --- | --- |
| App name | Identizen |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free (this cannot be changed later) |
| Declarations | Tick both: Developer Program Policies and US export laws |

## 2. Set up your app (Dashboard → "Set up your app" checklist)

Every item opens from the Dashboard at `https://play.google.com/console/u/0/developers/<dev-id>/app/<app-id>/app-dashboard`.

**App access**
Select "All or some functionality is restricted" → Add instructions. Name: "No account needed".
Paste:

> Identizen has no accounts or passwords. Tap "Create your identity" to generate one on the phone.
> To see a sign-in, open https://jtmerlin.com on a computer, click "Sign in", "Continue with
> Identizen", and scan the QR code with the app. Full steps are in the review notes.

**Ads** No, the app does not contain ads.

**Content rating** Start questionnaire. Email: your contact. Category: **Utility, Productivity,
Communication, or Other**. Answer **No** to every content question (violence, sexuality, language,
controlled substances, gambling, user interaction, sharing location, purchases). Result: Everyone /
PEGI 3.

**Target audience and content** Age groups: **18 and over** only. "Appeal to children": No.

**News apps** No. **COVID-19 contact tracing** No. **Government apps** No.
**Financial features** None (the app does not provide banking, loans, or payments; jtmerlin.com is
a fictional demo). **Health** None.

**Data safety** (https://support.google.com/googleplay/android-developer/answer/10787469)

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes. Deletion URL: https://identizen.com/legal/delete/ |

Data types (everything not listed: not collected):

| Category → type | Collected | Shared | Ephemeral | Required | Purpose |
| --- | --- | --- | --- | --- | --- |
| Device or other IDs → Device or other IDs | Yes: a public key and a push token generated on the device | No | No | Required | App functionality |
| Personal info → User IDs | Yes, only the optional public handle the person picks in Settings | No | No | Optional | App functionality |
| App activity → Other user-generated content | Yes: the one-line description a site attaches to a request (e.g. "Wire $12,000.00 to Acme Supply Co."), kept so the person can review what they approved | No | No | Required | App functionality |
| App info and performance → Crash logs / Diagnostics | No | | | | |
| Location | No (Bluetooth advertising on Android 12+ uses BLUETOOTH_ADVERTISE, which declares `neverForLocation`) | | | | |

Also Yes to "Data is processed ephemerally" for nothing, and **No** to "Does your app use
third-party SDKs that collect data" (there is no analytics, ads, or crash SDK).

**Advertising ID** No, the app does not use the advertising ID.

**Privacy policy** https://identizen.com/legal/privacy/

## 3. Store listing (Grow → Store presence → Main store listing)

| Field | Value |
| --- | --- |
| App name (30) | Identizen |
| Short description (80) | Your phone is your login. Passwordless sign-in, open source. |
| Full description (4000) | see below |
| App icon | `store/screenshots/android-phone/icon-512.png` (512×512 PNG) |
| Feature graphic | `store/screenshots/android-phone/feature-graphic.png` (1024×500) |
| Phone screenshots | `1-home.png` … `5-settings.png`, in order |
| 7-inch / 10-inch tablet screenshots | Optional; the phone set is accepted |
| App category | Tools |
| Tags | Security, Productivity |
| Contact email | contact@identizen.com |
| Contact website | https://identizen.com |
| External marketing | Yes |

**Full description**

> Identizen turns your phone into your login. There is no password to type, reuse, or leak: a key
> is created on your phone, never leaves it, and signs each sign-in with your fingerprint.
>
> HOW IT WORKS
> • A site that uses Identizen shows a QR code and a two-digit match code. Scan it, check the code,
> approve with your fingerprint. You are in.
> • After the first login from a browser, that browser is paired: the next login arrives on your
> phone as a notification. One tap.
> • On a computer with Bluetooth, the site can find your phone nearby and skip the QR entirely.
>
> SEE WHAT YOU ARE APPROVING
> • Sensitive actions such as a wire transfer show the exact amount and payee on your phone before
> you approve. What you see is what gets signed, so a look-alike site cannot reuse your approval.
>
> YOU HOLD THE KEYS
> • Every site gets a different identifier for you. No email, name, or phone number is shared.
> • See every browser and session that can sign you in, and unpair or sign out from your phone.
> • A 24-word recovery phrase restores your identity on a new phone. Nobody else can.
>
> OPEN SOURCE
> • Identizen is an open-source identity protocol (Apache-2.0). Sites integrate it as a standard
> OpenID Connect provider. The code is at github.com/identizen/platform.
>
> Try it at jtmerlin.com, a demonstration bank built to show Identizen in action.

## 4. Signing and app links

Play App Signing is mandatory for app bundles. Play keeps the **app signing key** and re-signs
what users download; the EAS keystore becomes the **upload key**.

1. Test and release → Setup → **App signing**. Accept the default "Use a Google-generated key".
2. Copy the **App signing key certificate** SHA-256 from that page.
3. Add it to `apps/web/public/.well-known/assetlinks.json` as a second entry in
   `sha256_cert_fingerprints`, keeping the existing upload-key fingerprint so sideloaded builds
   keep working. Deploy the web app. Play links only verify once that file lists the Play key.

## 5. Build and upload

```sh
cd apps/mobile
npx eas build --platform android --profile production      # produces an .aab
```

**First upload is manual.** Google does not accept API uploads until one bundle has been uploaded
through the console. Test and release → Testing → **Internal testing** → Create new release →
upload the `.aab` from the EAS build page → Release name `0.1.0 (N)` → Release notes "First
release." → Save → Review release → Start rollout to Internal testing. Add yourself under Testers
(create an email list) and open the opt-in link on the Galaxy to install from Play.

Later uploads can go through EAS:

1. Create a service account with Play Console access, following
   https://github.com/expo/fyi/blob/main/creating-google-service-account.md. Save the JSON outside
   the repo (for example `~/.eas/identizen-play.json`); never commit it.
2. `eas.json` already has `submit.production.android` pointing at that path with `track:
   "internal"`. Adjust the path if you saved it elsewhere.
3. `npx eas submit --platform android --profile production --latest`

## 6. Review notes

Play has no dedicated reviewer-notes field; the **App access** instructions (section 2) are what
the reviewer reads. If they ask for more, paste this into the same place:

> Identizen is an authenticator: it holds a cryptographic key and approves sign-ins to websites.
> There is no account to create and nothing to log in to inside the app itself.
>
> HOW TO TEST (about two minutes)
> 1. Open the app, tap "Create your identity", write down or skip past the 24 words, and enter
> the three words it asks for. Tap "Register this phone" on the Home tab if it is shown.
> 2. On any computer, open https://jtmerlin.com (a demonstration bank we built for this purpose;
> every account on it is fictional and nothing moves money). Click "Sign in", then "Continue
> with Identizen". A QR code and a two-digit match code appear.
> 3. In the app, tap "Scan a sign-in code" and scan the QR. The app shows the same site and the
> same two-digit code. Tap Approve and confirm with your fingerprint (or PIN). The computer is
> signed in.
> 4. On the computer, choose "Send a wire", enter any amount, and click "Review and approve on
> phone". The phone shows the wire details above the match code. Approve.
> 5. Sign in again on the same computer: the request now arrives on the phone with no QR.
>
> PERMISSIONS
> • Biometrics: approves each sign-in. Falls back to the device PIN.
> • Camera: reads the sign-in QR code only. No photo is taken or stored.
> • Bluetooth (advertise and connect, Android 12+): with "Nearby sign-in" on, the phone advertises
> a rotating 16-byte identifier that only the identity server can resolve, so a nearby computer
> can send the sign-in request without a QR. Nothing identifying is broadcast, the identifier
> changes every 15 minutes, no location permission is requested, and the feature can be turned
> off in Settings.
> • Notifications: deliver sign-in requests. Without permission the app still works; requests
> appear when it is opened.
>
> The protocol and every component are open source: https://github.com/identizen/platform.

## 7. Go to production

1. Test and release → **Production** → Create new release → pick the bundle already uploaded to
   internal testing → Release notes → Review → Start rollout. New apps typically take up to
   seven days to review; updates are usually faster.
2. Countries: Production → Countries/regions → Add all.
3. After approval, put the Play link on the install page and the marketing hero:
   `https://play.google.com/store/apps/details?id=com.identizen.app`.

## 8. Push notifications (separate, not a Play requirement)

Pushed sign-ins reach the Android app only through Firebase Cloud Messaging. Until this is done
the app polls its inbox while open, which works but is not instant.

1. https://console.firebase.google.com → Add project "Identizen" → Add Android app with package
   `com.identizen.app` → download `google-services.json` into `apps/mobile/` and set
   `expo.android.googleServicesFile` to `./google-services.json` in `app.json`.
2. Project settings → Cloud Messaging → enable the Firebase Cloud Messaging API (V1). Project
   settings → Service accounts → Generate new private key.
3. `npx eas credentials --platform android` → Push Notifications: Manage your FCM V1 service
   account key → upload that JSON.
4. Rebuild. Expo's push relay then delivers to Android the same way it does to iOS.

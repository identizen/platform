# App Store submission: Identizen for iOS

Everything App Store Connect asks for, in the order it asks. Paste as written; the facts have
been checked against the app (`apps/mobile`) and the index (`apps/index`).

App Store Connect record: https://appstoreconnect.apple.com/apps/6808322640
Bundle id `com.identizen.app` · Team `V4V4T4UVGC` · Version `0.1.0`

## App Information

| Field | Value |
| --- | --- |
| Name | Identizen |
| Subtitle (30) | Your phone is your login |
| Primary category | Utilities |
| Secondary category | Productivity |
| Content rights | Does not contain, show, or access third-party content |
| Age rating | 4+ (answer **None** to every content question; **No** to unrestricted web access, gambling, contests; **No** to "Made for Kids") |
| Privacy Policy URL | https://identizen.com/legal/privacy/ |
| License agreement | Apple's standard EULA |

## Pricing and Availability

Free. All territories. No in-app purchases.

## Version Information

**Promotional text (170)**

> Passwordless sign-in for the web. Your phone holds the key; sites see a standard login. Approve
> wires and other sensitive actions with the exact details on screen.

**Description**

> Identizen turns your phone into your login. There is no password to type, reuse, or leak: a key
> is created on your phone, never leaves it, and signs each sign-in with Face ID.
>
> HOW IT WORKS
> • A site that uses Identizen shows a QR code and a two-digit match code. Scan it, check the code,
> approve with Face ID. You are in.
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

**Keywords (100)**

> passwordless,login,passkey,authenticator,2FA,MFA,face id,sign in,identity,security,OIDC,phishing

**Support URL** https://identizen.com/contact/
**Marketing URL** https://identizen.com
**Copyright** 2026 Plural Software (or your legal name, matching the developer account)
**What's New** First release.

**Screenshots** `store/screenshots/iphone-6.7/` (1290×2796, required) and `iphone-6.5/`
(1242×2688, optional). Upload in the numbered order. Regenerate with `node store/screenshots.mjs`.

## App Privacy

**Does this app collect data?** Yes. Complete the questionnaire exactly as below; everything else
is "not collected".

| Data type | Collected | Linked to the user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Identifiers → Device ID | Yes (a public key and a push token generated on the device) | No | No | App Functionality |
| Identifiers → User ID | Yes, only if the person chooses a public handle in Settings | Yes | No | App Functionality |
| Other Data | Yes: the short description a site attaches to a request (for example "Wire $12,000.00 to Acme Supply Co.") is kept in the activity history so the person can see what they approved | Yes | No | App Functionality |

Not collected: name, email, phone number, physical address, contacts, photos or videos (the camera
is used only to read a QR code and no image is stored or uploaded), precise or coarse location,
financial or payment information, health, browsing or search history, purchase history, crash or
performance data, product interaction or advertising data. The app contains no analytics,
advertising, or third-party tracking SDKs.

**Privacy nutrition summary you can paste if asked for justification:** "The app generates a
key pair on the device and registers the public key and a push token with the identity index so
that sign-in requests can reach the phone. The private key never leaves the device. There is no
account, no email, and no tracking."

## App Review Information

**Sign-in required?** No. The app has no accounts and no credentials. Leave the demo account fields
empty and select "Sign-in not required".

**Contact information** Your name, phone, and email (the reviewer may call).

**Notes** (paste verbatim, then fill the bracketed bits):

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
> same two-digit code. Tap Approve and confirm with Face ID (or passcode). The computer is
> signed in.
> 4. On the computer, choose "Send a wire", enter any amount, and click "Review and approve on
> phone". The phone shows the wire details above the match code. Approve. The bank shows the
> wire as scheduled.
> 5. Sign in again on the same computer: the request now arrives as a push notification, with
> no QR.
>
> If you only have the phone: open https://jtmerlin.com/login in Safari on the phone, tap
> "Continue with Identizen", then "Open in Identizen" on the page that appears. The approval
> completes in the app and Safari finishes the sign-in when you return to it.
>
> PERMISSIONS
> • Face ID: approves each sign-in. Falls back to the device passcode.
> • Camera: reads the sign-in QR code only. No photo is taken or stored.
> • Bluetooth (peripheral): with the "Nearby sign-in" switch on, the phone advertises a
> rotating 16-byte identifier that only the identity server can resolve, so a nearby computer
> can send the sign-in request without a QR. Nothing identifying is broadcast, the identifier
> changes every 15 minutes, and the feature can be turned off in Settings. This is why the app
> declares the bluetooth-peripheral background mode.
> • Notifications: deliver sign-in requests. Without permission the app still works; requests
> appear when it is opened.
>
> ENCRYPTION
> The app uses encryption only for authentication and digital signatures (Ed25519) and standard
> TLS, which is exempt; ITSAppUsesNonExemptEncryption is set to false in the binary.
>
> The protocol and every component are open source: https://github.com/identizen/platform.
> Support: [your email] · [your phone].

## Export Compliance

`ITSAppUsesNonExemptEncryption` is `false` in the binary, so App Store Connect should not ask. If
it does: **Yes**, the app uses encryption; **Yes**, it qualifies for the exemption because
encryption is limited to authentication, digital signatures, and standard TLS provided by the
operating system. No export documentation is needed.

## Advertising Identifier

**No**, the app does not use the Advertising Identifier (IDFA).

## Release

"Manually release this version" for the first submission, so you control the moment it goes live
after approval. Subsequent versions can be automatic.

## Guidelines worth a second look before you press Submit

- **2.1 App completeness.** The reviewer must be able to complete a sign-in. The jtmerlin.com
  walkthrough above covers it, including a phone-only path.
- **2.5.4 Background modes.** `bluetooth-peripheral` is declared; the notes explain the use and
  the user-facing switch. Keep that paragraph.
- **4.8 Sign in with Apple.** Not applicable: the app does not offer third-party login into
  itself; it is the authenticator.
- **5.1.1 Data collection.** The privacy answers above match what the code sends
  (`apps/mobile/src/identity/identity.ts` `register`: device public key, master public key, BLE
  key, push token, and the fixed label "Identizen app").
- **5.1.2 Data use and sharing.** No sharing with third parties; the Expo push relay only
  carries an opaque challenge id.

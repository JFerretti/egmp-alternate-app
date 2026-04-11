# Play Store Listing — Copyable Text

This file contains the listing copy for Google Play Console. Copy/paste the relevant sections into the Play Console form fields.

---

## App name (max 30 chars)

```
Bluewink
```

---

## Short description (max 80 chars)

```
Unofficial companion app for monitoring your Hyundai or Kia electric vehicle
```

(76 characters)

---

## Full description (max 4000 chars)

```
Bluewink is a free, open-source companion app for monitoring and controlling your Hyundai or Kia electric vehicle. Check your battery, range, and charging status, send remote commands, and watch live charging progress — all from a clean, modern interface.

⚠️ IMPORTANT: Bluewink is an unofficial third-party application. It is NOT affiliated with, endorsed by, sponsored by, or in any way officially connected with Hyundai Motor Company, Kia Corporation, or any of their subsidiaries or affiliates. "Bluelink" and "Kia Connect" are trademarks of their respective owners. You will need a valid Hyundai or Kia connected services account to use this app.

✦ FEATURES

• View battery level, estimated range, and odometer
• See lock state, plug state, and climate status at a glance
• Live charging dashboard — current power, time remaining, and progress to your charge limit
• Remote commands: lock, unlock, start charging, stop charging
• Climate control: warm, cool, defrost, climate off
• Set AC and DC charge limits
• Multi-vehicle support — switch between cars on your account
• Live unit preferences — change distance/temperature units without reconnecting

✦ PRIVACY

• No analytics, no telemetry, no tracking
• No third-party servers — your credentials and vehicle data stay on your device
• Communication only with the official Hyundai/Kia APIs, using your own account
• Open source on GitHub for full transparency

✦ SUPPORTED REGIONS

Hyundai Europe is currently the most fully tested region. Other regions (Hyundai/Kia Canada, USA, India, Australia, Kia Europe) are implemented but require community testing.

✦ SUPPORTED VEHICLES

Designed for Hyundai Motor Group's E-GMP platform vehicles, including:
• Hyundai IONIQ 5 / IONIQ 6
• Kia EV6 / EV9
• Genesis GV60

Other connected Hyundai and Kia EVs may also work.

✦ HOW IT WORKS

For Hyundai Europe, Bluewink uses a refresh token you generate once on a computer (due to a CAPTCHA on Hyundai's official login page). For other regions, you can sign in directly with your username and password. Your credentials are stored in encrypted on-device storage (Android Keystore) and are never transmitted anywhere except to the official Hyundai/Kia APIs.

✦ OPEN SOURCE

Bluewink is fully open source. Source code, issue tracker, and contribution guidelines:
https://github.com/JFerretti/egmp-alternate-app

✦ DISCLAIMER

This app is provided "as is" with no warranty. The author is not responsible for any issues arising from use of this app, including but not limited to vehicle behavior, account suspension by Hyundai or Kia, or data loss. Use at your own risk.
```

---

## What's new (max 500 chars)

```
Initial release of Bluewink. Features:
• Vehicle status (battery, range, charging, locks)
• Remote commands: lock, charging, climate, charge limits
• Live charging dashboard with current power and ETA
• Multi-vehicle switching
• Hyundai Europe authentication via refresh token

This is an unofficial third-party app, not affiliated with Hyundai or Kia.
```

---

## App category

- **Primary:** Auto & Vehicles
- **Tags:** Electric Vehicle, EV Charging, Vehicle Monitor, Car Companion

---

## Content rating

- **Expected:** Everyone (3+)
- Run the IARC questionnaire in Play Console. Answer honestly — this is a utility app with no violence, gambling, user-generated content, etc.

---

## Contact details

- **Email:** _(your contact email)_
- **Website:** https://github.com/JFerretti/egmp-alternate-app
- **Privacy policy URL:** https://jferretti.github.io/egmp-alternate-app/privacy-policy.html

---

## Data Safety form answers

### Data collected
**None.** The app does not collect any data on servers we control.

### Data stored on-device only
You'll need to declare these as "stored on device" in the Data Safety form, even though no third party receives them:

| Data type | Purpose | Optional? |
|-----------|---------|-----------|
| User IDs (Hyundai/Kia username) | Account functionality | No (required to authenticate) |
| Email address (some regions) | Account functionality | No |
| Other authentication info (password, refresh token, vehicle PIN) | Account functionality | No |
| Approximate location | App functionality (vehicle location from Hyundai/Kia API) | Yes (optional) |
| Other vehicle info (VIN, model, charge state) | App functionality | No |

### Data sharing
- **Shared with third parties:** No data is shared with third parties by Bluewink. (Note: data the user enters IS sent to Hyundai/Kia's official API as part of normal app function — this is the user's own account interaction with their own car manufacturer, not third-party sharing in the Play Store sense.)

### Security practices
- ☑ Data is encrypted in transit (HTTPS only)
- ☑ Data is encrypted at rest (Android Keystore via expo-secure-store)
- ☑ Users can request data deletion (uninstall the app or use the in-app "Reset All Data" button)
- ☐ Data is not transferred over an insecure connection
- ☑ Committed to Google Play Families Policy: not applicable (app not for children)

### Independent security review
- Not applicable (small open source project, no formal review)

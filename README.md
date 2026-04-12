# Bluewink

A React Native (Expo) app for monitoring and controlling Hyundai/Kia electric vehicles via the Bluelink/Kia Connect APIs. Built as a mobile app alternative to the [egmp-bluelink-scriptable](https://github.com/andyfase/egmp-bluelink-scriptable) iOS widget, itself an alternative to official apps.

## AI Generated

This app was built entirely with [Claude Code](https://claude.ai/claude-code). The API layer was ported from the original Scriptable widget codebase, with authentication fixes and the React Native UI generated with AI.

## Related Projects

This app builds on work from several projects:

- **[egmp-bluelink-scriptable](https://github.com/andyfase/egmp-bluelink-scriptable)** — The original Scriptable iOS widget this app is ported from. The API layer (`src/api/`) is a direct port of its bluelink region implementations, adapted from Scriptable's APIs (Keychain, Request, etc.) to React Native equivalents (expo-secure-store, fetch).
- **[bluelinky](https://github.com/Hacksore/bluelinky)** — Node.js library for the Bluelink API. Used as a reference for the European authentication flow and API endpoints.
- **[bluelink_refresh_token](https://github.com/RustyDust/bluelink_refresh_token)** — Python tool for generating Hyundai Europe refresh tokens. Used to work around Hyundai's CAPTCHA requirement on their login page.

## Authentication

### Demo mode

To try the app without a real account, enter `DEMO` as the refresh token on the connection screen (Settings → Vehicle & Connection, with manufacturer Hyundai and region Europe). The app loads sample vehicle data (a fictional 2025 IONIQ 5) and all remote commands become no-ops that return mock success responses. Useful for UI development, screenshots, and Play Store review.

### Hyundai Europe

Hyundai EU added a CAPTCHA to their OAuth login page, making in-app credential-based login impossible. Instead, this app uses a **refresh token** approach:

1. Generate a refresh token using the [bluelink_refresh_token](https://github.com/RustyDust/bluelink_refresh_token) Python tool (one-time setup on a computer)
2. Paste the refresh token into the app's Settings screen
3. The app exchanges the refresh token for access tokens via Hyundai's IDP endpoint
4. On subsequent launches, the app uses the cached (and automatically rotated) refresh token

In future this can be simplified by porting the tool to work in react native.

### Kia Europe

Uses WebView-based OAuth — the app opens a login page where you authenticate directly with Kia.

### Other Regions (Canada, USA, India, Australia)

Use direct credential-based login (username/password entered in the app).

## Security: API Client Credentials

This app contains OAuth client credentials (client IDs, client secrets, auth tokens) hardcoded in the source code under `src/api/regions/`. These are the same credentials used by the official Hyundai/Kia mobile apps and are shared across the open-source Bluelink ecosystem ([bluelinky](https://github.com/Hacksore/bluelinky), [hyundai_kia_connect_api](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api), etc.). They were originally extracted from the official apps via reverse engineering and have been public since at least 2021.

**These credentials alone cannot access any vehicle data or send any commands.** The Hyundai/Kia API requires a user-scoped JWT access token for all data and command endpoints. I have verified this by testing the API directly with only client credentials (with and without a real VIN) — all requests are rejected with 400/403 errors. A valid access token can only be obtained through the full login flow (username/password + CAPTCHA, or a valid refresh token), and vehicle commands additionally require a PIN.

User credentials are stored locally on-device using [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) and are only transmitted to the manufacturer's own APIs.

If you discover a security issue, please report it privately via [GitHub's security advisory feature](https://github.com/jferretti/egmp-alternate-app/security/advisories) to allow time for a fix before public disclosure.

## Current Status

### Working & Tested

- Hyundai Europe authentication via refresh token
- Token refresh and automatic rotation
- Vehicle discovery (single and multi-vehicle accounts with selection UI)
- Vehicle status retrieval (battery SOC, range, charging state, lock status, climate, odometer)
- Remote commands: lock, unlock, start charge, stop charge, climate on/off, set charge limit
- Charging status display on home screen (charge rate, ETA, progress to target)
- Live unit preference updates (distance/temperature changes apply without reconnect)
- Auto-reconnect with status loading on app restart
- Secure credential and token storage (expo-secure-store)
- Settings UI with auth-method-aware fields per region
- Reset functionality to clear all cached data

### Not Yet Tested

- Climate temperature accuracy (whether hvacTemp sent with start command is applied by the car)
- Kia Europe WebView OAuth flow
- Non-Europe regions (Canada, USA, India, Australia)
- Token expiry edge cases and long-term refresh token rotation

## Development

```bash
npm install
npx expo start --android   # or --ios
```

Requires an Android emulator or iOS simulator, or a physical device with Expo Go.

## Project Structure

```
app/                    # Expo Router screens
  (tabs)/               # Tab navigator (status, commands, settings)
  auth/                 # OAuth WebView screen (Kia)
  settings.tsx          # Themed settings screen
src/
  api/
    base.ts             # Base Bluelink class (auth, caching, HTTP)
    bluelink.ts         # Region router
    regions/            # Per-region implementations
      europe.ts         # Hyundai (refresh token) + Kia (WebView OAuth)
      canada.ts
      usa.ts / usa-kia.ts
      india.ts
      australia.ts
    types.ts            # API types (tokens, car, status)
  config/types.ts       # Config types, auth method routing
  storage/
    configStore.ts      # User config persistence
    secureStore.ts      # Secure storage adapter
  store/carStore.ts     # Zustand store (connection, commands, state)
```

## Testing

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm test -- --watch
```

Run a specific test file:
```bash
npm test -- __tests__/carStore.test.ts
```

Type-check without emitting:
```bash
npx tsc --noEmit
```

### CI

Pull requests and pushes to `main` are checked automatically via GitHub Actions:
- TypeScript type-checking
- Jest unit tests

## Release Process

### Versioning

Version numbers live in `app.json`:
- `expo.version` — user-visible semantic version (e.g. `1.0.0`)
- `expo.android.versionCode` — managed remotely by EAS (`cli.appVersionSource: "remote"` in `eas.json`), auto-incremented on each build

Bump `expo.version` manually for each release. The `versionCode` increment happens automatically.

### Build profiles (eas.json)

| Profile | Output | Purpose |
|---------|--------|---------|
| `preview` | APK | Sideloadable test build for direct install on a device |
| `internal` | AAB | Internal testing track on Play Store |
| `production` | AAB | Closed/Production track on Play Store |

### Build a Play Store AAB

```bash
eas build --platform android --profile internal
```

### Submit to Play Store

EAS Submit uses a Google Play API service account JSON key (gitignored at `play-service-account.json`):

```bash
eas submit --platform android --profile production
```

This uploads the latest AAB build to Play Console under the "internal" track (configured in `eas.json`). From Play Console, promote internal → closed → production manually.

To rotate the service account key, generate a new one in Google Cloud Console, replace `play-service-account.json`, and the next `eas submit` will use it.

### Privacy policy

The Play Store requires a public privacy policy URL. The policy is in `docs/privacy-policy.md` and is hosted via GitHub Pages at:

https://jferretti.github.io/egmp-alternate-app/privacy-policy.html

To enable GitHub Pages: repo Settings → Pages → Source: Deploy from a branch → Branch: `main` / Folder: `/docs`.

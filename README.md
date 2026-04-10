# egmp-alternate-app

A React Native (Expo) app for monitoring and controlling Hyundai/Kia electric vehicles via the Bluelink/Kia Connect APIs. Built as a mobile app alternative to the [egmp-bluelink-scriptable](https://github.com/andyfase/egmp-bluelink-scriptable) iOS widget.

## AI Generated

This app was built entirely with [Claude Code](https://claude.ai/claude-code). The API layer was ported from the original Scriptable widget codebase, with authentication fixes and the React Native UI generated with AI.

## Related Projects

This app builds on work from several projects:

- **[egmp-bluelink-scriptable](https://github.com/andyfase/egmp-bluelink-scriptable)** — The original Scriptable iOS widget this app is ported from. The API layer (`src/api/`) is a direct port of its bluelink region implementations, adapted from Scriptable's APIs (Keychain, Request, etc.) to React Native equivalents (expo-secure-store, fetch).
- **[bluelinky](https://github.com/Hacksore/bluelinky)** — Node.js library for the Bluelink API. Used as a reference for the European authentication flow and API endpoints.
- **[bluelink_refresh_token](https://github.com/RustyDust/bluelink_refresh_token)** — Python tool for generating Hyundai Europe refresh tokens. Used to work around Hyundai's CAPTCHA requirement on their login page.

## Authentication

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

## Current Status

### Working

- Hyundai Europe authentication via refresh token
- Token refresh and automatic rotation
- Vehicle discovery (single and multi-vehicle accounts with selection UI)
- Vehicle status retrieval (battery SOC, range, charging state, lock status, climate, odometer)
- Secure credential and token storage (expo-secure-store)
- Settings UI with auth-method-aware fields per region
- Reset functionality to clear all cached data

### Not Yet Tested

- Remote commands: lock/unlock, start/stop charge, climate control, charge limit
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

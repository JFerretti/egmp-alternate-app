---
layout: default
title: Privacy Policy
permalink: /privacy-policy.html
---

# BlueWink Privacy Policy

**Effective date:** April 11, 2026
**Last updated:** April 11, 2026

## About BlueWink

BlueWink ("the app", "we", "our") is a free, open-source, third-party companion application for monitoring and controlling Hyundai and Kia electric vehicles. BlueWink is **not affiliated with, endorsed by, sponsored by, or in any way officially connected with Hyundai Motor Company, Kia Corporation, or any of their subsidiaries or affiliates**. "Bluelink" and "Kia Connect" are trademarks of their respective owners.

This privacy policy explains what information BlueWink handles and how it is used.

## Summary

- **We do not collect any personal information.**
- **We do not run any servers or analytics.**
- **All data stays on your device or is sent only to Hyundai/Kia's official APIs using your own account.**

## What data the app handles

To function, BlueWink stores and uses the following data **on your device only**, in encrypted secure storage (Android Keystore via `expo-secure-store`):

| Data | Why | Where it lives |
|------|-----|----------------|
| Hyundai/Kia username and password (some regions) | To authenticate with the official Hyundai/Kia API on your behalf | On-device, encrypted |
| Refresh token / access token | To stay authenticated between sessions | On-device, encrypted |
| Vehicle PIN | Required by the Hyundai/Kia API to authorize remote commands | On-device, encrypted |
| Vehicle ID, VIN, model, year | To identify your car when sending commands | On-device, encrypted |
| Cached vehicle status (battery %, range, lock state, charging status, location) | To display the latest known state and reduce API calls | On-device, encrypted |

## What we transmit and to whom

BlueWink communicates **only with the official Hyundai/Kia API endpoints** for the region you select (for example, `prd.eu-ccapi.hyundai.com` for Hyundai Europe). All communication uses HTTPS.

We do not send your data to any other server. There is no BlueWink backend.

## What we do **not** do

- We do **not** collect, transmit, or store any data on servers we control.
- We do **not** use analytics, crash reporting, or telemetry services.
- We do **not** use advertising libraries or trackers.
- We do **not** sell, share, or rent any data to third parties.
- We do **not** track your location for any purpose other than displaying it in the app (the location data comes from the Hyundai/Kia API in response to your own request).

## Third-party services

The app uses the official Hyundai/Kia connected car APIs (Bluelink / Kia Connect) under your own account. Your relationship with Hyundai or Kia is governed by their respective privacy policies and terms of service.

## Children's privacy

BlueWink is not directed at children under 13 and does not knowingly collect any data from anyone, including children.

## How to delete your data

Because all data is stored on your device, you can delete everything by:

1. Opening BlueWink → Settings → "Reset All Data" (clears tokens, cache, and config), or
2. Uninstalling the app from your device.

There is no data on any server we control, so there is nothing for us to delete on your behalf.

## Open source

BlueWink is open source. You can review the code at:
[https://github.com/JFerretti/egmp-alternate-app](https://github.com/JFerretti/egmp-alternate-app)

## Changes to this policy

If we change this policy in a meaningful way, we will update the "Last updated" date above and publish the new version at the same URL. Continued use of the app after changes constitutes acceptance.

## Contact

For privacy questions or concerns, please open an issue on the GitHub repository:
[https://github.com/JFerretti/egmp-alternate-app/issues](https://github.com/JFerretti/egmp-alternate-app/issues)

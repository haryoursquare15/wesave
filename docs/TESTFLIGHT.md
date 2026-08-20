# Vestara → TestFlight (iOS IPA)

Capacitor is configured (`capacitor.config.ts`, appId `ng.vestara.app`, appName `Vestara`).
An `.ipa` can only be produced on a Mac with Xcode + an Apple Developer account ($99/yr).

## Steps (on a Mac)

1. Export this project to GitHub, then clone/pull it locally.
2. Install and build:
   ```sh
   npm install
   npm run build
   ```
3. Add the iOS platform and sync the web build:
   ```sh
   npx cap add ios
   npx cap sync ios
   ```
4. Open the native project:
   ```sh
   npx cap open ios
   ```
5. In Xcode:
   - Select the **App** target → **Signing & Capabilities** → pick your Team; bundle ID `ng.vestara.app`.
   - Set the version/build number under **General**.
   - Choose destination **Any iOS Device (arm64)**.
   - **Product → Archive**, then **Distribute App → App Store Connect → Upload**.
6. In App Store Connect → **TestFlight**, add internal/external testers once processing finishes.

## After any web change

```sh
npm run build && npx cap sync ios
```
then re-archive in Xcode.

## No Mac?

Use a macOS CI runner (GitHub Actions `macos-latest`, Codemagic, Bitrise). You still need your
Apple Developer account, a distribution certificate and provisioning profile stored as CI secrets.

## Notes

- The app loads the bundled web build from `dist/` (no live-reload server configured).
- If you want the native shell to point at the hosted site instead, add
  `server: { url: 'https://app.vestara.ng', cleartext: false }` to `capacitor.config.ts`
  — but App Review generally prefers bundled assets.

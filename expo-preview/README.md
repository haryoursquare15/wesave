# Vestara Expo Go preview

This folder is a small **Expo Go WebView shell** for the existing Vestara banking website. It loads a deployed `/app`, preserving its current UI, dark theme, and login. It does **not** convert the Vite project into React Native or replace the existing Capacitor configuration.

## Open on your phone

1. Install **Expo Go** on your phone.
2. In a terminal, run `cd expo-preview` and `npm install`.
3. Start the Expo tunnel:

   ```sh
   npm run start:tunnel
   ```

4. Scan the QR code shown in the terminal. On iOS, use the Camera app. If prompted, use the same Expo account in Expo CLI and Expo Go.

By default, the wrapper opens `https://wesave.lovable.app/app`, a URL from the repo's older README. **This may not include changes still waiting to be deployed** from the Vestara design branch. To point it at your latest deployment, replace the address and start with:

```sh
EXPO_PUBLIC_VESTARA_URL=https://your-live-domain.example/app npm run start:tunnel
```

## Limitations

- The banking website must be online; Expo does not bundle or host the Vite site here.
- The wrapper is for interactive visual testing, not a production App Store or Play Store build.
- Native push, biometrics and Capacitor integrations require separate native implementation. Test sign-in and any payment redirects on real devices before considering a release.
- Use a public HTTPS URL only. Never place banking secrets or Supabase service-role keys in `EXPO_PUBLIC_*` values.

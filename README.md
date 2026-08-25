# mysecureos-sdk

Trigger and track MySecureOS emergency activations from any React Native
app. Auth is the same phone-number + OTP flow the MySecureOS mobile app
uses — there's no separate partner API key to provision.

## Install

Not yet published to the npm registry (see [Publishing](#publishing)
below). Until then, install it directly from this repo:

```bash
# From a local checkout
npm install /home/lumkile/Documents/mysecureos/mysecureos-sdk

# Or, once pushed to a git remote
npm install git+https://github.com/<org>/mysecureos-sdk.git
```

Once published, it'll just be:

```bash
npm install mysecureos-sdk
```

## Usage

```ts
import { MySecureOSClient, createExpoSecureStoreAdapter } from 'mysecureos-sdk'
import * as SecureStore from 'expo-secure-store'

const client = new MySecureOSClient({
  baseUrl: 'https://api.mysecureos.co.za',
  // Optional: persist the session across app restarts (Expo apps only).
  // Omit to use in-memory storage, which is lost when the process exits.
  storage: createExpoSecureStoreAdapter(SecureStore),
})

// 1. Collect the end user's phone number and send them a code.
await client.requestOtp('+27821234567')

// 2. They enter the code; this logs them in and persists the session.
await client.verifyOtp('+27821234567', '123456')

// 3. Raise a panic. `orgId`/`userId` are inferred from the session if omitted.
const emergency = await client.activateEmergency({
  location: { lat: -33.9249, lng: 18.4241, accuracy: 12 },
})

// 4. Clear it once the user is safe.
await client.cancelEmergency(emergency.id)
```

### Session persistence

`storage` accepts anything implementing `SessionStorage`
(`getItem`/`setItem`/`deleteItem`). Two adapters ship out of the box:

- `createInMemoryStorage()` — the default; zero dependencies, but the
  session doesn't survive a process restart.
- `createExpoSecureStoreAdapter(SecureStore)` — pass in the
  `expo-secure-store` module yourself; this package never imports it
  directly, so non-Expo React Native apps aren't forced to install it.

### Other methods

- `listActiveEmergencies(orgId)` — active emergencies for an org.
- `emergencyHistory({ orgId, from, to, q? })` — past emergencies in a date range.
- `setActiveEmergencyId` / `getActiveEmergencyId` / `clearActiveEmergencyId` —
  remember which emergency this device raised, so the UI can resume an
  in-progress activation after an app restart (the server stays the
  source of truth; use `listActiveEmergencies` to confirm it's still open).
- `getSession()` / `loadSession()` / `logout()` — inspect or clear the
  current session.

## Development

This is a standalone project (npm, not the MySecureOS monorepo's pnpm
workspace) — it has its own `node_modules` and doesn't depend on anything
outside this directory.

```bash
npm install         # first time only
npm run typecheck   # tsc, no emit
npm run lint        # biome check .
npm test            # vitest run
npm run build       # emits dist/*.js + dist/*.d.ts
```

There's no dev server or watch mode — this is a library, not an app.
While editing, `npm run typecheck` / `npm test` are the fast feedback
loop; run `npm run build` before trying the package from a real
consumer app (it reads `dist/`, not `src/`).

### Trying a local change from a consumer app

Before publishing, the fastest way to test a change end-to-end in
another app (e.g. a React Native project) is `npm link`:

```bash
npm run build
npm link                      # inside mysecureos-sdk
cd /path/to/consumer-app
npm link mysecureos-sdk       # symlinks it in instead of installing
```

Re-run `npm run build` after each change — the consumer app picks up
the new `dist/` output through the symlink automatically.

## Publishing

1. Confirm the name is available: https://www.npmjs.com/package/mysecureos-sdk
   (or pick a scoped name like `@mysecureos/sdk` if you'd rather publish
   under an npm org — that changes `package.json`'s `"name"` and needs
   `--access public` on publish, since scoped packages default to private).
2. Bump `"version"` in `package.json` (semver).
3. `npm run build` — publishing ships `dist/` (see `"files"` in
   `package.json`), not `src/`.
4. `npm login` (once per machine).
5. `npm publish` (add `--access public` only if you switched to a
   scoped name in step 1).

After that, consumers install it the normal way: `npm install
mysecureos-sdk` (or `pnpm add` / `yarn add`).

# mysecureos-sdk

Trigger and track MySecureOS emergency activations from any app, using a
per-org trusted-partner API key. Your own app authenticates its users
itself; the key lets your server activate/clear emergencies directly — no
MySecureOS session or user account involved on this end at all.

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

`MySecureOSPartnerClient` is meant for **your server**, not a
mobile/browser client — treat the API key like any other server secret
(never ship it in an app bundle; see
[mysecureos-sdk-demo-mobile](../mysecureos-sdk-demo-mobile) for an example
of a phone app that talks to its own small backend instead of holding a
key itself).

```ts
import { MySecureOSPartnerClient } from 'mysecureos-sdk'

const partner = new MySecureOSPartnerClient({
  baseUrl: 'https://api.mysecureos.co.za',
  apiKey: process.env.MYSECUREOS_API_KEY!, // from your tenant's Settings > API Keys
})

// Raise a panic on behalf of a user your own system already authenticated.
const emergency = await partner.activateEmergency({
  location: { lat: -33.9249, lng: 18.4241 },
})

// Clearing always requires a reason.
await partner.clearEmergency(emergency.id, 'Confirmed safe by phone')
```

A tenant admin generates/revokes keys from their MySecureOS dashboard's
Settings > API Keys; the plaintext key is shown once, at creation.
`MySecureOSPartnerClient` exposes exactly these two methods — nothing else.

### Device location

`getDeviceLocation` wraps the permission-request + GPS-fix + timeout dance
every mobile integration would otherwise hand-roll itself. It's duck-typed
against `expo-location`'s shape — this package never imports `expo-location`
directly, so pass the module in yourself:

```ts
import * as Location from 'expo-location'
import { getDeviceLocation, MySecureOSPartnerClient } from 'mysecureos-sdk'

// Runs on the phone, inside your app.
const location = await getDeviceLocation(Location) // undefined if denied/timed out — never throws

// Runs on your server — send `location` up from the phone however you like
// (e.g. the same request that reaches your backend's own activate endpoint).
await partner.activateEmergency({ location })
```

Never blocks activation on a bad fix: returns `undefined` (not a throw) if
permission is denied, there's no fix within `timeoutMs` (default 8000), or
anything else goes wrong — pass the result straight into
`activateEmergency({ location })`, which already treats `location` as
optional.

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

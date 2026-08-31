# mysecureos-sdk

Trigger and track MySecureOS emergency activations from your own app, using a
per-org **trusted-partner API key**. Your app authenticates its own users; the
key lets *your server* activate and clear emergencies on their behalf — no
MySecureOS login, session, or user account on your side at all.

---

## How it fits together

The SDK is two layers. You always use the first; the second is optional.

```
┌─────────────────────────┐   your auth    ┌──────────────────────┐   API key    ┌───────────────┐
│  your mobile / web app  │ ─────────────▶ │   your backend       │ ───────────▶ │  MySecureOS   │
│                         │                │                      │              │  API          │
│  mysecureos-sdk/        │                │  mysecureos-sdk      │              │               │
│  react-native (opt-in)  │                │  MySecureOSPartner…  │              │               │
└─────────────────────────┘                └──────────────────────┘              └───────────────┘
         UI + GPS                              holds the API key
```

| Layer | Import | Runs | Purpose |
| --- | --- | --- | --- |
| **Partner client** | `mysecureos-sdk` | your server (Node 18+, Bun, Deno, serverless) | Holds the API key. Activates / clears emergencies. Required. |
| **Panic UI** | `mysecureos-sdk/react-native` | your app (React Native / Expo) | Drop-in SOS screen, or just its state. Optional and opt-in. |

> **The API key is a server secret.** Never ship it in an app bundle or
> browser JS — anyone can extract it. The app talks to *your* backend; only
> your backend talks to MySecureOS. See
> [mysecureos-sdk-demo-mobile](https://github.com/mysecureos/mysecureos-sdk-demo) for a worked
> example.

---

## Install

Not yet on the npm registry (see [Publishing](#publishing)). Until then:

```bash
# From a local checkout
npm install ../mysecureos-sdk

# Or from a git remote
npm install git+https://github.com/mysecureos/mysecureos-sdk.git
```

Once published: `npm install mysecureos-sdk`.

It ships ESM + TypeScript types and has **zero runtime dependencies**.

---

## Server: `MySecureOSPartnerClient`

This runs on **your backend**. Get an API key from the MySecureOS dashboard —
**Settings → API Keys → Generate new key** (the plaintext is shown once, at
creation).

```ts
import { MySecureOSPartnerClient } from 'mysecureos-sdk'

const partner = new MySecureOSPartnerClient({
  baseUrl: 'https://api.mysecureos.co.za',
  apiKey: process.env.MYSECUREOS_API_KEY!, // a server secret
})

// Raise a panic for a user your own system already authenticated.
const emergency = await partner.activateEmergency({
  location: { lat: -33.9249, lng: 18.4241, accuracy: 12 }, // optional
})
console.log(emergency.id, emergency.status) // "…", "pending"

// Clearing always requires a reason. The emergency comes back `status: 'resolved'`.
const cleared = await partner.clearEmergency(emergency.id, 'Confirmed safe by phone')
console.log(cleared.status) // "resolved"
```

### API

| Call | Notes |
| --- | --- |
| `new MySecureOSPartnerClient({ baseUrl, apiKey })` | `baseUrl` must be HTTPS in production. `apiKey` is your `msk_live_…` key. |
| `activateEmergency({ location?, deviceId? })` → `Promise<Emergency>` | `location` is `{ lat, lng, accuracy? }`; omit if you have no fix. `deviceId` is an optional paired-hardware UUID. Returns the created emergency (`status: 'pending'`). |
| `clearEmergency(id, reason)` → `Promise<Emergency>` | Both required; empty `reason` throws before any request. Returns the emergency with `status: 'resolved'` (a partner clear is always a resolution, never a `cancelled` false alarm; a still-`pending` one is auto-acknowledged first). Clearing an already-resolved emergency returns it unchanged. |

Every method rejects with a plain `Error` whose `message` is the API's
message (invalid/revoked key, rate limit, clearing another org's emergency,
…). Wrap calls in `try/catch` — a MySecureOS outage should never crash your
panic flow.

### Under the hood

The client never sends your API key on `activateEmergency` / `clearEmergency`.
The first call exchanges it for a short-lived (10 min) signed SDK token
(`POST /partner/sdk-token`), caches it, and re-mints it just before expiry. A
request that lands exactly as a token dies retries once with a fresh one. Net
effect: the key crosses the wire ~once per 10 minutes, and a leaked SDK token
is useless within minutes. No code needed on your side.

---

## In the app: capturing a location

`getDeviceLocation` wraps the permission → GPS-fix → timeout dance. It's
duck-typed against `expo-location` (never imported by this package — you pass
the module in):

```ts
import * as Location from 'expo-location'
import { getDeviceLocation } from 'mysecureos-sdk'

const location = await getDeviceLocation(Location) // LatLng | undefined
// send `location` to your backend, which calls partner.activateEmergency({ location })
```

Never throws. Returns `undefined` on denied permission, no fix within
`timeoutMs` (default 8000), or any other failure — pass the result straight
into `activateEmergency({ location })`, which treats `location` as optional.

`getDeviceLocation(Location, { timeoutMs?, accuracy? })` — `accuracy` is
passed through to `getCurrentPositionAsync` (e.g. `Location.Accuracy.High`).

---

## In the app: the panic UI (`mysecureos-sdk/react-native`)

**Optional and opt-in.** A separate subpath, so `mysecureos-sdk` on its own
never pulls in React. Use as much or as little as you want:

1. **Turnkey** — `<PanicScreen>`, the real MySecureOS SOS screen.
2. **Customize** — keep the flow, restyle it or swap individual pieces.
3. **Headless** — `usePanic()` gives you the state; you draw 100% of the UI.
4. **None** — ignore this subpath entirely and call your backend by hand.

```bash
npm install mysecureos-sdk expo-location
npm install react-native-webview   # optional — only for the mini-map
```

`react`, `react-native`, `expo-location` and `react-native-webview` are all
**optional peer dependencies**. A server-only consumer installs none of them.

### 1. Turnkey — `<PanicScreen>`

Mirrors `apps/mobile/app/(tabs)/sos.tsx`: identity header, always-on GPS fix +
reverse-geocoded address, the round SOS button, a "Located" card, an optional
mini-map, and the active-emergency card with confirm-to-clear. Out of the box
it renders in the MySecureOS app theme; pass `theme` to re-skin it (see
[Customize](#2-customize--restyle-or-swap-pieces)).

```tsx
import * as Location from 'expo-location'
import { WebView } from 'react-native-webview'
import { PanicScreen } from 'mysecureos-sdk/react-native'

export default function Sos() {
  return (
    <PanicScreen
      location={Location}
      webView={WebView}
      subject={{ name: 'Alex Doe', avatarUrl }}
      backend={{ url: 'https://your-backend.example.com' }}
    />
  )
}
```

`backend` points at **your** server (never a MySecureOS URL). The SDK builds
two `POST`s for you: `${url}/panic` with `{ location }`, and
`${url}/panic/:id/clear` with `{ reason }` — each expected to return the
MySecureOS `Emergency` your backend got from `MySecureOSPartnerClient`.

Nothing is auto-mounted — `<PanicScreen>` renders only where you place it.

#### `<PanicScreen>` props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `backend` | `{ url, activatePath?, clearPath?, headers?, fetch? }` | — | Turnkey wiring. `activatePath` default `/panic`, `clearPath` default `/panic/:id/clear`. |
| `onActivate` | `({ location? }) => Promise<Emergency>` | — | Provide instead of `backend` to write the call yourself. |
| `onClear` | `(id, reason) => Promise<Emergency>` | — | Pairs with `onActivate`. |
| `location` | `expo-location` module | — | Enables the always-on GPS fix + address. Omit to run with no location. |
| `locationIntervalMs` | `number` | `8000` | How often to refresh the fix while idle. |
| `defaultClearReason` | `string` | `"I'm safe"` | Sent when clear happens without an explicit reason. |
| `subject` | `{ name?, avatarUrl?, orgLogoUrl? }` | — | Identity header. `orgLogoUrl` wins over `avatarUrl`. |
| `brandName` | `string` | `"mysecureos"` | Word in "… is protecting you". |
| `webView` | `react-native-webview`'s `WebView` | — | Enables the mini-map. Omit → no map. |
| `confirmSeconds` | `number` | `0` | Countdown (with Cancel) before a press actually sends. `0` = send immediately. |
| `confirmClear` | `boolean` | `true` | Native `Alert` confirmation before clearing. |
| `theme` | `Partial<PanicTheme>` | MySecureOS palette (`panicTheme`) | Partial colour overrides, merged over the defaults (see below). |
| `header` | `ReactNode` | — | Rendered above the identity header. |
| `renderButton` | `({ sending, disabled, onPress, theme }) => ReactNode` | — | Replace the SOS button. |
| `renderActive` | `({ emergency, fix, address, clearing, onClear, theme }) => ReactNode` | — | Replace the whole active-emergency card. |
| `style` / `contentContainerStyle` | `StyleProp<ViewStyle>` | — | Passed to the outer `ScrollView`. |

Want your own calls instead of `backend`:

```tsx
<PanicScreen
  location={Location}
  onActivate={({ location }) => myApi.post('/panic', { location })}
  onClear={(id, reason) => myApi.post(`/panic/${id}/clear`, { reason })}
/>
```

### 2. Customize — restyle or swap pieces

Keep `<PanicScreen>`'s state machine; change only what you want.

**Recolour** with `theme`. By default `<PanicScreen>` renders in the real
MySecureOS app palette (`panicTheme`, mirrored from `apps/mobile`), so a
partner who passes no `theme` gets the genuine MySecureOS look, not a generic
RN starter. Pass a **partial** override and it's merged over those defaults —
every key is a plain colour string:

| Key | Role | Default |
| --- | --- | --- |
| `bg` | page background | `#F4F7FB` |
| `surface` | cards / raised surfaces | `#FFFFFF` |
| `accent` | primary button (the "Clear" button) | `#1B4DB1` |
| `onAccent` | label on accent buttons | `#FFFFFF` |
| `red` | SOS / danger | `#E11D28` |
| `text` | primary text | `#0E1726` |
| `muted` | secondary text | `#5A6B84` |
| `line` | hairline borders | `rgba(14,23,38,0.12)` |
| `card` | subtle fills | `rgba(14,23,38,0.04)` |
| `ok` | the "Located" state | `#1B8F5A` |
| `warn` | the "Locating…" state | `#F5B54A` |

```tsx
// no theme prop → the MySecureOS palette above
<PanicScreen backend={{ url }} />

// partial override → your two colours, MySecureOS defaults for the rest
<PanicScreen backend={{ url }} theme={{ red: '#B4004E', accent: '#00303C' }} />
```

`panicTheme` (the defaults object) and `resolveTheme(override?)` (the merge
helper) are both exported from `mysecureos-sdk/react-native` if you want to
build a theme from the MySecureOS base yourself.

**Swap pieces** with slots — the flow, GPS and error handling stay:

```tsx
<PanicScreen
  backend={{ url }}
  location={Location}
  header={<MyBrandBanner />}
  renderButton={({ sending, onPress }) => (
    <MyBigRedButton busy={sending} onPress={onPress} />
  )}
  renderActive={({ emergency, address, clearing, onClear }) => (
    <MyStatusCard emergency={emergency} address={address} busy={clearing} onClear={onClear} />
  )}
/>
```

`ActivePanicCard` and `MiniMap` are exported too, if you want to reuse them
inside your own layout.

### 3. Headless — `usePanic()`

The hook behind `<PanicScreen>`. Manages the GPS watch and the
activate / clear lifecycle; you render everything.

```tsx
import { usePanic } from 'mysecureos-sdk/react-native'
import { isEmergencyCleared } from 'mysecureos-sdk'

function MyOwnSos() {
  const { active, fix, address, sending, clearing, error, activate, clear, dismiss } =
    usePanic({
      location: Location,
      backend: { url }, // or onActivate / onClear
    })

  if (active && !isEmergencyCleared(active)) {
    return <MyActiveView emergency={active} onClear={() => clear('I am safe')} busy={clearing} />
  }
  return <MyIdleView onSos={activate} sending={sending} error={error} fix={fix} address={address} />
}
```

**Options** — `onActivate` + `onClear`, **or** `backend`; plus optional
`location`, `locationIntervalMs`, `defaultClearReason`. (Passing neither the
handlers nor `backend` throws.)

**Returns**

| Field | Type | |
| --- | --- | --- |
| `active` | `Emergency \| null` | The raised emergency, until `dismiss()`. |
| `fix` | `LatLng \| undefined` | Latest GPS fix. |
| `address` | `string \| null` | Reverse-geocoded street address for `fix`. |
| `sending` / `clearing` | `boolean` | Request in flight. |
| `error` | `string \| null` | Last activate/clear failure message. |
| `activate()` | `() => Promise<void>` | Captures a fix (if `location` given), then raises. |
| `clear(reason?)` | `(reason?) => Promise<void>` | A non-empty reason is always sent. On success `active.status` becomes `'resolved'`. |
| `dismiss()` | `() => void` | Drop a cleared emergency from state. |

### 4. None

Skip `mysecureos-sdk/react-native` entirely, build your own screen, and POST
to your backend by hand. The headless `MySecureOSPartnerClient` on the server
is the whole contract — nothing here is required.

---

## Development

Standalone npm project (not the MySecureOS monorepo's pnpm workspace) — its
own `node_modules`, no dependency on anything outside this directory.

```bash
npm install         # first time only
npm run typecheck   # tsc, no emit
npm run lint        # biome check .
npm test            # vitest run
npm run build       # emits dist/*.js + dist/*.d.ts (+ dist/react-native/*)
```

No dev server — it's a library. `npm run typecheck` / `npm test` are the fast
loop; run `npm run build` before consuming it from a real app (it reads
`dist/`, not `src/`).

### Trying a local change from a consumer app

```bash
npm run build
npm link                      # inside mysecureos-sdk
cd /path/to/consumer-app
npm link mysecureos-sdk
```

Re-run `npm run build` after each change. For a **React Native** consumer,
prefer a pack-install (`npm install ../mysecureos-sdk` with
`install-links=true`) over `npm link` — a symlink makes Metro resolve the
SDK's `react` against *this* repo's copy, causing an "Invalid hook call".

## Publishing

1. Confirm the name: https://www.npmjs.com/package/mysecureos-sdk (or use a
   scoped name like `@mysecureos/sdk` — changes `package.json` `"name"` and
   needs `--access public`).
2. Bump `"version"` (semver).
3. `npm run build` — publishing ships `dist/` (see `"files"`), not `src/`.
4. `npm login` (once per machine).
5. `npm publish` (`--access public` only for a scoped name).

Consumers then `npm install mysecureos-sdk` (or `pnpm add` / `yarn add`), and
the UI is at `mysecureos-sdk/react-native`.

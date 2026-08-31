// Optional React Native UI for the trusted-partner flow. Imported only via the
// "mysecureos-sdk/react-native" subpath, so plain Node/server consumers of the
// default export never need `react` / `react-native` resolvable.
//
// Nothing here holds the API key. The components call `onActivate` / `onClear`,
// which you wire to your own backend (that's where MySecureOSPartnerClient and
// the key live). See the SDK README.
export { usePanic } from './use-panic.js'
export type { UsePanicOptions, UsePanicResult } from './use-panic.js'
export { panicBackend } from './backend.js'
export type { PanicBackendConfig } from './backend.js'
export { PanicScreen } from './panic-screen.js'
export type {
  PanicScreenProps,
  PanicScreenSubject,
  PanicButtonSlotProps,
  PanicActiveSlotProps,
} from './panic-screen.js'
export { ActivePanicCard } from './active-panic-card.js'
export type { ActivePanicCardProps } from './active-panic-card.js'
export { MiniMap } from './mini-map.js'
export type { MiniMapProps, WebViewComponent } from './mini-map.js'
export { panicTheme, resolveTheme } from './theme.js'
export type { PanicTheme } from './theme.js'
export type { PanicLocationModule } from './expo-location.js'
// Re-exported for convenience so a UI consumer doesn't also import the root entry.
export {
  ACTIVE_STATUSES,
  CLEARED_STATUSES,
  isEmergencyCleared,
} from '../types.js'
export type { Emergency, EmergencySubject, LatLng } from '../types.js'

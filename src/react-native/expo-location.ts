import type { DeviceLocationModule } from '../device-location.js'

/**
 * The slice of `expo-location` the panic UI uses. A superset of
 * DeviceLocationModule (permission + current position) with the reverse-geocode
 * call that turns a fix into a street address. Duck-typed for the same reason
 * as device-location.ts: this package never imports `expo-location` itself —
 * the consumer passes the module in.
 *
 *   import * as Location from 'expo-location'
 *   <PanicScreen location={Location} ... />
 */
export interface PanicLocationModule extends DeviceLocationModule {
  reverseGeocodeAsync?(coords: { latitude: number; longitude: number }): Promise<
    Array<{
      name?: string | null
      street?: string | null
      district?: string | null
      city?: string | null
    }>
  >
}

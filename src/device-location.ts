import type { LatLng } from './types.js'

/** Minimal shape of the `expo-location` module — duck-typed so this package
 *  never has to import or resolve `expo-location` itself (same pattern as
 *  storage.ts's ExpoSecureStoreModule). Pass in the module yourself:
 *
 *    import * as Location from 'expo-location'
 *    getDeviceLocation(Location)
 */
export interface DeviceLocationModule {
  requestForegroundPermissionsAsync(): Promise<{ status: string }>
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<{
    coords: { latitude: number; longitude: number; accuracy: number | null }
  }>
}

export interface GetDeviceLocationOptions {
  /** Milliseconds to wait for a GPS fix before giving up. Default 8000. */
  timeoutMs?: number
  /** Passed through as-is to getCurrentPositionAsync — e.g. expo-location's Location.Accuracy.High. */
  accuracy?: number
}

/**
 * Requests permission and captures a best-effort device GPS fix — the
 * permission-request + getCurrentPosition + timeout dance every mobile
 * integration would otherwise have to hand-roll. Never throws: returns
 * undefined on denied permission, a timeout, or any other failure, since
 * raising an emergency must never be blocked by a bad GPS fix — pass the
 * result straight into activateEmergency({ location }).
 */
export async function getDeviceLocation(
  Location: DeviceLocationModule,
  opts: GetDeviceLocationOptions = {},
): Promise<LatLng | undefined> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return undefined
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: opts.accuracy }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), opts.timeoutMs ?? 8000)
      }),
    ])
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
    }
  } catch {
    return undefined
  }
}

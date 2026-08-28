import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Emergency, LatLng } from '../types.js'
import { type PanicBackendConfig, panicBackend } from './backend.js'
import type { PanicLocationModule } from './expo-location.js'

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export interface UsePanicOptions {
  /**
   * Raise the emergency. Wire this to a call to **your own backend**, which
   * holds the trusted-partner API key and calls
   * `MySecureOSPartnerClient.activateEmergency`. The API key must never live in
   * the app — see the SDK README.
   *
   * Optional only because you can pass `backend` instead — provide one or the
   * other.
   */
  onActivate?: (input: { location?: LatLng }) => Promise<Emergency>
  /** Clear the emergency via your backend (`MySecureOSPartnerClient.clearEmergency`). */
  onClear?: (id: string, reason: string) => Promise<Emergency>
  /**
   * Turnkey alternative to `onActivate` / `onClear`: point at your backend's
   * URL and the SDK builds the two `fetch` calls for you. Ignored if
   * `onActivate` and `onClear` are both given.
   */
  backend?: PanicBackendConfig
  /**
   * The `expo-location` module (passed in — never imported by this package).
   * When present, the hook keeps a current GPS fix and street address ready so
   * a panic sends instantly with a location attached. Omit it to run with no
   * location at all.
   */
  location?: PanicLocationModule
  /** How often to refresh the GPS fix while idle. Default 8000ms. */
  locationIntervalMs?: number
  /** Used when `clear()` is called without an explicit reason. Default "I'm safe". */
  defaultClearReason?: string
}

export interface UsePanicResult {
  /** The active emergency, once raised (and until dismissed after it's cleared). */
  active: Emergency | null
  /** Latest GPS fix, or undefined if none yet / no location module. */
  fix: LatLng | undefined
  /** Reverse-geocoded street address for `fix`, when available. */
  address: string | null
  /** True while an activation request is in flight. */
  sending: boolean
  /** True while a clear request is in flight. */
  clearing: boolean
  error: string | null
  /** Raise the emergency (captures a fix first if the module is present). */
  activate: () => Promise<void>
  /** Clear the active emergency. A non-empty reason is always sent. */
  clear: (reason?: string) => Promise<void>
  /** Drop a cleared emergency from state, returning the UI to the button. */
  dismiss: () => void
}

/**
 * Headless state for a MySecureOS panic button: an always-on GPS fix while
 * idle, then activate / clear. This is the logic behind <PanicScreen>; use it
 * directly to build your own UI.
 */
export function usePanic(options: UsePanicOptions): UsePanicResult {
  const {
    onActivate: onActivateProp,
    onClear: onClearProp,
    backend,
    location,
    locationIntervalMs = 8000,
    defaultClearReason = "I'm safe",
  } = options

  // Prefer explicit handlers; fall back to the URL-based ones from `backend`.
  const backendKey = backend
    ? `${backend.url}|${backend.activatePath ?? ''}|${backend.clearPath ?? ''}`
    : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: backendKey captures the config
  const derived = useMemo(() => (backend ? panicBackend(backend) : null), [backendKey])

  const onActivate = onActivateProp ?? derived?.onActivate
  const onClear = onClearProp ?? derived?.onClear
  if (!onActivate || !onClear) {
    throw new Error('usePanic: pass either onActivate + onClear, or backend')
  }

  const [active, setActive] = useState<Emergency | null>(null)
  const [fix, setFix] = useState<LatLng | undefined>(undefined)
  const [address, setAddress] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const latestFix = useRef<LatLng | undefined>(undefined)
  // Keep the callbacks fresh without restarting the GPS loop on every render.
  const activeRef = useRef<Emergency | null>(null)
  activeRef.current = active

  // --- Always-on GPS watch: a fix (and address) ready before any SOS --------
  useEffect(() => {
    if (!location) return
    const mod = location
    let stopped = false
    let granted = false

    async function read() {
      try {
        if (!granted) {
          const { status } = await mod.requestForegroundPermissionsAsync()
          if (status !== 'granted') return
          granted = true
        }
        const pos = await mod.getCurrentPositionAsync()
        if (stopped) return
        const next: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
        }
        latestFix.current = next
        setFix(next)
        if (mod.reverseGeocodeAsync) {
          try {
            const [place] = await mod.reverseGeocodeAsync({
              latitude: next.lat,
              longitude: next.lng,
            })
            if (!stopped && place) {
              const line = [place.name, place.street, place.district, place.city]
                .filter(Boolean)
                .join(', ')
              setAddress(line || null)
            }
          } catch {
            // Geocoding unavailable — the coordinates are shown instead.
          }
        }
      } catch {
        // Transient GPS error — try again on the next tick.
      }
    }

    void read()
    const timer = setInterval(read, locationIntervalMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [location, locationIntervalMs])

  const activate = useCallback(async () => {
    setSending(true)
    setError(null)
    try {
      let loc = latestFix.current
      if (!loc && location) {
        try {
          const { status } = await location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const pos = await location.getCurrentPositionAsync()
            loc = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? undefined,
            }
            latestFix.current = loc
            setFix(loc)
          }
        } catch {
          // Send without a location rather than block the panic on GPS.
        }
      }
      const emergency = await onActivate({ location: loc })
      setActive(emergency)
    } catch (err) {
      setError(message(err, 'Could not send — try again.'))
    } finally {
      setSending(false)
    }
  }, [onActivate, location])

  const clear = useCallback(
    async (reason?: string) => {
      const current = activeRef.current
      if (!current) return
      setClearing(true)
      setError(null)
      try {
        const cleared = await onClear(current.id, reason?.trim() || defaultClearReason)
        setActive(cleared)
      } catch (err) {
        setError(message(err, 'Could not clear — please try again.'))
      } finally {
        setClearing(false)
      }
    },
    [onClear, defaultClearReason],
  )

  const dismiss = useCallback(() => {
    setActive(null)
    setError(null)
  }, [])

  return { active, fix, address, sending, clearing, error, activate, clear, dismiss }
}

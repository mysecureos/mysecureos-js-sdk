// Optional React glue around MySecureOSClient. Imported only via the
// "mysecureos-sdk/react" subpath, so consumers that don't use React (like a
// plain Node script) never need `react` resolvable — see the peerDependency
// note in package.json.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MySecureOSClient, type MySecureOSClientConfig } from './client.js'
import type { Emergency, PanicInput, Session } from './types.js'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export interface UseMySecureOSClientResult {
  client: MySecureOSClient
  /** The persisted session, once loaded. Null before load and while logged out. */
  session: Session | null
  /** True once the persisted session (if any) has finished loading. */
  ready: boolean
}

/**
 * Creates a MySecureOSClient for the lifetime of the component and hydrates
 * its persisted session. `baseUrl`/`storage` identity changes (e.g. a
 * different environment) create a fresh client.
 */
export function useMySecureOSClient(config: MySecureOSClientConfig): UseMySecureOSClientResult {
  const { baseUrl, storage } = config
  const client = useMemo(() => new MySecureOSClient({ baseUrl, storage }), [baseUrl, storage])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    client.loadSession().then((s) => {
      if (!cancelled) {
        setSession(s)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [client])

  return { client, session, ready }
}

export type OtpLoginStep = 'enterPhone' | 'enterCode' | 'needsProfile' | 'done'

export interface UseOtpLoginResult {
  step: OtpLoginStep
  loading: boolean
  error: string | null
  /** The phone number a code was last sent to (set once requestOtp succeeds). */
  phone: string | null
  requestOtp: (phone: string) => Promise<void>
  verifyOtp: (code: string) => Promise<void>
  registerUser: (input: { fullName: string; email: string }) => Promise<void>
  /** Back to the start, e.g. to let the user re-enter their number. */
  reset: () => void
}

/** Drives the phone + OTP login flow (with self-registration) as UI state. */
export function useOtpLogin(client: MySecureOSClient): UseOtpLoginResult {
  const [step, setStep] = useState<OtpLoginStep>('enterPhone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [regToken, setRegToken] = useState<string | null>(null)

  const requestOtp = useCallback(
    async (nextPhone: string) => {
      setLoading(true)
      setError(null)
      try {
        await client.requestOtp(nextPhone)
        setPhone(nextPhone)
        setStep('enterCode')
      } catch (err) {
        setError(errorMessage(err, 'Could not send code'))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!phone) throw new Error('Call requestOtp before verifyOtp')
      setLoading(true)
      setError(null)
      try {
        const result = await client.verifyOtp(phone, code)
        if ('needsProfile' in result) {
          setRegToken(result.regToken)
          setStep('needsProfile')
        } else {
          setStep('done')
        }
      } catch (err) {
        setError(errorMessage(err, 'Invalid code'))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client, phone],
  )

  const registerUser = useCallback(
    async (input: { fullName: string; email: string }) => {
      if (!regToken) throw new Error('No pending registration')
      setLoading(true)
      setError(null)
      try {
        await client.registerUser({ regToken, ...input })
        setStep('done')
      } catch (err) {
        setError(errorMessage(err, 'Could not complete registration'))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client, regToken],
  )

  const reset = useCallback(() => {
    setStep('enterPhone')
    setError(null)
    setPhone(null)
    setRegToken(null)
  }, [])

  return { step, loading, error, phone, requestOtp, verifyOtp, registerUser, reset }
}

export interface UseEmergencyResult {
  /** The emergency this hook most recently activated or cancelled. */
  active: Emergency | null
  loading: boolean
  error: string | null
  activate: (input: PanicInput) => Promise<Emergency>
  cancel: (reason?: string) => Promise<void>
}

/** Wraps activate/cancel as UI state — e.g. to drive a panic button's label/spinner. */
export function useEmergency(client: MySecureOSClient): UseEmergencyResult {
  const [active, setActive] = useState<Emergency | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activate = useCallback(
    async (input: PanicInput) => {
      setLoading(true)
      setError(null)
      try {
        const emergency = await client.activateEmergency(input)
        await client.setActiveEmergencyId(emergency.id)
        setActive(emergency)
        return emergency
      } catch (err) {
        setError(errorMessage(err, 'Activation failed'))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const cancel = useCallback(
    async (reason?: string) => {
      if (!active) return
      setLoading(true)
      setError(null)
      try {
        const cleared =
          reason !== undefined
            ? await client.cancelEmergency(active.id, reason)
            : await client.cancelEmergency(active.id)
        await client.clearActiveEmergencyId()
        setActive(cleared)
      } catch (err) {
        setError(errorMessage(err, 'Could not clear emergency'))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client, active],
  )

  return { active, loading, error, activate, cancel }
}

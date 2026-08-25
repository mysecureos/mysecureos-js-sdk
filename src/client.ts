import { type SessionStorage, createInMemoryStorage } from './storage.js'
import type { Emergency, NeedsProfile, PanicInput, Session, VerifyResult } from './types.js'

const SESSION_KEY = 'mysecureos.session'
const ACTIVE_EMERGENCY_KEY = 'mysecureos.activeEmergencyId'

export interface MySecureOSClientConfig {
  /** Base URL of the MySecureOS API, e.g. "https://api.mysecureos.co.za". */
  baseUrl: string
  /** Where the session/tokens are persisted. Defaults to in-memory (lost on restart). */
  storage?: SessionStorage
}

/**
 * Client for triggering and tracking MySecureOS emergency activations from a
 * third-party mobile app. Auth is the same phone+OTP flow apps/mobile uses —
 * there is no separate partner API key.
 */
export class MySecureOSClient {
  private readonly baseUrl: string
  private readonly storage: SessionStorage
  private session: Session | null = null
  private hydrated = false

  constructor(config: MySecureOSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.storage = config.storage ?? createInMemoryStorage()
  }

  /** Loads any persisted session into memory. Safe to call repeatedly. */
  async loadSession(): Promise<Session | null> {
    if (this.hydrated) return this.session
    try {
      const raw = await this.storage.getItem(SESSION_KEY)
      this.session = raw ? (JSON.parse(raw) as Session) : null
    } catch {
      this.session = null
    }
    this.hydrated = true
    return this.session
  }

  getSession(): Session | null {
    return this.session
  }

  private async setSession(s: Session): Promise<void> {
    this.session = s
    this.hydrated = true
    await this.storage.setItem(SESSION_KEY, JSON.stringify(s))
  }

  async logout(): Promise<void> {
    this.session = null
    this.hydrated = true
    await this.storage.deleteItem(SESSION_KEY)
  }

  async setActiveEmergencyId(id: string): Promise<void> {
    await this.storage.setItem(ACTIVE_EMERGENCY_KEY, id)
  }

  async getActiveEmergencyId(): Promise<string | null> {
    return this.storage.getItem(ACTIVE_EMERGENCY_KEY)
  }

  async clearActiveEmergencyId(): Promise<void> {
    await this.storage.deleteItem(ACTIVE_EMERGENCY_KEY)
  }

  /**
   * Authenticated fetch. Sends the current session's access token; on a 401
   * redeems the refresh token once and retries, so callers don't have to
   * handle token expiry themselves.
   */
  private async authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const attempt = async () => {
      const headers = new Headers(init.headers)
      if (this.session?.accessToken) {
        headers.set('authorization', `Bearer ${this.session.accessToken}`)
      }
      return fetch(`${this.baseUrl}${path}`, { ...init, headers })
    }
    const res = await attempt()
    if (res.status !== 401) return res
    if (!this.session?.refreshToken) return res
    const r = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.session.refreshToken }),
    })
    if (!r.ok) return res
    const j = (await r.json()) as { accessToken: string; refreshToken?: string }
    await this.setSession({
      ...this.session,
      accessToken: j.accessToken,
      refreshToken: j.refreshToken ?? this.session.refreshToken,
    })
    return attempt()
  }

  async requestOtp(phone: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/auth/request-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const msg = Array.isArray(body?.message) ? body.message[0] : body?.message
      throw new Error(msg ?? 'Could not send code')
    }
  }

  async verifyOtp(phone: string, code: string): Promise<VerifyResult | NeedsProfile> {
    const res = await fetch(`${this.baseUrl}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })
    if (!res.ok) throw new Error('Invalid code')
    const result = (await res.json()) as VerifyResult | NeedsProfile
    if ('accessToken' in result) {
      await this.setSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        userId: result.user.id,
        orgId: result.user.orgId,
        phone,
      })
    }
    return result
  }

  /** Complete end-user self-registration after a verified OTP. */
  async registerUser(input: {
    regToken: string
    fullName: string
    email: string
  }): Promise<VerifyResult> {
    const res = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error('Could not complete registration')
    const result = (await res.json()) as VerifyResult
    await this.setSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      userId: result.user.id,
      orgId: result.user.orgId,
    })
    return result
  }

  /** Raise a panic / emergency activation. */
  async activateEmergency(input: PanicInput): Promise<Emergency> {
    const res = await this.authFetch('/emergencies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, eventType: 'sos', source: 'app' }),
    })
    if (!res.ok) throw new Error('activation failed')
    return res.json() as Promise<Emergency>
  }

  /** Active emergencies for an org (open endpoint, same as the operator board). */
  async listActiveEmergencies(orgId: string): Promise<Emergency[]> {
    const res = await this.authFetch(`/emergencies?orgId=${encodeURIComponent(orgId)}`)
    if (!res.ok) throw new Error('could not load emergencies')
    return res.json() as Promise<Emergency[]>
  }

  /** Stand down an active emergency (user-initiated clear). */
  async cancelEmergency(id: string, reason = "Cleared by user — I'm safe"): Promise<Emergency> {
    const res = await this.authFetch(`/emergencies/${id}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, actorUserId: this.session?.userId }),
    })
    if (!res.ok) throw new Error('could not clear emergency')
    return res.json() as Promise<Emergency>
  }

  /** Emergency history for the org within a date range. */
  async emergencyHistory(opts: { orgId: string; from: string; to: string; q?: string }): Promise<
    Emergency[]
  > {
    const params = new URLSearchParams({ orgId: opts.orgId, from: opts.from, to: opts.to })
    if (opts.q) params.set('q', opts.q)
    const res = await this.authFetch(`/emergencies/history?${params.toString()}`)
    if (!res.ok) throw new Error('could not load history')
    return res.json() as Promise<Emergency[]>
  }
}

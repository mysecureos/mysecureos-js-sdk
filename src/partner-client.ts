import { MySecureOSApiError, MySecureOSPaymentRequiredError } from './errors.js'
import type { Emergency, LatLng, PartnerAccount } from './types.js'

export interface PartnerClientConfig {
  /** Base URL of the MySecureOS API, e.g. "https://api.mysecureos.co.za". */
  baseUrl: string
  /** Your org's trusted-partner API key (from the tenant settings dashboard). */
  apiKey: string
}

export interface PartnerActivateInput {
  deviceId?: string
  location?: LatLng
}

// Refetch a little before the server's actual expiry so a request that's
// in flight right at the boundary doesn't land with a token that just died.
const REFRESH_SKEW_SECONDS = 30

/**
 * For trusted partners who authenticate their own users themselves and just
 * need to activate/clear an emergency on their behalf — no MySecureOS
 * phone+OTP login involved at all. The API key itself identifies your org;
 * unlike MySecureOSClient there's no session, no requestOtp/verifyOtp, and
 * no userId (no MySecureOS user exists in this flow).
 *
 * Ask MySecureOS support (or your org's tenant admin, via Settings > API
 * Keys) for an API key — it's shown once at creation time.
 *
 * Under the hood, this exchanges that API key for a short-lived (10 min)
 * signed SDK token (`POST /partner/sdk-token`) and uses that on every
 * activate/clear call instead — cached and refreshed automatically, so the
 * long-lived key is only sent once every ~10 minutes rather than on every
 * request. None of this is visible to callers; activateEmergency/
 * clearEmergency handle it transparently.
 */
export class MySecureOSPartnerClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private sdkToken: string | null = null
  private sdkTokenExpiresAt = 0

  constructor(config: PartnerClientConfig) {
    if (!config.baseUrl?.trim()) throw new Error('MySecureOSPartnerClient: baseUrl is required')
    if (!config.apiKey?.trim()) throw new Error('MySecureOSPartnerClient: apiKey is required')
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    // The key is a server secret sent as a bearer token when minting an SDK
    // token — plain HTTP would put it on the wire in the clear. localhost/
    // 127.0.0.1 is exempted since that's normal for local dev against a
    // local API.
    if (
      !/^https:\/\//.test(this.baseUrl) &&
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(this.baseUrl)
    ) {
      console.warn(
        `MySecureOSPartnerClient: baseUrl "${this.baseUrl}" is not HTTPS — your API key would be sent unencrypted.`,
      )
    }
  }

  /** Reuses a cached SDK token until it's close to expiry, then mints a fresh one. */
  private async ensureSdkToken(): Promise<string> {
    if (this.sdkToken && Date.now() < this.sdkTokenExpiresAt) return this.sdkToken
    const res = await fetch(`${this.baseUrl}/partner/sdk-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const msg = Array.isArray(body?.message) ? body.message[0] : body?.message
      throw new MySecureOSApiError(
        msg ?? 'Could not obtain an SDK token — check your API key',
        res.status,
      )
    }
    const { token, expiresIn } = (await res.json()) as { token: string; expiresIn: number }
    this.sdkToken = token
    this.sdkTokenExpiresAt = Date.now() + Math.max(expiresIn - REFRESH_SKEW_SECONDS, 0) * 1000
    return token
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const attempt = async (bearer: string) =>
      fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${bearer}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })

    let res = await attempt(await this.ensureSdkToken())
    if (res.status === 401) {
      // The cached token may have expired right at the boundary — mint a
      // fresh one and retry exactly once before giving up.
      this.sdkToken = null
      res = await attempt(await this.ensureSdkToken())
    }
    if (!res.ok) {
      const responseBody = (await res.json().catch(() => null)) as {
        message?: string | string[]
      } | null
      const msg =
        (Array.isArray(responseBody?.message) ? responseBody.message[0] : responseBody?.message) ??
        'Request failed'
      throw res.status === 402
        ? new MySecureOSPaymentRequiredError(msg)
        : new MySecureOSApiError(msg, res.status)
    }
    return res.json() as Promise<T>
  }

  /**
   * Raise a panic on behalf of a user your own system has already authenticated.
   *
   * Throws `MySecureOSPaymentRequiredError` (HTTP 402) when the org's SDK plan
   * is inactive or its monthly activation quota is used up — alert billing/ops
   * and don't retry.
   */
  activateEmergency(input: PartnerActivateInput = {}): Promise<Emergency> {
    return this.request('POST', '/partner/emergencies', input)
  }

  /**
   * The org's SDK plan and this calendar month's activation usage — use it to
   * show usage in your own dashboard, or warn before you hit the 402 wall.
   */
  getAccount(): Promise<PartnerAccount> {
    return this.request('GET', '/partner/account')
  }

  /**
   * Clear an active emergency. Unlike MySecureOSClient.cancelEmergency a reason
   * is required, and the emergency comes back `status: 'resolved'` (with the
   * reason on its audit trail) — a partner clear is always a resolution, never
   * a `cancelled` false alarm. A still-`pending` emergency is acknowledged
   * first on the server. Clearing an already-resolved emergency returns it
   * unchanged.
   */
  async clearEmergency(id: string, reason: string): Promise<Emergency> {
    if (!id?.trim()) throw new Error('clearEmergency: id is required')
    if (!reason?.trim())
      throw new Error('clearEmergency: a reason is required to clear an emergency')
    return this.request('POST', `/partner/emergencies/${id}/clear`, { reason })
  }
}

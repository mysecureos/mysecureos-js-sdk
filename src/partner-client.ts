import type { Emergency, LatLng } from './types.js'

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

/**
 * For trusted partners who authenticate their own users themselves and just
 * need to activate/clear an emergency on their behalf — no MySecureOS
 * phone+OTP login involved at all. The API key itself identifies your org;
 * unlike MySecureOSClient there's no session, no requestOtp/verifyOtp, and
 * no userId (no MySecureOS user exists in this flow).
 *
 * Ask MySecureOS support (or your org's tenant admin, via Settings > API
 * Keys) for an API key — it's shown once at creation time.
 */
export class MySecureOSPartnerClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: PartnerClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
  }

  private async request(path: string, body: unknown): Promise<Emergency> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const msg = Array.isArray(body?.message) ? body.message[0] : body?.message
      throw new Error(msg ?? 'Request failed')
    }
    return res.json() as Promise<Emergency>
  }

  /** Raise a panic on behalf of a user your own system has already authenticated. */
  activateEmergency(input: PartnerActivateInput = {}): Promise<Emergency> {
    return this.request('/partner/emergencies', input)
  }

  /** Clear an active emergency. Unlike MySecureOSClient.cancelEmergency, a reason is required. */
  clearEmergency(id: string, reason: string): Promise<Emergency> {
    return this.request(`/partner/emergencies/${id}/clear`, { reason })
  }
}

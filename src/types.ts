// Mirrored (not imported) from apps/mobile/lib/api.ts — this package must work
// standalone outside the monorepo, so it can't depend on @mysecureos/contracts
// the way an internal app would.

export interface LatLng {
  lat: number
  lng: number
  accuracy?: number
}

/** Active statuses (mirrors the API's ACTIVE bucket). */
export const ACTIVE_STATUSES = ['pending', 'acknowledged', 'dispatched'] as const

/**
 * Terminal statuses — the emergency is over (mirrors the API's CLEARED bucket).
 * A trusted-partner `clearEmergency` always lands on `resolved`; `cancelled` is
 * reserved for a false alarm an operator stands down.
 */
export const CLEARED_STATUSES = ['resolved', 'cancelled'] as const

/** True once an emergency has reached a terminal (`resolved` / `cancelled`) status. */
export function isEmergencyCleared(emergency: Pick<Emergency, 'status'>): boolean {
  return (CLEARED_STATUSES as readonly string[]).includes(emergency.status)
}

export interface EmergencySubject {
  name: string | null
  avatarUrl: string | null
  deviceType: string | null
  imei: string | null
  msisdn: string | null
}

export interface Emergency {
  id: string
  orgId: string
  status: 'pending' | 'acknowledged' | 'dispatched' | 'resolved' | 'cancelled'
  eventType: string
  location: LatLng | null
  createdAt: string
  subject?: EmergencySubject | null
  responder?: { kind: string; providerName: string | null; thirdParty: boolean } | null
}

/** The org's SDK plan + this calendar month's activation usage (`getAccount()`). */
export interface PartnerAccount {
  /** Flat monthly tier. `enterprise` = a bespoke, staff-set quota. */
  tier: 'free' | 'standard' | 'premium' | 'enterprise'
  status: 'active' | 'past_due' | 'cancelled'
  /** AURA armed-response routing is enabled for this org's SDK emergencies. */
  auraAddon: boolean
  /** AURA is billed on the same recurring order as the plan. */
  auraBundled: boolean
  /** Activations allowed this calendar month. */
  quota: number
  /** Activations already used this calendar month (`clear` calls don't count). */
  used: number
  /** ISO timestamp when the quota window resets (first of next month, UTC). */
  periodEnd: string
}

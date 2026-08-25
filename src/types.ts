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

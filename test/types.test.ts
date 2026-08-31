import { describe, expect, it } from 'vitest'
import { CLEARED_STATUSES, isEmergencyCleared } from '../src/index.js'

describe('isEmergencyCleared', () => {
  it('is true for terminal statuses', () => {
    expect(isEmergencyCleared({ status: 'resolved' })).toBe(true)
    expect(isEmergencyCleared({ status: 'cancelled' })).toBe(true)
  })

  it('is false while the emergency is still active', () => {
    for (const status of ['pending', 'acknowledged', 'dispatched'] as const) {
      expect(isEmergencyCleared({ status })).toBe(false)
    }
  })

  it('exposes the terminal bucket', () => {
    expect(CLEARED_STATUSES).toEqual(['resolved', 'cancelled'])
  })
})

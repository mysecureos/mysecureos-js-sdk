import { describe, expect, it, vi } from 'vitest'
import { getDeviceLocation } from '../src/index.js'

describe('getDeviceLocation', () => {
  it('returns lat/lng/accuracy on a granted permission and a fix', async () => {
    const Location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
      getCurrentPositionAsync: vi.fn().mockResolvedValue({
        coords: { latitude: -33.9249, longitude: 18.4241, accuracy: 12 },
      }),
    }

    const location = await getDeviceLocation(Location)

    expect(location).toEqual({ lat: -33.9249, lng: 18.4241, accuracy: 12 })
  })

  it('returns undefined when permission is denied, without calling getCurrentPositionAsync', async () => {
    const Location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'denied' }),
      getCurrentPositionAsync: vi.fn(),
    }

    const location = await getDeviceLocation(Location)

    expect(location).toBeUndefined()
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('returns undefined (never throws) when getCurrentPositionAsync rejects', async () => {
    const Location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
      getCurrentPositionAsync: vi.fn().mockRejectedValue(new Error('GPS unavailable')),
    }

    await expect(getDeviceLocation(Location)).resolves.toBeUndefined()
  })

  it('returns undefined when the fix does not arrive within timeoutMs', async () => {
    const Location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
      getCurrentPositionAsync: vi.fn(
        () =>
          new Promise<{ coords: { latitude: number; longitude: number; accuracy: number | null } }>(
            () => {},
          ),
      ), // never resolves
    }

    const location = await getDeviceLocation(Location, { timeoutMs: 10 })

    expect(location).toBeUndefined()
  })

  it('passes accuracy through to getCurrentPositionAsync', async () => {
    const Location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
      getCurrentPositionAsync: vi.fn().mockResolvedValue({
        coords: { latitude: 1, longitude: 2, accuracy: null },
      }),
    }

    const location = await getDeviceLocation(Location, { accuracy: 6 })

    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 6 })
    expect(location).toEqual({ lat: 1, lng: 2, accuracy: undefined })
  })
})

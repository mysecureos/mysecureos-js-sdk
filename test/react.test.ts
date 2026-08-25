// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MySecureOSClient } from '../src/index.js'
import { useEmergency, useMySecureOSClient, useOtpLogin } from '../src/react.js'

const BASE_URL = 'https://api.example.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('useMySecureOSClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hydrates the persisted session and flips ready', async () => {
    const { result } = renderHook(() => useMySecureOSClient({ baseUrl: BASE_URL }))

    expect(result.current.ready).toBe(false)
    expect(result.current.session).toBeNull()

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.session).toBeNull()
    expect(result.current.client).toBeInstanceOf(MySecureOSClient)
  })
})

describe('useOtpLogin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('walks phone -> code -> done on a normal login', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
      }),
    )

    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    const { result } = renderHook(() => useOtpLogin(client))

    expect(result.current.step).toBe('enterPhone')

    await act(async () => {
      await result.current.requestOtp('+27720000000')
    })
    expect(result.current.step).toBe('enterCode')
    expect(result.current.phone).toBe('+27720000000')

    await act(async () => {
      await result.current.verifyOtp('40505')
    })
    expect(result.current.step).toBe('done')
    expect(result.current.error).toBeNull()
  })

  it('moves to needsProfile and completes registration', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    fetchMock.mockResolvedValueOnce(jsonResponse({ needsProfile: true, regToken: 'reg-1' }))
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
      }),
    )

    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    const { result } = renderHook(() => useOtpLogin(client))

    await act(async () => {
      await result.current.requestOtp('+27720000001')
    })
    await act(async () => {
      await result.current.verifyOtp('40505')
    })
    expect(result.current.step).toBe('needsProfile')

    await act(async () => {
      await result.current.registerUser({ fullName: 'Jane Doe', email: 'jane@example.test' })
    })
    expect(result.current.step).toBe('done')
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${BASE_URL}/auth/register`)
  })

  it('surfaces a failed verify as an error and stays on enterCode', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))

    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    const { result } = renderHook(() => useOtpLogin(client))

    await act(async () => {
      await result.current.requestOtp('+27720000000')
    })
    await act(async () => {
      await expect(result.current.verifyOtp('000000')).rejects.toThrow()
    })

    expect(result.current.step).toBe('enterCode')
    expect(result.current.error).toBe('Invalid code')
  })
})

describe('useEmergency', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('activate then cancel updates active and clears loading/error', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'em-1',
        orgId: 'org-1',
        status: 'pending',
        eventType: 'sos',
        location: null,
        createdAt: 'now',
      }),
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'em-1',
        orgId: 'org-1',
        status: 'cancelled',
        eventType: 'sos',
        location: null,
        createdAt: 'now',
      }),
    )

    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    const { result } = renderHook(() => useEmergency(client))

    await act(async () => {
      await result.current.activate({})
    })
    expect(result.current.active?.status).toBe('pending')
    expect(await client.getActiveEmergencyId()).toBe('em-1')

    await act(async () => {
      await result.current.cancel()
    })
    expect(result.current.active?.status).toBe('cancelled')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(await client.getActiveEmergencyId()).toBeNull()
  })
})

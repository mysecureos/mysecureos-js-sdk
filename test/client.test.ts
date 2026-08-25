import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MySecureOSClient, createInMemoryStorage } from '../src/index.js'

const BASE_URL = 'https://api.example.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('MySecureOSClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requestOtp posts the phone number', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    const client = new MySecureOSClient({ baseUrl: BASE_URL })

    await client.requestOtp('+27720000000')

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/request-otp`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '+27720000000' }),
      }),
    )
  })

  it('verifyOtp persists the session on success', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
      }),
    )
    const client = new MySecureOSClient({ baseUrl: BASE_URL, storage: createInMemoryStorage() })

    await client.verifyOtp('+27720000000', '40505')

    expect(client.getSession()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      userId: 'user-1',
      orgId: 'org-1',
      phone: '+27720000000',
    })
  })

  it('activateEmergency sends eventType sos and source app with the bearer token', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
      }),
    )
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
    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    await client.verifyOtp('+27720000000', '40505')

    const emergency = await client.activateEmergency({ location: { lat: 1, lng: 2 } })

    expect(emergency.status).toBe('pending')
    const [, init] = fetchMock.mock.calls[1]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      location: { lat: 1, lng: 2 },
      eventType: 'sos',
      source: 'app',
    })
    expect((init.headers as Headers).get('authorization')).toBe('Bearer access-1')
  })

  it('retries once after a 401 by redeeming the refresh token', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    // verifyOtp
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'expired',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
      }),
    )
    // first activateEmergency attempt -> 401
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))
    // refresh
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'fresh', refreshToken: 'refresh-2' }),
    )
    // retried activateEmergency -> success
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

    const client = new MySecureOSClient({ baseUrl: BASE_URL })
    await client.verifyOtp('+27720000000', '40505')
    const emergency = await client.activateEmergency({})

    expect(emergency.status).toBe('pending')
    expect(client.getSession()?.accessToken).toBe('fresh')
    const lastCall = fetchMock.mock.calls.at(-1)
    expect((lastCall?.[1].headers as Headers).get('authorization')).toBe('Bearer fresh')
  })

  it('cancelEmergency sends the reason and current user id', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'user-1', orgId: 'org-1', roles: ['end_user'] },
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
    await client.verifyOtp('+27720000000', '40505')

    const emergency = await client.cancelEmergency('em-1')

    expect(emergency.status).toBe('cancelled')
    const [, init] = fetchMock.mock.calls[1]!
    expect(JSON.parse(init.body)).toEqual({
      reason: "Cleared by user — I'm safe",
      actorUserId: 'user-1',
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MySecureOSPartnerClient } from '../src/index.js'

const BASE_URL = 'https://api.example.test'
const API_KEY = 'msk_live_test000000000000000000000000'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('MySecureOSPartnerClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('activateEmergency posts to /partner/emergencies with the API key, no session', async () => {
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
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    const emergency = await client.activateEmergency({ location: { lat: 1, lng: 2 } })

    expect(emergency.status).toBe('pending')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE_URL}/partner/emergencies`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ location: { lat: 1, lng: 2 } })
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`)
  })

  it('activateEmergency defaults to an empty body when no input is given', async () => {
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
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    await client.activateEmergency()

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body)).toEqual({})
  })

  it('clearEmergency posts the reason to /partner/emergencies/:id/clear', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
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
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    const emergency = await client.clearEmergency('em-1', 'Confirmed safe by phone')

    expect(emergency.status).toBe('cancelled')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE_URL}/partner/emergencies/em-1/clear`)
    expect(JSON.parse(init.body)).toEqual({ reason: 'Confirmed safe by phone' })
  })

  it('throws the server-provided message on a non-ok response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid or revoked API key' }, 401))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: 'bad-key' })

    await expect(client.activateEmergency()).rejects.toThrow('Invalid or revoked API key')
  })
})

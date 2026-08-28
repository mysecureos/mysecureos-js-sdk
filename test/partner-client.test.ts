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

function tokenResponse(token = 'sdk-token-1', expiresIn = 600): Response {
  return jsonResponse({ token, expiresIn })
}

function emergencyResponse(status: string): Response {
  return jsonResponse({
    id: 'em-1',
    orgId: 'org-1',
    status,
    eventType: 'sos',
    location: null,
    createdAt: 'now',
  })
}

describe('MySecureOSPartnerClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exchanges the API key for an SDK token, then uses that token for the actual call', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(tokenResponse('sdk-token-1'))
    fetchMock.mockResolvedValueOnce(emergencyResponse('pending'))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    const emergency = await client.activateEmergency({ location: { lat: 1, lng: 2 } })

    expect(emergency.status).toBe('pending')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!
    expect(tokenUrl).toBe(`${BASE_URL}/partner/sdk-token`)
    expect((tokenInit.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`)

    const [emUrl, emInit] = fetchMock.mock.calls[1]!
    expect(emUrl).toBe(`${BASE_URL}/partner/emergencies`)
    expect(JSON.parse(emInit.body)).toEqual({ location: { lat: 1, lng: 2 } })
    expect((emInit.headers as Record<string, string>).authorization).toBe('Bearer sdk-token-1')
  })

  it('reuses a cached SDK token across calls instead of re-fetching it every time', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(tokenResponse('sdk-token-1'))
    fetchMock.mockResolvedValueOnce(emergencyResponse('pending'))
    fetchMock.mockResolvedValueOnce(emergencyResponse('cancelled'))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    await client.activateEmergency()
    await client.clearEmergency('em-1', 'safe')

    // Only ONE call to /partner/sdk-token across both operations.
    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => url === `${BASE_URL}/partner/sdk-token`,
    )
    expect(tokenCalls).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('mints a fresh token and retries once on a 401 (expired-token boundary)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(tokenResponse('sdk-token-1'))
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid or expired SDK token' }, 401))
    fetchMock.mockResolvedValueOnce(tokenResponse('sdk-token-2'))
    fetchMock.mockResolvedValueOnce(emergencyResponse('pending'))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    const emergency = await client.activateEmergency()

    expect(emergency.status).toBe('pending')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [, lastInit] = fetchMock.mock.calls[3]!
    expect((lastInit.headers as Record<string, string>).authorization).toBe('Bearer sdk-token-2')
  })

  it('throws if the API key is rejected while minting an SDK token', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Invalid or revoked API key' }, 401))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: 'bad-key' })

    await expect(client.activateEmergency()).rejects.toThrow('Invalid or revoked API key')
  })

  it('clearEmergency posts the reason to /partner/emergencies/:id/clear', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(tokenResponse())
    fetchMock.mockResolvedValueOnce(emergencyResponse('cancelled'))
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    const emergency = await client.clearEmergency('em-1', 'Confirmed safe by phone')

    expect(emergency.status).toBe('cancelled')
    const [url, init] = fetchMock.mock.calls[1]!
    expect(url).toBe(`${BASE_URL}/partner/emergencies/em-1/clear`)
    expect(JSON.parse(init.body)).toEqual({ reason: 'Confirmed safe by phone' })
  })

  it('rejects an empty baseUrl or apiKey at construction, before any request', () => {
    expect(() => new MySecureOSPartnerClient({ baseUrl: '', apiKey: API_KEY })).toThrow(/baseUrl/)
    expect(() => new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: '  ' })).toThrow(/apiKey/)
  })

  it('warns on a non-HTTPS baseUrl other than localhost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    void new MySecureOSPartnerClient({ baseUrl: 'http://api.example.test', apiKey: API_KEY })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not HTTPS'))
    warn.mockClear()
    void new MySecureOSPartnerClient({ baseUrl: 'http://localhost:4000', apiKey: API_KEY })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('clearEmergency rejects a missing reason without making a request', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const client = new MySecureOSPartnerClient({ baseUrl: BASE_URL, apiKey: API_KEY })

    await expect(client.clearEmergency('em-1', '')).rejects.toThrow(/reason/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

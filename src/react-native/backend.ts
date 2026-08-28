import type { Emergency, LatLng } from '../types.js'

export interface PanicBackendConfig {
  /**
   * Base URL of **your** server — the one holding the trusted-partner API key
   * and calling `MySecureOSPartnerClient`. Never a MySecureOS URL, and never a
   * URL with the key in it.
   */
  url: string
  /** Path that raises an emergency. Receives `{ location }`. Default `/panic`. */
  activatePath?: string
  /**
   * Path that clears one. `:id` is replaced with the emergency id, and the body
   * is `{ reason }`. Default `/panic/:id/clear`.
   */
  clearPath?: string
  /** Extra headers on every call — e.g. your app's own session token. */
  headers?: Record<string, string>
  /** Override the fetch implementation (tests, custom instrumentation). */
  fetch?: typeof fetch
}

async function parse(res: Response): Promise<Emergency> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
    const msg = Array.isArray(body?.message) ? body.message[0] : body?.message
    throw new Error(msg ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<Emergency>
}

/**
 * Turns a plain backend URL into the `onActivate` / `onClear` handlers
 * <PanicScreen> and usePanic need — so the turnkey path is just:
 *
 *   <PanicScreen backend={{ url: 'https://api.myapp.com' }} location={Location} />
 *
 * It POSTs JSON to `${url}${activatePath}` and `${url}${clearPath}` and expects
 * the MySecureOS `Emergency` back (exactly what your server gets from
 * `MySecureOSPartnerClient`). Reach for explicit `onActivate` / `onClear`
 * instead when you need anything this doesn't cover.
 */
export function panicBackend(config: PanicBackendConfig): {
  onActivate: (input: { location?: LatLng }) => Promise<Emergency>
  onClear: (id: string, reason: string) => Promise<Emergency>
} {
  const base = config.url.replace(/\/$/, '')
  const activatePath = config.activatePath ?? '/panic'
  const clearPath = config.clearPath ?? '/panic/:id/clear'
  const doFetch = config.fetch ?? fetch
  const headers = { 'content-type': 'application/json', ...config.headers }

  return {
    onActivate: (input) =>
      doFetch(`${base}${activatePath}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      }).then(parse),
    onClear: (id, reason) =>
      doFetch(`${base}${clearPath.replace(':id', encodeURIComponent(id))}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason }),
      }).then(parse),
  }
}

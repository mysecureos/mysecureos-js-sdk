import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { Emergency } from '../src/index.js'
import { panicBackend } from '../src/react-native/backend.js'
// Import the hook directly — the react-native/index barrel pulls in
// `react-native` (Flow-typed source vitest can't parse), and the hook itself
// only depends on `react`.
import {
  type UsePanicOptions,
  type UsePanicResult,
  usePanic,
} from '../src/react-native/use-panic.js'

// Tell React we're inside an act()-aware environment (no DOM/jsdom here).
const testGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
testGlobal.IS_REACT_ACT_ENVIRONMENT = true

function emergency(status: Emergency['status'] = 'pending'): Emergency {
  return {
    id: 'em-1',
    orgId: 'org-1',
    status,
    eventType: 'sos',
    location: null,
    createdAt: 'now',
  }
}

/** Render usePanic in a throwaway component and hand back a live view of its result. */
function renderPanic(options: UsePanicOptions): { current: UsePanicResult } {
  const ref: { current: UsePanicResult } = { current: null as unknown as UsePanicResult }
  function Harness() {
    ref.current = usePanic(options)
    return null
  }
  act(() => {
    TestRenderer.create(createElement(Harness))
  })
  return ref
}

describe('usePanic', () => {
  it('activates through onActivate and exposes the returned emergency', async () => {
    const onActivate = vi.fn().mockResolvedValue(emergency('pending'))
    const onClear = vi.fn()
    const panic = renderPanic({ onActivate, onClear })

    await act(async () => {
      await panic.current.activate()
    })

    expect(onActivate).toHaveBeenCalledWith({ location: undefined })
    expect(panic.current.active?.id).toBe('em-1')
    expect(panic.current.error).toBeNull()
  })

  it('sends a non-empty reason to onClear, falling back to the default', async () => {
    const onActivate = vi.fn().mockResolvedValue(emergency('pending'))
    const onClear = vi.fn().mockResolvedValue(emergency('resolved'))
    const panic = renderPanic({ onActivate, onClear, defaultClearReason: 'Safe' })

    await act(async () => {
      await panic.current.activate()
    })
    await act(async () => {
      await panic.current.clear('   ')
    })

    expect(onClear).toHaveBeenCalledWith('em-1', 'Safe')
    expect(panic.current.active?.status).toBe('resolved')
  })

  it('surfaces an activation failure as error without throwing', async () => {
    const onActivate = vi.fn().mockRejectedValue(new Error('Invalid or revoked API key'))
    const panic = renderPanic({ onActivate, onClear: vi.fn() })

    await act(async () => {
      await panic.current.activate()
    })

    expect(panic.current.active).toBeNull()
    expect(panic.current.error).toBe('Invalid or revoked API key')
  })

  it('captures a GPS fix from the passed location module before activating', async () => {
    const onActivate = vi.fn().mockResolvedValue(emergency('pending'))
    const location = {
      requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
      getCurrentPositionAsync: vi
        .fn()
        .mockResolvedValue({ coords: { latitude: -33.9, longitude: 18.4, accuracy: 10 } }),
    }
    const panic = renderPanic({ onActivate, onClear: vi.fn(), location })

    await act(async () => {
      await panic.current.activate()
    })

    expect(onActivate).toHaveBeenCalledWith({
      location: { lat: -33.9, lng: 18.4, accuracy: 10 },
    })
  })

  it('does not call onClear when there is no active emergency', async () => {
    const onClear = vi.fn()
    const panic = renderPanic({ onActivate: vi.fn(), onClear })

    await act(async () => {
      await panic.current.clear('done')
    })

    expect(onClear).not.toHaveBeenCalled()
  })

  it('works turnkey from a `backend` URL instead of explicit handlers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emergency('pending')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const panic = renderPanic({
      backend: { url: 'https://api.myapp.test/', fetch: fetchMock as unknown as typeof fetch },
    })

    await act(async () => {
      await panic.current.activate()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.myapp.test/panic',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(panic.current.active?.id).toBe('em-1')
  })

  it('throws when given neither handlers nor a backend', () => {
    expect(() => renderPanic({} as UsePanicOptions)).toThrow(/onActivate \+ onClear, or backend/)
  })
})

describe('panicBackend', () => {
  it('substitutes :id and sends { reason } on clear', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emergency('resolved')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { onClear } = panicBackend({
      url: 'https://api.myapp.test',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await onClear('em-9', 'Safe')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.myapp.test/panic/em-9/clear',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'Safe' }) }),
    )
  })

  it('surfaces the server error message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid or revoked API key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { onActivate } = panicBackend({
      url: 'https://api.myapp.test',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await expect(onActivate({})).rejects.toThrow('Invalid or revoked API key')
  })
})

/**
 * The MySecureOS app palette — mirrored from apps/mobile/components/ui.tsx so
 * a partner dropping <PanicScreen> in gets the real app's look, not a generic
 * RN starter. Pass a partial override as the `theme` prop to re-skin it.
 */
export const panicTheme = {
  /** Page background. */
  bg: '#F4F7FB',
  /** Cards / raised surfaces. */
  surface: '#FFFFFF',
  /** Primary accent (royal blue) — used on the "clear" button. */
  accent: '#1B4DB1',
  /** Label colour on accent buttons. */
  onAccent: '#FFFFFF',
  /** SOS / danger. */
  red: '#E11D28',
  /** Primary text. */
  text: '#0E1726',
  /** Secondary text. */
  muted: '#5A6B84',
  /** Hairline borders. */
  line: 'rgba(14,23,38,0.12)',
  /** Subtle fills. */
  card: 'rgba(14,23,38,0.04)',
  /** Success green (the "Located" state). */
  ok: '#1B8F5A',
  /** Amber (the "Locating…" state). */
  warn: '#F5B54A',
} as const

export type PanicTheme = typeof panicTheme

/** Merge a caller override over the defaults. */
export function resolveTheme(override?: Partial<PanicTheme>): PanicTheme {
  return override ? { ...panicTheme, ...override } : panicTheme
}

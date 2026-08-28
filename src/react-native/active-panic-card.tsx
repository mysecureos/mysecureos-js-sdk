import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Emergency, LatLng } from '../types.js'
import { MiniMap, type WebViewComponent } from './mini-map.js'
import { type PanicTheme, resolveTheme } from './theme.js'

export interface ActivePanicCardProps {
  emergency: Emergency
  fix?: LatLng | null
  address?: string | null
  clearing?: boolean
  onClear: () => void
  /** Pass `react-native-webview`'s `WebView` to show the location on a map. */
  webView?: WebViewComponent
  theme?: Partial<PanicTheme>
}

/**
 * Shown in place of the SOS button while an emergency is active — mirrors
 * apps/mobile/components/active-emergency-card.tsx.
 */
export function ActivePanicCard({
  emergency,
  fix,
  address,
  clearing = false,
  onClear,
  webView,
  theme,
}: ActivePanicCardProps) {
  const t = resolveTheme(theme)
  const { first, last } = splitName(emergency.subject?.name)
  const phone = emergency.subject?.msisdn
  const responder = emergency.responder
  const locationLine =
    address ?? (fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : 'Locating…')

  return (
    <View style={[styles.card, { borderColor: withAlpha(t.red, 0.5) }]}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: t.red }]} />
        <Text style={[styles.header, { color: t.red }]}>EMERGENCY ACTIVE</Text>
      </View>
      <Text style={[styles.sub, { color: t.muted }]}>
        Help is on the way. Stay where you are if it&apos;s safe.
      </Text>

      <View style={styles.fields}>
        <Field label="Name" value={first || '—'} theme={t} />
        <Field label="Surname" value={last || '—'} theme={t} />
        <Field label="Phone" value={phone || '—'} theme={t} />
        <Field label="Location" value={locationLine} theme={t} />
      </View>

      {fix && webView ? (
        <MiniMap lat={fix.lat} lng={fix.lng} webView={webView} height={180} theme={theme} />
      ) : null}

      {responder ? (
        <Text style={[styles.responder, { color: t.accent }]}>
          {responder.thirdParty
            ? `Monitored with ${responder.providerName ?? 'partner network'}`
            : 'MySecureOS armed response notified'}
        </Text>
      ) : null}

      <Pressable
        style={[styles.clear, { backgroundColor: t.accent }, clearing && styles.busy]}
        disabled={clearing}
        onPress={onClear}
      >
        <Text style={[styles.clearText, { color: t.onAccent }]}>
          {clearing ? 'Clearing…' : "I'm safe — Clear SOS"}
        </Text>
      </Pressable>
    </View>
  )
}

function Field({ label, value, theme }: { label: string; value: string; theme: PanicTheme }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: theme.text }]}>{value}</Text>
    </View>
  )
}

function splitName(name?: string | null): { first: string; last: string } {
  if (!name) return { first: '', last: '' }
  const parts = name.trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

/** rgba() from a #RRGGBB hex + alpha — keeps the card border tinted like the app. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return hex
  const n = Number.parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,59,71,0.08)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  header: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  sub: { fontSize: 14, lineHeight: 20 },
  fields: { gap: 10 },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  fieldValue: { fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  responder: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  clear: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 2 },
  busy: { opacity: 0.6 },
  clearText: { fontWeight: '800', fontSize: 16 },
})

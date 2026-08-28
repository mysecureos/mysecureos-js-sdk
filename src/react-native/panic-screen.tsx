import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import type { Emergency, LatLng } from '../types.js'
import { ActivePanicCard } from './active-panic-card.js'
import { MiniMap, type WebViewComponent } from './mini-map.js'
import { type PanicTheme, resolveTheme } from './theme.js'
import { type UsePanicOptions, usePanic } from './use-panic.js'

/** Passed to `renderButton` — everything a custom SOS control needs. */
export interface PanicButtonSlotProps {
  sending: boolean
  disabled: boolean
  onPress: () => void
  theme: PanicTheme
}

/** Passed to `renderActive` — the state of the live emergency. */
export interface PanicActiveSlotProps {
  emergency: Emergency
  fix: LatLng | undefined
  address: string | null
  clearing: boolean
  onClear: () => void
  theme: PanicTheme
}

export interface PanicScreenSubject {
  /** Shown under the avatar. Defaults to the brand name. */
  name?: string
  /** Personal photo URL. */
  avatarUrl?: string | null
  /** Company/event logo URL — shown instead of the avatar when set. */
  orgLogoUrl?: string | null
}

export interface PanicScreenProps extends UsePanicOptions {
  /** Identity shown at the top of the screen (there's no MySecureOS account in this flow). */
  subject?: PanicScreenSubject
  /** Brand word in "… is protecting you". Default "mysecureos". */
  brandName?: string
  /** `react-native-webview`'s `WebView`, to draw the location on a mini-map. */
  webView?: WebViewComponent
  /**
   * Seconds to count down before a press actually sends, with a Cancel button.
   * 0 (default) sends immediately, like the MySecureOS app.
   */
  confirmSeconds?: number
  /** Ask for confirmation (native Alert) before clearing. Default true. */
  confirmClear?: boolean
  theme?: Partial<PanicTheme>

  // --- customization slots: keep the flow, swap the pieces -----------------
  /** Your own node above the identity header (a logo, a disclaimer, …). */
  header?: ReactNode
  /** Replace the round SOS button with your own control. */
  renderButton?: (props: PanicButtonSlotProps) => ReactNode
  /** Replace the whole active-emergency card. */
  renderActive?: (props: PanicActiveSlotProps) => ReactNode
  /** Passed through to the outer `ScrollView`. */
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
}

/**
 * The MySecureOS panic screen, ready to drop into a partner app: identity
 * header, an always-on GPS fix + address, the SOS button, and the active-
 * emergency card with a "Clear SOS" flow. Visually mirrors
 * apps/mobile/app/(tabs)/sos.tsx.
 *
 * The app holds no API key: `onActivate` / `onClear` call **your** backend,
 * which uses `MySecureOSPartnerClient`.
 */
export function PanicScreen({
  subject,
  brandName = 'mysecureos',
  webView,
  confirmSeconds = 0,
  confirmClear = true,
  theme,
  header,
  renderButton,
  renderActive,
  style,
  contentContainerStyle,
  ...panicOptions
}: PanicScreenProps) {
  const t = resolveTheme(theme)
  const { active, fix, address, sending, clearing, error, activate, clear, dismiss } =
    usePanic(panicOptions)

  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      void activate()
      return
    }
    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown, activate])

  const onPressSos = () => {
    if (confirmSeconds > 0) setCountdown(confirmSeconds)
    else void activate()
  }

  const onPressClear = () => {
    if (!confirmClear) {
      void clear()
      return
    }
    Alert.alert(
      'Clear your emergency?',
      'This stands down your active SOS. Only do this if you are safe.',
      [
        { text: 'Keep active', style: 'cancel' },
        { text: 'Yes, I am safe', style: 'destructive', onPress: () => void clear() },
      ],
    )
  }

  const cleared = active && active.status === 'cancelled'
  const name = subject?.name ?? brandName

  return (
    <ScrollView
      style={style}
      contentContainerStyle={[styles.container, { backgroundColor: t.bg }, contentContainerStyle]}
    >
      {active && !cleared ? (
        renderActive ? (
          renderActive({
            emergency: active,
            fix,
            address,
            clearing,
            onClear: onPressClear,
            theme: t,
          })
        ) : (
          <ActivePanicCard
            emergency={active}
            fix={fix}
            address={address}
            clearing={clearing}
            onClear={onPressClear}
            webView={webView}
            theme={theme}
          />
        )
      ) : cleared ? (
        <View style={styles.stack}>
          <Text style={[styles.name, { color: t.text }]}>Emergency cleared</Text>
          <Text style={[styles.protected, { color: t.muted }]}>You&apos;re marked safe.</Text>
          <Pressable style={[styles.smallBtn, { borderColor: t.line }]} onPress={dismiss}>
            <Text style={[styles.smallBtnText, { color: t.text }]}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.stack}>
          {header}
          {/* identity header */}
          {subject?.orgLogoUrl ? (
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: subject.orgLogoUrl }}
                style={[styles.avatar, styles.avatarLogo, { borderColor: t.warn }]}
                resizeMode="contain"
              />
            </View>
          ) : subject?.avatarUrl ? (
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: subject.avatarUrl }}
                style={[styles.avatar, { borderColor: t.warn }]}
              />
            </View>
          ) : null}
          <Text style={[styles.name, { color: t.text }]}>{name}</Text>
          <Text style={[styles.protected, { color: t.muted }]}>{name} is protecting you</Text>

          {/* the button */}
          {countdown !== null ? (
            <View style={[styles.confirmCard, { borderColor: withA(t.warn, 0.6) }]}>
              <Text style={[styles.confirmTitle, { color: t.text }]}>Sending in {countdown}…</Text>
              <Text style={[styles.confirmSub, { color: t.muted }]}>
                Cancel now if this wasn&apos;t intentional — nothing is sent yet.
              </Text>
              <Pressable
                style={[styles.smallBtn, { borderColor: t.line }]}
                onPress={() => setCountdown(null)}
              >
                <Text style={[styles.smallBtnText, { color: t.text }]}>Cancel</Text>
              </Pressable>
            </View>
          ) : renderButton ? (
            renderButton({ sending, disabled: sending, onPress: onPressSos, theme: t })
          ) : (
            <Pressable
              style={[styles.panic, { backgroundColor: t.red }, sending && styles.busy]}
              disabled={sending}
              onPress={onPressSos}
            >
              <Text style={styles.panicText}>{sending ? '…' : 'SOS'}</Text>
              <Text style={styles.panicSub}>{sending ? 'sending' : 'press for help'}</Text>
            </Pressable>
          )}
          {error ? <Text style={[styles.error, { color: t.red }]}>{error}</Text> : null}

          {/* location status */}
          {fix ? (
            <View
              style={[
                styles.locCard,
                { borderColor: withA(t.ok, 0.45), backgroundColor: withA(t.ok, 0.1) },
              ]}
            >
              <Text style={[styles.locTitle, { color: t.ok }]}>
                Located{fix.accuracy ? ` · ±${Math.round(fix.accuracy)}m` : ''}
              </Text>
              <Text style={[styles.locCoords, { color: t.text }]}>
                {fix.lat.toFixed(6)}, {fix.lng.toFixed(6)}
              </Text>
              {address ? (
                <Text style={[styles.locAddress, { color: t.muted }]}>{address}</Text>
              ) : null}
            </View>
          ) : panicOptions.location ? (
            <View
              style={[
                styles.locCard,
                { borderColor: withA(t.warn, 0.45), backgroundColor: withA(t.warn, 0.08) },
              ]}
            >
              <View style={styles.locHead}>
                <ActivityIndicator size="small" color={t.warn} />
                <Text style={[styles.locTitle, { color: t.warn }]}>Locating…</Text>
              </View>
              <Text style={[styles.locAddress, { color: t.muted }]}>
                Getting your GPS position so help knows where to find you.
              </Text>
            </View>
          ) : null}

          {/* mini map */}
          {fix && webView ? (
            <MiniMap lat={fix.lat} lng={fix.lng} webView={webView} theme={theme} />
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}

function withA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return hex
  const n = Number.parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  stack: { width: '100%', alignItems: 'center', gap: 12 },
  avatarWrap: { width: 96, height: 96 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5 },
  avatarLogo: { backgroundColor: '#fff', padding: 8 },
  name: { fontSize: 20, fontWeight: '800' },
  protected: { fontSize: 12, fontWeight: '700', marginTop: -6 },
  panic: {
    width: 175,
    height: 175,
    borderRadius: 90,
    marginVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D28',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  busy: { opacity: 0.7 },
  panicText: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: 2 },
  panicSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  error: { fontSize: 14, fontWeight: '700' },
  confirmCard: {
    width: '100%',
    borderRadius: 18,
    padding: 18,
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmTitle: { fontSize: 20, fontWeight: '800' },
  confirmSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  smallBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  smallBtnText: { fontSize: 14, fontWeight: '700' },
  locCard: { width: '100%', borderRadius: 14, padding: 14, gap: 4, borderWidth: 1 },
  locHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  locTitle: { fontSize: 14, fontWeight: '800' },
  locCoords: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  locAddress: { fontSize: 12, lineHeight: 17 },
})

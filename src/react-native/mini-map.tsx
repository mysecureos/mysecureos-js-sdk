import { StyleSheet, View } from 'react-native'
import { type PanicTheme, resolveTheme } from './theme.js'

/**
 * The slice of `react-native-webview` MiniMap needs. Duck-typed so this
 * package never depends on `react-native-webview` — pass the component in:
 *
 *   import { WebView } from 'react-native-webview'
 *   <PanicScreen webView={WebView} ... />
 */
export type WebViewComponent = React.ComponentType<{
  source: { html: string; baseUrl?: string }
  style?: unknown
  originWhitelist?: string[]
  scrollEnabled?: boolean
  javaScriptEnabled?: boolean
  domStorageEnabled?: boolean
  setSupportMultipleWindows?: boolean
}>

function mapHtml(lat: number, lng: number, dot: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;background:#F4F7FB}</style>
</head><body><div id="map"></div><script>
  var map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false, tap: false }).setView([${lat}, ${lng}], 16);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
  L.circleMarker([${lat}, ${lng}], { radius: 10, color: '#fff', weight: 2, fillColor: '${dot}', fillOpacity: 1 }).addTo(map);
</script></body></html>`
}

export interface MiniMapProps {
  lat: number
  lng: number
  /** The `WebView` export from `react-native-webview`. */
  webView: WebViewComponent
  height?: number
  theme?: Partial<PanicTheme>
}

/** A small, static Leaflet map centred on one point (matches the app's SOS map). */
export function MiniMap({ lat, lng, webView: WebView, height = 170, theme }: MiniMapProps) {
  const t = resolveTheme(theme)
  return (
    <View style={[styles.wrap, { height, borderColor: t.line }]}>
      <WebView
        source={{ html: mapHtml(lat, lng, t.red), baseUrl: 'https://www.openstreetmap.org/' }}
        style={styles.web}
        originWhitelist={['*']}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  web: { flex: 1, backgroundColor: '#F4F7FB' },
})

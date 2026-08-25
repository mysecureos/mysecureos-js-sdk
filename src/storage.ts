// Generalizes apps/mobile/lib/session.ts and lib/active-sos.ts, which both
// hardcode expo-secure-store. A third-party consumer of this SDK may not be
// on Expo, so storage is a pluggable interface instead.

export interface SessionStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  deleteItem(key: string): Promise<void>
}

/** Default storage: works anywhere, but does not survive a process restart. */
export function createInMemoryStorage(): SessionStorage {
  const store = new Map<string, string>()
  return {
    async getItem(key) {
      return store.get(key) ?? null
    },
    async setItem(key, value) {
      store.set(key, value)
    },
    async deleteItem(key) {
      store.delete(key)
    },
  }
}

/** Minimal shape of the `expo-secure-store` module — duck-typed so this
 *  package never has to import or resolve `expo-secure-store` itself. */
export interface ExpoSecureStoreModule {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}

/**
 * Storage backed by expo-secure-store, for Expo/React Native apps that want
 * the session to persist across restarts (same mechanism apps/mobile uses).
 * Pass in the module yourself so this package doesn't need it installed:
 *
 *   import * as SecureStore from 'expo-secure-store'
 *   createExpoSecureStoreAdapter(SecureStore)
 */
export function createExpoSecureStoreAdapter(SecureStore: ExpoSecureStoreModule): SessionStorage {
  return {
    async getItem(key) {
      return SecureStore.getItemAsync(key)
    },
    async setItem(key, value) {
      await SecureStore.setItemAsync(key, value)
    },
    async deleteItem(key) {
      await SecureStore.deleteItemAsync(key)
    },
  }
}

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // react-test-renderer (used only to drive usePanic in test/use-panic.test.ts)
    // prints a deprecation notice on import — it's still the simplest way to run
    // a hook with no DOM. Drop the noise so a passing run stays quiet.
    onConsoleLog(log) {
      if (log.includes('react-test-renderer is deprecated')) return false
    },
  },
})

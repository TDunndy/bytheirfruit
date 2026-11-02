import { defineConfig } from 'vitest/config'

// Unit tests for the pure parts (outbox, formatting); the UI is exercised at
// the LWR dry run and by the screenshot harness.
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })

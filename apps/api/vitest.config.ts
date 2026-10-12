import { defineConfig } from 'vitest/config'

// Dummy platform credentials so unit tests can import modules that build
// Supabase clients at load time. Never real secrets — tests must stay hermetic.
process.env.SUPABASE_URL ??= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-dummy-key'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
  },
})

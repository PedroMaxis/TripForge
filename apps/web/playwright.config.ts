import { defineConfig, devices } from '@playwright/test'
import { env } from './e2e/env'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: env.APP_URL,
    trace: 'retain-on-failure',
    // The map needs WebGL, which headless browsers only have in software.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['Pixel 7'] },
  ],
  webServer: [
    { command: 'node e2e/fakes.ts', url: `${new URL(env.PHOTON_URL).origin}/` },
    {
      command: 'pnpm --filter @tripforge/db dev:postgres',
      env: { DEV_POSTGRES_PORT: env.DEV_POSTGRES_PORT, DEV_POSTGRES_DIR: '.postgres/e2e' },
      wait: { stdout: /Postgres ready/ },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'pnpm --filter @tripforge/realtime build && pnpm --filter @tripforge/realtime start',
      url: `${env.REALTIME_URL}/health`,
      env,
    },
    {
      command: 'pnpm --filter @tripforge/db migrate && pnpm build && pnpm start',
      url: `${env.APP_URL}/api/health`,
      env: { ...env, PORT: '3100', NEXT_DIST_DIR: '.next-e2e' },
      timeout: 180_000,
    },
  ],
})

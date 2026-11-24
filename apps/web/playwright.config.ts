import { defineConfig, devices } from '@playwright/test'
import { env } from './e2e/env'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: { baseURL: env.APP_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['Pixel 7'] },
  ],
  webServer: [
    {
      command: 'pnpm --filter @tripforge/db dev:postgres',
      env: { DEV_POSTGRES_PORT: env.DEV_POSTGRES_PORT, DEV_POSTGRES_DIR: '.postgres/e2e' },
      wait: { stdout: /Postgres ready/ },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'pnpm --filter @tripforge/db migrate && pnpm build && pnpm start',
      url: `${env.APP_URL}/api/health`,
      env: { ...env, PORT: '3100' },
      timeout: 180_000,
    },
  ],
})

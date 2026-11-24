import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// The whole workspace shares one .env at the root. Variables already set win over it.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

const config: NextConfig = {
  output: 'standalone',
  // The end-to-end tests build elsewhere, so they can run beside `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@tripforge/core', '@tripforge/db'],
  poweredByHeader: false,
}

export default createNextIntlPlugin('./src/i18n/request.ts')(config)

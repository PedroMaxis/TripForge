import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@tripforge/core', '@tripforge/db'],
  poweredByHeader: false,
}

export default createNextIntlPlugin('./src/i18n/request.ts')(config)

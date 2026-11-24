'use client'

import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    // In development, kept files would only get in the way.
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker?.register('/sw.js').catch(() => {})
  }, [])
  return null
}

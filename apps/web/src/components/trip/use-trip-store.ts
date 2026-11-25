'use client'

import type { Trip } from '@tripforge/core'
import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { createTripApi } from '@/lib/trip-api'
import { createTripStore } from '@/lib/trip-store'

export type TripScreenProps = {
  initial: Trip
  userId: string
  realtimeUrl: string | undefined
}

/** A trip on screen: kept up to date, saved by itself, and safe without connection. */
export function useTripStore(initial: Trip, userId: string) {
  const [store] = useState(() =>
    createTripStore(initial, userId, createTripApi(initial.id, userId)),
  )
  const state = useStore(store)
  const { start, sync, undo, notice, dismiss } = state

  useEffect(() => start(), [start])
  useEffect(() => {
    if (!undo && !notice) return
    const timer = setTimeout(dismiss, 7000)
    return () => clearTimeout(timer)
  }, [undo, notice, dismiss])
  useEffect(() => {
    // Without connection the changes are kept on the device, so leaving is safe.
    if (sync !== 'saving') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [sync])
  return { store, ...state }
}

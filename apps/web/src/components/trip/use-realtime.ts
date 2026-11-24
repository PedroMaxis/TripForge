'use client'

import type { LogEntry, Presence } from '@tripforge/core'
import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { createTripStore } from '@/lib/trip-store'

const renewMs = 4 * 60 * 1000
const rejoinMs = 5000

async function fetchToken() {
  const res = await fetch('/api/realtime-token')
  if (!res.ok) throw new Error(`Token answered ${res.status}`)
  return ((await res.json()) as { token: string }).token
}

/** Hears what others do to the trip, and tells them which item is open here. */
export function useRealtime({
  tripId,
  url,
  store,
  editing,
}: {
  tripId: string
  /** Where the realtime server is; by default, behind the same address as the app. */
  url: string | undefined
  store: ReturnType<typeof createTripStore>
  editing: string | null
}) {
  const [people, setPeople] = useState<Presence[]>([])
  const socketRef = useRef<Socket | null>(null)
  const editingRef = useRef(editing)

  useEffect(() => {
    const { receive, catchUp, revoke } = store.getState()
    const socket = io(url ?? '', {
      // A fresh token for every attempt: the last one may have run out while offline.
      auth: (send) => {
        fetchToken().then(
          (token) => send({ token }),
          () => send({}),
        )
      },
    })
    socketRef.current = socket
    let rejoin: ReturnType<typeof setTimeout> | undefined
    const tryAgain = () => {
      clearTimeout(rejoin)
      rejoin = setTimeout(() => socket.connect(), rejoinMs)
    }

    socket.on('connect', () => {
      socket.emit('trip.join', { tripId }, (result: { ok: boolean; revision?: number }) => {
        // Not being let in is settled by asking the app itself, which knows why.
        if (!result.ok || (result.revision ?? 0) > store.getState().trip.revision) void catchUp()
        if (editingRef.current) socket.emit('trip.editing', { tripId, itemId: editingRef.current })
      })
    })
    socket.on('disconnect', (reason) => {
      setPeople([])
      // Closed by the server, which Socket.IO does not undo by itself.
      if (reason === 'io server disconnect') tryAgain()
    })
    // Refused, usually for want of a token; that is not retried by itself either.
    socket.on('connect_error', () => {
      if (!socket.active) tryAgain()
    })
    socket.on('trip.entry', (id: string, entry: LogEntry) => {
      if (id === tripId) receive(entry)
    })
    socket.on('trip.presence', (id: string, present: Presence[]) => {
      if (id === tripId) setPeople(present)
    })
    socket.on('trip.revoked', (id: string) => {
      if (id === tripId) revoke()
    })

    const renewal = setInterval(() => {
      if (!socket.connected) return
      fetchToken().then(
        (token) => socket.emit('session.renew', { token }, () => {}),
        () => {},
      )
    }, renewMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void catchUp()
    }
    document.addEventListener('visibilitychange', onVisible)
    addEventListener('online', onVisible)

    return () => {
      clearInterval(renewal)
      clearTimeout(rejoin)
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onVisible)
      socket.disconnect()
      socketRef.current = null
    }
  }, [tripId, url, store])

  useEffect(() => {
    editingRef.current = editing
    socketRef.current?.emit('trip.editing', { tripId, itemId: editing })
  }, [tripId, editing])

  return people
}

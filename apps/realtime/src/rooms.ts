import type { LogEntry, Presence, RealtimeUser } from '@tripforge/core'

/** Where the server learns about trips. */
export type TripSource = {
  access: (userId: string, tripId: string) => Promise<{ revision: number } | null>
  entriesSince: (tripId: string, revision: number) => Promise<LogEntry[]>
}

type Guest = { user: RealtimeUser; editing: string | null }
type Room = { revision: number; guests: Map<string, Guest>; work: Promise<void> }

export type RoomEvents = {
  entry: (tripId: string, entry: LogEntry) => void
  presence: (tripId: string, people: Presence[]) => void
  /** This person may no longer hear the trip; called before the entry that says so. */
  evict: (tripId: string, userId: string) => void
}

/** The trips open right now: who is in each, and how far its changes have been told. */
export function createRooms(trips: TripSource, events: RoomEvents) {
  const rooms = new Map<string, Room>()

  function people(room: Room): Presence[] {
    const byUser = new Map<string, Presence>()
    for (const { user, editing } of room.guests.values()) {
      const known = byUser.get(user.userId)
      byUser.set(user.userId, { ...user, editing: editing ?? known?.editing ?? null })
    }
    return [...byUser.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
  }

  const tellPresence = (tripId: string, room: Room) => events.presence(tripId, people(room))

  async function tell(tripId: string, room: Room) {
    for (const entry of await trips.entriesSince(tripId, room.revision)) {
      if (entry.op.type === 'member.changed' && entry.op.role === null) {
        for (const [socketId, guest] of room.guests) {
          if (guest.user.userId === entry.op.userId) room.guests.delete(socketId)
        }
        events.evict(tripId, entry.op.userId)
        tellPresence(tripId, room)
      }
      room.revision = entry.revision
      events.entry(tripId, entry)
    }
  }

  return {
    async join(tripId: string, socketId: string, user: RealtimeUser, admit: () => void) {
      const access = await trips.access(user.userId, tripId)
      if (!access) return null
      let room = rooms.get(tripId)
      if (!room) {
        room = { revision: access.revision, guests: new Map(), work: Promise.resolve() }
        rooms.set(tripId, room)
      }
      admit()
      room.guests.set(socketId, { user, editing: null })
      // Removed between the check and now? The word of it may already have gone by.
      if (!(await trips.access(user.userId, tripId))) {
        this.leave(tripId, socketId)
        return null
      }
      tellPresence(tripId, room)
      return access.revision
    },

    leave(tripId: string, socketId: string) {
      const room = rooms.get(tripId)
      if (!room?.guests.delete(socketId)) return
      if (room.guests.size === 0) rooms.delete(tripId)
      else tellPresence(tripId, room)
    },

    leaveAll(socketId: string) {
      for (const [tripId, room] of rooms)
        if (room.guests.has(socketId)) this.leave(tripId, socketId)
    },

    edit(tripId: string, socketId: string, editing: string | null) {
      const room = rooms.get(tripId)
      const guest = room?.guests.get(socketId)
      if (!room || !guest || guest.editing === editing) return
      guest.editing = editing
      tellPresence(tripId, room)
    },

    /** Something changed in a trip. One room's changes are always told one batch at a time. */
    notify(tripId: string) {
      const room = rooms.get(tripId)
      if (!room) return
      room.work = room.work
        .then(() => tell(tripId, room))
        .catch((error) => console.error('Could not tell a change', error))
    },

    /** After a gap in listening, every open trip may have changed. */
    notifyAll() {
      for (const tripId of rooms.keys()) this.notify(tripId)
    },
  }
}

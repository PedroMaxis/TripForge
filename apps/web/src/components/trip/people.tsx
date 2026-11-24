import type { TripMember } from '@tripforge/core'

/** Everyone on the trip. With `online`, those who are not here right now fade. */
export function People({ members, online }: { members: TripMember[]; online?: Set<string> }) {
  return (
    <span className="flex shrink-0 gap-1">
      {members.map((m) => {
        const here = !online || online.has(m.userId)
        return (
          <span
            key={m.userId}
            title={m.name}
            data-online={online ? here : undefined}
            className={`grid size-8 place-items-center rounded-full text-sm font-medium ${
              here ? 'bg-soft text-ink' : 'bg-mist text-muted'
            }`}
          >
            <span aria-hidden="true">{m.name.trim().slice(0, 1).toUpperCase()}</span>
            <span className="sr-only">{m.name}</span>
          </span>
        )
      })}
    </span>
  )
}

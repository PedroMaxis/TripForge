import type { TripMember } from '@tripforge/core'

export function People({ members }: { members: TripMember[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {members.map((m) => (
        <span
          key={m.userId}
          title={m.name}
          className="grid size-8 place-items-center rounded-full bg-soft text-sm font-medium text-ink"
        >
          <span aria-hidden="true">{m.name.trim().slice(0, 1).toUpperCase()}</span>
          <span className="sr-only">{m.name}</span>
        </span>
      ))}
    </span>
  )
}

import type { TripSummary } from '@tripforge/core'

/** A trip's cover: the real contour lines of its destination. */
export function Cover({
  trip,
  className,
  children,
}: {
  trip: TripSummary
  className: string
  children: React.ReactNode
}) {
  return (
    <div className={`relative overflow-hidden bg-mist transition-colors ${className}`}>
      {trip.destinationLat !== null && (
        <img
          data-testid="cover"
          // The destination in the address keeps an old drawing from outliving a change.
          src={`/api/trips/${trip.id}/relief?at=${trip.destinationLat},${trip.destinationLng}`}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <div className="relative flex flex-1 flex-col justify-between">{children}</div>
    </div>
  )
}

import { Link } from '@/i18n/navigation'

/** An anvil with a map-pin hole: the trip is forged here. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/trips" aria-label="TripForge" className="flex min-h-11 items-center gap-2">
      <svg
        viewBox="-1 -1 36 28"
        width="34"
        height="26"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-accent"
      >
        <path
          fillRule="evenodd"
          d="M0 4H9V2H34V8C28 8 24 11 23 15L27 20V26H8V20L12 15C11 11 6 10 0 4ZM17.5 8.2a3.3 3.3 0 1 0 .01 0Z"
        />
      </svg>
      <span className={`font-display text-xl ${compact ? 'max-sm:hidden' : ''}`}>TripForge</span>
    </Link>
  )
}

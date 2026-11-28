'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, usePathname } from '@/i18n/navigation'

const icons = {
  plan: 'M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11',
  money: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  lists: 'M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name]} />
    </svg>
  )
}

const tab =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs text-ink-2 hover:bg-mist aria-[current]:bg-soft aria-[current]:text-ink md:min-h-11 md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-base'
const entry = 'block rounded-xl px-4 py-3 hover:bg-mist'

/**
 * Where to go inside a trip. On a phone it sits at the bottom, under the thumb;
 * on a wide screen it is a row of buttons.
 */
export function TripNav({
  tripId,
  group,
  canEdit,
  className = '',
}: {
  tripId: string
  group: boolean
  canEdit: boolean
  className?: string
}) {
  const t = useTranslations('TripNav')
  const path = usePathname()
  const page = `/trips/${tripId}`
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const link = (href: string, name: Exclude<keyof typeof icons, 'more'>) => (
    <Link href={href} aria-current={path === href ? 'page' : undefined} className={tab}>
      <Icon name={name} />
      {t(name)}
    </Link>
  )

  return (
    <nav
      aria-label={t('label')}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:z-auto md:border-0 md:bg-transparent md:p-0 ${className}`}
    >
      <div className="mx-auto flex max-w-lg gap-1 md:max-w-none">
        {link(page, 'plan')}
        {group && link(`${page}/money`, 'money')}
        {group && link(`${page}/lists`, 'lists')}
        {link(`${page}/people`, 'people')}
        <div ref={box} className="relative flex flex-1 md:flex-none">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
            className={`${tab} w-full ${open ? 'bg-soft text-ink' : ''}`}
          >
            <Icon name="more" />
            {t('more')}
          </button>
          <div
            id={menuId}
            hidden={!open}
            className="absolute right-0 bottom-full z-50 mb-2 w-60 rounded-2xl border border-line bg-paper p-2 shadow-[0_6px_24px_oklch(29%_0.045_158/.14)] md:top-full md:bottom-auto md:mt-2 md:mb-0"
          >
            {canEdit && (
              <Link href={`${page}/settings`} className={entry}>
                {t('settings')}
              </Link>
            )}
            <Link href={`${page}/history`} className={entry}>
              {t('history')}
            </Link>
            <Link href={`${page}/duplicate`} className={entry}>
              {t('duplicate')}
            </Link>
            <Link href={`${page}/print`} prefetch={false} className={entry}>
              {t('print')}
            </Link>
            {/* A file, not a page: the router must leave it alone. */}
            <a href={`/api/trips/${tripId}/calendar`} className={entry}>
              {t('calendar')}
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}

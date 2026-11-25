import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

const look = 'inline-block py-2 text-sm text-accent underline underline-offset-4'

/** What else can be done with a trip. */
export function TripLinks({
  page,
  source,
  member,
}: {
  page: string
  source: string
  member: boolean
}) {
  const t = useTranslations('Trip')
  return (
    <p className="flex flex-wrap gap-x-6 px-4 pt-6">
      {/* A file, not a page: the router must leave it alone. */}
      <a href={`${source}/calendar`} className={look}>
        {t('calendar')}
      </a>
      <Link href={`${page}/print`} prefetch={false} className={look}>
        {t('print')}
      </Link>
      {member && (
        <>
          <Link href={`${page}/duplicate`} className={look}>
            {t('duplicate')}
          </Link>
          <Link href={`${page}/history`} className={look}>
            {t('history')}
          </Link>
        </>
      )}
    </p>
  )
}

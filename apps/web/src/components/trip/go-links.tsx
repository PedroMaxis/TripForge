import { useTranslations } from 'next-intl'

/** The way there in the maps app of whoever is going. */
export function GoLinks({ item }: { item: { lat: number | null; lng: number | null } }) {
  const t = useTranslations('Trip')
  if (item.lat === null || item.lng === null) return null
  const point = `${item.lat},${item.lng}`
  const links = [
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${point}`],
    ['Waze', `https://www.waze.com/ul?ll=${point}&navigate=yes`],
  ] as const
  return (
    <span className="flex flex-wrap gap-2">
      {links.map(([app, href]) => (
        <a key={app} href={href} target="_blank" rel="noreferrer" className="btn">
          {t('goWith', { app })}
        </a>
      ))}
    </span>
  )
}
